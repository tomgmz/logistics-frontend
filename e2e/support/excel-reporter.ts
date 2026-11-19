import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/**
 * After every run, writes the results into docs/testing/8338 Test Cases.xlsx
 * (Status, Actual result, Tested by, Date tested, Browser / device) for each
 * case whose ID starts a test title ("AUTH-001 …"), and adds a row to the
 * Run History sheet. The update itself is e2e/support/update-excel.py.
 *
 * The raw results are kept in e2e-last-run.json, so if the workbook was open
 * in Excel (locked), close it and run: npm run test:e2e:excel
 */
// One or more case IDs at the start of a title: "AUTH-001 …" or "CLI-042 E2E-001 …".
const IDS = /^((?:[A-Z][A-Z0-9]*-\d{3}\s+)+)/

type Row = { id: string; title: string; project: string; status: string; duration: number; error: string; attachments: string[] }

export default class ExcelReporter implements Reporter {
  private rows: Row[] = []
  private started = new Date()

  onTestEnd(test: TestCase, result: TestResult) {
    const m = (test.title + ' ').match(IDS)
    if (!m) return
    const project = test.parent.project()?.name ?? ''
    const err = result.errors[0]
    for (const id of m[1].trim().split(/\s+/)) {
      // A retried test reports once per try; keep the last.
      this.rows = this.rows.filter((r) => !(r.id === id && r.project === project))
      this.rows.push({
        id,
        title: test.title,
        project,
        status: result.status,
        duration: result.duration,
        error: err ? stripAnsi(err.message ?? String(err.value ?? '')).split('\n').slice(0, 6).join('\n') : '',
        attachments: result.attachments.filter((a) => a.path).map((a) => path.relative(process.cwd(), a.path!)),
      })
    }
  }

  onEnd(result: FullResult) {
    const out = path.resolve('e2e-last-run.json')
    fs.writeFileSync(out, JSON.stringify({
      started: this.started.toISOString(),
      finished: new Date().toISOString(),
      overall: result.status,
      duration: result.duration,
      tests: this.rows,
    }, null, 2))
    if (this.rows.length === 0) return
    const py = process.platform === 'win32' ? 'python' : 'python3'
    const r = spawnSync(py, [path.resolve('e2e/support/update-excel.py'), out], { stdio: 'inherit' })
    if (r.status !== 0) console.log('\n[excel] Workbook NOT updated. Close it in Excel if it is open, then run: npm run test:e2e:excel')
  }

  printsToStdio() { return false }
}

function stripAnsi(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
