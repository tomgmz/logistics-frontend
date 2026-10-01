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

export const FAQS = [
  {
    q: 'How can I book as shipment?',
    a: 'Booking online or in our app. Enter the transit details, choose a service, and confirm to schedule your delivery.',
  },
  {
    q: 'Is real-time tracking available?',
    a: 'Track every shipment live using your tracking number for instant updates.',
  },
  {
    q: 'Which cargo types are supported?',
    a: 'FCL and LCL. Special handling available on request.',
  },
  {
    q: 'Where is my transaction history?',
    a: 'Access your account to view all past and current deliveries',
  },
];
