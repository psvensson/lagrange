#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import Ajv from 'ajv';

import {
  hasConcreteText,
  isObjectRecord,
  listFiles,
  mainResultToExitCode,
  readJsonFile,
  relativeToCwd,
  renderValidationResult,
  uniqueValues,
} from './system-contract-utils.js';

const DEFAULT_TABLE_DIRS = Object.freeze([
  'docs/specs/decision-tables',
  'architecture/models/decision-tables',
]);
const TABLE_SCHEMA = 'decision-table-v1';
const DECISION_TABLE_SCHEMA_ID = 'lagrange.decision-table.v1';
const JSON_SCHEMA_OBJECT_TYPE = 'object';
const JSON_SCHEMA_ARRAY_TYPE = 'array';
const JSON_SCHEMA_STRING_TYPE = 'string';
const ADDITIONAL_PROPERTIES_KEYWORD = 'additionalProperties';
const ROOT_FIELD_LABEL = 'decision table';
const SLASH_SEPARATOR = '/';
const DOT_SEPARATOR = '.';
const WILDCARD = '*';
const NON_EMPTY_STRING_SCHEMA = Object.freeze({
  type: JSON_SCHEMA_STRING_TYPE,
  minLength: 1,
});
const NAMED_VALUES_RECORD_SCHEMA = Object.freeze({
  type: JSON_SCHEMA_OBJECT_TYPE,
  additionalProperties: false,
  required: Object.freeze(['name', 'values']),
  properties: Object.freeze({
    name: NON_EMPTY_STRING_SCHEMA,
    values: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: NON_EMPTY_STRING_SCHEMA,
    }),
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
const RULE_CONDITION_MAP_SCHEMA = Object.freeze({
  type: JSON_SCHEMA_OBJECT_TYPE,
  minProperties: 1,
  additionalProperties: NON_EMPTY_STRING_SCHEMA,
});
const RULE_RECORD_SCHEMA = Object.freeze({
  type: JSON_SCHEMA_OBJECT_TYPE,
  additionalProperties: false,
  required: Object.freeze(['id', 'reason', 'invariantRefs', 'when', 'outcome']),
  properties: Object.freeze({
    id: NON_EMPTY_STRING_SCHEMA,
    reason: NON_EMPTY_STRING_SCHEMA,
    invariantRefs: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: NON_EMPTY_STRING_SCHEMA,
    }),
    when: RULE_CONDITION_MAP_SCHEMA,
    outcome: RULE_CONDITION_MAP_SCHEMA,
  }),
});
const DECISION_TABLE_JSON_SCHEMA = Object.freeze({
  $id: DECISION_TABLE_SCHEMA_ID,
  type: JSON_SCHEMA_OBJECT_TYPE,
  additionalProperties: false,
  required: Object.freeze([
    'schema',
    'id',
    'owner',
    'boundary',
    'inputs',
    'outputs',
    'invariants',
    'rules',
  ]),
  properties: Object.freeze({
    schema: Object.freeze({
      type: JSON_SCHEMA_STRING_TYPE,
      const: TABLE_SCHEMA,
    }),
    id: NON_EMPTY_STRING_SCHEMA,
    owner: NON_EMPTY_STRING_SCHEMA,
    boundary: NON_EMPTY_STRING_SCHEMA,
    notes: NON_EMPTY_STRING_SCHEMA,
    inputs: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: NAMED_VALUES_RECORD_SCHEMA,
    }),
    outputs: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: NAMED_VALUES_RECORD_SCHEMA,
    }),
    invariants: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: INVARIANT_RECORD_SCHEMA,
    }),
    rules: Object.freeze({
      type: JSON_SCHEMA_ARRAY_TYPE,
      minItems: 1,
      items: RULE_RECORD_SCHEMA,
    }),
  }),
});
const ajv = new Ajv({allErrors: true, strict: true});
const validateDecisionTableSchema = ajv.compile(DECISION_TABLE_JSON_SCHEMA);
const HELP_TEXT = [
  'Usage: npm run model:decision-tables -- [--json] [table.json ...]',
  '',
  'Validates executable decision tables and proves every input combination',
  'maps to exactly one canonical outcome.',
  'Default scan roots: docs/specs/decision-tables and architecture/models/decision-tables.',
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

function tableFilesFromArgs(files) {
  if (files.length > 0) {
    return files.map((filePath) => path.resolve(filePath));
  }
  return DEFAULT_TABLE_DIRS.flatMap((dirPath) =>
    listFiles(dirPath, {suffix: '.json', recursive: false}));
}

function validateNamedValues(errors, filePath, fieldPath, entries) {
  if (!Array.isArray(entries)) {
    return;
  }
  const names = [];
  for (const [index, entry] of entries.entries()) {
    const entryPath = `${fieldPath}[${index}]`;
    if (!isObjectRecord(entry)) {
      continue;
    }
    if (hasConcreteText(entry.name)) {
      names.push(entry.name);
    }
    if (Array.isArray(entry.values) && !uniqueValues(entry.values)) {
      errors.push(`${filePath}: ${entryPath}.values contains duplicate values.`);
    }
  }
  if (!uniqueValues(names)) {
    errors.push(`${filePath}: ${fieldPath} contains duplicate names.`);
  }
}

function validateInvariants(errors, filePath, invariants) {
  if (!Array.isArray(invariants)) {
    return;
  }
  const ids = [];
  for (const invariant of invariants) {
    if (!isObjectRecord(invariant)) {
      continue;
    }
    if (hasConcreteText(invariant.id)) {
      ids.push(invariant.id);
    }
  }
  if (!uniqueValues(ids)) {
    errors.push(`${filePath}: invariants contains duplicate ids.`);
  }
}

function cartesianProduct(inputEntries) {
  return inputEntries.reduce((acc, input) => {
    const next = [];
    for (const partial of acc) {
      for (const value of input.values) {
        next.push({...partial, [input.name]: value});
      }
    }
    return next;
  }, [{}]);
}

function ruleMatchesCombination(rule, combination) {
  return Object.entries(combination).every(([name, value]) =>
    rule.when?.[name] === value || rule.when?.[name] === WILDCARD,
  );
}

function validateRuleInvariantRefs(errors, filePath, rulePath, rule, invariantIds) {
  if (Array.isArray(rule.invariantRefs)) {
    for (const [refIndex, invariantRef] of rule.invariantRefs.entries()) {
      if (
        hasConcreteText(invariantRef) &&
        !invariantIds.has(invariantRef)
      ) {
        errors.push(
          `${filePath}: ${rulePath}.invariantRefs[${refIndex}] ` +
          `does not match a declared invariant id: ${invariantRef}.`,
        );
      }
    }
  }
}

function validateRuleInputs(errors, filePath, rulePath, rule, inputNames, inputValues) {
  if (!isObjectRecord(rule.when)) {
    return;
  }
  for (const inputName of inputNames) {
    const value = rule.when[inputName];
    if (value === undefined) {
      errors.push(`${filePath}: ${rulePath}.when.${inputName} is required.`);
    } else if (value !== WILDCARD && !inputValues[inputName].has(value)) {
      errors.push(
        `${filePath}: ${rulePath}.when.${inputName} has invalid value ${value}.`,
      );
    }
  }
  for (const key of Object.keys(rule.when)) {
    if (!inputNames.includes(key)) {
      errors.push(`${filePath}: ${rulePath}.when.${key} is not a declared input.`);
    }
  }
}

function validateRuleOutcome(errors, filePath, rulePath, rule, outputSpecs, outputValues) {
  if (!isObjectRecord(rule.outcome)) {
    return;
  }
  for (const outputSpec of outputSpecs) {
    const value = rule.outcome[outputSpec.name];
    if (value === undefined) {
      errors.push(
        `${filePath}: ${rulePath}.outcome.${outputSpec.name} is required.`,
      );
    } else if (!outputValues[outputSpec.name].has(value)) {
      errors.push(
        `${filePath}: ${rulePath}.outcome.${outputSpec.name} has invalid value ${value}.`,
      );
    }
  }
  for (const key of Object.keys(rule.outcome)) {
    if (!outputValues[key]) {
      errors.push(`${filePath}: ${rulePath}.outcome.${key} is not declared.`);
    }
  }
}

function validateRuleShape(errors, filePath, table, inputNames, outputSpecs) {
  if (!Array.isArray(table.rules) ||
      !Array.isArray(table.inputs) ||
      !Array.isArray(table.outputs)) {
    return;
  }
  const ruleIds = [];
  const inputValues = Object.fromEntries(
    table.inputs
      .filter(
        (input) =>
          isObjectRecord(input) &&
          hasConcreteText(input.name) &&
          Array.isArray(input.values),
      )
      .map((input) => [input.name, new Set(input.values)]),
  );
  const outputValues = Object.fromEntries(
    table.outputs
      .filter(
        (output) =>
          isObjectRecord(output) &&
          hasConcreteText(output.name) &&
          Array.isArray(output.values),
      )
      .map((output) => [output.name, new Set(output.values)]),
  );
  const invariantIds = new Set(
    (table.invariants || [])
      .filter(isObjectRecord)
      .map((invariant) => invariant.id)
      .filter(hasConcreteText),
  );
  for (const [index, rule] of table.rules.entries()) {
    const rulePath = `rules[${index}]`;
    if (!isObjectRecord(rule)) {
      continue;
    }
    validateRuleInvariantRefs(errors, filePath, rulePath, rule, invariantIds);
    if (hasConcreteText(rule.id)) {
      ruleIds.push(rule.id);
    }
    validateRuleInputs(errors, filePath, rulePath, rule, inputNames, inputValues);
    validateRuleOutcome(errors, filePath, rulePath, rule, outputSpecs, outputValues);
  }
  if (!uniqueValues(ruleIds)) {
    errors.push(`${filePath}: rules contains duplicate ids.`);
  }
}

function validateCoverage(errors, filePath, table) {
  if (!Array.isArray(table.inputs) || !Array.isArray(table.rules)) {
    return;
  }
  const validInputs = table.inputs.filter(
    (input) => isObjectRecord(input) &&
      hasConcreteText(input.name) &&
      Array.isArray(input.values) &&
      input.values.length > 0,
  );
  if (validInputs.length === 0) {
    return;
  }
  for (const combination of cartesianProduct(validInputs)) {
    const matches = table.rules.filter((rule) =>
      isObjectRecord(rule) && ruleMatchesCombination(rule, combination));
    if (matches.length !== 1) {
      errors.push(
        `${filePath}: combination ${JSON.stringify(combination)} matches ` +
        `${matches.length} rules; expected exactly 1.`,
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

function validateDecisionTable(filePath) {
  const relativeFilePath = relativeToCwd(filePath);
  const errors = [];
  let table = null;
  try {
    table = readJsonFile(filePath);
  } catch (error) {
    errors.push(`${relativeFilePath}: cannot parse JSON: ${error.message}`);
    return {table: null, errors};
  }
  if (!isObjectRecord(table)) {
    errors.push(`${relativeFilePath}: decision table must be a JSON object.`);
    return {table: null, errors};
  }
  const schemaValid = validateDecisionTableSchema(table);
  if (!schemaValid) {
    appendSchemaValidationErrors(
      errors,
      relativeFilePath,
      validateDecisionTableSchema.errors,
    );
  }
  validateNamedValues(errors, relativeFilePath, 'inputs', table.inputs);
  validateNamedValues(errors, relativeFilePath, 'outputs', table.outputs);
  validateInvariants(errors, relativeFilePath, table.invariants);
  const inputNames = Array.isArray(table.inputs) ?
    table.inputs
      .filter(isObjectRecord)
      .map((input) => input.name)
      .filter(hasConcreteText) :
    [];
  const outputSpecs = Array.isArray(table.outputs) ?
    table.outputs.filter((output) => isObjectRecord(output) && hasConcreteText(output.name)) :
    [];
  validateRuleShape(errors, relativeFilePath, table, inputNames, outputSpecs);
  validateCoverage(errors, relativeFilePath, table);
  return {table, errors};
}

function validateDecisionTables(files, options = {}) {
  const checkedFiles = [];
  const errors = [];
  for (const filePath of files) {
    checkedFiles.push(relativeToCwd(filePath));
    errors.push(...validateDecisionTable(filePath).errors);
  }
  return {
    label: 'model-decision-tables',
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
  const files = tableFilesFromArgs(args.files);
  const result = validateDecisionTables(files, {json: args.json});
  process.stdout.write(renderValidationResult(result));
  return mainResultToExitCode(result);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  DECISION_TABLE_JSON_SCHEMA,
  TABLE_SCHEMA,
  validateDecisionTable,
  validateDecisionTableSchema,
  validateDecisionTables,
};
