#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  hasConcreteText,
  isObjectRecord,
  listFiles,
  mainResultToExitCode,
  parseEmbeddedJson,
  pathExists,
  relativeToCwd,
  renderValidationResult,
  requireConcreteArray,
  requireConcreteField,
  validateEnum,
} from './system-contract-utils.js';
import {
  loadInvariantRegistry,
  validateInvariantRegistry,
} from './check-invariants.js';

const DEFAULT_CONTRACT_DIR = 'architecture/contracts';
const CONTRACT_MARKER = 'system-contract';
const CONTRACT_SCHEMA = 'system-contract-v1';
const VALID_STATUSES = Object.freeze(['active', 'draft', 'deprecated']);
const VALID_MODEL_KINDS = Object.freeze([
  'invariant-spec',
  'property-test',
  'simulator',
  'state-model',
  'decision-table',
  'statechart',
  'structural-constraint',
  'tla-spec',
]);
const HELP_TEXT = [
  'Usage: npm run model:contract-records -- [--json] [contract.md ...]',
  '',
  'Validates durable System Contract Records under architecture/contracts by default.',
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

function contractFilesFromArgs(files) {
  if (files.length > 0) {
    return files.map((filePath) => path.resolve(filePath));
  }
  return listFiles(DEFAULT_CONTRACT_DIR, {suffix: '.md', recursive: false});
}

function loadTheoryLedgerText(rootDir = process.cwd()) {
  const ledgerPath = path.resolve(rootDir, '_legacy_work/theory-ledger.md');
  if (!fs.existsSync(ledgerPath)) {
    return '';
  }
  return fs.readFileSync(ledgerPath, 'utf8');
}

function validateObjectArray(errors, filePath, fieldPath, value, requiredFields) {
  if (!Array.isArray(value)) {
    errors.push(`${filePath}: ${fieldPath} must be an array.`);
    return;
  }
  if (value.length === 0) {
    errors.push(`${filePath}: ${fieldPath} must contain at least one item.`);
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${fieldPath}[${index}]`;
    if (!isObjectRecord(entry)) {
      errors.push(`${filePath}: ${entryPath} must be an object.`);
      return;
    }
    for (const requiredField of requiredFields) {
      requireConcreteField(
        errors,
        filePath,
        `${entryPath}.${requiredField}`,
        entry[requiredField],
      );
    }
  });
}

function validateUniqueObjectField(errors, filePath, fieldPath, value, key) {
  if (!Array.isArray(value)) {
    return;
  }
  const seen = new Set();
  for (const entry of value) {
    if (!isObjectRecord(entry)) {
      continue;
    }
    const fieldValue = entry[key];
    if (!hasConcreteText(fieldValue)) {
      continue;
    }
    if (seen.has(fieldValue)) {
      errors.push(`${filePath}: ${fieldPath}.${key} contains duplicate ${fieldValue}.`);
    }
    seen.add(fieldValue);
  }
}

function validateArtifactReferences(errors, filePath, contract, rootDir) {
  for (const [index, binding] of (contract.modelBindings || []).entries()) {
    if (!isObjectRecord(binding)) {
      continue;
    }
    const artifact = binding.artifact;
    if (hasConcreteText(artifact) && !pathExists(artifact, rootDir)) {
      errors.push(
        `${filePath}: modelBindings[${index}].artifact does not exist: ${artifact}`,
      );
    }
  }
  for (const [index, binding] of (contract.runtimeBindings || []).entries()) {
    if (!isObjectRecord(binding)) {
      continue;
    }
    const runtimePath = binding.path;
    if (hasConcreteText(runtimePath) && !pathExists(runtimePath, rootDir)) {
      errors.push(
        `${filePath}: runtimeBindings[${index}].path does not exist: ${runtimePath}`,
      );
    }
  }
  for (const [index, packageRef] of (contract.packageRefs || []).entries()) {
    if (hasConcreteText(packageRef) && !pathExists(packageRef, rootDir)) {
      errors.push(`${filePath}: packageRefs[${index}] does not exist: ${packageRef}`);
    }
  }
  for (const [index, questRef] of (contract.questRefs || []).entries()) {
    if (hasConcreteText(questRef) && !pathExists(questRef, rootDir)) {
      errors.push(`${filePath}: questRefs[${index}] does not exist: ${questRef}`);
    }
  }
}

function validateTraceRefs(errors, filePath, contract) {
  const traceFields = ['questRefs', 'packageRefs'];
  let concreteRefs = 0;
  for (const field of traceFields) {
    const refs = contract[field];
    if (refs === undefined || refs === null) {
      continue;
    }
    if (!Array.isArray(refs)) {
      errors.push(`${filePath}: ${field} must be an array when present.`);
      continue;
    }
    refs.forEach((ref, index) => {
      if (!hasConcreteText(ref)) {
        errors.push(`${filePath}: ${field}[${index}] must be a non-empty string.`);
        return;
      }
      concreteRefs += 1;
    });
  }
  if (concreteRefs === 0) {
    errors.push(`${filePath}: one of questRefs or packageRefs must contain at least one trace ref.`);
  }
}

function validateTheoryLedgerRefs(errors, filePath, contract, rootDir) {
  const ledgerText = loadTheoryLedgerText(rootDir);
  if (!ledgerText) {
    return;
  }
  for (const [index, theoryRef] of (contract.theoryLedgerRefs || []).entries()) {
    if (!hasConcreteText(theoryRef)) {
      continue;
    }
    if (!ledgerText.includes(theoryRef)) {
      errors.push(
        `${filePath}: theoryLedgerRefs[${index}] is not present in _legacy_work/theory-ledger.md: ${theoryRef}`,
      );
    }
  }
}

function validateMarkdownSections(errors, filePath, content) {
  const requiredSections = [
    '## Failure Classes',
    '## Invariants',
    '## Runtime Bindings',
    '## Model Bindings',
    '## Operational Analysis',
  ];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      errors.push(`${filePath}: missing section ${section}.`);
    }
  }
}

function validateContractSystemTheory(errors, filePath, contract, rootDir) {
  const systemTheory = contract.systemTheory;
  if (systemTheory === undefined || systemTheory === null) {
    return;
  }
  if (!isObjectRecord(systemTheory)) {
    errors.push(`${filePath}: systemTheory must be an object.`);
    return;
  }
  requireConcreteField(
    errors, filePath, 'systemTheory.problemStatement',
    systemTheory.problemStatement,
  );
  requireConcreteArray(
    errors, filePath, 'systemTheory.phaseChain', systemTheory.phaseChain,
    {minLength: 2},
  );
  requireConcreteArray(
    errors, filePath, 'systemTheory.ownerBoundaryMap',
    systemTheory.ownerBoundaryMap,
  );
  requireConcreteArray(
    errors, filePath, 'systemTheory.invariantRefs',
    systemTheory.invariantRefs,
  );
  const loaded = loadInvariantRegistry(null, rootDir);
  if (loaded.error || !isObjectRecord(loaded.registry)) {
    return;
  }
  const known = new Set(
    (loaded.registry.invariants || [])
      .filter((entry) => isObjectRecord(entry) && hasConcreteText(entry.id))
      .map((entry) => entry.id),
  );
  for (const [index, ref] of (systemTheory.invariantRefs || []).entries()) {
    if (hasConcreteText(ref) && !known.has(ref)) {
      errors.push(
        `${filePath}: systemTheory.invariantRefs[${index}] is not a registered ` +
        `invariant id: ${ref}.`,
      );
    }
  }
}

function validateModelProvenRoutes(errors, filePath, contract, rootDir) {
  const routes = contract.modelProvenRoutes;
  if (routes === undefined || routes === null) {
    return;
  }
  if (!Array.isArray(routes)) {
    errors.push(`${filePath}: modelProvenRoutes must be an array.`);
    return;
  }
  routes.forEach((route, index) => {
    const routePath = `modelProvenRoutes[${index}]`;
    if (!isObjectRecord(route)) {
      errors.push(`${filePath}: ${routePath} must be an object.`);
      return;
    }
    for (const field of ['owner', 'boundary', 'selectedLayer', 'ledgerRef']) {
      requireConcreteField(errors, filePath, `${routePath}.${field}`, route[field]);
    }
    if (route.livenessHolds !== true) {
      errors.push(
        `${filePath}: ${routePath}.livenessHolds must be true — a proven route ` +
        'records a model that demonstrates the liveness property holds.',
      );
    }
    const artifact = route.evidenceArtifact;
    if (hasConcreteText(artifact) && !pathExists(artifact, rootDir)) {
      errors.push(
        `${filePath}: ${routePath}.evidenceArtifact does not exist: ${artifact}`,
      );
    }
  });
}

function validateSystemContractFile(filePath, {rootDir = process.cwd()} = {}) {
  const relativeFilePath = relativeToCwd(filePath);
  const errors = [];
  let content = '';
  let contract = null;
  try {
    content = fs.readFileSync(filePath, 'utf8');
    contract = parseEmbeddedJson(content, CONTRACT_MARKER);
  } catch (error) {
    errors.push(`${relativeFilePath}: cannot read or parse contract: ${error.message}`);
    return {contract: null, errors};
  }

  if (!isObjectRecord(contract)) {
    errors.push(
      `${relativeFilePath}: missing <!-- ${CONTRACT_MARKER} ... --> JSON block.`,
    );
    return {contract: null, errors};
  }

  requireConcreteField(errors, relativeFilePath, 'schema', contract.schema);
  if (contract.schema !== CONTRACT_SCHEMA) {
    errors.push(`${relativeFilePath}: schema must be ${CONTRACT_SCHEMA}.`);
  }
  requireConcreteField(errors, relativeFilePath, 'contractId', contract.contractId);
  validateEnum(errors, relativeFilePath, 'status', contract.status, VALID_STATUSES);
  requireConcreteArray(errors, relativeFilePath, 'failureClasses', contract.failureClasses);
  requireConcreteArray(errors, relativeFilePath, 'stateVariables', contract.stateVariables);
  requireConcreteArray(errors, relativeFilePath, 'knownResiduals', contract.knownResiduals);
  requireConcreteArray(errors, relativeFilePath, 'theoryLedgerRefs', contract.theoryLedgerRefs);
  validateTraceRefs(errors, relativeFilePath, contract);
  validateObjectArray(errors, relativeFilePath, 'owners', contract.owners, [
    'owner',
    'boundary',
  ]);
  validateObjectArray(
    errors,
    relativeFilePath,
    'safetyInvariants',
    contract.safetyInvariants,
    ['id', 'statement'],
  );
  validateObjectArray(
    errors,
    relativeFilePath,
    'livenessExpectations',
    contract.livenessExpectations,
    ['id', 'statement'],
  );
  validateObjectArray(
    errors,
    relativeFilePath,
    'runtimeBindings',
    contract.runtimeBindings,
    ['path', 'owner', 'boundary', 'transition'],
  );
  validateObjectArray(
    errors,
    relativeFilePath,
    'modelBindings',
    contract.modelBindings,
    ['kind', 'artifact', 'properties'],
  );
  validateObjectArray(errors, relativeFilePath, 'metrics', contract.metrics, [
    'name',
    'probe',
  ]);
  validateObjectArray(
    errors,
    relativeFilePath,
    'failureAnalysis.fmea',
    contract.failureAnalysis?.fmea,
    ['failureMode', 'severity', 'detectability', 'mitigation', 'probe'],
  );
  validateObjectArray(
    errors,
    relativeFilePath,
    'failureAnalysis.stpa',
    contract.failureAnalysis?.stpa,
    ['controller', 'unsafeAction', 'feedbackSignal', 'ownerBoundary'],
  );
  for (const [index, binding] of (contract.modelBindings || []).entries()) {
    if (isObjectRecord(binding)) {
      validateEnum(
        errors,
        relativeFilePath,
        `modelBindings[${index}].kind`,
        binding.kind,
        VALID_MODEL_KINDS,
      );
    }
  }
  validateUniqueObjectField(
    errors,
    relativeFilePath,
    'safetyInvariants',
    contract.safetyInvariants,
    'id',
  );
  validateUniqueObjectField(
    errors,
    relativeFilePath,
    'livenessExpectations',
    contract.livenessExpectations,
    'id',
  );
  validateArtifactReferences(errors, relativeFilePath, contract, rootDir);
  validateTheoryLedgerRefs(errors, relativeFilePath, contract, rootDir);
  validateContractSystemTheory(errors, relativeFilePath, contract, rootDir);
  validateModelProvenRoutes(errors, relativeFilePath, contract, rootDir);
  validateMarkdownSections(errors, relativeFilePath, content);
  return {contract, errors};
}

function collectContractInvariantIds(contract) {
  const ids = new Set();
  if (!isObjectRecord(contract)) {
    return ids;
  }
  const groups = [contract.safetyInvariants, contract.livenessExpectations];
  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const entry of group) {
      if (isObjectRecord(entry) && hasConcreteText(entry.id)) {
        ids.add(entry.id);
      }
    }
  }
  return ids;
}

function crossCheckRegistryAgainstContracts(errors, contractIdsByPath, rootDir) {
  const loaded = loadInvariantRegistry(null, rootDir);
  if (loaded.error === 'registry-not-found') {
    return;
  }
  const registryLabel = relativeToCwd(loaded.path);
  if (loaded.error) {
    errors.push(`${registryLabel}: cannot parse registry: ${loaded.error}`);
    return;
  }
  errors.push(...validateInvariantRegistry(loaded.registry, {
    label: registryLabel,
    rootDir,
  }));
  for (const entry of loaded.registry.invariants || []) {
    if (!isObjectRecord(entry) || !hasConcreteText(entry.contractRef)) {
      continue;
    }
    const resolvedRef = path.resolve(rootDir, entry.contractRef);
    const declaredIds = contractIdsByPath.get(resolvedRef);
    if (declaredIds && !declaredIds.has(entry.id)) {
      errors.push(
        `${registryLabel}: invariant ${entry.id} names contractRef ` +
        `${entry.contractRef}, but that record does not declare an invariant ` +
        `with id ${entry.id}.`,
      );
    }
  }
}

function validateSystemContracts(files, options = {}) {
  const errors = [];
  const checkedFiles = [];
  const contractIdsByPath = new Map();
  for (const filePath of files) {
    checkedFiles.push(relativeToCwd(filePath));
    const result = validateSystemContractFile(filePath, options);
    errors.push(...result.errors);
    contractIdsByPath.set(
      path.resolve(filePath),
      collectContractInvariantIds(result.contract),
    );
  }
  crossCheckRegistryAgainstContracts(
    errors,
    contractIdsByPath,
    options.rootDir || process.cwd(),
  );
  return {
    label: 'system-contract-check',
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
  const files = contractFilesFromArgs(args.files);
  const result = validateSystemContracts(files, {json: args.json});
  process.stdout.write(renderValidationResult(result));
  return mainResultToExitCode(result);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  CONTRACT_SCHEMA,
  validateSystemContractFile,
  validateSystemContracts,
};
