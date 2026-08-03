/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff8f1',
          100: '#ffefdb',
          200: '#ffdcb3',
          300: '#ffc580',
          400: '#ffa64d',
          500: '#f57c00',
          600: '#e26600',
          700: '#e65100',
          800: '#b54300',
          900: '#8f3500',
          950: '#5c1f00',
        },
        success: {
          50: '#e8f5e9',
          100: '#c8e6c9',
          200: '#a5d6a7',
          300: '#81c784',
          400: '#66bb6a',
          500: '#43a047',
          600: '#388e3c',
          700: '#2e7d32',
          800: '#1b5e20',
          900: '#16451a',
          950: '#0a2e10',
        },
        canvas: {
          DEFAULT: '#FAFAF8',
          dark: '#121212',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#1E1E1E',
          raised: '#242424',
        },
        line: {
          DEFAULT: '#E0E0E0',
          dark: '#333333',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};