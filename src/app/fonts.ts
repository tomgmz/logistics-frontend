// src/app/fonts.ts

import { Aboreto, Fredoka, League_Spartan, Alegreya_Sans_SC } from 'next/font/google';
import localFont from 'next/font/local';

// Alegreya Sans SC - Body text
export const alegreyaSansSC = Alegreya_Sans_SC({
  weight: ['300', '400', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-alegreya',
});

// Aboreto - Card text
export const aboreto = Aboreto({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-aboreto',
});

// Fredoka
export const fredoka = Fredoka({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fredoka',
});

// League Spartan
export const leagueSpartan = League_Spartan({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-league-spartan',
});

// Eurostile Extended Black - Your uploaded font!
export const eurostile = localFont({
  src: [
    {
      path: '../../public/fonts/EurostileExtendedBlack.ttf',
      weight: '900',
      style: 'normal',
    },
    {
      path: '../../public/fonts/Eurostile_Extd_Black_Italic.otf',
      weight: '900',
      style: 'italic',
    },
  ],
  variable: '--font-eurostile',
  display: 'swap',
});