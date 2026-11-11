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

const TRACE_ACTOR = Object.freeze({OWNER: 'owner', OBSERVER: 'observer', WAKE: 'wake'});

const DEFAULT_TRACE_DIRS = Object.freeze([
  'architecture/models/traces',
]);
const TRACE_SUITE_SCHEMA = 'owner-trace-suite-v1';
const HELP_TEXT = [
  'Usage: npm run model:owner-traces -- [--json] [trace-suite.json ...]',
  '',
  'Validates owner trace suites. Valid traces must satisfy every invariant;',
  'forbidden traces must produce the declared invariant violations.',
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

function traceFilesFromArgs(files) {
  if (files.length > 0) {
    return files.map((filePath) => path.resolve(filePath));
  }
  return DEFAULT_TRACE_DIRS.flatMap((dirPath) =>
    listFiles(dirPath, {suffix: '.json', recursive: false}));
}

function normalizeInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function recordOwnerTraceEvent(state, event, action) {
  if (action === 'serviceable' && event.service === 'sql') {
    state.sqlServiceable = true;
  } else if (action === 'serviceable' && event.service === 'query_transport') {
    state.queryServiceable = true;
  } else if (action === 'owner_outcome') {
    state.ownerOutcomeSeen = true;
    state.latestOutcome = event.outcome || null;
    state.ownerEpoch = normalizeInteger(event.ownerEpoch);
  } else if (action === 'fresh_projection') {
    state.observedEpoch = normalizeInteger(event.observedEpoch);
  } else if (action === 'durable_transition' && event.followUpRequired === true) {
    const epoch = normalizeInteger(event.ownerEpoch);
    if (epoch !== null) state.pendingWakeEpochs.add(epoch);
  }
}

function recordReadinessViolations(state, violations) {
  if (state.latestOutcome !== 'ready') {
    violations.add('owner-outcome-before-observer');
  }
  if (state.ownerEpoch === null || state.observedEpoch !== state.ownerEpoch) {
    violations.add('stale-projection-never-promotes-readiness');
  }
  if (!state.sqlServiceable || !state.queryServiceable) {
    violations.add('ready-requires-serviceable-canonical-leader');
  }
}

function recordObserverTraceEvent(state, action, violations) {
  if (action === 'projection') {
    if (!state.ownerOutcomeSeen) {
      violations.add('owner-outcome-before-observer');
    }
    for (const epoch of state.pendingWakeEpochs) {
      if (!state.wakeEpochs.has(epoch)) {
        violations.add('durable-transition-has-recoverable-wake');
      }
    }
  } else if (action === 'readiness_promoted') {
    recordReadinessViolations(state, violations);
  } else if (action === 'repair_authority') {
    violations.add('readers-do-not-repair-authority');
  }
}

function collectTraceViolations(trace) {
  const violations = new Set();
  const state = {
    ownerOutcomeSeen: false,
    latestOutcome: null,
    ownerEpoch: null,
    observedEpoch: null,
    sqlServiceable: false,
    queryServiceable: false,
    pendingWakeEpochs: new Set(),
    wakeEpochs: new Set(),
  };
  for (const event of trace.events || []) {
    const action = event?.action;
    const actor = event?.actor;
    if (actor === TRACE_ACTOR.OWNER) {
      recordOwnerTraceEvent(state, event, action);
    } else if (actor === TRACE_ACTOR.WAKE && action === 'wake_enqueued') {
      const epoch = normalizeInteger(event.ownerEpoch);
      if (epoch !== null) state.wakeEpochs.add(epoch);
    } else if (actor === TRACE_ACTOR.OBSERVER) {
      recordObserverTraceEvent(state, action, violations);
    }
  }
  return [...violations].sort();
}

function validateTraceShape(errors, filePath, tracePath, trace) {
  if (!isObjectRecord(trace)) {
    errors.push(`${filePath}: ${tracePath} must be an object.`);
    return;
  }
  requireConcreteField(errors, filePath, `${tracePath}.id`, trace.id);
  requireConcreteArray(errors, filePath, `${tracePath}.events`, trace.events, {
    allowObjects: true,
  });
  for (const [index, event] of (trace.events || []).entries()) {
    const eventPath = `${tracePath}.events[${index}]`;
    if (!isObjectRecord(event)) {
      errors.push(`${filePath}: ${eventPath} must be an object.`);
      continue;
    }
    requireConcreteField(errors, filePath, `${eventPath}.actor`, event.actor);
    requireConcreteField(errors, filePath, `${eventPath}.action`, event.action);
  }
}

function validateInvariantShape(errors, filePath, suite) {
  requireConcreteArray(errors, filePath, 'invariants', suite.invariants, {
    allowObjects: true,
  });
  const ids = [];
  for (const [index, invariant] of (suite.invariants || []).entries()) {
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
    if (hasConcreteText(invariant.id)) ids.push(invariant.id);
  }
  if (!uniqueValues(ids)) {
    errors.push(`${filePath}: invariants contains duplicate ids.`);
  }
  return new Set(ids);
}

function validateTraceSuite(filePath) {
  const relativeFilePath = relativeToCwd(filePath);
  const errors = [];
  let suite = null;
  try {
    suite = readJsonFile(filePath);
  } catch (error) {
    errors.push(`${relativeFilePath}: cannot parse JSON: ${error.message}`);
    return {suite: null, errors};
  }
  if (!isObjectRecord(suite)) {
    errors.push(`${relativeFilePath}: trace suite must be a JSON object.`);
    return {suite: null, errors};
  }
  requireConcreteField(errors, relativeFilePath, 'schema', suite.schema);
  if (suite.schema !== TRACE_SUITE_SCHEMA) {
    errors.push(`${relativeFilePath}: schema must be ${TRACE_SUITE_SCHEMA}.`);
  }
  for (const field of ['id', 'owner', 'boundary']) {
    requireConcreteField(errors, relativeFilePath, field, suite[field]);
  }
  const invariantIds = validateInvariantShape(errors, relativeFilePath, suite);
  requireConcreteArray(errors, relativeFilePath, 'validTraces', suite.validTraces, {
    allowObjects: true,
  });
  requireConcreteArray(
    errors,
    relativeFilePath,
    'forbiddenTraces',
    suite.forbiddenTraces,
    {allowObjects: true},
  );

  for (const [index, trace] of (suite.validTraces || []).entries()) {
    const tracePath = `validTraces[${index}]`;
    validateTraceShape(errors, relativeFilePath, tracePath, trace);
    const violations = collectTraceViolations(trace);
    if (violations.length > 0) {
      errors.push(
        `${relativeFilePath}: ${tracePath} violates ${violations.join(', ')}.`,
      );
    }
  }

  for (const [index, trace] of (suite.forbiddenTraces || []).entries()) {
    const tracePath = `forbiddenTraces[${index}]`;
    validateTraceShape(errors, relativeFilePath, tracePath, trace);
    requireConcreteArray(
      errors,
      relativeFilePath,
      `${tracePath}.expectedViolations`,
      trace?.expectedViolations,
    );
    for (const invariantId of trace?.expectedViolations || []) {
      if (hasConcreteText(invariantId) && !invariantIds.has(invariantId)) {
        errors.push(
          `${relativeFilePath}: ${tracePath}.expectedViolations contains ` +
          `unknown invariant id: ${invariantId}.`,
        );
      }
    }
    const violations = collectTraceViolations(trace);
    for (const invariantId of trace?.expectedViolations || []) {
      if (hasConcreteText(invariantId) && !violations.includes(invariantId)) {
        errors.push(
          `${relativeFilePath}: ${tracePath} did not violate expected ` +
          `invariant ${invariantId}.`,
        );
      }
    }
  }
  return {suite, errors};
}

function validateTraceSuites(files, options = {}) {
  const checkedFiles = [];
  const errors = [];
  for (const filePath of files) {
    checkedFiles.push(relativeToCwd(filePath));
    errors.push(...validateTraceSuite(filePath).errors);
  }
  return {
    label: 'model-owner-traces',
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
  const result = validateTraceSuites(traceFilesFromArgs(args.files), {
    json: args.json,
  });
  process.stdout.write(renderValidationResult(result));
  return mainResultToExitCode(result);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  TRACE_SUITE_SCHEMA,
  collectTraceViolations,
  validateTraceSuite,
  validateTraceSuites,
};
