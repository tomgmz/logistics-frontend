import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import SignedOutNotice from '@/components/layout/SignedOutNotice';
import SiteFooter from '@/components/layout/SiteFooter';
import HeroSection from '@/components/sections/HeroSection';
import AboutSection from '@/components/sections/AboutSection';
import BrandsSection from '@/components/sections/BrandsSection';
import ServicesSection from '@/components/sections/ServicesSection';
import MetricsSection from '@/components/sections/MetricsSection';
import FaqSection from '@/components/sections/FaqSection';
import ContactSection from '@/components/sections/ContactSection';
import { getPublicMetrics } from '@/lib/server/public-metrics';
import HelpAssistant from '@/components/support/HelpAssistant';
import { SITE_URL } from '@/constants/site';

// Only the landing page declares itself canonical; the layout would hand it to every page.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// Tells Google the site's name, so results read "8338 Logistics Services"
// instead of the bare domain above the title.
const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '8338 Logistics Services',
  alternateName: ['8338 Logistics', '8338logistics.delivery'],
  url: `${SITE_URL}/`,
};

export default async function HomePage() {
  const metrics = await getPublicMetrics();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
      />
      <SignedOutNotice />
      <Navbar />
      <main>
        <HeroSection />
        <AboutSection />
        <BrandsSection />
        <ServicesSection />
        <MetricsSection metrics={metrics} />
        <FaqSection />
        <ContactSection />
      </main>
      <SiteFooter />
      {/* FAQ assistant for visitors; points to the contact form when it can't help. */}
      <HelpAssistant audience="public" />
    </>
  );
}
