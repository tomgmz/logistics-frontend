// npm run build:e2e — builds the web app into .next-e2e with the TEST settings
// from e2e/support/env.cjs (never the production Supabase project).
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { webEnv } = require('./env.cjs')

const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true, env: { ...process.env, ...webEnv } })
process.exit(r.status ?? 1)
