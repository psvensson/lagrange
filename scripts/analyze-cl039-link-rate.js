#!/usr/bin/env node

// CL-039 causal-LINK recurrence — the graded alternative to waiting for the rare
// terminal STALL. The CL-039 failure (publications-p1 epoch stuck OPEN → published
// node counted missing) is a low-frequency liveness corner; at N=4/N=8 the terminal
// STALL may not recur even though its UPSTREAM causal links fire often. Raw
// repetition (bigger N) is a poor rare-event strategy. Instead we count how often
// EACH link in the documented causal chain fires across a gate's runs, so the
// safety margin is quantified WITHOUT needing the terminal failure:
//
//   L1 gap-cross         seed event-loop gap > raft election ceiling (3000ms)
//   L2 leadership-left   publications-p1 write-leader leaves the seed
//   L3 stranded-no-back  leadership never returns to the seed (no fail-back)
//   L4 write-fail-closed owner epoch-advance upsert to control_plane_publications
//                        fails closed (participant failures), repeating
//   TT terminal          OPEN publication missing a member (the CL-039 STALL)
//
// The chain is monotone-ish: TT requires L4 requires L3 requires L2 requires L1.
// Reading WHERE the chain breaks (e.g. "L1 3/8, L2 1/8, L3 0/8") tells us the
// binding safety link and whether a fix is warranted / which lever — the
// reproduced-before-fix rung, one level finer than analyze:precondition-recurrence
// (which only sees TT, from the report; this also reads the seed .log.gz).
//
// Input: the per-run reports a gate writes (stat-gate-<ts>-run*.report.json). The
// matching seed log is found under the sibling
//   .playback/stat-gate-<ts>-run<N>/.full-logs/rolling-restart/<seed>.log.gz
// Usage:
//   node scripts/analyze-cl039-link-rate.js test-output/reports/stat-gate-<ts>-run*.report.json
//   node scripts/analyze-cl039-link-rate.js --markdown <files...>

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const JSON_INDENT = 2;
const FLAG_MARKDOWN = '--markdown';
const FLAG_HELP = '--help';
const SCHEMA_VERSION = 'cl039-link-rate-v1';

// Raft election ceiling: a seed gap above this can shed publications-p1 leadership
// (src/raft/constants.js RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS).
const ELECTION_MAX_MS = 3000;
// A run with this many control_plane_publications upsert failures on the seed is
// treated as a PERSISTENT fail-closed loop (the CL-039 witness had 39; the run4
// self-heal had 27 transient — so raw count is reported and this only flags
// "persistent" for the tally; the per-run count is the real signal).
const WRITE_FAIL_PERSISTENT_MIN = 10;

// Exact current-format log signatures (validated against a live gate seed log).
const MSG_GAP = 'Event loop gap detected';
const MSG_WRITE_LEADER_DIAG = 'publications write-leader resolution';
const MSG_UPSERT_FAILED = 'Failed to upsert system table row';
const MSG_NO_HANDLER = 'No handler registered for partition service';
const PUBLICATIONS_TABLE = 'control_plane_publications';

function parseArgs(argv) {
  const files = [];
  let markdown = false;
  let help = false;
  for (const arg of argv) {
    if (arg === FLAG_MARKDOWN) markdown = true;
    else if (arg === FLAG_HELP) help = true;
    else files.push(arg);
  }
  return {files, markdown, help};
}

function runLabelFromPath(filePath) {
  const m = path.basename(filePath).match(/run(\d+)/u);
  return m ? `run${m[1]}` : path.basename(filePath);
}

// stat-gate-<ts>-run<N>.report.json  ->  the run's .full-logs/rolling-restart dir.
function seedLogDirForReport(filePath) {
  const base = path.basename(filePath).replace(/\.report\.json$/u, '');
  const dir = path.dirname(filePath);
  return path.join(dir, '.playback', base, '.full-logs', 'rolling-restart');
}

function listNodeLogs(logDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(logDir);
  } catch {
    return [];
  }
  return entries
    .filter((n) => n.endsWith('.log.gz'))
    .map((n) => ({nodeId: n.replace(/\.log\.gz$/u, ''), file: path.join(logDir, n)}));
}

// Stream a possibly-truncated .log.gz line by line, tolerating a trailing partial
// gzip member (a gate still tearing down leaves an unfinished member — we want the
// valid prefix, not a hard error). Calls onLine(parsedJsonOrNull, rawLine).
function streamGzLines(file, onLine) {
  return new Promise((resolve) => {
    const gunzip = zlib.createGunzip();
    const stream = fs.createReadStream(file).pipe(gunzip);
    // A truncated final member surfaces as a stream 'error'; we've already
    // delivered every complete line before it, so resolve rather than reject.
    stream.on('error', () => resolve());
    const rl = readline.createInterface({input: stream, crlfDelay: Infinity});
    rl.on('line', (line) => {
      if (!line) return;
      let parsed = null;
      try {
        parsed = JSON.parse(line);
      } catch {
        parsed = null;
      }
      onLine(parsed, line);
    });
    rl.on('close', () => resolve());
    rl.on('error', () => resolve());
  });
}

// Identify the seed: the node that is its OWN publications write-leader early
// (helperSaysWriteLeader===true && tier1===self). Falls back to the largest log.
async function detectSeed(nodeLogs) {
  let best = null;
  for (const node of nodeLogs) {
    let selfLeaderLines = 0;
    let firstSelfLeaderTime = null;
    await streamGzLines(node.file, (p) => {
      if (!p || typeof p.msg !== 'string') return;
      if (!p.msg.includes(MSG_WRITE_LEADER_DIAG)) return;
      if (p.helperSaysWriteLeader === true &&
          p.tier1PartitionsLeaderNodeId === node.nodeId) {
        selfLeaderLines += 1;
        if (firstSelfLeaderTime === null) firstSelfLeaderTime = p.time || null;
      }
    });
    let size = 0;
    try {
      size = fs.statSync(node.file).size;
    } catch {
      size = 0;
    }
    const score = {node, selfLeaderLines, firstSelfLeaderTime, size};
    if (best === null ||
        score.selfLeaderLines > best.selfLeaderLines ||
        (score.selfLeaderLines === best.selfLeaderLines && score.size > best.size)) {
      best = score;
    }
  }
  return best ? best.node : null;
}

// Scan the seed log once; return the raw per-run link evidence.
async function scanSeedLog(seed) {
  let maxGapMs = 0;
  let gapCrossCount = 0;
  let leadershipLeftCount = 0;
  let lastWriteLeaderHelper = null; // last observed helperSaysWriteLeader
  let lastWriteLeaderTier1 = null;
  let upsertFailPublications = 0;
  let noHandlerCount = 0;
  await streamGzLines(seed.file, (p) => {
    if (!p || typeof p.msg !== 'string') return;
    const msg = p.msg;
    if (msg.includes(MSG_GAP) && Number.isFinite(p.gapMs)) {
      if (p.gapMs > maxGapMs) maxGapMs = p.gapMs;
      if (p.gapMs > ELECTION_MAX_MS) gapCrossCount += 1;
      return;
    }
    if (msg.includes(MSG_WRITE_LEADER_DIAG)) {
      const left = p.helperSaysWriteLeader === false ||
        (p.tier1PartitionsLeaderNodeId &&
         p.tier1PartitionsLeaderNodeId !== seed.nodeId);
      if (left) leadershipLeftCount += 1;
      lastWriteLeaderHelper = p.helperSaysWriteLeader;
      lastWriteLeaderTier1 = p.tier1PartitionsLeaderNodeId ?? null;
      return;
    }
    if (msg.includes(MSG_UPSERT_FAILED) && p.tableName === PUBLICATIONS_TABLE) {
      upsertFailPublications += 1;
      return;
    }
    if (msg.includes(MSG_NO_HANDLER)) {
      noHandlerCount += 1;
    }
  });
  const strandedNoFailback = computeStrandedNoFailback({
    seedNodeId: seed.nodeId,
    leadershipLeftCount,
    lastWriteLeaderHelper,
    lastWriteLeaderTier1,
  });
  return {
    seedNodeId: seed.nodeId,
    maxGapMs,
    gapCrossCount,
    leadershipLeftCount,
    lastWriteLeaderHelper,
    lastWriteLeaderTier1,
    strandedNoFailback,
    upsertFailPublications,
    noHandlerCount,
  };
}

// Pure: no fail-back means leadership left the seed at some point AND the LAST
// observed write-leader resolution still does not name the seed (never returned).
export function computeStrandedNoFailback(
  {seedNodeId, leadershipLeftCount, lastWriteLeaderHelper, lastWriteLeaderTier1}) {
  const leadershipReturned = lastWriteLeaderHelper === true &&
    (lastWriteLeaderTier1 === null || lastWriteLeaderTier1 === seedNodeId);
  return leadershipLeftCount > 0 && !leadershipReturned;
}

// Pure: per-run link booleans from the seed evidence (null when not measurable).
export function deriveLinks(seedEvidence) {
  if (!seedEvidence) {
    return {
      L1_gap_cross: null, L2_leadership_left: null,
      L3_stranded_no_failback: null, L4_write_fail_closed: null,
    };
  }
  return {
    L1_gap_cross: seedEvidence.gapCrossCount > 0,
    L2_leadership_left: seedEvidence.leadershipLeftCount > 0,
    L3_stranded_no_failback: seedEvidence.strandedNoFailback === true,
    L4_write_fail_closed: seedEvidence.upsertFailPublications >= WRITE_FAIL_PERSISTENT_MIN,
  };
}

export function extractTerminal(report) {
  const sc = report?.scenarios?.[0] ?? null;
  const pc = sc?.publicationConvergence ?? null;
  if (!pc) {
    return {hasPublicationConvergence: false, passed: sc?.passed ?? null};
  }
  const openMissing = pc.publicationStatus === 'OPEN' &&
    (pc.missingPublishedCount || 0) >= 1;
  return {
    hasPublicationConvergence: true,
    passed: sc?.passed ?? null,
    publicationStatus: pc.publicationStatus ?? null,
    missingPublishedCount: pc.missingPublishedCount ?? null,
    dominantReason: pc.dominantReason ?? sc?.dominantReason ?? null,
    terminalStall: openMissing,
  };
}

async function analyzeRun(filePath) {
  const label = runLabelFromPath(filePath);
  let report = null;
  try {
    report = JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    report = null;
  }
  const terminal = report ? extractTerminal(report) : {hasPublicationConvergence: false};
  const logDir = seedLogDirForReport(filePath);
  const nodeLogs = listNodeLogs(logDir);
  let seedEvidence = null;
  if (nodeLogs.length > 0) {
    const seed = await detectSeed(nodeLogs);
    if (seed) seedEvidence = await scanSeedLog(seed);
  }
  // Per-run link booleans (null = not measurable: seed log absent).
  const links = deriveLinks(seedEvidence);
  return {
    label,
    seedLogPresent: seedEvidence !== null,
    links,
    TT_terminal_stall: terminal.terminalStall ?? null,
    seedEvidence,
    terminal,
  };
}

const LINK_DEFS = [
  {key: 'L1_gap_cross', label: 'L1 seed gap > 3000ms election ceiling'},
  {key: 'L2_leadership_left', label: 'L2 publications-p1 leadership left the seed'},
  {key: 'L3_stranded_no_failback', label: 'L3 leadership never returned (no fail-back)'},
  {key: 'L4_write_fail_closed', label: `L4 owner upsert fail-closed (>=${WRITE_FAIL_PERSISTENT_MIN})`},
];

export function summarize(runs) {
  const measurable = runs.filter((r) => r.seedLogPresent);
  const links = LINK_DEFS.map((def) => {
    const fired = measurable.filter((r) => r.links[def.key] === true).map((r) => r.label);
    return {
      key: def.key,
      label: def.label,
      firedCount: fired.length,
      measurableRuns: measurable.length,
      firedRuns: fired,
    };
  });
  const terminalRuns = runs.filter((r) => r.TT_terminal_stall === true).map((r) => r.label);
  return {
    schemaVersion: SCHEMA_VERSION,
    totalRuns: runs.length,
    measurableRuns: measurable.length,
    links,
    terminal: {
      key: 'TT_terminal_stall',
      label: 'TT OPEN publication missing a member (CL-039 STALL)',
      firedCount: terminalRuns.length,
      firedRuns: terminalRuns,
    },
    runs: runs.map((r) => ({
      label: r.label,
      seedNodeId: r.seedEvidence?.seedNodeId ?? null,
      maxGapMs: r.seedEvidence?.maxGapMs ?? null,
      gapCrossCount: r.seedEvidence?.gapCrossCount ?? null,
      leadershipLeftCount: r.seedEvidence?.leadershipLeftCount ?? null,
      strandedNoFailback: r.seedEvidence?.strandedNoFailback ?? null,
      upsertFailPublications: r.seedEvidence?.upsertFailPublications ?? null,
      noHandlerCount: r.seedEvidence?.noHandlerCount ?? null,
      links: r.links,
      terminalStall: r.TT_terminal_stall,
      publicationStatus: r.terminal?.publicationStatus ?? null,
      missingPublishedCount: r.terminal?.missingPublishedCount ?? null,
      dominantReason: r.terminal?.dominantReason ?? null,
    })),
  };
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push(`# CL-039 causal-link recurrence (${summary.measurableRuns}/${summary.totalRuns} runs measurable)`);
  lines.push('');
  lines.push('Graded chain — TT requires L4 requires L3 requires L2 requires L1.');
  lines.push('Read WHERE the chain breaks: the first link with a low rate is the binding safety margin.');
  lines.push('');
  lines.push('| Link | Fired | Rate |');
  lines.push('| --- | --- | --- |');
  for (const link of summary.links) {
    lines.push(`| ${link.label} | ${link.firedCount}/${link.measurableRuns} | ${link.measurableRuns ? (link.firedCount / link.measurableRuns).toFixed(2) : 'n/a'} |`);
  }
  const t = summary.terminal;
  lines.push(`| ${t.label} | ${t.firedCount}/${summary.totalRuns} | ${(t.firedCount / Math.max(1, summary.totalRuns)).toFixed(2)} |`);
  lines.push('');
  lines.push('## Per-run');
  lines.push('| run | seed | maxGapMs | gapXings | leadLeft | strand | upsertFail | noHandler | status | missing | STALL |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of summary.runs) {
    lines.push(`| ${r.label} | ${(r.seedNodeId || '').slice(0, 8)} | ${r.maxGapMs ?? '?'} | ${r.gapCrossCount ?? '?'} | ${r.leadershipLeftCount ?? '?'} | ${r.strandedNoFailback ?? '?'} | ${r.upsertFailPublications ?? '?'} | ${r.noHandlerCount ?? '?'} | ${r.publicationStatus ?? '?'} | ${r.missingPublishedCount ?? '?'} | ${r.terminalStall ?? '?'} |`);
  }
  return lines.join('\n');
}

async function main() {
  const {files, markdown, help} = parseArgs(process.argv.slice(2));
  if (help || files.length === 0) {
    process.stdout.write(
      'Usage: node scripts/analyze-cl039-link-rate.js [--markdown] stat-gate-<ts>-run*.report.json\n');
    process.exit(files.length === 0 && !help ? EXIT_FAILURE : EXIT_SUCCESS);
  }
  const runs = [];
  for (const file of files) {
    runs.push(await analyzeRun(file));
  }
  runs.sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true}));
  const summary = summarize(runs);
  if (markdown) {
    process.stdout.write(renderMarkdown(summary) + '\n');
  } else {
    process.stdout.write(JSON.stringify(summary, null, JSON_INDENT) + '\n');
  }
  process.exit(EXIT_SUCCESS);
}

// Only run as a CLI when invoked directly — importing for tests must not exit.
const invokedDirectly = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`analyze-cl039-link-rate failed: ${err?.stack || err}\n`);
    process.exit(EXIT_FAILURE);
  });
}
