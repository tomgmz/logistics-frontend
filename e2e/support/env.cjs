// Settings for the browser-test servers, built ONLY from
// logistics-backend/.env.e2e (the TEST Supabase project and R2 bucket).
//
// - Backend: every value from .env.e2e; every key that exists only in the
//   production .env is set to '' so nothing falls through to production
//   (dotenv never overwrites a value that is already set, even an empty one).
// - Web: a separate build in .next-e2e with the test Supabase project baked
//   in, the local API, and no Maps / push / captcha keys.
//
// Throws if anything still matches production.
const fs = require('node:fs')
const path = require('node:path')

const BACKEND = path.resolve(__dirname, '../../../logistics-backend')

// The test servers use their own ports so they never clash with `npm run dev`
// (3000/4000, which point at PRODUCTION).
const WEB_PORT = 3100
const API_PORT = 4100
const FRONTEND = path.resolve(__dirname, '../..')

function parse(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const test = parse(path.join(BACKEND, '.env.e2e'))
const prod = parse(path.join(BACKEND, '.env'))
const webProd = parse(path.join(FRONTEND, '.env.local'))

for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_FILES_BUCKET']) {
  if (!test[key]) throw new Error(`logistics-backend/.env.e2e: ${key} is not set`)
  if (test[key] === prod[key]) throw new Error(`logistics-backend/.env.e2e: ${key} is the PRODUCTION value. Refusing to run.`)
}

const backendEnv = {
  ...Object.fromEntries(Object.keys(prod).map((k) => [k, ''])),
  ...test,
  PORT: String(API_PORT),
  FRONTEND_URL: `http://localhost:${WEB_PORT}`,
  WEBAUTHN_ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
  // CORS + file framing: only the test web app.
  ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
  DISABLE_SCHEDULERS: '1',
}

const webEnv = {
  ...Object.fromEntries(Object.keys(webProd).map((k) => [k, ''])),
  NODE_ENV: 'production',
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}/api`,
  NEXT_PUBLIC_SUPABASE_URL: test.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: test.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: test.SUPABASE_SERVICE_ROLE_KEY,
  GEO_FORWARD_SECRET: test.GEO_FORWARD_SECRET,
  COOKIE_ENCRYPTION_KEY: test.E2E_COOKIE_ENCRYPTION_KEY,
  // Session cookies without `Secure` on http://localhost (WebKit drops them otherwise).
  E2E_LOCAL_HTTP: '1',
}

/** The shared password of every seeded test account. */
function seedPassword() {
  const manifest = path.join(BACKEND, 'scripts/seed-scenarios.manifest.e2e.json')
  if (!fs.existsSync(manifest)) throw new Error('Seed the test database first: npx tsx scripts/seed-scenarios.mjs --e2e')
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).password
}

const seedEmail = (tag) => `8338logisticsservice+seed.${tag}@gmail.com`

module.exports = { backendEnv, webEnv, seedPassword, seedEmail, BACKEND, WEB_PORT, API_PORT }
