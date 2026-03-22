// ─── Figma MCP Asset URLs (fetched from the real design) ────────────────────
export const ASSETS = {

  //logo
  logo: '/final-logo.png',

  // Hero – Section 1
  heroContainers: 'https://www.figma.com/api/mcp/asset/53e8bb06-708b-4f54-8fca-444544e245b8',
  heroEllipse:    'https://www.figma.com/api/mcp/asset/5d4ec182-6dfb-498c-879d-6e3ad7ee5f4f',
  // Trucks – Section 2
  cargoTruck:     'https://www.figma.com/api/mcp/asset/c7896bf5-1325-41a3-9531-fbc4f9971c65',
  l300Van:        'https://www.figma.com/api/mcp/asset/ff058f69-265f-4707-a72e-378a5e04661c',
  // Brands – Section 3
  airspeed:       '/logos/airspeed.png',
  shopee:         '/logos/shopee.png',
  lazada:         '/logos/lazada.png',
  shein:          '/logos/shein.png',
  temu:           '/logos/temu.png',
  // Services – Section 4
  svcContainers:  'https://www.figma.com/api/mcp/asset/8d8a12a7-5abb-4816-baaf-1c3c3a4abb0b',
  svcDelivery:    'https://www.figma.com/api/mcp/asset/5f22acc7-5bd7-467b-9542-1dc0c452b9b1',
  svcTracking:    'https://www.figma.com/api/mcp/asset/808a5761-39ed-4de0-b84b-067d7fd4f6bf',
  sectionEllipse: 'https://www.figma.com/api/mcp/asset/45a4b0aa-e20c-487e-a19c-8ad60f56d1a7',

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
