/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        nodo: {
          50: '#eefdf5',
          100: '#d6f8e3',
          500: '#12b76a',
          600: '#0a9c58',
          700: '#087f47',
          900: '#064a2a',
        },
      },
    },
  },
  plugins: [],
};
