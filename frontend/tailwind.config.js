/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        rosterable: 'var(--rosterable)',
        unrosterable: 'var(--unrosterable)',
        standby: 'var(--standby)',
        locked: 'var(--locked)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        border: 'var(--border)',
      }
    }
  },
  plugins: []
}
