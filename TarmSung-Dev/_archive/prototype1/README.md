# Ember

Ember is a single-page marketing and product site for a fictional direct-to-consumer brand of ultra-thin, vegan condoms sold on a recurring subscription cadence. The design leans into a playful "claymorphism" aesthetic — cream and peach backgrounds, cherry-pink accents, thick ink borders, and hand-drawn type — to make an often-clinical product feel warm, confident, and friendly.

## Features
- Animated WebGL hero and CTA backgrounds (a silk-mesh shader and an ember-glow shader) built on fbm noise with domain warping, sharing one animation loop and pausing when off-screen.
- Interactive product configurator (PDP) where selecting pack size, "vibe", and delivery cadence, plus toggling subscription vs. one-time purchase, live-updates pricing, per-unit price, and product labels.
- Multi-step guided quiz with a progress bar and back/next navigation.
- Custom animated cursor (dot plus trailing ring) that reacts to links and interactive elements.
- Light/dark theme toggle persisted in localStorage.
- Scroll-triggered reveal animations and stepwise section animations via IntersectionObserver.
- Looping marquee strip, tab/pill selectors, and a testimonials/reviews wall using avatar imagery.
- Accessibility touches including `prefers-reduced-motion` handling that disables shaders and motion.

## Tech Stack
- HTML5 and CSS3 (custom properties / design tokens, claymorphism styling, keyframe animations).
- Vanilla JavaScript (no framework).
- Vanilla WebGL1 fragment shaders for the animated backgrounds.
- Google Fonts via CDN: Fredoka, Nunito, Cormorant, and Caveat.
- Remote avatar images from `i.pravatar.cc`.

## Files
- `prototype1.html` — the complete website: markup, inline CSS, inline JavaScript, and inline GLSL shaders in one self-contained file.
- `README.md` — this document.

## How to Run
Open `prototype1.html` in any modern web browser (Chrome, Firefox, Safari, or Edge). An internet connection is recommended, as the page loads Google Fonts and avatar images from external CDNs. The animated backgrounds require a browser with WebGL support; without it the page falls back gracefully to its static styling.
