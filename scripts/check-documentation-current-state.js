#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const FIRST_CAPTURE = 1;
const NEWLINE = '\n';
const MARKDOWN_EXTENSION = '.md';
const EMPTY_TEXT = '';
const PATH_SEPARATOR = '/';
const SPACE = ' ';
const HASH_PREFIX = '#';
const TEXT_ENCODING = 'utf8';
const GENERATED_CLASS = 'generated';
const EVIDENCE_CLASS = 'evidence';
const PLANNING_CLASS = 'planning';
const HISTORY_CLASS = 'history';
const STEERING_CLASS = 'steering';
const COMPATIBILITY_CLASS = 'compatibility';
const CURRENT_CLASS = 'current';
const CHANGELOG_FILE = 'CHANGELOG.md';
const HISTORY_FILES = Object.freeze([
  CHANGELOG_FILE,
  'solve/theory-ledger.md',
]);
const AGENT_ENTRY_FILE = 'AGENTS.md';
const COMPATIBILITY_ENTRY_FILE = 'CLAUDE.md';
const COMPATIBILITY_ARCHITECTURE_FILE = 'architecture.md';
const STEERING_PREFIX = 'docs/steering/';
const EPIC_PREFIX = 'solve/epics/';
const SPEC_PREFIX = 'solve/specs/';
const GENERATED_BOOT_SUFFIX = '/boot.md';
const GENERATED_CORE_SUFFIX = '/core.md';
const GENERATED_README_SUFFIX = '/README.md';
const DOCUMENT_CLASSES = new Set([
  COMPATIBILITY_CLASS,
  CURRENT_CLASS,
  EVIDENCE_CLASS,
  GENERATED_CLASS,
  HISTORY_CLASS,
  PLANNING_CLASS,
  STEERING_CLASS,
]);
const SCAN_ROOTS = Object.freeze([
  'architecture',
  'charts',
  'ci',
  'docs',
  'examples',
  'models',
  'solve',
  'src',
  'test',
]);
const GENERATED_PREFIXES = Object.freeze([
  'docs/steering/llm/',
]);
const GENERATED_FILES = Object.freeze([
  'solve/FRONTIER.generated.md',
]);
const LOCAL_GENERATED_PATH_PREFIXES = Object.freeze([
  'solve/state/',
]);
const EVIDENCE_PREFIXES = Object.freeze([
  'docs/case-studies/',
  'docs/evidence/',
  'models/',
  'solve/artifacts/',
  'solve/autonomous/',
  'solve/changes/',
  'solve/report/',
  'solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/',
  'solve/specs/raft-logic-migration/reports/',
]);
const IMMUTABLE_EVIDENCE_PREFIXES = Object.freeze([
  'docs/case-studies/',
  'docs/evidence/',
  'solve/artifacts/',
  'solve/autonomous/',
  'solve/changes/',
  'solve/report/',
  'solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/',
  'solve/specs/raft-logic-migration/reports/',
]);
const FORBIDDEN_NARRATIVE_PREFIXES = Object.freeze([
  'architecture/future/',
  'docs/reviews/',
]);
const PLANNING_ROOT_FILES = Object.freeze([
  'product-roadmap.md',
  'roadmap.md',
]);
const CURRENT_DOC_SECTION_HEADINGS = Object.freeze([
  'future architecture',
  'future directions',
  'immediate closure direction',
  'migration plan',
  'migration sequence',
  'open questions',
  'risks and open questions',
  'rollout sequence',
  'target architecture',
  'target model',
]);
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/u;
const DOCUMENT_CLASS_PATTERN = /^documentClass:\s*(\S+)\s*$/mu;
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/gu;
const HEADING_PATTERN = /^#{1,6}\s+(.+?)\s*$/gmu;
const REPOSITORY_PATH_PATTERN =
  /`((?:architecture|charts|docs|examples|models|scripts|solve|src|test)\/[^`\r\n]+)`/gu;
const EXTERNAL_LINK_PATTERN =
  /^(?:app:|data:|file:|https?:|mailto:|tel:)/u;
const NON_LITERAL_PATH_PATTERN = /[*<>{}|]|\.\.\./u;
const REPOSITORY_FILE_WITH_QUALIFIER_PATTERN =
  /^(.+\.(?:als|cjs|js|json|md|mjs|sh|sql|tla|toml|wasm|yaml|yml))(?:[:\s].*)?$/u;
const TRAILING_PATH_PUNCTUATION_PATTERN = /[,:;.)]+$/u;
const LEADING_ANGLE_PATTERN = /^</u;
const TRAILING_ANGLE_PATTERN = />$/u;
const FRAGMENT_PATTERN = /#.*$/u;
const LINE_ENDING_PATTERN = /\r?\n/u;

function toPosix(relativePath) {
  return relativePath.split(path.sep).join(PATH_SEPARATOR);
}

function resolveContainedTarget(rootDir, relativePath) {
  const absoluteRoot = path.resolve(rootDir);
  const absoluteTarget = path.resolve(absoluteRoot, relativePath);
  const relativeTarget = path.relative(absoluteRoot, absoluteTarget);
  const contained = relativeTarget !== '..' &&
    !relativeTarget.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativeTarget);
  return {absoluteTarget, contained};
}

function listMarkdown(relativeDir, rootDir = REPO_ROOT) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }
  return fs.readdirSync(absoluteDir, {withFileTypes: true}).flatMap((entry) => {
    const relativePath = toPosix(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      return listMarkdown(relativePath, rootDir);
    }
    return entry.name.endsWith(MARKDOWN_EXTENSION) ? [relativePath] : [];
  });
}

function listDocumentationFiles(rootDir = REPO_ROOT) {
  const rootFiles = fs.readdirSync(rootDir, {withFileTypes: true})
    .filter((entry) =>
      entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION))
    .map((entry) => entry.name);
  const nestedFiles = SCAN_ROOTS.flatMap((relativeDir) =>
    listMarkdown(relativeDir, rootDir));
  return [...new Set([...rootFiles, ...nestedFiles])].sort();
}

function hasPrefix(relativePath, prefixes) {
  return prefixes.some((prefix) => relativePath.startsWith(prefix));
}

function isGenerated(relativePath) {
  return GENERATED_FILES.includes(relativePath) ||
    (hasPrefix(relativePath, GENERATED_PREFIXES) &&
      !relativePath.endsWith(GENERATED_BOOT_SUFFIX) &&
      !relativePath.endsWith(GENERATED_CORE_SUFFIX) &&
      !relativePath.endsWith(GENERATED_README_SUFFIX));
}

function isEvidence(relativePath) {
  return hasPrefix(relativePath, EVIDENCE_PREFIXES);
}

function isImmutableEvidence(relativePath) {
  return hasPrefix(relativePath, IMMUTABLE_EVIDENCE_PREFIXES);
}

function isPlanning(relativePath) {
  return PLANNING_ROOT_FILES.includes(relativePath) ||
    relativePath.startsWith(EPIC_PREFIX) ||
    relativePath.startsWith(SPEC_PREFIX);
}

function lineNumberAt(content, offset) {
  return content.slice(0, offset).split(LINE_ENDING_PATTERN).length;
}

function normalizeHeading(rawHeading) {
  return rawHeading
    .replace(/[*_`]/gu, EMPTY_TEXT)
    .replace(/\s+/gu, SPACE)
    .trim()
    .toLowerCase();
}

function documentClass(relativePath, content) {
  const frontmatter = FRONTMATTER_PATTERN.exec(content);
  const explicitClass = frontmatter && DOCUMENT_CLASS_PATTERN.exec(frontmatter[FIRST_CAPTURE]);
  if (explicitClass) {
    return explicitClass[FIRST_CAPTURE];
  }
  if (isGenerated(relativePath)) return GENERATED_CLASS;
  if (isEvidence(relativePath)) return EVIDENCE_CLASS;
  if (isPlanning(relativePath)) return PLANNING_CLASS;
  if (HISTORY_FILES.includes(relativePath)) return HISTORY_CLASS;
  if (relativePath === AGENT_ENTRY_FILE) return STEERING_CLASS;
  if (relativePath === COMPATIBILITY_ENTRY_FILE ||
      relativePath === COMPATIBILITY_ARCHITECTURE_FILE) {
    return COMPATIBILITY_CLASS;
  }
  if (relativePath.startsWith(STEERING_PREFIX)) return STEERING_CLASS;
  return CURRENT_CLASS;
}

function validateDocumentClass(relativePath, classification) {
  return DOCUMENT_CLASSES.has(classification) ?
    [] :
    [`${relativePath}: unsupported documentClass ${classification}`];
}

function stripLinkWrapper(href) {
  return href.trim()
    .replace(LEADING_ANGLE_PATTERN, EMPTY_TEXT)
    .replace(TRAILING_ANGLE_PATTERN, EMPTY_TEXT);
}

function localLinkTarget(sourceFile, href) {
  const cleanedHref = stripLinkWrapper(href);
  if (cleanedHref === EMPTY_TEXT ||
      cleanedHref.startsWith(HASH_PREFIX) ||
      EXTERNAL_LINK_PATTERN.test(cleanedHref)) {
    return EMPTY_TEXT;
  }
  const withoutFragment = cleanedHref.replace(FRAGMENT_PATTERN, EMPTY_TEXT);
  if (withoutFragment === EMPTY_TEXT) {
    return EMPTY_TEXT;
  }
  let decodedHref;
  try {
    decodedHref = decodeURIComponent(withoutFragment);
  } catch (_error) {
    return EMPTY_TEXT;
  }
  if (decodedHref.startsWith(PATH_SEPARATOR)) {
    return toPosix(path.normalize(decodedHref.slice(FIRST_CAPTURE)));
  }
  return toPosix(path.normalize(path.join(path.dirname(sourceFile), decodedHref)));
}

function validateLinks(relativePath, content, rootDir) {
  const errors = [];
  for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
    const href = match[FIRST_CAPTURE];
    const target = localLinkTarget(relativePath, href);
    if (target === EMPTY_TEXT) {
      continue;
    }
    const line = lineNumberAt(content, match.index);
    const resolved = resolveContainedTarget(rootDir, target);
    if (!resolved.contained) {
      errors.push(`${relativePath}:${line}: local link escapes repository: ${href}`);
    } else if (!fs.existsSync(resolved.absoluteTarget)) {
      errors.push(`${relativePath}:${line}: broken local link ${href}`);
    }
  }
  return errors;
}

function normalizeReferencedPath(rawPath) {
  const withoutFragment = rawPath.replace(FRAGMENT_PATTERN, EMPTY_TEXT);
  const withoutPunctuation =
    withoutFragment.replace(TRAILING_PATH_PUNCTUATION_PATTERN, EMPTY_TEXT);
  const fileMatch = REPOSITORY_FILE_WITH_QUALIFIER_PATTERN.exec(withoutPunctuation);
  const literalPath = fileMatch ? fileMatch[FIRST_CAPTURE] : withoutPunctuation;
  return toPosix(path.normalize(literalPath));
}

function validateRepositoryPaths(relativePath, content, rootDir) {
  const errors = [];
  for (const match of content.matchAll(REPOSITORY_PATH_PATTERN)) {
    const referencedPath = normalizeReferencedPath(match[FIRST_CAPTURE]);
    if (NON_LITERAL_PATH_PATTERN.test(referencedPath) ||
        hasPrefix(referencedPath, LOCAL_GENERATED_PATH_PREFIXES)) {
      continue;
    }
    const line = lineNumberAt(content, match.index);
    const resolved = resolveContainedTarget(rootDir, referencedPath);
    if (!resolved.contained) {
      errors.push(
        `${relativePath}:${line}: referenced repository path escapes repository: ` +
        referencedPath,
      );
    } else if (!fs.existsSync(resolved.absoluteTarget)) {
      errors.push(`${relativePath}:${line}: referenced repository path is missing: ${referencedPath}`);
    }
  }
  return errors;
}

function validateCurrentSectionRoles(relativePath, content) {
  if (documentClass(relativePath, content) !== CURRENT_CLASS) {
    return [];
  }
  const errors = [];
  for (const match of content.matchAll(HEADING_PATTERN)) {
    const heading = normalizeHeading(match[FIRST_CAPTURE]);
    if (CURRENT_DOC_SECTION_HEADINGS.includes(heading) ||
        /^status\s+[—:-]\s+(?:archived|complete|implemented|proposed)\b/u.test(heading)) {
      const line = lineNumberAt(content, match.index);
      errors.push(`${relativePath}:${line}: planning/history section in current document: ${match[FIRST_CAPTURE]}`);
    }
  }
  return errors;
}

function validateForbiddenNarrativePaths(relativePath) {
  return hasPrefix(relativePath, FORBIDDEN_NARRATIVE_PREFIXES) ?
    [`${relativePath}: obsolete narrative directory is forbidden`] :
    [];
}

function validateDocumentationCurrentState(rootDir = REPO_ROOT) {
  const files = listDocumentationFiles(rootDir);
  const errors = [];
  const classes = {};
  for (const relativePath of files) {
    const content = fs.readFileSync(
      path.join(rootDir, relativePath),
      TEXT_ENCODING,
    );
    const classification = documentClass(relativePath, content);
    classes[classification] = (classes[classification] || 0) + FIRST_CAPTURE;
    errors.push(...validateDocumentClass(relativePath, classification));
    errors.push(...validateForbiddenNarrativePaths(relativePath));
    const immutableEvidence =
      classification === EVIDENCE_CLASS && isImmutableEvidence(relativePath);
    if (classification !== GENERATED_CLASS && !immutableEvidence) {
      errors.push(...validateLinks(relativePath, content, rootDir));
    }
    if (classification !== GENERATED_CLASS &&
        !immutableEvidence &&
        classification !== PLANNING_CLASS &&
        classification !== HISTORY_CLASS) {
      errors.push(...validateRepositoryPaths(relativePath, content, rootDir));
    }
    errors.push(...validateCurrentSectionRoles(relativePath, content));
  }
  return {ok: errors.length === 0, errors, files, classes};
}

function isDirectRun() {
  return process.argv[FIRST_CAPTURE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const result = validateDocumentationCurrentState();
  if (result.ok) {
    process.stdout.write(
      `Documentation current-state check passed: ${result.files.length} files; ` +
      `${JSON.stringify(result.classes)}.${NEWLINE}`,
    );
    process.exitCode = EXIT_SUCCESS;
  } else {
    process.stderr.write(
      `Found ${result.errors.length} documentation current-state violation(s):${NEWLINE}` +
      result.errors.map((error) => `  - ${error}`).join(NEWLINE) +
      NEWLINE,
    );
    process.exitCode = EXIT_FAILURE;
  }
}

export {
  CURRENT_DOC_SECTION_HEADINGS,
  documentClass,
  listDocumentationFiles,
  localLinkTarget,
  validateDocumentationCurrentState,
};
