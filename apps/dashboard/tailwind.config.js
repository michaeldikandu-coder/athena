/**
 * Athena console theme, from the tasteskill deal (plan in src/app/globals.css):
 * palette cool-white-slate, type Geist + Geist Mono, radius sharp, buttons solid.
 * Every colour is a CSS variable so there is one source of truth.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        hover: 'var(--hover)',
        ink: { DEFAULT: 'var(--ink)', soft: 'var(--ink-soft)' },
        muted: 'var(--muted)',
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        action: { DEFAULT: 'var(--action)', ink: 'var(--action-ink)', soft: 'var(--action-soft)', line: 'var(--action-line)' },
        ok: { DEFAULT: 'var(--ok)', soft: 'var(--ok-soft)', line: 'var(--ok-line)' },
        warn: { DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)', line: 'var(--warn-line)' },
        bad: { DEFAULT: 'var(--bad)', soft: 'var(--bad-soft)', line: 'var(--bad-line)' },
        inv: { DEFAULT: 'var(--inv-bg)', surface: 'var(--inv-surface)', ink: 'var(--inv-ink)', muted: 'var(--inv-muted)' },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
      },
      fontSize: {
        label: ['13px', { lineHeight: '1.4' }],
      },
      transitionTimingFunction: {
        ui: 'cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
};
