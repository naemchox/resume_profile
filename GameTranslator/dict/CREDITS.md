# Dictionary data — sources and licences

Both dictionaries shipped in this folder are built from free data by the scripts in `../scripts/`.
Neither file is written by hand, and both carry a licence that requires attribution — this file is
that attribution, and it must ship with the app (it is bundled, and the About screen should link to
it).

## `jmdict.json` — Japanese → English

Built by `scripts/build-dict.js` from **JMdict** (jmdict-simplified distribution).

- Source: https://www.edrdg.org/jmdict/j_jmdict.html · https://github.com/scriptin/jmdict-simplified
- Copyright: © Electronic Dictionary Research and Development Group (EDRDG)
- Licence: **CC BY-SA 4.0**

## `enth.json` — English → Thai

Built by `scripts/build-dict-en.js` from three sources:

1. **English Wiktionary**, via the kaikki.org wiktextract dump — the Thai translations attached to
   English entries, plus English definitions and inflected forms.
   - Source: https://kaikki.org/dictionary/English/ (extraction by Tatu Ylonen, wiktextract)
   - Licence: **CC BY-SA 4.0 / GFDL** (Wiktionary contributors)
2. **Thai entries of English Wiktionary**, same dump, glosses inverted to give extra EN→TH pairs.
   - Source: https://kaikki.org/dictionary/Thai/ · Licence: **CC BY-SA 4.0 / GFDL**
3. **hermitdave/FrequencyWords** `en_50k.txt` — subtitle word frequencies, used only to decide which
   words are common enough to keep an English definition for.
   - Source: https://github.com/hermitdave/FrequencyWords · Licence: **CC BY-SA 4.0**

### What CC BY-SA means for selling this app

Share-alike attaches to the *dictionary data*, not to the application that reads it. Shipping these
files inside a paid app is allowed, and does not put the app's own source under CC BY-SA, provided:

- the attribution above ships with the product (this file), and
- the dictionary files themselves stay redistributable under CC BY-SA — i.e. if someone asks for
  `enth.json`, they may have it under that licence.

Do **not** replace these with a commercial dictionary (LEXiTRON, So Sethaputra, etc.) without buying
a licence first — those are the ones that would actually be a problem in a paid product.
