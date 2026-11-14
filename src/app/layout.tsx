import type { Metadata, Viewport } from 'next';
import ThemeRegistry from '@/components/ui/ThemeRegistry';
import CsrfInit from '@/components/CsrfInit';
import IosViewportFix from '@/components/IosViewportFix';
import { alegreyaSansSC, alegreyaSans, aboreto, fredoka, leagueSpartan, eurostile, darkerGrotesque } from '@/app/fonts';
import StoreProvider from '@/lib/store/StoreProvider';
import QueryProvider from '@/lib/query/QueryProvider';
import { LastPageTracker } from '@/lib/navigation/lastPage';
import AuthRehydrator from '@/components/AuthRehydrator';
import AppToaster from '@/components/ui/AppToaster';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { SITE_URL } from '@/constants/site';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Each page sets only its own name; the template adds the site name.
  title: { default: '8338 Logistics Services', template: '%s | 8338 Logistics Services' },
  description:
    'Book, track, and manage deliveries in one place. Real-time updates, seamless booking, and efficient support for all your logistics needs. Serving nationwide Philippines.',
  keywords: 'logistics, freight, delivery, cargo, Philippines, shipping, FMCG, warehousing',
  openGraph: {
    title: '8338 Logistics Services',
    description: 'Premium logistics. Industrial precision.',
    type: 'website',
    siteName: '8338 Logistics Services',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html 
      lang="en" 
      className={cn("scroll-smooth", alegreyaSansSC.variable, alegreyaSans.variable, aboreto.variable, fredoka.variable, leagueSpartan.variable, eurostile.variable, darkerGrotesque.variable, "font-sans", geist.variable)}
      // "&" in small caps looks unlike an ampersand: 'Alegreya Amp' (globals.css,
      // unicode-range U+0026 only) draws it in regular Alegreya Sans, and every
      // other character falls through to the SC face.
      style={{ ['--font-alegreya-sc' as string]: `'Alegreya Amp', ${alegreyaSansSC.style.fontFamily}` }}
    >
      <body suppressHydrationWarning className={`bg-[#0a0a0a] text-white overflow-x-hidden ${alegreyaSansSC.className}`}
        style={{ fontFamily: 'var(--font-alegreya-sc)' }}>
        <CsrfInit />
        <IosViewportFix />
        <QueryProvider>
          <StoreProvider>
            <AuthRehydrator />
            <LastPageTracker />
            <ThemeRegistry>{children}</ThemeRegistry>
          </StoreProvider>
        </QueryProvider>
        <AppToaster />
      </body>
    </html>
  );
}