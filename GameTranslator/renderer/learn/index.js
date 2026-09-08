// GameTranslator — Learn window (M4): Vocab / Review / History tabs wired to the real vocab store
// via learnApi (separate preload from the pill's `api`). Render logic here is DOM-only glue; the
// actual data-shape/SRS/TTS math is reused from shared/{vocab-model,srs,tts}.js so it can never
// drift from the pill's copy.
const { getWord, getMeaning, getReading, wordKey, getSeen, getGradSeen, setGradSeen,
  contextLine } = window.GTVocab;
const { schedule, isDue, srsDue } = window.GTSrs;
const { speakText } = window.GTTts;

// ---------- tabs ----------
const tabs = document.querySelectorAll('.tab');
const panels = {
  today: document.getElementById('panel-today'),
  words: document.getElementById('panel-words'),
  review: document.getElementById('panel-review'),
  calendar: document.getElementById('panel-calendar'),
  insights: document.getElementById('panel-insights'),
  guide: document.getElementById('panel-guide'),
  plan: document.getElementById('panel-plan'),
  settings: document.getElementById('panel-settings'),
};
const pageTitleEl = document.getElementById('pageTitle');
// Rail collapse. Kept in localStorage rather than the settings file on purpose: it is a per-window
// view state, like a scroll position, not a preference the pill needs to know about.
const railToggle = document.getElementById('railToggle');
const setRail = (narrow) => {
  document.body.classList.toggle('rail-narrow', narrow);
  railToggle.setAttribute('aria-expanded', String(!narrow));
};
setRail(localStorage.getItem('gt.rail') === 'narrow');
// The transitions are armed a frame later, so restoring a collapsed rail is a starting position
// rather than a collapse that plays itself the moment the window opens.
// macOS draws its traffic lights INSIDE this window now (titleBarStyle: 'hiddenInset' — the stock
// light-grey title bar over a near-black page was the join nobody draws on purpose). Two things
// follow, and both are this class: the sidebar header has to start below the lights, and the strip
// they sit in has to be draggable, because a window with a hidden title bar cannot be moved unless
// the page says which part of it is the title bar.
if (window.learnApi.isMac) document.body.classList.add('is-mac');
requestAnimationFrame(() => document.body.classList.add('rail-anim'));
// Under 780px a media query collapses the rail whatever this button says, so pressing it changed
// nothing on screen while quietly rewriting the saved state — and the rail then stayed collapsed
// when the window was widened again, for no reason the reader could see. There is nothing to toggle
// at that width, so the button says so instead of pretending.
const railLock = window.matchMedia('(max-width: 780px)');
const applyRailLock = () => {
  const locked = railLock.matches;
  document.body.classList.toggle('rail-forced', locked);
  railToggle.disabled = locked;
  railToggle.title = window.i18n.t(locked ? 'tip.railLocked' : 'tip.rail');
};
railLock.addEventListener('change', applyRailLock);
railToggle.addEventListener('click', () => {
  if (railLock.matches) return;
  const narrow = !document.body.classList.contains('rail-narrow');
  setRail(narrow);
  localStorage.setItem('gt.rail', narrow ? 'narrow' : 'wide');
});
const setLangRO = document.getElementById('setLangRO');
const exportVocabBtn = document.getElementById('exportVocabBtn');
exportVocabBtn.addEventListener('click', async () => {
  exportVocabBtn.disabled = true;
  const r = await window.learnApi.exportVocab();
  exportVocabBtn.disabled = false;
  // The button says what happened, in place of a toast this window does not have. It goes back to
  // its own label after a beat so the page does not keep a stale result on screen.
  if (r && r.ok) exportVocabBtn.textContent = window.i18n.t('st.backupOk').replace('{n}', r.count);
  else if (r && r.reason === 'empty') exportVocabBtn.textContent = window.i18n.t('st.backupEmpty');
  else if (r && r.reason === 'canceled') return;
  else exportVocabBtn.textContent = window.i18n.t('st.backupFail');
  setTimeout(() => { exportVocabBtn.textContent = window.i18n.t('st.backupBtn'); }, 4000);
});
let currentTab = 'today';
// The title is the tab's own label, so it can never drift out of step with the rail — and it is
// translated for free, because applyI18n has already written that label. Pulled out of switchTab so
// a language change can ask for it again without pretending the tab changed.
function setPageTitle() {
  const btn = Array.from(tabs).find((b) => b.dataset.tab === currentTab);
  if (btn) pageTitleEl.textContent = btn.textContent.trim();
}
function switchTab(name) {
  if (!panels[name]) return;
  tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  currentTab = name;
  setPageTitle();
  Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== name; });
  if (name === 'today') renderToday();
  if (name === 'words') renderWords();
  if (name === 'review') renderReviewStart();
  if (name === 'calendar') renderCalendar();
  // Paint from what we hold so the tab is never blank for a round-trip, then correct it: words can
  // have been collected from the pill since this copy of stats was fetched.
  if (name === 'insights') {
    renderInsights();
    window.learnApi.statsGet().then((s) => { insStats = s || insStats; renderInsights(); });
  }
  if (name === 'plan') renderPlan();
  if (name === 'settings') renderSettings();
}

// ---------- Calendar: which days gave you new words ----------
// Insights answers "how much, in total". This answers "when", which is the question you ask when you
// are keeping a habit rather than admiring a total (jek, 2026-08-09). Every number here is counted
// from the ts each vocab entry already carries — no new store, no tally to drift out of step.
const calEls = {
  title: document.getElementById('calTitle'),
  dow: document.getElementById('calDow'),
  grid: document.getElementById('calGrid'),
  day: document.getElementById('calDay'),
  dayHead: document.getElementById('calDayHead'),
  dayList: document.getElementById('calDayList'),
  sum: document.getElementById('calSum'),
};
let calMonth = null;   // first ms of the month on screen; null = this month, resolved on first render
let calPicked = null;  // startOfDayMs of the day whose words are listed underneath

function calCountsFor(monthStart) {
  const counts = new Map();
  const next = new Date(monthStart); next.setMonth(next.getMonth() + 1);
  for (const v of savedVocab) {
    const ts = Number(v && v.ts);
    if (!ts || ts < monthStart || ts >= next.getTime()) continue;
    const d = startOfDayMs(ts);
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  return counts;
}

function renderCalendar() {
  if (!calEls.grid) return;
  if (calMonth == null) { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); calMonth = d.getTime(); }
  const first = new Date(calMonth);
  calEls.title.textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  // Weekday header, taken from the locale rather than hard-coded — the window already follows the
  // system locale for its dates, and a Monday-first list under Sunday-first cells is a silent lie.
  calEls.dow.textContent = '';
  const probe = new Date(2024, 0, 7); // a Sunday
  for (let i = 0; i < 7; i++) {
    const c = document.createElement('span');
    const d = new Date(probe); d.setDate(probe.getDate() + i);
    c.textContent = d.toLocaleDateString(undefined, { weekday: 'short' });
    calEls.dow.appendChild(c);
  }
  const counts = calCountsFor(calMonth);
  // What the month adds up to, said once at the top. The grid answers "which days"; nobody should
  // have to add up 31 squares to answer "how many".
  let monthWords = 0;
  for (const n of counts.values()) monthWords += n;
  if (calEls.sum) {
    // The month before, counted the same way — a total on its own says nothing about whether the
    // habit is growing. Deliberately re-counted from vocab ts rather than read from stats.months, so
    // this line can never disagree with the squares underneath it that it is a summary of.
    let prevWords = 0;
    const prev = new Date(first); prev.setMonth(prev.getMonth() - 1);
    for (const n of calCountsFor(prev.getTime()).values()) prevWords += n;
    // No comparison on a month with nothing in it (the delta would just restate the total), and none
    // when the month before was empty either — "+12 vs 0" is a fact about starting, not about pace.
    const delta = monthWords - prevWords;
    const cmp = monthWords && prevWords
      ? ` · ${delta >= 0 ? '+' : '−'}${Math.abs(delta)} ${window.i18n.t('cal.vsPrev')}`
      : '';
    calEls.sum.textContent = monthWords
      ? `${monthWords} ${window.i18n.t('cal.kept')} · ${counts.size} ${window.i18n.t('cal.days')}${cmp}`
      : window.i18n.t('cal.none');
  }
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const today = startOfDayMs(Date.now());
  calEls.grid.textContent = '';
  for (let i = 0; i < lead; i++) calEls.grid.appendChild(document.createElement('span'));
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(first.getFullYear(), first.getMonth(), day).getTime();
    const n = counts.get(cellDate) || 0;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell' + (n ? ' has' : '') + (cellDate === today ? ' today' : '')
      + (cellDate === calPicked ? ' picked' : '');
    cell.innerHTML = '<span class="cal-num">' + day + '</span>'
      + (n ? '<span class="cal-count">' + n + '</span>' : '');
    cell.title = n ? `${n} ${window.i18n.t('w.words')}` : '';
    // A day with nothing in it is not a thing to open — clicking it would answer with an empty box
    // and leave you wondering whether it failed.
    if (n) cell.addEventListener('click', () => { calPicked = cellDate; renderCalendar(); });
    calEls.grid.appendChild(cell);
  }
  renderCalendarDay();
}

function calShift(months) {
  const d = new Date(calMonth == null ? Date.now() : calMonth);
  d.setDate(1); d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + months);
  calMonth = d.getTime();
  calPicked = null; // the open day belonged to the month you just left
  renderCalendar();
}
document.getElementById('calPrev')?.addEventListener('click', () => calShift(-1));
document.getElementById('calNext')?.addEventListener('click', () => calShift(1));

function renderCalendarDay() {
  if (!calEls.day) return;
  if (calPicked == null) { calEls.day.hidden = true; return; }
  const next = calPicked + 86400000;
  const rows = savedVocab.filter((v) => Number(v && v.ts) >= calPicked && Number(v.ts) < next);
  if (!rows.length) { calEls.day.hidden = true; return; }
  calEls.day.hidden = false;
  calEls.dayHead.textContent = `${dayLabel(calPicked)} · ${rows.length} ${window.i18n.t('w.words')}`;
  calEls.dayList.textContent = '';
  // The same row the Words list draws, so a word looks like itself wherever you meet it.
  for (const v of rows) calEls.dayList.appendChild(makeVocabEntry(v));
}

// Every AI row in this window fails the same four ways, and each deserves a different sentence.
// 'aidown' is the one that used to be missing: a proxy we cannot reach was reported as "no internet",
// which sent a reader with perfectly good Wi-Fi to go and fix their router.
function aiErrKey(res, failedKey) {
  const code = res && res.error;
  if (code === 'nokey') return failedKey === 'wr.failed' ? 'wr.nokey' : 'lex.nokey';
  if (code === 'offline') return 'net.offline';
  if (code === 'aidown') return 'net.aidown';
  if (code === 'quota') return 'net.quota';
  return failedKey;
}

// ---------- time labels (History dividers, per-row clock) ----------
// A log is remembered by WHEN, not by what — so the All-translations list is broken up by day. Both
// helpers work off the `ts` every history row and vocab entry already carries.
const startOfDayMs = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayLabel(ts) {
  const today = startOfDayMs(Date.now());
  const day = startOfDayMs(ts);
  if (day === today) return window.i18n.t('w.today');
  if (day === today - 86400000) return window.i18n.t('w.yesterday');
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
const clockLabel = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// ---------- Words tab: one panel, two lists behind a segment switch ----------
const vocabCard = document.getElementById('vocabCard');
const historyCard = document.getElementById('historyCard');
let wordSeg = 'vocab';
function renderWords() {
  vocabCard.hidden = wordSeg !== 'vocab';
  historyCard.hidden = wordSeg !== 'history';
  if (wordSeg === 'vocab') renderVocab();
  else renderHistory();
}
document.querySelectorAll('.seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    wordSeg = btn.dataset.seg;
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b === btn));
    renderWords();
  });
});
// Reaching Review any other way than the Today card means a normal session: whatever that card asked
// for last time must not stick, or the tab would keep re-opening in Usage on today's words only.
function enterReviewFresh() {
  queueFilter = null;
  forcedMode = null;
  plan = [];
  planIdx = 0;
  if (reviewMode === 'usage') reviewMode = 'study';
}
tabs.forEach((btn) => btn.addEventListener('click', () => {
  if (btn.dataset.tab === 'review') enterReviewFresh();
  switchTab(btn.dataset.tab);
}));

// ---------- header stat (replaces the redundant "GameTranslator — Learn" title; OS title bar already has it) ----------
const hdrStat = document.getElementById('hdrStat');
function updateHdrStat() {
  const total = savedVocab.length;
  if (!total) { hdrStat.textContent = window.i18n.t('hdr.none'); return; }
  const known = savedVocab.filter((v) => getSeen(v) >= getGradSeen()).length;
  hdrStat.textContent = `${total} ${window.i18n.t(total === 1 ? 'hdr.word' : 'hdr.words')} · ${known} ${window.i18n.t('hdr.known')}`;
}

// ---------- vocab store (mirrors main's vocab.json — kept live via vocab:changed, shared with the pill) ----------
let savedVocab = [];
window.learnApi.vocabGet().then((v) => {
  savedVocab = Array.isArray(v) ? v : [];
  renderWords();
  updateHdrStat();
  // Today is the default tab and it painted before this resolved — with an empty list. Without this
  // the landing page reads "0 words collected today" on a day you collected plenty.
  if (!panels.today.hidden) renderToday();
});
window.learnApi.onVocabChanged((v) => {
  savedVocab = Array.isArray(v) ? v : [];
  if (!panels.words.hidden && wordSeg === 'vocab') renderVocab();
  if (!panels.review.hidden && !reviewEmpty.hidden) renderReviewStart(); // idle screen only
  updateHdrStat();
  // Re-pull stats, don't just repaint: the year card reads stats.months, which main just bumped for
  // this very word. Painting from the copy we already hold would leave the column one behind.
  if (!panels.insights.hidden) window.learnApi.statsGet().then((s) => { insStats = s || insStats; renderInsights(); });
  if (!panels.today.hidden) renderToday(); // ★ a word just landed — the count is the whole page
});

const isWordSaved = (w) => savedVocab.some((v) => wordKey(getWord(v)) === wordKey(w));
function removeVocabWord(word) {
  const key = wordKey(word);
  savedVocab = savedVocab.filter((v) => wordKey(getWord(v)) !== key);
  window.learnApi.vocabRemove(word);
}
function addVocabWord({ word, meaning, reading, src, pos, senses }) {
  const w = String(word || '').trim();
  if (!w || isWordSaved(w)) return false;
  const entry = { word: w, meaning: meaning || '', reading: reading || '', ts: Date.now(), src: src || '', seen: 1 };
  if (pos) entry.pos = pos;
  if (Array.isArray(senses) && senses.length > 1) entry.senses = senses;
  savedVocab = [entry, ...savedVocab];
  window.learnApi.vocabAdd(entry);
  return true;
}
function toggleVocabWord(word, meaning, reading, src) {
  if (isWordSaved(word)) removeVocabWord(word);
  else addVocabWord({ word, meaning, reading, src });
}

// ---------- Vocab tab ----------
const vocabList = document.getElementById('vocabList');
function makeVocabEntry(v) {
  const entry = document.createElement('div');
  entry.className = 'entry';
  const top = document.createElement('div');
  top.className = 'entry-top';
  const body = document.createElement('div');
  body.className = 'entry-body';
  const word = getWord(v);
  const meaning = getMeaning(v);
  const reading = getReading(v);
  const seen = getSeen(v);
  const thEl = document.createElement('div'); thEl.className = 'th'; thEl.textContent = word;
  const enEl = document.createElement('div'); enEl.className = 'en';
  enEl.textContent = reading ? `${meaning} · ${reading}` : meaning;
  // Same chip as the pill's: a counter that shows what it's counting toward, then the badge that
  // says what earned it — the rule is on screen instead of hidden in a tooltip.
  if (v.pos) {
    const pb = posBadgeEl(v.pos);
    if (pb) { enEl.appendChild(document.createTextNode(' ')); enEl.appendChild(pb); }
  }
  // The per-row known/seen chip is gone (jek, 2026-08-09). It rode on every single word — "✓ known ·
  // seen 7×" beside a two-word entry — so the list read as a progress report rather than as your
  // words. The COUNT still exists and is still shown where a count belongs: the header stat, the
  // Insights tab, and the review deck that uses it to decide what to ask you. Nothing is stopped
  // being tracked; it stopped being repeated on every line.
  body.appendChild(thEl); body.appendChild(enEl);
  const star = document.createElement('button');
  star.className = 'entry-star on';
  star.textContent = '★';
  star.title = window.i18n.t('w.remove');
  star.addEventListener('click', () => { removeVocabWord(word); renderVocab(); updateHdrStat(); });
  top.appendChild(body);
  top.appendChild(star);
  entry.appendChild(top);
  return entry;
}
const vocabNote = document.getElementById('vocabNote');
let vocabSort = 'new';
// Three orders over the same list. 'due' puts what the scheduler wants next at the top (never-reviewed
// entries have no srs, which srsDue reads as 0 = due now, so they lead); 'seen' is what the game keeps
// throwing at you; 'new' is the collection order, which is what it always was.
function sortedVocab() {
  const list = savedVocab.slice();
  if (vocabSort === 'seen') return list.sort((a, b) => getSeen(b) - getSeen(a));
  if (vocabSort === 'due') return list.sort((a, b) => srsDue(a) - srsDue(b));
  return list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
document.querySelectorAll('.sort-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    vocabSort = btn.dataset.sort;
    document.querySelectorAll('.sort-btn').forEach((b) => b.classList.toggle('on', b === btn));
    renderVocab();
  });
});

function renderVocab() {
  vocabList.innerHTML = '';
  const known = savedVocab.filter((v) => getSeen(v) >= getGradSeen()).length;
  vocabNote.textContent = savedVocab.length ? `${savedVocab.length} ${window.i18n.t('w.words')} · ${known} ${window.i18n.t('w.knownCount')}` : '';
  if (!savedVocab.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = window.i18n.t('w.emptyVocab');
    vocabList.appendChild(empty);
    return;
  }
  sortedVocab().forEach((v) => vocabList.appendChild(makeVocabEntry(v)));
}

// ---------- Review tab (SM-2 lite flashcards, ScoreUp-style) ----------
// Two modes over ONE queue and ONE scheduler: Study self-rates after a flip, Test asks the same words
// as multiple choice and grades them from the answer (right → good, wrong → again). Nothing about the
// SRS math changes between them — see shared/srs.js.
const reviewEmpty = document.getElementById('reviewEmpty');
const reviewWordsBtn = document.getElementById('reviewWordsBtn');
const reviewView = document.getElementById('reviewView');
const fcStats = document.getElementById('fcStats');
const fcBar = document.getElementById('fcBar');
const reviewCard = document.getElementById('reviewCard');
const reviewWord = document.getElementById('reviewWord');
const reviewSpeak = document.getElementById('reviewSpeak');
const fcBWord = document.getElementById('fcBWord');
const reviewMeaning = document.getElementById('reviewMeaning');
const reviewReading = document.getElementById('reviewReading');
const fcSenses = document.getElementById('fcSenses');
const fcDefs = document.getElementById('fcDefs');
const reviewSrc = document.getElementById('reviewSrc');
const reviewRate = document.getElementById('reviewRate');
const fcKeys = document.getElementById('fcKeys');
const fcShow = document.getElementById('fcShow');
const rateAgain = document.getElementById('rateAgain');
const rateHard = document.getElementById('rateHard');
const rateGood = document.getElementById('rateGood');
const rateEasy = document.getElementById('rateEasy');
const reviewDone = document.getElementById('reviewDone');
const reviewBackBtn = document.getElementById('reviewBackBtn');
const doneStats = document.getElementById('doneStats');
const doneAgain = document.getElementById('doneAgain');
const fcMode = document.getElementById('fcMode');
const fcReverse = document.getElementById('fcReverse');
const fcShuffle = document.getElementById('fcShuffle');
const fcPrev = document.getElementById('fcPrev');
const fcNext = document.getElementById('fcNext');
const fcQuiz = document.getElementById('fcQuiz');
const qWord = document.getElementById('qWord');
const qSub = document.getElementById('qSub');
const qOpts = document.getElementById('qOpts');
const qNext = document.getElementById('qNext');
const qNote = document.getElementById('qNote');
const qMean = document.getElementById('qMean');

const QUIZ_MIN = 4; // one right answer + three distractors; fewer words than this and Test can't run

// ---- Usage mode: the word back in the sentence it came from ----
// Knowing what a word means is not knowing how to use it. Every entry already carries `src` — the
// real line the pill OCR'd when you starred the word — so the exercise is that sentence with the
// word cut out. Nothing is generated: a made-up example sentence would throw away the one thing
// this app has that a vocab app doesn't, which is the scene you were actually looking at.
// A word only qualifies when its own spelling still appears in that line: OCR keeps the inflected
// form ("running" in the sentence, "run" on the card), and blanking something that isn't there
// would print a sentence with no gap. Those entries are filtered out of the queue instead.
// A word written in a script that spaces its words must match at a word boundary. Without that check
// "run" matched inside "running" and the prompt came out as "He is ___ning toward the gate" — the gap
// in the wrong place, and an answer that reads as a typo (measured, 2026-08-02). CJK and Hangul have
// no boundaries to find, so there the plain search is the right one.
const SPACED_SCRIPT = /^[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;
// \p{M} counts as part of a word: a Thai vowel or tone mark is a mark, not a letter, and leaving it
// out cuts words one character short of themselves. Every strip in this app keeps the same three.
const isWordChar = (ch) => !!ch && /[\p{L}\p{N}\p{M}]/u.test(ch);
function clozeParts(v) {
  return cutWordOut(getWord(v), v.src);
}
// The same cut, against ANY sentence rather than only the entry's own `src`. Recall needs it for the
// fresh sentence it was given (cached or AI-written), and the matching rules — word boundaries for
// spaced scripts, none for CJK — must be identical or the two modes would disagree about where a
// word ends.
function cutWordOut(word, sentence) {
  const src = String(sentence || '');
  if (!word || !src || wordKey(src) === wordKey(word)) return null;
  if (src.trim().length <= word.trim().length + 2) return null; // "the sentence" IS the word — no context to test
  // Lowercasing can change a string's length in a few locales; when it does, fall back to an exact
  // search rather than slicing `src` at an index that belongs to a different string.
  const lo = src.toLowerCase();
  const wlo = word.toLowerCase();
  const caseless = lo.length === src.length && wlo.length === word.length;
  const hay = caseless ? lo : src;
  const needle = caseless ? wlo : word;
  const boundary = SPACED_SCRIPT.test(word);
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    if (boundary && (isWordChar(src[i - 1]) || isWordChar(src[i + word.length]))) continue;
    return { before: src.slice(0, i), hit: src.slice(i, i + word.length), after: src.slice(i + word.length) };
  }
  return null;
}
const isClozeable = (v) => clozeParts(v) !== null;
const isToday = (v) => !!v.ts && startOfDayMs(v.ts) === startOfDayMs(Date.now());

// Which of the three layouts the card area is showing. Study is the flip card; Test and Usage are
// both the quiz block, so they share its markup and differ only in what fills it.
function setModeClass() {
  reviewView.classList.toggle('testmode', reviewMode === 'test');
  // Recall reuses the quiz block exactly as Usage does, so it carries the same layout class and adds
  // its own only for the bits that differ (the hint row, the taller option column).
  reviewView.classList.toggle('usagemode', reviewMode === 'usage' || reviewMode === 'recall');
  reviewView.classList.toggle('recallmode', reviewMode === 'recall');
  reviewView.classList.toggle('cardmode', reviewMode === 'card');
  reviewView.classList.toggle('writemode', reviewMode === 'write');
}

let reviewQueue = [];
let reviewIdx = 0;
let flipped = false;
let reviewMode = 'study';
// A mode named by the launcher sheet, consumed once by startReview. Not just reviewMode, because
// startReview overwrites that from the settings on every entry (see the note there).
let forcedMode = null;
// The stages the launcher built, in order, and which one is running. Empty = no plan, and every
// screen that reads it falls back to the single-review behaviour the tab has always had.
let plan = [];
let planIdx = 0;
// Fixed order, because it is a teaching order and not a menu: meet the word, recognise it, place it
// in the sentence you met it in, then produce it from a gap with nine of its neighbours competing.
const STAGE_ORDER = ['study', 'test', 'usage', 'recall'];
const STAGE_KEY = { study: 'rv.study', test: 'rv.test', usage: 'rv.usage', recall: 'rv.recall' };
// Set by the Today card before it hands over to Review, so "practise today's words" means exactly
// those words — not whatever the scheduler happens to think is due. Cleared by every other route in.
// 'today' is the day-scoped shortcut; a Set of word keys is an explicit hand-picked list (the
// session picker). Both must be cleared the same way — a selection left behind here would silently
// shrink the next ordinary review to the words someone ticked last night.
let queueFilter = null;
let reverse = false;      // ask meaning → word instead of word → meaning
let answered = false;     // test mode: this question has been answered, waiting for Next
// Hard belongs in here even though only Study has a Hard button: gradeCurrent does `session[rating]
// += 1`, so a rating with no slot came out NaN and the recap silently lost the card. Recall grades
// Hard on every hinted answer, which is what finally made it show.
let session = null;       // { again, hard, good, easy, againWords: [] }

// One source of truth for what a session contains. Study and Test take everything due; Usage can
// only take the entries whose sentence still contains the word (see clozeParts), so switching modes
// re-asks this instead of carrying an index into a list that no longer matches.
function queueFor(mode) {
  const picked = queueFilter instanceof Set;
  let q = picked
    ? savedVocab.filter((v) => queueFilter.has(wordKey(getWord(v))))
    : (queueFilter === 'today' ? savedVocab.filter(isToday) : savedVocab.filter(isDue));
  if (mode === 'usage') q = q.filter(isClozeable);
  if (mode === 'recall') q = q.filter(isRecallable);
  // reviewCap exists to keep a scheduler-dealt pile finishable. A hand-picked list is already the
  // answer to "how much do you want to do" — silently dropping the words past the cap would throw
  // away the one thing the picker was for, and the count on the button that opened it would be a lie.
  if (study.reviewCap > 0 && !picked) q = q.slice(0, study.reviewCap);
  return q;
}
// Entering the tab deals the first card. The only screen that can replace it is "nothing due".
function renderReviewStart() {
  if (!queueFor('study').length) {
    reviewView.hidden = true;
    reviewEmpty.hidden = false;
    return;
  }
  reviewEmpty.hidden = true;
  startReview();
}
function startReview() {
  reviewIdx = 0;
  // Start in whatever the settings say, without touching a session already running. The Today card
  // is the exception — it asks for Usage by name, so it sets reviewMode before switching tab.
  reverse = study.reverseDefault;
  fcReverse.checked = reverse;
  // The launcher sheet asked for a mode explicitly, so the settings default must not overrule it —
  // picking Test in a dialog and landing in Study would make the dialog look broken. Only Usage used
  // to survive this line, because it was the only mode anything asked for by name.
  if (forcedMode) { reviewMode = forcedMode; forcedMode = null; }
  else if (reviewMode !== 'usage') reviewMode = study.testDefault ? 'test' : 'study';
  reviewQueue = queueFor(reviewMode);
  // Usage and Recall own their own empty states — "nothing due" would be the wrong sentence for a
  // mode that is empty because no word carries a sentence, not because nothing is scheduled.
  if (!reviewQueue.length && reviewMode !== 'usage' && reviewMode !== 'recall') return;
  [...fcMode.children].forEach((b) => b.classList.toggle('on', b.dataset.mode === reviewMode));
  setModeClass();
  session = { again: 0, hard: 0, good: 0, easy: 0, againWords: [] };
  // Fire and forget: the stage opens immediately on the sentences it already has, and swaps in the
  // fresh ones when they land. Waiting for the network before showing the first card would make the
  // best case (everything already cached) pay for the worst.
  if (reviewMode === 'recall') recallPrepare(reviewQueue);
  renderPlanRail();
  reviewEmpty.hidden = true;
  reviewView.hidden = false;
  reviewDone.hidden = true;
  renderCurrent();
}

// What each grade would actually do to this card — run the real scheduler and show the gap, so the
// buttons aren't three unlabelled guesses (ScoreUp shows the same thing under its grade row).
function intervalLabel(v, rating) {
  const next = schedule(v.srs, rating);
  const days = Math.max(0, Math.round((next.due - Date.now()) / 86400000));
  if (days < 1) return '<1d';
  if (days < 30) return days + 'd';
  return Math.round(days / 30) + 'mo';
}

function setFlipped(on) {
  flipped = on;
  // "Say the word when a card flips" — on the answer side, so hearing it lines up with reading it.
  if (on && study.speakOnFlip) {
    const v = reviewQueue[reviewIdx];
    if (v) speakText(getWord(v), getReading(v));
  }
  reviewCard.classList.toggle('flipped', on);
  // Before the flip there is nothing to grade, so the grades are not shown at all — one button that
  // does the only available thing takes their place. They used to sit there greyed out and swallow
  // the click: visible, aimed at, and silently inert, which reads as "broken" rather than "not yet".
  // (jek: why do I still have to flip first — the honest answer is that a grade given before the
  // answer is a grade on your guess, not your recall. So say that with the layout instead of a
  // disabled row.)
  reviewRate.hidden = !on || reviewMode === 'card';
  fcShow.hidden = on || reviewMode !== 'study';
  fcKeys.classList.toggle('show', on); // visibility only — hiding it would re-centre the block mid-flip
}

function renderStats() {
  const total = reviewQueue.length;
  fcStats.innerHTML = '';
  [[window.i18n.t('rv.card'), `${Math.min(reviewIdx + 1, total)} / ${total}`], [window.i18n.t('rv.left'), String(total - reviewIdx)], [window.i18n.t('rv.collected'), String(savedVocab.length)]]
    .forEach(([cap, val]) => {
      const sp = document.createElement('span');
      sp.textContent = cap + ' ';
      const b = document.createElement('b');
      b.textContent = val;
      sp.appendChild(b);
      fcStats.appendChild(sp);
    });
  fcBar.style.width = `${Math.round((reviewIdx / total) * 100)}%`;
  fcPrev.disabled = reviewIdx === 0;
  fcNext.disabled = reviewIdx >= total - 1;
}

// Session over: say how it went instead of just "caught up". The Again list is the take-away — those
// are the words to look at before the next session.
function renderDone() {
  document.querySelector('.fc-scene').hidden = true;
  reviewRate.hidden = true;
  fcKeys.classList.remove('show');
  document.getElementById('fcNav').hidden = true;
  fcQuiz.style.display = 'none';
  fcStats.textContent = '';
  fcBar.style.width = '100%';
  reviewDone.hidden = false;

  // Mid-plan this is not the end of anything — it is the gap between two stages, and it has to hand
  // over rather than congratulate. "All caught up" here would read as "you're finished" to someone
  // who is two thirds of the way through a sitting they built themselves.
  const nextMode = plan[planIdx + 1];
  const planNext = document.getElementById('planNext');
  planNext.hidden = !nextMode;
  document.getElementById('reviewBackBtn').hidden = !!nextMode;
  document.getElementById('doneMsg').textContent = nextMode
    ? window.i18n.t('rv.stageDone').replace('{n}', String(planIdx + 1)).replace('{of}', String(plan.length))
    : window.i18n.t('rv.done');
  if (nextMode) planNext.textContent = `▶ ${window.i18n.t('rv.nextStage')} ${window.i18n.t(STAGE_KEY[nextMode] || nextMode)}`;
  renderPlanRail(true);

  const s = session || { again: 0, hard: 0, good: 0, easy: 0, againWords: [] };
  doneStats.innerHTML = '';
  // Hard is only listed when it happened. Study's Hard button is rarely pressed, and a permanent
  // "0 Hard" would add a column to every recap to report nothing.
  [
    ['s-again', window.i18n.t('rv.again').replace(/^\W+\s*/, ''), s.again],
    ['s-hard', window.i18n.t('rv.hard').replace(/^\W+\s*/, ''), s.hard || 0],
    ['s-good', window.i18n.t('rv.good').replace(/^\W+\s*/, ''), s.good],
    ['s-easy', window.i18n.t('rv.easy').replace(/^\W+\s*/, ''), s.easy],
  ].filter(([cls, , n]) => cls !== 's-hard' || n > 0).forEach(([cls, cap, n]) => {
    const sp = document.createElement('span');
    sp.className = cls;
    const b = document.createElement('b');
    b.textContent = String(n);
    sp.appendChild(b);
    sp.appendChild(document.createTextNode(' ' + cap));
    doneStats.appendChild(sp);
  });
  const list = [...new Set(s.againWords)].slice(0, 6);
  doneAgain.hidden = list.length === 0;
  if (list.length) doneAgain.innerHTML = window.i18n.t('rv.lookAgain') + ' <b>' + list.map((w) => w.replace(/[<>&]/g, '')).join('</b> · <b>') + '</b>';
}

// ---- The plan rail ----
// Numbered, because "stage 2 of 3" is the thing that makes a sitting feel finishable. Done stages
// stay visible rather than falling off — the row is a record of what you have already got through.
// `finished` is the hand-over screen: the stage the rail calls current has just ended, and leaving it
// lit next to the words "Stage 1 of 2 done" would have the rail and the heading disagree.
function renderPlanRail(finished) {
  const el = document.getElementById('fcPlan');
  if (!el) return;
  el.hidden = plan.length < 2; // a one-stage plan is just a review; a rail over it would be noise
  if (el.hidden) return;
  const at = finished ? planIdx + 1 : planIdx;
  el.textContent = '';
  plan.forEach((mode, i) => {
    if (i) {
      const sep = document.createElement('span');
      sep.className = 'fc-plan-sep';
      sep.textContent = '→';
      el.appendChild(sep);
    }
    const s = document.createElement('span');
    s.className = 'fc-plan-step' + (i < at ? ' done' : i === at ? ' now' : '');
    const n = document.createElement('b');
    n.textContent = i < at ? '✓' : String(i + 1);
    s.appendChild(n);
    s.appendChild(document.createTextNode(window.i18n.t(STAGE_KEY[mode] || mode)));
    el.appendChild(s);
  });
}

// Stepping off the rail by hand ends the plan. Half a plan with a mode the user chose themselves is
// not a stage anyone can be "on", and a rail that kept counting would be lying about where they are.
function abandonPlan() {
  if (!plan.length) return;
  plan = [];
  planIdx = 0;
  renderPlanRail();
}

// Run the next stage over the same words. reviewIdx and the tally restart — each stage is its own
// pass, and carrying the previous stage's count into it would double-report the same cards.
function advancePlan() {
  planIdx += 1;
  const mode = plan[planIdx];
  if (!mode) return;
  forcedMode = mode;
  reviewMode = mode;
  reviewDone.hidden = true;
  startReview();
  renderPlanRail();
}

function renderCurrent() {
  // Usage with an empty queue is not "all caught up" — it means no collected word carries a sentence
  // it can still be cut out of. Saying so beats a false congratulation (and beats hiding the mode).
  if (reviewMode === 'usage' && !reviewQueue.length) { renderUsageEmpty(); return; }
  if (reviewMode === 'recall' && !reviewQueue.length) { renderRecallEmpty(); return; }
  if (reviewIdx >= reviewQueue.length) { renderDone(); return; }
  qHint.hidden = reviewMode !== 'recall'; // every other mode leaves the row it does not use behind
  reviewDone.hidden = true;
  // Card mode reads, it does not test — so no grade row, and the arrows work here too (they are the
  // only way through a mode with nothing to answer).
  const reading = reviewMode === 'card' || reviewMode === 'write';
  document.getElementById('fcNav').hidden = !(reviewMode === 'study' || reading);
  // The arrows keep working, but "tap the card to flip" is a lie in a mode with nothing to flip.
  fcNavHint.textContent = window.i18n.t(reviewMode === 'card' ? 'rv.navCard' : 'rv.navHint');
  document.querySelector('.fc-scene').hidden = reading;
  lexCard.hidden = reviewMode !== 'card';
  writeCard.hidden = reviewMode !== 'write';
  reviewRate.hidden = reading || (reviewMode === 'study' && !flipped);
  fcShow.hidden = reviewMode !== 'study' || flipped;
  fcQuiz.style.display = '';
  renderStats();
  if (reviewMode === 'test') renderQuiz();
  else if (reviewMode === 'usage') renderUsage();
  else if (reviewMode === 'recall') renderRecall();
  else if (reviewMode === 'card') renderWordCard();
  else if (reviewMode === 'write') renderWrite();
  else renderReviewCard();
}

// ---- Write mode --------------------------------------------------------------------------------
// The situation comes from the word's cached lexicon entry, so this mode costs nothing extra to set
// up — only the marking is a call, and only when the learner actually asks for one.
const writeCard = document.getElementById('writeCard');
const wrInput = document.getElementById('wrInput');
const wrOut = document.getElementById('wrOut');
const wrGo = document.getElementById('wrGo');
let wrSeq = 0;
let wrLast = { text: '', word: '' };  // the sentence already paid for — see checkWrite()

async function renderWrite() {
  const v = reviewQueue[reviewIdx];
  if (!v) return;
  document.getElementById('wrWord').textContent = getWord(v);
  document.getElementById('wrMean').textContent = getMeaning(v) || '';
  wrInput.value = '';
  wrOut.hidden = true;
  wrGo.disabled = false;
  wrGo.textContent = window.i18n.t('wr.check');
  const sit = document.getElementById('wrSituation');
  // Entries collected before Write existed have a lexicon with no situation in it. Rather than spend
  // a call regenerating one, fall back to the sentence they met the word in — which is a situation.
  sit.textContent = (v.lex && v.lex.prompt) || v.src || '';
  sit.hidden = !sit.textContent;
}

async function checkWrite() {
  const v = reviewQueue[reviewIdx];
  const text = wrInput.value.trim();
  if (!v || !text) return;
  // Pressing Check on a sentence that has not changed asks Claude the same question twice and pays
  // twice for the same answer. The button re-enables after each check, so this is one impatient click.
  if (wrLast.text === text && wrLast.word === getWord(v)) return;
  wrLast = { text, word: getWord(v) };
  const seq = ++wrSeq;
  wrGo.disabled = true;
  wrGo.textContent = window.i18n.t('wr.checking');
  const r = await window.learnApi.checkSentence({
    word: getWord(v), sentence: text,
    situation: (v.lex && v.lex.prompt) || v.src || '',
  });
  if (seq !== wrSeq) return;  // moved on; this answer belongs to a card that is gone
  wrGo.disabled = false;
  wrGo.textContent = window.i18n.t('wr.check');
  wrOut.hidden = false;
  const verdict = document.getElementById('wrVerdict');
  if (!r || r.error) {
    wrLast = { text: '', word: '' };  // nothing was bought — let them press Check again on the same words
    verdict.className = 'wr-verdict wrong';
    verdict.textContent = window.i18n.t(
      aiErrKey(r, 'wr.failed'));
    document.getElementById('wrNotes').innerHTML = '';
    document.getElementById('wrBetter').textContent = '';
    return;
  }
  verdict.className = 'wr-verdict ' + r.verdict;
  verdict.textContent = window.i18n.t('wr.' + r.verdict);
  const notes = document.getElementById('wrNotes');
  notes.innerHTML = '';
  (r.notes || []).forEach((n) => { const li = document.createElement('li'); li.textContent = n; notes.appendChild(li); });
  const better = document.getElementById('wrBetter');
  // Hide the rewrite when it is the learner's own sentence back — showing it would imply a correction
  // that isn't there.
  const same = r.better && r.better.trim().toLowerCase() === text.toLowerCase();
  better.textContent = (!r.better || same) ? '' : window.i18n.t('wr.better') + ' ' + r.better;
}
wrGo.addEventListener('click', checkWrite);
wrInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); checkWrite(); }
});

// ---- Card mode ---------------------------------------------------------------------------------
const fcNavHint = document.getElementById('fcNavHint');
const lexCard = document.getElementById('lexCard');
const lexState = document.getElementById('lexState');
const lexRows = document.getElementById('lexRows');
const lexSeq = { n: 0 };   // guards against a slow answer landing on a card you already moved past
const LEX_HOLD_MS = 400;   // land on a card this long before it is worth a paid lookup
let lexHold = null;

function lexRow(label, value) {
  if (!value) return null;
  const r = document.createElement('div');
  r.className = 'lex-row';
  const k = document.createElement('span'); k.className = 'lex-k'; k.textContent = label;
  const v = document.createElement('span'); v.className = 'lex-v'; v.textContent = value;
  r.append(k, v);
  return r;
}

function paintLex(lex) {
  lexRows.innerHTML = '';
  const rows = [
    lexRow(window.i18n.t('lex.with'), (lex.collocations || []).join(' · ')),
    lexRow(window.i18n.t('lex.family'), (lex.family || []).join(' · ')),
    // Synonyms come back as "word — how it differs", one per line, because the difference is the
    // whole point: a bare list of near-synonyms teaches you to swap words that are not swappable.
    lexRow(window.i18n.t('lex.near'), (lex.synonyms || []).join('\n')),
    lexRow(window.i18n.t('lex.opposite'), (lex.opposites || []).join(' · ')),
    lexRow(window.i18n.t('lex.register'), lex.register),
    lexRow(window.i18n.t('lex.mistake'), lex.mistake),
    lexRow(window.i18n.t('lex.example'), lex.example),
  ].filter(Boolean);
  rows.forEach((r) => lexRows.appendChild(r));
  lexState.hidden = rows.length > 0;
  if (!rows.length) lexState.textContent = window.i18n.t('lex.empty');
}

async function renderWordCard() {
  const v = reviewQueue[reviewIdx];
  if (!v) return;
  const word = getWord(v);
  document.getElementById('lexWord').textContent = word;
  document.getElementById('lexMean').textContent = getMeaning(v) || '';
  const srcEl = document.getElementById('lexSrc');
  const lexSrcText = contextLine(v); // same gate as the flashcard — one unreadable line, one decision
  srcEl.textContent = lexSrcText ? '\u201C' + lexSrcText + '\u201D' : '';
  srcEl.hidden = !lexSrcText;
  lexRows.innerHTML = '';

  if (v.lex) { paintLex(v.lex); return; }   // already paid for, once, at some point in the past

  const seq = ++lexSeq.n;
  lexState.hidden = false;
  lexState.textContent = window.i18n.t('lex.loading');
  // Arrowing past a card must not buy a card. Every entry costs a real Claude call, and the old code
  // fired the moment the card touched the screen: twelve taps of → measured eleven calls, ten of them
  // for words the reader never looked at. The wait is short enough to feel like loading when you stop.
  clearTimeout(lexHold);
  lexHold = setTimeout(async () => {
    if (seq !== lexSeq.n) return;
    const res = await window.learnApi.lexicon({ word, src: v.src || '' });
    // Save BEFORE the staleness check — the money is spent either way, so keep what it bought. The
    // old order dropped the answer whenever you moved on mid-flight and charged again on the way back.
    if (res && !res.error) {
      // savedVocab is patched in place too — vocab:changed will bring the canonical copy back, but
      // the card should not wait for the round trip.
      v.lex = res;
      window.learnApi.vocabUpdate({ word, patch: { lex: res } });
    }
    if (seq !== lexSeq.n) return;           // you moved on; this answer is for a card that is gone
    if (!res || res.error) {
      lexState.textContent = window.i18n.t(
        aiErrKey(res, 'lex.failed'));
      return;
    }
    paintLex(res);
  }, LEX_HOLD_MS);
}

function renderReviewCard() {
  const v = reviewQueue[reviewIdx];
  const total = reviewQueue.length;
  const seen = getSeen(v);
  const idx = `${reviewIdx + 1} / ${total}`;
  const seenTag = seen > 1 ? `${window.i18n.t('rv.met')} ×${seen}` : window.i18n.t('rv.new');
  document.getElementById('fcSeenF').textContent = seenTag;
  document.getElementById('fcSeenB').textContent = seenTag;
  document.getElementById('fcIdxF').textContent = idx;
  document.getElementById('fcIdxB').textContent = idx;

  // reverse = meaning on the front, word on the back. Same card, harder recall direction.
  const word = getWord(v);
  const meaning = getMeaning(v);
  reviewWord.textContent = reverse ? meaning : word;
  fcBWord.textContent = reverse ? meaning : word;
  reviewMeaning.textContent = reverse ? word : meaning;
  // Step the answer's type size down rather than let a long gloss fill the card and scroll. Measured
  // in characters, not pixels, because the face is laid out after this runs.
  const answerLen = (reverse ? word : meaning || '').length;
  const backFace = reviewMeaning.closest('.fc-face');
  if (backFace) {
    backFace.classList.toggle('long', answerLen > 28 && answerLen <= 70);
    backFace.classList.toggle('longer', answerLen > 70);
  }
  // A word that is both a noun and a verb should say so on the answer side, not silently show one.
  // Each type is the shared chip (shared/pos-badge.js) — the same mark the word wears in the list
  // behind this card and in the bubble over the game, instead of the raw "v." this line used to print.
  //
  // An 'en' sense is a stand-in for a translation the dictionary did NOT have (see posBadgeEl), so on
  // a card whose whole job is recalling the Thai it is a second language to parse mid-test. Dropped
  // whenever a real translation exists; kept when they are all this word has, since the alternative
  // there is a blank answer side.
  const allSenses = Array.isArray(v.senses) ? v.senses : [];
  const isEnSense = (sn) => String((sn && sn.pos) || '').split(',').some((t) => t.trim().toLowerCase() === 'en');
  const translated = allSenses.filter((sn) => !isEnSense(sn));
  const senses = translated.length ? translated : allSenses;
  // Built here rather than through fillSenseChips, and the reason is the difference between "the
  // first sense" and "the sense that repeats the answer". This card printed "กลับมา; กลับ" in 28px
  // and then "V. กลับมา, กลับ" 30px under it — the same answer twice, which is what made it read as a
  // wall (jek, 2026-08-28). The shared helper can only drop the first sense POSITIONALLY, and on a
  // word whose headline is not its first sense (Fits → พอดี, whose senses are ปรับปรุง and
  // ความพอเหมาะ) that drops a meaning the reader has not been told. So the test is what the sense
  // SAYS: a sense whose every term is already in the answer above is not another meaning, it is the
  // same one. Everything else stays, first or not.
  const headline = new Set(String(meaning || '').split(/[;,、，]/)
    .map((t) => t.trim().toLowerCase()).filter(Boolean));
  const saysNothingNew = (sn) => {
    const terms = Array.isArray(sn.terms) ? sn.terms.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [];
    return terms.length > 0 && terms.every((t) => headline.has(t));
  };
  const kept = senses.filter((sn) => sn && (sn.terms || sn.gloss) && !saysNothingNew(sn));
  fcSenses.textContent = '';
  kept.forEach((sn, i) => {
    if (i) fcSenses.appendChild(document.createTextNode('  ·  '));
    const chip = posBadgeEl(sn.pos);
    if (chip) { fcSenses.appendChild(chip); fcSenses.appendChild(document.createTextNode(' ')); }
    const terms = Array.isArray(sn.terms) ? sn.terms.slice(0, 2).join(', ') : String(sn.gloss || '');
    fcSenses.appendChild(document.createTextNode(terms));
  });
  let hasSenses = kept.length > 0;
  if (!hasSenses) {
    fcSenses.textContent = '';
    const only = v.pos ? posBadgeEl(v.pos) : null;
    if (only) { fcSenses.appendChild(only); hasSenses = true; }
  }
  fcSenses.hidden = !hasSenses;
  // The dictionary definitions saved with the word, at most three, each with the chip its own word
  // class wears elsewhere. Words collected before this shipped simply have no `defs` and the row
  // stays hidden — nothing to migrate, nothing to backfill.
  fcDefs.textContent = '';
  const defs = Array.isArray(v.defs) ? v.defs.slice(0, 3) : [];
  for (const d of defs) {
    if (!d || !d.text) continue;
    const line = document.createElement('span');
    line.className = 'fc-def';
    const chip = d.pos ? posBadgeEl(d.pos) : null;
    if (chip) { line.appendChild(chip); line.appendChild(document.createTextNode(' ')); }
    line.appendChild(document.createTextNode(d.text));
    fcDefs.appendChild(line);
  }
  fcDefs.hidden = !fcDefs.childElementCount;
  const reading = getReading(v);
  reviewReading.hidden = !reading;
  reviewReading.textContent = reading;
  // src is the sentence the word came out of. contextLine drops the ones not worth printing — the
  // "sentence" that IS the word (single-word snips print it a third time) and the OCR reads that
  // never were prose. See shared/vocab-model.js.
  const src = contextLine(v);
  reviewSrc.hidden = !src;
  reviewSrc.textContent = src;

  document.getElementById('iAgain').textContent = intervalLabel(v, 'again');
  document.getElementById('iHard').textContent = intervalLabel(v, 'hard');
  document.getElementById('iGood').textContent = intervalLabel(v, 'good');
  document.getElementById('iEasy').textContent = intervalLabel(v, 'easy');
  setFlipped(false);
}

// ---- Test mode ----
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderQuiz() {
  const v = reviewQueue[reviewIdx];
  answered = false;
  qNext.hidden = true;
  qMean.hidden = true; // Usage's answer line — shares the block, must not linger into a Test card
  qOpts.innerHTML = '';
  // Ask in whichever direction the toggle says; the answer is the OTHER side of the same card.
  const ask = reverse ? getMeaning(v) : getWord(v);
  const right = reverse ? getWord(v) : getMeaning(v);
  // A two-sense word has more than one right answer ("run" → วิ่ง and การวิ่ง). Distractors are drawn
  // from other entries, so any term belonging to THIS entry must be accepted (jek, 2026-07-30).
  const rightSet = new Set([String(right || '').trim().toLowerCase()]);
  if (!reverse && Array.isArray(v.senses)) v.senses.forEach((sn) => sn.terms.forEach((t) => rightSet.add(String(t).trim().toLowerCase())));
  qWord.textContent = ask;
  qSub.textContent = window.i18n.t(reverse ? 'rv.askMeaning' : 'rv.askWord');

  // Distractors come from the rest of your collection — real words you've met, not invented noise.
  const pool = savedVocab.filter((o) => wordKey(getWord(o)) !== wordKey(getWord(v)));
  const seen = new Set([right.trim().toLowerCase()]);
  const distract = [];
  for (const o of shuffled(pool)) {
    const val = reverse ? getWord(o) : getMeaning(o);
    const key = String(val || '').trim().toLowerCase();
    if (!key || seen.has(key) || rightSet.has(key)) continue; // never offer a second correct answer
    seen.add(key);
    distract.push(val);
    if (distract.length >= 3) break;
  }
  // Usage borrows this same note element for its own message, so re-state Test's before showing it.
  qNote.textContent = window.i18n.t('rv.quizNote');
  qNote.hidden = savedVocab.length >= QUIZ_MIN;

  shuffled([right, ...distract]).forEach((val, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qopt';
    const k = document.createElement('span');
    k.className = 'qopt-key';
    k.textContent = String(i + 1);
    b.appendChild(k);
    b.appendChild(document.createTextNode(val));
    b.addEventListener('click', () => answerQuiz(b, rightSet.has(String(val).trim().toLowerCase()), right));
    qOpts.appendChild(b);
  });
}

// ---- Usage mode ----
// The prompt is the entry's own sentence with the word replaced by a gap; the options are other
// words you've collected. Answering grades the card through the same scheduler Test uses.
function renderUsage() {
  const v = reviewQueue[reviewIdx];
  const parts = clozeParts(v); // queueFor already filtered, so this cannot be null here
  answered = false;
  qNext.hidden = true;
  qMean.hidden = true;
  qMean.textContent = '';
  qOpts.innerHTML = '';

  // Built as nodes, never innerHTML — this is OCR'd game text going straight onto the page.
  qWord.textContent = '';
  const before = document.createElement('span'); before.textContent = parts.before;
  const gap = document.createElement('span'); gap.className = 'cloze-gap'; gap.textContent = '____';
  const after = document.createElement('span'); after.textContent = parts.after;
  qWord.append(before, gap, after);
  qSub.textContent = window.i18n.t('rv.askUsage');

  const right = getWord(v);
  const rightKey = wordKey(right);
  const seen = new Set([rightKey]);
  const distract = [];
  for (const o of shuffled(savedVocab)) {
    const w = getWord(o);
    const k = wordKey(w);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    distract.push(w);
    if (distract.length >= 3) break;
  }
  qNote.hidden = savedVocab.length >= QUIZ_MIN;

  shuffled([right, ...distract]).forEach((val, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qopt';
    const k = document.createElement('span');
    k.className = 'qopt-key';
    k.textContent = String(i + 1);
    b.appendChild(k);
    b.appendChild(document.createTextNode(val));
    b.addEventListener('click', () => answerUsage(b, wordKey(val) === rightKey, right, parts, v));
    qOpts.appendChild(b);
  });
}

function answerUsage(btn, correct, right, parts, v) {
  if (answered) return;
  answered = true;
  [...qOpts.children].forEach((b) => {
    b.disabled = true;
    if (wordKey(b.textContent.slice(1)) === wordKey(right)) b.classList.add('correct');
  });
  if (!correct) btn.classList.add('wrong');
  // Fill the gap in: the take-away is the whole sentence reading correctly, not a tick.
  qWord.textContent = '';
  const before = document.createElement('span'); before.textContent = parts.before;
  const hit = document.createElement('span'); hit.className = 'cloze-hit'; hit.textContent = parts.hit;
  const after = document.createElement('span'); after.textContent = parts.after;
  qWord.append(before, hit, after);
  const reading = getReading(v);
  qMean.textContent = reading ? `${right} · ${reading} — ${getMeaning(v)}` : `${right} — ${getMeaning(v)}`;
  qMean.hidden = false;
  if (study.speakOnFlip) speakText(right, reading);
  gradeCurrent(correct ? 'good' : 'again', { advance: false });
  qNext.hidden = false;
  qNext.focus();
}

// ---- Recall mode --------------------------------------------------------------------------------
// Usage and Recall both show a sentence with a gap, and they are not the same exercise. Usage offers
// four options drawn from the whole collection, so the answer is usually obvious from the topic
// alone; the gap is really asking "does this sentence look right". Recall offers THE WORDS OF THIS
// SITTING — you just met all of them, they are all plausible, and the only way through is to
// remember which one belongs. That is the rung the user asked for: "ten words, now which one goes
// here". It also prefers a sentence you have NOT seen, so the answer cannot be recalled as a picture
// of the line you met it in.
const RECALL_OPTS = 6; // more than four (four is a coin-flip among ten) and still readable in a column
// Where the sentence comes from, best first. `rc` is written by the AI batch (see recallPrepare);
// `lex.example` was already bought for Card mode and is a different setting by construction; `src`
// is the line you met it in — weaker, but it still makes the pool the hard part.
function recallParts(v) {
  const word = getWord(v);
  const tries = [v.rc, v.lex && v.lex.example, v.src];
  for (const s of tries) {
    const cut = s ? cutWordOut(word, s) : null;
    if (cut) return cut;
  }
  return null;
}
const isRecallable = (v) => recallParts(v) !== null;

// Buy fresh sentences for the words in this sitting that have none yet — one call for the lot, and
// the answers stick to the entries, so a word is only ever paid for once. Resolves either way: this
// is an upgrade to Recall, never a gate in front of it, so no key, no quota or a failed call all end
// with the mode running on the sentences it already had.
let recallFetching = false;
async function recallPrepare(words) {
  if (recallFetching) return;
  const need = words.filter((v) => !v.rc && getWord(v)).slice(0, 12);
  if (!need.length || !(planFlags.hasOwnKey || planFlags.hasLicence)) return;
  recallFetching = true;
  const state = document.getElementById('qHintOut');
  if (state) state.textContent = window.i18n.t('rv.recallWriting');
  const r = await window.learnApi.recallSet({
    words: need.map((v) => ({ word: getWord(v), src: v.src || '' })),
  });
  recallFetching = false;
  if (state) state.textContent = '';
  if (!r || r.error || !r.sentences) return;
  let got = 0;
  for (const v of need) {
    const s = r.sentences[getWord(v)];
    // Cut it here as well as in main: main checked the word is present as a substring, this checks it
    // is present as a WORD — the same test renderRecall will run, so a sentence that survives this
    // cannot fail to produce a gap later.
    if (!s || !cutWordOut(getWord(v), s)) continue;
    v.rc = s;
    got += 1;
    window.learnApi.vocabUpdate({ word: getWord(v), patch: { rc: s } });
  }
  // Only redraw if the card on screen actually gained a sentence — a repaint mid-answer would throw
  // away a choice the user has already made.
  if (got && reviewMode === 'recall' && !answered) renderCurrent();
}
// 0 = untouched, 1 = meaning shown, 2 = shape shown, 3 = wrong answers thinned
let hintStep = 0;
const qHint = document.getElementById('qHint');
const qHintBtn = document.getElementById('qHintBtn');
const qHintOut = document.getElementById('qHintOut');

// The shape of a word without the word: first character, then a dot per remaining character. Enough
// to unlock a word on the tip of your tongue, not enough to read it off.
function wordShape(w) {
  const chars = [...String(w)];
  if (chars.length <= 1) return chars.join('');
  return chars[0] + ' ' + chars.slice(1).map((c) => (/\s/.test(c) ? ' ' : '·')).join('');
}

function renderRecall() {
  const v = reviewQueue[reviewIdx];
  const parts = recallParts(v); // queueFor filtered on this, so it cannot be null here
  answered = false;
  hintStep = 0;
  qNext.hidden = true;
  qMean.hidden = true;
  qMean.textContent = '';
  qOpts.innerHTML = '';
  qNote.hidden = true;

  qWord.textContent = '';
  const before = document.createElement('span'); before.textContent = parts.before;
  const gap = document.createElement('span'); gap.className = 'cloze-gap'; gap.textContent = '____';
  const after = document.createElement('span'); after.textContent = parts.after;
  qWord.append(before, gap, after);
  qSub.textContent = window.i18n.t('rv.askRecall');

  const right = getWord(v);
  const rightKey = wordKey(right);
  // Distractors come from the QUEUE — the words of this sitting — and only fall back to the wider
  // collection when the sitting is too small to fill the row on its own.
  const seen = new Set([rightKey]);
  const pool = [];
  for (const source of [reviewQueue, savedVocab]) {
    for (const o of shuffled(source)) {
      const w = getWord(o);
      const k = wordKey(w);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      pool.push(w);
      if (pool.length >= RECALL_OPTS - 1) break;
    }
    if (pool.length >= RECALL_OPTS - 1) break;
  }

  shuffled([right, ...pool]).forEach((val, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qopt';
    const k = document.createElement('span');
    k.className = 'qopt-key';
    k.textContent = String(i + 1);
    b.appendChild(k);
    b.appendChild(document.createTextNode(val));
    b.addEventListener('click', () => answerRecall(b, wordKey(val) === rightKey, right, parts, v));
    qOpts.appendChild(b);
  });

  qHint.hidden = false;
  paintHint(v, right);
}

function paintHint(v, right) {
  qHintBtn.disabled = hintStep >= 3 || answered;
  qHintBtn.textContent = window.i18n.t(hintStep === 0 ? 'rv.hint' : hintStep >= 3 ? 'rv.hintOut' : 'rv.hintMore');
  const lines = [];
  if (hintStep >= 1) lines.push(getMeaning(v) || getReading(v) || '—');
  if (hintStep >= 2) lines.push(wordShape(right));
  qHintOut.textContent = lines.join('  ·  ');
}

qHintBtn.addEventListener('click', () => {
  const v = reviewQueue[reviewIdx];
  if (!v || answered || hintStep >= 3) return;
  hintStep += 1;
  const right = getWord(v);
  // Third rung: take away half the wrong answers. Disabled rather than removed, so the row does not
  // reflow under the finger already on its way to a button.
  if (hintStep === 3) {
    const wrong = [...qOpts.children].filter((b) => wordKey(b.textContent.slice(1)) !== wordKey(right));
    shuffled(wrong).slice(0, Math.ceil(wrong.length / 2)).forEach((b) => { b.disabled = true; b.classList.add('thinned'); });
  }
  paintHint(v, right);
});

// A hint is not free. Answering after help grades Hard rather than Good, so the scheduler keeps
// bringing back the words you could not produce on your own — the whole point of the mode.
function answerRecall(btn, correct, right, parts, v) {
  if (answered) return;
  answered = true;
  [...qOpts.children].forEach((b) => {
    b.disabled = true;
    if (wordKey(b.textContent.slice(1)) === wordKey(right)) b.classList.add('correct');
  });
  if (!correct) btn.classList.add('wrong');
  qWord.textContent = '';
  const before = document.createElement('span'); before.textContent = parts.before;
  const hit = document.createElement('span'); hit.className = 'cloze-hit'; hit.textContent = parts.hit;
  const after = document.createElement('span'); after.textContent = parts.after;
  qWord.append(before, hit, after);
  const reading = getReading(v);
  qMean.textContent = reading ? `${right} · ${reading} — ${getMeaning(v)}` : `${right} — ${getMeaning(v)}`;
  qMean.hidden = false;
  if (study.speakOnFlip) speakText(right, reading);
  gradeCurrent(correct ? (hintStep ? 'hard' : 'good') : 'again', { advance: false });
  paintHint(v, right);
  qNext.hidden = false;
  qNext.focus();
}

// Recall with nothing to ask. Unlike Usage's empty state this one is rarely reachable — every entry
// with a sentence qualifies — so it says the one thing that fixes it.
function renderRecallEmpty() {
  renderUsageEmpty();
  qNote.textContent = window.i18n.t('rv.recallNone');
  qHint.hidden = true;
}

// Not a dead end: it names the two ways an entry earns a usage card, then hands over to Study.
function renderUsageEmpty() {
  reviewDone.hidden = true;
  document.querySelector('.fc-scene').hidden = true;
  document.getElementById('fcNav').hidden = true;
  reviewRate.hidden = true;
  fcKeys.classList.remove('show');
  fcQuiz.style.display = '';
  fcStats.textContent = '';
  fcBar.style.width = '0%';
  qWord.textContent = '';
  qSub.textContent = '';
  qMean.hidden = true;
  qOpts.innerHTML = '';
  qNext.hidden = true;
  qNote.innerHTML = window.i18n.t('rv.usageNone'); // dictionary string, not user text — same as w.emptyVocab
  qNote.hidden = false;
}

function answerQuiz(btn, correct, right) {
  if (answered) return;
  answered = true;
  [...qOpts.children].forEach((b) => {
    b.disabled = true;
    if (b.textContent.slice(1) === right) b.classList.add('correct');
  });
  if (!correct) btn.classList.add('wrong');
  gradeCurrent(correct ? 'good' : 'again', { advance: false });
  qNext.hidden = false;
  qNext.focus();
}

qNext.addEventListener('click', () => { reviewIdx += 1; renderCurrent(); });
document.getElementById('planNext')?.addEventListener('click', advancePlan);

// ---- grading (shared by both modes) ----
function gradeCurrent(rating, { advance = true } = {}) {
  const v = reviewQueue[reviewIdx];
  if (!v) return;
  v.srs = schedule(v.srs, rating); // mutates the object already living in savedVocab
  // Per-entry merge (not vocab:set) — never clobbers a write the pill made to a DIFFERENT word
  // while this window was open (see M4 risk note: bumpSeen was moved to the same per-entry update).
  window.learnApi.vocabUpdate({ word: getWord(v), patch: { srs: v.srs } });
  if (session) {
    session[rating] += 1;
    if (rating === 'again') session.againWords.push(getWord(v));
  }
  if (rating === 'again') reviewQueue.push(v);
  if (advance) { reviewIdx += 1; renderCurrent(); }
}

function rateCurrent(rating) {
  if (reviewMode !== 'study') return;  // in Test and Usage the answer grades it
  if (!flipped) return;                // grading before you've seen the answer is always a misclick
  gradeCurrent(rating);
}

// ---- controls ----
reviewWordsBtn.addEventListener('click', () => switchTab('words'));
reviewBackBtn.addEventListener('click', () => switchTab('insights'));
reviewCard.addEventListener('click', () => setFlipped(!flipped));
reviewSpeak.addEventListener('click', (e) => {
  e.stopPropagation(); // the whole card is the flip target — the speaker button must not flip it
  const v = reviewQueue[reviewIdx];
  if (v) speakText(getWord(v), getReading(v));
});
fcShow.addEventListener('click', () => setFlipped(true));
rateAgain.addEventListener('click', () => rateCurrent('again'));
rateHard.addEventListener('click', () => rateCurrent('hard'));
rateGood.addEventListener('click', () => rateCurrent('good'));
rateEasy.addEventListener('click', () => rateCurrent('easy'));

document.getElementById('lexSpeak').addEventListener('click', () => {
  const v = reviewQueue[reviewIdx];
  if (v) speakText(getWord(v), getReading(v));
});

fcMode.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn || btn.dataset.mode === reviewMode) return;
  // A Test card that's been answered is already graded and waiting on Next. Switching to Study here
  // re-drew that same card as a flashcard, and grading it again ran schedule() twice on one card —
  // wrong interval, and the session tally counted it twice. Finish the card first.
  if (reviewMode !== 'study' && answered && !qNext.hidden) { qNext.focus(); return; }
  reviewMode = btn.dataset.mode;
  abandonPlan();
  [...fcMode.children].forEach((b) => b.classList.toggle('on', b === btn));
  setModeClass();
  // Usage runs on a subset (only words whose sentence still contains them), so the old index would
  // point at a different card — or past the end. Re-deal from the top of the mode's own queue.
  reviewQueue = queueFor(reviewMode);
  reviewIdx = 0;
  reviewDone.hidden = true;
  renderCurrent();
});
fcReverse.addEventListener('change', () => {
  reverse = fcReverse.checked;
  renderCurrent(); // the label stays "Meaning first" — it names what ticking the box does, not the state
});
// Shuffle only what's still to come — re-ordering the card you're looking at would yank it away.
fcShuffle.addEventListener('click', () => {
  const head = reviewQueue.slice(0, reviewIdx + 1);
  reviewQueue = head.concat(shuffled(reviewQueue.slice(reviewIdx + 1)));
  renderStats();
});
fcPrev.addEventListener('click', () => { if (reviewIdx > 0) { reviewIdx -= 1; renderCurrent(); } });
fcNext.addEventListener('click', () => { if (reviewIdx < reviewQueue.length - 1) { reviewIdx += 1; renderCurrent(); } });

// Keyboard, same keys as ScoreUp's flashcards. Only while the Review tab is the one on screen.
document.addEventListener('keydown', (e) => {
  if (panels.review.hidden || reviewView.hidden) return;
  if (!reviewDone.hidden) return; // session over — .click() still fires on a display:none button
  if (reviewMode !== 'study') { // Test and Usage are both answer-with-1..4, Next on Space/Enter
    if (answered && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); qNext.click(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= qOpts.children.length) qOpts.children[n - 1].click();
    return;
  }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(!flipped); return; }
  if (e.key === 'ArrowLeft') { fcPrev.click(); return; }
  if (e.key === 'ArrowRight') { fcNext.click(); return; }
  if (e.key === '1') rateCurrent('again');
  if (e.key === '2') rateCurrent('hard');
  if (e.key === '3') rateCurrent('good');
  if (e.key === '4') rateCurrent('easy');
});

// ---------- History tab ----------
// Is this OCR'd/typed text a single word (save it directly) vs a sentence (split into pick-able
// chips)? Same heuristic as the pill's (kept in sync on purpose — see index.js there).
const CJK_RE = /[぀-ヿ㐀-鿿]/;
const isSingleWord = (en) => {
  const t = String(en || '').trim();
  if (!t || /\s/.test(t)) return false;
  if (CJK_RE.test(t)) return [...t].length <= 4;
  return true;
};
function isEntrySaved(payload) {
  const en = String(payload.en || '').trim();
  if (isSingleWord(en)) return isWordSaved(en);
  return savedVocab.some((v) => v.src === en || wordKey(getWord(v)) === wordKey(en));
}

// Offline word-picker: whitespace-split chips, tap one to translate + save it. The learn window has
// no Claude auto-extract wiring (that's a pill/main-process convenience, not required for M4) — every
// multi-word entry uses this path here.
function buildChips(container, sentence, onChange) {
  container.innerHTML = '';
  const raw = sentence.trim().split(/\s+/).filter(Boolean);
  if (raw.length <= 1) {
    const hint = document.createElement('div');
    hint.className = 'vocab-hint';
    hint.textContent = window.i18n.t('w.noSplit');
    container.appendChild(hint);
    return;
  }
  // One shared line under the chips for whatever went wrong on the last tap — one element, reused, so
  // tapping five chips in a row can never stack five copies of the same complaint.
  const noteEl = document.createElement('div');
  noteEl.className = 'vocab-hint';
  noteEl.hidden = true;
  const note = (msg) => { noteEl.textContent = msg || ''; noteEl.hidden = !msg; };
  raw.forEach((token) => {
    const word = token.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '') || token;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'vocab-chip';
    chip.textContent = token;
    const paintChip = () => chip.classList.toggle('on', isWordSaved(word));
    paintChip();
    chip.addEventListener('click', async () => {
      if (isWordSaved(word)) { removeVocabWord(word); paintChip(); onChange(); return; }
      chip.disabled = true;
      chip.classList.add('busy');
      try {
        const res = await window.learnApi.translateWord(word);
        if (res && res.th) { addVocabWord({ word, meaning: res.th, reading: '', src: sentence, pos: res.pos, senses: res.senses }); paintChip(); onChange(); note(''); }
        // A failure used to end here: the chip un-greyed and nothing else happened, so with no network
        // every tap looked like a dead button. Say which of the two it is instead.
        else note(window.i18n.t(aiErrKey(res, 'lex.failed')));
      } catch {
        note(window.i18n.t('lex.failed'));
      } finally {
        chip.disabled = false;
        chip.classList.remove('busy');
      }
    });
    container.appendChild(chip);
  });
  container.appendChild(noteEl);
}

// Mine words straight out of the history you are reading. The pill's panel has had this since July;
// this window showed the SAME lines as plain text, so the surface you sit down at to study was the
// one place you could not collect from — you had to go back to the overlay to tap the word you were
// looking at here (jek, 2026-08-09).
//
// Same store, same shape, same toggle: tap to collect (the word goes amber and its meaning appears
// under the line), tap again to drop it. Nothing new is invented — vocabAdd/removeVocabWord are the
// functions this window already uses everywhere else.
function fillTappable(el, line, onChange) {
  const text = String(line || '').replace(/\s+/g, ' ').trim();
  el.textContent = '';
  const tokens = text.split(' ').filter(Boolean);
  // A line with no spaces (Japanese, Chinese) has no word boundaries to offer — leave it as text
  // rather than turning the whole sentence into one giant clickable 'word'.
  if (tokens.length <= 1) { el.textContent = text; return; }
  tokens.forEach((token, i) => {
    if (i) el.appendChild(document.createTextNode(' '));
    const word = token.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '');
    if (!word) { el.appendChild(document.createTextNode(token)); return; }
    const w = document.createElement('span');
    w.className = 'src-word';
    w.textContent = token;
    const paint = () => {
      const on = isWordSaved(word);
      w.classList.toggle('on', on);
      w.title = on ? window.i18n.t('w.tapRemove') : window.i18n.t('w.tapSave');
    };
    paint();
    w.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isWordSaved(word)) { removeVocabWord(word); paint(); onChange && onChange(); return; }
      w.classList.add('busy');
      try {
        const res = await window.learnApi.translateWord(word);
        if (res && res.th) {
          addVocabWord({ word, meaning: res.th, reading: '', src: text, pos: res.pos, senses: res.senses });
          paint();
          onChange && onChange();
          // The meaning, right under the line it came from. No popup: this window has room, and a
          // bubble that follows the cursor is for an overlay sitting on top of a game.
          const note = el.parentElement && el.parentElement.querySelector('.word-note');
          // Same shape as the overlay's word bubble: the word, the meaning, then the kind of word as
          // the shared chip rather than as another dot-separated scrap of text.
          if (note) {
            note.textContent = `${word} — ${res.th}`;
            const noteChip = res.pos ? posBadgeEl(res.pos) : null;
            if (noteChip) { note.appendChild(document.createTextNode(' ')); note.appendChild(noteChip); }
            note.hidden = false;
          }
        }
      } finally { w.classList.remove('busy'); }
    });
    el.appendChild(w);
  });
}

function makeEntry(payload) {
  const entry = document.createElement('div');
  entry.className = 'entry';
  const top = document.createElement('div');
  top.className = 'entry-top';
  const body = document.createElement('div');
  body.className = 'entry-body';
  const thEl = document.createElement('div'); thEl.className = 'th';
  fillTappable(thEl, payload.en, () => { if (!panels.words.hidden && wordSeg === 'vocab') renderVocab(); });
  const enEl = document.createElement('div'); enEl.className = 'en'; enEl.textContent = payload.th;
  if (payload.ts) {
    const t = document.createElement('span');
    t.className = 'entry-time';
    t.textContent = clockLabel(payload.ts);
    enEl.appendChild(document.createTextNode(' '));
    enEl.appendChild(t);
  }
  // Where a tapped word puts its meaning. Empty and hidden until something is collected from THIS
  // line, so a history you are only reading looks exactly as it did.
  const note = document.createElement('div');
  note.className = 'word-note';
  note.hidden = true;
  body.appendChild(thEl); body.appendChild(enEl); body.appendChild(note);
  const star = document.createElement('button');
  star.className = 'entry-star';
  const paint = () => { const on = isEntrySaved(payload); star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on); };
  paint();
  star.title = window.i18n.t('w.collectTip');
  const chipsEl = document.createElement('div');
  chipsEl.className = 'entry-chips';
  star.addEventListener('click', () => {
    const en = String(payload.en || '').trim();
    if (isSingleWord(en)) {
      toggleVocabWord(en, payload.th, payload.pronunciation || '', en);
      paint();
      return;
    }
    const opening = !chipsEl.classList.contains('open');
    chipsEl.classList.toggle('open', opening);
    if (opening && !chipsEl.dataset.built) {
      buildChips(chipsEl, en, paint);
      chipsEl.dataset.built = '1';
    }
  });
  top.appendChild(body);
  top.appendChild(star);
  entry.appendChild(top);
  entry.appendChild(chipsEl);
  return entry;
}

const logEl = document.getElementById('log');
let historyList = [];
const histNote = document.getElementById('histNote');

// A capture is ~20 nodes. At the default ceiling of 2000 lines the old render built 40,000 of them,
// measured at 365ms — and it ran again, in full, on every single new translation, which in CC mode
// arrives every few seconds. So: only the newest slice is ever in the DOM, and the rest is one click
// away. `historyList` still holds everything, exactly as before.
const HIST_WINDOW = 300;
let histShown = HIST_WINDOW;
let histDirty = false;      // a translation landed while nobody could see this tab

// #log is a plain flex column: the pane that scrolls is the .panel around it, so every
// `logEl.scrollTop = logEl.scrollHeight` in here was quietly a no-op against a container whose
// scrollHeight equals its clientHeight. Ask the real scroller.
const histScroller = () => logEl.closest('.panel') || logEl;
// Only follow the tail if the reader is already at it. Yanking someone who scrolled up back down to
// the bottom every few seconds is the same bug as a chat window that will not let you read history.
function histAtBottom() {
  const s = histScroller();
  return s.scrollHeight - s.scrollTop - s.clientHeight < 40;
}
function histDayHead(ts) {
  const h = document.createElement('div');
  h.className = 'day-head';
  h.textContent = dayLabel(ts);
  return h;
}
function histSetNote() {
  if (!historyList.length) { histNote.textContent = ''; return; }
  const shown = Math.min(histShown, historyList.length);
  const of = shown < historyList.length ? `${shown}/${historyList.length}` : String(historyList.length);
  histNote.textContent = `${of} ${window.i18n.t('w.shown')} · ${window.i18n.t('w.newestLast')}`;
}
// Trim from the top back down to the window, taking any day heading the removal stranded with it.
function histTrim() {
  const btn = logEl.firstElementChild && logEl.firstElementChild.classList.contains('hist-earlier') ? 1 : 0;
  let count = logEl.querySelectorAll('.entry').length;
  while (count > histShown) {
    const first = logEl.children[btn];
    if (!first) break;
    if (first.classList.contains('entry')) count--;
    first.remove();
  }
  // A heading left with nothing under it reads as a day with no captures in it.
  const head = logEl.children[btn];
  if (head && head.classList.contains('day-head')) {
    const next = head.nextElementSibling;
    if (!next || next.classList.contains('day-head')) head.remove();
  }
}

function renderHistory() {
  logEl.innerHTML = '';
  histDirty = false;
  histSetNote();
  if (!historyList.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = window.i18n.t('w.emptyHist');
    logEl.appendChild(e);
    return;
  }
  const start = Math.max(0, historyList.length - histShown);
  if (start > 0) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'hist-earlier';
    more.textContent = `${window.i18n.t('w.showEarlier')} (${start})`;
    more.addEventListener('click', () => {
      // Grow the window and keep the line you were reading where it was, rather than jumping.
      const s = histScroller();
      const wasH = s.scrollHeight;
      const wasT = s.scrollTop;
      histShown += HIST_WINDOW;
      renderHistory();
      s.scrollTop = s.scrollHeight - wasH + wasT;
    });
    logEl.appendChild(more);
  }
  // oldest→newest, newest at the bottom — a day heading goes in wherever the day changes.
  let lastDay = null;
  for (let i = start; i < historyList.length; i++) {
    const p = historyList[i];
    const day = p.ts ? startOfDayMs(p.ts) : null;
    if (day && day !== lastDay) {
      lastDay = day;
      logEl.appendChild(histDayHead(p.ts));
    }
    logEl.appendChild(makeEntry(p));
  }
  const sc = histScroller(); sc.scrollTop = sc.scrollHeight;
}

// One new line appends one row. The whole list used to be rebuilt for this — 352ms of frozen window
// per capture at the default ceiling, with the scroll thrown to the bottom each time.
function appendHistoryRow(p, prev) {
  if (!logEl.querySelector('.entry')) { renderHistory(); return; }  // was the empty state
  const stick = histAtBottom();
  const day = p.ts ? startOfDayMs(p.ts) : null;
  const prevDay = prev && prev.ts ? startOfDayMs(prev.ts) : null;
  if (day && day !== prevDay) logEl.appendChild(histDayHead(p.ts));
  logEl.appendChild(makeEntry(p));
  // Trimming takes rows off the TOP, which slides everything below it up under the reader's eyes.
  // Only do it when they are riding the tail and cannot see the top anyway; a reader who scrolled up
  // keeps every row until they come back down.
  if (stick) { histTrim(); const sc = histScroller(); sc.scrollTop = sc.scrollHeight; }
  histSetNote();
}

// Nothing on this tab is worth drawing while the window is hidden — and a closed Gloss window is
// hidden, not gone (main.js keeps it alive), so without this the render kept running behind a game.
const histVisible = () => !document.hidden && !panels.words.hidden && wordSeg === 'history';
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (histDirty && histVisible()) renderHistory();
  // Closing this window only hides it, so it can come back days after it was last drawn — and every
  // one of these tabs is written in terms of "today". Left alone, yesterday's words sat under a
  // heading that said Today until you happened to change tabs.
  if (!panels.today.hidden) renderToday();
  if (!panels.calendar.hidden) renderCalendar();
  if (!panels.insights.hidden) window.learnApi.statsGet().then((s) => { insStats = s || insStats; renderInsights(); });
});

window.learnApi.onHistoryLoad((list) => {
  historyList = Array.isArray(list) ? list.slice().reverse() : []; // main stores newest-first
  histShown = HIST_WINDOW;
  if (histVisible()) renderHistory(); else histDirty = true;
});
window.learnApi.onTranslation((payload) => {
  const prev = historyList[historyList.length - 1];
  historyList.push(payload);
  if (historyList.length > study.maxHistory) historyList.shift();
  if (histVisible()) appendHistoryRow(payload, prev); else histDirty = true;
  // main just bumped stats.json for this capture — pull the fresh tally if Insights is on screen
  if (!document.hidden && !panels.insights.hidden) window.learnApi.statsGet().then((s) => { insStats = s || insStats; renderInsights(); });
});

// The pill's ⌘⇧X (clear history) reaches every window now — mirror it here too.
window.learnApi.onHistoryClear(() => {
  historyList = [];
  histShown = HIST_WINDOW;
  if (histVisible()) renderHistory(); else histDirty = true;
});

// ---------- Insights tab ----------
// Reads the per-day tally main keeps in stats.json (captures / words / chars / capture-source, plus
// lifetime per-script chars) and the live vocab list. Everything below is derived from those two —
// no estimates, no separate counters that could drift out of sync with what actually happened.
const insEmpty = document.getElementById('insEmpty');
const insBody = document.getElementById('insBody');
const HEAT_WEEKS = 26; // half a year — as much as fits the card without scrolling at 900px

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const dayKeyOf = (d) => d.toLocaleDateString('sv-SE'); // 'YYYY-MM-DD', local — same key main writes
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

let insStats = null;

function heatLevel(caps) {
  if (!caps) return '';
  if (caps <= 2) return 'l1';
  if (caps <= 5) return 'l2';
  if (caps <= 11) return 'l3';
  return 'l4';
}

// Streak = consecutive days with at least one capture, walking back from today. An empty today does
// NOT break it (the day isn't over yet) — it just starts the walk at yesterday.
function streaks(days) {
  const today = startOfDay(new Date());
  let cur = 0;
  const has = (d) => !!(days[dayKeyOf(d)] && days[dayKeyOf(d)].c);
  let walk = new Date(today);
  if (!has(walk)) walk.setDate(walk.getDate() - 1);
  while (has(walk)) { cur += 1; walk.setDate(walk.getDate() - 1); }

  const keys = Object.keys(days).filter((k) => days[k].c).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  keys.forEach((k) => {
    const d = new Date(k + 'T00:00:00');
    run = prev && (d - prev) === 86400000 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  });
  return { cur, best };
}

function renderHeat(days) {
  const el = document.getElementById('insHeat');
  el.innerHTML = '';
  const today = startOfDay(new Date());
  // Last column is the week containing today; each column is one Sun→Sat week.
  const lastSunday = new Date(today);
  lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay());
  const first = new Date(lastSunday);
  first.setDate(first.getDate() - (HEAT_WEEKS - 1) * 7);

  const months = document.createElement('div');
  months.className = 'heat-months';
  months.style.gridTemplateColumns = `repeat(${HEAT_WEEKS}, 11px)`;
  const cells = document.createElement('div');
  cells.className = 'heat-cells';
  cells.style.gridTemplateColumns = `repeat(${HEAT_WEEKS}, 11px)`;

  let lastMonth = -1;
  for (let w = 0; w < HEAT_WEEKS; w += 1) {
    const colStart = new Date(first);
    colStart.setDate(colStart.getDate() + w * 7);
    const label = document.createElement('span');
    // Label a column only when its week is the first one of a new month — same trick GitHub uses, so
    // the labels sit above the right stretch of grid instead of every column.
    if (colStart.getMonth() !== lastMonth && colStart.getDate() <= 7) {
      label.textContent = colStart.toLocaleDateString('en-US', { month: 'short' });
      lastMonth = colStart.getMonth();
    }
    months.appendChild(label);

    for (let dow = 0; dow < 7; dow += 1) {
      const d = new Date(colStart);
      d.setDate(d.getDate() + dow);
      const cell = document.createElement('div');
      cell.className = 'heat-cell';
      if (d > today) { cell.classList.add('future'); cells.appendChild(cell); continue; }
      const row = days[dayKeyOf(d)];
      const caps = (row && row.c) || 0;
      const lvl = heatLevel(caps);
      if (lvl) cell.classList.add(lvl);
      if (+d === +today) cell.classList.add('today');
      cell.title = `${dayKeyOf(d)} — ${caps ? `${fmt(caps)} capture${caps === 1 ? '' : 's'}, ${fmt(row.w)} words` : 'nothing'}`;
      cells.appendChild(cell);
    }
  }
  const scroll = document.createElement('div');
  scroll.appendChild(months);
  scroll.appendChild(cells);
  el.appendChild(scroll);
}

// Keyed, not spelled out: the Thai UI was reading "Japanese ตัวอักษร" — half a sentence in each
// language, in the one place that is supposed to tell you what you have been reading.
const SCRIPT_KEYS = { ja: 'script.ja', zh: 'script.zh', ko: 'script.ko', la: 'script.la' };
const scriptName = (k) => (SCRIPT_KEYS[k] ? window.i18n.t(SCRIPT_KEYS[k]) : k);

function setRows(el, rows) {
  el.innerHTML = '';
  rows.forEach(([strong, rest]) => {
    const r = document.createElement('div');
    r.className = 'r';
    const b = document.createElement('b');
    b.textContent = strong;
    r.appendChild(b);
    r.appendChild(document.createTextNode(rest));
    el.appendChild(r);
  });
}

// ---------- Today (the session recap, its own tab) ----------
// A play session has no boundary the app can see — a game doesn't tell us when you put it down — so
// the unit is the day. It ends on the one thing worth doing with words this fresh: use them, in the
// sentences you just met them in.
// ---------- Picking words out of what you just collected ----------
// Word keys, not entries: savedVocab is replaced wholesale on every vocab:changed, so holding object
// references here would keep ticking cards that no longer exist in the list being rendered.
let picking = false;
let picked = new Set();
// What is on screen to be picked from — the same array renderToday painted, kept so the toolbar's
// All/None and the count don't have to re-derive the scope and risk disagreeing with the cards.
let pickPool = [];

const SHOWN_CARDS = 24;
// One card per word, carrying the sentence it came from. That sentence lives on every saved entry
// already and used to be spent on a `title` tooltip — invisible, and the single most useful thing
// here: a word you met in a sentence is remembered by that sentence, not by its gloss.
function paintCards(list, words, ghost, picking) {
  list.innerHTML = '';
  list.classList.toggle('ghost', !!ghost);
  // The 24-card cap is a reading limit, and it must not become a choosing limit: capped while
  // picking, word 25 would be uncheckable and the "All" button would tick words with no card.
  (picking ? words : words.slice(0, SHOWN_CARDS)).forEach((v) => {
    const card = document.createElement('div');
    card.className = 'tw';
    if (picking) {
      const key = wordKey(getWord(v));
      card.classList.add('pickable');
      card.classList.toggle('on', picked.has(key));
      card.addEventListener('click', () => {
        if (picked.has(key)) picked.delete(key); else picked.add(key);
        card.classList.toggle('on', picked.has(key));
        paintPickTools();
      });
    }
    const head = document.createElement('p');
    head.className = 'tw-head';
    const w = document.createElement('b'); w.textContent = getWord(v);
    head.appendChild(w);
    const m = getMeaning(v);
    if (m) { const mm = document.createElement('span'); mm.textContent = m; head.appendChild(mm); }
    card.appendChild(head);
    // No sentence on this entry (typed lookups often have none) — the card just ends. Better a short
    // card than a placeholder line pretending there is context.
    const cardSrc = contextLine(v);
    if (cardSrc) {
      const src = document.createElement('p');
      src.className = 'tw-src';
      src.textContent = cardSrc;
      card.appendChild(src);
    }
    list.appendChild(card);
  });
  if (!picking && words.length > SHOWN_CARDS) {
    const more = document.createElement('div');
    more.className = 'tw tw-more';
    more.textContent = `+${fmt(words.length - SHOWN_CARDS)}`;
    list.appendChild(more);
  }
}

// ---------- Play sessions, reconstructed from timestamps ----------
// The comment above used to say a play session has no boundary the app can see, so the unit had to
// be the day. That is true of the GAME — it never tells us you put it down — but not of the words:
// collecting is something you do WHILE playing, so a run of entries with no long gap in it IS the
// sitting, and it can be recovered from the ts every entry already carries. No new field, no new
// store, and it works backwards over words collected before this shipped.
// 40 minutes: long enough to survive a cutscene, a boss fight or a coffee, short enough that
// tonight's play doesn't swallow this morning's.
const SESSION_GAP_MS = 40 * 60 * 1000;
// ...and a sitting stops being "the one you just finished" after half a day. This is what lets the
// page keep saying "last session" at 00:30 about the game you started at 22:00 — the thing the
// day-boundary version got wrong — while still falling back to the empty state days later.
const SESSION_LIVE_MS = 12 * 60 * 60 * 1000;

// Newest session first, and newest word first inside each — the order both the cards and the count
// want, so nothing re-sorts downstream.
function sessionsOf(list) {
  const sorted = list.filter((v) => v && v.ts).sort((a, b) => b.ts - a.ts);
  const out = [];
  for (const v of sorted) {
    const cur = out[out.length - 1];
    // Walking backwards in time, cur.from is the EARLIEST word in the open cluster — compare against
    // that, not against its newest, or one long sitting would be cut wherever it exceeded the gap.
    if (cur && cur.from - v.ts <= SESSION_GAP_MS) { cur.words.push(v); cur.from = v.ts; }
    else out.push({ words: [v], from: v.ts, to: v.ts });
  }
  return out;
}
// The sitting the user just got up from, or null if the last one is old enough that calling it
// "this session" would be a lie.
function liveSession() {
  const s = sessionsOf(savedVocab)[0];
  return s && Date.now() - s.to <= SESSION_LIVE_MS ? s : null;
}
// clockLabel is the history rows' 24h formatter, reused: a session span and a capture time in the
// same window must not be written in two different clocks.
// How long the sitting ran, plus when it ran. Minutes up to an hour and a half, then hours — "142
// minutes" is a number you have to divide before it means anything.
function sessionRows(s) {
  const span = [clockLabel(s.from), ' → ' + clockLabel(s.to)];
  const mins = Math.round((s.to - s.from) / 60000);
  // One word, or several inside the same minute: there is no duration to report, and "0 minutes"
  // under a real session reads like the clock is broken.
  if (mins < 1) return [span];
  return [
    mins >= 90
      ? [(mins / 60).toFixed(1), ' ' + window.i18n.t('today.sessionHrs')]
      : [fmt(mins), ' ' + window.i18n.t('today.sessionMins')],
    span,
  ];
}
let todayScope = 'session'; // 'session' | 'day' — the whole point of the page is what you just did

function renderToday() {
  const days = (insStats && insStats.days) || {};
  const dayWords = savedVocab.filter(isToday).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const sess = liveSession();
  // Offer the switch only when the two lists differ — one sitting that IS the whole day needs no
  // control, and a session that straddles midnight is exactly when the choice starts to matter.
  const splits = !!sess && sess.words.length !== dayWords.length;
  if (!splits) todayScope = 'session';
  const scopeEl = document.getElementById('todayScope');
  scopeEl.hidden = !splits;
  [...scopeEl.children].forEach((b) => b.classList.toggle('on', b.dataset.scope === todayScope));

  const useSession = todayScope === 'session' && !!sess;
  const words = useSession ? sess.words : dayWords;
  const list = document.getElementById('todayWords');
  const empty = document.getElementById('todayEmpty');
  const foot = document.getElementById('todayFoot');

  document.getElementById('todayNote').textContent = useSession && splits
    ? window.i18n.t('today.sessionNote')
    : window.i18n.t('ins.todayNote');
  document.getElementById('todayCount').textContent = fmt(words.length);
  document.getElementById('todayCountLbl').textContent = useSession && splits
    ? window.i18n.t('today.collectedSession')
    : window.i18n.t('today.collected');

  // The streak survives an empty today on purpose (see streaks()) — the day isn't over. Showing it
  // here is the point of the page on a slow day: the run is still alive, and that is what gets
  // someone to snip one more thing before bed.
  const run = streaks(days).cur;
  const streakEl = document.getElementById('todayStreak');
  streakEl.hidden = run < 2;
  document.getElementById('todayStreakN').textContent = fmt(run);
  document.getElementById('todayStreakLbl').textContent = window.i18n.t('today.streak');

  // The pool the picker works over is whatever scope is on screen — switching scope while picking
  // would otherwise leave ticks on words that are no longer shown.
  pickPool = words;
  // Nothing left to pick from (the scope emptied, or the words were deleted) — drop out rather than
  // keep a toolbar alive over the faded "last time you collected" cards, which are not selectable.
  if (!words.length) { picking = false; picked = new Set(); }
  if (picking) {
    // Ticks for words that fell out of the current scope are dropped, not carried invisibly: a
    // count of 12 over 8 visible cards is the kind of number nobody can check.
    const inScope = new Set(words.map((v) => wordKey(getWord(v))));
    picked = new Set([...picked].filter((k) => inScope.has(k)));
  }
  document.getElementById('pickBar').hidden = !words.length;
  document.getElementById('pickToggle').hidden = picking;
  document.getElementById('pickTools').hidden = !picking;
  paintPickTools();

  if (words.length) {
    empty.hidden = true;
    foot.hidden = false;
    paintCards(list, words, false, picking);
    const row = days[dayKeyOf(new Date())] || {};
    // Under the session scope the day-wide capture rows would be describing a different set of words
    // than the count above them. Say how long the sitting ran instead — the one fact about a session
    // that the day never had.
    setRows(document.getElementById('todayRows'), useSession && splits
      ? sessionRows(sess)
      : [
        [fmt(row.c || 0), ' ' + window.i18n.t('ins.capturesToday')],
        [fmt(row.w || 0), ' ' + window.i18n.t('ins.wordsToday')],
      ]);
    // The button offers Usage only when today's words actually carry a sentence to blank out; with
    // none, offering it opens a mode that has nothing to show (renderUsageEmpty covers the rest).
    const usable = words.filter(isClozeable).length;
    const cta = document.getElementById('todayCta');
    // While picking, this button would start a DIFFERENT review than the one the toolbar is
    // building — two start buttons on one screen, disagreeing about what gets reviewed.
    cta.hidden = picking;
    cta.dataset.mode = usable ? 'usage' : 'study';
    cta.textContent = usable
      ? `▶ ${window.i18n.t('rv.usage')} ${usable}`
      : `▶ ${window.i18n.t('tab.review')} ${words.length}`;
    return;
  }

  // Empty day. Show the last day that WASN'T, faded — a real reward greyed out reads as "you've had
  // this before, go get it again"; a blank panel reads as a broken feature.
  foot.hidden = true;
  empty.hidden = false;
  const prev = savedVocab.filter((v) => v.ts).sort((a, b) => b.ts - a.ts);
  const lastDay = prev.length ? startOfDayMs(prev[0].ts) : 0;
  const lastWords = prev.filter((v) => startOfDayMs(v.ts) === lastDay);
  paintCards(list, lastWords, true);
  document.getElementById('todayEmptyLine').textContent = lastWords.length
    ? `${window.i18n.t('today.lastTime')} · ${dayLabel(lastDay)} · +${fmt(lastWords.length)}`
    : window.i18n.t('today.none');
}

document.getElementById('todayCta').addEventListener('click', (e) => {
  // Under the session scope the button says a session-sized number, so it has to hand over exactly
  // those words. 'today' would quietly review a bigger pile than the one it counted.
  const sess = todayScope === 'session' ? liveSession() : null;
  queueFilter = sess && sess.words.length !== savedVocab.filter(isToday).length
    ? new Set(sess.words.map((v) => wordKey(getWord(v))))
    : 'today';
  reviewMode = e.currentTarget.dataset.mode === 'usage' ? 'usage' : 'study';
  switchTab('review');
});

// ---------- The picker toolbar ----------
function paintPickTools() {
  if (!picking) return;
  const n = picked.size;
  document.getElementById('pickCount').textContent = `${fmt(n)}/${fmt(pickPool.length)}`;
  const go = document.getElementById('pickGo');
  go.disabled = n === 0;
  go.textContent = `▶ ${window.i18n.t('pick.start')} ${fmt(n)}`;
}
function startPicking() {
  picking = true;
  // Everything ticked to begin with. The list is what you just collected, so "all of it" is the
  // answer most of the time — starting from none would make the common case the most work.
  picked = new Set(pickPool.map((v) => wordKey(getWord(v))));
  renderToday();
}
function stopPicking() {
  picking = false;
  picked = new Set();
  renderToday();
}
document.getElementById('pickToggle')?.addEventListener('click', startPicking);
document.getElementById('pickCancel')?.addEventListener('click', stopPicking);
document.getElementById('pickAll')?.addEventListener('click', () => {
  picked = new Set(pickPool.map((v) => wordKey(getWord(v))));
  renderToday();
});
document.getElementById('pickNone')?.addEventListener('click', () => {
  picked = new Set();
  renderToday();
});
document.getElementById('pickGo')?.addEventListener('click', () => {
  if (!picked.size) return;
  openStartSheet(pickPool.filter((v) => picked.has(wordKey(getWord(v)))));
});

// ---------- The launcher sheet ----------
// Held here rather than read off the DOM so the chosen mode survives a re-render of the mode row
// (which happens every time the sheet opens with a different Usage count).
let sheetWords = [];
// A SET, not one mode: the sitting is a run of stages in STAGE_ORDER, and ticking two of them is the
// whole point — meet the words, then be made to produce them. One ticked stage still works and just
// runs as an ordinary review.
let sheetStages = new Set();
function stageCount(id) {
  if (id === 'usage') return sheetWords.filter(isClozeable).length;
  if (id === 'recall') return sheetWords.filter(isRecallable).length;
  return sheetWords.length;
}
function openStartSheet(words) {
  sheetWords = words;
  // Default plan: learn them, then be asked to produce them. Recall is dropped when no word in the
  // selection carries a sentence, rather than starting the user on a stage that cannot run.
  sheetStages = new Set(['study']);
  if (words.filter(isRecallable).length) sheetStages.add('recall');
  document.getElementById('startH').textContent =
    window.i18n.t('pick.sheetHead').replace('{n}', fmt(words.length));
  paintSheetStages();
  document.getElementById('startVeil').hidden = false;
  document.getElementById('startGo').focus();
}
// Minutes are per STAGE, not per word: a ten-word sitting run through two stages is twenty cards.
const STAGE_MIN_PER_WORD = 0.35;
function paintSheetStages() {
  const box = document.getElementById('startModes');
  box.textContent = '';
  // Each stage carries its own count, because two of them cannot always take the whole selection —
  // Usage and Recall both need a sentence the word can be cut out of.
  STAGE_ORDER.forEach((id) => {
    const n = stageCount(id);
    const on = sheetStages.has(id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sheet-mode' + (on ? ' on' : '');
    b.disabled = !n;
    const tick = document.createElement('span');
    tick.className = 'sheet-tick';
    tick.textContent = on ? '✓' : '';
    b.appendChild(tick);
    b.appendChild(document.createTextNode(window.i18n.t(STAGE_KEY[id])));
    // Say it on the stage that changes, not in a banner: with a key, Recall asks its questions in
    // sentences nobody has read yet, which is a different exercise from the same stage without one.
    if (id === 'recall' && (planFlags.hasOwnKey || planFlags.hasLicence)) {
      const ai = document.createElement('em');
      ai.className = 'sheet-ai';
      ai.textContent = '✦ ' + window.i18n.t('rv.recallFresh');
      b.appendChild(ai);
    }
    const c = document.createElement('i');
    c.textContent = fmt(n);
    b.appendChild(c);
    b.addEventListener('click', () => {
      if (sheetStages.has(id)) sheetStages.delete(id); else sheetStages.add(id);
      paintSheetStages();
    });
    box.appendChild(b);
  });
  const stages = STAGE_ORDER.filter((id) => sheetStages.has(id) && stageCount(id));
  const cards = stages.reduce((a, id) => a + stageCount(id), 0);
  document.getElementById('startSub').textContent = stages.length
    ? window.i18n.t('pick.sheetPlan')
      .replace('{s}', String(stages.length))
      .replace('{m}', fmt(Math.max(1, Math.round(cards * STAGE_MIN_PER_WORD))))
    : window.i18n.t('pick.sheetNoStage');
  const go = document.getElementById('startGo');
  go.disabled = !stages.length;
  go.textContent = window.i18n.t('pick.sheetGo');
}
function closeStartSheet() { document.getElementById('startVeil').hidden = true; }
document.getElementById('startCancel')?.addEventListener('click', closeStartSheet);
// Clicking the dark area behind the sheet dismisses it; clicking the sheet itself must not.
document.getElementById('startVeil')?.addEventListener('click', (e) => {
  if (e.target.id === 'startVeil') closeStartSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('startVeil').hidden) { e.stopPropagation(); closeStartSheet(); }
}, true);
document.getElementById('startGo')?.addEventListener('click', () => {
  const stages = STAGE_ORDER.filter((id) => sheetStages.has(id) && stageCount(id));
  if (!stages.length) return;
  queueFilter = new Set(sheetWords.map((v) => wordKey(getWord(v))));
  plan = stages;
  planIdx = 0;
  reviewMode = stages[0];
  forcedMode = stages[0];
  closeStartSheet();
  // Leave picking mode BEFORE switching tab: coming back to Today afterwards should be the ordinary
  // page, not a toolbar still holding a selection that has already been handed over.
  picking = false;
  picked = new Set();
  switchTab('review');
});

document.getElementById('todayScope')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.scope-btn');
  if (!btn || btn.dataset.scope === todayScope) return;
  todayScope = btn.dataset.scope;
  renderToday();
});

// ---------- The year, from the months ledger ----------
// null = whatever year it is now, resolved on first paint so the card follows the clock across a new
// year without anyone having to reopen the window.
let yrYear = null;
// Month labels come out of the locale, like the calendar's weekday row — a hard-coded JAN FEB under
// a Thai UI is the same silent lie that row was fixed for.
function monthLabels() {
  return [...Array(12)].map((_, m) => new Date(2024, m, 1).toLocaleDateString(undefined, { month: 'short' }));
}
function renderYear() {
  const card = document.getElementById('insYearCard');
  const el = document.getElementById('insYear');
  if (!card || !el) return;
  const months = (insStats && insStats.months) || {};
  const keys = Object.keys(months).filter((k) => months[k] > 0);
  // Nothing has ever been collected — a row of twelve empty columns is furniture, not information.
  if (!keys.length) { card.hidden = true; return; }
  card.hidden = false;

  const now = new Date();
  if (yrYear == null) yrYear = now.getFullYear();
  const vals = [...Array(12)].map((_, m) => months[`${yrYear}-${String(m + 1).padStart(2, '0')}`] || 0);
  const total = vals.reduce((a, n) => a + n, 0);
  // Scale to this year's own best month, not to a lifetime maximum: the point of the shape is which
  // month of THIS year was the big one, and a single huge month years ago would flatten every column.
  const peak = Math.max(...vals, 1);
  const labels = monthLabels();

  document.getElementById('insYearHead').textContent =
    window.i18n.t('yr.head').replace('{y}', String(yrYear));
  const best = vals.indexOf(Math.max(...vals));
  document.getElementById('insYearNote').textContent = total
    ? `${window.i18n.t('yr.best')} ${labels[best].toUpperCase()} · ${fmt(vals[best])}`
    : '';
  // Two counts, and they answer different questions: the ledger says how many words this year GAVE
  // you, the list says how many of them you still have. They are equal until something is deleted or
  // refused at the cap, and the moment they are not, saying so is the fix — a lone "13" beside a
  // Calendar that adds up to 12 reads as a broken counter, while "13 collected · 12 still in your
  // list" reads as what actually happened. Silent when equal: a difference of nothing is not news.
  const keptThisYear = savedVocab.filter((v) => v.ts && new Date(v.ts).getFullYear() === yrYear).length;
  document.getElementById('insYearTotal').textContent = !total
    ? window.i18n.t('yr.none')
    : keptThisYear === total
      ? `${fmt(total)} ${window.i18n.t('yr.collected')}`
      : `${fmt(total)} ${window.i18n.t('yr.collectedShort')} · ${fmt(keptThisYear)} ${window.i18n.t('yr.kept')}`;

  el.textContent = '';
  vals.forEach((n, m) => {
    const col = document.createElement('div');
    col.className = 'yr-col' + (n ? '' : ' empty')
      + (yrYear === now.getFullYear() && m === now.getMonth() ? ' now' : '');
    const num = document.createElement('div');
    num.className = 'yr-n';
    num.textContent = n ? fmt(n) : '';
    const track = document.createElement('div');
    track.className = 'yr-track';
    const fill = document.createElement('div');
    fill.className = 'yr-fill';
    // A flat 3px for an empty month, not a percentage: it has to read as a baseline the bars stand
    // on, so twelve columns look like a year with quiet months rather than two bars floating in a
    // box. A percentage of a 120px track rounds down to something you cannot see.
    fill.style.height = n ? Math.max(6, Math.round((n / peak) * 100)) + '%' : '3px';
    track.appendChild(fill);
    const lbl = document.createElement('div');
    lbl.className = 'yr-m';
    lbl.textContent = labels[m];
    col.appendChild(num); col.appendChild(track); col.appendChild(lbl);
    // Per month, the same two counts — so hovering a bar that disagrees with the Calendar's header
    // for that month explains the gap instead of deepening it.
    const keptM = savedVocab.filter((v) => {
      const d = v.ts && new Date(v.ts);
      return d && d.getFullYear() === yrYear && d.getMonth() === m;
    }).length;
    col.title = `${labels[m]} ${yrYear} — ` + (!n
      ? window.i18n.t('cal.none')
      : keptM === n
        ? `${fmt(n)} ${window.i18n.t('yr.collectedShort')}`
        : `${fmt(n)} ${window.i18n.t('yr.collectedShort')} · ${fmt(keptM)} ${window.i18n.t('yr.kept')}`);
    el.appendChild(col);
  });

  // Only offer the years the ledger can actually answer for. Stepping into a blank year reads as a
  // bug in the counter rather than as "you weren't here yet".
  const years = keys.map((k) => Number(k.slice(0, 4))).filter((y) => y);
  document.getElementById('insYearPrev').disabled = yrYear <= Math.min(...years);
  document.getElementById('insYearNext').disabled = yrYear >= Math.max(...years, now.getFullYear());
}
// yrYear is null until the first paint; stepping from null would make it NaN and blank the card.
function yrShift(n) { if (yrYear == null) return; yrYear += n; renderYear(); }
document.getElementById('insYearPrev')?.addEventListener('click', () => yrShift(-1));
document.getElementById('insYearNext')?.addEventListener('click', () => yrShift(1));

function renderInsights() {
  if (!insStats) return; // stats:get hasn't landed yet; its .then re-renders
  const days = insStats.days || {};
  const keys = Object.keys(days);
  const total = keys.reduce((a, k) => {
    const d = days[k];
    a.caps += d.c || 0; a.words += d.w || 0; a.chars += d.ch || 0;
    a.snip += d.s || 0; a.typed += d.t || 0; a.live += d.l || 0; a.spoken += d.m || 0;
    return a;
  }, { caps: 0, words: 0, chars: 0, snip: 0, typed: 0, live: 0, spoken: 0 });
  const played = keys.filter((k) => days[k].c).length;

  const nothingYet = !total.caps && !savedVocab.length;
  insEmpty.hidden = !nothingYet;
  insBody.hidden = nothingYet;
  if (nothingYet) return;

  // (Today lives on its own tab now — Insights is the all-time view.)

  // — words read + what script they were in
  document.getElementById('insWords').textContent = fmt(total.words);
  const scripts = Object.entries(insStats.scripts || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  setRows(
    document.getElementById('insScripts'),
    scripts.length
      ? scripts.map(([k, v]) => [fmt(v), ` ${scriptName(k)} ${window.i18n.t('ins.chars')}`])
      : [[fmt(total.chars), ' ' + window.i18n.t('ins.chars')]]
  );

  // — collected vs recognised (the arc)
  const savedN = savedVocab.length;
  const known = savedVocab.filter((v) => getSeen(v) >= getGradSeen()).length;
  const pct = savedN ? Math.round((known / savedN) * 100) : 0;
  document.getElementById('insSaved').textContent = fmt(savedN);
  document.getElementById('insKnownPct').textContent = pct + '%';
  document.getElementById('gaugeFill').style.strokeDashoffset = String(157.08 * (1 - pct / 100));
  document.getElementById('insKnownSub').textContent = savedN
    ? window.i18n.t('ins.knownSub')
      .replace('{known}', fmt(known)).replace('{saved}', fmt(savedN)).replace('{n}', String(getGradSeen()))
    : window.i18n.t('ins.startCollecting');

  // — pace, and the one action worth pushing: what's due
  const week = [...Array(7)].reduce((a, _, i) => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - i);
    const row = days[dayKeyOf(d)];
    return a + ((row && row.w) || 0);
  }, 0);
  document.getElementById('insDays').textContent = fmt(played);
  setRows(document.getElementById('insPace'), [
    [fmt(total.caps), ' ' + window.i18n.t('ins.captures')],
    [fmt(played ? Math.round(total.words / played) : 0), ' ' + window.i18n.t('ins.avgDay')],
    [fmt(week), ' ' + window.i18n.t('ins.thisWeek')],
  ]);
  const due = savedVocab.filter(isDue).length;
  const cta = document.getElementById('insCta');
  cta.disabled = due === 0;
  cta.textContent = due ? `▶ ${window.i18n.t('tab.review')} ${due}` : window.i18n.t('ins.nothingDue');

  // — how you capture
  document.getElementById('insCapTotal').textContent = `${fmt(total.caps)} ${window.i18n.t('ins.capturesCap')}`;
  const bars = document.getElementById('insBars');
  bars.innerHTML = '';
  const srcs = [
    [window.i18n.t('ins.srcSnips'), total.snip],
    [window.i18n.t('ins.srcTyped'), total.typed],
    // Its own row rather than folded into "typed": days recorded before `m` existed have no key and
    // read 0, so an empty row here means "you have never dictated", which is true and worth seeing.
    [window.i18n.t('ins.srcSpoken'), total.spoken],
    [window.i18n.t('ins.srcLive'), total.live],
  ];
  srcs.forEach(([name, n]) => {
    const p = total.caps ? Math.round((n / total.caps) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    const pctEl = document.createElement('div');
    pctEl.className = 'bar-pct';
    pctEl.textContent = p + '%';
    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = (n ? Math.max(p, 2) : 0) + '%';
    track.appendChild(fill);
    const text = document.createElement('div');
    text.className = 'bar-text';
    text.textContent = `${fmt(n)} ${name}`;
    row.appendChild(pctEl); row.appendChild(track); row.appendChild(text);
    bars.appendChild(row);
  });

  // — the year
  renderYear();

  // — streak
  const { cur, best } = streaks(days);
  document.getElementById('insStreak').textContent = window.i18n.t('ins.dayStreak').replace('{n}', fmt(cur));
  document.getElementById('insStreakBest').textContent = `${window.i18n.t('ins.streakBest')} | ${fmt(best)}`;
  renderHeat(days);

  // — words the game keeps throwing at you
  const topCard = document.getElementById('insTopCard');
  const top = savedVocab.filter((v) => getSeen(v) >= 2).sort((a, b) => getSeen(b) - getSeen(a)).slice(0, 6);
  topCard.hidden = top.length === 0;
  const topEl = document.getElementById('insTop');
  topEl.innerHTML = '';
  top.forEach((v) => {
    const row = document.createElement('div');
    row.className = 'top-row';
    const w = document.createElement('div'); w.className = 'tw'; w.textContent = getWord(v);
    const m = document.createElement('div'); m.className = 'tm'; m.textContent = getMeaning(v);
    const badge = document.createElement('span'); badge.className = 'seen-badge'; badge.textContent = '×' + getSeen(v);
    row.appendChild(w); row.appendChild(m); row.appendChild(badge);
    topEl.appendChild(row);
  });
}

document.getElementById('insCta').addEventListener('click', () => { enterReviewFresh(); switchTab('review'); });

// ---------- Settings tab ----------
// Study settings only, written straight to the same settings.json the pill uses (settings:set), so the
// pill's ✓ known badge and this window's can never disagree about the threshold.
const setGrad = document.getElementById('setGrad');
const setGradNote = document.getElementById('setGradNote');
const setCap = document.getElementById('setCap');
const setReverse = document.getElementById('setReverse');
const setTest = document.getElementById('setTest');
const setSpeak = document.getElementById('setSpeak');
const setSort = document.getElementById('setSort');
const setHist = document.getElementById('setHist');

// `‹ value ›` instead of a native <select> — same control the pill's Settings uses, and for the same
// reason: Windows draws a <select>'s OPEN popup itself as an un-stylable grey list. The <select> stays
// as the value + change source (just not shown), so the listener below and renderSettings are unchanged
// apart from calling the sync. Mirrors the chosen option's data-i18n key so applyI18n keeps translating
// the visible value on a language switch. (jek, 2026-07-31)
function enhanceStepper(sel) {
  if (!sel || sel._cddSync) return;
  const wrap = document.createElement('span'); wrap.className = 'set-stepper';
  const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'set-stepper__arrow'; prev.textContent = '‹';
  const next = document.createElement('button'); next.type = 'button'; next.className = 'set-stepper__arrow'; next.textContent = '›';
  prev.setAttribute('aria-label', 'Previous'); next.setAttribute('aria-label', 'Next');
  const val = document.createElement('span'); val.className = 'set-stepper__val';
  wrap.append(prev, val, next);
  sel.style.display = 'none';
  sel.setAttribute('aria-hidden', 'true');
  sel.after(wrap);
  const sync = () => {
    const o = sel.options[sel.selectedIndex] || sel.options[0];
    if (!o) return;
    val.textContent = o.textContent;
    if (o.dataset.i18n) val.dataset.i18n = o.dataset.i18n; else val.removeAttribute('data-i18n');
  };
  const step = (dir) => {
    const n = sel.options.length;
    if (!n) return;
    sel.selectedIndex = (sel.selectedIndex + dir + n) % n; // wraps
    sync();
    sel.dispatchEvent(new Event('change'));
  };
  // The row is a <label>, so a click inside it would also toggle/forward to the control — stop it here.
  prev.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); step(-1); });
  next.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); step(1); });
  sel._cddSync = sync; sync();
}
enhanceStepper(setSort);

// Live copies the rest of the window reads (Review start-up, the Collected order, the history cap).
let study = { gradSeen: 5, reviewCap: 20, reverseDefault: false, testDefault: false, speakOnFlip: false, vocabSortDefault: 'new', maxHistory: 2000 };

function applyStudySettings(s) {
  if (!s) return;
  // Follow the pill's UI language. setLang returns true only on a real change, so a re-render of every
  // JS-built string (badges, counts, card chrome) happens once, not on every settings broadcast.
  const langChanged = window.i18n.setLang(s.uiLang || 'auto');
  // Read-only: this window follows the pill's setting, it does not own it. Showing the resolved
  // value (not just "Auto") is the point — "Auto" alone does not tell you what you are looking at.
  const roKey = { en: 'st.langEn', th: 'st.langTh' }[s.uiLang];
  setLangRO.textContent = roKey
    ? window.i18n.t(roKey)
    : `${window.i18n.t('st.langAuto')} · ${window.i18n.t(window.i18n.lang === 'th' ? 'st.langTh' : 'st.langEn')}`;
  setLangRO.title = window.i18n.t('st.langWhere');
  study = {
    gradSeen: Number(s.gradSeen) || 5,
    reviewCap: Number(s.reviewCap) || 0,
    reverseDefault: !!s.reverseDefault,
    testDefault: !!s.testDefault,
    speakOnFlip: !!s.speakOnFlip,
    vocabSortDefault: s.vocabSortDefault || 'new',
    maxHistory: Number(s.maxHistory) || 2000,
  };
  setGradSeen(study.gradSeen); // the shared model — every badge and count in both windows follows this
  vocabSort = study.vocabSortDefault;
  document.querySelectorAll('.sort-btn').forEach((b) => b.classList.toggle('on', b.dataset.sort === vocabSort));
  if (langChanged) {
    if (!panels.words.hidden) renderWords();
    if (!panels.review.hidden && !reviewView.hidden) renderCurrent();
    if (!panels.plan.hidden) renderPlan();
    if (!panels.settings.hidden) renderSettings();
    // The heading is a copy of the tab's label taken when the tab was opened, so applyI18n retitles
    // the rail underneath it and leaves the heading in the old language: a Thai rail reading
    // "ตั้งค่า" beside an English "Settings". Take the copy again.
    setPageTitle();
    applyRailLock();
    if (!panels.calendar.hidden) renderCalendar();
    if (!panels.today.hidden) renderToday();
    document.title = 'Gloss — ' + window.i18n.t('tab.review');
  }
  if (!panels.words.hidden && wordSeg === 'vocab') renderVocab();
  if (!panels.insights.hidden) renderInsights();
  updateHdrStat();
}

function renderSettings() {
  setGrad.value = study.gradSeen;
  setCap.value = study.reviewCap;
  setReverse.checked = study.reverseDefault;
  setTest.checked = study.testDefault;
  setSpeak.checked = study.speakOnFlip;
  setSort.value = study.vocabSortDefault; setSort._cddSync?.(); // the <select> is hidden — refresh the stepper's label
  setHist.value = study.maxHistory;
  const known = savedVocab.filter((v) => getSeen(v) >= study.gradSeen).length;
  setGradNote.textContent = window.i18n.t('st.gradNote').replace('{a}', known).replace('{b}', savedVocab.length);
}

// Every control writes on change and re-reads what main gives back, so the field can never claim a
// value the app didn't accept. Each edit clamps here AND main clamps in settings:set — the store must
// not trust a renderer, and this must not trust the store.
async function saveStudy(patch) {
  const s = await window.learnApi.settingsSet(patch);
  applyStudySettings(s);
  renderSettings();
}
setGrad.addEventListener('change', () => saveStudy({ gradSeen: Math.max(2, Math.min(50, Number(setGrad.value) || 5)) }));
setCap.addEventListener('change', () => saveStudy({ reviewCap: Math.max(0, Math.min(200, Number(setCap.value) || 0)) }));
setHist.addEventListener('change', () => saveStudy({ maxHistory: Math.max(20, Math.min(2000, Number(setHist.value) || 300)) }));
setReverse.addEventListener('change', () => saveStudy({ reverseDefault: setReverse.checked }));
setTest.addEventListener('change', () => saveStudy({ testDefault: setTest.checked }));
setSpeak.addEventListener('change', () => saveStudy({ speakOnFlip: setSpeak.checked }));
setSort.addEventListener('change', () => saveStudy({ vocabSortDefault: setSort.value }));

// ---------- Plan tab ----------
// Reads the same settings the pill's Settings page does; hasKey is the only plan signal that exists
// (there is no subscription), so the page says exactly that instead of inventing a tier.
const planName = document.getElementById('planName');
const planNote = document.getElementById('planNote');
const freeBadge = document.getElementById('freeBadge');
const proBadge = document.getElementById('proBadge');
const planKey = document.getElementById('planKey');
const planKeySave = document.getElementById('planKeySave');
const planQuota = document.getElementById('planQuota');
const planBuy = document.getElementById('planBuy');
let buyUrl = '';   // from the settings snapshot, same source the pill's button reads
planBuy.addEventListener('click', () => { if (buyUrl) window.api.openUrl(buyUrl); });
// Mirror of QUOTA_LOW_AT in renderer/main/index.js — two windows, two bundles, one rule. Kept in
// sync by hand because the pill and Learn share no module; change both or neither.
// The floor matters as much as the fraction: a 10-read trial's last tenth is ONE read, which is a
// warning that arrives too late to act on. Whichever is larger wins, so a 500-read purchase stays
// silent until 50 left and a 10-read trial says something at 3.
const QUOTA_LOW_AT = 0.1;
const QUOTA_LOW_FLOOR = 3;
function quotaLow(q) {
  if (!(q.limit > 0)) return false;
  return (q.limit - q.used) <= Math.max(QUOTA_LOW_FLOOR, Math.ceil(q.limit * QUOTA_LOW_AT));
}
let planFlags = { hasOwnKey: false, hasLicence: false, quota: null };

function renderPlan() {
  // hasKey is NOT the question this page asks. Since the proxy landed it means "an AI call is worth
  // attempting", which is true for everybody — so reading it here told every free user they were on
  // PRO with a key saved, before they had typed anything. Pro is a licence or a key of one's own.
  const isPro = planFlags.hasOwnKey || planFlags.hasLicence;
  planName.textContent = isPro ? 'PRO' : window.i18n.t('pl.free').toUpperCase();
  planNote.textContent = window.i18n.t(planFlags.hasOwnKey ? 'pl.proNote' : isPro ? 'pl.licNote' : 'pl.freeNote');
  freeBadge.textContent = isPro ? '' : window.i18n.t('pl.current');
  proBadge.textContent = isPro ? window.i18n.t('pl.active') : '';
  planKey.placeholder = planFlags.hasOwnKey ? window.i18n.t('pl.keySaved') : 'sk-ant-…';
  planBuy.hidden = isPro || !buyUrl;

  // Only for people spending the shared allowance: an own key has no ceiling, and a fresh install has
  // no count yet (it arrives on the headers of the first proxied call), so "0 of 10" would be a
  // number about nothing.
  const q = planFlags.quota;
  if (planFlags.hasOwnKey || !q || !q.limit) { planQuota.hidden = true; return; }
  const out = q.used >= q.limit;
  // Silent until the last tenth — same rule, same threshold as renderer/main/index.js. See the note
  // on QUOTA_LOW_AT there for why a always-visible counter breaks a one-time purchase.
  if (!out && !quotaLow(q)) { planQuota.hidden = true; return; }
  planQuota.textContent = window.i18n.t(out ? 'quota.out' : q.plan === 'pro' ? 'quota.pro' : 'quota.free')
    .replace('{used}', String(q.used))
    .replace('{left}', String(Math.max(0, q.limit - q.used)))
    .replace('{limit}', String(q.limit));
  planQuota.classList.toggle('out', out);
  planQuota.hidden = false;
}

// The key goes straight to main's settings store (the renderer never keeps it) — same channel as the
// pill's field, and settings:changed then updates BOTH windows, including the pill's PRO tag.
planKeySave.addEventListener('click', async () => {
  const key = planKey.value.trim();
  if (!key) return;
  planKeySave.disabled = true;
  try {
    const s = await window.learnApi.settingsSet({ apiKey: key });
    planFlags = { hasOwnKey: !!(s && s.hasOwnKey), hasLicence: !!(s && s.hasLicence), quota: (s && s.quota) || null };
  buyUrl = (s && s.buyUrl) || buyUrl;
    planKey.value = '';
    renderPlan();
  } finally {
    planKeySave.disabled = false;
  }
});
// Delegated, NOT a direct handler on #planKeyLink: that link lives inside a localized paragraph, so
// applyI18n replaces the element every time the language changes — and at boot the paragraph is empty
// until the dictionary fills it. Binding it directly threw on load and killed everything after it,
// including the settings load (which is why the window kept booting English, 2026-07-30).
document.getElementById('planKeyMsg').addEventListener('click', (e) => {
  const link = e.target.closest('#planKeyLink');
  if (!link) return;
  e.preventDefault();
  window.learnApi.openUrl('https://console.anthropic.com/settings/keys');
});

window.learnApi.settingsGet().then((s) => {
  planFlags = { hasOwnKey: !!(s && s.hasOwnKey), hasLicence: !!(s && s.hasLicence), quota: (s && s.quota) || null };
  buyUrl = (s && s.buyUrl) || buyUrl;
  applyStudySettings(s); // without this the whole Settings tab was decoration: it saved, then never loaded
  renderPlan();
  if (!panels.settings.hidden) renderSettings();
});
window.learnApi.onSettings((s) => {
  planFlags = { hasOwnKey: !!(s && s.hasOwnKey), hasLicence: !!(s && s.hasLicence), quota: (s && s.quota) || null };
  buyUrl = (s && s.buyUrl) || buyUrl;
  applyStudySettings(s);
  renderPlan();
  if (!panels.settings.hidden) renderSettings();
});

window.learnApi.statsGet().then((s) => {
  insStats = s && typeof s === 'object' ? s : { days: {}, scripts: {} };
  if (!panels.insights.hidden) renderInsights();
  // Today is the DEFAULT tab, so it paints once before stats have landed — with no captures row and
  // no streak. This is the re-render that fills those in, and without it the landing page is wrong
  // for the first few hundred ms of every launch.
  if (!panels.today.hidden) renderToday();
});

window.i18n.applyI18n();
applyRailLock();   // after applyI18n: its title comes out of the dictionary
switchTab('today');
