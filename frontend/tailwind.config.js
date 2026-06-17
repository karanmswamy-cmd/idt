/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6', // Teal
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        accent: {
          blue: '#3b82f6',
          orange: '#f97316',
          emerald: '#10b981',
          rose: '#f43f5e',
          violet: '#8b5cf6',
        },
        dark: {
          bg: '#030712',      // Very dark slate
          card: '#0f172a',    // Darker blue-gray
          border: '#1e293b',
          textMuted: '#94a3b8',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
