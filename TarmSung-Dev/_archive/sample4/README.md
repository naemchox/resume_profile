# Liquid Luxe — Maison · A Symphony of Four

An editorial, luxury-magazine style scroll experience for four soft drinks (Vasari, Kolara, Solara, Zephyr). As the visitor scrolls, full-screen pastel "chapters" are revealed through expanding circular clip-path wipes while four product cans orbit on a shared ring, the active drink always settling at the south position. The look pairs serif display type with film grain, watermark numerals, and a refined desaturated palette per flavor.

## Features
- Scroll-driven storytelling across four flavor "folios" with an 800vh scroll space
- Circular `clip-path` reveals that grow each section into view, eased with a Lenis-style virtual-scroll lerp (no scroll hijacking)
- Shared fixed orbit of four product cans; rotation is computed from scroll so the active can lands at the bottom, with neighbouring cans crossfading through a 90° transition arc
- Mouse-follow spring "jiggle" — each can leans and wobbles toward the cursor with damped-spring physics
- Per-line title rise and staggered fade transitions between sections
- Vertical Roman-numeral section index with click-to-jump smooth scrolling and `mix-blend-mode: difference` for legibility over any palette
- Ambient rising "bubble" particles generated per section
- SVG fractal-noise film grain overlay and large watermark numerals
- Fixed "Order Now" CTA, responsive layout, and `prefers-reduced-motion` handling (disables glide, particles, and spring motion)

## Tech Stack
- Plain HTML, CSS, and vanilla JavaScript (no framework)
- `requestAnimationFrame` animation loop with custom smoothstep/lerp easing and a spring system
- CSS `clip-path`, `mix-blend-mode`, gradients, and inline SVG (data-URI fractal noise grain)
- Google Fonts via CDN: Bodoni Moda, Jost, Inter
- Transparent PNG product renders as orbiting cans

## Files
- `sample4.html` — the complete page (markup, styles, and scripts inline)
- `sample4_Vasari-transparent.png` — Vasari can image used in the orbit
- `sample4_Kolara-transparent.png` — Kolara can image used in the orbit
- `sample4_Solara-transparent.png` — Solara can image used in the orbit
- `sample4_Zephyr-transparent.png` — Zephyr can image used in the orbit

## How to Run
Open `sample4.html` in a modern web browser. The four PNG files must stay in the same folder as the HTML. An internet connection is needed to load the Google Fonts; without it the page still works but falls back to system fonts.
