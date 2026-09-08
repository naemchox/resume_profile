/**
 * Photographs. All first-party: the client supplied these and every one carries
 * the shop's own "MAYA GREEN OFFICIAL" watermark. Files live in `public/img/`,
 * so the paths below are absolute URLs served as-is (no bundler hashing) —
 * swapping a photo means dropping a new file in with the same name.
 *
 * Four of the eleven supplied photographs are deliberately not used; the reasons
 * are recorded in FACTS.md. Empty string = fall back to the styled placeholder.
 */
export const IMAGES: Record<string, string> = {
  // Brand plate
  brand_wall: '/img/brand-wall.jpg',

  // Menu / selection
  shelf_samurai: '/img/shelf-samurai.jpg',
  shelf_jars: '/img/shelf-jars.jpg',

  // The room
  counter: '/img/counter.jpg',
  lounge: '/img/lounge.jpg',
  terrace: '/img/terrace.jpg',

  // The frontage. storefront-wide.jpg is not here on purpose: it is a 2:1 crop
  // of the same photograph as storefront-day.jpg, so publishing both showed the
  // frontage twice in one scroll.
  storefront_day: '/img/storefront-day.jpg',
  storefront_night: '/img/storefront-night.jpg',
}

/**
 * Intrinsic pixel sizes, so every <img> can carry width/height. The layout
 * boxes already fix each photo's aspect ratio, so this is not about shift — it
 * is what lets the browser reserve and decode at the right size before the CSS
 * applies, and what the page falls back to if the stylesheet never arrives.
 * Update these together with the file: a stale pair is worse than none.
 */
export const DIMENSIONS: Record<string, [number, number]> = {
  brand_wall: [783, 522],
  shelf_samurai: [802, 676],
  shelf_jars: [387, 484],
  counter: [520, 650],
  lounge: [806, 1008],
  terrace: [806, 1008],
  storefront_day: [640, 800],
  storefront_night: [792, 990],
}
