#!/usr/bin/env node

// Monotone-drain characterizer for the rolling-restart convergence campaign.
//
// The metastable-reconfig reframe proposed a "monotone-drain liveness invariant"
// as a candidate VARIANCE-IMMUNE discriminator for the ~30%-PASS bistability:
// after faults stop, in-flight corrective ops per partition should be
// monotonically NON-INCREASING; a limit-cycle (re-decision loop) would violate
// it by re-rising after a drain.
//
// IMPORTANT — EMPIRICALLY THIS IS NOT A PASS/FAIL ORACLE (2026-06-27). Replayed
// across the recorded corpus, the post-peak in-flight-count "rise" count does
// NOT discriminate scenario-PASS from FAIL (PASS mean ~6 vs FAIL mean ~5,
// complete distributional overlap; clear inversions, e.g. a PASS run with 11
// rises vs a FAIL run with 3). Two other in-flight-churn proxies fail the same
// way: the ADD-dispatch storm verdict (analyze-redecision-storm) over ~150 runs,
// and late-window op-creation count. ⇒ the bistability is NOT a sustained
// in-flight loop; it is a LATENCY/RACE-TAIL phenomenon (does a critical-path op —
// leadership handoff, spread establishment, voter-ready promotion under load —
// finish before the deadline). Do NOT adopt monotone-drain as the doneWhen
// metric, and do NOT build a single-goal-owner structural fix on the limit-cycle
// theory. This stays a MECHANISM CHARACTERIZER (how much does in-flight count
// oscillate), like analyze-redecision-storm — useful for diagnosis, not a verdict.
//
// Method: an op's lifetime is [first "Creating operation" event, last log line
// mentioning its operationId] (lastSeen is the terminal proxy — a rebalancer op
// stops being logged once terminal). Per partition, +1 at create / -1 at
// lastSeen builds the in-flight-count series; post-peak rises = increments after
// the series' first peak = drain-then-re-rise (the oscillation signature).
//
// Reads the GZIPPED .full-logs/<scenario>/<node>.log.gz.
//
// Usage:
//   node scripts/analyze-monotone-drain.js <run-dir-or-log.gz...>
//   node scripts/analyze-monotone-drain.js --markdown <...>

import fs from 'node:fs/promises';
import {gunzipSync, constants as zlibConstants} from 'node:zlib';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const JSON_INDENT_SPACES = 2;
const NEWLINE = '\n';
const FLAG_MARKDOWN = '--markdown';
const FLAG_HELP = '--help';
const SCHEMA_VERSION = 'monotone-drain-v1';
const GZIP_SUFFIX = '.log.gz';
const CREATE_MSG = 'Creating operation';

// Pure: collect per-op lifetimes from raw log lines.
// Returns Map<opId, {createMs, lastMs, partitionId}> for ops we saw CREATED
// (genuine rebalancer ops, not arbitrary opId mentions).
function parseOpLifetimes(lines) {
  const created = new Map();
  const lastSeen = new Map();
  for (const line of lines) {
    if (!line.includes('operationId')) {
      continue;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const opId = parsed?.operationId;
    const time = parsed?.time;
    if (!opId || !time) {
      continue;
    }
    const at = Date.parse(time);
    if (Number.isNaN(at)) {
      continue;
    }
    if (parsed.msg === CREATE_MSG && !created.has(opId)) {
      created.set(opId, {
        createMs: at,
        partitionId: parsed.partitionId || parsed.entityId || 'unknown',
      });
    }
    const prev = lastSeen.get(opId);
    if (prev === undefined || at > prev) {
      lastSeen.set(opId, at);
    }
  }
  const lifetimes = new Map();
  for (const [opId, info] of created) {
    lifetimes.set(opId, {
      createMs: info.createMs,
      lastMs: Math.max(lastSeen.get(opId) ?? info.createMs, info.createMs),
      partitionId: info.partitionId,
    });
  }
  return lifetimes;
}

// Pure: post-peak rises for one partition's lifetime list. Build the in-flight
// count series from +1@create / -1@lastMs events, find the first peak, count
// increments after it.
function partitionPostPeakRises(lifetimes) {
  const events = [];
  for (const {createMs, lastMs} of lifetimes) {
    events.push([createMs, 1]);
    events.push([lastMs, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const series = [];
  let current = 0;
  for (const [, delta] of events) {
    current += delta;
    series.push(current);
  }
  if (series.length === 0) {
    return {peak: 0, postPeakRises: 0};
  }
  const peak = Math.max(...series);
  const peakIndex = series.indexOf(peak);
  let rises = 0;
  for (let i = peakIndex + 1; i < series.length; i += 1) {
    if (series[i] > series[i - 1]) {
      rises += 1;
    }
  }
  return {peak, postPeakRises: rises};
}

// Pure: fold op lifetimes into a per-run monotone-drain summary.
function summarizeTarget(label, files, lifetimes) {
  const byPartition = new Map();
  for (const info of lifetimes.values()) {
    const list = byPartition.get(info.partitionId);
    if (list) {
      list.push(info);
    } else {
      byPartition.set(info.partitionId, [info]);
    }
  }
  const partitions = [];
  let totalRises = 0;
  let peakSum = 0;
  for (const [partitionId, list] of byPartition) {
    const {peak, postPeakRises} = partitionPostPeakRises(list);
    partitions.push({partitionId, ops: list.length, peak, postPeakRises});
    totalRises += postPeakRises;
    peakSum += peak;
  }
  partitions.sort((a, b) => b.postPeakRises - a.postPeakRises);
  return {
    label,
    files,
    totalOps: lifetimes.size,
    peakInFlightSum: peakSum,
    postPeakRises: totalRises,
    // "MONOTONE_DRAIN" = in-flight count never re-rose after its peak on any
    // partition; "OSCILLATING" = it did. NOTE: this is NOT correlated with
    // scenario-PASS (see header) — it characterizes the mechanism, not the
    // outcome.
    verdict: totalRises === 0 ? 'MONOTONE_DRAIN' : 'OSCILLATING',
    partitions,
  };
}

function decompressLines(buffer) {
  return gunzipSync(buffer, {finishFlush: zlibConstants.Z_SYNC_FLUSH})
    .toString(ENCODING_UTF8)
    .split(NEWLINE);
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

async function analyzeTarget(target) {
  const files = await collectLogGzFiles(target);
  // Op lifetimes must be merged ACROSS node logs (an op is created on one node,
  // referenced on others), so parse all lines together.
  const allLines = [];
  for (const file of files) {
    try {
      allLines.push(...decompressLines(await fs.readFile(file)));
    } catch {
      // skip a truncated gz member from a live/in-progress gate
    }
  }
  return summarizeTarget(
    path.basename(target),
    files.length,
    parseOpLifetimes(allLines),
  );
}

function renderMarkdown(summaries) {
  const lines = [
    '# Monotone-drain characterizer (in-flight corrective-op count)',
    '',
    '`postPeakRises` = times the in-flight op count rose AFTER its peak on a ' +
      'partition (drain-then-re-rise). NOTE: empirically NOT correlated with ' +
      'scenario-PASS — a mechanism characterizer, not an oracle (see script header).',
    '',
  ];
  for (const summary of summaries) {
    lines.push(
      `## ${summary.label} — **${summary.verdict}** ` +
        `(postPeakRises ${summary.postPeakRises}, peakSum ${summary.peakInFlightSum}, ` +
        `${summary.totalOps} ops)`,
    );
    lines.push('');
    lines.push('| partition | ops | peak in-flight | post-peak rises |');
    lines.push('| --- | --- | --- | --- |');
    for (const p of summary.partitions) {
      lines.push(`| ${p.partitionId} | ${p.ops} | ${p.peak} | ${p.postPeakRises} |`);
    }
    lines.push('');
  }
  return lines.join(NEWLINE);
}

async function runCli(argv) {
  const targets = argv.filter((a) => !a.startsWith('--'));
  if (argv.includes(FLAG_HELP) || targets.length === 0) {
    return {
      ok: false,
      output: 'usage: analyze-monotone-drain [--markdown] <run-dir-or-log.gz...>',
    };
  }
  const summaries = [];
  for (const target of targets) {
    summaries.push(await analyzeTarget(target));
  }
  const payload = {schemaVersion: SCHEMA_VERSION, summaries};
  return {
    ok: true,
    output: argv.includes(FLAG_MARKDOWN) ?
      renderMarkdown(summaries) :
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

export {parseOpLifetimes, partitionPostPeakRises, summarizeTarget, renderMarkdown, runCli};
