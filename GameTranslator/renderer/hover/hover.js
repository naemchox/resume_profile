// Draws the highlight + bubble for whatever word main says the cursor is on. No logic beyond
// layout — the OCR, the hit-test and the dictionary all live in the main process, and this file
// only ever receives a finished answer.

const mark = document.getElementById('mark');
const bubble = document.getElementById('bubble');
const termEl = document.getElementById('term');
const glossEl = document.getElementById('gloss');
const tailEl = document.getElementById('tail');
const sensesEl = document.getElementById('senses');
const keepEl = document.getElementById('keep');

const GAP = 14;      // space between the word and the bubble
const MARGIN = 12;   // keep the bubble this far off the screen edges

// The rect of the word on screen, kept because the translated line can arrive AFTER the bubble is
// already placed and the box has to be measured again around it.
let lastRect = null;

// ONE line, in the reader's own language, and the word it belongs to underneath — the same two lines
// the snip Translation Bar shows, in the same order (showPreviewResult in ../snip/snip.js). This used
// to be a dictionary page: up to three senses with their parts of speech, a chip explaining which
// inflection rule matched, and two more entries that share the spelling — 760px wide, floating over
// the game you were trying to play (jek, 2026-08-09: "มันดูใหญ่มาก แล้วก็รู้สึกว่ามันให้ข้อมูลเยอะเกินไป"). It
// then grew back, one switch at a time, until pointing at `more` answered with a three-line English
// definition while pointing at `language` answered with one Thai word (jek, 2026-08-13).
//
// So the switches went where the reading happens: Learn › Settings › Advanced turns the full
// dictionary on for the Review card and the word list, and this window no longer reads them at all.
// What it is FOR is the glance — you don't know that word, now you do, keep going — and a glance has
// exactly one answer in it.
function render(payload) {
  const { rect, matched, gloss, pos, saved, pending, senses } = payload;
  const text = (gloss || '').trim();
  // A word with no dictionary entry is allowed here — the translated line IS its answer (main only
  // sends one once it has that line). What is never allowed is a bubble with nothing in it, and
  // `pending` is not nothing: it is a word we have, whose meaning is a few hundred ms out.
  if (!rect || !(text || pending)) return hide();
  lastRect = rect;

  // Set BEFORE the text below, not after: place() measures the bubble, and a star that appears once
  // the position is already decided widens it by 14px against a box that was measured without it.
  keepEl.hidden = !saved;
  keepEl.classList.remove('pop');

  setGloss(text, pos, !text && pending);
  setSenses(senses);
  // The word as WRITTEN on screen, not the dictionary headword: the user is looking at 食べられた
  // and needs to see that this entry is about the thing they're pointing at.
  termEl.textContent = matched || '';

  place(rect);
}

// The meaning, then its chip — the snip bar's order, because they are the same card. The kind of word
// gets a MARK, not a word of its own: spelled out ("Adjective") it reads as part of the meaning and
// has to be parsed before you can skip it; as a coloured two-character chip it is recognised without
// being read, which is the only way a label earns space in something you glance at mid-game
// (jek, 2026-08-09, with the shape drawn out). The chip comes from shared/pos-badge.js — the same one
// the card, the Type peek and both word lists use.
// `waiting` is the few hundred ms before the translator answers for a word the dictionary could only
// define in English. A MARK, not a sentence: "Translating…" is a line of English sitting over the
// game — the exact thing being waited out — and this window has no language of its own to write it in
// (it is fed finished text, see preload-hover.js). Dressed down like the snip bar's status so it
// cannot be misread as the answer itself.
function setGloss(text, pos, waiting) {
  glossEl.textContent = waiting ? '···' : (text || '');
  glossEl.classList.toggle('waiting', !!waiting);
  // No chip beside a meaning that isn't there yet — it would land, then the meaning would land beside
  // it, and the bubble would have changed shape twice for one word.
  const badge = !waiting && pos ? posBadgeEl(pos) : null;
  if (!badge) return;
  glossEl.appendChild(document.createTextNode(' '));
  glossEl.appendChild(badge);
}

// The other word classes, from the same helper the card and the Type bar use, with the same
// skipFirst rule: the gloss line above already wears the primary chip, so repeating it here would
// print the same tag twice a line apart. fillSenseChips is silent below two senses on its own, so a
// one-sense word never grows a row — main simply sends an empty list when the setting is off.
function setSenses(senses) {
  const has = fillSenseChips(sensesEl, senses, undefined, true);
  sensesEl.hidden = !has;
}

// POS_NAMES/prettyPos were deleted with the line they fed. Spelling a tag out ("Godan verb",
// "Usually kana") belongs where someone is studying the word, not in a chip you glance at.

// Above the word by default, flipped below when there's no room, and slid sideways to stay on
// screen — with the tail staying put over the word through all of it.
function place(rect) {
  bubble.hidden = false;
  bubble.classList.remove('below');
  // Measure with the bubble on screen but before it's positioned; it's already laid out by now
  // because textContent was set synchronously above.
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const below = rect.y - GAP - bh < MARGIN;
  const top = below ? Math.min(rect.y + rect.height + GAP, vh - bh - MARGIN)
                    : Math.max(MARGIN, rect.y - GAP - bh);
  bubble.classList.toggle('below', below);

  const wantLeft = rect.x + rect.width / 2 - bw / 2;
  const left = Math.max(MARGIN, Math.min(wantLeft, vw - bw - MARGIN));

  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top = `${Math.round(top)}px`;

  // Tail x is relative to the bubble, so it tracks the word even after the clamp above moved the
  // bubble away from centre. Kept a corner-radius away from either end so it can't sprout from the
  // rounded edge.
  const tailX = Math.max(18, Math.min(rect.x + rect.width / 2 - left - 15, bw - 48));
  tailEl.style.left = `${Math.round(tailX)}px`;

  mark.hidden = false;
  mark.style.left = `${Math.round(rect.x) - 2}px`;
  mark.style.top = `${Math.round(rect.y) - 2}px`;
  mark.style.width = `${Math.round(rect.width) + 4}px`;
  mark.style.height = `${Math.round(rect.height) + 4}px`;
}

function hide() {
  bubble.hidden = true;
  mark.hidden = true;
}

// Just kept (or already kept — main sends both as the same thing). The star lands with one small
// pop, which is the whole confirmation: you pressed a key, something answered, keep playing.
// Deliberately does NOT re-place the bubble: the word has not moved, and a box that jumps sideways
// the instant you collect it reads as a mistake.
function markSaved() {
  if (bubble.hidden) return; // the word left the screen between the press and this — nothing to mark
  keepEl.hidden = false;
  keepEl.classList.remove('pop');
  void keepEl.offsetWidth; // restart the animation when the same word is pressed twice
  keepEl.classList.add('pop');
}

// The reader's own language, landing a few hundred ms after the dictionary's answer. It REPLACES the
// line rather than adding a second one: both say what the word means, and a bubble that says it twice
// — once in English, once in Thai — is the dictionary page this window was cut down from. It changes
// the width, so the box is placed again, unlike the star, which only ever changes what is inside it.
function showExtra(payload) {
  if (bubble.hidden || !payload || !payload.text) return;
  setGloss(payload.text, payload.pos);
  if (lastRect) place(lastRect);
}

window.api.onShow(render);
window.api.onHide(hide);
window.api.onSaved(markSaved);
window.api.onExtra(showExtra);
