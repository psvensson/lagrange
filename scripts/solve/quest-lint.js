// Read-only Quest authoring validation. New authoring-contract versions fail
// before declaration; unversioned Quests remain legacy-readable and are only
// described by the corpus census.

import fs from 'node:fs';
import path from 'node:path';
import {questHarnessMissing, questHarnessPath} from './harness-scaffold.js';

import {loadQuest} from './store.js';
import {questClass} from './closure-kind.js';
import {loadTemplateCategories} from './verification-template-suggest.js';
import {landingRequirementsLintProblems} from './landing-requirements.js';
import {
  QUEST_CLASSES,
  QUEST_CLASS_PRODUCT,
  SOLVE_DATA_DIR,
  QUESTS_SUBDIR,
} from './constants.js';

const LOCAL_STR_OWNED_001 = 'statement must be a concrete terminal result predicate';
const HARNESS_MISSING_PREFIX = 'no evidence harness at ';
const HARNESS_MISSING_SUFFIX =
  '; run solve scaffold-harness (or solve start) to write the skeleton';
const LOCAL_STR_OWNED_002 = '|';
const LOCAL_STR_OWNED_003 = 'constraints must be an array';
const LOCAL_STR_OWNED_004 = 'every constraint requires non-empty id and statement strings';
const LOCAL_STR_OWNED_005 = 'doneWhen must declare a probe and argument object';
const LOCAL_STR_OWNED_006 = 'at least one frontier is required';
const LOCAL_STR_OWNED_007 = 'every frontier requires an id';
const LOCAL_STR_OWNED_008 = '(unnamed)';
const LOCAL_STR_OWNED_009 = 'product Quest requires a planning link';
const LOCAL_STR_OWNED_010 = 'product Quest requires measured non-oracle doneWhen evidence';
const LOCAL_STR_OWNED_011 = 'statement names several concerns but declares one frontier; confirm they are not independent';
const LOCAL_STR_OWNED_012 = 'pass';
const LOCAL_STR_OWNED_013 = 'fail';
const LOCAL_STR_OWNED_014 = '; ';
const LOCAL_STR_OWNED_015 = '.json';
const LOCAL_STR_OWNED_016 = '\n';
const LOCAL_STR_OWNED_017 =
  'verificationTemplates must be an array of non-empty category slugs';
const LOCAL_STR_OWNED_018 = 'verificationTemplates must not contain duplicates';
const LOCAL_STR_OWNED_019 =
  '(no docs/steering/verification-templates entry declares it)';

export const QUEST_AUTHORING_CONTRACT_VERSION = 1;

const LONG_STATEMENT_CHARACTER_LIMIT = 500;
// Bound on the title alone; the commit subject adds a `<questId>: ` prefix.
const TITLE_CHARACTER_LIMIT = 72;
const CONJUNCTION_ADVISORY_THRESHOLD = 3;
const DEFAULT_STATEMENT = 'Describe the terminal success condition in one line.';
const ORACLE_PROBE = 'oracle';
const CONJUNCTION_PATTERN = /\b(?:and|plus|while|with)\b|[;,]/giu;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function recognizedPlanningLink(links = {}) {
  return Boolean(
    text(links.planDoc) ||
    text(links.parentQuest) ||
    text(links.specRef) ||
    text(links.roadmapRow) ||
    (Array.isArray(links.closesCL) && links.closesCL.some((item) => text(item))),
  );
}

function validProbe(spec) {
  return Boolean(spec && text(spec.probe) && spec.args &&
    typeof spec.args === 'object' && !Array.isArray(spec.args));
}

function validConstraint(constraint) {
  return Boolean(constraint && typeof constraint === 'object' &&
    !Array.isArray(constraint) && text(constraint.id) && text(constraint.statement));
}

function pushConstraintErrors(quest, errors) {
  if (!Array.isArray(quest.constraints)) {
    errors.push(LOCAL_STR_OWNED_003);
    return;
  }
  const constraintIds = new Set();
  for (const constraint of quest.constraints) {
    if (!validConstraint(constraint)) {
      errors.push(LOCAL_STR_OWNED_004);
      continue;
    }
    if (constraintIds.has(constraint.id.trim())) {
      errors.push(`constraint id is duplicated: ${constraint.id.trim()}`);
    }
    constraintIds.add(constraint.id.trim());
  }
}

function pushFrontierErrors(quest, errors) {
  if (!Array.isArray(quest.frontiers) || quest.frontiers.length === 0) {
    errors.push(LOCAL_STR_OWNED_006);
    return;
  }
  const ids = new Set();
  for (const frontier of quest.frontiers) {
    const id = text(frontier?.id);
    if (!id) errors.push(LOCAL_STR_OWNED_007);
    if (ids.has(id)) errors.push(`frontier id is duplicated: ${id}`);
    ids.add(id);
    if (!validProbe(frontier?.metric)) {
      errors.push(`frontier ${id || LOCAL_STR_OWNED_008} requires a metric probe`);
    }
  }
}

// Optional sealed verification bar. Structural rules always apply; the
// name-exists check needs a repository root to read the template catalog, so
// it runs only when the caller supplies one (pure lintQuest calls skip it).
function pushVerificationTemplateErrors(quest, errors, options) {
  const templates = quest.verificationTemplates;
  if (templates === undefined || templates === null) return;
  if (!Array.isArray(templates) ||
    templates.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    errors.push(LOCAL_STR_OWNED_017);
    return;
  }
  if (new Set(templates).size !== templates.length) {
    errors.push(LOCAL_STR_OWNED_018);
  }
  if (!options?.root) return;
  const known = loadTemplateCategories(options.root);
  for (const template of templates) {
    if (!known.has(template)) {
      errors.push(`verificationTemplates names unknown category "${template}" ` +
        LOCAL_STR_OWNED_019);
    }
  }
}

function authoringErrors(quest, options) {
  const errors = [];
  if (quest.authoringContractVersion !== QUEST_AUTHORING_CONTRACT_VERSION) {
    errors.push(
      `unsupported authoringContractVersion: ${quest.authoringContractVersion}`,
    );
  }
  if (!text(quest.statement) || text(quest.statement) === DEFAULT_STATEMENT) {
    errors.push(LOCAL_STR_OWNED_001);
  }
  if (!QUEST_CLASSES.includes(quest.class)) {
    errors.push(`class must be one of ${QUEST_CLASSES.join(LOCAL_STR_OWNED_002)}`);
  }
  if (quest.title !== undefined && quest.title !== null &&
    (typeof quest.title !== 'string' ||
      quest.title.length > TITLE_CHARACTER_LIMIT)) {
    errors.push('title must be a string of at most ' +
      `${TITLE_CHARACTER_LIMIT} characters (it becomes the terminal commit subject)`);
  }
  pushConstraintErrors(quest, errors);
  pushVerificationTemplateErrors(quest, errors, options);
  errors.push(...landingRequirementsLintProblems(quest.landingRequirements));
  if (!validProbe(quest.doneWhen)) {
    errors.push(LOCAL_STR_OWNED_005);
  }
  pushFrontierErrors(quest, errors);
  if (QUEST_CLASSES.includes(quest.class) &&
    questClass(quest) === QUEST_CLASS_PRODUCT) {
    if (!recognizedPlanningLink(quest.links)) {
      errors.push(LOCAL_STR_OWNED_009);
    }
    if (quest.doneWhen?.probe === ORACLE_PROBE) {
      errors.push(LOCAL_STR_OWNED_010);
    }
  }
  return errors;
}

function authoringWarnings(quest) {
  const warnings = [];
  const statement = text(quest.statement);
  if (statement.length > LONG_STATEMENT_CHARACTER_LIMIT) {
    warnings.push(
      `statement is ${statement.length} characters; consider a narrower sealed result`,
    );
  }
  const conjunctions = statement.match(CONJUNCTION_PATTERN) || [];
  if (conjunctions.length >= CONJUNCTION_ADVISORY_THRESHOLD &&
    quest.frontiers?.length === 1) {
    warnings.push(
      LOCAL_STR_OWNED_011,
    );
  }
  return warnings;
}

// A test-receipt quest without its evidence harness cannot regenerate its
// receipt; `solve start` scaffolds one, so this stays a warning, not an error.
function harnessWarnings(quest, options) {
  if (!options?.root || !questHarnessMissing(options.root, quest)) return [];
  return [`${HARNESS_MISSING_PREFIX}${questHarnessPath(quest.id)}` +
    HARNESS_MISSING_SUFFIX];
}

export function lintQuest(quest, options = {}) {
  const version = quest?.authoringContractVersion;
  const legacy = version === undefined;
  const errors = legacy ? [] : authoringErrors(quest, options);
  const warnings = [
    ...authoringWarnings(quest),
    ...(legacy ? [] : harnessWarnings(quest, options)),
  ];
  return {
    questId: quest?.id || null,
    authoringContractVersion: legacy ? null : version,
    legacy,
    status: errors.length === 0 ? LOCAL_STR_OWNED_012 : LOCAL_STR_OWNED_013,
    errors,
    warnings,
  };
}

export function assertQuestReadyToSeal(quest) {
  const result = lintQuest(quest);
  if (result.errors.length > 0) {
    throw new Error(`quest lint failed: ${result.errors.join(LOCAL_STR_OWNED_014)}`);
  }
  return result;
}

function questIds(root) {
  const dir = path.join(root, SOLVE_DATA_DIR, QUESTS_SUBDIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(LOCAL_STR_OWNED_015))
    .map((name) => name.slice(0, -LOCAL_STR_OWNED_015.length))
    .sort();
}

export function lintQuestCorpus(root, options = {}) {
  const ids = options.all ? questIds(root) : [options.id];
  const quests = ids.filter(Boolean)
    .map((id) => lintQuest(loadQuest(root, id), {root}));
  return {
    status: quests.every((item) => item.status === LOCAL_STR_OWNED_012) ?
      LOCAL_STR_OWNED_012 : LOCAL_STR_OWNED_013,
    questCount: quests.length,
    legacyCount: quests.filter((item) => item.legacy).length,
    errorCount: quests.reduce((sum, item) => sum + item.errors.length, 0),
    warningCount: quests.reduce((sum, item) => sum + item.warnings.length, 0),
    quests,
  };
}

export function renderQuestLint(result) {
  const lines = [
    `quest lint: ${result.status} — ${result.questCount} quest(s), ` +
      `${result.errorCount} error(s), ${result.warningCount} warning(s), ` +
      `${result.legacyCount} legacy`,
  ];
  for (const quest of result.quests) {
    for (const error of quest.errors) lines.push(`ERROR ${quest.questId}: ${error}`);
    for (const warning of quest.warnings) lines.push(`WARN  ${quest.questId}: ${warning}`);
  }
  return `${lines.join(LOCAL_STR_OWNED_016)}\n`;
}
