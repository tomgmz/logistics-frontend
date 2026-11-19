"""Writes a Playwright run (e2e-last-run.json) into docs/testing/8338 Test Cases.xlsx.

For each case ID that ran, fills the yellow columns on the Test Cases sheet:
  Status          Pass / Fail / Blocked (skipped) — Fail if ANY browser failed
  Actual result   what happened, per browser; for a failure the error and the
                  screenshot / trace paths
  Tested by       "Playwright (automated)"
  Date tested     the run date
  Browser/device  every browser it ran in, with its result
Then adds one row to the Run History sheet. Rows of cases that did not run
are left untouched. Run by e2e/support/excel-reporter.ts after every run, or
by hand: npm run test:e2e:excel
"""
import json, os, sys
from datetime import datetime
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

HERE = os.path.dirname(os.path.abspath(__file__))
WORKBOOK = os.environ.get('E2E_WORKBOOK') or os.path.normpath(os.path.join(HERE, '..', '..', '..', 'docs', 'testing', '8338 Test Cases.xlsx'))
BROWSER = {'chromium': 'Chrome', 'edge': 'Edge', 'firefox': 'Firefox', 'webkit': 'Safari (WebKit)', 'iphone': 'iPhone 13 mini'}
STATUS = {'passed': 'Pass', 'failed': 'Fail', 'timedOut': 'Fail', 'interrupted': 'Blocked', 'skipped': 'Blocked'}

FONT = 'Arial'
BODY = Font(name=FONT, size=10)
THIN = Side(style='thin', color='D1D5DB')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical='top')
HDR_FILL = PatternFill('solid', fgColor='1F2937')
HDR_FONT = Font(name=FONT, bold=True, color='FFFFFF', size=10)


def main(path):
    run = json.load(open(path, encoding='utf8'))
    tests = run['tests']
    if not tests:
        print('[excel] nothing to write'); return
    when = datetime.fromisoformat(run['finished'].replace('Z', '+00:00')).astimezone()

    by_id = {}
    for t in tests:
        by_id.setdefault(t['id'], []).append(t)

    try:
        wb = load_workbook(WORKBOOK)
    except PermissionError:
        print(f'[excel] {WORKBOOK} is open in Excel. Close it and run: npm run test:e2e:excel'); sys.exit(1)
    ws = wb['Test Cases']
    head = {c.value: c.column for c in ws[1]}
    col = lambda name: head[name]

    updated, unknown = 0, []
    rows = {ws.cell(row=r, column=1).value: r for r in range(2, ws.max_row + 1)}
    for cid, runs in by_id.items():
        r = rows.get(cid)
        if not r:
            unknown.append(cid); continue
        results = [STATUS.get(t['status'], 'Blocked') for t in runs]
        status = 'Fail' if 'Fail' in results else ('Pass' if all(x == 'Pass' for x in results) else 'Blocked')
        lines = []
        for t in sorted(runs, key=lambda t: t['project']):
            b = BROWSER.get(t['project'], t['project'])
            res = STATUS.get(t['status'], 'Blocked')
            if res == 'Pass':
                lines.append(f'{b}: passed ({t["duration"] / 1000:.1f} s).')
            elif res == 'Fail':
                lines.append(f'{b}: FAILED. {t["error"].strip()}')
                for a in t['attachments']:
                    if a.endswith(('.png', '.zip', '.webm')):
                        lines.append(f'   evidence: logistics-frontend/{a.replace(os.sep, "/")}')
            else:
                lines.append(f'{b}: not run ({t["status"]}).')
        actual = '\n'.join(lines)
        if status == 'Pass':
            actual = 'Automated (Playwright): behaved as expected.\n' + actual
        ws.cell(row=r, column=col('Status'), value=status)
        ws.cell(row=r, column=col('Actual result'), value=actual[:32000])
        ws.cell(row=r, column=col('Tested by'), value='Playwright (automated)')
        d = ws.cell(row=r, column=col('Date tested'), value=when.replace(tzinfo=None))
        d.number_format = 'yyyy-mm-dd hh:mm'
        ws.cell(row=r, column=col('Browser / device'), value=', '.join(
            f'{BROWSER.get(t["project"], t["project"])} ({STATUS.get(t["status"], "Blocked")})' for t in sorted(runs, key=lambda t: t['project'])))
        updated += 1

    # Run History: one row per run.
    if 'Run History' not in wb.sheetnames:
        h = wb.create_sheet('Run History', 1)
        for i, (name, w) in enumerate([('Run finished', 18), ('Browsers', 34), ('Cases run', 10), ('Passed', 9),
                                       ('Failed', 9), ('Blocked', 9), ('Duration (min)', 13), ('Failed cases', 60)], 1):
            c = h.cell(row=1, column=i, value=name); c.font, c.fill, c.border = HDR_FONT, HDR_FILL, BORDER
            h.column_dimensions[c.column_letter].width = w
        h.freeze_panes = 'A2'
    h = wb['Run History']
    per_case = {cid: ('Fail' if any(STATUS.get(t['status']) == 'Fail' for t in runs)
                      else 'Pass' if all(STATUS.get(t['status']) == 'Pass' for t in runs) else 'Blocked')
                for cid, runs in by_id.items()}
    failed = sorted(c for c, s in per_case.items() if s == 'Fail')
    row = h.max_row + 1
    vals = [when.replace(tzinfo=None),
            ', '.join(sorted({BROWSER.get(t['project'], t['project']) for t in tests})),
            len(per_case), sum(s == 'Pass' for s in per_case.values()), len(failed),
            sum(s == 'Blocked' for s in per_case.values()), round(run['duration'] / 60000, 1), ', '.join(failed) or '-']
    for i, v in enumerate(vals, 1):
        c = h.cell(row=row, column=i, value=v); c.font, c.border, c.alignment = BODY, BORDER, WRAP
    h.cell(row=row, column=1).number_format = 'yyyy-mm-dd hh:mm'

    try:
        wb.save(WORKBOOK)
    except PermissionError:
        print(f'[excel] {WORKBOOK} is open in Excel. Close it and run: npm run test:e2e:excel'); sys.exit(1)
    print(f'[excel] Updated {updated} case(s) in docs/testing/8338 Test Cases.xlsx: '
          f'{vals[3]} passed, {vals[4]} failed, {vals[5]} blocked' + (f'. IDs not in the workbook: {", ".join(unknown)}' if unknown else ''))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'e2e-last-run.json')
