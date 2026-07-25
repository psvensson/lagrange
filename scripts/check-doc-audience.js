#!/usr/bin/env node

// Prevention gate for the documentation audience boundary
// (docs/steering/audience-boundary.md). Three checks:
//
// 1. Frontmatter: every top-level docs/*.md and docs/development/*.md file
//    declares `audience: human | development | agent`, so the zone split stays
//    explicit where zones meet.
// 2. Link ban: human-zone files (root *.md except the agent entry points,
//    docs/*.md, architecture/**, examples/**) must not deep-link into the
//    generated agent packs under docs/steering/llm/ — humans enter agent
//    steering only through AGENTS.md.
// 3. Tombstones: paths relocated out of the human tree must not reappear.

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
const LLM_PACK_LINK_PATTERN = /(?:docs\/)?steering\/llm\//u;

// Zone-boundary files that must carry an explicit audience declaration.
const FRONTMATTER_DIRS = Object.freeze(['docs', 'docs/development']);

// Human-zone scan roots for the generated-pack link ban.
const LINK_BAN_RECURSIVE_ROOTS = Object.freeze(['architecture', 'examples']);
// Agent entry points: the only root files allowed to reference the packs.
const LINK_BAN_ROOT_EXEMPT = Object.freeze(['AGENTS.md', 'CLAUDE.md']);

// Relocated legacy paths that must not reappear (audience-boundary migration).
const TOMBSTONE_PATHS = Object.freeze([
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

function listMarkdown(relativeDir, {recursive}) {
  const absolute = path.join(REPO_ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, {withFileTypes: true}).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return recursive ? listMarkdown(relativePath, {recursive}) : [];
    }
    return entry.name.endsWith(MARKDOWN_EXTENSION) ? [relativePath] : [];
  });
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), TEXT_ENCODING);
}

function findMissingAudience(relativePath) {
  const frontmatter = FRONTMATTER_PATTERN.exec(readRepoFile(relativePath));
  const audience = frontmatter && AUDIENCE_LINE_PATTERN.exec(frontmatter[1]);
  if (!audience) {
    return [`${relativePath}: missing \`audience:\` frontmatter`];
  }
  if (!AUDIENCE_VALUES.includes(audience[1])) {
    return [
      `${relativePath}: audience "${audience[1]}" is not one of ` +
      AUDIENCE_VALUES.join(AUDIENCE_JOIN_SEPARATOR),
    ];
  }
  return [];
}

function findBannedPackLinks(relativePath) {
  const offendingLines = readRepoFile(relativePath)
    .split(NEWLINE)
    .flatMap((line, index) =>
      LLM_PACK_LINK_PATTERN.test(line) ? [`${relativePath}:${index + 1}: links into docs/steering/llm/`] : []);
  return offendingLines;
}

function runCheck() {
  const frontmatterFiles = FRONTMATTER_DIRS.flatMap(
    (dir) => listMarkdown(dir, {recursive: false}));
  const linkBanFiles = [
    ...listMarkdown('.', {recursive: false})
      .filter((file) => !LINK_BAN_ROOT_EXEMPT.includes(file)),
    ...listMarkdown('docs', {recursive: false}),
    ...LINK_BAN_RECURSIVE_ROOTS.flatMap(
      (dir) => listMarkdown(dir, {recursive: true})),
  ];
  const problems = [
    ...frontmatterFiles.flatMap(findMissingAudience),
    ...linkBanFiles.flatMap(findBannedPackLinks),
    ...TOMBSTONE_PATHS.flatMap((tombstone) =>
      fs.existsSync(path.join(REPO_ROOT, tombstone)) ?
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
