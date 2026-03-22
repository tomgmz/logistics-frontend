export const ASSETS = {

  //logo
  logo: '/final-logo.png',

  // Hero – Section 1
  heroContainers: '/landingpage/heroSection/hero-section-bg.png',
  // Trucks – Section 2
  cargoTruck:     '/landingpage/aboutSection/cargo-truck.png',
  l300Van:        '/landingpage/aboutSection/l300-van.png',
  // Brands – Section 3
  airspeed:       '/logos/airspeed.png',
  shopee:         '/logos/shopee.png',
  lazada:         '/logos/lazada.png',
  shein:          '/logos/shein.png',
  temu:           '/logos/temu.png',
  // Services – Section 4
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

export const SERVICES = [
  { img: ASSETS.svcContainers, label: 'Nationwide cargo movement' },
  { img: ASSETS.svcDelivery,   label: 'Smart delivery scheduling' },
  { img: ASSETS.svcTracking,   label: 'Real-time delivery visibility' },
  { img: ASSETS.svcTracking,   label: 'Complete delivery records' },
];

export const METRICS = [
  { value: '90%',   label: 'On-time delivery rate' },
  { value: '24/7',  label: 'Live tracking available' },
  { value: '500K+', label: 'Shipments managed' },
  { value: '4.9/5', label: 'Client rating' },
  { value: '15 min',label: 'Avg. support response' },
  { value: '99.5%', label: 'Transaction success rate' },
];

export const CYCLING_WORDS = ['MOVING', 'PERFORMANCE', 'EFFICIENCY', 'TRACKING', 'PRECISION', 'YOU'];

export const FAQS = [
  {
    q: 'How can I book as shipment?',
    a: 'Booking online or in our app. Enter the transit details, choose a service, and confirm to schedule your delivery.',
  },
  {
    q: 'Is real-time tracking available?',
    a: 'Track every shipment live using yuour tracking number for instant updates.',
  },
  {
    q: 'Which cargo types are supported?',
    a: 'FCL & LCL. Special handling available on request.',
  },
  {
    q: 'Where is my transaction history?',
    a: 'Access your account to view all past and current deliveries and payments',
  },
];
