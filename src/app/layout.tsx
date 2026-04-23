import type { Metadata, Viewport } from 'next';
import ThemeRegistry from '@/components/ui/ThemeRegistry';
import CsrfInit from '@/components/CsrfInit';
import { alegreyaSansSC, aboreto, fredoka, leagueSpartan, eurostile } from '@/app/fonts';
import StoreProvider from '@/app/lib/store/StoreProvider';
import AuthRehydrator from '@/components/AuthRehydrator';
import AppToaster from '@/components/ui/AppToaster';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: '8338 Logistics Services — Premium Logistics. Industrial Precision.',
  description:
    'Book, track, and manage deliveries in one place. Real-time updates, seamless booking, and efficient support for all your logistics needs. Serving nationwide Philippines.',
  keywords: 'logistics, freight, delivery, cargo, Philippines, shipping, FMCG, warehousing',
  openGraph: {
    title: '8338 Logistics Services',
    description: 'Premium logistics. Industrial precision.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html 
      lang="en" 
      className={`scroll-smooth ${alegreyaSansSC.variable} ${aboreto.variable} ${fredoka.variable} ${leagueSpartan.variable} ${eurostile.variable}`}
    >
      <body suppressHydrationWarning className={`bg-[#0a0a0a] text-white overflow-x-hidden ${alegreyaSansSC.className}`}>
        <CsrfInit />
        <StoreProvider>
          <AuthRehydrator />
          <ThemeRegistry>{children}</ThemeRegistry>
        </StoreProvider>
        <AppToaster />
      </body>
    </html>
  );
}