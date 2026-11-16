import localFont from 'next/font/local';

/**
 * Every web font is a file in this repo (src/app/fonts), never fetched from
 * Google at build time: a Vercel build failed on 2026-11-16 when it couldn't
 * download Darker Grotesque ("module not found" in next/font/google).
 *
 * The files are Google Fonts' own Latin WOFF2s (all SIL Open Font License),
 * the same weights as before. Fredoka, League Spartan, Darker Grotesque and
 * Geist are variable fonts: one file covers the whole weight range.
 * To add a weight, download it from fonts.googleapis.com/css2 (Latin block)
 * into the family's folder and list it here.
 */

// next/font needs every value written out literally (no helpers).

// Alegreya Sans SC - headings, labels, statuses
export const alegreyaSansSC = localFont({
  src: [
    { path: './fonts/alegreya-sans-sc/alegreya-sans-sc-300.woff2', weight: '300', style: 'normal' },
    { path: './fonts/alegreya-sans-sc/alegreya-sans-sc-300-italic.woff2', weight: '300', style: 'italic' },
    { path: './fonts/alegreya-sans-sc/alegreya-sans-sc-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/alegreya-sans-sc/alegreya-sans-sc-400-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/alegreya-sans-sc/alegreya-sans-sc-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/alegreya-sans-sc/alegreya-sans-sc-500-italic.woff2', weight: '500', style: 'italic' },
    { path: './fonts/alegreya-sans-sc/alegreya-sans-sc-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/alegreya-sans-sc/alegreya-sans-sc-700-italic.woff2', weight: '700', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-alegreya-sc',
});

// Alegreya Sans - Body text (not small caps)
export const alegreyaSans = localFont({
  src: [
    { path: './fonts/alegreya-sans/alegreya-sans-300.woff2', weight: '300', style: 'normal' },
    { path: './fonts/alegreya-sans/alegreya-sans-300-italic.woff2', weight: '300', style: 'italic' },
    { path: './fonts/alegreya-sans/alegreya-sans-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/alegreya-sans/alegreya-sans-400-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/alegreya-sans/alegreya-sans-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/alegreya-sans/alegreya-sans-500-italic.woff2', weight: '500', style: 'italic' },
    { path: './fonts/alegreya-sans/alegreya-sans-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/alegreya-sans/alegreya-sans-700-italic.woff2', weight: '700', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-alegreya',
});

// Aboreto - Card text
export const aboreto = localFont({
  src: './fonts/aboreto/aboreto-400.woff2',
  weight: '400',
  display: 'swap',
  variable: '--font-aboreto',
});

// Fredoka (variable, 300-700)
export const fredoka = localFont({
  src: './fonts/fredoka/fredoka-300-700.woff2',
  weight: '300 700',
  display: 'swap',
  variable: '--font-fredoka',
});

// League Spartan (variable, 100-900)
export const leagueSpartan = localFont({
  src: './fonts/league-spartan/league-spartan-100-900.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-league-spartan',
});

// Eurostile Extended Black
export const eurostile = localFont({
  src: [
    {
      path: '../../public/fonts/Eurostile_Extd_Black_Italic.otf',
      weight: '900',
      style: 'italic',
    },
  ],
  variable: '--font-eurostile',
  display: 'swap',
  fallback: ['Arial Black', 'Impact', 'sans-serif'],
});

// Darker Grotesque - Messages, tables, text fields (variable, 400-800)
export const darkerGrotesque = localFont({
  src: './fonts/darker-grotesque/darker-grotesque-400-800.woff2',
  weight: '400 800',
  display: 'swap',
  variable: '--font-darker',
});

// DM Sans - the booking form's map location picker (variable, 400-700)
export const dmSans = localFont({
  src: './fonts/dm-sans/dm-sans-400-700.woff2',
  weight: '400 700',
  display: 'swap',
  variable: '--font-dm-sans',
});

// Geist - the `font-sans` default (variable, 100-900)
export const geist = localFont({
  src: './fonts/geist/geist-100-900.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-sans',
});
