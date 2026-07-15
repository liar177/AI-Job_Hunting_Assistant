/** @type {import('tailwindcss').Config} */

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,vue}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1e3a5f',
          50: '#f0f5fa',
          100: '#dbe7f5',
          200: '#b3cce8',
          300: '#8bb2db',
          400: '#5b8ec9',
          500: '#3b6fa8',
          600: '#1e3a5f',
          700: '#1a3354',
          800: '#152a45',
          900: '#0f1f33',
        },
        accent: {
          DEFAULT: '#00d4aa',
          light: '#33ddbb',
          dark: '#00b894',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
