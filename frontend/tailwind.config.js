/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0d12',
        panel: '#12161d',
        'panel-raised': '#171c25',
        'row-hover': '#161b23',
        edge: '#1a2029',
        line: '#212a35',
        'line-strong': '#3a4452',
        faint: '#46505f',
        subtle: '#5b6472',
        muted: '#7c8797',
        dim: '#8b95a5',
        soft: '#c3cad4',
        text: '#e6eaf0',
        bright: '#f1f4f8',
        signal: '#e8a33d',
        'err-text': '#f5b9bb',
        'grid-dot': '#131820',
        status: {
          pending: '#46505f',
          'spec-drafting': '#4fa3e0',
          'spec-ready': '#8b7fe8',
          'in-progress': '#e8a33d',
          blocked: '#e5484d',
          done: '#3ecf8e',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.12em' }],
        tiny: ['0.6875rem', { lineHeight: '1rem' }],
        micro: ['0.65625rem', { lineHeight: '1rem' }],
        '2xs': ['0.71875rem', { lineHeight: '1rem' }],
        tag: ['0.625rem', { lineHeight: '1rem' }],
      },
      spacing: {
        1.75: '0.4375rem',
        2.25: '0.5625rem',
        2.75: '0.6875rem',
      },
      borderWidth: {
        1.5: '1.5px',
      },
      boxShadow: {
        card: '0 30px 70px rgba(0, 0, 0, 0.55)',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(#131820 1px, transparent 1px)',
      },
      backgroundSize: {
        dots: '26px 26px',
      },
      keyframes: {
        caret: {
          '0%, 45%': { opacity: '1' },
          '50%, 95%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        beacon: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '75%, 100%': { transform: 'scale(2.8)', opacity: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        caret: 'caret 1.1s step-end infinite',
        beacon: 'beacon 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'beacon-fast': 'beacon 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-fast': 'spin 0.8s linear infinite',
        'fade-in': 'fade-in 0.2s ease',
      },
    },
  },
  plugins: [],
};
