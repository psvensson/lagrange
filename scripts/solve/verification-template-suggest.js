// Verification-template auto-suggest.
//
// Maps a change diff to the adversarial-verification template(s) under
// docs/steering/verification-templates/ so the subagent-verification prompt
// starts from the right attack checklist instead of the author's memory.
//
// THE HEURISTIC (deliberately simple):
//   1. The template categories are read from each template's front-matter
//      `categories: [...]` line — the templates own their tags; this module
//      owns only the keyword rules.
//   2. A category matches when its keyword regex hits either (a) a changed
//      path from the diff header lines, or (b) a changed (+/-) content line.
//      Context lines are ignored so an untouched neighbouring mention does
//      not trigger a suggestion.
//   3. harness-fidelity additionally matches any change under test/, since
//      fixture-fidelity risk follows the harness path, not a keyword.
// False negatives are acceptable (the operator still owns template choice);
// suggestions are advisory and never gate anything.
//
// Standalone usage (advisory, exit 0 either way):
//   node scripts/solve/verification-template-suggest.js <diff-file>
//   git diff | node scripts/solve/verification-template-suggest.js

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {changedPathsFromDiffContent} from './change-artifact.js';
import {isRegisteredGeneratedOutput} from './generated-dependencies.js';

const TEMPLATE_DIR_REL = 'docs/steering/verification-templates';
const INDEX_BASENAME = 'INDEX.md';
const MARKDOWN_EXTENSION = '.md';
const FRONTMATTER_CATEGORIES_PATTERN = /^categories:\s*\[([^\]]*)\]\s*$/mu;
const HARNESS_PATH_PATTERN = /^test\//u;
const NO_MATCH_MESSAGE = 'no verification template matched\n';
const NO_RULE_MESSAGE_SUFFIX =
  ' has no keyword rule and can never be suggested';
const NO_TEMPLATE_MESSAGE_SUFFIX = ' names no template front-matter category';
const CATEGORY_SEPARATOR = ',';
const LINE_SEPARATOR = '\n';
const ADDED_LINE_PREFIX = '+';
const REMOVED_LINE_PREFIX = '-';
const ADDED_FILE_HEADER = '+++';
const REMOVED_FILE_HEADER = '---';
const TEXT_ENCODING = 'utf8';
const DIFF_SECTION_HEADER_PREFIX = 'diff --git ';
const DIFF_SECTION_HEADER_PATTERN = /^diff --git a\/(.+?) b\/(.+)$/u;

const CATEGORY_KEYWORD_RULES = Object.freeze({
  'admission-gating':
    /\b(admission|admit|gating|gate|hold|readiness|eligib\w*|fence|precheck)/iu,
  'retry-loops': /\b(retry|retries|re-?drive|backoff|follow-?up|requeue)/iu,
  'sweep-timer': /\b(sweep|timer|interval|periodic|tick|debounce|deadline)/iu,
  'recovery-replay':
    /\b(recover\w*|replay|reconcil\w*|restore|resume|snapshot|catch-?up)/iu,
  'concurrency-serialization':
    /\b(lock|mutex|single-?flight|serializ\w*|concurren\w*|race|in-?flight|atomic)/iu,
  'transport-delivery':
    /\b(transport|deliver\w*|wake|swim|gossip|channel|websocket|broadcast|ack)/iu,
  'formation-circularity':
    /\b(formation|bootstrap|seed|join|quorum|circular)/iu,
  'harness-fidelity': /\b(harness|fixture|stub|fake|mock)/iu,
  'owner-interaction':
    /\b(coupled[- ]?pairs?|cross-?owner|owner[- ]interaction|impact-contracts|interaction contract)/iu,
  'adversarial-js-intrinsics':
    /^src\/(?:diagnostics|utils)\/|\b(prototype|hasOwn|Object\.create|Number\.isFinite|intrinsic)/u,
});

function loadTemplateCategoryPairs(root) {
  const dir = path.join(root, TEMPLATE_DIR_REL);
  const pairs = [];
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return pairs;
  }
  for (const name of names) {
    if (!name.endsWith(MARKDOWN_EXTENSION) || name === INDEX_BASENAME) continue;
    const content = fs.readFileSync(path.join(dir, name), TEXT_ENCODING);
    const match = FRONTMATTER_CATEGORIES_PATTERN.exec(content);
    if (!match) continue;
    for (const raw of match[1].split(CATEGORY_SEPARATOR)) {
      const category = raw.trim().replace(/^['"]|['"]$/gu, '');
      if (category) pairs.push({category, template: `${TEMPLATE_DIR_REL}/${name}`});
    }
  }
  return pairs;
}

// category -> template path (repo-relative), read from each template's
// front-matter `categories` tags so the docs stay the single source of truth.
export function loadTemplateCategories(root) {
  const byCategory = new Map();
  for (const {category, template} of loadTemplateCategoryPairs(root)) {
    byCategory.set(category, template);
  }
  return byCategory;
}

// A category or keyword rule that only one side knows about silently never
// fires; a category claimed twice silently drops one template. All three
// drift modes are invisible at suggestion time, so they are surfaced here.
export function templateCategoryConsistencyProblems(root) {
  const problems = [];
  const templatesByCategory = new Map();
  for (const {category, template} of loadTemplateCategoryPairs(root)) {
    const templates = templatesByCategory.get(category) || [];
    templates.push(template);
    templatesByCategory.set(category, templates);
  }
  for (const [category, templates] of templatesByCategory) {
    if (templates.length > 1) {
      problems.push(`category ${category} is claimed by multiple templates ` +
        `(last one wins): ${templates.join(CATEGORY_SEPARATOR)}`);
    }
    if (!CATEGORY_KEYWORD_RULES[category]) {
      problems.push(`category ${category}${NO_RULE_MESSAGE_SUFFIX}`);
    }
  }
  for (const category of Object.keys(CATEGORY_KEYWORD_RULES)) {
    if (!templatesByCategory.has(category)) {
      problems.push(`keyword rule ${category}${NO_TEMPLATE_MESSAGE_SUFFIX}`);
    }
  }
  return problems;
}

// Changed (+/-) content lines only; header/context lines are excluded so a
// mention in unchanged surrounding code does not fire a suggestion.
function changedContentLines(diffContent) {
  return String(diffContent || '').split(LINE_SEPARATOR).filter((line) =>
    (line.startsWith(ADDED_LINE_PREFIX) || line.startsWith(REMOVED_LINE_PREFIX)) &&
    !line.startsWith(ADDED_FILE_HEADER) && !line.startsWith(REMOVED_FILE_HEADER));
}

// Registered generated outputs (test-classification shards, the import-graph
// seal) are machine-written landing collateral: their regenerated content is a
// census of the WHOLE repository, so its keyword hits describe the repo, not
// this change. Measured 2026-09-01: a regenerated impact-graph seal added
// transport-delivery to a review's required templates, and its test/ path
// fired harness-fidelity — both mechanically, neither about the candidate.
// Their per-file diff sections are dropped before path AND content matching.
function withoutGeneratedOutputSections(diffContent) {
  const lines = String(diffContent || '').split(LINE_SEPARATOR);
  const kept = [];
  let dropping = false;
  for (const line of lines) {
    if (line.startsWith(DIFF_SECTION_HEADER_PREFIX)) {
      const match = DIFF_SECTION_HEADER_PATTERN.exec(line);
      dropping = match !== null && isRegisteredGeneratedOutput(match[2]);
    }
    if (!dropping) kept.push(line);
  }
  return kept.join(LINE_SEPARATOR);
}

export function suggestVerificationTemplates(root, diffContent) {
  const byCategory = loadTemplateCategories(root);
  if (byCategory.size === 0) return [];
  const relevantDiff = withoutGeneratedOutputSections(diffContent);
  const changedPaths = changedPathsFromDiffContent(relevantDiff)
    .filter((filePath) => !isRegisteredGeneratedOutput(filePath));
  const haystack = [...changedPaths, ...changedContentLines(relevantDiff)];
  const suggestions = [];
  for (const [category, template] of byCategory) {
    const rule = CATEGORY_KEYWORD_RULES[category];
    const keywordHit = rule && haystack.some((line) => rule.test(line));
    const harnessHit = category === 'harness-fidelity' &&
      changedPaths.some((p) => HARNESS_PATH_PATTERN.test(p));
    if (keywordHit || harnessHit) suggestions.push({category, template});
  }
  return suggestions;
}

function readDiffInput(argv) {
  if (argv[0]) return fs.readFileSync(argv[0], TEXT_ENCODING);
  return fs.readFileSync(0, TEXT_ENCODING); // stdin
}

function main() {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const suggestions = suggestVerificationTemplates(
    root, readDiffInput(process.argv.slice(2)));
  if (suggestions.length === 0) {
    process.stdout.write(NO_MATCH_MESSAGE);
    return;
  }
  for (const {category, template} of suggestions) {
    process.stdout.write(`${category}: ${template}\n`);
  }
}

const IS_MAIN = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) main();
