/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        lexnet: {
          // Primary — deep navy blues
          50: '#eef2ff',
          100: '#dce4fd',
          200: '#c1cffc',
          300: '#97aff9',
          400: '#6686f4',
          500: '#4263ed',
          600: '#2c42e2',
          700: '#2433cf',
          800: '#232ca8',
          900: '#1e2670',   // Primary base
          950: '#0f1340',   // Darkest / background
        },
        accent: {
          // Emerald green accent
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',   // Accent base
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        risk: {
          low: '#22c55e',       // Green — safe
          medium: '#f59e0b',    // Amber — warning
          high: '#ef4444',      // Red — critical
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          700: '#1e293b',
          800: '#0f172a',
          900: '#020617',
        },
      },
      borderRadius: {
        lexnet: '0.75rem',
      },
      boxShadow: {
        'lexnet': '0 4px 24px -1px rgba(15, 19, 64, 0.15), 0 2px 8px -2px rgba(15, 19, 64, 0.08)',
        'lexnet-lg': '0 10px 40px -3px rgba(15, 19, 64, 0.2), 0 4px 16px -4px rgba(15, 19, 64, 0.1)',
        'glow': '0 0 20px rgba(66, 99, 237, 0.35)',
        'glow-accent': '0 0 20px rgba(16, 185, 129, 0.35)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(66, 99, 237, 0.2)' },
          '50%': { boxShadow: '0 0 24px rgba(66, 99, 237, 0.5)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-right': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        'slide-left': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'slide-down': 'slide-down 0.4s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scale-in': 'scale-in 0.25s ease-out',
        'slide-right': 'slide-right 1.5s ease-in-out infinite',
        'slide-left': 'slide-left 0.3s ease-out',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-lexnet': 'linear-gradient(135deg, #0f1340 0%, #1e2670 50%, #2c42e2 100%)',
        'gradient-accent': 'linear-gradient(135deg, #047857 0%, #10b981 50%, #34d399 100%)',
      },
    },
  },
  plugins: [],
};
