import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {
  QUEST_CLASS_PRODUCT,
  SOLVE_DATA_DIR,
} from './constants.js';
import {
  readChangeArtifact,
  requestedChangeArtifactPath,
  resolvedChangeArtifactPath,
  canonicalCommitDelta,
  commitDeltaChangedPaths,
} from './content-addressed-change-artifact.js';

// A measurement-only (repro-on-HEAD) changeRef names a COMMITTED tree-to-tree
// delta `commit:<baseSha>:<headSha>` instead of a `diff:<path>` artifact, so a
// quest whose implementation already landed can seal a measuring attempt
// without fabricating a working-tree diff (parallel-session epic, items 3-5).
export function parseCommitChangeRef(changeRef) {
  if (typeof changeRef !== 'string') return null;
  const match = COMMIT_REF_PATTERN.exec(changeRef);
  if (!match) return null;
  return {base: match[1], head: match[2]};
}

export function isCommitChangeRef(changeRef) {
  return parseCommitChangeRef(changeRef) !== null;
}

// Record-time admission gate for a measurement-only (commit:) changeRef.
// Because the receipt is pinned by sha, the checkpoint-time base→working-tree
// dirty check cannot apply to it — so the equivalent guarantee moves here:
// the claimed paths must be CLEAN in the working tree (no uncommitted edits
// the receipt would silently stop covering) and head must be an ancestor of
// HEAD (the claimed delta must be in current history, not a dangling side
// branch). Returns one typed admission result; a non-commit ref is explicitly
// not applicable rather than encoded as a null problem.
export function inspectCommitChangeRefAdmission(
  root, changeRef, inspection, options = {}) {
  const commitRef = parseCommitChangeRef(changeRef);
  if (!commitRef) return {applicable: false, ok: true};
  const head = spawnSync('git', ['rev-parse', 'HEAD'],
    {cwd: root, encoding: 'utf8'});
  const headSha = String(head.stdout || '').trim();
  if (head.status !== 0 ||
    !gitIsAncestorShas(root, commitRef.head, headSha)) {
    return {
      applicable: true,
      ok: false,
      problem:
        LOCAL_STR_COMMIT_HEAD_NOT_ANCESTOR +
        LOCAL_STR_COMMIT_DELTA_NOT_IN_HISTORY,
    };
  }
  // The clean-tree guarantee covers genuine source drift only. A commit: range
  // can legitimately name the recording quest's OWN solve/ bookkeeping (its
  // event log, attempt diffs, report) — and a discharge attempt's own
  // gate-advisory and evidence-ingest events append to that log during the
  // attempt, before this check runs. That Solver-owned bookkeeping is not drift
  // the pinned receipt must cover, so it is excluded here exactly as the
  // scope classification above excludes it. Genuine source paths stay strict.
  const questId = options.questId ?? inspection?.quest?.id ??
    inspection?.questId ?? null;
  const paths = (inspection?.changedPaths || [])
    .filter((filePath) => !isOwnQuestSolveBookkeeping(filePath, questId));
  if (paths.length > 0) {
    const status = spawnSync('git', ['status', '--porcelain', '--', ...paths],
      {cwd: root, encoding: 'utf8'});
    // Fail CLOSED on a spawn failure: this is an integrity gate, so an
    // unreadable tree must refuse, never silently admit.
    if (status.status !== 0) {
      return {
        applicable: true,
        ok: false,
        problem:
          LOCAL_STR_COMMIT_CLEAN_VERIFY_FAILED +
          String(status.stderr || LOCAL_STR_GIT_STATUS_FAILED).trim(),
      };
    }
    if (String(status.stdout || '').trim() !== '') {
      return {
        applicable: true,
        ok: false,
        problem:
          LOCAL_STR_COMMIT_PATHS_DIRTY +
          LOCAL_STR_COMMIT_PATHS_DIRTY_ACTION,
      };
    }
  }
  return {applicable: true, ok: true};
}

function gitIsAncestorShas(root, ancestor, descendant) {
  return spawnSync(LOCAL_STR_GIT,
    [LOCAL_STR_MERGE_BASE, LOCAL_STR_IS_ANCESTOR, ancestor, descendant],
    {cwd: root, encoding: TEXT_ENCODING}).status === 0;
}

const LOCAL_STR_GIT = 'git';
const LOCAL_STR_MERGE_BASE = 'merge-base';
const LOCAL_STR_IS_ANCESTOR = '--is-ancestor';
const TEXT_ENCODING = 'utf8';
const LOCAL_STR_GIT_STATUS_FAILED = 'git status failed';
const LOCAL_STR_COMMIT_HEAD_NOT_ANCESTOR =
  'commit changeRef head is not an ancestor of HEAD: the claimed ';
const LOCAL_STR_COMMIT_DELTA_NOT_IN_HISTORY =
  'delta is not in current history';
const LOCAL_STR_COMMIT_CLEAN_VERIFY_FAILED =
  'commit changeRef could not verify claimed paths are clean: ';
const LOCAL_STR_COMMIT_PATHS_DIRTY =
  'commit changeRef claimed paths have uncommitted changes the ';
const LOCAL_STR_COMMIT_PATHS_DIRTY_ACTION =
  'pinned receipt would not cover: commit or revert them first';
const LOCAL_STR_COMMIT_RANGE_TOUCHES_NO_PATHS =
  'commit changeRef range touches no paths';
const LOCAL_STR_SHA256_PREFIX = 'sha256:';
const LOCAL_STR_PROBLEM_WORKFLOW_SCOPE =
  'workflow changes must be recorded in a workflow/Quest tooling Quest';
const LOCAL_STR_PROBLEM_RUNTIME_SCOPE =
  'runtime changes must be recorded in a runtime Quest';
const DIFF_PREFIX = 'diff:';
const COMMIT_REF_PATTERN = /^commit:([0-9a-f]{40}):([0-9a-f]{40})$/u;
const COMMIT_STORAGE_KIND = 'commit';
const DIFF_EXTENSION = '.diff';
const DESCRIPTOR_EXTENSION = '.diff.json';
const GZIP_EXTENSION = '.diff.gz';
const MARKDOWN_EXTENSION = '.md';
const CONTENT_ADDRESSED_STORAGE_KIND = 'content-addressed';
const ROOT_PACKAGE_LOCK_PATH = 'package-lock.json';
const QUEST_SCOPE_RUNTIME = 'runtime';
const QUEST_SCOPE_WORKFLOW = 'workflow';
const SOLVE_BOOKKEEPING_SUBTREES = Object.freeze([
  'artifacts',
  'changes',
  'evidence',
  'log',
  'oracle',
  'quests',
  'report',
  'state',
]);
const SCOPE_CITATION_FILE_TOKEN =
  /[A-Za-z0-9_./*-]*[A-Za-z0-9_*-]+\.(?:js|mjs|cjs|json|md|diff|sh|yaml|yml)\b/gu;
const NON_OWNER_SCOPE_CITATION_PREFIXES = Object.freeze([
  `${SOLVE_DATA_DIR}/artifacts/`,
  `${SOLVE_DATA_DIR}/changes/`,
  `${SOLVE_DATA_DIR}/log/`,
  `${SOLVE_DATA_DIR}/oracle/`,
  `${SOLVE_DATA_DIR}/report/`,
  `${SOLVE_DATA_DIR}/state/`,
  'test-output/',
]);
const PROBLEM_MISSING_UNIFIED_DIFF =
  'changeRef artifact must contain a unified diff hunk or Git binary patch';
const WORKFLOW_PATH_PREFIXES = Object.freeze([
  'scripts/solve/',
  'scripts/solve.js',
  'scripts/quest-context.js',
  'scripts/list-commands.js',
  'package.json',
  'solve/',
  'test/solve/',
  'test/scripts/list-commands.test.js',
  'docs/steering/',
  'docs/development/',
  'AGENTS.md',
]);

const RUNTIME_PATH_PREFIXES = Object.freeze([
  'src/',
  'test/distributed/',
  'test/rebalancer/',
  'test/bootstrap/',
  'test/cdc/',
  'test/node/',
  'test/query/',
]);

const SOURCE_VERIFICATION_PATH_PREFIXES = Object.freeze([
  'src/',
  'scripts/',
  'test/',
  'models/',
  'architecture/models/',
  'architecture/contracts/',
  'package.json',
]);

const MODEL_EVIDENCE_PATH_PREFIXES = Object.freeze([
  'models/',
  'architecture/models/',
  'architecture/contracts/',
  'scripts/model-',
  'scripts/check-alloy-models.js',
  'scripts/check-decision-tables.js',
  'scripts/check-invariants.js',
  'scripts/check-owner-traces.js',
  'scripts/check-statecharts.js',
  'scripts/check-system-contracts.js',
  'test/scripts/check-owner-traces.test.js',
  'package.json',
]);

function normalizeSlash(value) {
  return String(value || '').replaceAll(path.sep, '/');
}

export function changeArtifactPath(root, questId, changeRef) {
  return resolvedChangeArtifactPath(root, changeRef);
}

export function changeArtifactIdentity(root, questId, changeRef) {
  const commitRef = parseCommitChangeRef(changeRef);
  if (commitRef) {
    // A commit changeRef's identity IS its canonical tree-to-tree delta: it is
    // permanently reproducible (no file to edit), so no storageKind fields.
    const delta = canonicalCommitDelta(root, commitRef.base, commitRef.head, []);
    if (!delta.ok) {
      return {path: changeRef, exists: false, size: null, sha256: null};
    }
    return {
      path: changeRef,
      exists: true,
      size: delta.content.length,
      sha256: delta.fingerprint.slice(LOCAL_STR_SHA256_PREFIX.length),
    };
  }
  const requestedPath = requestedChangeArtifactPath(root, changeRef);
  const artifact = readChangeArtifact(root, changeRef);
  if (!requestedPath || !artifact.valid || !artifact.payload) {
    return {
      path: requestedPath ?
        normalizeSlash(path.relative(root, requestedPath)) : null,
      exists: false,
      size: null,
      sha256: null,
    };
  }
  const identity = {
    path: normalizeSlash(path.relative(root, requestedPath)),
    exists: true,
    size: artifact.payloadBytes,
    sha256: artifact.payloadSha256,
  };
  if (artifact.kind === CONTENT_ADDRESSED_STORAGE_KIND) {
    identity.storageKind = artifact.kind;
    identity.descriptorSha256 = artifact.descriptorSha256;
    identity.objectPath = normalizeSlash(path.relative(root, artifact.objectPath));
    identity.objectStorageSha256 = artifact.objectStorageSha256;
  }
  return identity;
}

export function changeArtifactIdentityMatches(recorded, current) {
  const baseMatches = changeArtifactIdentityIsSealed(recorded) &&
    changeArtifactIdentityIsSealed(current) &&
    recorded.path === current.path &&
    recorded.size === current.size &&
    recorded.sha256 === current.sha256;
  if (!baseMatches ||
    recorded.storageKind !== CONTENT_ADDRESSED_STORAGE_KIND) {
    return baseMatches;
  }
  return current.storageKind === recorded.storageKind &&
    current.descriptorSha256 === recorded.descriptorSha256 &&
    current.objectPath === recorded.objectPath &&
    current.objectStorageSha256 === recorded.objectStorageSha256;
}

export function changeArtifactIdentityIsSealed(identity) {
  const baseSealed = identity?.exists === true &&
    typeof identity.path === 'string' && identity.path.length > 0 &&
    Number.isInteger(identity.size) && identity.size >= 0 &&
    typeof identity.sha256 === 'string' && identity.sha256.length > 0;
  if (!baseSealed || identity.storageKind !== CONTENT_ADDRESSED_STORAGE_KIND) {
    return baseSealed;
  }
  return typeof identity.descriptorSha256 === 'string' &&
    identity.descriptorSha256.length > 0 &&
    typeof identity.objectPath === 'string' && identity.objectPath.length > 0 &&
    typeof identity.objectStorageSha256 === 'string' &&
    identity.objectStorageSha256.length > 0;
}

export function expectedChangeDir(root, questId) {
  return path.resolve(root, SOLVE_DATA_DIR, 'changes', questId);
}

function isExpectedChangeArtifact(root, questId, filePath) {
  const changeDir = `${expectedChangeDir(root, questId)}${path.sep}`;
  return filePath.startsWith(changeDir) &&
    (filePath.endsWith(DIFF_EXTENSION) ||
      filePath.endsWith(DESCRIPTOR_EXTENSION) ||
      filePath.endsWith(GZIP_EXTENSION));
}

function normalizeDiffPath(value) {
  const cleaned = normalizeSlash(value)
    .replace(/^a\//u, '')
    .replace(/^b\//u, '');
  return cleaned === '/dev/null' ? null : cleaned;
}

function parseGitDiffLine(line) {
  const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
  if (!match) return [];
  return [normalizeDiffPath(match[1]), normalizeDiffPath(match[2])]
    .filter(Boolean);
}

function parsePatchPathLine(line) {
  const match = /^(?:---|\+\+\+)\s+(.+)$/u.exec(line);
  if (!match) return [];
  const firstToken = match[1].split(/\s+/u)[0];
  const normalized = normalizeDiffPath(firstToken);
  return normalized ? [normalized] : [];
}

function parseRenameLine(line) {
  const match = /^rename (?:from|to)\s+(.+)$/u.exec(line);
  if (!match) return [];
  const normalized = normalizeDiffPath(match[1]);
  return normalized ? [normalized] : [];
}

export function changedPathsFromDiffContent(content) {
  const paths = new Set();
  const lines = String(content || '').split('\n');
  const hasGitDiffHeaders = lines.some((line) => line.startsWith('diff --git '));
  for (const line of lines) {
    const candidates = hasGitDiffHeaders ? [
      ...parseGitDiffLine(line),
      ...parseRenameLine(line),
    ] : parsePatchPathLine(line);
    for (const filePath of candidates) {
      paths.add(filePath);
    }
  }
  return [...paths].sort();
}

function hasUnifiedDiffHunk(content) {
  return /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/mu.test(String(content || ''));
}

function hasGitBinaryPatch(content) {
  return /^GIT binary patch$/mu.test(String(content || ''));
}

// The Solver's own checkpoint commits legitimately bundle a quest's source
// paths with that quest's OWN solve/ bookkeeping (attempt diffs under
// solve/changes/<id>/, the event log, the report projection, oracle). When
// such a committed range is later referenced as a measurement-only commit:
// changeRef (e.g. to discharge a base-unreachable rejected-attempt
// replacement), that own-quest bookkeeping must not turn the range into a
// workflow-scope changeRef — only genuinely foreign workflow paths may. This
// is deliberately narrow: it matches only the recording quest's id-scoped
// subtrees and the shared frontier-board projection, never scripts/solve/,
// another quest's solve/ tree, or any other workflow path.
export function isOwnQuestSolveBookkeeping(filePath, questId) {
  if (typeof questId !== 'string' || questId.length === 0) return false;
  const normalized = normalizeSlash(filePath);
  if (normalized === `${SOLVE_DATA_DIR}/FRONTIER.generated.md`) return true;
  const id = String(questId);
  return SOLVE_BOOKKEEPING_SUBTREES.some((subtree) =>
    normalized.startsWith(`${SOLVE_DATA_DIR}/${subtree}/${id}`));
}

export function classifyPath(filePath) {
  const normalized = normalizeSlash(filePath);
  if (WORKFLOW_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return QUEST_SCOPE_WORKFLOW;
  }
  if (normalized.endsWith(MARKDOWN_EXTENSION)) return 'docs';
  if (RUNTIME_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return QUEST_SCOPE_RUNTIME;
  }
  if (normalized.startsWith('test/')) return 'test';
  if (normalized.startsWith('docs/') || normalized.startsWith('architecture/')) {
    return 'docs';
  }
  return 'other';
}

export function requiresSourceVerification(filePath) {
  const normalized = normalizeSlash(filePath);
  return normalized === ROOT_PACKAGE_LOCK_PATH ||
    SOURCE_VERIFICATION_PATH_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix));
}

export function requiresModelEvidence(filePath) {
  const normalized = normalizeSlash(filePath);
  return MODEL_EVIDENCE_PATH_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix));
}

function sourceOwnerScopeFromCitation(filePath) {
  const normalized = normalizeSlash(filePath);
  if (NON_OWNER_SCOPE_CITATION_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix))) return null;
  const category = classifyPath(normalized);
  if (category === QUEST_SCOPE_RUNTIME || category === QUEST_SCOPE_WORKFLOW) {
    return category;
  }
  return null;
}

function maskNonOwnerScopeCitations(value) {
  return value.replace(SCOPE_CITATION_FILE_TOKEN, (citation) =>
    NON_OWNER_SCOPE_CITATION_PREFIXES.some((prefix) =>
      citation.startsWith(prefix)) ? '' : citation);
}

function citedSourceOwnerScope(statement) {
  const scopes = new Set(
    (String(statement || '').match(SCOPE_CITATION_FILE_TOKEN) || [])
      .map(sourceOwnerScopeFromCitation)
      .filter(Boolean),
  );
  if (scopes.has(QUEST_SCOPE_WORKFLOW)) return QUEST_SCOPE_WORKFLOW;
  if (scopes.has(QUEST_SCOPE_RUNTIME)) return QUEST_SCOPE_RUNTIME;
  return null;
}

export function classifyQuestScope(quest) {
  // The declared quest class is authoritative when present: a `product` quest
  // is never Solver/workflow-tooling scope, no matter what runtime subsystem
  // names its prose uses. The keyword heuristic below repeatedly misfires on
  // runtime vocabulary ("operation-workflow", "the REPLACE workflow", ...);
  // it remains only as the fallback for quests without a declared class.
  if (quest?.class === QUEST_CLASS_PRODUCT) {
    return QUEST_SCOPE_RUNTIME;
  }
  // Process Quests may own either runtime migration scaffolding or the Solver
  // itself. A cited owner source in the sealed statement or planning links is
  // stronger than prose vocabulary. Evidence and generated bookkeeping paths
  // are not source-owner citations; their basenames must not turn a runtime
  // owner Quest into a workflow Quest.
  const citedScope = citedSourceOwnerScope([
    quest?.statement,
    quest?.links?.specRef,
    quest?.links?.planDoc,
  ].filter(Boolean).join(' '));
  if (citedScope) return citedScope;
  const haystack = [
    quest?.id,
    quest?.statement,
    ...(quest?.frontiers || []).map((frontier) => frontier.id),
  ].join(' ').toLowerCase();
  const sourceOnlyHaystack = maskNonOwnerScopeCitations(haystack);
  // "operation-workflow" is a RUNTIME subsystem name (src/rebalancer/
  // operation-workflow-*), not Solver/workflow tooling; \b matches at the
  // hyphen, so it must be masked before the keyword scan or every runtime
  // quest that names that subsystem misclassifies as a workflow quest.
  const runtimeSubsystemMaskedHaystack = sourceOnlyHaystack.replaceAll(
    'operation-workflow',
    'operation-subsystem',
  );
  if (/\b(solver|workflow|work-tracker|tooling|steering|command|model|architecture|contract)\b/u
    .test(runtimeSubsystemMaskedHaystack)) {
    return QUEST_SCOPE_WORKFLOW;
  }
  return QUEST_SCOPE_RUNTIME;
}

// Inspection for a measurement-only (commit:) changeRef: the artifact is the
// committed tree-to-tree delta itself, so there is no file to read and no
// hunk presence to prove — but the same scope-cross rules apply to its paths.
function inspectCommitChangeArtifact(root, quest, changeRef, commitRef) {
  const problems = [];
  const changedPaths = commitDeltaChangedPaths(
    root, commitRef.base, commitRef.head) ?? [];
  const delta = canonicalCommitDelta(root, commitRef.base, commitRef.head, []);
  if (!delta.ok) {
    problems.push(delta.problem);
  }
  if (changedPaths.length === 0) {
    problems.push(LOCAL_STR_COMMIT_RANGE_TOUCHES_NO_PATHS);
  }
  const scopeCategories = [
    ...new Set(
      changedPaths
        .filter((filePath) => !isOwnQuestSolveBookkeeping(filePath, quest?.id))
        .map(classifyPath)),
  ].sort();
  const questScope = classifyQuestScope(quest);
  if (questScope !== QUEST_SCOPE_WORKFLOW &&
    scopeCategories.includes(QUEST_SCOPE_WORKFLOW)) {
    problems.push(LOCAL_STR_PROBLEM_WORKFLOW_SCOPE);
  }
  if (questScope === QUEST_SCOPE_WORKFLOW &&
    scopeCategories.includes(QUEST_SCOPE_RUNTIME)) {
    problems.push(LOCAL_STR_PROBLEM_RUNTIME_SCOPE);
  }
  return {
    valid: problems.length === 0,
    problems,
    filePath: changeRef,
    changedPaths,
    categories: scopeCategories,
    questScope,
    content: delta.content || '',
    storageKind: COMMIT_STORAGE_KIND,
    contentObjectPath: null,
    payloadBytes: delta.content ? delta.content.length : 0,
  };
}

export function inspectChangeArtifact(root, quest, changeRef) {
  const commitRef = parseCommitChangeRef(changeRef);
  if (commitRef) {
    return inspectCommitChangeArtifact(root, quest, changeRef, commitRef);
  }
  const problems = [];
  const filePath = changeArtifactPath(root, quest.id, changeRef);
  const artifact = readChangeArtifact(root, changeRef);
  if (!filePath) {
    return {
      valid: false,
      problems: [`changeRef must use ${DIFF_PREFIX}<path>`],
      filePath: null,
      changedPaths: [],
      categories: [],
      questScope: classifyQuestScope(quest),
    };
  }
  if (!artifact.valid) {
    problems.push(...artifact.problems);
  } else if (!isExpectedChangeArtifact(root, quest.id, filePath)) {
    problems.push(
      `changeRef artifact must live under ${expectedChangeDir(root, quest.id)}/`,
    );
  }

  const content = artifact.payload ? artifact.payload.toString('utf8') : '';
  const changedPaths = changedPathsFromDiffContent(content);
  // A quest's OWN solve/ bookkeeping (its quest file, event log, attempt
  // diffs, oracle/evidence receipts) legitimately rides inside the working-
  // tree diff that --auto-diff snapshots; it is Solver-owned bookkeeping,
  // not foreign workflow scope, so the scope classification must exclude it
  // exactly as the commit-range classification above does.
  const scopeChangedPaths = changedPaths
    .filter((filePath) => !isOwnQuestSolveBookkeeping(filePath, quest?.id));
  const categories = [...new Set(scopeChangedPaths.map(classifyPath))].sort();
  const questScope = classifyQuestScope(quest);
  if (changedPaths.length === 0) {
    problems.push('changeRef artifact must contain file paths from a patch');
  }
  if (content && !hasUnifiedDiffHunk(content) && !hasGitBinaryPatch(content)) {
    problems.push(PROBLEM_MISSING_UNIFIED_DIFF);
  }
  if (questScope !== QUEST_SCOPE_WORKFLOW &&
    categories.includes(QUEST_SCOPE_WORKFLOW)) {
    problems.push(LOCAL_STR_PROBLEM_WORKFLOW_SCOPE);
  }
  if (questScope === QUEST_SCOPE_WORKFLOW &&
    categories.includes(QUEST_SCOPE_RUNTIME)) {
    problems.push(LOCAL_STR_PROBLEM_RUNTIME_SCOPE);
  }

  return {
    valid: problems.length === 0,
    problems,
    filePath,
    changedPaths,
    categories,
    questScope,
    content,
    storageKind: artifact.kind || null,
    contentObjectPath: artifact.objectPath ?
      normalizeSlash(path.relative(root, artifact.objectPath)) : null,
    payloadBytes: artifact.payloadBytes || 0,
  };
}
