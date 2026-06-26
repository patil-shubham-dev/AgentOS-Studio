#!/usr/bin/env node

/**
 * Workspace Quality Dashboard Report Generator
 *
 * Parses vitest JSON output and produces a structured quality report.
 * Usage: node scripts/workspace-quality-report.mjs <path-to-test-results.json>
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const resultsPath = process.argv[2]

if (!resultsPath || !existsSync(resultsPath)) {
  console.error('Usage: node scripts/workspace-quality-report.mjs <test-results.json>')
  process.exit(1)
}

const raw = readFileSync(resultsPath, 'utf-8')
const results = JSON.parse(raw)

const suites = extractSuites(results)
const summary = computeSummary(suites)
const report = generateHtml(summary, suites)

const outPath = resolve(process.cwd(), 'workspace-quality-report.html')
writeFileSync(outPath, report, 'utf-8')
console.log(`✅ Workspace Quality Report written to ${outPath}`)
console.log(`   Passed: ${summary.passed}/${summary.total} (${summary.passRate}%)`)
console.log(`   Failed: ${summary.failed}`)
console.log(`   Duration: ${summary.duration}ms`)

// Exit with error code if any tests failed or budgets exceeded
if (summary.failed > 0) {
  console.error('❌ Workspace Reliability Gate FAILED')
  process.exit(1)
}
if (summary.budgetViolations > 0) {
  console.error(`❌ ${summary.budgetViolations} performance budget(s) exceeded`)
  process.exit(1)
}

function extractSuites(data) {
  const suites = []

  if (data.testResults) {
    for (const file of data.testResults) {
      for (const suite of file.assertionResults || []) {
        suites.push({
          name: suite.fullName || suite.title,
          status: suite.status,
          tests: (suite.tests || suite.assertionResults || []).map(t => ({
            name: t.title || t.fullName,
            status: t.status,
            duration: t.duration || 0,
          })),
        })
      }
    }
  }

  // Alternative vitest JSON output format
  if (data.numTotalTestSuites !== undefined) {
    suites.push(...(data.testResults || []).map(r => ({
      name: r.name,
      status: r.status,
      tests: r.assertionResults?.map(a => ({
        name: a.title,
        status: a.status,
        duration: a.duration || 0,
      })) || [],
    })))
  }

  return suites
}

function computeSummary(suites) {
  let total = 0
  let passed = 0
  let failed = 0
  let duration = 0
  let budgetViolations = 0

  for (const suite of suites) {
    for (const test of suite.tests) {
      total++
      if (test.status === 'passed') passed++
      else if (test.status === 'failed') {
        failed++
        if (test.name.toLowerCase().includes('budget')) budgetViolations++
      }
      duration += test.duration || 0
    }
  }

  return {
    total,
    passed,
    failed,
    duration,
    budgetViolations,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
  }
}

function generateHtml(summary, suites) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Workspace Quality Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #09090b; color: #e2e8f0; padding: 32px;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 24px; }
    .summary {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px; margin-bottom: 32px;
    }
    .card {
      background: #1a1a1f; border-radius: 12px; padding: 16px;
      border: 1px solid #2a2a30;
    }
    .card .label { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
    .card .value { font-size: 22px; font-weight: 700; }
    .pass { color: #22c55e; }
    .fail { color: #ef4444; }
    .warn { color: #f59e0b; }
    table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    th { text-align: left; padding: 8px 12px; background: #1a1a1f; color: #6b7280; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #2a2a30; }
    td { padding: 8px 12px; border-bottom: 1px solid #1a1a20; }
    .suite-row td { font-weight: 600; background: #0d0d10; }
    .status-badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 500;
    }
    .status-passed { background: rgba(34,197,94,0.1); color: #22c55e; }
    .status-failed { background: rgba(239,68,68,0.1); color: #ef4444; }
    .footer { margin-top: 32px; font-size: 11px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <h1>📊 Workspace Quality Dashboard</h1>

  <div class="summary">
    <div class="card">
      <div class="label">Tests</div>
      <div class="value">${summary.total}</div>
    </div>
    <div class="card">
      <div class="label">Passed</div>
      <div class="value pass">${summary.passed}</div>
    </div>
    <div class="card">
      <div class="label">Failed</div>
      <div class="value fail">${summary.failed}</div>
    </div>
    <div class="card">
      <div class="label">Pass Rate</div>
      <div class="value ${summary.passRate >= 90 ? 'pass' : summary.passRate >= 70 ? 'warn' : 'fail'}">${summary.passRate}%</div>
    </div>
    <div class="card">
      <div class="label">Total Duration</div>
      <div class="value">${summary.duration}ms</div>
    </div>
    <div class="card">
      <div class="label">Budget Violations</div>
      <div class="value ${summary.budgetViolations > 0 ? 'fail' : 'pass'}">${summary.budgetViolations}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Suite</th><th>Tests</th><th>Passed</th><th>Failed</th><th>Status</th></tr>
    </thead>
    <tbody>
      ${suites.map(s => {
        const sPassed = s.tests.filter(t => t.status === 'passed').length
        const sFailed = s.tests.filter(t => t.status === 'failed').length
        return `
        <tr class="suite-row">
          <td>${s.name}</td>
          <td>${s.tests.length}</td>
          <td class="pass">${sPassed}</td>
          <td class="fail">${sFailed}</td>
          <td><span class="status-badge status-${sFailed > 0 ? 'failed' : 'passed'}">${sFailed > 0 ? 'FAILED' : 'PASSED'}</span></td>
        </tr>
        ${s.tests.map(t => `
        <tr>
          <td style="padding-left: 28px; font-size: 12px;">${t.name}</td>
          <td colspan="3" style="font-size: 12px; color: #6b7280;">${t.duration}ms</td>
          <td><span class="status-badge status-${t.status}">${t.status}</span></td>
        </tr>`).join('')}
        `
      }).join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated ${new Date().toISOString()} · AgenticOS Workspace Reliability Gate
  </div>
</body>
</html>`
}
