import { FAQ as HELP_FAQ } from '@/lib/support/faq'
export const ASSETS = {

  //logo
  logo: '/final-logo.png',

  // Hero
  heroContainers: '/landingpage/heroSection/hero-section-bg.png',
  // Trucks
  cargoTruck:     '/landingpage/aboutSection/cargo-truck.png',
  l300Van:        '/landingpage/aboutSection/l300-van.png',
  // Brands
  airspeed:       '/logos/airspeed.png',
  shopee:         '/logos/shopee.png',
  lazada:         '/logos/lazada.png',
  shein:          '/logos/shein.png',
  temu:           '/logos/temu.png',
  // Services
  svcContainers:  '/landingpage/servicesSection/svc-containers.jpg',
  svcDelivery:    '/landingpage/servicesSection/svc-delivery.jpg',
  svcTracking:    '/landingpage/servicesSection/svc-tracking.jpg',
  sectionEllipse: '/landingpage/servicesSection/section-ellipse.svg',

  // Metrics
  metricsBg:      '/landingpage/metrics-section/metricsbg.png',
};

export const BRANDS = [
  { src: ASSETS.airspeed, alt: 'Airspeed', className: 'h-8 w-auto' },
  { src: ASSETS.shopee,   alt: 'Shopee',   className: 'h-20 w-auto' },
  { src: ASSETS.lazada,   alt: 'Lazada',   className: 'h-12 w-auto' },
  { src: ASSETS.shein,    alt: 'Shein',    className: 'h-12 w-auto' },
  { src: ASSETS.temu,     alt: 'Temu',     className: 'h-20 w-20' },
];

export const CONTACT = {
  phone:   '+63 9685 536 8975',
  email:   '8338LogisticsServices@gmail.com',
  address: ['Blk. 6 Lot 8 Lynville Enclave,', 'Mamatid, City of Cabuyao, Laguna'],
};

export const SERVICES = [
  { img: ASSETS.svcContainers, label: 'Nationwide cargo movement' },
  { img: ASSETS.svcDelivery,   label: 'Smart delivery scheduling' },
  { img: ASSETS.svcTracking,   label: 'Real-time delivery visibility' },
  { img: ASSETS.svcTracking,   label: 'Complete delivery records' },
];


export const CYCLING_WORDS = ['MOVING', 'PERFORMANCE', 'EFFICIENCY', 'TRACKING', 'PRECISION', 'YOU'];

/**
 * The landing page FAQ: the four questions a company that isn't a client yet
 * asks first. Taken from the help assistant's own answers (lib/support/faq),
 * so the page and the chatbot always say the same thing.
 */
const LANDING_FAQ_IDS = ['become-client', 'what-we-deliver', 'track', 'pricing']

export const FAQS = LANDING_FAQ_IDS.map((id) => {
  const entry = HELP_FAQ.find((f) => f.id === id)
  if (!entry) throw new Error(`Landing FAQ "${id}" is missing from lib/support/faq`)
  return { q: entry.question, a: entry.answer }
})
