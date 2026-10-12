/**
 * The client help assistant's knowledge: frequently asked questions about using
 * the client portal, and a small matcher that picks the best answer for what
 * the client typed.
 *
 * Deliberately rule-based, not an AI model: every answer here was written
 * against how the system actually behaves, so the assistant can't invent a
 * policy. When nothing matches well, it says so and offers a ticket.
 *
 * Keep answers in step with the system. The rules they describe live in:
 *   booking lead time / limits   backend booking.service (validateScheduleDate), lib/booking-limits
 *   approval + notifications     notification.service STAGE_CONFIG
 *   completion / report problem  booking.service confirmCompletionService, completion.scheduler
 */

export interface FaqEntry {
  id:        string
  question:  string
  answer:    string
  /** Words and short phrases that point at this answer. Lower case. */
  keywords:  string[]
  /** Where in the portal this is done, offered as a button with the answer. */
  link?:     { href: string; label: string }
  /** Ticket topic to pre-select if this answer didn't help. */
  category:  'booking' | 'delivery' | 'tracking' | 'documents' | 'account' | 'other'
  /** Only for visitors on the landing page (signed-in clients never need it). */
  audience?: 'public'
}

export const FAQ: FaqEntry[] = [
  {
    id: 'become-client',
    question: 'How do I become a client?',
    answer:
      'Accounts are set up by our team, so there is no sign-up form. Send us a message through the contact form ' +
      'on this page with your company name and what you need delivered, and we will reply by email. Once your ' +
      'account is ready you sign in with the email address you gave us.',
    keywords: ['become a client', 'sign up', 'signup', 'register', 'create account', 'get an account', 'new client', 'partner', 'work with you', 'apply'],
    category: 'account',
    audience: 'public',
  },
  {
    id: 'what-we-deliver',
    question: 'What do you deliver?',
    answer:
      'We move goods business to business, mainly fast-moving consumer goods (FMCG): from your warehouse or ' +
      'supplier to stores and distribution points, with a company truck and driver, live tracking and photo ' +
      'proof at every drop-off.',
    keywords: ['what do you deliver', 'services', 'service', 'fmcg', 'what kind', 'cargo type', 'goods', 'business', 'b2b', 'trucking'],
    category: 'other',
    audience: 'public',
  },
  {
    id: 'book',
    question: 'How do I book a delivery?',
    answer:
      'Go to Booking and follow the steps: the pickup point, up to 3 drop-off points, your cargo, then the ' +
      'date and call time. You don\'t choose the truck: our Operations Manager assigns the vehicle and driver ' +
      'after your booking is approved.',
    keywords: ['book', 'new booking', 'create a booking', 'order', 'how to book', 'make a booking', 'place a booking'],
    link: { href: '/client/booking', label: 'Open Booking' },
    category: 'booking',
  },
  {
    id: 'lead-time',
    question: 'How far ahead do I need to book?',
    answer:
      'At least one day ahead: the earliest date you can pick is tomorrow. You can book up to one month in ' +
      'advance (the same date next month). Call times are set in 5-minute steps.',
    keywords: ['same day', 'today', 'tomorrow', 'advance', 'ahead', 'earliest', 'lead time', 'urgent', 'rush', 'how soon'],
    link: { href: '/client/booking', label: 'Open Booking' },
    category: 'booking',
  },
  {
    id: 'hours',
    question: 'What are your office hours? Do you deliver on Sundays?',
    answer:
      'Our office reviews bookings Monday to Saturday, 8:00 AM to 5:00 PM. A booking sent outside those hours ' +
      'is still received and is reviewed on the next working day. Deliveries themselves run 7 days a week, ' +
      'Sundays included.',
    keywords: ['hours', 'office hours', 'open', 'sunday', 'weekend', 'holiday', 'saturday', 'time', 'closed'],
    category: 'booking',
  },
  {
    id: 'dropoffs',
    question: 'How many drop-off points can one booking have?',
    answer:
      'Up to 3 drop-off points per booking. If you need more, split them across two bookings. Our team plans the ' +
      'route order; the driver may change the order on the road (for example if a site is closed), and you ' +
      'will see where the truck is heading on Delivery Tracking.',
    keywords: ['drop off', 'dropoff', 'drop-off', 'destinations', 'stops', 'how many', 'multiple', 'more than'],
    category: 'booking',
  },
  {
    id: 'approval',
    question: 'How do I know if my booking was approved or rejected?',
    answer:
      'You get a notification (the bell at the top) as soon as the General Manager or the Company ' +
      'Administrator approves or rejects it. A rejection always includes the reason. You can see the status ' +
      'of every booking in Transaction History.',
    keywords: ['approved', 'approve', 'approval', 'rejected', 'declined', 'status', 'pending', 'still pending', 'waiting', 'accepted'],
    link: { href: '/client/history', label: 'Open Transaction History' },
    category: 'booking',
  },
  {
    id: 'rejected',
    question: 'My booking was rejected. What now?',
    answer:
      'The notification and the booking in Transaction History show the reason it was turned down. Fix what ' +
      'it mentions (often the date, cargo details or an address) and send a new booking. If the reason is ' +
      'unclear, open a ticket and we will explain.',
    keywords: ['rejected', 'reject', 'declined', 'denied', 'cancelled by', 'why rejected', 'reason'],
    link: { href: '/client/booking', label: 'Send a new booking' },
    category: 'booking',
  },
  {
    id: 'change-cancel',
    question: 'Can I change or cancel a booking?',
    answer:
      'Once a booking is approved, changes and cancellations go through our team so the vehicle and driver can ' +
      'be updated too. Open a ticket with the booking reference and what you need changed, and we will reply ' +
      'by email.',
    keywords: ['cancel', 'cancellation', 'change', 'edit', 'modify', 'reschedule', 'update booking', 'wrong date', 'wrong address'],
    category: 'booking',
  },
  {
    id: 'track',
    question: 'How do I track my delivery?',
    answer:
      'Every delivery can be followed live. Once the truck is on the road, clients see it move on the map under ' +
      'Delivery Tracking, with the estimated arrival at each drop-off, which drop-offs are done, and which one ' +
      'the driver is heading to. A photo is taken at every drop-off as proof.',
    keywords: ['track', 'tracking', 'where is', 'location', 'live', 'map', 'eta', 'arrival', 'when will', 'truck now'],
    link: { href: '/client/tracking', label: 'Open Delivery Tracking' },
    category: 'tracking',
  },
  {
    id: 'no-truck-on-map',
    question: 'Why can\'t I see the truck on the map?',
    answer:
      'The truck appears only while the delivery is in transit, from the moment the driver confirms loading at ' +
      'your pickup point. Before that the map shows the planned route. If it is in transit and still not ' +
      'showing, the driver may be in an area with no signal; the position updates again once they reconnect.',
    keywords: ['not showing', 'cant see', 'can\'t see', 'no truck', 'map empty', 'not moving', 'stuck', 'not updating'],
    link: { href: '/client/tracking', label: 'Open Delivery Tracking' },
    category: 'tracking',
  },
  {
    id: 'arrival-window',
    question: 'What does the planned arrival time mean?',
    answer:
      'Once a vehicle is assigned, each drop-off gets a planned arrival shown as a 30-minute window. While the ' +
      'truck is on the road, Delivery Tracking also shows a live estimate based on traffic.',
    keywords: ['planned', 'window', 'arrival time', 'estimate', 'late', 'delay', 'delayed', 'on time'],
    link: { href: '/client/tracking', label: 'Open Delivery Tracking' },
    category: 'tracking',
  },
  {
    id: 'multi-trip',
    question: 'My cargo needs more than one truckload. How does that work?',
    answer:
      'The same truck makes several trips: it loads at your pickup point, unloads at the drop-off, and comes ' +
      'back for the next load. Each load has its own loading and delivery photo. On Delivery Tracking a ' +
      'drop-off shows "2/3 loads" and is only marked done when the last load arrives.',
    keywords: ['trips', 'multiple trips', 'loads', 'truckload', 'too big', 'large', 'second trip', 'partial'],
    category: 'delivery',
  },
  {
    id: 'confirm-completion',
    question: 'The driver finished. Do I need to do anything?',
    answer:
      'Yes, please confirm it. When the last drop-off is done you get a notification and an email asking you to ' +
      'confirm the booking is complete, or to report a problem. If you do neither, it completes automatically ' +
      '3 days after delivery.',
    keywords: ['complete', 'completed', 'confirm', 'finished', 'done', 'delivered', 'mark complete', 'close booking'],
    link: { href: '/client/history', label: 'Open Transaction History' },
    category: 'delivery',
  },
  {
    id: 'report-problem',
    question: 'Something was wrong with my delivery. How do I report it?',
    answer:
      'Open the booking in Transaction History and choose "Report a problem" before you confirm it. That stops ' +
      'the automatic completion and alerts our Operations team. Once they mark it resolved you get a fresh 3 ' +
      'days to confirm, or to report again.',
    keywords: ['problem', 'issue', 'damaged', 'damage', 'missing', 'wrong', 'complaint', 'broken', 'short', 'incomplete', 'report'],
    link: { href: '/client/history', label: 'Open Transaction History' },
    category: 'delivery',
  },
  {
    id: 'proof',
    question: 'Where can I see the proof of delivery?',
    answer:
      'Open the booking in Transaction History. It shows the photo taken at each drop-off (with time, place and ' +
      'plate stamped on it), the loading photos, and the delivery documents our team has approved.',
    keywords: ['proof', 'pod', 'photo', 'picture', 'receipt', 'documents', 'delivery receipt', 'dr', 'signed', 'evidence'],
    link: { href: '/client/history', label: 'Open Transaction History' },
    category: 'documents',
  },
  {
    id: 'notifications',
    question: 'How will you contact me about my bookings?',
    answer:
      'Through the bell at the top of the portal (approval, rejection, delivery finished and more) and by email ' +
      'for the important steps, like a finished delivery that needs your confirmation. Support tickets are ' +
      'answered by email.',
    keywords: ['notification', 'notify', 'email', 'contact me', 'updates', 'alerts', 'bell', 'message'],
    category: 'account',
  },
  {
    id: 'password',
    question: 'I forgot my password or can\'t sign in.',
    answer:
      'On the sign-in page choose "Forgot password". Your request goes to our Company Administrator, who sends ' +
      'you a reset link or code by email. Any email address works for an account (Gmail, Yahoo, Outlook or a ' +
      'company domain), as long as you can receive mail there.',
    keywords: ['password', 'forgot', 'reset', 'sign in', 'login', 'log in', 'locked', 'cant login', 'otp', 'code'],
    category: 'account',
  },
  {
    id: 'account-details',
    question: 'How do I change my company details or contact person?',
    answer:
      'Company details are kept by our team so your bookings stay consistent. Open a ticket with what needs to ' +
      'change (company name, address, contact person, phone) and we will update it and confirm by email.',
    keywords: ['company name', 'address', 'contact person', 'phone number', 'change details', 'update account', 'profile', 'account'],
    category: 'account',
  },
  {
    id: 'pricing',
    question: 'How much does a delivery cost? How do I pay?',
    answer:
      'Rates depend on the route, the cargo and the vehicle, so our team quotes them directly rather than ' +
      'online. Send us your pickup and drop-off points and what you are moving (through the contact form, or a ' +
      'ticket in the help assistant if you are already a client) and we will reply by email with a quote.',
    keywords: ['how much', 'price', 'pricing', 'cost', 'rate', 'quote', 'pay', 'payment', 'invoice', 'billing', 'charge', 'fee'],
    category: 'other',
  },
  {
    id: 'second-driver',
    question: 'Why are there two drivers on my booking?',
    answer:
      'Routes longer than 30 km by road always get a second driver for safety. Shorter routes have one driver, ' +
      'sometimes with a helper.',
    keywords: ['two drivers', 'second driver', 'helper', 'crew', 'driver name', 'who is the driver', 'driver'],
    category: 'delivery',
  },
]

/* ── Matching ─────────────────────────────────────────────────────────────── */

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'i', 'my', 'me', 'we', 'our', 'to', 'of', 'for', 'and', 'or', 'it',
  'do', 'does', 'can', 'how', 'what', 'why', 'when', 'where', 'in', 'on', 'at', 'with', 'you', 'your', 'be',
  'this', 'that', 'there', 'please', 'hi', 'hello', 'po', 'ba', 'yung', 'ang', 'ng', 'sa', 'na',
])

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(text: string): string[] {
  return normalize(text).split(' ').filter((t) => t.length > 1 && !STOP.has(t))
}

export interface FaqMatch {
  entry: FaqEntry
  score: number
}

/**
 * Score every entry against the question: a matching keyword phrase is worth
 * more the longer it is, words shared with the FAQ's own question count a
 * little. Returns the best few, best first.
 */
export function matchFaq(question: string, limit = 3, publicVisitor = false): FaqMatch[] {
  const text  = ` ${normalize(question)} `
  const words = new Set(tokens(question))
  if (words.size === 0) return []

  return FAQ
    .filter((entry) => publicVisitor || entry.audience !== 'public')
    .map((entry) => {
      let score = 0
      for (const k of entry.keywords) {
        const phrase = normalize(k)
        if (!phrase) continue
        if (text.includes(` ${phrase} `)) score += phrase.includes(' ') ? 3 : 2
        else if (!phrase.includes(' ') && [...words].some((w) => w.length > 3 && (w.startsWith(phrase) || phrase.startsWith(w)))) score += 1
      }
      for (const w of tokens(entry.question)) if (words.has(w)) score += 0.5
      return { entry, score }
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** A match is confident enough to answer outright. Below it, offer choices. */
export const CONFIDENT_SCORE = 2.5

/** Shown as quick replies before the client types anything. */
export const STARTER_QUESTIONS = ['book', 'track', 'confirm-completion', 'report-problem', 'proof', 'password']
  .map((id) => FAQ.find((f) => f.id === id)!)

/** Quick replies for a visitor on the landing page. */
export const PUBLIC_STARTER_QUESTIONS = ['become-client', 'what-we-deliver', 'hours', 'track', 'pricing', 'password']
  .map((id) => FAQ.find((f) => f.id === id)!)
