/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0d12',
        panel: '#12161d',
        'panel-raised': '#171c25',
        line: '#212a35',
        text: '#e6eaf0',
        muted: '#7c8797',
        signal: '#e8a33d',
        status: {
          pending: '#57616f',
          'in-progress': '#e8a33d',
          blocked: '#e5484d',
          done: '#3ecf8e',
          'spec-ready': '#8b7fe8',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.18em' }],
      },
      keyframes: {
        caret: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        caret: 'caret 1.1s step-end infinite',
      },
    },
  },
  plugins: [],
};
