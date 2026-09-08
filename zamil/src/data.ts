/**
 * MAYA GREEN — real shop data.
 *
 * Everything in this file is transcribed from FACTS.md, which records where each
 * fact came from. Nothing here is invented. Two things are still unconfirmed and
 * are flagged in FACTS.md rather than smoothed over here:
 *
 *   1. The flower board reads "ALL 700B" with no unit. `/g` is the normal
 *      reading of a dispensary board, but the client has not confirmed it.
 *   2. Drink serving sizes (bottle vs glass) are inferred from the board's own
 *      group headings, not stated on the board.
 *
 * The tasting notes are written marketing copy based on each strain's generally
 * known character. They are NOT lab data and NOT supplied by the shop.
 */

export type Category = 'sativa' | 'hybrid' | 'indica' | 'drink'

export type Product = {
  id: string
  name: string
  /** Thai baht, as printed on the in-store board. */
  price: number
  /** Rendered after the price: 'g', 'bottle', 'glass', 'serve', or '' for each. */
  unit: string
  category: Category
  /** Drink board group heading, e.g. 'Beer'. Flower is grouped by category. */
  group?: string
  /** THC percentage from the board. Flower only. */
  thc?: number
  /** Key into IMAGES; '' falls back to the styled placeholder. */
  img: string
  blurb: string
}

/* ---------------------------------------------------------------- identity */

export const BRAND = 'MAYA GREEN'
export const BRAND_FULL = 'MAYA GREEN@Selected Cannabis Boutique'

export const ADDRESS_LINES = [
  '984, 49 Soi Pridi Banomyong 40',
  'Khwaeng Khlong Tan Nuea, Watthana',
  'Bangkok 10110',
]
export const ADDRESS_ONE_LINE = ADDRESS_LINES.join(', ')

export const PHONE_DISPLAY = '082 553 4873'
export const PHONE_HREF = 'tel:+66825534873'

/** Built from the confirmed address; resolves to the shop's own pin. */
export const MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ADDRESS_ONE_LINE)

export const INSTAGRAM = { handle: '@mayagreen.bangkok', href: 'https://www.instagram.com/mayagreen.bangkok/' }
export const TWITTER = { handle: '@MAYAGREEN420', href: 'https://twitter.com/MAYAGREEN420' }

/** Confirmed 2026-07-20 from the shop's own Google Business Profile. Tuesday is real. */
export const HOURS: [string, string][] = [
  ['Monday', '12:00 — 23:00'],
  ['Tuesday', 'Closed'],
  ['Wednesday — Sunday', '12:00 — 23:00'],
]
export const HOURS_SHORT = 'Mon · Wed – Sun  12:00 – 23:00'
export const HOURS_CLOSED = 'Closed Tuesdays'

/** Partner farms, from the shop's own Instagram bio. */
export const FARMS = ['#samuraiweed', '#izumogreenbangkok']

/* ------------------------------------------------------------------- menu */

export const NAV = [
  { label: 'Home', href: '#top' },
  { label: 'About us', href: '#about' },
  { label: 'Menu', href: '#products' },
  { label: 'Visit', href: '#contact' },
]

export const CATEGORIES: { name: string; filter: Category }[] = [
  { name: 'Sativa', filter: 'sativa' },
  { name: 'Hybrid', filter: 'hybrid' },
  { name: 'Indica', filter: 'indica' },
  { name: 'Drinks', filter: 'drink' },
]

export const TABS: { label: string; value: Category | null }[] = [
  { label: 'All', value: null },
  ...CATEGORIES.map((c) => ({ label: c.name, value: c.filter })),
]

/** Flat ฿700 across all eight strains — the board's own pricing. */
export const FLOWER_PRICE = 700

/**
 * The SAMURAI WEED board, transcribed 2026-07-25 from the client's photographs
 * of the shelf. Eight strains, one price. Izumo Green Bangkok is named as a
 * partner farm but has no board of its own, so nothing here is attributed to it.
 */
const FLOWER: Product[] = [
  {
    id: 'mimozz',
    name: 'Mimozz',
    price: FLOWER_PRICE,
    unit: 'g',
    category: 'sativa',
    thc: 27,
    img: 'shelf_jars',
    blurb: 'A sweet citrus nose in the Mimosa family — bright and clear-headed. A daytime strain.',
  },
  {
    id: 'super-lemon-haze',
    name: 'Super Lemon Haze',
    price: FLOWER_PRICE,
    unit: 'g',
    category: 'sativa',
    thc: 18,
    img: 'shelf_jars',
    blurb: 'The classic lemon-forward haze. A gentler percentage — light and lifted.',
  },
  {
    id: 'vegas-candy',
    name: 'Vegas Candy',
    price: FLOWER_PRICE,
    unit: 'g',
    category: 'hybrid',
    thc: 22,
    img: 'shelf_jars',
    blurb: 'Candy-sweet and well balanced — relaxed without going heavy.',
  },
  {
    id: 'runtz-of-eden',
    name: 'Runtz of Eden',
    price: FLOWER_PRICE,
    unit: 'g',
    category: 'hybrid',
    thc: 22,
    img: 'shelf_jars',
    blurb: 'Deep sweet fruit from the Runtz line. Smooth, and it settles in slowly.',
  },
  {
    id: 'queen-of-the-south',
    name: 'Queen of the South',
    price: FLOWER_PRICE,
    unit: 'g',
    category: 'hybrid',
    thc: 18,
    img: 'shelf_jars',
    blurb: 'A moderate percentage and easy to judge. A good place to start.',
  },
  {
    id: 'chimera',
    name: 'Chimera',
    price: FLOWER_PRICE,
    unit: 'g',
    category: 'indica',
    thc: 23,
    img: 'shelf_jars',
    blurb: 'Earthy with a sweet edge. Deeply relaxing — an evening strain.',
  },
  {
    id: 'dante-inferno',
    name: 'Dante Inferno',
    price: FLOWER_PRICE,
    unit: 'g',
    category: 'indica',
    thc: 29,
    img: 'shelf_jars',
    blurb: 'The highest percentage on our shelf. Rich and heavy — for experienced users.',
  },
  {
    id: 'cherry-inferno',
    name: 'Cherry Inferno',
    price: FLOWER_PRICE,
    unit: 'g',
    category: 'indica',
    thc: 28,
    img: 'shelf_jars',
    blurb: 'Sweet-tart cherry. Strong but rounded — for the end of the day.',
  },
]

/** The drink board, transcribed from the same set of photographs: 20 items, six groups. */
const DRINKS: Product[] = [
  {
    id: 'chandon',
    name: 'Chandon',
    price: 4000,
    unit: 'bottle',
    category: 'drink',
    group: 'Sparkling wine',
    img: '',
    blurb: 'Fine-bubbled sparkling wine. Easy, celebratory.',
  },
  {
    id: 'veuve-clicquot',
    name: 'Veuve Clicquot',
    price: 9000,
    unit: 'bottle',
    category: 'drink',
    group: 'Champagne',
    img: '',
    blurb: 'The classic from Reims — ripe fruit and baked bread.',
  },
  {
    id: 'dom-perignon',
    name: 'Dom Pérignon',
    price: 23000,
    unit: 'bottle',
    category: 'drink',
    group: 'Champagne',
    img: '',
    blurb: 'The legendary cuvée. Complex, fine, and grand.',
  },
  {
    id: 'leo',
    name: 'Leo',
    price: 120,
    unit: '',
    category: 'drink',
    group: 'Beer',
    img: '',
    blurb: 'Thai lager, soft and easy. Served cold.',
  },
  {
    id: 'singha',
    name: 'Singha',
    price: 140,
    unit: '',
    category: 'drink',
    group: 'Beer',
    img: '',
    blurb: 'A fuller Thai lager with clear hop character.',
  },
  {
    id: 'heineken',
    name: 'Heineken',
    price: 140,
    unit: '',
    category: 'drink',
    group: 'Beer',
    img: '',
    blurb: 'Imported lager — clean, with a crisp finish.',
  },
  {
    id: 'whiskey-soda',
    name: 'Whiskey Soda',
    price: 120,
    unit: '',
    category: 'drink',
    group: 'Highball / Sour',
    img: '',
    blurb: 'Whiskey and soda. Cold, dry, easy all night.',
  },
  {
    id: 'whiskey-coke',
    name: 'Whiskey Coke',
    price: 120,
    unit: '',
    category: 'drink',
    group: 'Highball / Sour',
    img: '',
    blurb: 'Whiskey and cola. Sweet and rounded.',
  },
  {
    id: 'lemon-sour',
    name: 'Lemon Sour',
    price: 120,
    unit: '',
    category: 'drink',
    group: 'Highball / Sour',
    img: '',
    blurb: 'Fresh lemon, in the Japanese sour style.',
  },
  {
    id: 'lychee-sour',
    name: 'Lychee Sour',
    price: 120,
    unit: '',
    category: 'drink',
    group: 'Highball / Sour',
    img: '',
    blurb: 'Sweet lychee cut with a light sourness.',
  },
  {
    id: 'red-wine',
    name: 'Red Wine',
    price: 150,
    unit: 'glass',
    category: 'drink',
    group: 'Wine / Shots',
    img: '',
    blurb: 'Red by the glass. Medium-bodied, easy.',
  },
  {
    id: 'white-wine',
    name: 'White Wine',
    price: 150,
    unit: 'glass',
    category: 'drink',
    group: 'Wine / Shots',
    img: '',
    blurb: 'White by the glass. Fresh and well chilled.',
  },
  {
    id: 'tequila',
    name: 'Tequila',
    price: 150,
    unit: 'serve',
    category: 'drink',
    group: 'Wine / Shots',
    img: '',
    blurb: 'Tequila, served as a shot.',
  },
  {
    id: 'coke-can',
    name: 'Coke (Can)',
    price: 50,
    unit: '',
    category: 'drink',
    group: 'Soft drinks',
    img: '',
    blurb: 'Cola by the can, served cold.',
  },
  {
    id: 'sprite',
    name: 'Sprite',
    price: 20,
    unit: '',
    category: 'drink',
    group: 'Soft drinks',
    img: '',
    blurb: 'Lemon-lime soda, crisp and cold.',
  },
  {
    id: 'fanta-green',
    name: 'Fanta (Green)',
    price: 20,
    unit: '',
    category: 'drink',
    group: 'Soft drinks',
    img: '',
    blurb: 'Green Fanta — the cream soda flavour.',
  },
  {
    id: 'fanta-strawberry',
    name: 'Fanta (Strawberry)',
    price: 20,
    unit: '',
    category: 'drink',
    group: 'Soft drinks',
    img: '',
    blurb: 'Strawberry Fanta, sweet and fragrant.',
  },
  {
    id: 'orange-juice',
    name: 'Orange Juice',
    price: 30,
    unit: '',
    category: 'drink',
    group: 'Soft drinks',
    img: '',
    blurb: 'Orange juice, served chilled.',
  },
  {
    id: 'pomegranate-juice',
    name: 'Pomegranate Juice',
    price: 30,
    unit: '',
    category: 'drink',
    group: 'Soft drinks',
    img: '',
    blurb: 'Pomegranate juice — sweet with a tart edge.',
  },
  {
    id: 'water',
    name: 'Water',
    price: 20,
    unit: '',
    category: 'drink',
    group: 'Soft drinks',
    img: '',
    blurb: 'Drinking water.',
  },
]

export const PRODUCTS: Product[] = [...FLOWER, ...DRINKS]

/** Board order, so the menu reads the way the shelf does. */
export const FLOWER_GROUPS: { label: Category; title: string }[] = [
  { label: 'sativa', title: 'Sativa' },
  { label: 'hybrid', title: 'Hybrid' },
  { label: 'indica', title: 'Indica' },
]

export const DRINK_GROUPS = [
  'Sparkling wine',
  'Champagne',
  'Beer',
  'Highball / Sour',
  'Wine / Shots',
  'Soft drinks',
]

/* -------------------------------------------------------------- formatting */

/** ฿ with thousands separators and no decimals — the way the boards print it. */
export const baht = (amount: number) => `฿${amount.toLocaleString('en-US')}`

/** e.g. "฿700 / g", "฿9,000 / bottle", "฿120". */
export const priceLabel = (p: Product) => (p.unit ? `${baht(p.price)} / ${p.unit}` : baht(p.price))

/* ----------------------------------------------------------------- footer */

export const EXPLORE = [
  { label: 'Sativa', href: '#products' },
  { label: 'Hybrid', href: '#products' },
  { label: 'Indica', href: '#products' },
  { label: 'Drinks', href: '#products' },
  { label: 'About us', href: '#about' },
  { label: 'Visit', href: '#contact' },
]
