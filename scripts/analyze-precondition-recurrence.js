#!/usr/bin/env node

// Measure how often each named non-deterministic PRECONDITION recurs across a
// statistical-gate's runs — the number the closure grammar's reproduced-before-fix
// rung (branch b) requires BEFORE a fix is authored. A fix gated on a precondition
// that recurs in 1/8 runs cannot be validated by a clean round; knowing the rate
// up front avoids the "landed correct but inert for multiple rounds" trap
// (CL-001 variant A, gates 075853Z + 085729Z).
//
// Input: the per-run reports a gate writes, scenarios[0].publicationConvergence
// (always present — does NOT need debug/capture logs, so no observer-effect run).
// Usage:
//   node scripts/analyze-precondition-recurrence.js test-output/reports/stat-gate-<ts>-run*.report.json
//   node scripts/analyze-precondition-recurrence.js --markdown <files...>

import fs from 'node:fs/promises';
import path from 'node:path';

import {runAnalyzerCliWhenDirect} from './distributed-analysis-runtime.js';

const ENCODING_UTF8 = 'utf8';
const JSON_INDENT_SPACES = 2;
const NEWLINE = '\n';
const FLAG_MARKDOWN = '--markdown';
const FLAG_HELP = '--help';
const SCHEMA_VERSION = 'precondition-recurrence-v1';

// Each precondition is a pure predicate over a run's publicationConvergence (pc).
// Fields are exactly those a gate run emits (verified against a real report).
const PRECONDITIONS = [
  {
    key: 'open_ack_stuck',
    label: 'OPEN publication with an outstanding ack (CL-001 variant A)',
    predicate: (pc) =>
      pc.publicationStatus === 'OPEN' && (pc.pendingAckCount || 0) >= 1,
  },
  {
    key: 'open_member_missing',
    label: 'OPEN publication missing a member (CL-001 variant B publication face)',
    predicate: (pc) =>
      pc.publicationStatus === 'OPEN' && (pc.missingPublishedCount || 0) >= 1,
  },
  {
    key: 'published_member_missing',
    label: 'PUBLISHED row still missing a member (CL-001 variant C trim/consumer-lag)',
    predicate: (pc) =>
      pc.publicationStatus === 'PUBLISHED' && (pc.missingPublishedCount || 0) >= 1,
  },
  {
    key: 'consumer_lag',
    label: 'owner stream revision in consumer_lag (followers unconsumed)',
    predicate: (pc) => pc?.publicationOwnerStream?.revision?.state === 'consumer_lag',
  },
];

function runLabelFromPath(filePath) {
  const base = path.basename(filePath);
  const match = base.match(/run(\d+)/u);
  return match ? `run${match[1]}` : base;
}

function extractPublicationConvergence(report) {
  return report?.scenarios?.[0]?.publicationConvergence ?? null;
}

// Pure: given an array of {label, report}, return the recurrence summary.
function summarizeRecurrence(runs) {
  const evaluated = runs.map(({label, report}) => {
    const pc = extractPublicationConvergence(report);
    const matched = pc ?
      PRECONDITIONS.filter((p) => {
        try {
          return p.predicate(pc);
        } catch {
          return false;
        }
      }).map((p) => p.key) :
      [];
    return {
      label,
      hasPublicationConvergence: pc !== null,
      passed: report?.scenarios?.[0]?.passed ?? null,
      matched,
    };
  });
  const totalRuns = evaluated.length;
  const preconditions = PRECONDITIONS.map((p) => {
    const observedRuns = evaluated
      .filter((r) => r.matched.includes(p.key))
      .map((r) => r.label);
    return {
      key: p.key,
      label: p.label,
      runsObserved: observedRuns.length,
      totalRuns,
      recurrenceRate: totalRuns > 0 ? observedRuns.length / totalRuns : 0,
      runs: observedRuns,
    };
  });
  return {schemaVersion: SCHEMA_VERSION, totalRuns, preconditions, runsDetail: evaluated};
}

function renderMarkdown(summary) {
  const lines = [
    `# Precondition recurrence — ${summary.totalRuns} run(s)`,
    '',
    '| precondition | runs | rate |',
    '| --- | --- | --- |',
  ];
  for (const p of summary.preconditions) {
    lines.push(
      `| ${p.label} | ${p.runsObserved}/${p.totalRuns} | ${p.recurrenceRate.toFixed(2)} |`,
    );
  }
  lines.push(
    '',
    'A fix gated on a precondition with a low rate cannot be validated by a clean',
    'gate round — measure here before authoring (closure-grammar reproduced rung b).',
  );
  return lines.join(NEWLINE);
}

async function readRun(filePath) {
  const text = await fs.readFile(filePath, ENCODING_UTF8);
  return {label: runLabelFromPath(filePath), report: JSON.parse(text)};
}

async function runCli(argv) {
  const args = argv.filter((a) => a !== FLAG_MARKDOWN);
  const markdown = argv.includes(FLAG_MARKDOWN);
  if (argv.includes(FLAG_HELP) || args.length === 0) {
    return {
      ok: false,
      output:
        'usage: analyze-precondition-recurrence [--markdown] <run.report.json...>',
    };
  }
  const runs = [];
  for (const filePath of args) {
    runs.push(await readRun(filePath));
  }
  const summary = summarizeRecurrence(runs);
  return {
    ok: true,
    output: markdown ?
      renderMarkdown(summary) :
      JSON.stringify(summary, null, JSON_INDENT_SPACES),
  };
}

runAnalyzerCliWhenDirect(import.meta.url, runCli);

export {
  PRECONDITIONS,
  extractPublicationConvergence,
  summarizeRecurrence,
  renderMarkdown,
  runCli,
};
