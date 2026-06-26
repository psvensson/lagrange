#!/usr/bin/env node

// Re-decision vs slowness discriminator for the rolling-restart convergence campaign.
//
// The metastable-reconfig reframe (2026-06-26) holds that the non-converging runs are
// not SLOW — they are stuck in a control-loop LIMIT CYCLE: the rebalancer re-issues a
// corrective `increase_replica_count` (ADD) for the SAME partition far faster than the
// corrective action can settle (a learner takes ~5s to catch up + promote), so the
// deficit it is reacting to is sustained by its own in-flight work. A run that is merely
// slow would dispatch ONE corrective move and then wait; a run in the limit cycle storms
// the same partition every ~1s.
//
// This automates the hand-mining that confirmed it on disk (gate 195141Z run1:
// sql_write_operations-p1 got 22 ADD dispatches over 66s at ~1s cadence while
// `replica_count_below_minimum: 2 < 3` persisted). Per partition it reports: how many
// corrective ADD dispatches fired, over what wall-window, the median inter-dispatch gap
// (the re-decision cadence), and whether the deficit was open across the storm — then a
// per-partition RE_DECISION vs BOUNDED verdict against the settle window.
//
// IMPORTANT (bistability): a storm is NECESSARY but not sufficient for FAIL — some
// PASSING runs storm too (gate 181818Z run2 stormed 108x and still converged) and escape
// the cycle within budget. So this is a MECHANISM detector (is the loop present + how
// hard is it cycling), not a pass/fail oracle. Use it to measure whether a damping/floor
// fix actually COLLAPSES the cycle (storm dispatch count + cadence drop toward ~1 per
// deficit at >= settle cadence), not to predict a single run's outcome.
//
// Reads the GZIPPED .full-logs/<scenario>/<node>.log.gz (the rebalancer dispatch lines
// are info-level and present in every captured gate run, unlike the debug decision
// traces that analyze-fix-engagement needs).
//
// Usage:
//   node scripts/analyze-redecision-storm.js <run-dir-or-log.gz...>
//   node scripts/analyze-redecision-storm.js --settle-ms 5000 --min-dispatches 5 <...>
//   node scripts/analyze-redecision-storm.js --markdown <...>

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
const FLAG_SETTLE_MS = '--settle-ms';
const FLAG_MIN_DISPATCHES = '--min-dispatches';
const FLAG_HELP = '--help';
const SCHEMA_VERSION = 'redecision-storm-v1';
const GZIP_SUFFIX = '.log.gz';
const DISPATCH_MSG = 'Executing rebalancing move';
const ADD_REASON = 'increase_replica_count';
const BELOW_MIN_FRAGMENT = 'replica_count_below_minimum';
// Learner catch-up + promotion settle window: a corrective ADD cannot take effect faster
// than this, so re-dispatching inside it is re-deciding against lagging state.
const DEFAULT_SETTLE_MS = 5000;
// A partition needs at least this many corrective dispatches before the inter-dispatch
// cadence is meaningful (two dispatches can be coincidence; a storm is a sequence).
const DEFAULT_MIN_DISPATCHES = 5;

// Pure: pull the corrective-ADD dispatch + deficit events out of raw log lines. Returns
// per-partition arrays of dispatch timestamps (ms) and deficit timestamps (ms).
function parseStormEvents(lines) {
  const dispatches = new Map();
  const deficits = new Map();
  for (const line of lines) {
    if (!line.includes(DISPATCH_MSG) && !line.includes(BELOW_MIN_FRAGMENT)) {
      continue;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || !parsed.entityId || !parsed.time) {
      continue;
    }
    const at = Date.parse(parsed.time);
    if (Number.isNaN(at)) {
      continue;
    }
    if (parsed.msg === DISPATCH_MSG && parsed.reason === ADD_REASON) {
      appendTo(dispatches, parsed.entityId, at);
    } else if (
      typeof parsed.reason === 'string' &&
      parsed.reason.includes(BELOW_MIN_FRAGMENT)
    ) {
      appendTo(deficits, parsed.entityId, at);
    }
  }
  return {dispatches, deficits};
}

function appendTo(map, key, value) {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

// Pure: median of a numeric array (0 for empty).
function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ?
    (sorted[mid - 1] + sorted[mid]) / 2 :
    sorted[mid];
}

// Pure: per-partition re-decision verdict. RE_DECISION when a partition is dispatched
// the corrective ADD at least minDispatches times with a median inter-dispatch gap below
// the settle window — i.e. it re-decides before its own prior action can have settled.
function classifyPartition(partitionId, timestamps, deficitTimestamps, options) {
  const {settleMs, minDispatches} = options;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(sorted[i] - sorted[i - 1]);
  }
  const medianGapMs = median(gaps);
  const spanMs = sorted.length > 1 ? sorted[sorted.length - 1] - sorted[0] : 0;
  const stormed =
    sorted.length >= minDispatches && medianGapMs > 0 && medianGapMs < settleMs;
  return {
    partitionId,
    dispatches: sorted.length,
    spanMs,
    medianGapMs,
    deficitEvents: deficitTimestamps.length,
    verdict: stormed ? 'RE_DECISION' : 'BOUNDED',
  };
}

// Pure: fold per-target partition classifications into a target-level summary.
function summarizeTarget(label, files, dispatches, deficits, options) {
  const partitions = [];
  for (const [partitionId, timestamps] of dispatches) {
    partitions.push(
      classifyPartition(
        partitionId,
        timestamps,
        deficits.get(partitionId) ?? [],
        options,
      ),
    );
  }
  partitions.sort((a, b) => b.dispatches - a.dispatches);
  const stormedPartitions = partitions.filter((p) => p.verdict === 'RE_DECISION');
  return {
    label,
    files,
    totalDispatches: partitions.reduce((sum, p) => sum + p.dispatches, 0),
    stormedPartitions: stormedPartitions.length,
    verdict: stormedPartitions.length > 0 ? 'RE_DECISION' : 'BOUNDED',
    partitions,
  };
}

function decompressLines(buffer) {
  return gunzipSync(buffer).toString(ENCODING_UTF8).split(NEWLINE);
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

async function analyzeTarget(target, options) {
  const files = await collectLogGzFiles(target);
  const dispatches = new Map();
  const deficits = new Map();
  for (const file of files) {
    const buffer = await fs.readFile(file);
    const events = parseStormEvents(decompressLines(buffer));
    mergeInto(dispatches, events.dispatches);
    mergeInto(deficits, events.deficits);
  }
  return summarizeTarget(
    path.basename(target),
    files.length,
    dispatches,
    deficits,
    options,
  );
}

function mergeInto(into, from) {
  for (const [key, values] of from) {
    const existing = into.get(key);
    if (existing) {
      existing.push(...values);
    } else {
      into.set(key, [...values]);
    }
  }
}

function renderMarkdown(summaries, options) {
  const lines = [
    `# Re-decision storm — settle-window ${options.settleMs}ms, ` +
      `min-dispatches ${options.minDispatches}`,
    '',
    'A `RE_DECISION` verdict means the rebalancer re-issued the corrective ADD for a ' +
      'partition faster than the action can settle — the metastable limit cycle, not ' +
      'slow drain. (A storm is necessary, not sufficient, for FAIL — see header.)',
    '',
  ];
  for (const summary of summaries) {
    lines.push(`## ${summary.label} — **${summary.verdict}**`);
    lines.push('');
    lines.push('| partition | ADD dispatches | span (s) | median gap (s) | deficit events | verdict |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const p of summary.partitions) {
      lines.push(
        `| ${p.partitionId} | ${p.dispatches} | ${(p.spanMs / 1000).toFixed(1)} | ` +
          `${(p.medianGapMs / 1000).toFixed(2)} | ${p.deficitEvents} | ${p.verdict} |`,
      );
    }
    lines.push('');
  }
  return lines.join(NEWLINE);
}

function parseNumericFlag(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) {
    const value = Number(argv[index + 1]);
    if (Number.isFinite(value)) {
      return {value, consumed: [index, index + 1]};
    }
  }
  return {value: fallback, consumed: []};
}

async function runCli(argv) {
  const settle = parseNumericFlag(argv, FLAG_SETTLE_MS, DEFAULT_SETTLE_MS);
  const minDispatch = parseNumericFlag(argv, FLAG_MIN_DISPATCHES, DEFAULT_MIN_DISPATCHES);
  const consumed = new Set([...settle.consumed, ...minDispatch.consumed]);
  const targets = argv.filter(
    (a, i) => !a.startsWith('--') && !consumed.has(i),
  );
  if (argv.includes(FLAG_HELP) || targets.length === 0) {
    return {
      ok: false,
      output:
        'usage: analyze-redecision-storm [--settle-ms <n>] [--min-dispatches <n>] ' +
        '[--markdown] <run-dir-or-log.gz...>',
    };
  }
  const options = {settleMs: settle.value, minDispatches: minDispatch.value};
  const summaries = [];
  for (const target of targets) {
    summaries.push(await analyzeTarget(target, options));
  }
  const verdict = summaries.some((s) => s.verdict === 'RE_DECISION') ?
    'RE_DECISION' :
    'BOUNDED';
  const payload = {schemaVersion: SCHEMA_VERSION, ...options, verdict, summaries};
  return {
    ok: true,
    output: argv.includes(FLAG_MARKDOWN) ?
      renderMarkdown(summaries, options) :
      JSON.stringify(payload, null, JSON_INDENT_SPACES),
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
  parseStormEvents,
  median,
  classifyPartition,
  summarizeTarget,
  renderMarkdown,
  runCli,
};
