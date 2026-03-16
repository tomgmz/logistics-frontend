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
  airspeed:       'https://www.figma.com/api/mcp/asset/1c28598a-db52-4672-9792-6b8fabeb20ff',
  shopee:         'https://www.figma.com/api/mcp/asset/274d43c9-a084-4d02-ad38-80c99d078dad',
  lazada:         'https://www.figma.com/api/mcp/asset/fbccaf3d-7271-4c8b-a286-2c9a6ec0977a',
  shein:          'https://www.figma.com/api/mcp/asset/c849f8fc-9c95-4e0c-8428-c49b2fe4312a',
  temu:           'https://www.figma.com/api/mcp/asset/bba597bf-1daf-4d6f-b6e4-b09da4541dcd',
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
    q: 'What types of shipments do you handle?',
    a: 'We handle everything from small parcels to full truckload freight — domestic and international. Our fleet includes motorcycles, L300 vans, closed vans, wing vans, and 10-wheeler trucks.',
  },
  {
    q: 'Do you offer real-time tracking?',
    a: 'Yes. Every shipment gets a live tracking number with status updates from pickup to final delivery. Monitor via our web portal or contact our 24/7 support line.',
  },
  {
    q: 'How do I get a quote or start a partnership?',
    a: 'Fill out our contact form or reach us directly by phone or email. Our team typically responds within 15 minutes during business hours for all logistics inquiries.',
  },
  {
    q: 'What areas do you service?',
    a: 'We operate nationwide across the Philippines — with hubs in Metro Manila, Laguna, Cebu, and Davao. We also offer international freight forwarding across Southeast Asia.',
  },
];
