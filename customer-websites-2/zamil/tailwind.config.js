/** @type {import('tailwindcss').Config} */

/**
 * Two palettes, same token names, so no component has to know which one is on.
 * Pick with the THEME env var: THEME=lantern npm run standalone index2.html
 */
const THEMES = {
  /* The original: shopfront gold on near-black, forest green bands. */
  default: {
    forest: {
      DEFAULT: '#10513C',
      deep: '#0C3F2E',
      dark: '#082A1F',
      light: '#16624A',
    },
    gold: {
      DEFAULT: '#EFC75E',
      dark: '#DDB246',
    },
    cream: '#F3EFE4',
    /* The shopfront is gold on near-black, and the lounge is lit violet and
       green. Those three were missing from the palette, which is why seven
       sections of forest green read as one flat field. */
    night: {
      DEFAULT: '#04100B',
      soft: '#08190F',
    },
    neon: {
      violet: '#7C3AED',
      green: '#39D98A',
    },
    /* Text on the cream bands. */
    ink: {
      DEFAULT: '#12251B',
      soft: '#3D5348',
    },
  },

  /* Drawn from the shop's own interior photograph: a ceiling of warm Lanna
     lanterns over a living plant wall, with the BAR sign in hot pink neon and
     the cannabis-leaf sign in cyan-green. The blacks are warm rather than cold
     because every light in that room is a filament lamp, and the cream is the
     colour of a lit paper lantern rather than of paper. */
  lantern: {
    forest: {
      DEFAULT: '#1F5133', // the plant wall behind the counter
      deep: '#163B26',
      dark: '#0C2317',
      light: '#2E6B44',
    },
    gold: {
      DEFAULT: '#F2CB6B', // the wordmark, and the lantern glow itself
      dark: '#D9A94A',
    },
    cream: '#F7E9CE', // lit paper lantern, warmer than the original cream
    night: {
      DEFAULT: '#0A0705', // warm near-black, not the original blue-black
      soft: '#16100A',
    },
    neon: {
      violet: '#FF3D9A', // the BAR sign
      green: '#3BE8C0', // the cannabis-leaf sign
    },
    ink: {
      DEFAULT: '#22180C',
      soft: '#54452F',
    },
  },
}

const palette = THEMES[process.env.THEME] ?? THEMES.default

export default {
  // index.vite.html, not index.html: the latter is the generated bundle, and
  // scanning 300 kB of compiled output for class names is pointless.
  content: ['./index.vite.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: palette,
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['Jost', 'sans-serif'],
      },
      maxWidth: {
        shell: '1180px',
      },
      transitionDuration: {
        400: '400ms',
      },
    },
  },
  plugins: [],
}
