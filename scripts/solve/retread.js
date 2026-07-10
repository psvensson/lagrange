// Draft-time retread check: catch a new quest re-deriving an already-refuted lever.
//
// Incident class (formation-ledger-over-target-surplus-drain-coupled-removal,
// 43f2596c): a quest was drafted around a lever functionally identical to a fix
// reverted the SAME morning; a full rung was spent re-deriving and red-on-revert
// proving the identity. The overlap was mechanically visible — the statement cited
// the exact source file the revert commit touched — so this check is deliberately
// mechanical and high-precision (file/CL overlap against recent `revert(...)`
// commits, plus the lineage's recorded rulesOut findings), never fuzzy prose
// matching: false positives would train operators to ignore the warning.
//
// Scan bounds (the recurring whole-corpus OOM trap): git log is windowed to
// REVERT_WINDOW_DAYS, and rulesOut findings are read only for the quest's lineage
// (parent + the parent's other children), never the whole quest corpus.

import {execFileSync} from 'node:child_process';

import {readRulesOutFindings} from './store.js';
import {loadAllQuests} from './portfolio.js';

export const REVERT_WINDOW_DAYS = 45;

// Path-shaped tokens (src/..., scripts/..., ...) plus bare source basenames like
// `operation-workflow-remove-safety-evaluator.js:378-412` — statements often cite a
// file without its directory, so overlap matching is by basename.
const FILE_TOKEN = /[A-Za-z0-9_./-]*[A-Za-z0-9_-]+\.(?:js|mjs|cjs|json)\b/g;
const CL_TOKEN = /\bCL-\d{3}\b/g;

/**
 * The file basenames and closure-ledger ids a quest statement cites.
 * @param {string} statement
 * @return {{basenames: Set<string>, closureIds: Set<string>}}
 */
export function extractStatementTokens(statement) {
  const text = String(statement || '');
  const basenames = new Set(
    (text.match(FILE_TOKEN) || []).map((token) => token.split('/').pop()));
  const closureIds = new Set(text.match(CL_TOKEN) || []);
  return {basenames, closureIds};
}

// A revert commit SUBJECT in either convention this repo demonstrably uses:
// conventional `revert(scope): ...` and git-default `Revert "..."`. Applied as a
// post-filter because `git log --grep` also matches commit BODY lines — a commit
// merely discussing a revert must not raise a warning (false positives train
// operators to ignore the check).
export const REVERT_SUBJECT = /^(?:revert\(|Revert ")/;

// Default git runner: recent revert commits with the files each touched. Output
// format is one `<sha>\t<subject>` line per commit followed by its file list.
// Multiple --grep flags are OR'd. Returns null on any git failure so the check
// degrades to silence.
function gitRevertLog(root) {
  try {
    return execFileSync(
      'git', ['log', '--grep=^revert(', '--grep=^Revert "',
        `--since=${REVERT_WINDOW_DAYS}.days`,
        '--name-only', '--format=%H%x09%s'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
  } catch {
    return null;
  }
}

/**
 * Parse `git log --name-only --format=%H%x09%s` output into commit records.
 * @param {string} raw
 * @return {Array<{sha: string, subject: string, files: string[]}>}
 */
export function parseRevertLog(raw) {
  const commits = [];
  for (const line of String(raw || '').split('\n')) {
    if (!line.trim()) continue;
    const headerMatch = /^([0-9a-f]{7,40})\t(.*)$/.exec(line);
    if (headerMatch) {
      commits.push({sha: headerMatch[1], subject: headerMatch[2], files: []});
    } else if (commits.length > 0) {
      commits[commits.length - 1].files.push(line.trim());
    }
  }
  return commits;
}

function revertOverlap(commit, tokens) {
  const overlappingFiles = commit.files.filter(
    (file) => tokens.basenames.has(file.split('/').pop()));
  const subjectClosureIds = (commit.subject.match(CL_TOKEN) || [])
    .filter((id) => tokens.closureIds.has(id));
  if (overlappingFiles.length === 0 && subjectClosureIds.length === 0) return null;
  return {
    sha: commit.sha.slice(0, 8),
    subject: commit.subject,
    files: overlappingFiles,
    closureIds: subjectClosureIds,
  };
}

/**
 * Recent revert commits overlapping the statement's cited files / CL ids.
 * @param {string} statement
 * @param {{root: string, revertLog?: Function}} options `revertLog` injectable.
 * @return {Array<Object>}
 */
export function findRevertOverlaps(statement, options) {
  const tokens = extractStatementTokens(statement);
  if (tokens.basenames.size === 0 && tokens.closureIds.size === 0) return [];
  const raw = (options.revertLog || gitRevertLog)(options.root);
  if (raw === null) return [];
  return parseRevertLog(raw)
    .filter((commit) => REVERT_SUBJECT.test(commit.subject))
    .map((commit) => revertOverlap(commit, tokens))
    .filter(Boolean);
}

/**
 * The lineage's recorded dead levers: rulesOut findings from the parent quest and
 * the parent's other children. Bounded to the lineage — never a corpus scan.
 * @param {string} root
 * @param {Object} quest
 * @param {{loadQuests?: Function, readRulesOut?: Function}} [deps] Injectable.
 * @return {Array<{questId: string, rulesOut: string, claim: ?string}>}
 */
export function lineageRulesOut(root, quest, deps = {}) {
  const parentId = quest?.links?.parentQuest;
  if (!parentId) return [];
  const loadQuests = deps.loadQuests || loadAllQuests;
  const readRulesOut = deps.readRulesOut || readRulesOutFindings;
  const siblingIds = loadQuests(root)
    .filter((other) =>
      other.id !== quest.id && other.links?.parentQuest === parentId)
    .map((other) => other.id);
  const lineage = [parentId, ...siblingIds];
  // Levers already recorded on THIS quest (e.g. via `new --inherit-rulesout-from`)
  // are replayed by the dossier's own findings; do not repeat them here.
  const ownRulesOut = new Set(
    safeReadRulesOut(readRulesOut, root, quest.id).map((f) => f.rulesOut));
  const entries = [];
  for (const questId of lineage) {
    for (const finding of safeReadRulesOut(readRulesOut, root, questId)) {
      if (ownRulesOut.has(finding.rulesOut)) continue;
      entries.push({questId, rulesOut: finding.rulesOut, claim: finding.claim});
    }
  }
  return entries;
}

// A lineage member without a log (or an unreadable one) is not an error here.
function safeReadRulesOut(readRulesOut, root, questId) {
  try {
    return readRulesOut(root, questId);
  } catch {
    return [];
  }
}

/**
 * Render the retread report as printable lines; [] when there is nothing to say.
 * @param {Array<Object>} overlaps From findRevertOverlaps.
 * @param {Array<Object>} inherited From lineageRulesOut.
 * @return {string[]}
 */
export function renderRetreadLines(overlaps, inherited) {
  const lines = [];
  for (const overlap of overlaps) {
    const via = [
      ...overlap.files,
      ...overlap.closureIds,
    ].join(', ');
    lines.push(
      `RETREAD WARNING: revert ${overlap.sha} "${overlap.subject}" touched ` +
      `${via}, cited in this statement — confirm the lever is not the reverted ` +
      'one before spending a rung on it');
  }
  if (inherited.length > 0) {
    lines.push('Lineage rulesOut (already-refuted levers — do not re-derive):');
    for (const entry of inherited) {
      lines.push(`- [${entry.questId}] ${entry.rulesOut}`);
    }
  }
  return lines;
}

/**
 * Run the full draft-time retread check for one quest.
 * @param {string} root
 * @param {Object} quest
 * @param {{revertLog?: Function, loadQuests?: Function, readRulesOut?: Function}}
 *   [deps] Injectable for tests.
 * @return {string[]} Printable warning lines; [] when clean.
 */
export function retreadCheckLines(root, quest, deps = {}) {
  const overlaps = findRevertOverlaps(quest.statement, {
    root,
    revertLog: deps.revertLog,
  });
  const inherited = lineageRulesOut(root, quest, deps);
  return renderRetreadLines(overlaps, inherited);
}
