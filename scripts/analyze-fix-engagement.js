#!/usr/bin/env node

// Did a landed fix actually FIRE this gate round? Automates the per-round manual
// mining ("was the new drive path engaged?") that was done by hand/subagent every
// time (e.g. CL-001 variant A gate 085729Z: "ZERO across all 8 runs"). For a named
// signal field (default ownerAckCompletionPendingCount) it reports, per run: how
// many owner DRIVE traces fired, how many carried the signal non-zero, and how many
// of those reached a committed reconcile.
//
// Source: the owner "convergence decision trace" lines. These are console-only /
// debug-level BY DESIGN, so they appear ONLY in a run captured with decision traces
// present (DEBUG_LOGS / CAPTURE_LOGS). That capture mode perturbs the busy leader
// (see the debug-logs observer effect) — use it to characterize engagement, not to
// measure convergence rate. Reads the GZIPPED .full-logs/<scenario>/<node>.log.gz.
//
// Usage:
//   node scripts/analyze-fix-engagement.js <run-dir-or-log.gz...>
//   node scripts/analyze-fix-engagement.js --signal missingPublishedCount <...>
//   node scripts/analyze-fix-engagement.js --markdown <...>

import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const JSON_INDENT_SPACES = 2;
const NEWLINE = '\n';
const FLAG_MARKDOWN = '--markdown';
const FLAG_SIGNAL = '--signal';
const FLAG_HELP = '--help';
const SCHEMA_VERSION = 'fix-engagement-v1';
const TRACE_MSG = 'convergence decision trace';
const DRIVE_DECISION = 'drive';
const COMMITTED_OUTCOME = 'reconcile-committed';
const DEFAULT_SIGNAL = 'ownerAckCompletionPendingCount';
const GZIP_SUFFIX = '.log.gz';

// Pure: reduce an array of parsed trace objects to an engagement tally for one
// run, against the named signal field.
function tallyEngagement(traces, signalField) {
  const driveTraces = traces.filter((t) => t.decision === DRIVE_DECISION);
  const signalEngaged = driveTraces.filter((t) => Number(t[signalField]) > 0);
  const committedAfterEngage = signalEngaged.filter(
    (t) => t.outcome === COMMITTED_OUTCOME,
  );
  return {
    traceLines: traces.length,
    driveTraces: driveTraces.length,
    signalEngaged: signalEngaged.length,
    committedAfterEngage: committedAfterEngage.length,
  };
}

// Pure: extract the decision-trace objects from raw captured log lines.
function parseTraceLines(lines) {
  const traces = [];
  for (const line of lines) {
    if (!line.includes(TRACE_MSG)) {
      continue;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed && parsed.msg === TRACE_MSG) {
      traces.push(parsed);
    }
  }
  return traces;
}

function decompressLines(buffer) {
  return gunzipSync(buffer).toString(ENCODING_UTF8).split(NEWLINE);
}

// Pure: aggregate per-run tallies into the run-level verdict. Distinguishes
// "no decision traces at all" (the run was not captured with traces present —
// unmeasurable, NOT a verdict) from "traces present but the signal never fired"
// (genuinely inert — a clean round cannot validate the fix).
function summarizeRuns(runTallies, signalField) {
  const totalSignalEngaged = runTallies.reduce((sum, r) => sum + r.signalEngaged, 0);
  const totalTraceLines = runTallies.reduce((sum, r) => sum + r.traceLines, 0);
  const tracesPresent = totalTraceLines > 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    signalField,
    runs: runTallies.length,
    totalTraceLines,
    tracesPresent,
    totalSignalEngaged,
    inert: tracesPresent && totalSignalEngaged === 0,
    runsDetail: runTallies,
  };
}

async function collectLogGzFiles(target) {
  const stat = await fs.stat(target);
  if (stat.isFile()) {
    return target.endsWith(GZIP_SUFFIX) ? [target] : [];
  }
  const found = [];
  async function visit(dir) {
    const dirents = await fs.readdir(dir, {withFileTypes: true});
    for (const dirent of dirents) {
      const child = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        await visit(child);
      } else if (dirent.isFile() && dirent.name.endsWith(GZIP_SUFFIX)) {
        found.push(child);
      }
    }
  }
  await visit(target);
  return found.sort();
}

async function tallyTarget(target, signalField) {
  const files = await collectLogGzFiles(target);
  const traces = [];
  for (const file of files) {
    const buffer = await fs.readFile(file);
    traces.push(...parseTraceLines(decompressLines(buffer)));
  }
  return {
    label: path.basename(target),
    files: files.length,
    ...tallyEngagement(traces, signalField),
  };
}

function renderMarkdown(summary) {
  let verdict;
  if (!summary.tracesPresent) {
    verdict =
      '**NO DECISION TRACES CAPTURED** — this run was not captured with traces ' +
      'present (DEBUG_LOGS / CAPTURE_LOGS). Engagement is unmeasurable here, not inert.';
  } else if (summary.inert) {
    verdict =
      '**INERT: the signal never fired in any run** (a clean round cannot validate it).';
  } else {
    verdict = `Signal fired ${summary.totalSignalEngaged} time(s) across the runs.`;
  }
  const lines = [
    `# Fix engagement — signal \`${summary.signalField}\` — ${summary.runs} run(s)`,
    '',
    verdict,
    '',
    '| run | drives | signal>0 | committed after |',
    '| --- | --- | --- | --- |',
  ];
  for (const r of summary.runsDetail) {
    lines.push(
      `| ${r.label} | ${r.driveTraces} | ${r.signalEngaged} | ${r.committedAfterEngage} |`,
    );
  }
  return lines.join(NEWLINE);
}

function parseSignalFlag(argv) {
  const index = argv.indexOf(FLAG_SIGNAL);
  if (index >= 0 && argv[index + 1]) {
    return {signal: argv[index + 1], consumed: [index, index + 1]};
  }
  return {signal: DEFAULT_SIGNAL, consumed: []};
}

async function runCli(argv) {
  const {signal, consumed} = parseSignalFlag(argv);
  const targets = argv.filter(
    (a, i) => !a.startsWith('--') && !consumed.includes(i),
  );
  if (argv.includes(FLAG_HELP) || targets.length === 0) {
    return {
      ok: false,
      output:
        'usage: analyze-fix-engagement [--signal <field>] [--markdown] <run-dir-or-log.gz...>',
    };
  }
  const runTallies = [];
  for (const target of targets) {
    runTallies.push(await tallyTarget(target, signal));
  }
  const summary = summarizeRuns(runTallies, signal);
  return {
    ok: true,
    output: argv.includes(FLAG_MARKDOWN) ?
      renderMarkdown(summary) :
      JSON.stringify(summary, null, JSON_INDENT_SPACES),
  };
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli(process.argv.slice(2))
    .then((result) => {
      (result.ok ? process.stdout : process.stderr).write(result.output + NEWLINE);
      process.exitCode = result.ok ? EXIT_SUCCESS : EXIT_FAILURE;
    })
    .catch((error) => {
      process.stderr.write(String(error?.message ?? error) + NEWLINE);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  tallyEngagement,
  parseTraceLines,
  summarizeRuns,
  renderMarkdown,
  runCli,
};
