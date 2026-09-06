#!/usr/bin/env node

// Prevention gate for the documentation path boundary. Public product and
// architecture files may not link into development workflow, agent steering,
// or Solver state. Classification comes from the repository path, not visible
// metadata in the document.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NEWLINE = '\n';
const TEXT_ENCODING = 'utf8';
const MARKDOWN_EXTENSION = '.md';
const PASS_MESSAGE = 'Documentation path boundary holds.';
// This check is itself the owner of the public/agent documentation
// boundary: there is no prose copy of the rule to drift from it.
const RULES_MESSAGE = 'Rules: scripts/check-doc-audience.js.';

const MARKDOWN_INLINE_LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/gu;
const MARKDOWN_REFERENCE_DEFINITION_PATTERN =
  /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/u;
const HTML_LINK_PATTERN =
  /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/giu;
const MARKDOWN_AUTOLINK_PATTERN = /<([^<>\s]+)>/gu;
const AGENT_OR_SOLVER_LINK_PATTERN =
  /(?:^|\/)(?:docs\/steering|steering|solve)(?:\/|$)/u;
const AGENT_ENTRY_LINK_PATTERN = /(?:^|\/)AGENTS\.md(?:#.*)?$/u;
const WORKFLOW_PROSE_PATTERNS = Object.freeze([
  /\bnpm run (?:quest:|solve:)/u,
  /\bnode scripts\/solve\.js\b/u,
  /`solve\/(?:quests|log|report|state|artifacts|changes|specs|epics)\//u,
]);

const PUBLIC_RECURSIVE_ROOTS = Object.freeze(['architecture', 'docs', 'examples']);
const ROOT_EXEMPT = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'DEBUGGING.md',
  'RELEASE.md',
  'edition-matrix.md',
  'platform-doctrine.md',
]);
const NON_PUBLIC_FILES = Object.freeze([
  'architecture/current-owner-maps.md',
  'architecture/lagrange-kernel-platform-api-v0.md',
  'architecture/oci-runtime-host-contract.md',
  'docs/admin-test-run-landing.md',
  'docs/convergence-donewhen-metric.md',
  'docs/deterministic-directed-testing-plan.md',
  'docs/deterministic-repro-tier.md',
  'docs/distributed-playback-viewer.md',
]);
const NON_PUBLIC_PATH_PREFIXES = Object.freeze([
  'architecture/contracts/',
  'architecture/models/',
  'docs/case-studies/',
  'docs/development/',
  'docs/evidence/',
  'docs/specs/',
  'docs/steering/',
]);
const AGENT_PORTAL_FILE = 'README.md';
const DEVELOPMENT_PORTAL_FILE = 'docs/README.md';
const DEVELOPMENT_PORTAL_TARGET = 'docs/development/README.md';
const CONTRIBUTOR_PORTAL_FILE = 'README.md';
const CONTRIBUTOR_PORTAL_TARGET = 'CONTRIBUTING.md';
const EXTERNAL_LINK_PATTERN = /^(?:https?:|mailto:|tel:|data:|file:)/u;

const TOMBSTONE_PATHS = Object.freeze([
  'product-roadmap.md',
  'docs/solver-runbook.md',
  'docs/llm-ergonomics-improvement-plan.md',
  'docs/llm-dev-process-improvement-plan.md',
  'docs/workflow-improvement-plan.md',
  'docs/autonomy-and-parallel-defaults-plan.md',
  'docs/development/llm-ergonomics-improvement-plan.md',
  'docs/development/llm-dev-process-improvement-plan.md',
  'docs/development/workflow-improvement-plan.md',
  'docs/development/autonomy-and-parallel-defaults-plan.md',
  'docs/runtime-unification-and-modularization-spec.md',
  'docs/runtime-ownership-rollout-runbook.md',
  'analysis-2026-07-17-last-hours-review.md',
]);

function listMarkdown(relativeDir, {recursive, root = REPO_ROOT}) {
  const absolute = path.join(root, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, {withFileTypes: true}).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return recursive ? listMarkdown(relativePath, {recursive, root}) : [];
    }
    return entry.name.endsWith(MARKDOWN_EXTENSION) ? [relativePath] : [];
  });
}

function readRepoFile(relativePath, root = REPO_ROOT) {
  return fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING);
}

function isPublicPath(relativePath) {
  return !NON_PUBLIC_FILES.includes(relativePath) &&
    !NON_PUBLIC_PATH_PREFIXES.some((prefix) =>
      relativePath.startsWith(prefix));
}

function normalizeLinkTarget(linkTarget) {
  const trimmed = linkTarget.trim();
  let destination = trimmed;
  if (trimmed.startsWith('<')) {
    const closingBracket = trimmed.indexOf('>');
    if (closingBracket > 0) destination = trimmed.slice(1, closingBracket);
  } else {
    const titleStart = trimmed.search(/\s+(?=["'(])/u);
    if (titleStart > 0) destination = trimmed.slice(0, titleStart);
  }
  return destination.split('#')[0];
}

function linkTargets(line) {
  const targets = [];
  for (const match of line.matchAll(MARKDOWN_INLINE_LINK_PATTERN)) {
    targets.push(match[1]);
  }
  const reference = MARKDOWN_REFERENCE_DEFINITION_PATTERN.exec(line);
  if (reference) targets.push(reference[1] ?? reference[2]);
  for (const match of line.matchAll(HTML_LINK_PATTERN)) {
    targets.push(match[1] ?? match[2] ?? match[3]);
  }
  for (const match of line.matchAll(MARKDOWN_AUTOLINK_PATTERN)) {
    targets.push(match[1]);
  }
  return [...new Set(targets)];
}

function resolveLocalLink(relativePath, target) {
  if (target.length === 0 || EXTERNAL_LINK_PATTERN.test(target)) return null;
  const decodedTarget = decodeURIComponent(target);
  const fromDirectory = path.posix.dirname(relativePath);
  const resolved = decodedTarget.startsWith('/') ?
    path.posix.normalize(decodedTarget.slice(1)) :
    path.posix.normalize(path.posix.join(fromDirectory, decodedTarget));
  if (resolved === '..' || resolved.startsWith('../')) return null;
  return resolved;
}

function isDevelopmentOnlyTarget(relativeTarget) {
  return NON_PUBLIC_PATH_PREFIXES.some((prefix) =>
    relativeTarget.startsWith(prefix));
}

function findBoundaryLeaks(relativePath, root = REPO_ROOT) {
  if (!isPublicPath(relativePath)) return [];
  return readRepoFile(relativePath, root)
    .split(NEWLINE)
    .flatMap((line, index) => {
      const problems = [];
      for (const linkTarget of linkTargets(line)) {
        const target = normalizeLinkTarget(linkTarget);
        const resolvedTarget = resolveLocalLink(relativePath, target);
        if (AGENT_OR_SOLVER_LINK_PATTERN.test(target)) {
          problems.push(
            `${relativePath}:${index + 1}: public document links into ` +
            'agent steering or Solver state',
          );
        }
        if (AGENT_ENTRY_LINK_PATTERN.test(target) &&
            relativePath !== AGENT_PORTAL_FILE) {
          problems.push(
            `${relativePath}:${index + 1}: only README.md may link AGENTS.md`,
          );
        }
        if (resolvedTarget !== null &&
            isDevelopmentOnlyTarget(resolvedTarget) &&
            !(relativePath === DEVELOPMENT_PORTAL_FILE &&
              resolvedTarget === DEVELOPMENT_PORTAL_TARGET) &&
            !(relativePath === CONTRIBUTOR_PORTAL_FILE &&
              resolvedTarget === CONTRIBUTOR_PORTAL_TARGET)) {
          problems.push(
            `${relativePath}:${index + 1}: public document links into a ` +
            'development-only surface',
          );
        }
      }
      for (const pattern of WORKFLOW_PROSE_PATTERNS) {
        if (pattern.test(line)) {
          problems.push(
            `${relativePath}:${index + 1}: public document embeds ` +
            'Solver/Quest workflow mechanics',
          );
        }
      }
      return problems;
    });
}

function runCheck(root = REPO_ROOT) {
  const publicFiles = [
    ...listMarkdown('.', {recursive: false, root})
      .filter((file) => !ROOT_EXEMPT.includes(file)),
    ...PUBLIC_RECURSIVE_ROOTS.flatMap(
      (dir) => listMarkdown(dir, {recursive: true, root})),
  ];
  const problems = [
    ...publicFiles.flatMap((relativePath) =>
      findBoundaryLeaks(relativePath, root)),
    ...TOMBSTONE_PATHS.flatMap((tombstone) =>
      fs.existsSync(path.join(root, tombstone)) ?
        [`${tombstone}: relocated path reappeared ` +
          '(see scripts/check-doc-audience.js)'] :
        []),
  ];
  if (problems.length === 0) {
    return {ok: true, message: PASS_MESSAGE};
  }
  return {
    ok: false,
    message: [
      `Found ${problems.length} documentation-boundary violation(s):`,
      ...problems.map((problem) => `  - ${problem}`),
      '',
      RULES_MESSAGE,
    ].join(NEWLINE),
  };
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const result = runCheck();
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(result.message + NEWLINE);
  process.exitCode = result.ok ? EXIT_SUCCESS : EXIT_FAILURE;
}

export {runCheck};
