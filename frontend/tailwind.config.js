/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette lifted from the login page — see globals.css's :root/.dark
        // comment for the full swatch this is drawn from.
        'brand-primary': '#211D8C',
        'brand-accent': '#4A44C4',
        'brand-panel': '#2A25A0',
        'brand-line-soft': '#332CAD',
        'brand-gradient-from': '#211D8C',
        'brand-gradient-to': '#2A25A0',
      },
    },
  },
  plugins: [],
}
