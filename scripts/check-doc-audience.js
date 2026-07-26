#!/usr/bin/env node

// Prevention gate for the documentation audience boundary
// (docs/steering/audience-boundary.md). Four checks:
//
// 1. Frontmatter: every top-level docs/*.md and docs/development/*.md file
//    declares `audience: human | development | agent`, so the zone split stays
//    explicit where zones meet.
// 2. Zone separation: human product/architecture/example files must not link
//    into agent steering, Solver state, or development-process mechanics.
//    README.md owns the one allowed AGENTS.md portal.
// 3. Workflow prose: human files must not embed Solver/Quest commands even
//    when they are not Markdown links.
// 4. Tombstones: paths relocated out of the human tree must not reappear.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NEWLINE = '\n';
const MARKDOWN_EXTENSION = '.md';
const TEXT_ENCODING = 'utf8';
const AUDIENCE_JOIN_SEPARATOR = '|';
const PASS_MESSAGE = 'Documentation audience boundary holds.';
const RULES_MESSAGE = 'Rules: docs/steering/audience-boundary.md.';

const AUDIENCE_VALUES = Object.freeze(['human', 'development', 'agent']);
const AUDIENCE_LINE_PATTERN = /^audience:\s*(\S+)\s*$/mu;
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/u;
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

// Zone-boundary files that must carry an explicit audience declaration.
const FRONTMATTER_DIRS = Object.freeze(['docs', 'docs/development']);

// Human-zone scan roots for the generated-pack link ban.
const LINK_BAN_RECURSIVE_ROOTS = Object.freeze(['architecture', 'examples']);
// Agent entry points: the only root files allowed to reference the packs.
const LINK_BAN_ROOT_EXEMPT = Object.freeze(['AGENTS.md', 'CLAUDE.md']);
const NON_HUMAN_PATH_PREFIXES = Object.freeze([
  'architecture/contracts/',
  'architecture/models/',
  'docs/case-studies/',
  'docs/development/',
  'docs/evidence/',
  'docs/specs/',
]);
const AGENT_PORTAL_FILE = 'README.md';
const DEVELOPMENT_PORTAL_FILE = 'docs/README.md';
const DEVELOPMENT_PORTAL_TARGET = 'docs/development/README.md';
const CONTRIBUTOR_PORTAL_FILE = 'README.md';
const CONTRIBUTOR_PORTAL_TARGET = 'CONTRIBUTING.md';
const EXTERNAL_LINK_PATTERN = /^(?:https?:|mailto:|tel:|data:|file:)/u;

// Relocated legacy paths that must not reappear (audience-boundary migration).
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

function explicitAudience(relativePath, root = REPO_ROOT) {
  const frontmatter = FRONTMATTER_PATTERN.exec(readRepoFile(relativePath, root));
  const audience = frontmatter && AUDIENCE_LINE_PATTERN.exec(frontmatter[1]);
  return audience?.[1] ?? null;
}

function findMissingAudience(relativePath, root = REPO_ROOT) {
  const audience = explicitAudience(relativePath, root);
  if (!audience) {
    return [`${relativePath}: missing \`audience:\` frontmatter`];
  }
  if (!AUDIENCE_VALUES.includes(audience)) {
    return [
      `${relativePath}: audience "${audience}" is not one of ` +
      AUDIENCE_VALUES.join(AUDIENCE_JOIN_SEPARATOR),
    ];
  }
  return [];
}

function isHumanZone(relativePath, root = REPO_ROOT) {
  if (NON_HUMAN_PATH_PREFIXES.some((prefix) =>
    relativePath.startsWith(prefix))) {
    return false;
  }
  const audience = explicitAudience(relativePath, root);
  return audience === null || audience === 'human';
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

function isDevelopmentOnlyTarget(relativeTarget, root) {
  if (NON_HUMAN_PATH_PREFIXES.some((prefix) =>
    relativeTarget.startsWith(prefix))) {
    return true;
  }
  const absoluteTarget = path.join(root, relativeTarget);
  if (!fs.existsSync(absoluteTarget) ||
      !fs.statSync(absoluteTarget).isFile() ||
      !relativeTarget.endsWith(MARKDOWN_EXTENSION)) {
    return false;
  }
  const audience = explicitAudience(relativeTarget, root);
  return audience === 'development' || audience === 'agent';
}

function findAudienceLeaks(relativePath, root = REPO_ROOT) {
  if (!isHumanZone(relativePath, root)) return [];
  return readRepoFile(relativePath, root)
    .split(NEWLINE)
    .flatMap((line, index) => {
      const problems = [];
      for (const linkTarget of linkTargets(line)) {
        const target = normalizeLinkTarget(linkTarget);
        const resolvedTarget = resolveLocalLink(relativePath, target);
        if (AGENT_OR_SOLVER_LINK_PATTERN.test(target)) {
          problems.push(
            `${relativePath}:${index + 1}: human document links into ` +
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
            isDevelopmentOnlyTarget(resolvedTarget, root) &&
            !(relativePath === DEVELOPMENT_PORTAL_FILE &&
              resolvedTarget === DEVELOPMENT_PORTAL_TARGET) &&
            !(relativePath === CONTRIBUTOR_PORTAL_FILE &&
              resolvedTarget === CONTRIBUTOR_PORTAL_TARGET)) {
          problems.push(
            `${relativePath}:${index + 1}: human document links into a ` +
            'development-only surface',
          );
        }
      }
      for (const pattern of WORKFLOW_PROSE_PATTERNS) {
        if (pattern.test(line)) {
          problems.push(
            `${relativePath}:${index + 1}: human document embeds ` +
            'Solver/Quest workflow mechanics',
          );
        }
      }
      return problems;
    });
}

function runCheck(root = REPO_ROOT) {
  const frontmatterFiles = FRONTMATTER_DIRS.flatMap(
    (dir) => listMarkdown(dir, {recursive: false, root}));
  const linkBanFiles = [
    ...listMarkdown('.', {recursive: false, root})
      .filter((file) => !LINK_BAN_ROOT_EXEMPT.includes(file)),
    ...listMarkdown('docs', {recursive: false, root}),
    ...LINK_BAN_RECURSIVE_ROOTS.flatMap(
      (dir) => listMarkdown(dir, {recursive: true, root})),
  ];
  const problems = [
    ...frontmatterFiles.flatMap((relativePath) =>
      findMissingAudience(relativePath, root)),
    ...linkBanFiles.flatMap((relativePath) =>
      findAudienceLeaks(relativePath, root)),
    ...TOMBSTONE_PATHS.flatMap((tombstone) =>
      fs.existsSync(path.join(root, tombstone)) ?
        [`${tombstone}: relocated path reappeared (see docs/steering/audience-boundary.md)`] :
        []),
  ];
  if (problems.length === 0) {
    return {ok: true, message: PASS_MESSAGE};
  }
  return {
    ok: false,
    message: [
      `Found ${problems.length} audience-boundary violation(s):`,
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
