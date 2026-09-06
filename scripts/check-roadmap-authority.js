#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';


const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const HUMAN_ROADMAP_PATH = 'roadmap.md';
const FEATURE_MAP_PATH = 'docs/development/agpl-feature-map.md';
const PRODUCT_ROADMAP_PATH = 'docs/development/product-roadmap.md';
const RETIRED_PRODUCT_ROADMAP_PATH = 'product-roadmap.md';
const ROUTER_PATH = 'docs/steering/router.md';
const ROADMAP_POLICY_PATH = 'docs/development/roadmap-policy.md';
const EDITION_MATRIX_PATH = 'edition-matrix.md';
const NOT_PRESENT = -1;
const CONDITIONAL_HEADING = '## Conditional material';
const ROUTED_AUTHORITIES = Object.freeze([
  FEATURE_MAP_PATH, ROADMAP_POLICY_PATH,
]);
const OVERVIEW_PATH = 'scripts/solve/schema.js';
const EPICS_PATH = 'solve/epics';
const SPECS_PATH = 'solve/specs';
const EPIC_TEMPLATE_PATH = 'solve/epics/_template.md';
const HISTORICAL_ROADMAP_TASK_PATH =
  'solve/specs/core-topology-control-plane-rewrite/tasks.md';
const TEXT_ENCODING = 'utf8';
const MARKDOWN_EXTENSION = '.md';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const HISTORICAL_ROADMAP_TASK_EXCERPT = [
  '- [x] Rebaseline `roadmap.md` so the rewrite sprint is the current Phase 0.1',
  '      representative track.',
].join(NEWLINE);
const NULL_LINK_VALUE = 'null';
const HUMAN_AUDIENCE = 'human';
const AGENT_AUDIENCE = 'agent';
const DEVELOPMENT_AUDIENCE = 'development';
const PLANNING_CLASS = 'planning';
const STEERING_CLASS = 'steering';
const HUMAN_PLAN_DOC = 'roadmap.md';
const COMMA_SEPARATOR = ',';
const MISSING_VALUE = '(missing)';
const EMPTY_SET_LABEL = '(none)';
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/u;
const FEATURE_ROW_CELL_PATTERN = /^\|\s*`?(RM-[^`|\s]+)`?\s*\|/gmu;
const FEATURE_ROW_ID_PATTERN =
  /^RM-[0-9]+(?:\.[0-9]+[a-z]?)+-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FEATURE_PHASE_PATTERN = /^## Phase ([0-9]+\.[0-9]+)\b/gmu;
// Public docs use spaced ASCII hyphens (audit:doc-ascii), so the phase
// heading separator is "- "; the legacy em dash stays accepted for any
// historical copy.
const HUMAN_PHASE_PATTERN = /^## .+?[—-] ([0-9]+\.[0-9]+)\b/gmu;
const EPIC_ROADMAP_ROW_PATTERN = /^roadmapRow:\s*(\S+)\s*$/mu;
const ROOT_ROADMAP_REFERENCE_PATTERN =
  /(?:^|[^\w/-])(?:\.\/)?roadmap\.md\b/u;
const HUMAN_FORBIDDEN_PATTERNS = Object.freeze([
  {pattern: /\bRM-/u, label: 'machine roadmap row identity'},
  {pattern: /\broadmapRow\b/u, label: 'machine roadmap link field'},
  {pattern: /\b(?:Quest|Solver)\b/iu, label: 'agent workflow vocabulary'},
  {
    pattern: /(?:docs\/steering\/|solve\/|AGENTS\.md)/u,
    label: 'agent or Solver path',
  },
]);
const HISTORICAL_HUMAN_PLAN_DOC_QUESTS = new Set([
  'readiness-scale-contract-portfolio-complete',
  'readiness-scale-contract-portfolio-planning',
  'readiness-scale-portfolio-planning',
]);

function readRequired(root, relativePath, errors) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`${relativePath}: required roadmap authority file is missing`);
    return EMPTY_TEXT;
  }
  return fs.readFileSync(absolutePath, TEXT_ENCODING);
}

function frontmatterValue(content, key) {
  const frontmatter = FRONTMATTER_PATTERN.exec(content);
  if (!frontmatter) return EMPTY_TEXT;
  const linePattern = new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'mu');
  const value = linePattern.exec(frontmatter[1]);
  return value ? value[1] : EMPTY_TEXT;
}

function valuesFromPattern(content, pattern) {
  return [...content.matchAll(pattern)].map((match) => match[1]);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function validateFrontmatter(content, relativePath, expected, errors) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = frontmatterValue(content, key);
    if (actualValue !== expectedValue) {
      errors.push(
        `${relativePath}: expected ${key}: ${expectedValue}, found ` +
        `${actualValue || MISSING_VALUE}`,
      );
    }
  }
}

function validateHumanRoadmap(content, errors) {
  validateFrontmatter(
    content,
    HUMAN_ROADMAP_PATH,
    {audience: HUMAN_AUDIENCE, documentClass: PLANNING_CLASS},
    errors,
  );
  for (const rule of HUMAN_FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(content)) {
      errors.push(`${HUMAN_ROADMAP_PATH}: contains ${rule.label}`);
    }
  }
}

function featureRowInventory(content, errors) {
  const rows = valuesFromPattern(content, FEATURE_ROW_CELL_PATTERN);
  const counts = new Map();
  for (const row of rows) {
    if (!FEATURE_ROW_ID_PATTERN.test(row)) {
      errors.push(`${FEATURE_MAP_PATH}: malformed roadmap row ${row}`);
    }
    counts.set(row, (counts.get(row) || 0) + 1);
  }
  for (const [row, count] of counts) {
    if (count > 1) {
      errors.push(`${FEATURE_MAP_PATH}: duplicate roadmap row ${row}`);
    }
  }
  return new Set(counts.keys());
}

function validatePhaseAlignment(humanRoadmap, featureMap, errors) {
  const humanPhases =
    sortedUnique(valuesFromPattern(humanRoadmap, HUMAN_PHASE_PATTERN));
  const featurePhases =
    sortedUnique(valuesFromPattern(featureMap, FEATURE_PHASE_PATTERN));
  if (humanPhases.join(COMMA_SEPARATOR) !==
      featurePhases.join(COMMA_SEPARATOR)) {
    errors.push(
      `${HUMAN_ROADMAP_PATH}: milestone phases ` +
      `${humanPhases.join(COMMA_SEPARATOR) || EMPTY_SET_LABEL} ` +
      `do not match ${FEATURE_MAP_PATH} phases ` +
      `${featurePhases.join(COMMA_SEPARATOR) || EMPTY_SET_LABEL}`,
    );
  }
}

const QUESTS_PATH = 'solve/quests';
const QUEST_FILE = 'quest.json';

// v2 quests keep their v1 planning links under legacy.links; a v2-authored
// quest may carry links at the top level.
function loadQuestLinks(root) {
  const dir = path.join(root, QUESTS_PATH);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() &&
      fs.existsSync(path.join(dir, entry.name, QUEST_FILE)))
    .map((entry) => {
      const quest = JSON.parse(fs.readFileSync(
        path.join(dir, entry.name, QUEST_FILE), TEXT_ENCODING));
      return {id: quest.id, links: quest.links || quest.legacy?.links || {}};
    });
}

function validateQuestLinks(root, featureRows, errors) {
  for (const quest of loadQuestLinks(root)) {
    const links = quest.links;
    const roadmapRow = links.roadmapRow;
    if (roadmapRow !== null && roadmapRow !== undefined &&
        !featureRows.has(roadmapRow)) {
      errors.push(
        `${QUESTS_PATH}/${quest.id}/${QUEST_FILE}: unresolved roadmapRow ${roadmapRow}`,
      );
    }
    if (links.planDoc === HUMAN_PLAN_DOC &&
        !HISTORICAL_HUMAN_PLAN_DOC_QUESTS.has(quest.id)) {
      errors.push(
        `${QUESTS_PATH}/${quest.id}/${QUEST_FILE}: new planDoc must not target ` +
        HUMAN_ROADMAP_PATH,
      );
    }
  }
}

function validateEpicLinks(root, featureRows, errors) {
  const epicsDir = path.join(root, EPICS_PATH);
  if (!fs.existsSync(epicsDir)) return;
  const epicFiles = fs.readdirSync(epicsDir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  for (const name of epicFiles) {
    const relativePath = `${EPICS_PATH}/${name}`;
    if (relativePath === EPIC_TEMPLATE_PATH) continue;
    const content = fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING);
    const row = EPIC_ROADMAP_ROW_PATTERN.exec(content);
    if (row && row[1] !== NULL_LINK_VALUE && !featureRows.has(row[1])) {
      errors.push(`${relativePath}: unresolved roadmapRow ${row[1]}`);
    }
  }
}

// Roadmap material is conditional: an agent reaches it because the router
// sends it there, not because it was loaded by default. The router is the one
// place a concern becomes a path, so both roadmap authorities must be
// reachable from it and must be reachable only as conditional material.
function validateRouting(content, errors) {
  const start = content.indexOf(CONDITIONAL_HEADING);
  if (start === NOT_PRESENT) {
    errors.push(`${ROUTER_PATH}: no conditional material section`);
    return;
  }
  const conditional = content.slice(start);
  for (const target of ROUTED_AUTHORITIES) {
    if (!conditional.includes(routerLink(target))) {
      errors.push(
        `${ROUTER_PATH}: ${target} must stay reachable as conditional material`,
      );
    }
  }
}

// docs/steering paths are router-relative.
function routerLink(target) {
  return `(${path.posix.relative(path.posix.dirname(ROUTER_PATH), target)})`;
}

function markdownFilesUnder(root, relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absoluteDirectory, {withFileTypes: true})) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...markdownFilesUnder(root, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION)) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function validatePlanningAuthorityReferences(root, errors) {
  const planningFiles = [
    ...markdownFilesUnder(root, EPICS_PATH),
    ...markdownFilesUnder(root, SPECS_PATH),
  ];
  for (const relativePath of planningFiles) {
    const content = fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING);
    const authorityContent = relativePath === HISTORICAL_ROADMAP_TASK_PATH ?
      content.replace(HISTORICAL_ROADMAP_TASK_EXCERPT, EMPTY_TEXT) :
      content;
    if (ROOT_ROADMAP_REFERENCE_PATTERN.test(authorityContent)) {
      errors.push(
        `${relativePath}: planning authority must use ${FEATURE_MAP_PATH}, ` +
        `not root ${HUMAN_ROADMAP_PATH}`,
      );
    }
  }
}

function validateAuthorityConsumers(root, errors) {
  const expectedReferences = Object.freeze([
    {
      path: ROADMAP_POLICY_PATH,
      pattern:
        /canonical AGPL feature sequence and scope map lives at\s+\[`agpl-feature-map\.md`\]/u,
      description: 'canonical AGPL feature-map declaration',
    },
    {
      path: EDITION_MATRIX_PATH,
      pattern: /AGPL feature map \(agent steering\)/u,
      description: 'agent-steering feature-map classification',
    },
    {
      path: OVERVIEW_PATH,
      pattern:
        /_Scope authority \(docs\/development\/agpl-feature-map\.md\)\./u,
      description: 'Solver overview scope-authority declaration',
    },
  ]);
  for (const expected of expectedReferences) {
    const content = readRequired(root, expected.path, errors);
    if (content && !expected.pattern.test(content)) {
      errors.push(
        `${expected.path}: missing roadmap authority reference ` +
        expected.description,
      );
    }
  }
}

function validateProductRoadmapPlacement(root, productRoadmap, errors) {
  validateFrontmatter(
    productRoadmap,
    PRODUCT_ROADMAP_PATH,
    {audience: DEVELOPMENT_AUDIENCE, documentClass: PLANNING_CLASS},
    errors,
  );
  if (fs.existsSync(path.join(root, RETIRED_PRODUCT_ROADMAP_PATH))) {
    errors.push(
      `${RETIRED_PRODUCT_ROADMAP_PATH}: retired root path must remain absent`,
    );
  }
}

function validateRoadmapAuthority(root = REPO_ROOT) {
  const errors = [];
  const humanRoadmap = readRequired(root, HUMAN_ROADMAP_PATH, errors);
  const featureMap = readRequired(root, FEATURE_MAP_PATH, errors);
  const productRoadmap = readRequired(root, PRODUCT_ROADMAP_PATH, errors);
  const router = readRequired(root, ROUTER_PATH, errors);
  if (humanRoadmap) validateHumanRoadmap(humanRoadmap, errors);
  if (featureMap) {
    validateFrontmatter(
      featureMap,
      FEATURE_MAP_PATH,
      {audience: AGENT_AUDIENCE, documentClass: STEERING_CLASS},
      errors,
    );
  }
  const featureRows = featureMap ?
    featureRowInventory(featureMap, errors) :
    new Set();
  if (humanRoadmap && featureMap) {
    validatePhaseAlignment(humanRoadmap, featureMap, errors);
  }
  validateQuestLinks(root, featureRows, errors);
  validateEpicLinks(root, featureRows, errors);
  validatePlanningAuthorityReferences(root, errors);
  if (router) validateRouting(router, errors);
  if (productRoadmap) {
    validateProductRoadmapPlacement(root, productRoadmap, errors);
  }
  validateAuthorityConsumers(root, errors);
  return {
    ok: errors.length === 0,
    errors,
    featureRowCount: featureRows.size,
  };
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const result = validateRoadmapAuthority();
  if (result.ok) {
    process.stdout.write(
      `Roadmap authority check passed: ${result.featureRowCount} feature rows.${NEWLINE}`,
    );
    process.exitCode = EXIT_SUCCESS;
  } else {
    process.stderr.write(
      `Found ${result.errors.length} roadmap authority violation(s):${NEWLINE}` +
      result.errors.map((error) => `  - ${error}`).join(NEWLINE) +
      NEWLINE,
    );
    process.exitCode = EXIT_FAILURE;
  }
}

export {validateRoadmapAuthority};
