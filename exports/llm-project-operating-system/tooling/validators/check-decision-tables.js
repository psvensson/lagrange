#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  hasConcreteText,
  isObjectRecord,
  listFiles,
  mainResultToExitCode,
  readJsonFile,
  relativeToCwd,
  renderValidationResult,
  requireConcreteArray,
  requireConcreteField,
  uniqueValues,
} from './system-contract-utils.js';

const DEFAULT_TABLE_DIRS = Object.freeze([
  'docs/specs/decision-tables',
  'architecture/models/decision-tables',
]);
const TABLE_SCHEMA = 'decision-table-v1';
const WILDCARD = '*';
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
  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push(`${filePath}: ${fieldPath} must contain at least one entry.`);
    return;
  }
  const names = [];
  for (const [index, entry] of entries.entries()) {
    const entryPath = `${fieldPath}[${index}]`;
    if (!isObjectRecord(entry)) {
      errors.push(`${filePath}: ${entryPath} must be an object.`);
      continue;
    }
    requireConcreteField(errors, filePath, `${entryPath}.name`, entry.name);
    requireConcreteArray(errors, filePath, `${entryPath}.values`, entry.values);
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
  if (!Array.isArray(invariants) || invariants.length === 0) {
    errors.push(`${filePath}: invariants must contain at least one invariant.`);
    return;
  }
  const ids = [];
  for (const [index, invariant] of invariants.entries()) {
    const invariantPath = `invariants[${index}]`;
    if (!isObjectRecord(invariant)) {
      errors.push(`${filePath}: ${invariantPath} must be an object.`);
      continue;
    }
    requireConcreteField(errors, filePath, `${invariantPath}.id`, invariant.id);
    requireConcreteField(
      errors,
      filePath,
      `${invariantPath}.statement`,
      invariant.statement,
    );
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

function validateRuleShape(errors, filePath, table, inputNames, outputSpecs) {
  if (!Array.isArray(table.rules) || table.rules.length === 0) {
    errors.push(`${filePath}: rules must contain at least one rule.`);
    return;
  }
  const ruleIds = [];
  const inputValues = Object.fromEntries(
    table.inputs.map((input) => [input.name, new Set(input.values)]),
  );
  const outputValues = Object.fromEntries(
    table.outputs.map((output) => [output.name, new Set(output.values)]),
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
      errors.push(`${filePath}: ${rulePath} must be an object.`);
      continue;
    }
    requireConcreteField(errors, filePath, `${rulePath}.id`, rule.id);
    requireConcreteField(errors, filePath, `${rulePath}.reason`, rule.reason);
    requireConcreteArray(
      errors,
      filePath,
      `${rulePath}.invariantRefs`,
      rule.invariantRefs,
    );
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
    if (hasConcreteText(rule.id)) {
      ruleIds.push(rule.id);
    }
    if (!isObjectRecord(rule.when)) {
      errors.push(`${filePath}: ${rulePath}.when must be an object.`);
    } else {
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
    if (!isObjectRecord(rule.outcome)) {
      errors.push(`${filePath}: ${rulePath}.outcome must be an object.`);
    } else {
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
  }
  if (!uniqueValues(ruleIds)) {
    errors.push(`${filePath}: rules contains duplicate ids.`);
  }
}

function validateCoverage(errors, filePath, table) {
  if (!Array.isArray(table.inputs) || !Array.isArray(table.rules)) {
    return;
  }
  for (const combination of cartesianProduct(table.inputs)) {
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
  requireConcreteField(errors, relativeFilePath, 'schema', table.schema);
  if (table.schema !== TABLE_SCHEMA) {
    errors.push(`${relativeFilePath}: schema must be ${TABLE_SCHEMA}.`);
  }
  requireConcreteField(errors, relativeFilePath, 'id', table.id);
  requireConcreteField(errors, relativeFilePath, 'owner', table.owner);
  requireConcreteField(errors, relativeFilePath, 'boundary', table.boundary);
  validateNamedValues(errors, relativeFilePath, 'inputs', table.inputs);
  validateNamedValues(errors, relativeFilePath, 'outputs', table.outputs);
  validateInvariants(errors, relativeFilePath, table.invariants);
  const inputNames = Array.isArray(table.inputs) ?
    table.inputs.map((input) => input.name).filter(hasConcreteText) :
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
  TABLE_SCHEMA,
  validateDecisionTable,
  validateDecisionTables,
};
