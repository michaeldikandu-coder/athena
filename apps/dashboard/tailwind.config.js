/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0d12',
          900: '#11141b',
          850: '#161a23',
          800: '#1c212c',
          700: '#2a3140',
          600: '#3b4457',
          400: '#8a93a6',
          300: '#b4bccb',
          100: '#e8ebf1',
        },
        accent: {
          500: '#8b7cf6',
          400: '#a497f8',
          600: '#6f5ef0',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
