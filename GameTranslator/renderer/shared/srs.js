// Shared SRS (spaced-repetition) logic — used by the pill AND (from M3 on) the main window.
// Plain script, no ES module — attaches everything to window.GTSrs.
//
// Each saved word gets a lazily-added `srs: { ease, interval, reps, due }` field once it's first
// reviewed. Words with no srs field yet (old entries, or never reviewed) are treated as due=0, i.e.
// due immediately — so nothing needs a migration pass.
(function () {
  const srsDue = (v) => (v.srs && v.srs.due) || 0;
  const isDue = (v) => srsDue(v) <= Date.now();

  // SM-2 lite. rating: 'again' | 'hard' | 'good' | 'easy'.
  //
  // 'hard' was missing until 2026-08-02, which left a real gap rather than a simplification: there
  // was no way to say "I got it, but barely". Anki's four buttons exist because that case is common
  // — you either lied with Good, which inflates the interval AND leaves ease untouched so the lie
  // compounds, or you lied with Again, which throws away a successful recall. Hard is what keeps
  // ease honest on the words you are actually struggling with.
  //
  // Anki's semantics, kept exactly: Hard multiplies the CURRENT interval by a flat 1.2 rather than
  // by ease (so a hard card grows slowly no matter how easy the card used to be), and drops ease by
  // 0.15 — the mirror of Easy's +0.15. Again still resets. Do not tweak the rest without
  // re-checking against the spec this was built from.
  function schedule(srs, rating) {
    srs = srs || { ease: 2.5, interval: 0, reps: 0, due: 0 };
    let { ease, interval, reps } = srs;
    const DAY = 86400000;
    if (rating === 'again') {
      return { ease: Math.max(1.3, ease - 0.2), interval: 0, reps: 0, due: Date.now() + 60000 };
    }
    reps += 1;
    if (rating === 'easy') ease = Math.min(2.7, ease + 0.15);
    if (rating === 'hard') ease = Math.max(1.3, ease - 0.15);
    if (reps === 1) interval = rating === 'easy' ? 3 : 1;
    else if (reps === 2) interval = rating === 'easy' ? 6 : (rating === 'hard' ? 2 : 3);
    else if (rating === 'hard') interval = Math.max(1, Math.round(interval * 1.2));
    else interval = Math.round(interval * ease * (rating === 'easy' ? 1.3 : 1));
    return { ease, interval, reps, due: Date.now() + interval * DAY };
  }

  window.GTSrs = { schedule, srsDue, isDue };
})();
