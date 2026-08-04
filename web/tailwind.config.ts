import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta del sidebar via CSS vars (light/dark en index.css).
        sidebar: {
          DEFAULT: 'var(--sidebar-bg)',
          bottom: 'var(--sidebar-bottom)',
          text: 'var(--sidebar-text)',
          dim: 'var(--sidebar-dim)',
          border: 'var(--sidebar-border)',
          hover: 'var(--sidebar-hover)',
          strong: 'var(--sidebar-strong)',
          active: 'var(--sidebar-active)',
          activebg: 'var(--sidebar-activebg)',
        },
        accent: {
          glow: '#2ee6a8',   // CIRCUITO · esmeralda técnica
          deep: '#0d9f6e',
        },
        // Semantic tokens (HSL channel format for alpha support)
        background: 'hsl(var(--background) / <alpha-value>)',
        surface: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          2: 'hsl(var(--surface-2) / <alpha-value>)',
        },
        card: 'hsl(var(--surface) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        'elev-1': '0 1px 2px -1px hsl(var(--shadow-color) / 0.08), 0 2px 6px -2px hsl(var(--shadow-color) / 0.10)',
        'elev-2': '0 2px 4px -2px hsl(var(--shadow-color) / 0.10), 0 8px 24px -6px hsl(var(--shadow-color) / 0.14)',
        'elev-3': '0 8px 32px -8px hsl(var(--shadow-color) / 0.20)',
        'glow-accent': '0 0 0 1px hsl(var(--ring) / 0.20), 0 0 24px -6px hsl(var(--ring) / 0.35)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
