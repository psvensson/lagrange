// Ledger consistency check — a repo-wide guard against metadata/state drift in the
// Solver planning ledger (epics + quests + logs + oracles).
//
// WHY THIS EXISTS. An audit (2026-07-01) found the ledger's write-once metadata rots:
// an epic's `status:` lags a terminal outcome, a quest is recorded solved while its
// closure evidence is absent, an oracle says done while no terminal outcome was written.
// The bodies stay accurate; the small structured fields drift because they are hand-
// maintained copies. This check keys ONLY on those structured fields — never on prose
// keywords (a decision-log that mentions "EXHAUSTED" about a sub-lever does NOT mean
// the epic is terminal; scraping prose was verified to be a false-positive machine).
// Each rule below fired on a real, verified inconsistency or is a hard structural
// invariant; none flags a case that was confirmed legitimate.
//
// Pure projection: reads sealed quest files, append-only event logs, epic frontmatter,
// and the exact oracle targets named by those quests; asserts nothing they do not
// already contain. `checkLedgerConsistency` takes a root so it is testable over
// fixtures; run directly, it checks the repo and exits non-zero on any ERROR
// (WARNINGS never gate).

import fs from 'node:fs';
import path from 'node:path';
import {projectState, readLog} from './store.js';

const EPICS_DIR = 'solve/epics';
const QUESTS_DIR = 'solve/quests';
const EPIC_SKIP = new Set(['README.md', '_template.md']);

// Base status vocabulary. A status is valid if it equals or is prefixed by one of
// these (bespoke suffixes like `resolved-option-b-refuted-pivot-to-a` are allowed).
const KNOWN_STATUS_BASES = [
  'discussing', 'sharpening', 'active', 'landed-default-off', 'resolved', 'graduated',
];
const TERMINAL_STATE = new Set(['solved', 'exhausted']);

function readFrontmatter(text) {
  const front = {};
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (kv) front[kv[1]] = kv[2].trim();
    }
  }
  return front;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.endsWith(suffix)).sort();
}

// --- Epic rules ------------------------------------------------------------
function checkEpics(root, errors, warnings) {
  const dir = path.join(root, EPICS_DIR);
  for (const name of listFiles(dir, '.md')) {
    if (EPIC_SKIP.has(name)) continue;
    const front = readFrontmatter(fs.readFileSync(path.join(dir, name), 'utf8'));
    const status = front.status;
    // E1 (ERROR): every epic must carry a frontmatter `status:`. A status-less epic
    // is invisible to `overview` (renders as `unknown`) and is where drift hides.
    if (!status) {
      errors.push(`epic ${name}: missing frontmatter \`status:\` (E1)`);
      continue;
    }
    // E2 (WARN): status should be a known base (catches typos / ad-hoc values).
    const known = KNOWN_STATUS_BASES.some(
      (b) => status === b || status.startsWith(`${b}-`));
    if (!known) {
      warnings.push(`epic ${name}: status "${status}" not in known vocabulary ` +
        `[${KNOWN_STATUS_BASES.join(', ')}] (E2)`);
    }
  }
}

// --- Quest rules -----------------------------------------------------------
function projectQuestLedger(root, id, quest) {
  const doneWhen = quest.doneWhen || {};
  const isOracleProbe = doneWhen.probe === 'oracle';
  const probeFile = isOracleProbe && doneWhen.args ? doneWhen.args.file : null;
  const probePath = probeFile ? path.join(root, probeFile) : null;
  const probeFileExists = probePath ? fs.existsSync(probePath) : null;
  return {
    isOracleProbe,
    oracle: probeFileExists ? readJson(probePath) : null,
    probeFile,
    probeFileExists,
    questStatus: projectState(quest, readLog(root, id)).questStatus,
  };
}

function missingSolvedOracleError(id, projection) {
  const {isOracleProbe, probeFile, probeFileExists, questStatus} =
    projection;
  // Q1 (ERROR): a quest recorded solved whose closure probe is an oracle file
  // MUST have that file present — else its sealed closure cannot be re-evaluated.
  if (questStatus === 'solved' && isOracleProbe && probeFile && !probeFileExists) {
    return `quest ${id}: questStatus=solved but its oracle-probe target ` +
      `\`${probeFile}\` is missing (Q1)`;
  }
  return null;
}

function openDoneOracleWarning(id, projection) {
  const {oracle, questStatus} = projection;
  // Q2 (WARN): the sealed oracle says done:true but no terminal outcome was
  // recorded in the append-only log — the verdict landed without closure.
  if (oracle && oracle.done === true && !TERMINAL_STATE.has(questStatus)) {
    return `quest ${id}: oracle done=true but projected questStatus=` +
      `${questStatus ?? 'MISSING'} (not terminal) (Q2)`;
  }
  return null;
}

function missingOpenOracleWarning(id, projection) {
  const {isOracleProbe, probeFile, probeFileExists, questStatus} = projection;
  // Q3 (WARN): a not-yet-solved quest whose oracle-probe target is missing cannot
  // ever evaluate its own closure (latent orphan). Not an ERROR — a freshly authored
  // quest legitimately has no oracle yet — but worth surfacing.
  if (questStatus !== 'solved' && isOracleProbe && probeFile && !probeFileExists) {
    return `quest ${id}: oracle-probe target \`${probeFile}\` missing ` +
      `(questStatus=${questStatus ?? 'none'}; cannot evaluate closure) (Q3)`;
  }
  return null;
}

function checkQuestProjection(id, projection) {
  return {
    errors: [missingSolvedOracleError(id, projection)].filter(Boolean),
    warnings: [
      openDoneOracleWarning(id, projection),
      missingOpenOracleWarning(id, projection),
    ].filter(Boolean),
  };
}

function checkQuests(root, errors, warnings) {
  const qdir = path.join(root, QUESTS_DIR);
  for (const name of listFiles(qdir, '.json')) {
    const id = name.slice(0, -5);
    const quest = readJson(path.join(qdir, name));
    if (!quest) {
      errors.push(`quest ${name}: not valid JSON`);
      continue;
    }
    const findings = checkQuestProjection(id, projectQuestLedger(root, id, quest));
    errors.push(...findings.errors);
    warnings.push(...findings.warnings);
  }
}

export function checkLedgerConsistency(root) {
  const errors = [];
  const warnings = [];
  checkEpics(root, errors, warnings);
  checkQuests(root, errors, warnings);
  return {errors, warnings};
}

// --- CLI -------------------------------------------------------------------
function main() {
  const root = process.cwd();
  const {errors, warnings} = checkLedgerConsistency(root);
  for (const w of warnings) process.stdout.write(`WARN  ${w}\n`);
  for (const e of errors) process.stdout.write(`ERROR ${e}\n`);
  process.stdout.write(
    `\nledger-consistency: ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  process.exit(errors.length > 0 ? 1 : 0);
}

// Run when invoked directly (not when imported by a test).
if (process.argv[1] && path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
