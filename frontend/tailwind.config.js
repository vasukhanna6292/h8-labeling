/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Deep maroon palette — mat, sober, elegant
        gray: {
          950: '#0b0606',
          900: '#160c0c',
          800: '#231212',
          700: '#331a1a',
          600: '#4d2626',
          500: '#6a3636',
          400: '#966060',
          300: '#be9090',
          200: '#d9bcbc',
          100: '#ede0e0',
          50:  '#f8f3f3',
        },
        // Burgundy — primary actions (buttons, focus rings, draw mode)
        blue: {
          950: '#130606',
          900: '#220a0a',
          800: '#361212',
          700: '#4f1a1a',
          600: '#6e2222',
          500: '#8e2e2e',
          400: '#b55050',
          300: '#d48080',
          200: '#e8b4b4',
          100: '#f8e8e8',
        },
        // Wine — export & secondary actions (teal)
        teal: {
          700: '#3e1220',
          600: '#5c1a30',
          500: '#7a2240',
          400: '#a04060',
          300: '#c07080',
        },
        // Keep green semantic for success/completion
        green: {
          950: '#030a05',
          900: '#071408',
          800: '#0d2010',
          700: '#133018',
          600: '#1a4220',
          500: '#225630',
          400: '#328048',
          300: '#52a868',
          200: '#88cc9a',
          100: '#c4eacc',
        },
        // Keep red semantic for danger/errors
        red: {
          950: '#130404',
          900: '#200606',
          800: '#340a0a',
          700: '#4a1010',
          600: '#661818',
          500: '#882222',
          400: '#b04040',
          300: '#d07070',
          200: '#e8b0b0',
          100: '#f8e4e4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
