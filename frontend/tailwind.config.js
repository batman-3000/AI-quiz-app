/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        warm: {
          light: '#FEFDFB',
          dark: '#32312F',
          mutedLight: '#F5F3EF',
          mutedDark: '#262524',
          borderLight: '#EBE9E4',
          borderDark: '#444340',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Geist', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
