/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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
