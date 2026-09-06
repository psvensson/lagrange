// One-shot lossless migration from the v1 solve/ layout to v2 quest
// directories and epic front-matter. Kept for the record; it refuses to run
// twice. Every v1 log entry is copied verbatim; every v1 quest record is
// kept whole under quest.json.legacy; material that leaves git goes into one
// archive bundle for the evidence store, referenced from the quests it
// belonged to. The mapping report accounts for every entry.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {
  ENTRY_TYPE, EPICS_DIR, EPIC_PROOF, EPIC_STATUS, FINDING_KIND,
  QUESTS_DIR, QUEST_SCHEMA, QUEST_STATUS, THEORY_STATUS,
} from './schema.js';
import {parseFrontMatter} from './store.js';
import {solveBinaryOffences} from '../checks/check-solve-binary-guard.js';

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const JSON_SUFFIX = '.json';
const NDJSON_SUFFIX = '.ndjson';
const MARKDOWN_SUFFIX = '.md';
const JSON_INDENT = 2;
const V1_QUESTS = 'solve/quests';
const V1_LOGS = 'solve/log';
const V1_EVIDENCE = 'solve/evidence';
const V1_ORACLE = 'solve/oracle';
const V1_CHANGES = 'solve/changes';
const V1_THEORY_LEDGER = 'solve/theory-ledger.md';
const V1_ALPHA_READINESS = 'solve/release-0-1-0-alpha-readiness.json';
const V1_CONFIG_EXAMPLE = 'solve/config.example.json';
const V1_GENERATED = Object.freeze(['solve/FRONTIER.generated.md', 'solve/OVERVIEW.generated.md']);
const V1_DELETED_DIRS = Object.freeze([
  'solve/artifacts', 'solve/autonomous', 'solve/evidence', 'solve/log',
  'solve/migrations', 'solve/oracle', 'solve/oracles', 'solve/report', 'solve/state',
]);
// Generated inventories the pre-commit hook rewrites; not quest material.
const KEPT_CHANGES = Object.freeze([
  'global-owner-debt-inventory', 'priority-recovery-owner-inventory',
]);
const KEPT_ORACLES = Object.freeze([
  'voter-readiness-visibility-single-owner-table.json',
  'step-coverage-single-owner-table.json',
  'partition-class-ladder-single-owner-table.json',
  'cure-typing-single-owner-table.json',
  'hold-engagement-single-owner-table.json',
]);
const KEPT_ORACLES_DIR = 'scripts/oracles';
const ARCHIVE_DIR = 'solve/epics/solve-v2';
const ARCHIVE_NAME = 'solve-v1-archive.tar.gz';
const ARCHIVE_MANIFEST = 'solve-v1-archive.manifest.json';
const MIGRATION_INVENTORY_FILE = 'solve/epics/solve-v2/migration-inventory.json';
const MIGRATION_INVENTORY_SCHEMA = 'solve-v2-migration-inventory/1';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const GIT_LS_TREE = Object.freeze(['ls-tree', '-r', '--name-only']);
const GIT_CAT_FILE = Object.freeze(['cat-file', '--batch']);
const INVENTORY_FROM_FLAG = '--inventory-from';
const CORPUS_DRIFT = Object.freeze({
  MISSING: 'log is gone',
  TRUNCATED: 'log is shorter than its migrated v1 payload',
  REWRITTEN: 'the migrated v1 payload no longer hashes to its recorded digest',
});
const REPORT_FILE = 'solve/epics/solve-v2/migration-report.md';
const LEGACY_EPIC = 'legacy';
const THEORY_LEDGER_QUEST = 'theory-ledger';
const EVIDENCE_SIZE_LIMIT = 200 * 1024;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const EPIC_PLAN_PATTERN = /^solve\/epics\/([^/]+)\.md$/u;
const THEORY_HEADING = /^## (theory-\S+)\s*$/u;
const THEORY_FIELD = /^- ([A-Za-z/ ]+): (.*)$/u;
const MIGRATION_SOURCE = 'solve-v2 migration';
const CHILD_SEPARATOR = '-';
const QUEST_FILE = 'quest.json';
const LOG_FILE = 'log.ndjson';
const EVIDENCE_DIR = 'evidence';
const ORACLE_FILE = 'oracle.json';
const CHANGES_SUBDIR = 'changes';
const PATH_SEPARATOR = '/';
const LIST_SEPARATOR = ', ';
const TABLE_SEPARATOR = ' | ';
const TABLE_RULE = '---';
const FRONT_FENCE = '---';
const YAML_EMPTY_LIST = '[]';
const EPIC_README = 'README.md';
const EPIC_TEMPLATE = '_template.md';
const THEORY_SPLIT = '## theory-';
const NO_HYPOTHESIS = '(no hypothesis line)';
const V1_RESOLVED_PREFIX = 'resolved';
const V1_TYPE = Object.freeze({
  FINDING: 'finding', QUEST: 'quest', PARK: 'park', SOLVED: 'solved',
  DECLARED: 'quest-declared', UNPARSEABLE: '<unparseable>',
});
const KEPT_VERBATIM = 'kept verbatim';
const NO_KIND = '<none>';
const GIT = 'git';
const GIT_ADDED_COMMITS = Object.freeze(['log', '--diff-filter=A', '--format=%H', '--']);
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const TAR = 'tar';
const TAR_ARGUMENTS = Object.freeze(['-czf']);
const TAR_DIRECTORY_FLAG = '-C';
const TAR_LIST_FLAG = '-T';
const ARCHIVE_LIST = 'archive-list.txt';
const BUNDLE_DIR_FLAG = '--bundle-dir';
const BUNDLE_PREFIX = 'solve-v1-archive-';
const REASON = Object.freeze({
  OVERSIZED: 'open-quest file over 200 KB',
  CLOSED_EVIDENCE: 'closed-quest evidence',
  CLOSED_ORACLE: 'closed-quest oracle',
  CHANGES_FILE: 'v1 changes file',
  CLOSED_CHANGE: 'closed-quest change artifact',
  V1_DIR_PREFIX: 'v1 ',
});
const V1_LOOSE_DIRS = Object.freeze(['solve/artifacts', 'solve/autonomous', 'solve/migrations',
  'solve/oracles', 'solve/report', 'solve/state']);
const TEXT = Object.freeze({
  ARCHIVE_NOTE: 'Uploaded to the solve-evidence pre-release by solve-v2 phase 2; ' +
    'the bundle itself is never committed.',
  MIGRATED_FRONTIER: 'migrated frontier; seal-time value not measured',
  MIGRATED_SEAL: 'migrated v1 declaration; seal-time value not measured',
  ORPHAN_CLOSED: 'v1 log with no quest record; closed by the solve-v2 migration',
  ORPHAN_DISPOSITION: 'orphan log, superseded',
  ALREADY_RAN: 'migration already ran',
  DRAFT_DELETED: 'deleted (undeclared draft, no roadmap row)',
  LEDGER_STATEMENT: 'Legacy theory-ledger entries that cite no quest (folded from solve/theory-ledger.md).',
  LEDGER_CLOSED: 'ledger folded; nothing to solve',
  SUPERSEDED_DISPOSITION: 'superseded by migration',
  OPEN_DISPOSITION: 'open',
  INVENTORY_NOTE: 'Grandfathered migration corpus: the verbatim v1 log each ' +
    'migrated quest carries, by length and digest at baseCommit. These bytes ' +
    'are immutable historical evidence, excluded from the active v2 size ' +
    'budget and checked for drift by scripts/checks/solve-v2-budget.js.',
  EVIDENCE_MOVED: 'evidence moved into the quest directory: ',
});
const EMPTY_PROBE = Object.freeze({probe: 'oracle', args: {}});

// Amendment 7 plus the three open quests declared after the design table.
const OPEN_QUEST_EPICS = Object.freeze({
  'managed-split-cutover-handoff-closure': 'release-0-2-five-node-convergence',
  'rolling-restart-representative-certification': 'rolling-restart-certification',
  'oci-container-driver-live-activation': 'service-portability-ladder',
  'restore-deterministic-cloud-gate': 'deterministic-cloud-gate',
  'managed-partition-merge-live-validation': 'split-merge-transition-integrity',
  'newcomer-onboarding-friction': 'lagrange-devops-onboarding',
  'replica-projection-stale-leader-route-resync': 'topology-convergence-hardening',
});
const SUPERSEDED_OPEN_QUESTS = Object.freeze({
  'release-0-2-verification-v2': 'RELEASE.md replaced the 0.2 verification ladder on 2026-09-05',
});
const SPLIT_OPEN_QUESTS = Object.freeze([
  'oci-container-driver-live-activation', 'restore-deterministic-cloud-gate',
]);
const NEW_EPICS = Object.freeze([
  {id: 'release-0-2-five-node-convergence', proof: EPIC_PROOF.CERTIFICATION,
    roadmapRow: 'RM-0.2-five-node-convergence',
    title: 'Release 0.2 five-node convergence',
    intent: 'Five nodes form, rebalance and survive churn within the release budget on the representative harness.'},
  {id: 'rolling-restart-certification', proof: EPIC_PROOF.CERTIFICATION,
    roadmapRow: 'RM-0.1-fs-rolling-restart', title: 'Rolling-restart certification',
    intent: 'A rolling restart of every node keeps the cluster serving and converges back to full replication.'},
  {id: 'service-portability-ladder', proof: EPIC_PROOF.CERTIFICATION, roadmapRow: null,
    title: 'Service portability ladder',
    intent: 'Services run under the OCI container driver on a live host; the spec lives in solve/specs/service-portability-ladder/.'},
  {id: 'deterministic-cloud-gate', proof: EPIC_PROOF.DETERMINISTIC, roadmapRow: null,
    title: 'Deterministic cloud gate',
    intent: 'The GitHub-hosted blocking gate is repeatably green with every failure class understood.'},
]);
const V1_OPEN_EPIC_STATUSES = Object.freeze(['active', 'sharpening', 'discussing', 'proposed']);
const V1_DONE_EPIC_STATUSES = Object.freeze(['resolved', 'graduated', 'landed-default-off']);
const THEORY_STATUS_MAP = Object.freeze({
  'active': THEORY_STATUS.ACTIVE, 'supported': THEORY_STATUS.SUPPORTED,
  'falsified': THEORY_STATUS.FALSIFIED, 'superseded': THEORY_STATUS.SUPERSEDED,
  'avoided': THEORY_STATUS.SUPERSEDED, 'needs-rerun': THEORY_STATUS.ACTIVE,
  'stale': THEORY_STATUS.SUPERSEDED,
});

// v1 entry types -> v2 types (null = kept verbatim, no v2 meaning).
const TYPE_MAP = Object.freeze({
  'finding': ENTRY_TYPE.FINDING, 'evidence-ingested': ENTRY_TYPE.FINDING,
  'reflection': ENTRY_TYPE.FINDING, 'theory-option-declared': ENTRY_TYPE.FINDING,
  'theory-selected': ENTRY_TYPE.FINDING, 'theory-system-declared': ENTRY_TYPE.FINDING,
  'theory-superseded': ENTRY_TYPE.FINDING, 'theory-result': ENTRY_TYPE.FINDING,
  'attempt': ENTRY_TYPE.ATTEMPT,
  'quest': ENTRY_TYPE.TERMINAL, 'park': ENTRY_TYPE.TERMINAL, 'solved': ENTRY_TYPE.TERMINAL,
  'quest-declared': null, 'gate-decision': null, 'guard-override': null,
  'violation': null, 'invariant.evaluated': null, 'quest-amended': null,
  'rejection-decomposition': null, 'non-measurement': null, 'quest-upgraded': null,
  'frontier-reopened': null, 'attempt-base-corrected': null, 'goal-declared': null,
});
const VERIFICATION_KINDS = Object.freeze(['verifier-approval', 'verifier-rejection']);
const KIND_RULES = Object.freeze([
  {kind: FINDING_KIND.THEORY, test: (kind) => /theory|hypothesis|mechanism|root-cause|diagnosis|causal/u.test(kind)},
  {kind: FINDING_KIND.ALTITUDE_CHECK, test: (kind) => /altitude|reflection|scope|boundary|architecture|design|handoff|closure/u.test(kind)},
  {kind: FINDING_KIND.RULED_OUT, test: (kind) => /rulesout|ruled|falsif|counterexample|not-applicable|limitation|out-of-bar/u.test(kind)},
  {kind: FINDING_KIND.DECISION, test: (kind) => /decision|correction|attribution|classification|rejection|guard|candidate|inherited|successor|tightening/u.test(kind)},
]);

const state = {
  entries: 0, byType: {}, byKind: {}, unmapped: [], quests: [], drafts: [],
  archive: [], epics: {}, notes: [],
};

function read(file) {
  return fs.readFileSync(file, TEXT_ENCODING);
}

function readJson(file) {
  return JSON.parse(read(file));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, JSON_INDENT)}${LINE_SEPARATOR}`);
}

function appendLine(file, entry) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.appendFileSync(file, `${JSON.stringify(entry)}${LINE_SEPARATOR}`);
}

function stamp(entry) {
  return {ts: new Date().toISOString(), source: MIGRATION_SOURCE, ...entry};
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join(PATH_SEPARATOR);
}

function git(root, args) {
  return execFileSync(GIT, args, {cwd: root, encoding: TEXT_ENCODING, maxBuffer: GIT_MAX_BUFFER});
}

// --- classification ----------------------------------------------------------

function v2Kind(kind) {
  if (kind === null || kind === undefined) return FINDING_KIND.EVIDENCE;
  for (const rule of KIND_RULES) if (rule.test(kind)) return rule.kind;
  return FINDING_KIND.EVIDENCE;
}

function classify(entry) {
  state.entries += 1;
  const type = entry.type;
  const v2 = Object.prototype.hasOwnProperty.call(TYPE_MAP, type) ? TYPE_MAP[type] : undefined;
  if (v2 === undefined) {
    state.unmapped.push(type);
    return;
  }
  const kind = entry.kind === undefined ? NO_KIND : String(entry.kind);
  const verification = type === V1_TYPE.FINDING && VERIFICATION_KINDS.includes(entry.kind);
  const target = verification ? ENTRY_TYPE.VERIFICATION : v2 === null ? KEPT_VERBATIM : v2;
  const row = `${type} -> ${target}`;
  state.byType[row] = (state.byType[row] || 0) + 1;
  if (type === V1_TYPE.FINDING && target === ENTRY_TYPE.FINDING) {
    const mapped = `${kind} -> ${v2Kind(entry.kind)}`;
    state.byKind[mapped] = (state.byKind[mapped] || 0) + 1;
  }
}

function readLogLines(file) {
  return read(file).split(LINE_SEPARATOR).filter((line) => line.trim());
}

function parsedEntries(lines) {
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (_error) {
      return {type: V1_TYPE.UNPARSEABLE};
    }
  });
}

const V1_STATUS_OF = Object.freeze({
  [V1_TYPE.QUEST]: (entry, current) => entry.status || current,
  [V1_TYPE.PARK]: () => QUEST_STATUS.EXHAUSTED,
});

function v1Status(entries) {
  return entries.reduce((status, entry) => {
    const rule = V1_STATUS_OF[entry.type];
    return rule ? rule(entry, status) : status;
  }, QUEST_STATUS.OPEN);
}

function solvedFrontiers(entries) {
  return new Set(entries.filter((entry) => entry.type === V1_TYPE.SOLVED)
    .map((entry) => entry.frontier));
}

// --- epics --------------------------------------------------------------------

function epicIdFromPlan(links) {
  const match = EPIC_PLAN_PATTERN.exec(String(links?.planDoc || ''));
  return match ? match[1] : null;
}

function epicFor(id, quest, open) {
  if (OPEN_QUEST_EPICS[id]) return OPEN_QUEST_EPICS[id];
  const fromPlan = epicIdFromPlan(quest.links);
  if (fromPlan) return fromPlan;
  if (open) throw new Error(`open quest ${id} has no epic`);
  return LEGACY_EPIC;
}

function sealedAtFor(root, id, quest) {
  const drafted = quest.links?.draftedAtCommit;
  if (SHA_PATTERN.test(String(drafted || ''))) return drafted;
  const added = git(root, [...GIT_ADDED_COMMITS, `${V1_QUESTS}/${id}${JSON_SUFFIX}`])
    .trim().split(LINE_SEPARATOR).filter(Boolean);
  return added.length > 0 ? added[added.length - 1] : null;
}

function v2Quest(root, id, quest, epic) {
  const {id: _id, statement, doneWhen, constraints, ...rest} = quest;
  return {
    schema: QUEST_SCHEMA,
    id,
    statement,
    epic,
    doneWhen,
    constraints: constraints || [],
    sealedAt: sealedAtFor(root, id, quest),
    legacy: {...rest, migratedBy: MIGRATION_SOURCE},
  };
}

// --- evidence and archive -----------------------------------------------------

function questDir(root, id) {
  return path.join(root, QUESTS_DIR, id);
}

function archive(root, file, questId, reason) {
  const entry = {path: relative(root, file), quest: questId, reason};
  if (!state.archive.some((item) => item.path === entry.path)) state.archive.push(entry);
}

function rewriteProbePaths(doneWhen, questId, moved) {
  const args = {...(doneWhen.args || {})};
  if (typeof args.file === 'string' && moved.has(args.file)) args.file = moved.get(args.file);
  return {...doneWhen, args};
}

function moveOpenEvidence(root, id, doneWhen, targetId = id) {
  const moved = new Map();
  const target = path.join(questDir(root, targetId), EVIDENCE_DIR);
  const candidates = [
    ...walk(path.join(root, V1_EVIDENCE)).filter((file) => {
      const rel = relative(root, file).slice(V1_EVIDENCE.length + 1);
      return rel === `${id}${JSON_SUFFIX}` || rel.startsWith(`${id}.`) || rel.startsWith(`${id}/`);
    }),
    ...walk(path.join(root, V1_ORACLE)).filter((file) =>
      path.basename(file) === `${id}${JSON_SUFFIX}`),
    ...walk(path.join(root, V1_CHANGES, id)),
  ];
  for (const file of candidates) {
    const rel = relative(root, file);
    // An archive or an oversized file may not live under solve/ at all (the
    // pre-commit binary guard owns that rule), and open-quest evidence stays
    // small; anything else goes to the evidence bundle and is referenced
    // from the log rather than carried into the quest directory.
    const refused = solveBinaryOffences([rel]);
    if (refused.length > 0) {
      archive(root, file, id, refused[0].reason);
      continue;
    }
    if (fs.statSync(file).size > EVIDENCE_SIZE_LIMIT) {
      archive(root, file, id, REASON.OVERSIZED);
      continue;
    }
    const under = rel.startsWith(`${V1_EVIDENCE}/${id}/`) ? rel.slice(`${V1_EVIDENCE}/${id}/`.length) :
      rel.startsWith(`${V1_EVIDENCE}/`) ? rel.slice(`${V1_EVIDENCE}/`.length) :
        rel.startsWith(`${V1_ORACLE}/`) ? ORACLE_FILE :
          `${CHANGES_SUBDIR}/${rel.slice(`${V1_CHANGES}/${id}/`.length)}`;
    const destination = path.join(target, under);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(file, destination);
    moved.set(rel, relative(root, destination));
  }
  return {doneWhen: rewriteProbePaths(doneWhen, id, moved), moved};
}

function archiveClosedMaterial(root, ids) {
  const claim = (file, questId, reason) => archive(root, file, questId, reason);
  const questOf = (name) => ids.find((id) => name === id || name.startsWith(`${id}.`) ||
    name.startsWith(`${id}/`)) || null;
  for (const file of walk(path.join(root, V1_EVIDENCE))) {
    const name = relative(root, file).slice(V1_EVIDENCE.length + 1);
    claim(file, questOf(name), REASON.CLOSED_EVIDENCE);
  }
  for (const file of walk(path.join(root, V1_ORACLE))) {
    if (KEPT_ORACLES.includes(path.basename(file))) continue;
    claim(file, questOf(path.basename(file, JSON_SUFFIX)), REASON.CLOSED_ORACLE);
  }
  for (const dir of fs.existsSync(path.join(root, V1_CHANGES)) ?
    fs.readdirSync(path.join(root, V1_CHANGES)) : []) {
    if (KEPT_CHANGES.includes(dir)) continue;
    const full = path.join(root, V1_CHANGES, dir);
    if (!fs.statSync(full).isDirectory()) {
      claim(full, null, REASON.CHANGES_FILE);
      continue;
    }
    for (const file of walk(full)) {
      claim(file, ids.includes(dir) ? dir : null, REASON.CLOSED_CHANGE);
    }
  }
  for (const dir of V1_LOOSE_DIRS) {
    for (const file of walk(path.join(root, dir))) claim(file, null, `${REASON.V1_DIR_PREFIX}${dir}`);
  }
}

function buildArchive(root, bundleDir) {
  const files = [...new Set(state.archive.map((item) => item.path))].sort();
  fs.mkdirSync(bundleDir, {recursive: true});
  const listFile = path.join(bundleDir, ARCHIVE_LIST);
  fs.writeFileSync(listFile, files.join(LINE_SEPARATOR) + LINE_SEPARATOR);
  const bundle = path.join(bundleDir, ARCHIVE_NAME);
  fs.mkdirSync(path.join(root, ARCHIVE_DIR), {recursive: true});
  execFileSync(TAR, [...TAR_ARGUMENTS, bundle, TAR_DIRECTORY_FLAG, root, TAR_LIST_FLAG, listFile]);
  fs.unlinkSync(listFile);
  writeJson(path.join(root, ARCHIVE_DIR, ARCHIVE_MANIFEST), {
    bundle: ARCHIVE_NAME, files: state.archive, count: files.length,
    note: TEXT.ARCHIVE_NOTE,
  });
  return {bundle, files};
}

// --- theory ledger --------------------------------------------------------------

function theoryEntries(text) {
  const entries = [];
  let current = null;
  for (const line of text.split(LINE_SEPARATOR)) {
    const heading = THEORY_HEADING.exec(line);
    if (heading) {
      current = {id: heading[1], fields: {}, lines: []};
      entries.push(current);
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    const field = THEORY_FIELD.exec(line);
    if (field) current.fields[field[1].trim().toLowerCase()] = field[2].trim();
  }
  return entries;
}

function theoryFinding(entry, questIds) {
  const body = entry.lines.join(LINE_SEPARATOR);
  const cited = questIds.filter((id) => body.includes(`solve/quests/${id}`) ||
    body.includes(`solve/log/${id}`));
  const legacyStatus = String(entry.fields.status || '').toLowerCase();
  return {
    cited,
    finding: stamp({
      type: ENTRY_TYPE.FINDING,
      kind: FINDING_KIND.THEORY,
      status: THEORY_STATUS_MAP[legacyStatus] || THEORY_STATUS.SUPERSEDED,
      text: `${entry.id}: ${entry.fields.hypothesis || NO_HYPOTHESIS}`,
      legacyStatus,
      ledger: body.trim(),
    }),
  };
}

// --- epics --------------------------------------------------------------------------

function v2EpicStatus(front, hasOpenQuest) {
  if (hasOpenQuest || V1_OPEN_EPIC_STATUSES.includes(front.status)) return EPIC_STATUS.OPEN;
  if (V1_DONE_EPIC_STATUSES.includes(front.status) ||
    String(front.status || '').startsWith(V1_RESOLVED_PREFIX)) return EPIC_STATUS.DONE;
  return EPIC_STATUS.SUPERSEDED;
}

function renderValue(lines, key, value, indent) {
  if (Array.isArray(value)) {
    lines.push(value.length === 0 ? `${indent}${key}: ${YAML_EMPTY_LIST}` : `${indent}${key}:`);
    for (const item of value) lines.push(`${indent}  - ${item}`);
    return;
  }
  if (value && typeof value === 'object') {
    lines.push(`${indent}${key}:`);
    for (const [innerKey, innerValue] of Object.entries(value)) {
      renderValue(lines, innerKey, innerValue, `${indent}  `);
    }
    return;
  }
  lines.push(`${indent}${key}: ${value === undefined ? null : value}`);
}

function renderFront(front) {
  const lines = [FRONT_FENCE];
  for (const [key, value] of Object.entries(front)) renderValue(lines, key, value, '');
  lines.push(FRONT_FENCE);
  return lines.join(LINE_SEPARATOR);
}

const SOLVE_V2_EPIC = 'solve-v2';
const DRAFTS_HEADING = '## Drafts carried by the solve-v2 migration';
const BULLET = '- ';

function legacyFront(id, front, context) {
  return {
    id,
    status: v2EpicStatus(front, Boolean(context.openByEpic.get(id))),
    proof: front.proof || EPIC_PROOF.DETERMINISTIC,
    legacy: true,
    roadmapRow: front.roadmapRow ?? null,
    graduatesTo: front.graduatesTo ?? null,
    quests: [...new Set([...(front.quests || []), ...(context.questsByEpic.get(id) || [])])],
    authorizes: front.authorizes || [],
    legacyStatus: front.status ?? null,
  };
}

// The solve-v2 epic is already v2-shaped; only its quest list is merged.
function solveV2Front(id, front, context) {
  return {...front, status: EPIC_STATUS.OPEN,
    quests: [...new Set([...(front.quests || []), ...(context.questsByEpic.get(id) || [])])]};
}

function withDraftLines(body, lines) {
  if (!lines) return body;
  return `${body}${LINE_SEPARATOR}${DRAFTS_HEADING}${LINE_SEPARATOR}${LINE_SEPARATOR}` +
    lines.map((line) => `${BULLET}${line}`).join(LINE_SEPARATOR) + LINE_SEPARATOR;
}

function rewriteEpic(root, id, context) {
  const file = path.join(root, EPICS_DIR, `${id}${MARKDOWN_SUFFIX}`);
  const parsed = parseFrontMatter(read(file));
  const front = parsed.front || {};
  const next = id === SOLVE_V2_EPIC ? solveV2Front(id, front, context) :
    legacyFront(id, front, context);
  const body = withDraftLines(parsed.body, context.draftLines.get(id));
  const separator = body.startsWith(LINE_SEPARATOR) ? '' : LINE_SEPARATOR;
  fs.writeFileSync(file, `${renderFront(next)}${LINE_SEPARATOR}${separator}${body}`);
  state.epics[id] = next.status;
}

function writeNewEpic(root, spec, questsByEpic) {
  const file = path.join(root, EPICS_DIR, `${spec.id}${MARKDOWN_SUFFIX}`);
  if (fs.existsSync(file)) throw new Error(`epic ${spec.id} already exists`);
  const front = {
    id: spec.id, status: EPIC_STATUS.OPEN, proof: spec.proof, legacy: true,
    roadmapRow: spec.roadmapRow, graduatesTo: null,
    quests: questsByEpic.get(spec.id) || [], authorizes: [],
  };
  const body = [`# ${spec.title}`, '', spec.intent, '',
    'Derived by the solve-v2 migration from the quests listed above (amendment 7).',
    'The operator seals `doneWhen` and `authorizes` before new quests start here;',
    'until then the epic is `legacy: true` and its scope is unenforced.', ''].join(LINE_SEPARATOR);
  fs.writeFileSync(file, `${renderFront(front)}${LINE_SEPARATOR}${LINE_SEPARATOR}${body}`);
  state.epics[spec.id] = EPIC_STATUS.OPEN;
}

function writeLegacyEpic(root, questIds, alphaReadiness) {
  const front = {
    id: LEGACY_EPIC, status: EPIC_STATUS.DONE, proof: EPIC_PROOF.DETERMINISTIC, legacy: true,
    roadmapRow: null, graduatesTo: null, quests: questIds, authorizes: [],
  };
  const body = ['# Legacy (pre-v2) quests', '',
    'Closed v1 quests that named no epic. Their records are whole under',
    '`quest.json.legacy`; their logs are verbatim. Nothing starts here.', '',
    '## release-0-1-0-alpha-readiness (folded oracle)', '', '```json',
    JSON.stringify(alphaReadiness, null, JSON_INDENT), '```', ''].join(LINE_SEPARATOR);
  fs.writeFileSync(path.join(root, EPICS_DIR, `${LEGACY_EPIC}${MARKDOWN_SUFFIX}`),
    `${renderFront(front)}${LINE_SEPARATOR}${LINE_SEPARATOR}${body}`);
  state.epics[LEGACY_EPIC] = EPIC_STATUS.DONE;
}

function writeTemplate(root) {
  const template = ['---', 'id: <kebab-case-id>', 'status: open', 'proof: deterministic | simulation | certification',
    'doneWhen:', '  probe: script', '  args:', '    command: node scripts/checks/<check>.js',
    'quests:', '  - <quest-id>', 'authorizes:', '  - <path or glob a quest under this epic may change>', '---', '',
    '# <title>', '', '<Why now, in one paragraph. What the probe measures and why zero means done.>', ''].join(LINE_SEPARATOR);
  fs.writeFileSync(path.join(root, EPICS_DIR, `_template${MARKDOWN_SUFFIX}`), template);
}

// --- grandfathered migration corpus ------------------------------------------
//
// The verbatim v1 log each migrated quest carries is immutable historical
// payload, not active v2 footprint. This inventory is the authority on which
// bytes those are: it records, per quest, the exact length and digest of the
// v1 log as it existed at the pre-migration commit. The size budget subtracts
// that payload, and the same record makes losslessness a standing, mechanical
// invariant rather than a one-time claim.

function sha256Of(buffer) {
  return crypto.createHash(HASH_ALGORITHM).update(buffer).digest(HASH_ENCODING);
}

function v1LogPaths(root, baseCommit) {
  const listed = git(root, [...GIT_LS_TREE, baseCommit, '--', V1_LOGS]);
  return listed.split(LINE_SEPARATOR).filter((line) => line.endsWith(NDJSON_SUFFIX));
}

// One `git cat-file --batch` pass over the pre-migration logs: each answer is
// `<sha> blob <size>\n<size bytes>\n`.
function readV1Logs(root, baseCommit, logPaths) {
  const request = logPaths.map((file) => `${baseCommit}:${file}`).join(LINE_SEPARATOR);
  const output = execFileSync(GIT, [...GIT_CAT_FILE], {cwd: root, input: request,
    maxBuffer: GIT_MAX_BUFFER});
  const contents = new Map();
  let cursor = 0;
  for (const file of logPaths) {
    const headerEnd = output.indexOf(LINE_SEPARATOR, cursor);
    const size = Number(output.toString(TEXT_ENCODING, cursor, headerEnd).split(' ')[2]);
    const start = headerEnd + 1;
    contents.set(file, output.subarray(start, start + size));
    cursor = start + size + 1;
  }
  return contents;
}

/**
 * Build the grandfathered-corpus inventory from the pre-migration commit and
 * the migrated quest directories, and write it beside the migration report.
 * @param {string} root
 * @param {string} baseCommit commit holding the v1 solve/log tree
 * @return {Object}
 */
function writeMigrationInventory(root, baseCommit) {
  const logPaths = v1LogPaths(root, baseCommit);
  const contents = readV1Logs(root, baseCommit, logPaths);
  const quests = [];
  for (const file of logPaths) {
    const id = path.basename(file, NDJSON_SUFFIX);
    if (!fs.existsSync(path.join(questDir(root, id), LOG_FILE))) continue;
    const bytes = contents.get(file);
    quests.push({id, bytes: bytes.length, sha256: sha256Of(bytes)});
  }
  quests.sort((left, right) => left.id.localeCompare(right.id));
  const inventory = {
    schema: MIGRATION_INVENTORY_SCHEMA,
    baseCommit,
    note: TEXT.INVENTORY_NOTE,
    totals: {quests: quests.length,
      bytes: quests.reduce((sum, quest) => sum + quest.bytes, 0)},
    quests,
  };
  writeJson(path.join(root, MIGRATION_INVENTORY_FILE), inventory);
  return inventory;
}

function readMigrationInventory(root) {
  const file = path.join(root, MIGRATION_INVENTORY_FILE);
  return fs.existsSync(file) ? readJson(file) : null;
}

function corpusEntryDrift(root, quest) {
  const file = path.join(questDir(root, quest.id), LOG_FILE);
  if (!fs.existsSync(file)) return CORPUS_DRIFT.MISSING;
  const handle = fs.openSync(file, 'r');
  try {
    if (fs.fstatSync(handle).size < quest.bytes) return CORPUS_DRIFT.TRUNCATED;
    const head = Buffer.alloc(quest.bytes);
    fs.readSync(handle, head, 0, quest.bytes, 0);
    return sha256Of(head) === quest.sha256 ? null : CORPUS_DRIFT.REWRITTEN;
  } finally {
    fs.closeSync(handle);
  }
}

/**
 * Verify that every grandfathered v1 payload is still present, whole and
 * unaltered at the head of its migrated log.
 * @param {string} root
 * @return {{present: boolean, quests: number, bytes: number, drift: Object[]}}
 */
function verifyMigrationCorpus(root) {
  const inventory = readMigrationInventory(root);
  if (!inventory) return {present: false, quests: 0, bytes: 0, drift: []};
  const drift = [];
  for (const quest of inventory.quests) {
    const reason = corpusEntryDrift(root, quest);
    if (reason) drift.push({id: quest.id, reason});
  }
  return {present: true, quests: inventory.totals.quests,
    bytes: inventory.totals.bytes, drift};
}

// --- report -------------------------------------------------------------------------

function table(header, rows) {
  return [`| ${header.join(TABLE_SEPARATOR)} |`,
    `| ${header.map(() => TABLE_RULE).join(TABLE_SEPARATOR)} |`,
    ...rows.map((row) => `| ${row.join(TABLE_SEPARATOR)} |`)].join(LINE_SEPARATOR);
}

function writeReport(root, archiveInfo) {
  const typeRows = Object.entries(state.byType).sort((a, b) => b[1] - a[1]);
  const kindRows = Object.entries(state.byKind).sort((a, b) => b[1] - a[1]);
  const typeTotal = typeRows.reduce((sum, [, count]) => sum + count, 0);
  const unmappedRows = [...new Set(state.unmapped)].map((type) =>
    [type, state.unmapped.filter((item) => item === type).length]);
  const lines = ['# solve-v2 migration report', '',
    `Generated ${new Date().toISOString()} by scripts/solve/migrate-v1.js.`, '',
    `Log entries read: ${state.entries}. Mapped: ${typeTotal}. Unmapped: ${state.unmapped.length}.`, '',
    '## Entry types -> v2 types', '', table(['v1 type -> v2', 'count'], typeRows), '',
    `Sum: ${typeTotal}`, '',
    '## Finding kinds -> v2 kinds (finding-typed entries that stay findings)', '',
    table(['v1 kind -> v2 kind', 'count'], kindRows), '',
    `Sum: ${kindRows.reduce((sum, [, count]) => sum + count, 0)}`, '',
    '## Unmapped', '', unmappedRows.length === 0 ? '(empty)' : table(['type', 'count'], unmappedRows), '',
    '## Quests', '', table(['quest', 'v1 status', 'epic', 'disposition'],
      state.quests.map((row) => [row.id, row.status, row.epic, row.disposition])), '',
    '## Drafts (no log)', '', table(['draft', 'disposition'], state.drafts), '',
    '## Epics', '', table(['epic', 'v2 status'], Object.entries(state.epics).sort()), '',
    '## Archive', '', `${archiveInfo.files.length} files bundled into ${ARCHIVE_NAME} ` +
      `(manifest ${ARCHIVE_MANIFEST}); referenced by evidence findings in the quests they belonged to.`, '',
    '## Notes', '', ...state.notes.map((note) => `- ${note}`), ''];
  fs.mkdirSync(path.dirname(path.join(root, REPORT_FILE)), {recursive: true});
  fs.writeFileSync(path.join(root, REPORT_FILE), lines.join(LINE_SEPARATOR));
}

// --- main ----------------------------------------------------------------------------

function recordSplit(root, id, record, entries, logFile, questsByEpic, openByEpic) {
  const children = splitQuest(root, id, record, entries);
  appendLine(logFile, stamp({type: ENTRY_TYPE.TERMINAL, status: QUEST_STATUS.SUPERSEDED,
    text: `split into one quest per frontier: ${children.join(LIST_SEPARATOR)}`,
    supersededBy: children}));
  if (!questsByEpic.has(record.epic)) questsByEpic.set(record.epic, []);
  for (const child of children) questsByEpic.get(record.epic).push(child);
  openByEpic.set(record.epic, true);
  return `split into ${children.length} child quests`;
}

function recordOpen(root, id, record, logFile, openByEpic) {
  const moved = moveOpenEvidence(root, id, record.doneWhen);
  record.doneWhen = moved.doneWhen;
  if (moved.moved.size > 0) {
    appendLine(logFile, stamp({type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.DECISION,
      text: TEXT.EVIDENCE_MOVED + [...moved.moved.values()].join(LIST_SEPARATOR)}));
  }
  appendLine(logFile, migratedSeal(record));
  openByEpic.set(record.epic, true);
  return TEXT.OPEN_DISPOSITION;
}

function recordSuperseded(id, logFile) {
  appendLine(logFile, stamp({type: ENTRY_TYPE.TERMINAL, status: QUEST_STATUS.SUPERSEDED,
    text: SUPERSEDED_OPEN_QUESTS[id]}));
  return TEXT.SUPERSEDED_DISPOSITION;
}

// The disposition of an open v1 quest: superseded (amendment 7), split into
// one child per frontier (amendment 6), or carried over open with its
// evidence and a v2 seal.
function recordOpenDisposition(root, id, record, entries, logFile, questsByEpic, openByEpic) {
  if (SUPERSEDED_OPEN_QUESTS[id]) return recordSuperseded(id, logFile);
  if (SPLIT_OPEN_QUESTS.includes(id)) {
    return recordSplit(root, id, record, entries, logFile, questsByEpic, openByEpic);
  }
  return recordOpen(root, id, record, logFile, openByEpic);
}

function migrateQuest(root, id, quest, entries, lines, questsByEpic, openByEpic) {
  const status = v1Status(entries);
  const open = status === QUEST_STATUS.OPEN;
  const epic = epicFor(id, quest, open);
  const record = v2Quest(root, id, quest, epic);
  const dir = questDir(root, id);
  fs.mkdirSync(dir, {recursive: true});
  const logFile = path.join(dir, LOG_FILE);
  fs.writeFileSync(logFile, lines.join(LINE_SEPARATOR) + LINE_SEPARATOR);
  const disposition = open ?
    recordOpenDisposition(root, id, record, entries, logFile, questsByEpic, openByEpic) : status;
  normalizeConstraints(record);
  writeJson(path.join(dir, QUEST_FILE), record);
  if (!questsByEpic.has(epic)) questsByEpic.set(epic, []);
  questsByEpic.get(epic).push(id);
  state.quests.push({id, status, epic, disposition});
  return {open, status};
}

// The v2 seal of a quest that v1 declared: the declaration commit is the
// seal; the seal-time metric was never measured under v1.
function migratedSeal(record) {
  return stamp({type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.DECISION,
    text: `sealed under v1 at ${record.sealedAt}; migrated by solve-v2 phase 2`,
    seal: {sealedAt: record.sealedAt, statement: record.statement, doneWhen: record.doneWhen,
      metric: null, target: null, measuring: false, reason: TEXT.MIGRATED_SEAL}});
}

function splitQuest(root, id, parent, entries) {
  const solved = solvedFrontiers(entries);
  const frontiers = parent.legacy.frontiers || [];
  return frontiers.map((frontier) => {
    const childId = frontier.id.startsWith(id) ? frontier.id : `${id}${CHILD_SEPARATOR}${frontier.id}`;
    const dir = questDir(root, childId);
    fs.mkdirSync(path.join(dir, EVIDENCE_DIR), {recursive: true});
    const moved = solved.has(frontier.id) ? {doneWhen: frontier.metric} :
      moveOpenEvidence(root, id, frontier.metric, childId);
    const doneWhen = moved.doneWhen;
    writeJson(path.join(dir, QUEST_FILE), {
      schema: QUEST_SCHEMA, id: childId,
      statement: `${parent.statement} (frontier ${frontier.id})`,
      epic: parent.epic, doneWhen, constraints: parent.constraints,
      sealedAt: parent.sealedAt,
      legacy: {parentQuest: id, frontier, migratedBy: MIGRATION_SOURCE},
    });
    const logFile = path.join(dir, LOG_FILE);
    appendLine(logFile, stamp({type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.DECISION,
      text: `split from ${id} frontier ${frontier.id}; the parent log holds the history`,
      seal: {sealedAt: parent.sealedAt, statement: parent.statement, doneWhen, metric: null,
        target: null, measuring: false, reason: TEXT.MIGRATED_FRONTIER}}));
    if (solved.has(frontier.id)) {
      appendLine(logFile, stamp({type: ENTRY_TYPE.TERMINAL, status: QUEST_STATUS.SOLVED,
        text: `frontier ${frontier.id} was solved under v1`}));
      fs.rmSync(path.join(dir, EVIDENCE_DIR), {recursive: true, force: true});
    }
    return childId;
  });
}

function normalizeConstraints(record) {
  const items = Array.isArray(record.constraints) ? record.constraints : [];
  const conforming = items.every((item) => item && typeof item === 'object' &&
    typeof item.id === 'string' && typeof item.statement === 'string');
  if (conforming) return;
  record.legacy.constraints = record.constraints;
  record.constraints = [];
  state.notes.push(`${record.id}: v1 constraints kept under legacy.constraints (not {id, statement})`);
}

function migrateOrphanLog(root, name, questsByEpic) {
  const id = name.slice(0, -NDJSON_SUFFIX.length);
  const lines = readLogLines(path.join(root, V1_LOGS, name));
  const entries = parsedEntries(lines);
  for (const entry of entries) classify(entry);
  const declared = entries.find((entry) => entry.type === V1_TYPE.DECLARED);
  const dir = questDir(root, id);
  fs.mkdirSync(dir, {recursive: true});
  const logFile = path.join(dir, LOG_FILE);
  fs.writeFileSync(logFile, lines.join(LINE_SEPARATOR) + LINE_SEPARATOR);
  writeJson(path.join(dir, QUEST_FILE), {
    schema: QUEST_SCHEMA, id,
    statement: declared?.sealed?.statement || `v1 log without a quest record (${name})`,
    epic: LEGACY_EPIC, doneWhen: declared?.sealed?.doneWhen || EMPTY_PROBE,
    constraints: [], sealedAt: null,
    legacy: {migratedBy: MIGRATION_SOURCE, orphanLog: true},
  });
  if (v1Status(entries) === QUEST_STATUS.OPEN) {
    appendLine(logFile, stamp({type: ENTRY_TYPE.TERMINAL, status: QUEST_STATUS.SUPERSEDED,
      text: TEXT.ORPHAN_CLOSED}));
  }
  if (!questsByEpic.has(LEGACY_EPIC)) questsByEpic.set(LEGACY_EPIC, []);
  questsByEpic.get(LEGACY_EPIC).push(id);
  state.quests.push({id, status: v1Status(entries), epic: LEGACY_EPIC,
    disposition: TEXT.ORPHAN_DISPOSITION});
  return id;
}

function migrateDraft(quest, id, draftLines) {
  const epic = epicIdFromPlan(quest.links);
  if (!(quest.links?.roadmapRow && epic)) {
    state.drafts.push([id, TEXT.DRAFT_DELETED]);
    return;
  }
  if (!draftLines.has(epic)) draftLines.set(epic, []);
  draftLines.get(epic).push(`${id} (${quest.links.roadmapRow}): ${quest.statement}`);
  state.drafts.push([id, `one line in epic ${epic}`]);
}

function migrateQuests(root, ids, context) {
  for (const id of ids) {
    const quest = readJson(path.join(root, V1_QUESTS, `${id}${JSON_SUFFIX}`));
    const logFile = path.join(root, V1_LOGS, `${id}${NDJSON_SUFFIX}`);
    if (!fs.existsSync(logFile)) {
      migrateDraft(quest, id, context.draftLines);
      continue;
    }
    const lines = readLogLines(logFile);
    const entries = parsedEntries(lines);
    for (const entry of entries) classify(entry);
    const result = migrateQuest(root, id, quest, entries, lines, context.questsByEpic,
      context.openByEpic);
    if (!result.open) context.closedIds.push(id);
    if (state.quests.at(-1).epic === LEGACY_EPIC) context.legacyIds.push(id);
  }
  for (const name of fs.readdirSync(path.join(root, V1_LOGS)).sort()) {
    if (!name.endsWith(NDJSON_SUFFIX) || ids.includes(name.slice(0, -NDJSON_SUFFIX.length))) {
      continue;
    }
    const orphan = migrateOrphanLog(root, name, context.questsByEpic);
    context.closedIds.push(orphan);
    context.legacyIds.push(orphan);
  }
}

function migrateTheoryLedger(root, ids, context) {
  const ledger = theoryEntries(read(path.join(root, V1_THEORY_LEDGER)));
  const ledgerQuestDir = questDir(root, THEORY_LEDGER_QUEST);
  fs.mkdirSync(ledgerQuestDir, {recursive: true});
  writeJson(path.join(ledgerQuestDir, QUEST_FILE), {
    schema: QUEST_SCHEMA, id: THEORY_LEDGER_QUEST,
    statement: TEXT.LEDGER_STATEMENT,
    epic: LEGACY_EPIC, doneWhen: EMPTY_PROBE, constraints: [], sealedAt: null,
    legacy: {migratedBy: MIGRATION_SOURCE, preamble: read(path.join(root, V1_THEORY_LEDGER))
      .split(THEORY_SPLIT)[0]},
  });
  let orphanTheories = 0;
  for (const entry of ledger) {
    const {cited, finding} = theoryFinding(entry, ids);
    const targets = cited.length > 0 ? cited : [THEORY_LEDGER_QUEST];
    if (cited.length === 0) orphanTheories += 1;
    for (const target of targets) appendLine(path.join(questDir(root, target), LOG_FILE), finding);
  }
  appendLine(path.join(ledgerQuestDir, LOG_FILE), stamp({type: ENTRY_TYPE.TERMINAL,
    status: QUEST_STATUS.SUPERSEDED, text: TEXT.LEDGER_CLOSED}));
  context.legacyIds.push(THEORY_LEDGER_QUEST);
  state.notes.push(`theory ledger: ${ledger.length} entries; ` +
    `${ledger.length - orphanTheories} attached to cited quests, ${orphanTheories} in ` +
    THEORY_LEDGER_QUEST);
}

// Every archived file that belongs to a quest is referenced from that
// quest's log, whether it left a closed quest's change directory or an open
// quest's evidence: the bundle is the store, the log is the reference.
function archiveOwners() {
  const owners = new Map();
  for (const entry of state.archive) {
    if (!entry.quest) continue;
    if (!owners.has(entry.quest)) owners.set(entry.quest, []);
    owners.get(entry.quest).push(entry.path);
  }
  return owners;
}

function archiveAndReference(root, closedIds, bundleDir) {
  archiveClosedMaterial(root, closedIds);
  const archiveInfo = buildArchive(root, bundleDir);
  for (const [questId, files] of archiveOwners()) {
    appendLine(path.join(questDir(root, questId), LOG_FILE), stamp({
      type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.EVIDENCE,
      text: `v1 files archived in ${ARCHIVE_NAME} (evidence store): ` +
        files.join(LIST_SEPARATOR),
      archive: ARCHIVE_NAME, files,
    }));
  }
  return archiveInfo;
}

function keepOracleTables(root) {
  fs.mkdirSync(path.join(root, KEPT_ORACLES_DIR), {recursive: true});
  for (const name of KEPT_ORACLES) {
    const source = path.join(root, V1_ORACLE, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(root, KEPT_ORACLES_DIR, name));
  }
}

function migrateEpics(root, context) {
  const alpha = readJson(path.join(root, V1_ALPHA_READINESS));
  for (const name of fs.readdirSync(path.join(root, EPICS_DIR))) {
    if (!name.endsWith(MARKDOWN_SUFFIX) || name === EPIC_README || name === EPIC_TEMPLATE) continue;
    rewriteEpic(root, name.slice(0, -MARKDOWN_SUFFIX.length), context);
  }
  for (const spec of NEW_EPICS) writeNewEpic(root, spec, context.questsByEpic);
  writeLegacyEpic(root, context.legacyIds, alpha);
  writeTemplate(root);
}

function deleteV1Layout(root, questFiles) {
  for (const name of questFiles) fs.unlinkSync(path.join(root, V1_QUESTS, name));
  for (const dir of V1_DELETED_DIRS) {
    fs.rmSync(path.join(root, dir), {recursive: true, force: true});
  }
  for (const dir of fs.readdirSync(path.join(root, V1_CHANGES))) {
    if (KEPT_CHANGES.includes(dir)) continue;
    fs.rmSync(path.join(root, V1_CHANGES, dir), {recursive: true, force: true});
  }
  for (const file of [V1_THEORY_LEDGER, V1_ALPHA_READINESS, V1_CONFIG_EXAMPLE, ...V1_GENERATED]) {
    fs.rmSync(path.join(root, file), {force: true});
  }
}

/**
 * Run the whole migration in place. `options.bundleDir` receives the archive
 * bundle (never inside the tree).
 * @param {string} root
 * @param {{bundleDir?: string}} [options]
 * @return {Object}
 */
function migrate(root, options = {}) {
  if (fs.existsSync(path.join(root, REPORT_FILE))) throw new Error(TEXT.ALREADY_RAN);
  const bundleDir = options.bundleDir || fs.mkdtempSync(path.join(os.tmpdir(), BUNDLE_PREFIX));
  const questFiles = fs.readdirSync(path.join(root, V1_QUESTS))
    .filter((name) => name.endsWith(JSON_SUFFIX)).sort();
  const ids = questFiles.map((name) => name.slice(0, -JSON_SUFFIX.length));
  const context = {questsByEpic: new Map(), openByEpic: new Map(), draftLines: new Map(),
    closedIds: [], legacyIds: []};
  migrateQuests(root, ids, context);
  migrateTheoryLedger(root, ids, context);
  const archiveInfo = archiveAndReference(root, context.closedIds, bundleDir);
  keepOracleTables(root);
  migrateEpics(root, context);
  deleteV1Layout(root, questFiles);
  state.notes.push(`open quests: ${[...context.openByEpic.keys()].length} epics carry open work`);
  writeReport(root, archiveInfo);
  return {entries: state.entries, unmapped: state.unmapped.length, quests: state.quests.length,
    drafts: state.drafts.length, archived: archiveInfo.files.length, bundle: archiveInfo.bundle};
}

export {
  ARCHIVE_NAME, MIGRATION_INVENTORY_FILE, REPORT_FILE, migrate,
  verifyMigrationCorpus, writeMigrationInventory,
};

function main(argv, root) {
  const inventoryIndex = argv.indexOf(INVENTORY_FROM_FLAG);
  if (inventoryIndex !== -1) {
    const inventory = writeMigrationInventory(root, argv[inventoryIndex + 1]);
    return {inventory: MIGRATION_INVENTORY_FILE, ...inventory.totals};
  }
  const bundleIndex = argv.indexOf(BUNDLE_DIR_FLAG);
  return migrate(root, bundleIndex === -1 ? {} :
    {bundleDir: argv[bundleIndex + 1]});
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const result = main(process.argv.slice(2), process.cwd());
  process.stdout.write(`${JSON.stringify(result, null, JSON_INDENT)}${LINE_SEPARATOR}`);
}
