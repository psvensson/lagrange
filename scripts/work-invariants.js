#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  hasConcreteText,
  isObjectRecord,
  mainResultToExitCode,
  pathExists,
  relativeToCwd,
  renderValidationResult,
  validateEnum,
} from './work-contract-utils.js';

const DEFAULT_REGISTRY_PATH = 'architecture/contracts/invariants.json';
const REGISTRY_SCHEMA = 'invariant-registry-v1';
const VALID_KINDS = Object.freeze(['safety', 'liveness']);
const HELP_TEXT = [
  'Usage: npm run work:invariants:check -- [--json] [registry.json]',
  '',
  'Validates the machine-readable invariant registry under',
  `${DEFAULT_REGISTRY_PATH} by default: unique ids, valid kinds, concrete`,
  'owner/boundary/statement/formalPredicate, symmetric coupledWith references,',
  'and existing modelRef/contractRef paths.',
].join('\n');

function resolveRegistryPath(rootDir = process.cwd()) {
  return path.resolve(rootDir, DEFAULT_REGISTRY_PATH);
}

function loadInvariantRegistry(filePath, rootDir = process.cwd()) {
  const resolved = filePath
    ? path.resolve(rootDir, filePath)
    : resolveRegistryPath(rootDir);
  if (!fs.existsSync(resolved)) {
    return {registry: null, path: resolved, error: 'registry-not-found'};
  }
  try {
    const registry = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return {registry, path: resolved, error: null};
  } catch (error) {
    return {registry: null, path: resolved, error: error.message};
  }
}

function indexInvariantsById(registry) {
  const index = new Map();
  if (!isObjectRecord(registry) || !Array.isArray(registry.invariants)) {
    return index;
  }
  for (const entry of registry.invariants) {
    if (isObjectRecord(entry) && hasConcreteText(entry.id)) {
      index.set(entry.id, entry);
    }
  }
  return index;
}

function findInvariantsForOwnerBoundary(registry, owner, boundary) {
  if (!isObjectRecord(registry) || !Array.isArray(registry.invariants)) {
    return [];
  }
  return registry.invariants.filter(
    (entry) =>
      isObjectRecord(entry) &&
      entry.owner === owner &&
      entry.boundary === boundary,
  );
}

function validateEntryFields(errors, label, entry, index) {
  const fieldLabel = `${label}: invariants[${index}]`;
  for (const field of ['id', 'owner', 'boundary', 'statement', 'formalPredicate']) {
    if (!hasConcreteText(entry[field])) {
      errors.push(`${fieldLabel}.${field} must be concrete text.`);
    }
  }
  validateEnum(errors, label, `invariants[${index}].kind`, entry.kind, VALID_KINDS);
}

function validateEntryRefs(errors, label, entry, index, rootDir) {
  const refFields = ['modelRef', 'contractRef'];
  for (const field of refFields) {
    const value = entry[field];
    if (hasConcreteText(value) && !pathExists(value, rootDir)) {
      errors.push(
        `${label}: invariants[${index}].${field} does not exist: ${value}`,
      );
    }
  }
}

function validateCoupling(errors, label, entry, index, byId) {
  const coupled = entry.coupledWith;
  if (coupled === undefined || coupled === null) {
    return;
  }
  if (!Array.isArray(coupled)) {
    errors.push(`${label}: invariants[${index}].coupledWith must be an array.`);
    return;
  }
  for (const ref of coupled) {
    if (ref === entry.id) {
      errors.push(
        `${label}: invariants[${index}].coupledWith cannot reference itself ` +
        `(${ref}).`,
      );
      continue;
    }
    const target = byId.get(ref);
    if (!target) {
      errors.push(
        `${label}: invariants[${index}].coupledWith references unknown id ` +
        `${ref}.`,
      );
      continue;
    }
    const back = Array.isArray(target.coupledWith) ? target.coupledWith : [];
    if (!back.includes(entry.id)) {
      errors.push(
        `${label}: coupling is not symmetric — ${entry.id} couples ${ref} but ` +
        `${ref} does not couple ${entry.id} back.`,
      );
    }
  }
}

function validateInvariantRegistry(registry, options = {}) {
  const label = options.label || DEFAULT_REGISTRY_PATH;
  const rootDir = options.rootDir || process.cwd();
  const errors = [];
  if (!isObjectRecord(registry)) {
    errors.push(`${label}: registry must be a JSON object.`);
    return errors;
  }
  if (registry.schema !== REGISTRY_SCHEMA) {
    errors.push(`${label}: schema must be ${REGISTRY_SCHEMA}.`);
  }
  if (!Array.isArray(registry.invariants) || registry.invariants.length === 0) {
    errors.push(`${label}: invariants must be a non-empty array.`);
    return errors;
  }
  const seen = new Set();
  registry.invariants.forEach((entry, index) => {
    if (!isObjectRecord(entry)) {
      errors.push(`${label}: invariants[${index}] must be an object.`);
      return;
    }
    if (hasConcreteText(entry.id)) {
      if (seen.has(entry.id)) {
        errors.push(`${label}: duplicate invariant id ${entry.id}.`);
      }
      seen.add(entry.id);
    }
    validateEntryFields(errors, label, entry, index);
    validateEntryRefs(errors, label, entry, index, rootDir);
  });
  const byId = indexInvariantsById(registry);
  registry.invariants.forEach((entry, index) => {
    if (isObjectRecord(entry)) {
      validateCoupling(errors, label, entry, index, byId);
    }
  });
  return errors;
}

function buildResult(registryPath, errors) {
  return {
    label: 'work-invariants-check',
    checkedFiles: [relativeToCwd(registryPath)],
    errors,
    json: false,
  };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }
  const json = args.includes('--json');
  const fileArg = args.find((arg) => !arg.startsWith('-'));
  const loaded = loadInvariantRegistry(fileArg);
  let errors = [];
  if (loaded.error === 'registry-not-found') {
    errors = [`${relativeToCwd(loaded.path)}: invariant registry not found.`];
  } else if (loaded.error) {
    errors = [`${relativeToCwd(loaded.path)}: cannot parse registry: ${loaded.error}`];
  } else {
    errors = validateInvariantRegistry(loaded.registry, {
      label: relativeToCwd(loaded.path),
    });
  }
  const result = buildResult(loaded.path, errors);
  result.json = json;
  process.stdout.write(renderValidationResult(result));
  return mainResultToExitCode(result);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  DEFAULT_REGISTRY_PATH,
  REGISTRY_SCHEMA,
  findInvariantsForOwnerBoundary,
  indexInvariantsById,
  loadInvariantRegistry,
  validateInvariantRegistry,
};
