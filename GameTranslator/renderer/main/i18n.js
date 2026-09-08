// Gloss UI localization. Keeps the CHROME (settings, tabs, pill tooltips) in the user's language while
// the translated CONTENT is already localized by the To-language. Static HTML carries data-i18n* keys;
// applyI18n() walks them. Dynamic strings set from index.js (status/hints) stay English for now.
//
//   data-i18n        → element.textContent
//   data-i18n-html   → element.innerHTML (for strings with <b>/<br>/<small>)
//   data-i18n-title  → element.title      (native tooltip)
//   data-i18n-ph     → element.placeholder
//   data-i18n-tip    → element.dataset.tip (the pill's custom tooltip)
(function () {
  const DICT = {
    en: {
      'tab.gameplay': 'Gameplay', 'tab.display': 'Display', 'tab.controls': 'Controls', 'tab.system': 'System',
      'tab.type': 'Type', 'tab.history': 'History', 'tab.vocab': 'Vocab',
      'tip.lockTab': 'Lock the overlay — clicks pass through to the game (⌘⇧L to unlock)',
      'tip.tall': 'Taller list',
      // The card's ✎ / ↩ line. It is the one tappable thing on the card with no button around it, so
      // it says out loud what a tap does — see fillSpell in index.js.
      'tip.respell': 'Translate this spelling instead',
      'tip.respellBack': 'Put back the words that were read',
      // Gameplay page
      'grp.liveCc': 'Live captions',
      'grp.voice': 'Pronounce',
      'lbl.speakVol': 'Voice volume',
      'desc.speakVol': 'How loud 🔊 reads a word. Full is where it has always been — this only turns it down under the game.',
      'note.liveCc': 'Live subtitles reads one strip of the screen over and over — place it once and captions follow the game.',
      'lbl.from': 'From', 'lbl.to': 'To', 'lbl.snipStyle': 'Select by',
      'grp.langs': 'Languages', 'tip.langSwap': 'Swap the two languages',
      // The Thai variant only ever appears where Thai CANNOT be read (capabilities.js › THAI_SOURCE is
      // macOS-only), so naming the OS names a machine the reader does not have. Say what is missing.
      'swap.none': 'not readable', 'swap.mac': "can't read Thai yet",
      // Two modes, not three. Hold-and-sweep and drag-a-box were never a choice a player should have
      // to make: they differ only in whether the TRIGGER can be held, which the app already knows
      // from the key that's bound (effectiveSnipStyle). What's left is the one real difference —
      // whether you drag at all. The gesture is spelled out in the tooltip on the toggle itself.
      'opt.snip.drag': 'Drag a box', 'opt.snip.hold': 'Hold and sweep',
      'tip.snip.drag': 'Press the key, then drag a box over the text. Precise, and both hands stay free.',
      'tip.snip.hold': 'Hold the key, sweep across the text, let go. No aiming, nothing to cancel.',
      'desc.snipStyle': 'How the snip key selects text. Set it on the Snip row below.',
      'note.snipHoldDrag': 'One key for snipping: ⌘⇧S. How it behaves is the setting above.',
      'btn.scShowAll': 'Show all', 'btn.scShowLess': 'Show less',
      'btn.shortcutsOpen': 'Shortcuts ▴',
      'note.holdNeedsMods': 'Holding needs a trigger made only of modifier keys (⌃⌥ and the like) — ⌘⇧S has a letter in it, so it drags a box instead.',
      'btn.live': 'CC · Live subtitles',
      'btn.ccArea': 'Choose subtitle area…',
      'tip.ccToggle': 'Live subtitles on / off · \u2325C',
      'btn.ccAreaShort': 'Area…',
      'tip.ccArea': 'Draw the strip CC watches. Do it once per game — turning CC on and off does not ask again.',
      'tip.live': 'Live subtitles — position the strip once, then every change in that area is auto-translated. Click again to stop.',
      'lbl.ccSpeed': 'CC speed',
      // One-line explanations under each row — shown on hover/focus, the way a game options menu does it.
      'desc.ccSpeed': 'Gap between subtitle reads. Higher = lighter on the CPU, captions a touch slower.',
      // Display page
      'lbl.pillStyle': 'Pill style',
      'opt.pill.visible': 'Visible', 'opt.pill.dim': 'Faded', 'opt.pill.ghost': 'Tucked',
      'opt.pill.ghostdim': 'Tucked + Faded',
      'opt.pill.behind': 'Window',
      'desc.pillStyle': 'How present the pill is while you play. The status dot stays bright in every style. “Window” is the only one that stops floating on top and behaves like an ordinary window: any window can cover it, clicking it brings it to the front the way clicking a window does, and it surfaces on its own when a translation, a status or a snip needs you.',
      'toggle.src': 'Show source text',
      'toggle.autoHide': 'Auto-hide panel', 'toggle.pillKeyword': 'Keep the word on the pill',
      'toggle.followMonitor': 'Follow the monitor I snip on',
      'toggle.openAtLogin': 'Open Gloss when I log in',
      'toggle.aiCards': 'Full AI card on every translation',
      'desc.aiCards': 'Off: a snip is a fast free translation that costs nothing from your AI allowance, and ✦ on the card fetches pronunciation, word forms and an example for the lines worth keeping. On: every snip builds the full card and spends one AI read — including the lines you read once and forget.',
      'toggle.aiMixedRead': 'Let AI read what this PC cannot',
      'toggle.hoverDwellSave': 'Keep a word by holding the cursor on it',
      'tip.editSource': 'Correct this line and translate it again',
      'btn.licActivate': 'Activate',
      'desc.hoverDwellSave': 'In point-at-a-word, rest the cursor on a word for a second and it is collected — the star pops just as it does for the key. Only ever ADDS: a word you already keep is left alone, and removing one is still a deliberate key press. Off: the key is the only way in.',
      'desc.aiMixedRead': 'Two cases the local reader cannot win, and only these two: a line with a second alphabet in it (reading is set to one language at a time, so the other half comes back mangled), and a language this PC has no reading pack for at all (the backup engine guesses, and guesses confidently and wrongly). Both are read by AI from the picture instead, which costs from your AI allowance. Off: they are read the same way as any other line.',
      'desc.src': 'Keep the original words on the card next to the translation.',
      // What an answer carries — one group, honoured by the card, the Alt+G bubble and the Type bar.
      'grp.pillCard': 'The pill and the card',
      'grp.capture': 'Streaming & capture',
      'btn.moreDisplay': 'More settings ▾', 'btn.moreDisplayOpen': 'Fewer settings ▴',
      'grp.reading': 'Reading the screen',
      'grp.showsWhat': 'What the answer shows',
      'toggle.showPos': 'Word type', 'toggle.showEnMeaning': 'English meaning',
      'toggle.showReading': 'Reading', 'toggle.showSenses': 'Other meanings',
      'desc.showPos': 'The N. / V. / Adj. chip beside a word, wherever one is answered.',
      'grp.fullDict': 'What else the card may show',
      'desc.showEnMeaning': 'Keeps the dictionary’s English definition when your own language is on screen too. Off shows only yours. Never on the Alt+G bubble — that answers in one line, in your language.',
      'desc.showReading': 'How the source text reads, on the snip card and the Type bar. Never on the Alt+G bubble.',
      'desc.showSenses': 'A word that is both a noun and a verb answers as both, instead of only the first. Never on the Alt+G bubble.',
      'desc.autoHide': 'Closes this panel a few seconds after your cursor leaves it.',
      'desc.pillKeyword': 'After the card fades, the word stays on the pill — tap it to bring the card back.',
      'desc.hideCap': "Recorders and screenshots won't see the overlay.",
      'desc.followMonitor': 'Moves the overlay to whichever screen you snip on. ⌘⇧D moves it manually.',
      'desc.openAtLogin': 'Gloss starts with your computer, ready before the game is. Only available in the installed app.',
      // System page
      'btn.lock': 'Lock overlay · ⌘⇧L', 'btn.export': '⤓ Export CSV',
      'toggle.hideCap': 'Hide from screen capture',
      'btn.shortcuts': 'Shortcuts ▾', 'btn.scReset': '↺ Defaults',
      'note.scHint': 'Click a key, then press the new combo. Esc cancels.',
      'btn.advanced': 'Advanced ▾', 'ph.key': 'Claude API key (sk-ant-…) — richer cards', 'btn.keySave': 'Save',
      'ph.licence': 'Gloss Pro licence key', 'btn.licSave': 'Save',
      // Price in the button, because a button that only says "Get Pro" makes you click to find out
      // what it costs — and the whole point of one payment is that there is nothing to find out.
      'btn.buy': 'Get Gloss — ฿149 once',
      // Shown instead of btn.buy once a licence is in. It names the price because the answer to
      // "what does more cost" is the thing someone out of cards actually wants, and because it is
      // the same number they already paid — a top-up has never cost more than a first purchase and
      // saying so here is what stops anyone buying a second key to get around a worse deal.
      'btn.topup': 'Add 500 more — ฿149, same as before',
      // 'quota.out' offers ONLY the thing that works today. It briefly said "Top up, go Pro" — both
      // dead ends: the plan gate is still a device-local mock and there is no purchase flow at all
      // (see main.js "Mock unlock for now"). A message that names an action the app cannot perform
      // is worse than the wall it is trying to soften. Put Starter/Pro back here the day Lemon
      // Squeezy is live, and not before — that is the moment §9's "Starter appears only when the
      // free allowance runs out" becomes real rather than a decision on paper.
      // Reporting. Two entry points, one endpoint — see report:send in main.js. The notes say what
      // is attached BEFORE it is sent, because a window that sits over someone's game asking to
      // phone home owes them that sentence up front rather than in a policy nobody opens.
      // The banner was English-only in an app whose buyers are Thai — the one screen where being
      // stuck is most expensive was the one screen that never spoke their language.
      'perm.screenOff': "Screen Recording is off — the app can't see the screen.",
      'toggle.recSnip': 'Let recordings show the snip box',
      'desc.recSnip': 'On, so a recording shows what you are doing: the snip takes a still photo of the screen first and you drag on that, and everything you draw is in the clip. The cost is that the picture stops moving while you drag, so a video or a game looks paused for that second. Turn it off and the drag runs over live pixels instead — smoother, but Windows then has to hide the box from screen recorders (a see-through window lands in a capture as a solid black rectangle over the very text being read), so you see the box and a recording does not.',
      'perm.step1': 'Press <b>Open Settings</b>, then switch <b>Gloss</b> on.',
      'perm.step1.stale': '<b>Gloss</b> is already in that list: switch it <b>off and on again</b>. A new version needs that once.',
      'perm.step2': 'Come back here and press <b>Reopen Gloss</b>.',
      'perm.open': 'Open Settings', 'perm.reopen': 'Reopen Gloss', 'perm.find': 'Show me the app',
      'tip.report': 'Tell us this read wrong',
      'lbl.report': 'Report a problem', 'btn.report': 'Write…', 'btn.reportSend': 'Send',
      'ph.report': 'What went wrong? Leave a contact here if you want a reply.',
      'note.reportOk': 'Sent — thank you. Your app version, system and language pair went with it; nothing else did.',
      'note.reportErr': 'Could not send. Check the connection and try again — nothing was lost.',
      // Shown ONLY when the last tenth is left (see renderQuota). A counter on screen while there is
      // plenty left is what makes a one-time purchase feel metered — PRICING-AI.md §11.
      // Shown at every level, not only when the number is nearly gone: 'how many do I have left' is a
      // question people ask when nothing is wrong, and Settings is where they go to ask it. The two
      // 'running low' lines below still take over once it matters.
      'quota.have': '{left} of {limit} AI reads left.',
      'quota.havePro': '{left} of {limit} AI reads left — they never expire.',
      'quota.free': 'Free AI reads running low — {left} of {limit} left.',
      'quota.pro': 'AI reads running low — {left} of {limit} left. They never expire.',
      // Named your own Claude key as the ONLY way forward until 2026-09-08 — sending the one person
      // who had already paid to go open an Anthropic account, which is both more work for them and
      // the single outcome that earns nothing. Another bundle goes first now because it is the
      // easier answer for most people; the key stays, because for a heavy user it is still better.
      'quota.out': 'Out of AI reads. Translation keeps working — this only pauses the learner cards. Another 500 is ฿149, added to the key you already have. Or use your own Claude key below, with no limit.',
      'btn.reset': '↺ Reset all to defaults', 'lbl.uiLang': 'App language',
      'opt.lang.auto': 'Auto', 'opt.lang.en': 'English', 'opt.lang.th': 'ไทย',
      // Type / Dictionary pages
      'ph.type': 'Type a word or sentence…', 'tip.typeGo': 'Translate (Enter)',
      'tip.micType': 'Speak instead of typing · ⌘⇧M',
      'tip.type': 'No OCR here — type anything and the meaning shows straight away.<br /><small>Press <b>Enter</b> for the full card — this bar stays open, so keep typing. <b>Esc</b> closes it · <b>⌘⇧T</b> opens it from anywhere.</small>',
      'ph.search': 'Search…', 'ph.searchVocab': 'Search your words…', 'ph.searchHistory': 'Search your history…',
      'btn.scope': 'This session',
      'day.today': 'Today', 'day.yesterday': 'Yesterday', 'day.unknown': 'Undated', 'day.words': '{n} words',
      // Set from index.js, not from a data-i18n tag: the chip only exists while CC is filing rows
      // into a list you are reading. No plural form on purpose — "1 new lines" is worse than dropping
      // the noun, and the row count is the only thing being said.
      'chip.ccNew': '↑ {n} new',
      'mode.snip': 'Snip', 'mode.type': 'Type', 'mode.speak': 'Speak', 'mode.cc': 'CC', 'mode.point': 'Point',
      'btn.srcAll': 'All', 'btn.srcSnip': 'Snip', 'btn.srcCc': 'CC', 'btn.srcType': 'Typed', 'btn.srcSpeak': 'Spoken', 'btn.srcPoint': 'Pointed', 'btn.srcStar': 'Words', 'tip.scope': 'Show only the words you looked up in this play session (a burst of lookups, ended by a gap) — tap again to see all history.',
      'coach.hold': 'hold, then drag over any text',
      'coach.why': 'The translation appears right where you dragged — over a game, a manga page, anything on screen.',
      'coach.into': 'Translating into', 'coach.ok': 'Got it',
      'empty.state': 'Hold <b>⌘⇧S</b> and sweep over the game text.<br />A translation card pops up right where the text is.<br /><small>Tap the same keys again right after, and a one-word snip is kept to ★.</small><br /><small>Card size: <b>⌘⇧↑</b> / <b>⌘⇧↓</b> · works over fullscreen games.</small>',
      // Dynamic History/Vocab empty-states (built in index.js). {sc}/{a}/{b} are filled at render time.
      // Two variants, one per snip style — there is a single trigger now, so the only thing that
      // changes is what you do with it. Picked in index.js from the style actually in force.
      'empty.state.hold': 'Hold <b>{sc}</b> and sweep the cursor over the game text, then let go.<br />A translation card pops up right where the text is.',
      'empty.state.press': 'Press <b>{sc}</b> anywhere, then drag a box around the game text.<br />A translation card pops up right where the text is.',
      'empty.searchSession': 'No match in this session — clear the session filter to search everything.',
      'empty.searchNone': 'No past translation matches — press Enter to look it up.',
      'empty.sessionNone': 'No lookups in this session yet.',
      'empty.savedMatch': 'No saved word matches — press Enter to look it up.',
      'empty.savedNone': 'No saved words yet.<br />Tap the ☆ next to a translation to add it to your vocab.',
      'head.recognise': 'Known {a} of {b} words', 'badge.known': '✓ known', 'badge.known.tip': 'You have met this word {n} times with its translation — you read it without help now',
      'badge.seen': 'seen {n}/{g}', 'badge.seen.tip': 'Meet this word {g} times and it becomes "known"',
      // Pro box
      'pro.free': 'Free', 'pro.perks': 'Rich AI cards · ★ Vocab collection · Unlimited history · Custom keys', 'btn.upgrade': 'Upgrade to Pro',
      // Pill tooltips
      'tip.hidePill': 'Hide / show the pill', 'tip.snip': 'Snip · ⌘⇧S', 'tip.mic': 'Speak & translate · ⌘⇧M',
      'tip.learnPill': 'Learn Mode · nothing kept yet today', 'tip.learnPill.n': 'Learn Mode · {n} kept today',
      'tip.log': 'Type · History', 'tip.settings': 'Settings', 'tip.quit': 'Quit',
      'tip.hint': 'Shortcut to snip & translate', 'ph.pillType': 'Type a word…',
    },
    th: {
      // Tab labels are kept SHORT on purpose: four tabs share a 344px panel, and a Thai label that
      // wraps to a second line would make the bar taller on that page only (the bar must never jump).
      'tab.gameplay': 'เกมเพลย์', 'tab.display': 'หน้าจอ', 'tab.controls': 'ควบคุม', 'tab.system': 'ระบบ',
      'tab.type': 'พิมพ์', 'tab.history': 'ประวัติ', 'tab.vocab': 'คำศัพท์',
      'tip.lockTab': 'ล็อกโอเวอร์เลย์ — คลิกจะทะลุไปที่เกม (⌘⇧L เพื่อปลดล็อก)',
      'tip.tall': 'รายการสูงขึ้น',
      'tip.respell': 'แปลใหม่ด้วยคำที่สะกดแบบนี้',
      'tip.respellBack': 'ย้อนกลับไปคำที่อ่านมาได้',
      'grp.liveCc': 'ซับไตเติลสด',
      'grp.voice': 'เสียงอ่าน',
      'lbl.speakVol': 'ความดังเสียงอ่าน',
      'desc.speakVol': 'ปุ่ม 🔊 อ่านคำดังแค่ไหน · สุดขวาคือเท่าเดิมที่เคยเป็น ปรับได้แค่เบาลงให้ไม่กลบเสียงเกม',
      'note.liveCc': 'ซับไตเติลสดจะอ่านแถบเดิมบนจอซ้ำๆ · วางกรอบครั้งเดียว แล้วคำแปลจะตามเกมไปเอง',
      'lbl.from': 'จาก', 'lbl.to': 'เป็น', 'lbl.snipStyle': 'เลือกด้วย',
      'grp.langs': 'ภาษา', 'tip.langSwap': 'สลับสองภาษา',
      'swap.none': 'อ่านภาษานี้ไม่ได้', 'swap.mac': 'ยังอ่านไทยจากจอไม่ได้',
      'opt.snip.drag': 'ลากกรอบ', 'opt.snip.hold': 'กดค้างแล้วกวาด',
      'tip.snip.drag': 'กดปุ่ม แล้วลากกรอบคลุมข้อความ · แม่นกว่า และมือว่างทั้งสองข้าง',
      'tip.snip.hold': 'กดปุ่มค้างไว้ กวาดผ่านข้อความ แล้วปล่อย · ไม่ต้องเล็ง ไม่มีอะไรต้องยกเลิก',
      'desc.snipStyle': 'ปุ่มจับภาพเลือกข้อความยังไง · ตั้งได้ที่แถว Snip ข้างล่าง',
      'btn.scShowAll': 'ดูทั้งหมด', 'btn.scShowLess': 'ย่อลง',
      'btn.shortcutsOpen': 'ปุ่มลัด ▴',
      'note.snipHoldDrag': 'จับภาพมีคีย์เดียว: ⌘⇧S · จะให้มันทำงานแบบไหนตั้งได้ข้างบน',
      'note.holdNeedsMods': 'แบบกดค้างต้องใช้คีย์ที่เป็นปุ่ม modifier ล้วน (เช่น ⌃⌥) · ⌘⇧S มีตัวอักษรอยู่ด้วย เลยเปลี่ยนเป็นลากกรอบแทน',
      'btn.live': 'CC · ซับไตเติลสด',
      'btn.ccArea': 'เลือกพื้นที่ซับไตเติล…',
      'tip.ccToggle': 'เปิด / ปิด ซับสด · \u2325C',
      'btn.ccAreaShort': 'พื้นที่…',
      'tip.ccArea': 'ลากกรอบที่ CC จะเฝ้าอ่าน · ทำครั้งเดียวต่อเกม เปิดปิด CC จะไม่ถามซ้ำอีก',
      'tip.live': 'ซับไตเติลสด — วางกรอบครั้งเดียว แล้วทุกความเปลี่ยนแปลงในบริเวณนั้นจะถูกแปลอัตโนมัติ คลิกอีกครั้งเพื่อหยุด',
      'lbl.ccSpeed': 'ความเร็ว CC',
      'desc.ccSpeed': 'ระยะห่างการอ่านซับ · สูง = เบา CPU แต่ซับช้าลง',
      'lbl.pillStyle': 'สไตล์แถบ',
      'opt.pill.visible': 'เห็นตลอด', 'opt.pill.dim': 'จาง', 'opt.pill.ghost': 'ซ่อนขอบ',
      'opt.pill.ghostdim': 'ซ่อนขอบ + จาง',
      'opt.pill.behind': 'หน้าต่าง',
      'desc.pillStyle': 'แถบจะเด่นแค่ไหนตอนคุณเล่นเกม · จุดสถานะสว่างเต็มทุกสไตล์ · “หน้าต่าง” เป็นสไตล์เดียวที่เลิกลอยอยู่บนสุด ทำตัวเหมือนหน้าต่างธรรมดา หน้าต่างอื่นบังได้หมด คลิกที่แถบแล้วมันขึ้นมาหน้าเหมือนคลิกหน้าต่างธรรมดา และเด้งขึ้นเองตอนมีคำแปล สถานะ หรือตอนสนิป',
      'toggle.src': 'แสดงข้อความต้นฉบับ',
      'toggle.autoHide': 'ซ่อนแผงอัตโนมัติ', 'toggle.pillKeyword': 'เก็บคำไว้บนแถบ',
      'toggle.followMonitor': 'ตามจอที่จับภาพ',
      'toggle.openAtLogin': 'เปิด Gloss ตอนเข้าเครื่อง',
      'toggle.aiCards': 'ใช้การ์ด AI เต็มทุกครั้งที่แปล',
      'desc.aiCards': 'ปิด: สนิปแล้วได้คำแปลเร็วและฟรี ไม่กินโควตา AI เลย กด ✦ บนการ์ดเมื่อเจอบรรทัดที่อยากเก็บจริงๆ · เปิด: ทุกสนิปสร้างการ์ดเต็มและกินโควตา 1 หน่วย รวมบรรทัดที่อ่านครั้งเดียวแล้วลืม',
      'toggle.aiMixedRead': 'ให้ AI อ่านสิ่งที่เครื่องนี้อ่านไม่ได้',
      'toggle.hoverDwellSave': 'ชี้ค้างที่คำเพื่อเก็บคำนั้น',
      'tip.editSource': 'แก้บรรทัดนี้แล้วแปลใหม่',
      'btn.licActivate': 'เปิดใช้งาน',
      'desc.hoverDwellSave': 'ในโหมดชี้แล้วแปล วางเคอร์เซอร์ค้างที่คำราวหนึ่งวินาที คำนั้นจะถูกเก็บ ดาวเด้งเหมือนตอนกดปุ่มทุกอย่าง · เพิ่มอย่างเดียวเท่านั้น: คำที่เก็บไว้แล้วจะไม่ถูกแตะ และการลบยังต้องกดปุ่มเองเสมอ · ปิด: เก็บได้ทางปุ่มทางเดียว',
      'desc.aiMixedRead': 'มีสองกรณีที่ตัวอ่านในเครื่องสู้ไม่ได้ และเฉพาะสองกรณีนี้: บรรทัดที่มีอีกภาษาปนอยู่ (การอ่านตั้งได้ทีละภาษา อีกครึ่งจึงเพี้ยน) และภาษาที่เครื่องนี้ไม่มีชุดอ่านเลย (ตัวสำรองจะเดา และเดาผิดแบบมั่นใจ) ทั้งสองกรณีจะให้ AI อ่านจากภาพแทน ซึ่งหักจากโควตา AI ของคุณ · ปิด: อ่านแบบเดียวกับบรรทัดอื่น',
      'desc.src': 'เก็บคำต้นฉบับไว้บนการ์ดข้างคำแปล',
      'grp.pillCard': 'แถบและการ์ด',
      'grp.capture': 'สตรีม & แคปหน้าจอ',
      'btn.moreDisplay': 'ตั้งค่าเพิ่มเติม ▾', 'btn.moreDisplayOpen': 'ย่อกลับ ▴',
      'grp.reading': 'การอ่านหน้าจอ',
      'grp.showsWhat': 'คำแปลจะแสดงอะไรบ้าง',
      'toggle.showPos': 'ชนิดของคำ', 'toggle.showEnMeaning': 'ความหมายภาษาอังกฤษ',
      'toggle.showReading': 'คำอ่าน', 'toggle.showSenses': 'ความหมายอื่น',
      'desc.showPos': 'ป้าย N. / V. / Adj. ข้างคำ ทุกที่ที่มีคำตอบ',
      'grp.fullDict': 'การ์ดแสดงอะไรได้อีก',
      'desc.showEnMeaning': 'เก็บความหมายภาษาอังกฤษของดิกไว้ ตอนที่ภาษาของคุณขึ้นอยู่แล้ว · ปิด = เห็นเฉพาะภาษาของคุณ · ไม่มีผลกับบับเบิล Alt+G ที่ตอบบรรทัดเดียวเสมอ',
      'desc.showReading': 'คำอ่านของข้อความต้นฉบับ บนการ์ดและแถบพิมพ์ · ไม่มีผลกับบับเบิล Alt+G',
      'desc.showSenses': 'คำที่เป็นได้ทั้งคำนามและคำกริยาจะตอบทั้งสองแบบ ไม่ใช่แค่อันแรก · ไม่มีผลกับบับเบิล Alt+G',
      'desc.autoHide': 'ปิดแผงนี้อัตโนมัติหลังเลื่อนเมาส์ออกไปไม่กี่วินาที',
      'desc.pillKeyword': 'หลังการ์ดจางไป คำจะค้างอยู่บนแถบ — แตะเพื่อเรียกการ์ดกลับมา',
      'desc.hideCap': 'โปรแกรมอัดหน้าจอและภาพแคปจะไม่เห็นโอเวอร์เลย์',
      'desc.followMonitor': 'ย้ายโอเวอร์เลย์ไปจอที่คุณจับภาพ · ⌘⇧D ย้ายเองได้',
      'desc.openAtLogin': 'Gloss เปิดพร้อมเครื่อง พร้อมก่อนเกม · ใช้ได้เฉพาะตัวที่ติดตั้งแล้ว',
      'btn.lock': 'ล็อกโอเวอร์เลย์ · ⌘⇧L', 'btn.export': '⤓ ส่งออก CSV',
      'toggle.hideCap': 'ซ่อนจากการอัดหน้าจอ',
      'btn.shortcuts': 'ปุ่มลัด ▾', 'btn.scReset': '↺ ค่าเริ่มต้น',
      'note.scHint': 'คลิกปุ่ม แล้วกดคีย์ผสมใหม่ · Esc ยกเลิก',
      'btn.advanced': 'ขั้นสูง ▾', 'ph.key': 'คีย์ Claude API (sk-ant-…) — การ์ดละเอียดขึ้น', 'btn.keySave': 'บันทึก',
      'ph.licence': 'คีย์ Gloss Pro', 'btn.licSave': 'บันทึก',
      'perm.screenOff': 'ยังไม่ได้ให้สิทธิ์อ่านหน้าจอ — แอปมองไม่เห็นจอ',
      // The steps name the buttons as they are LABELLED, not as the source calls them: the Thai
      // banner read "กด Open Settings" under a button that says เปิดหน้าตั้งค่า.
      'toggle.recSnip': 'ให้กรอบที่ลากติดในคลิปที่อัด',
      'desc.recSnip': 'เปิดไว้ เพื่อให้คลิปที่อัดเห็นสิ่งที่คุณทำ — แอปจะถ่ายภาพนิ่งของจอก่อนแล้วให้ลากบนภาพนั้น ทุกอย่างที่ลากจึงติดในคลิปครบ · แลกกับ: ภาพบนจอหยุดนิ่งตอนลาก วิดีโอหรือเกมจะดูเหมือนค้างไปหนึ่งวินาที · ถ้าปิด จะลากบนภาพสดแทน ลื่นกว่า แต่ Windows ต้องซ่อนกรอบจากโปรแกรมอัด (หน้าต่างโปร่งใสจะกลายเป็นสี่เหลี่ยมดำทับข้อความที่กำลังจะอ่าน) แปลว่าคุณเห็นกรอบ แต่คลิปที่อัดไม่เห็น',
      'perm.step1': 'กด <b>เปิดหน้าตั้งค่า</b> แล้วเปิดสวิตช์ <b>Gloss</b>',
      'perm.step1.stale': 'มี <b>Gloss</b> ในลิสต์อยู่แล้ว — ให้<b>ปิดสวิตช์แล้วเปิดใหม่</b> เวอร์ชันใหม่ต้องทำครั้งหนึ่งเสมอ',
      'perm.step2': 'กลับมาที่นี่ แล้วกด <b>เปิด Gloss ใหม่</b>',
      'perm.open': 'เปิดหน้าตั้งค่า', 'perm.reopen': 'เปิด Gloss ใหม่', 'perm.find': 'หาไฟล์แอปให้ที',
      'tip.report': 'บอกเราว่าอันนี้อ่านผิด',
      'lbl.report': 'แจ้งปัญหา', 'btn.report': 'เขียน…', 'btn.reportSend': 'ส่ง',
      'ph.report': 'เจอปัญหาอะไร? ถ้าอยากให้ตอบกลับ ใส่ช่องทางติดต่อไว้ในนี้ได้',
      'note.reportOk': 'ส่งแล้ว ขอบคุณครับ — แนบไปแค่เวอร์ชันแอป ระบบปฏิบัติการ และคู่ภาษา ไม่มีอย่างอื่น',
      'note.reportErr': 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง — ข้อความยังอยู่ ไม่ได้หายไปไหน',
      'btn.buy': 'ซื้อ Gloss — ฿149 จ่ายครั้งเดียว',
      'btn.topup': 'เติมอีก 500 ใบ — ฿149 ราคาเดิม',
      'quota.have': 'เหลือ AI {left} จาก {limit} ใบ',
      'quota.havePro': 'เหลือ AI {left} จาก {limit} ใบ · ไม่มีวันหมดอายุ',
      'quota.free': 'AI ทดลองใช้ใกล้หมด — เหลือ {left} จาก {limit} ใบ',
      'quota.pro': 'AI ใกล้หมด — เหลือ {left} จาก {limit} ใบ (ใบที่ซื้อไม่มีวันหมดอายุ)',
      'quota.out': 'AI หมดโควตา — การแปลยังใช้ได้ปกติ หยุดแค่การ์ดสำหรับเรียน · เติมอีก 500 ใบ ฿149 บวกเข้าคีย์ใบเดิมที่คุณมีอยู่ · หรือใส่คีย์ Claude ของคุณเองด้านล่างเพื่อใช้แบบไม่จำกัด',
      'btn.reset': '↺ รีเซ็ตทั้งหมดเป็นค่าเริ่มต้น', 'lbl.uiLang': 'ภาษาแอป',
      'opt.lang.auto': 'อัตโนมัติ', 'opt.lang.en': 'English', 'opt.lang.th': 'ไทย',
      'ph.type': 'พิมพ์คำหรือประโยค…', 'tip.typeGo': 'แปล (Enter)',
      'tip.micType': 'พูดแทนการพิมพ์ · ⌘⇧M',
      'tip.type': 'ไม่มี OCR ตรงนี้ — พิมพ์อะไรก็ได้ ความหมายจะขึ้นทันที<br /><small>กด <b>Enter</b> เพื่อดูการ์ดเต็ม — แถบนี้จะเปิดค้างไว้ พิมพ์ต่อได้เลย <b>Esc</b> เพื่อปิด · <b>⌘⇧T</b> เปิดจากที่ไหนก็ได้</small>',
      'ph.search': 'ค้นหา…', 'ph.searchVocab': 'ค้นหาคำศัพท์…', 'ph.searchHistory': 'ค้นหาประวัติ…',
      'btn.scope': 'คำรอบนี้',
      'day.today': 'วันนี้', 'day.yesterday': 'เมื่อวาน', 'day.unknown': 'ไม่ระบุวัน', 'day.words': '{n} คำ',
      'chip.ccNew': '↑ ใหม่ {n} บรรทัด',
      'mode.snip': 'จับภาพ', 'mode.type': 'พิมพ์', 'mode.speak': 'พูด', 'mode.cc': 'ซับสด', 'mode.point': 'ชี้คำ',
      'btn.srcAll': 'ทั้งหมด', 'btn.srcSnip': 'จับภาพ', 'btn.srcCc': 'ซับ', 'btn.srcType': 'พิมพ์', 'btn.srcSpeak': 'พูด', 'btn.srcPoint': 'ชี้คำ', 'btn.srcStar': 'คำที่เก็บ', 'tip.scope': 'แสดงเฉพาะคำที่เปิดแปลในรอบเล่นนี้ (ค้นติดๆ กันก่อนเว้นช่วง) — กดอีกครั้งเพื่อดูประวัติทั้งหมด',
      'coach.hold': 'กดค้าง แล้วลากคลุมข้อความ',
      'coach.why': 'คำแปลจะโผล่ตรงที่คุณลากเลย — บนเกม บนหน้ามังงะ อะไรก็ได้ที่อยู่บนจอ',
      'coach.into': 'แปลเป็น', 'coach.ok': 'เข้าใจแล้ว',
      'empty.state': 'กด <b>⌘⇧S</b> ค้างแล้วกวาดผ่านข้อความในเกม<br />การ์ดคำแปลจะเด้งขึ้นตรงตำแหน่งข้อความ<br /><small>แตะปุ่มเดิมอีกครั้งทันทีหลังปล่อย ถ้า snip มาคำเดียวจะถูกเก็บเข้า ★</small><br /><small>ขนาดการ์ด: <b>⌘⇧↑</b> / <b>⌘⇧↓</b> · ใช้ได้บนเกมเต็มจอ</small>',
      'empty.state.hold': 'กด <b>{sc}</b> ค้างแล้วกวาดเคอร์เซอร์ผ่านข้อความในเกม แล้วปล่อย<br />การ์ดคำแปลจะเด้งขึ้นตรงตำแหน่งข้อความ',
      'empty.state.press': 'กด <b>{sc}</b> ที่ไหนก็ได้ แล้วลากกรอบรอบข้อความในเกม<br />การ์ดคำแปลจะเด้งขึ้นตรงตำแหน่งข้อความ',
      'empty.searchSession': 'ไม่พบในรอบนี้ — ล้างตัวกรองรอบนี้เพื่อค้นทั้งหมด',
      'empty.searchNone': 'ไม่มีคำแปลเก่าที่ตรง — กด Enter เพื่อค้นหา',
      'empty.sessionNone': 'ยังไม่มีการค้นในรอบนี้',
      'empty.savedMatch': 'ไม่มีคำที่บันทึกไว้ตรง — กด Enter เพื่อค้นหา',
      'empty.savedNone': 'ยังไม่มีคำที่บันทึก<br />แตะ ☆ ข้างคำแปลเพื่อเก็บลงคลังคำศัพท์',
      'head.recognise': 'รู้แล้ว {a} จาก {b} คำ', 'badge.known': '✓ รู้แล้ว', 'badge.known.tip': 'เจอคำนี้พร้อมคำแปลมา {n} ครั้งแล้ว — อ่านออกเองได้ ไม่ต้องพึ่งแอป',
      'badge.seen': 'เจอ {n}/{g}', 'badge.seen.tip': 'เจอคำนี้ครบ {g} ครั้งจะขึ้นเป็น "รู้แล้ว"',
      'pro.free': 'ฟรี', 'pro.perks': 'การ์ด AI ละเอียด · ★ คลังคำศัพท์ · ประวัติไม่จำกัด · ใส่คีย์เองได้', 'btn.upgrade': 'อัปเกรดเป็น Pro',
      'tip.hidePill': 'ซ่อน / แสดงแถบ', 'tip.snip': 'จับภาพ · ⌘⇧S', 'tip.mic': 'พูดแล้วแปล · ⌘⇧M',
      'tip.learnPill': 'โหมดเรียนรู้ · วันนี้ยังไม่ได้เก็บคำไหน', 'tip.learnPill.n': 'โหมดเรียนรู้ · วันนี้เก็บไป {n} คำ',
      'tip.log': 'พิมพ์ · ประวัติ', 'tip.settings': 'ตั้งค่า', 'tip.quit': 'ออก',
      'tip.hint': 'ปุ่มลัดจับภาพแล้วแปล', 'ph.pillType': 'พิมพ์คำ…',
    },
  };

  let uiLang = 'en';

  // On Windows/Linux the DICT's mac glyphs (⌘⇧/⌃⌥/⇧) read as smudges ("Ctrl⇧S"), so convert them to
  // words — mirrors index.js KEYS(). Kept HERE, inside t(), because applyI18n re-runs on every language
  // switch and on the async getSettings() echo, each time re-writing tooltips/labels straight from DICT.
  // index.js's one-time KEYS pass ran once at load and applyI18n silently reverted every i18n'd element
  // back to glyphs (jek, Win11 2026-07-30). Doing it in t() means there is no path that reaches the DOM
  // un-converted.
  const IS_MAC = !(window.api && window.api.isMac === false);
  const keyify = (s) => (IS_MAC || typeof s !== 'string') ? s : s
    .replaceAll('⌃⌥', 'Ctrl+Alt')      // before the ⇧ rule: the hold-to-snip modifiers, not a shortcut
    .replaceAll('⌘⇧', 'Ctrl+Shift+')
    .replaceAll('⇧', 'Shift+');

  // 'auto' resolves from the OS locale (Electron sets navigator.language to app.getLocale()). Thai → th,
  // everything else falls back to English (the only two dictionaries we ship today).
  function resolve(pref) {
    if (pref === 'en' || pref === 'th') return pref;
    const loc = (navigator.language || 'en').toLowerCase();
    return loc.startsWith('th') ? 'th' : 'en';
  }

  // Every shortcut in DICT is written in its original ⌘⇧ form, but every one of them is REBINDABLE —
  // so those literals are tokens for "whatever this action is bound to today", not facts. They stopped
  // being facts the moment snip/type/speak moved off ⌘⇧ to Alt+letter: the pill said Alt+S while the ⧉
  // tooltip, the empty state and the Settings note all still said Ctrl+Shift+S (jek, 2026-08-07).
  // index.js hands the live map in after every shortcuts read or re-key; until then t() falls through
  // to the written form, so a missing call degrades to the old behaviour rather than to blanks.
  //
  // Substituted BEFORE keyify: the replacements arrive already in display form ("Alt+S"), and running
  // them through the glyph rules again is how "Ctrl+Shift+" would turn up inside a string that never
  // had a ⌘ in it.
  // ONE pass over the string, not one pass per token, and that is a correctness point rather than a
  // speed one. Chained replaceAll calls feed their own output to the next token: on macOS the
  // replacements are themselves ⌘⇧ glyph strings, so binding snip to ⌘⇧T rewrites '⌘⇧S' → '⌘⇧T' and
  // then the '⌘⇧T' token rewrites that same text again into whatever Type is bound to. The user reads
  // the wrong key, and only on the platform where the glyphs collide. A single regex alternation
  // cannot re-enter what it just wrote.
  let keycaps = null;   // { '⌘⇧S': 'Alt+S', ... }
  let capsRe = null;    // /⌘⇧S|⌘⇧T|…/g over exactly the tokens present
  const recap = (s) => {
    if (!capsRe || typeof s !== 'string') return s;
    capsRe.lastIndex = 0;
    return s.replace(capsRe, (m) => keycaps[m] || m);
  };
  function setKeycaps(map) {
    keycaps = map || null;
    // The tokens are ⌘⇧-and-arrow glyphs — nothing regex treats as syntax — so they go in as written.
    const toks = keycaps ? Object.keys(keycaps).filter((k) => keycaps[k]) : [];
    capsRe = toks.length ? new RegExp(toks.join('|'), 'g') : null;
    applyI18n(); // re-render in place: most of these strings are already on screen
  }

  function t(key) {
    const d = DICT[uiLang] || DICT.en;
    return keyify(recap((key in d) ? d[key] : (DICT.en[key] != null ? DICT.en[key] : key)));
  }

  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-tip]').forEach((el) => { el.dataset.tip = t(el.dataset.i18nTip); });
  }

  // Set the language ('auto'|'en'|'th') and re-render every marked element in place.
  function setUiLang(pref) {
    uiLang = resolve(pref);
    applyI18n();
    document.documentElement.lang = uiLang;
  }

  window.i18n = { t, applyI18n, setUiLang, setKeycaps, resolve, get lang() { return uiLang; } };

  // Localize immediately from the OS locale so a Thai user never sees an English flash before the
  // async getSettings() arrives. index.js re-applies once if the saved uiLang is an explicit en/th.
  // (This script is loaded at the end of <body>, so the elements above already exist.)
  setUiLang('auto');
})();
