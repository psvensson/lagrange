// Read-only Quest authoring validation. New authoring-contract versions fail
// before declaration; unversioned Quests remain legacy-readable and are only
// described by the corpus census.

import fs from 'node:fs';
import path from 'node:path';

import {loadQuest} from './store.js';
import {questClass} from './closure-kind.js';
import {
  QUEST_CLASSES,
  QUEST_CLASS_PRODUCT,
  SOLVE_DATA_DIR,
  QUESTS_SUBDIR,
} from './constants.js';

export const QUEST_AUTHORING_CONTRACT_VERSION = 1;

const LONG_STATEMENT_CHARACTER_LIMIT = 500;
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

function authoringErrors(quest) {
  const errors = [];
  if (quest.authoringContractVersion !== QUEST_AUTHORING_CONTRACT_VERSION) {
    errors.push(
      `unsupported authoringContractVersion: ${quest.authoringContractVersion}`,
    );
  }
  if (!text(quest.statement) || text(quest.statement) === DEFAULT_STATEMENT) {
    errors.push('statement must be a concrete terminal result predicate');
  }
  if (!QUEST_CLASSES.includes(quest.class)) {
    errors.push(`class must be one of ${QUEST_CLASSES.join('|')}`);
  }
  if (!Array.isArray(quest.constraints)) {
    errors.push('constraints must be an array');
  } else {
    const constraintIds = new Set();
    for (const constraint of quest.constraints) {
      if (!validConstraint(constraint)) {
        errors.push('every constraint requires non-empty id and statement strings');
        continue;
      }
      if (constraintIds.has(constraint.id.trim())) {
        errors.push(`constraint id is duplicated: ${constraint.id.trim()}`);
      }
      constraintIds.add(constraint.id.trim());
    }
  }
  if (!validProbe(quest.doneWhen)) {
    errors.push('doneWhen must declare a probe and argument object');
  }
  if (!Array.isArray(quest.frontiers) || quest.frontiers.length === 0) {
    errors.push('at least one frontier is required');
  } else {
    const ids = new Set();
    for (const frontier of quest.frontiers) {
      const id = text(frontier?.id);
      if (!id) errors.push('every frontier requires an id');
      if (ids.has(id)) errors.push(`frontier id is duplicated: ${id}`);
      ids.add(id);
      if (!validProbe(frontier?.metric)) {
        errors.push(`frontier ${id || '(unnamed)'} requires a metric probe`);
      }
    }
  }
  if (QUEST_CLASSES.includes(quest.class) &&
    questClass(quest) === QUEST_CLASS_PRODUCT) {
    if (!recognizedPlanningLink(quest.links)) {
      errors.push('product Quest requires a planning link');
    }
    if (quest.doneWhen?.probe === ORACLE_PROBE) {
      errors.push('product Quest requires measured non-oracle doneWhen evidence');
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
      'statement names several concerns but declares one frontier; confirm they are not independent',
    );
  }
  return warnings;
}

export function lintQuest(quest) {
  const version = quest?.authoringContractVersion;
  const legacy = version === undefined;
  const errors = legacy ? [] : authoringErrors(quest);
  const warnings = authoringWarnings(quest);
  return {
    questId: quest?.id || null,
    authoringContractVersion: legacy ? null : version,
    legacy,
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    warnings,
  };
}

export function assertQuestReadyToSeal(quest) {
  const result = lintQuest(quest);
  if (result.errors.length > 0) {
    throw new Error(`quest lint failed: ${result.errors.join('; ')}`);
  }
  return result;
}

function questIds(root) {
  const dir = path.join(root, SOLVE_DATA_DIR, QUESTS_SUBDIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

export function lintQuestCorpus(root, options = {}) {
  const ids = options.all ? questIds(root) : [options.id];
  const quests = ids.filter(Boolean).map((id) => lintQuest(loadQuest(root, id)));
  return {
    status: quests.every((item) => item.status === 'pass') ? 'pass' : 'fail',
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
  return `${lines.join('\n')}\n`;
}
