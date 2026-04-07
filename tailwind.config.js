/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'Cambria', 'serif'],
      },
      colors: {
        // Light theme
        surface: {
          DEFAULT: '#FAFAFA',
          secondary: '#F4F4F5',
          tertiary: '#E4E4E7',
        },
        // Dark theme (Catppuccin Mocha inspired)
        dark: {
          base: '#1E1E2E',
          mantle: '#181825',
          crust: '#11111B',
          surface0: '#313244',
          surface1: '#45475A',
          surface2: '#585B70',
          text: '#CDD6F4',
          subtext: '#BAC2DE',
          overlay: '#6C7086',
        },
        accent: {
          DEFAULT: '#3B82F6',
          dark: '#89B4FA',
        },
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: theme('colors.zinc.800'),
            code: {
              backgroundColor: theme('colors.zinc.100'),
              borderRadius: '0.25rem',
              padding: '0.125rem 0.375rem',
              fontWeight: '400',
            },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            pre: {
              backgroundColor: theme('colors.zinc.900'),
              color: theme('colors.zinc.100'),
            },
          },
        },
        invert: {
          css: {
            color: '#CDD6F4',
            code: {
              backgroundColor: '#313244',
            },
          },
        },
      }),
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
