import fs from 'node:fs';
import path from 'node:path';

import {
  SOLVE_DATA_DIR,
} from './constants.js';

const DIFF_PREFIX = 'diff:';
const DIFF_EXTENSION = '.diff';
const PATH_LINE_PREFIXES = Object.freeze([
  'diff --git ',
  '--- ',
  '+++ ',
  'rename from ',
  'rename to ',
]);

const WORKFLOW_PATH_PREFIXES = Object.freeze([
  'scripts/solve/',
  'scripts/solve.js',
  'scripts/quest-context.js',
  'scripts/list-commands.js',
  'package.json',
  'solve/',
  'test/solve/',
  'test/scripts/list-commands.test.js',
  '.kiro/steering/',
  'docs/solver-runbook.md',
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

function workspaceRelative(root, filePath) {
  const absolute = path.isAbsolute(filePath) ?
    path.normalize(filePath) :
    path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  return {
    absolute,
    relative: normalizeSlash(relative),
    insideWorkspace: Boolean(relative) &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative),
  };
}

export function changeArtifactPath(root, questId, changeRef) {
  if (typeof changeRef !== 'string' || !changeRef.startsWith(DIFF_PREFIX)) {
    return null;
  }
  const rawPath = changeRef.slice(DIFF_PREFIX.length);
  if (!rawPath) return null;
  const {absolute} = workspaceRelative(root, rawPath);
  return absolute;
}

export function expectedChangeDir(root, questId) {
  return path.resolve(root, SOLVE_DATA_DIR, 'changes', questId);
}

function isExpectedChangeArtifact(root, questId, filePath) {
  const changeDir = `${expectedChangeDir(root, questId)}${path.sep}`;
  return filePath.startsWith(changeDir) && filePath.endsWith(DIFF_EXTENSION);
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
  for (const line of String(content || '').split('\n')) {
    if (!PATH_LINE_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      continue;
    }
    for (const filePath of [
      ...parseGitDiffLine(line),
      ...parsePatchPathLine(line),
      ...parseRenameLine(line),
    ]) {
      paths.add(filePath);
    }
  }
  return [...paths].sort();
}

function hasUnifiedDiffHunk(content) {
  return /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/mu.test(String(content || ''));
}

export function classifyPath(filePath) {
  const normalized = normalizeSlash(filePath);
  if (WORKFLOW_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return 'workflow';
  }
  if (RUNTIME_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return 'runtime';
  }
  if (normalized.startsWith('test/')) return 'test';
  if (normalized.startsWith('docs/') || normalized.startsWith('architecture/')) {
    return 'docs';
  }
  return 'other';
}

export function requiresSourceVerification(filePath) {
  const normalized = normalizeSlash(filePath);
  return SOURCE_VERIFICATION_PATH_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix));
}

export function requiresModelEvidence(filePath) {
  const normalized = normalizeSlash(filePath);
  return MODEL_EVIDENCE_PATH_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix));
}

export function classifyQuestScope(quest) {
  const haystack = [
    quest?.id,
    quest?.statement,
    ...(quest?.frontiers || []).map((frontier) => frontier.id),
  ].join(' ').toLowerCase();
  if (/\b(solver|workflow|work-tracker|tooling|steering|command|model|architecture|contract)\b/u
    .test(haystack)) {
    return 'workflow';
  }
  return 'runtime';
}

export function inspectChangeArtifact(root, quest, changeRef) {
  const problems = [];
  const filePath = changeArtifactPath(root, quest.id, changeRef);
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
  if (!fs.existsSync(filePath)) {
    problems.push(`changeRef artifact does not exist: ${filePath}`);
  } else if (!isExpectedChangeArtifact(root, quest.id, filePath)) {
    problems.push(
      `changeRef artifact must live under ${expectedChangeDir(root, quest.id)}/`,
    );
  }

  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const changedPaths = changedPathsFromDiffContent(content);
  const categories = [...new Set(changedPaths.map(classifyPath))].sort();
  const questScope = classifyQuestScope(quest);
  if (changedPaths.length === 0) {
    problems.push('changeRef artifact must contain file paths from a patch');
  }
  if (content && !hasUnifiedDiffHunk(content)) {
    problems.push('changeRef artifact must contain at least one unified diff hunk');
  }
  if (questScope !== 'workflow' && categories.includes('workflow')) {
    problems.push('workflow changes must be recorded in a workflow/Quest tooling Quest');
  }
  if (questScope === 'workflow' && categories.includes('runtime')) {
    problems.push('runtime changes must be recorded in a runtime Quest');
  }

  return {
    valid: problems.length === 0,
    problems,
    filePath,
    changedPaths,
    categories,
    questScope,
  };
}
