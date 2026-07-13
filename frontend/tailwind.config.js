/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#1B2875',
        'brand-accent': '#2E3FD6',
        'brand-gradient-from': '#0D1444',
        'brand-gradient-to': '#3B4FE8',
      },
    },
  },
  plugins: [],
}
