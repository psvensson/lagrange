#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import Ajv from 'ajv';

import {
  CONCRETE_TEXT_SCHEMA,
  hasConcreteText,
  isObjectRecord,
  listFiles,
  mainResultToExitCode,
  readJsonFile,
  registerConcreteTextKeyword,
  relativeToCwd,
  renderValidationResult,
  uniqueValues,
} from './system-contract-utils.js';

const DEFAULT_STATECHART_DIRS = Object.freeze([
  'docs/specs/statecharts',
  'architecture/models/statecharts',
]);
const STATECHART_SCHEMA = 'statechart-v1';
const STATECHART_SCHEMA_ID = 'lagrange.statechart.v1';
const JSON_SCHEMA_OBJECT_TYPE = 'object';
const JSON_SCHEMA_ARRAY_TYPE = 'array';
const JSON_SCHEMA_STRING_TYPE = 'string';
const ADDITIONAL_PROPERTIES_KEYWORD = 'additionalProperties';
const ROOT_FIELD_LABEL = 'statechart';
const SLASH_SEPARATOR = '/';
const DOT_SEPARATOR = '.';
const NON_EMPTY_STRING_SCHEMA = CONCRETE_TEXT_SCHEMA;
const STATE_RECORD_SCHEMA = Object.freeze({
  type: JSON_SCHEMA_OBJECT_TYPE,
  additionalProperties: false,
  required: Object.freeze(['id', 'description']),
  properties: Object.freeze({
    id: NON_EMPTY_STRING_SCHEMA,
    description: NON_EMPTY_STRING_SCHEMA,
  }),
});
const TRANSITION_RECORD_SCHEMA = Object.freeze({
  type: JSON_SCHEMA_OBJECT_TYPE,
  additionalProperties: false,
  required: Object.freeze(['from', 'event', 'to', 'evidence']),
  properties: Object.freeze({
    from: NON_EMPTY_STRING_SCHEMA,
    event: NON_EMPTY_STRING_SCHEMA,
    to: NON_EMPTY_STRING_SCHEMA,
    evidence: NON_EMPTY_STRING_SCHEMA,
  }),
});
const FORBIDDEN_TRANSITION_RECORD_SCHEMA = Object.freeze({
  type: JSON_SCHEMA_OBJECT_TYPE,
  additionalProperties: false,
  required: Object.freeze(['from', 'event', 'to', 'reason']),
  properties: Object.freeze({
    from: NON_EMPTY_STRING_SCHEMA,
    event: NON_EMPTY_STRING_SCHEMA,
    to: NON_EMPTY_STRING_SCHEMA,
    reason: NON_EMPTY_STRING_SCHEMA,
  }),
});
const INVARIANT_RECORD_SCHEMA = Object.freeze({
  type: JSON_SCHEMA_OBJECT_TYPE,
  additionalProperties: false,
  required: Object.freeze(['id', 'statement']),
  properties: Object.freeze({
    id: NON_EMPTY_STRING_SCHEMA,
    statement: NON_EMPTY_STRING_SCHEMA,
  }),
});
const STATECHART_JSON_SCHEMA = Object.freeze({
  $id: STATECHART_SCHEMA_ID,
  type: JSON_SCHEMA_OBJECT_TYPE,
  additionalProperties: false,
  required: Object.freeze([
    'schema',
    'id',
    'initial',
    'states',
    'terminalStates',
    'transitions',
    'invariants',
  ]),
  properties: Object.freeze({
    schema: Object.freeze({
      type: JSON_SCHEMA_STRING_TYPE,
      const: STATECHART_SCHEMA,
    }),
    id: NON_EMPTY_STRING_SCHEMA,
    initial: NON_EMPTY_STRING_SCHEMA,
    states: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: STATE_RECORD_SCHEMA,
    }),
    terminalStates: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: NON_EMPTY_STRING_SCHEMA,
    }),
    transitions: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: TRANSITION_RECORD_SCHEMA,
    }),
    forbiddenTransitions: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      items: FORBIDDEN_TRANSITION_RECORD_SCHEMA,
    }),
    invariants: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: INVARIANT_RECORD_SCHEMA,
    }),
  }),
});
const ajv = registerConcreteTextKeyword(new Ajv({allErrors: true, strict: true}));
const validateStatechartSchema = ajv.compile(STATECHART_JSON_SCHEMA);
const HELP_TEXT = [
  'Usage: npm run model:statecharts -- [--json] [statechart.json ...]',
  '',
  'Validates statechart specs for lifecycle and owner-state contracts.',
  'Default scan roots: docs/specs/statecharts and architecture/models/statecharts.',
].join('\n');

function parseArgs(args) {
  const files = [];
  let json = false;
  let help = false;
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else {
      files.push(arg);
    }
  }
  return {files, help, json};
}

function statechartFilesFromArgs(files) {
  if (files.length > 0) {
    return files.map((filePath) => path.resolve(filePath));
  }
  return DEFAULT_STATECHART_DIRS.flatMap((dirPath) =>
    listFiles(dirPath, {suffix: '.json', recursive: false}));
}

function validateStates(errors, filePath, statechart) {
  if (!Array.isArray(statechart.states)) {
    return [];
  }
  const stateIds = [];
  for (const state of statechart.states) {
    if (!isObjectRecord(state)) {
      continue;
    }
    if (hasConcreteText(state.id)) {
      stateIds.push(state.id);
    }
  }
  if (!uniqueValues(stateIds)) {
    errors.push(`${filePath}: states contains duplicate ids.`);
  }
  return stateIds;
}

function validateInvariants(errors, filePath, invariants) {
  if (!Array.isArray(invariants)) {
    return;
  }
  const invariantIds = [];
  for (const invariant of invariants) {
    if (!isObjectRecord(invariant)) {
      continue;
    }
    if (hasConcreteText(invariant.id)) {
      invariantIds.push(invariant.id);
    }
  }
  if (!uniqueValues(invariantIds)) {
    errors.push(`${filePath}: invariants contains duplicate ids.`);
  }
}

function validateTransitionShape(errors, filePath, statechart, stateIds) {
  if (!Array.isArray(statechart.transitions)) {
    return;
  }
  const transitionKeys = [];
  for (const [index, transition] of statechart.transitions.entries()) {
    const transitionPath = `transitions[${index}]`;
    if (!isObjectRecord(transition)) {
      continue;
    }
    if (hasConcreteText(transition.from) && !stateIds.includes(transition.from)) {
      errors.push(`${filePath}: ${transitionPath}.from is not a declared state.`);
    }
    if (hasConcreteText(transition.to) && !stateIds.includes(transition.to)) {
      errors.push(`${filePath}: ${transitionPath}.to is not a declared state.`);
    }
    if (hasConcreteText(transition.from) && hasConcreteText(transition.event)) {
      transitionKeys.push(`${transition.from}:${transition.event}`);
    }
  }
  if (!uniqueValues(transitionKeys)) {
    errors.push(`${filePath}: transitions contains duplicate from/event pairs.`);
  }
}

function reachableStates(statechart) {
  const seen = new Set([statechart.initial]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const transition of statechart.transitions || []) {
      if (
        isObjectRecord(transition) &&
        seen.has(transition.from) &&
        !seen.has(transition.to)
      ) {
        seen.add(transition.to);
        changed = true;
      }
    }
  }
  return seen;
}

function hasOutgoingTransitions(transitions, fromStateId) {
  return transitions.some(
    (transition) => isObjectRecord(transition) && transition.from === fromStateId,
  );
}

function validateTerminalStates(
  errors,
  filePath,
  transitions,
  stateIds,
  terminalStates,
) {
  for (const terminalState of terminalStates) {
    if (!hasConcreteText(terminalState)) {
      continue;
    }
    if (!stateIds.includes(terminalState)) {
      errors.push(`${filePath}: terminal state is not declared: ${terminalState}`);
    }
    if (hasOutgoingTransitions(transitions, terminalState)) {
      errors.push(
        `${filePath}: terminal state has outgoing transitions: ${terminalState}`,
      );
    }
  }
}

function validateReachableAndOutgoing(
  errors,
  filePath,
  statechart,
  transitions,
  stateIds,
  terminalStates,
) {
  const reachable = reachableStates(statechart);
  for (const stateId of stateIds) {
    if (!reachable.has(stateId)) {
      errors.push(`${filePath}: state is unreachable from initial: ${stateId}`);
    }
    if (!terminalStates.includes(stateId) &&
        !hasOutgoingTransitions(transitions, stateId)) {
      errors.push(
        `${filePath}: non-terminal state has no outgoing transition: ${stateId}`,
      );
    }
  }
}

function validateGraph(errors, filePath, statechart, stateIds) {
  if (hasConcreteText(statechart.initial) && !stateIds.includes(statechart.initial)) {
    errors.push(`${filePath}: initial must name a declared state.`);
  }
  const terminalStates = Array.isArray(statechart.terminalStates) ?
    statechart.terminalStates :
    [];
  const transitions = Array.isArray(statechart.transitions) ?
    statechart.transitions :
    [];
  validateTerminalStates(
    errors,
    filePath,
    transitions,
    stateIds,
    terminalStates,
  );
  validateReachableAndOutgoing(
    errors,
    filePath,
    statechart,
    transitions,
    stateIds,
    terminalStates,
  );
}

function validateForbiddenTransitions(errors, filePath, statechart) {
  const transitions = Array.isArray(statechart.transitions) ?
    statechart.transitions :
    [];
  const stateIds = new Set(
    (statechart.states || [])
      .filter(isObjectRecord)
      .map((state) => state.id)
      .filter(hasConcreteText),
  );
  const forbiddenList = Array.isArray(statechart.forbiddenTransitions) ?
    statechart.forbiddenTransitions :
    [];
  for (const [index, forbidden] of forbiddenList.entries()) {
    const forbiddenPath = `forbiddenTransitions[${index}]`;
    if (!isObjectRecord(forbidden)) {
      continue;
    }
    if (hasConcreteText(forbidden.from) && !stateIds.has(forbidden.from)) {
      errors.push(`${filePath}: ${forbiddenPath}.from is not a declared state.`);
    }
    if (hasConcreteText(forbidden.to) && !stateIds.has(forbidden.to)) {
      errors.push(`${filePath}: ${forbiddenPath}.to is not a declared state.`);
    }
    const exists = transitions.some((transition) =>
      isObjectRecord(transition) &&
      transition.from === forbidden.from &&
      transition.event === forbidden.event &&
      transition.to === forbidden.to,
    );
    if (exists) {
      errors.push(
        `${filePath}: forbidden transition is present: ` +
        `${forbidden.from}/${forbidden.event}/${forbidden.to}`,
      );
    }
  }
}

function formatSchemaInstancePath(instancePath) {
  if (!instancePath) {
    return ROOT_FIELD_LABEL;
  }
  const segments = instancePath.slice(1).split(SLASH_SEPARATOR);
  let formatted = '';
  for (const segment of segments) {
    if (/^\d+$/u.test(segment)) {
      formatted += `[${segment}]`;
    } else {
      formatted += formatted.length > 0 ? `${DOT_SEPARATOR}${segment}` : segment;
    }
  }
  return formatted || ROOT_FIELD_LABEL;
}

function appendSchemaValidationErrors(errors, filePath, schemaErrors) {
  const entries = Array.isArray(schemaErrors) ? schemaErrors : [];
  for (const error of entries) {
    const targetPath = formatSchemaInstancePath(error.instancePath);
    if (error.keyword === ADDITIONAL_PROPERTIES_KEYWORD) {
      errors.push(
        `${filePath}: ${targetPath} contains unsupported property ` +
        `${error.params.additionalProperty}.`,
      );
    } else {
      errors.push(`${filePath}: ${targetPath} ${error.message}.`);
    }
  }
}

function validateStatechart(filePath) {
  const relativeFilePath = relativeToCwd(filePath);
  const errors = [];
  let statechart = null;
  try {
    statechart = readJsonFile(filePath);
  } catch (error) {
    errors.push(`${relativeFilePath}: cannot parse JSON: ${error.message}`);
    return {statechart: null, errors};
  }
  if (!isObjectRecord(statechart)) {
    errors.push(`${relativeFilePath}: statechart must be a JSON object.`);
    return {statechart: null, errors};
  }
  const schemaValid = validateStatechartSchema(statechart);
  if (!schemaValid) {
    appendSchemaValidationErrors(
      errors,
      relativeFilePath,
      validateStatechartSchema.errors,
    );
  }
  validateInvariants(errors, relativeFilePath, statechart.invariants);
  const stateIds = validateStates(errors, relativeFilePath, statechart);
  validateTransitionShape(errors, relativeFilePath, statechart, stateIds);
  validateGraph(errors, relativeFilePath, statechart, stateIds);
  validateForbiddenTransitions(errors, relativeFilePath, statechart);
  return {statechart, errors};
}

function validateStatecharts(files, options = {}) {
  const checkedFiles = [];
  const errors = [];
  for (const filePath of files) {
    checkedFiles.push(relativeToCwd(filePath));
    errors.push(...validateStatechart(filePath).errors);
  }
  return {
    label: 'model-statecharts',
    checkedFiles,
    errors,
    json: options.json === true,
  };
}

function main(argv) {
  const args = parseArgs(argv.slice(2));
  if (args.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }
  const files = statechartFilesFromArgs(args.files);
  const result = validateStatecharts(files, {json: args.json});
  process.stdout.write(renderValidationResult(result));
  return mainResultToExitCode(result);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  STATECHART_JSON_SCHEMA,
  STATECHART_SCHEMA,
  validateStatechart,
  validateStatechartSchema,
  validateStatecharts,
};
