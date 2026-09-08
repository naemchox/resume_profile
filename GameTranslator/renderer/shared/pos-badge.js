// ONE look for "what kind of word this is", shared by every window that says it.
//
// It used to be four looks for the same fact: the hover bubble (Alt+G) drew a coloured family chip,
// the card and both vocabulary lists drew an accent-blue chip that was the same blue whatever the
// word was, and the Type bar's live peek and the word bubble printed it as plain grey text with a
// middle dot. jek pointed straight at the pair (2026-08-12): "การแปลแบบ Typing ... ตัวชนิดของคำ V.
// มันไม่ขึ้นเป็นไฮไลท์ ไม่หนา ไม่มีสี ไม่มีกรอบ ... กับตอนที่ใช้ฟังก์ชันชี้แล้วแปล alt g" — same
// word, same question answered, two different-looking answers.
//
// The hover chip won because it is the one that survives a glance mid-game: recognised by colour and
// shape before it is read. Everything else was moved onto it. Both dictionaries feed this — JMdict's
// codes (n, v5r, adj-i) and Wiktionary/Google/Claude's spelled-out names (noun, verb, adjective) —
// because the reader is asking the same question of either.
//
// Loaded as a plain script by main, learn and hover; pairs with shared/pos-badge.css.

// Which FAMILY a tag belongs to, its short mark, and the colour that carries it. Five families and
// no more (four + "other") — this is a thing you recognise by colour, and a palette of fifteen is a
// legend you have to learn. Everything unfamiliar lands on the grey one wearing its own tag, which
// is still more honest than silence.
const POS_FAMILY = [
  [/^(n|noun|nouns|n-suf|n-pref|name|proper noun|pn|pron|pronoun)$/, 'n', 'N.'],
  [/^(v|verb|verbs|v1|v5[a-z]*|vs|vs-s|vs-i|vk|vt|vi|aux-v|auxiliary verb|phrasal verb|modal verb)$/, 'v', 'V.'],
  [/^(adj|adjective|adjectives|adj-i|adj-na|adj-no|adj-t|aux-adj)$/, 'adj', 'Adj.'],
  [/^(adv|adverb|adverbs|adv-to)$/, 'adv', 'Adv.'],
];

// One tag in, {kind, label} out — null only for an empty tag. Trailing dots and case are stripped
// first, so "Noun", "n." and "n" are one thing: Google hands back "noun", Claude "Noun", JMdict "n",
// and the card used to uppercase whatever arrived, which is how the same word could read "NOUN" in
// one window and "n" in the next.
function posBadgeInfo(tag) {
  const t = String(tag || '').trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ');
  if (!t) return null;
  for (const [re, kind, label] of POS_FAMILY) {
    if (re.test(t)) return { kind, label };
  }
  const short = t.length <= 4 ? t : t.slice(0, 3) + '.';
  return { kind: 'other', label: short.charAt(0).toUpperCase() + short.slice(1) };
}

// The chip itself, wrapped so a caller can drop it anywhere without knowing whether it came back as
// one badge or two. Returns null when there is nothing to say, so `if (el)` is the whole guard.
//
// `tags` may be a comma-separated list (JMdict senses arrive that way); the first entry that isn't
// the `en` marker is the word class. `en` on a sense means the text beside it is an English
// DEFINITION standing in for a translation we don't have — a warning, not a word class, so it gets
// an outlined chip that can't be mistaken for one.
function posBadgeEl(tags, title) {
  const parts = String(tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const isEn = (t) => t.toLowerCase() === 'en';
  const main = parts.find((t) => !isEn(t));
  const info = main ? posBadgeInfo(main) : null;
  const wrap = document.createElement('span');
  wrap.className = 'badges';
  if (info) {
    const el = document.createElement('span');
    el.className = `pos-badge ${info.kind}`;
    el.textContent = info.label;
    // The short mark is the whole point of the chip, so the tag it stands for lives in the tooltip
    // rather than on screen. Callers with something better to say (the other senses, say) pass it in.
    el.title = title || main;
    wrap.appendChild(el);
  }
  if (parts.some(isEn)) {
    const en = document.createElement('span');
    en.className = 'pos-badge en';
    en.textContent = 'EN';
    wrap.appendChild(en);
  }
  return wrap.childElementCount ? wrap : null;
}

// Fill an element with "[V.] วิ่ง · [N.] การวิ่ง" — one chip per sense, the terms after it. Returns
// whether anything was written, so the caller can hide an empty row without measuring it.
// `skipFirst` — for the surfaces that ALREADY show the primary part of speech as a chip of its own
// (the card's meta row, the tapped-word bubble, the Type bar's quick look). Without it those three
// print that same chip twice, a line apart, which is what jek photographed: "Prep" on the quick-look
// line and "Prep" again as the first entry underneath. The row is called Other meanings; with this it
// finally contains only the other ones. Surfaces with no chip elsewhere (the Learn card, where this
// row IS the word-class display) must keep passing it false or they lose the primary entirely.
function fillSenseChips(el, senses, max, skipFirst) {
  el.textContent = '';
  const all = Array.isArray(senses) ? senses.filter((sn) => sn && (sn.terms || sn.gloss)) : [];
  // The "is there anything worth a row" test still asks about the WHOLE set: one sense means the chip
  // above has said everything, and that is true whether or not this row would have dropped it.
  if (all.length < 2) return false;
  const list = skipFirst ? all.slice(1) : all;
  if (!list.length) return false;
  list.forEach((sn, i) => {
    if (i) el.appendChild(document.createTextNode('  ·  '));
    const chip = posBadgeEl(sn.pos);
    if (chip) { el.appendChild(chip); el.appendChild(document.createTextNode(' ')); }
    const terms = Array.isArray(sn.terms) ? sn.terms.slice(0, max || 2).join(', ') : String(sn.gloss || '');
    el.appendChild(document.createTextNode(terms));
  });
  return true;
}
