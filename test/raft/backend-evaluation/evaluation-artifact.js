// The one evaluation artifact this quest produces, and the loader every
// receipt that speaks about it shares.
//
// `solve/epics/formation-seed-decoupling/raft-backend-evaluation.json` is the
// machine-readable record; the `.md` beside it is generated from it and never
// edited by hand. Until the scenarios have run there is nothing to record, so
// the loader fails closed with a named reason and the receipts that depend on
// it stay red.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ARTIFACT = Object.freeze({
  JSON_PATH:
    'solve/epics/formation-seed-decoupling/raft-backend-evaluation.json',
  MARKDOWN_PATH:
    'solve/epics/formation-seed-decoupling/raft-backend-evaluation.md',
  UTF8: 'utf8',
  NOT_WRITTEN:
    'the evaluation artifact has not been written yet (no scenario has ' +
    'produced results): ',
  MALFORMED: 'the evaluation artifact is not valid JSON: ',
  // The three conclusions the quest must derive independently.
  VERDICT_KEYS: Object.freeze([
    'consensusCore', 'wasmBoundary', 'lagrangeMigration']),
  // The only verdict values a derivation may produce. The last one exists so
  // a question this quest cannot answer is answered honestly rather than
  // inflated: integrating a backend is the next stage, not this one.
  VERDICT_VALUES: Object.freeze(['viable', 'viable-with-named-gaps',
    'not-viable', 'undetermined-needs-integration-stage']),
});

// The artifact is regenerated and compared byte for byte against the
// committed one, EXCEPT these keys. Every one of them is a wall-clock or
// linear-memory MEASUREMENT: a nanosecond figure or a WASM page count cannot
// be byte-stable across two runs, and demanding that it were would make the
// receipt flaky rather than substantive. The comparison still requires each
// of them to be present and of the same type on both sides, so a measurement
// cannot be deleted or turned into a string to slip past the check.
//
// Everything else - every verdict, every input, every scenario record, every
// boundary fact, every signature, every named gap - must be identical.
const MEASUREMENT_KEYS = Object.freeze({
  'generatedAt': 'string',
  'createNanosPerGroup': 'number',
  'idleTickNanosPerGroup': 'number',
  'hasReadyScanNanosPerGroup': 'number',
  'readyCycleNanosPerGroup': 'number',
  'confChangeNanos': 'number',
  'runtimeBytesAtStart': 'number',
  'incrementalBytesBound': 'number',
  'bytesPerGroupBound': 'number',
  'memoryBefore': 'number',
  'memoryAfter': 'number',
  'growthBytes': 'number',
  'bytesPerFatalBound': 'number',
  // Round 3: the fatal budget and what recovery costs. The budget is a
  // MEASUREMENT the brief requires to be recorded as measured rather than
  // as a constant - two runs gave 299 and 304 - and the recovery figures
  // are wall-clock and linear memory.
  'fatalsBeforeTheRuntimeDied': 'number',
  'linearMemoryGrowthBytes': 'number',
  'recoveryNanos': 'number',
  'recoveryNanosPerGroup': 'number',
  'recoveryMemoryBytes': 'number',
});

const MEASUREMENT_PLACEHOLDER = '<measurement>';

/**
 * Replace every measurement value with a placeholder, and collect where each
 * one was and what type it held, so the comparison can check the types
 * separately from the structure.
 * @param {*} value
 * @param {string} [at] the path walked so far
 * @param {Array<Object>} [found] accumulator
 * @return {{redacted: *, found: Array<Object>}}
 */
function redactMeasurements(value, at = '', found = []) {
  if (Array.isArray(value)) {
    return {
      redacted: value.map((entry, index) =>
        redactMeasurements(entry, `${at}/${index}`, found).redacted),
      found,
    };
  }
  if (!value || typeof value !== 'object') {
    return {redacted: value, found};
  }
  const redacted = {};
  for (const [key, held] of Object.entries(value)) {
    if (Object.hasOwn(MEASUREMENT_KEYS, key)) {
      found.push({at: `${at}/${key}`, key, type: typeof held});
      redacted[key] = MEASUREMENT_PLACEHOLDER;
      continue;
    }
    redacted[key] = redactMeasurements(held, `${at}/${key}`, found).redacted;
  }
  return {redacted, found};
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function artifactPath(relative) {
  return path.join(repositoryRoot, relative);
}

/**
 * Read the evaluation artifact, failing closed with a named reason.
 * @return {Object} the parsed artifact
 */
function loadEvaluationArtifact() {
  const absolute = artifactPath(ARTIFACT.JSON_PATH);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${ARTIFACT.NOT_WRITTEN}${ARTIFACT.JSON_PATH}`);
  }
  const text = fs.readFileSync(absolute, ARTIFACT.UTF8);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${ARTIFACT.MALFORMED}${String(error?.message || error)}`);
  }
}

/**
 * Read the generated markdown rendering of the artifact.
 * @return {string}
 */
function loadEvaluationMarkdown() {
  const absolute = artifactPath(ARTIFACT.MARKDOWN_PATH);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${ARTIFACT.NOT_WRITTEN}${ARTIFACT.MARKDOWN_PATH}`);
  }
  return fs.readFileSync(absolute, ARTIFACT.UTF8);
}

export {
  ARTIFACT,
  MEASUREMENT_KEYS,
  artifactPath,
  loadEvaluationArtifact,
  loadEvaluationMarkdown,
  redactMeasurements,
  repositoryRoot,
};
