// Japanese word lookup for the hover popup: given a line of OCR'd text and the character the cursor
// is over, work out where the WORD starts and ends and what it means.
//
// Two problems have to be solved before a dictionary is any use here:
//
//  1. Japanese doesn't space its words. Hovering 女 in 情報通な女子生徒たち has to find 女子生徒, not 女.
//     Solved by longest-match: try the 12 characters from the cursor, then 11, then 10… and take the
//     first one the dictionary knows.
//
//  2. Text in a game is conjugated. 食べられなかった is not in any dictionary; 食べる is. So every
//     candidate that misses is run through the deinflector, which walks it back toward a dictionary
//     form one suffix at a time and remembers the path it took ("negative ← potential ← past").
//
// The dictionary itself is built by scripts/build-dict.js. It is loaded lazily — 28MB of JSON costs
// ~320ms and ~130MB, which is fine to pay when the user first turns hover mode on and wasteful to
// pay at every app launch.
const fs = require('fs');
const path = require('path');

// One slot per source language. Both files have the identical { v, e, i } shape, so everything below
// the lookup entry points is shared; what differs is how a WORD is found in a line of text, which is
// the whole problem in Japanese and nearly free in English.
const FILES = { jpn: 'jmdict.json', eng: 'enth.json' };
const BUILD_HINT = {
  jpn: 'node scripts/build-dict.js <jmdict-eng-*.json>',
  eng: 'node scripts/build-dict-en.js <English.jsonl> <Thai.jsonl> <en_50k.txt>',
};
const DICTS = { jpn: null, eng: null };
const loadFailed = { jpn: false, eng: false };

let DICT = null;       // the dictionary the CURRENT lookup is running against
let DICT_LANG = 'jpn';

function normLang(lang) { return FILES[lang] ? lang : 'jpn'; }

function dictPath(lang) {
  // app.asar can't be read by outside processes but CAN be read by require/fs inside Electron, so
  // the plain __dirname path is correct in both dev and a packaged build.
  return path.join(__dirname, 'dict', FILES[normLang(lang)]);
}

function isLoaded(lang) { return !!DICTS[normLang(lang)]; }

function load(lang) {
  const L = normLang(lang);
  if (DICTS[L] || loadFailed[L]) { activate(L); return !!DICTS[L]; }
  const p = dictPath(L);
  try {
    DICTS[L] = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!DICTS[L] || !DICTS[L].i || !DICTS[L].e) throw new Error('malformed dictionary');
    activate(L);
    return true;
  } catch (err) {
    loadFailed[L] = true; // one failure is enough — don't re-read a 28MB file on every mouse move
    DICTS[L] = null;
    console.error('hover-dict: cannot load', p, '-', err.message, '\n  build it with:', BUILD_HINT[L]);
    return false;
  }
}

function activate(lang) {
  const L = normLang(lang);
  DICT = DICTS[L];
  DICT_LANG = L;
}

// ---------------------------------------------------------------------------
// Deinflection
// ---------------------------------------------------------------------------
// A rule is [suffix, replacement, posPrefixes, reason]. It fires when a candidate ends in `suffix`,
// and produces candidate.slice(0, -suffix.length) + replacement. `posPrefixes` is what the RESULT
// must be for the rule to have been legal — 見て only deinflects to 見る because 見る is an ichidan
// verb; without that check ANY word ending in て would produce a fake る-word, and with 464k terms
// indexed a surprising number of those fakes are real words with the wrong meaning.
//
// Rules do NOT have to reach a dictionary form in one step. ていた → て → (te-form rule) → dict form.
// The search below iterates, so each rule only has to peel off one layer.

const GODAN_STEMS = {
  // dict ending: [i-stem, a-stem, e-stem, o-stem, te-stem, voiced?]
  'う': ['い', 'わ', 'え', 'お', 'っ', false],
  'く': ['き', 'か', 'け', 'こ', 'い', false],
  'ぐ': ['ぎ', 'が', 'げ', 'ご', 'い', true],
  'す': ['し', 'さ', 'せ', 'そ', 'し', false],
  'つ': ['ち', 'た', 'て', 'と', 'っ', false],
  'ぬ': ['に', 'な', 'ね', 'の', 'ん', true],
  'ぶ': ['び', 'ば', 'べ', 'ぼ', 'ん', true],
  'む': ['み', 'ま', 'め', 'も', 'ん', true],
  'る': ['り', 'ら', 'れ', 'ろ', 'っ', false],
};

const RULES = [];
function rule(suffix, replacement, pos, reason) { RULES.push([suffix, replacement, pos, reason]); }

// --- godan verbs (v5) — generated per row rather than written out 200 times ---
for (const [end, [i, a, e, o, t, voiced]] of Object.entries(GODAN_STEMS)) {
  const V5 = ['v5'];
  const te = voiced ? 'で' : 'て';
  const ta = voiced ? 'だ' : 'た';
  rule(i + 'ます', end, V5, 'polite');
  rule(i + 'たい', end, V5, 'want to');
  rule(i + 'ながら', end, V5, 'while');
  rule(i + 'そう', end, V5, 'looks like');
  rule(i + 'にくい', end, V5, 'hard to');
  rule(i + 'やすい', end, V5, 'easy to');
  rule(a + 'ない', end, V5, 'negative');
  rule(a + 'ず', end, V5, 'without');
  rule(a + 'れる', end, V5, 'passive');
  rule(a + 'せる', end, V5, 'causative');
  rule(a + 'される', end, V5, 'causative-passive');
  rule(e + 'る', end, V5, 'potential');
  rule(e + 'ば', end, V5, 'if');
  rule(e, end, V5, 'imperative');
  rule(o + 'う', end, V5, 'volitional');
  rule(t + te, end, V5, '-te');
  rule(t + ta, end, V5, 'past');
  rule(t + ta + 'ら', end, V5, 'if/when');
  rule(t + ta + 'り', end, V5, 'listing');
  rule(t + (voiced ? 'じゃう' : 'ちゃう'), end, V5, 'ends up');
}

// --- ichidan verbs (v1): everything hangs off the bare stem ---
for (const [suffix, reason] of [
  ['ない', 'negative'], ['ます', 'polite'], ['て', '-te'], ['た', 'past'], ['たら', 'if/when'],
  ['たり', 'listing'], ['れば', 'if'], ['よう', 'volitional'], ['られる', 'passive/potential'],
  ['させる', 'causative'], ['ろ', 'imperative'], ['よ', 'imperative'], ['なさい', 'polite command'],
  ['たい', 'want to'], ['ず', 'without'], ['ちゃう', 'ends up'], ['そう', 'looks like'],
]) rule(suffix, 'る', ['v1'], reason);

// --- irregulars: する / 来る, plus the thousands of noun+する verbs that ride on them ---
for (const [suffix, repl, reason] of [
  ['します', 'する', 'polite'], ['して', 'する', '-te'], ['した', 'する', 'past'],
  ['したら', 'する', 'if/when'], ['しない', 'する', 'negative'], ['しよう', 'する', 'volitional'],
  ['すれば', 'する', 'if'], ['しろ', 'する', 'imperative'], ['せず', 'する', 'without'],
  ['される', 'する', 'passive'], ['させる', 'する', 'causative'], ['したい', 'する', 'want to'],
  ['できる', 'する', 'potential'],
]) {
  rule(suffix, repl, ['vs', 'vk', 'n'], reason);
  // JMdict has no 勉強する headword — it lists 勉強 as a noun tagged `vs` ("can take する"). So the
  // noun+する verbs, which is most of them, need the same rules a second time ending at the bare
  // noun, or every 勉強しました in a game reads as an unknown word.
  rule(suffix, '', ['vs'], reason);
}
for (const [suffix, repl, reason] of [
  ['きます', 'くる', 'polite'], ['きて', 'くる', '-te'], ['きた', 'くる', 'past'],
  ['こない', 'くる', 'negative'], ['こよう', 'くる', 'volitional'], ['これる', 'くる', 'potential'],
  ['来ます', '来る', 'polite'], ['来て', '来る', '-te'], ['来た', '来る', 'past'],
  ['来ない', '来る', 'negative'], ['来い', '来る', 'imperative'],
]) rule(suffix, repl, ['vk'], reason);

// --- i-adjectives ---
for (const [suffix, reason] of [
  ['かった', 'past'], ['くない', 'negative'], ['くて', '-te'], ['ければ', 'if'],
  ['く', 'adverbial'], ['さ', 'nominalized'], ['すぎる', 'too much'],
]) rule(suffix, 'い', ['adj-i'], reason);

// --- auxiliaries that conjugate on their own: peel one layer, let the loop handle the rest ---
for (const [suffix, repl, reason] of [
  ['ません', 'ます', 'negative'], ['ました', 'ます', 'past'], ['ませんでした', 'ます', 'negative past'],
  ['ましょう', 'ます', 'volitional'], ['まして', 'ます', '-te'],
  ['なかった', 'ない', 'past'], ['なくて', 'ない', '-te'], ['なければ', 'ない', 'if not'],
  ['なきゃ', 'ない', 'must'], ['ないで', 'ない', 'without doing'],
  ['たかった', 'たい', 'past'], ['たくない', 'たい', 'negative'],
]) rule(suffix, repl, null, reason);

// --- everything that hangs off a て-form ---
// Both voicings, always: half the verbs in the language take で (読んでいます, 死んでしまう), and the
// て-only version of this table left every one of them looking like an unknown word.
for (const [tail, reason] of [
  ['いる', 'progressive'], ['いた', 'past progressive'], ['います', 'progressive'],
  ['いました', 'past progressive'], ['いない', 'not doing'], ['る', 'progressive'],
  ['た', 'past progressive'], ['ます', 'progressive'], ['ない', 'not doing'],
  ['おく', 'in advance'], ['ある', 'resultant state'], ['しまう', 'ends up'], ['しまった', 'ended up'],
  ['くる', 'come to'], ['いく', 'go on'], ['もらう', 'receive favour'],
  ['くれる', 'do for me'], ['あげる', 'do for someone'], ['ください', 'please'], ['みる', 'try'],
  ['は', 'must not'], ['も', 'even if'],
]) {
  rule('て' + tail, 'て', null, reason);
  rule('で' + tail, 'で', null, reason);
}

// --- copula / na-adjective tails ---
for (const [suffix, reason] of [
  ['じゃない', 'negative'], ['ではない', 'negative'], ['だった', 'past'], ['でした', 'polite past'],
  ['です', 'polite'], ['だ', 'copula'], ['な', 'attributive'], ['に', 'adverbial'],
]) rule(suffix, '', ['adj-na', 'n'], reason);

const MAX_DEPTH = 5;

function posMatches(entryIdx, prefixes) {
  if (!prefixes) return true;
  const senses = DICT.e[entryIdx][1];
  for (const [tags] of senses) {
    for (const tag of tags.split(',')) {
      for (const p of prefixes) if (tag.startsWith(p)) return true;
    }
  }
  return false;
}

// Every dictionary form `surface` could have come from, cheapest (fewest steps) first.
// Returns [{ term, reasons: [] }] — the empty-reasons entry is `surface` itself.
function deinflect(surface) {
  const out = [{ term: surface, reasons: [] }];
  const seen = new Set([surface]);
  for (let i = 0; i < out.length; i++) {
    const { term, reasons } = out[i];
    if (reasons.length >= MAX_DEPTH || out.length > 60) continue;
    for (const [suffix, repl, pos, reason] of RULES) {
      if (term.length <= suffix.length || !term.endsWith(suffix)) continue;
      const next = term.slice(0, term.length - suffix.length) + repl;
      if (!next || seen.has(next)) continue;
      // A rule with a POS requirement is only allowed to fire if the word it produces is actually
      // in the dictionary AS that part of speech. Intermediate forms (ている → て) carry no
      // requirement, so they always pass and get checked one rule later.
      if (pos) {
        const ids = DICT.i[next];
        if (!ids || !ids.some(id => posMatches(id, pos))) continue;
      }
      seen.add(next);
      out.push({ term: next, reasons: reasons.concat(reason) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------
const MAX_WORD = 12; // longest surface form we'll try to match, in characters
const KANJI = /[㐀-鿿豈-﫿]/;
const KATAKANA = /[゠-ヿ]/;
const JP = /[　-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/;

function entryOf(idx, term, reasons) {
  const [reading, senses, common] = DICT.e[idx];
  return {
    term,
    reading: reading && reading !== term ? reading : '',
    common: !!common,
    reasons,
    senses: senses.map(([pos, gloss]) => ({ pos, gloss })),
  };
}

// Japanese: the word that STARTS at `start`, found by longest-match + deinflection.
function lookupJa(text, start) {
  const chars = Array.from(text);
  if (start < 0 || start >= chars.length) return null;
  if (!JP.test(chars[start])) return null;

  const maxLen = Math.min(MAX_WORD, chars.length - start);
  for (let len = maxLen; len >= 1; len--) {
    const surface = chars.slice(start, start + len).join('');
    // A one-character match on kana is nearly always a particle or a coincidence ("な" resolves to
    // "greens; vegetables"), and showing it is worse than showing nothing. A single kanji or a
    // katakana character is a real word often enough to keep.
    if (len === 1 && !KANJI.test(surface) && !KATAKANA.test(surface)) continue;

    const found = [];
    const seenEntry = new Set();
    for (const { term, reasons } of deinflect(surface)) {
      const ids = DICT.i[term];
      if (!ids) continue;
      for (const id of ids) {
        if (seenEntry.has(id)) continue;
        seenEntry.add(id);
        found.push(entryOf(id, term, reasons));
        if (found.length >= 6) break;
      }
      if (found.length >= 6) break;
    }
    if (found.length) return { matched: surface, length: len, entries: found };
  }
  return null;
}

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------
// Everything hard about the Japanese path — where does the word start, which of the 200 conjugated
// shapes is this — is either free or nearly free here. Spaces mark the boundaries, and Wiktionary
// already listed most inflections at build time, so this is a hash lookup plus a short suffix
// ladder for the forms the dump happened not to spell out (mostly regular -s/-ed/-ing).
const EN_WORD_CHAR = /[A-Za-z'’-]/;
const EN_LETTER = /[A-Za-z]/;

// [suffix, [replacements], reason]. Tried in order; the first replacement that is in the index wins.
const EN_RULES = [
  ['ies', ['y'], 'plural'],
  ['es', ['', 'e'], 'plural'],
  ['s', [''], 'plural'],
  ["'s", [''], 'possessive'],
  ['’s', [''], 'possessive'],
  ['ied', ['y'], 'past'],
  ['ed', ['', 'e'], 'past'],
  ['ing', ['', 'e'], 'progressive'],
  ['ying', ['ie'], 'progressive'],     // lying → lie
  ['er', ['', 'e'], 'comparative'],
  ['est', ['', 'e'], 'superlative'],
  ['ly', [''], 'adverb'],
  ['ily', ['y'], 'adverb'],
  ['nt', ["n't"], 'contraction'],      // OCR eats the apostrophe more often than it keeps it
];

// A doubled final consonant is dropped when the suffix went on: running → run, bigger → big.
function undouble(stem) {
  const n = stem.length;
  if (n >= 3 && stem[n - 1] === stem[n - 2] && EN_LETTER.test(stem[n - 1])
      && !'aeiou'.includes(stem[n - 1])) return stem.slice(0, -1);
  return null;
}

// Every dictionary form `surface` could be, cheapest first. Same contract as deinflect().
function enForms(surface) {
  const out = [{ term: surface, reasons: [] }];
  const seen = new Set([surface]);
  const push = (term, reason) => {
    if (!term || term.length < 2 || seen.has(term)) return;
    seen.add(term);
    out.push({ term, reasons: [reason] });
  };
  for (const [suffix, repls, reason] of EN_RULES) {
    if (surface.length <= suffix.length || !surface.endsWith(suffix)) continue;
    const stem = surface.slice(0, surface.length - suffix.length);
    for (const r of repls) push(stem + r, reason);
    const un = undouble(stem);
    if (un) push(un, reason);
  }
  return out;
}

// English: the word the cursor is inside, but reported the way the Japanese path reports it — the
// caller walks `start` backwards and keeps matches that still cover the hovered character, so a
// match is only returned when `start` really is the first letter of a word.
function lookupEn(text, start) {
  const chars = Array.from(text);
  if (start < 0 || start >= chars.length) return null;
  if (!EN_LETTER.test(chars[start])) return null;
  // Mid-word: let the caller's earlier `start` find this same word from its first letter.
  if (start > 0 && EN_WORD_CHAR.test(chars[start - 1])) return null;

  let end = start;
  while (end < chars.length && EN_WORD_CHAR.test(chars[end])) end++;
  // Trailing punctuation that only counts as a word character in the middle: "don't" keeps its
  // apostrophe, `dog's,` and `well-` do not keep the tail.
  while (end > start && !EN_LETTER.test(chars[end - 1])) end--;
  const length = end - start;
  if (length < 2) return null; // "a" and "I" are the only real 1-letter words; both are noise here

  const surface = chars.slice(start, end).join('');
  const found = [];
  const seenEntry = new Set();
  for (const { term, reasons } of enForms(surface.toLowerCase())) {
    const ids = DICT.i[term];
    if (!ids) continue;
    for (const id of ids) {
      if (seenEntry.has(id)) continue;
      seenEntry.add(id);
      found.push(entryOf(id, term, reasons));
      if (found.length >= 6) break;
    }
    if (found.length >= 6) break;
  }
  if (!found.length) return null;
  return { matched: surface, length, entries: found };
}

// Look the word up that STARTS at `start` in `text`. Returns null when nothing matches.
//   { matched, length, entries: [{ term, reading, senses, reasons, common }] }
function lookupAt(text, start, lang) {
  if (!load(lang)) return null;
  activate(lang);
  return DICT_LANG === 'eng' ? lookupEn(text, start) : lookupJa(text, start);
}

// How far back the caller should try starting a lookup so that hovering the middle of a word still
// resolves the whole word. Japanese words are short and every extra step costs a deinflection pass;
// English ones are long, and a step that isn't a word start is rejected in two character tests.
function lookback(lang) { return normLang(lang) === 'eng' ? 24 : 3; }

module.exports = { lookupAt, load, isLoaded, deinflect, enForms, lookback, dictPath };
