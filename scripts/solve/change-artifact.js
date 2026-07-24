import path from 'node:path';

import {
  QUEST_CLASS_PRODUCT,
  SOLVE_DATA_DIR,
} from './constants.js';
import {
  readChangeArtifact,
  requestedChangeArtifactPath,
  resolvedChangeArtifactPath,
} from './content-addressed-change-artifact.js';

const DIFF_PREFIX = 'diff:';
const DIFF_EXTENSION = '.diff';
const DESCRIPTOR_EXTENSION = '.diff.json';
const GZIP_EXTENSION = '.diff.gz';
const CONTENT_ADDRESSED_STORAGE_KIND = 'content-addressed';
const ROOT_PACKAGE_LOCK_PATH = 'package-lock.json';
const QUEST_SCOPE_RUNTIME = 'runtime';
const QUEST_SCOPE_WORKFLOW = 'workflow';
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

export function classifyPath(filePath) {
  const normalized = normalizeSlash(filePath);
  if (WORKFLOW_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return QUEST_SCOPE_WORKFLOW;
  }
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
  // itself. A cited owner source is stronger than prose vocabulary. Evidence
  // and generated bookkeeping paths are not source-owner citations; their
  // basenames must not turn a runtime owner Quest into a workflow Quest.
  const citedScope = citedSourceOwnerScope(quest?.statement);
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

export function inspectChangeArtifact(root, quest, changeRef) {
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
  const categories = [...new Set(changedPaths.map(classifyPath))].sort();
  const questScope = classifyQuestScope(quest);
  if (changedPaths.length === 0) {
    problems.push('changeRef artifact must contain file paths from a patch');
  }
  if (content && !hasUnifiedDiffHunk(content) && !hasGitBinaryPatch(content)) {
    problems.push(PROBLEM_MISSING_UNIFIED_DIFF);
  }
  if (questScope !== QUEST_SCOPE_WORKFLOW &&
    categories.includes(QUEST_SCOPE_WORKFLOW)) {
    problems.push('workflow changes must be recorded in a workflow/Quest tooling Quest');
  }
  if (questScope === QUEST_SCOPE_WORKFLOW &&
    categories.includes(QUEST_SCOPE_RUNTIME)) {
    problems.push('runtime changes must be recorded in a runtime Quest');
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
