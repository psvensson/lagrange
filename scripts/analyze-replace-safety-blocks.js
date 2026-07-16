#!/usr/bin/env node

// Sub-reason decomposition for the rolling-restart `replace_remove_safety_blocked`
// deferral — the convergence campaign's most-confused signal.
//
// `replace_remove_safety_blocked` is an UMBRELLA deferReason. The remove-safety
// evaluator (operation-workflow-remove-safety-evaluator.js) refuses a critical
// REPLACE's source removal for SEVERAL genuinely different reasons, all collapsed
// to that one code; the discriminating detail lives only in the `errorMessage`
// string. Multiple sessions mis-attributed the binding root because the report
// carried only the umbrella code (gate 202310Z: run1 was 133x "concurrent
// partition operation" = a REPLACE over-creation standoff, while run2 was 68x
// "voter-ready spread would fall below 2/3" = a single-op spread-floor block —
// two DIFFERENT roots read as one).
//
// This decomposes the umbrella into its sub-reasons per partition per run so a
// gate verdict is attributable: which sub-root binds, on which partitions, for
// how many distinct operations. Run it on a gate's playback logs alongside
// analyze-redecision-storm to see whether a lever moved the RIGHT sub-root or
// just relocated the storm.
//
// Reads the GZIPPED .full-logs/<scenario>/<node>.log.gz (the deferral lines are
// warn/info-level and present in every captured gate run).
//
// Usage:
//   node scripts/analyze-replace-safety-blocks.js <run-dir-or-log.gz...>
//   node scripts/analyze-replace-safety-blocks.js --markdown <...>

import fs from 'node:fs/promises';
import {gunzipSync, constants as zlibConstants} from 'node:zlib';
import path from 'node:path';

import {
  collectLogGzFiles,
  runAnalyzerCliWhenDirect,
} from './distributed-analysis-runtime.js';

const ENCODING_UTF8 = 'utf8';
const JSON_INDENT_SPACES = 2;
const NEWLINE = '\n';
const FLAG_MARKDOWN = '--markdown';
const FLAG_HELP = '--help';
const SCHEMA_VERSION = 'replace-safety-blocks-v1';
const DEFER_REASON = 'replace_remove_safety_blocked';

// Sub-reason taxonomy: ordered substring probes against the errorMessage. The
// FIRST match wins, so order matters only where messages could overlap (they do
// not today). `other` catches anything new so a taxonomy drift is visible rather
// than silently mislabelled.
const SUB_REASONS = [
  {id: 'concurrent_op', match: 'concurrent partition operation'},
  {id: 'uncontactable_peer', match: 'uncontactable'},
  {id: 'spread_floor', match: 'voter-ready spread would fall below'},
  {id: 'replacement_not_voter_ready', match: 'is not voter-ready'},
  {id: 'voter_floor_minimum', match: 'below the minimum'},
  {id: 'replacement_leader_pending', match: 'replacement leader'},
];

// Pure: classify one errorMessage into a sub-reason id.
function classifySubReason(errorMessage) {
  const text = String(errorMessage || '');
  for (const {id, match} of SUB_REASONS) {
    if (text.includes(match)) {
      return id;
    }
  }
  return 'other';
}

// Pure: pull replace_remove_safety_blocked deferral events out of raw log lines.
// Returns events {partitionId, subReason, operationId}. A single logical defer is
// emitted on more than one log path (safety-policy + dispatch-failure), so callers
// dedup distinct operations per (partition, subReason) for the cleaner signal.
function parseSafetyBlockEvents(lines) {
  const events = [];
  for (const line of lines) {
    if (!line.includes(DEFER_REASON)) {
      continue;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed) {
      continue;
    }
    const reason = parsed.reason || parsed.deferReason || null;
    if (reason !== DEFER_REASON) {
      continue;
    }
    const partitionId = parsed.partitionId || parsed.partition_id || 'unknown';
    events.push({
      partitionId,
      subReason: classifySubReason(parsed.errorMessage),
      operationId: parsed.operationId || parsed.operation_id || null,
    });
  }
  return events;
}

// Pure: fold events into a per-partition sub-reason breakdown for one target.
function summarizeTarget(label, files, events) {
  const byPartition = new Map();
  for (const event of events) {
    let partition = byPartition.get(event.partitionId);
    if (!partition) {
      partition = {occurrences: new Map(), ops: new Map()};
      byPartition.set(event.partitionId, partition);
    }
    partition.occurrences.set(
      event.subReason,
      (partition.occurrences.get(event.subReason) || 0) + 1,
    );
    if (event.operationId) {
      let ops = partition.ops.get(event.subReason);
      if (!ops) {
        ops = new Set();
        partition.ops.set(event.subReason, ops);
      }
      ops.add(event.operationId);
    }
  }

  const partitions = [];
  const targetSubReasonOps = new Map();
  for (const [partitionId, data] of byPartition) {
    const subReasons = [];
    for (const [subReason, occurrences] of data.occurrences) {
      const distinctOps = data.ops.get(subReason)?.size ?? 0;
      subReasons.push({subReason, occurrences, distinctOps});
      targetSubReasonOps.set(
        subReason,
        (targetSubReasonOps.get(subReason) || 0) + distinctOps,
      );
    }
    subReasons.sort((a, b) => b.occurrences - a.occurrences);
    partitions.push({
      partitionId,
      totalOccurrences: subReasons.reduce((sum, s) => sum + s.occurrences, 0),
      dominantSubReason: subReasons[0]?.subReason ?? null,
      subReasons,
    });
  }
  partitions.sort((a, b) => b.totalOccurrences - a.totalOccurrences);

  let dominantSubReason = null;
  let dominantOps = -1;
  for (const [subReason, ops] of targetSubReasonOps) {
    if (ops > dominantOps) {
      dominantOps = ops;
      dominantSubReason = subReason;
    }
  }

  return {
    label,
    files,
    totalOccurrences: partitions.reduce((s, p) => s + p.totalOccurrences, 0),
    dominantSubReason,
    partitions,
  };
}

function decompressLines(buffer) {
  // Z_SYNC_FLUSH lets a truncated final gz member (a live/in-progress gate still
  // writing its logs) decompress to the readable prefix instead of throwing —
  // the same partial recovery `zcat` gives. A complete file decompresses fully.
  return gunzipSync(buffer, {finishFlush: zlibConstants.Z_SYNC_FLUSH})
    .toString(ENCODING_UTF8)
    .split(NEWLINE);
}

async function analyzeTarget(target) {
  const files = await collectLogGzFiles(target);
  const events = [];
  let skippedFiles = 0;
  for (const file of files) {
    let lines = null;
    try {
      // A live/in-progress gate may leave a truncated final gz member; skip such
      // a file rather than aborting the whole analysis (absence-proves-nothing,
      // but a crash hides the readable files entirely).
      lines = decompressLines(await fs.readFile(file));
    } catch {
      skippedFiles += 1;
      continue;
    }
    events.push(...parseSafetyBlockEvents(lines));
  }
  const summary = summarizeTarget(
    path.basename(target),
    files.length - skippedFiles,
    events,
  );
  summary.skippedFiles = skippedFiles;
  return summary;
}

function renderMarkdown(summaries) {
  const lines = [
    '# replace_remove_safety_blocked — sub-reason decomposition',
    '',
    'The deferReason is an umbrella; the dominant sub-reason is the binding root ' +
      'for that run. `concurrent_op` = REPLACE over-creation standoff; ' +
      '`spread_floor` = source removal would drop voter-ready spread below its ' +
      'protected per-operation floor; ' +
      '`uncontactable_peer` = a quorum peer (often the slow rejoiner) unreachable; ' +
      '`replacement_not_voter_ready` = the REPLACE replacement has not promoted.',
    '',
  ];
  for (const summary of summaries) {
    lines.push(
      `## ${summary.label} — dominant **${summary.dominantSubReason ?? 'none'}**` +
        ` (${summary.totalOccurrences} deferrals)`,
    );
    lines.push('');
    lines.push('| partition | dominant | sub-reason (occurrences / distinct ops) |');
    lines.push('| --- | --- | --- |');
    for (const p of summary.partitions) {
      const breakdown = p.subReasons
        .map((s) => `${s.subReason} (${s.occurrences}/${s.distinctOps})`)
        .join('; ');
      lines.push(`| ${p.partitionId} | ${p.dominantSubReason} | ${breakdown} |`);
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
      output:
        'usage: analyze-replace-safety-blocks [--markdown] <run-dir-or-log.gz...>',
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

runAnalyzerCliWhenDirect(import.meta.url, runCli);

export {
  classifySubReason,
  parseSafetyBlockEvents,
  summarizeTarget,
  renderMarkdown,
  runCli,
};
