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

export default async function HomePage() {
  const metrics = await getPublicMetrics();

  return (
    <>
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
    </>
  );
}
