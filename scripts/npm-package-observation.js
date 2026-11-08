import {performance} from 'node:perf_hooks';
import {OBSERVATION_SCHEMA, OBSERVATION_KIND as KIND, OBSERVATION_EVENT as EVENT,
  OPERATION_OUTCOME, OBSERVATION_COMPLETENESS, OBSERVATION_OVERHEAD_SCOPE,
  OBSERVATION_STAGE, PACKAGE_ARTIFACT, SNAPSHOT_OUTCOME, PACKAGE_DIAGNOSTIC_FILES,
  SNAPSHOT_MAX_BYTES, TRACE_MAX_BYTES} from './npm-package-diagnostic-constants.js';

const RECORD_NEWLINE = '\n';
const FAILURE_SEPARATOR = ',';
const OBSERVATION_FAILURE = Object.freeze({
  SINK_SETUP_METADATA_FAILED: 'sink-setup-metadata-failed',
  UNSUPPORTED_SINK: 'unsupported-sink',
  ASYNC_SINK_UNSUPPORTED: 'async-sink-unsupported',
  OBSERVER_ALREADY_CLOSED: 'observer-already-closed',
  SINK_FAILED: 'sink-failed',
  RAW_OUTCOME_UNAVAILABLE: 'raw-outcome-unavailable',
  OPEN_STAGES: 'open-stages',
});
const TRACE_REJECTION = Object.freeze({
  INVALID_TRACE_SIZE: 'invalid-trace-size',
  TRUNCATED_TRACE: 'truncated-trace',
  RECORD_AFTER_TERMINAL: 'record-after-terminal',
  INVALID_RECORD_OR_SEQUENCE: 'invalid-record-or-sequence',
  MISSING_SESSION: 'missing-session',
  RECORD_AFTER_SESSION: 'record-after-session',
  INVALID_STAGE_BEGIN: 'invalid-stage-begin',
  INVALID_STAGE_END: 'invalid-stage-end',
  SNAPSHOT_INCOMPLETE: 'snapshot-incomplete',
  INVALID_TERMINAL: 'invalid-terminal',
  INVALID_EVENT: 'invalid-event',
  MISSING_TERMINAL: 'missing-terminal',
  OBSERVATION_INCOMPLETE: 'observation-incomplete',
  INVALID_COMMAND_OUTCOME: 'invalid-command-outcome',
  INVALID_SNAPSHOT: 'invalid-snapshot',
});
const MAX_FAILURES = 16;
const MAX_LABEL_LENGTH = 128;
const observations = new WeakMap();
const unsupportedSink = {};

function stateFor(observer) {
  const key = (typeof observer === 'function' || typeof observer === 'object') ?
    observer : unsupportedSink;
  let state = observations.get(key);
  if (!state) {
    state = {started: performance.now(), sequence: 0, nextStage: 0, stack: [],
      overheadMs: 0, failures: [], closed: false};
    observations.set(key, state);
    try {
      const overhead = observer.setupOverheadMs;
      if (Number.isFinite(overhead) && overhead >= 0) {
        state.overheadMs += overhead;
        state.started -= overhead;
      }
    } catch {
      failure(state, OBSERVATION_FAILURE.SINK_SETUP_METADATA_FAILED);
    }
    if (typeof observer !== 'function') failure(state, OBSERVATION_FAILURE.UNSUPPORTED_SINK);
    const session = {stage: OBSERVATION_STAGE.SESSION, kind: KIND.SESSION,
      stageId: ++state.nextStage, parentStageId: null, started: performance.now()};
    state.stack.push(session);
    emit(observer, state, {stage: session.stage, kind: session.kind, stageId: session.stageId,
      parentStageId: null, event: EVENT.BEGIN});
  }
  return state;
}

function failure(state, reason) {
  if (!state.failures.includes(reason) && state.failures.length < MAX_FAILURES) {
    state.failures.push(reason);
  }
}

function label(value) {
  return typeof value === 'string' ? value.slice(0, MAX_LABEL_LENGTH) : null;
}

function errorCode(error) {
  try {
    return label(error?.code);
  } catch {
    return null;
  }
}

function rejectAsyncSink(state, result) {
  if (result && typeof result.then === 'function') {
    failure(state, OBSERVATION_FAILURE.ASYNC_SINK_UNSUPPORTED);
    // Adopt the thenable immediately. Unsupported async sinks must never leak
    // an unhandled rejection, and are never awaited on the command path.
    Promise.resolve(result).catch(() => {});
  }
}

function emit(observer, state, fields) {
  const started = performance.now();
  try {
    if (state.closed) {
      failure(state, OBSERVATION_FAILURE.OBSERVER_ALREADY_CLOSED);
      return;
    }
    const record = Object.freeze({schema: OBSERVATION_SCHEMA, sequence: ++state.sequence,
      wallTime: new Date().toISOString(), elapsedMs: performance.now() - state.started,
      ...fields});
    rejectAsyncSink(state, observer(record));
  } catch {
    failure(state, OBSERVATION_FAILURE.SINK_FAILED);
  } finally {
    state.overheadMs += performance.now() - started;
  }
}

function begin(observer, stage, kind) {
  const state = stateFor(observer);
  const span = {stage: label(stage), kind, stageId: ++state.nextStage,
    parentStageId: state.stack.at(-1)?.stageId ?? null, started: performance.now()};
  state.stack.push(span);
  const {started: _started, ...identity} = span;
  emit(observer, state, {...identity, event: EVENT.BEGIN});
  return {state, span};
}

function end(observer, state, span, outcome, details = {}) {
  state.stack.pop();
  const {started, ...identity} = span;
  emit(observer, state, {...identity, event: EVENT.END, outcome,
    durationMs: performance.now() - started, ...details});
}

function rawOutcome(result) {
  return {status: Number.isInteger(result?.status) ? result.status : null,
    signal: label(result?.signal), errorCode: errorCode(result?.error)};
}

function observePackageSync(observer, stage, operation, kind = KIND.STAGE) {
  if (!observer) return operation();
  const {state, span} = begin(observer, stage, kind);
  let result;
  try {
    result = operation();
  } catch (error) {
    end(observer, state, span, OPERATION_OUTCOME.ERROR, {errorCode: errorCode(error),
      ...(kind === KIND.COMMAND ? {status: null, signal: null} : {})});
    throw error;
  }
  let details = {};
  if (kind === KIND.COMMAND) {
    try {
      details = rawOutcome(result);
    } catch {
      failure(state, OBSERVATION_FAILURE.RAW_OUTCOME_UNAVAILABLE);
    }
  }
  const outcome = kind === KIND.COMMAND && details.status !== 0 ?
    OPERATION_OUTCOME.ERROR : OPERATION_OUTCOME.SUCCESS;
  end(observer, state, span, outcome, details);
  return result;
}

async function observedAsync(observer, stage, operation) {
  const {state, span} = begin(observer, stage, KIND.STAGE);
  try {
    const result = await operation();
    end(observer, state, span, OPERATION_OUTCOME.SUCCESS);
    return result;
  } catch (error) {
    end(observer, state, span, OPERATION_OUTCOME.ERROR, {errorCode: errorCode(error)});
    throw error;
  }
}

// Deliberately not async: the disabled path returns the operation's own promise.
function observePackageAsync(observer, stage, operation) {
  return observer ? observedAsync(observer, stage, operation) : operation();
}

function snapshotPackageObservation(observer, artifact, source) {
  if (!observer) return;
  const state = stateFor(observer);
  const started = performance.now();
  let details;
  try {
    if (state.closed) {
      failure(state, OBSERVATION_FAILURE.OBSERVER_ALREADY_CLOSED);
      return;
    }
    if (typeof observer.snapshot !== 'function') return;
    const result = observer.snapshot(artifact, source);
    rejectAsyncSink(state, result);
    const bytes = result?.bytes;
    details = {snapshotOutcome: label(result?.outcome),
      bytes: Number.isFinite(bytes) ? bytes : 0};
    const completeOutcomes = [SNAPSHOT_OUTCOME.SAVED, SNAPSHOT_OUTCOME.OPTIONAL_MISSING];
    if (!completeOutcomes.includes(details.snapshotOutcome)) {
      failure(state, `snapshot-${artifact}-incomplete`);
    }
  } catch {
    failure(state, `snapshot-${artifact}-failed`);
    details = {snapshotOutcome: SNAPSHOT_OUTCOME.ERROR, bytes: 0};
  } finally {
    state.overheadMs += performance.now() - started;
  }
  emit(observer, state, {kind: KIND.SNAPSHOT, event: EVENT.SNAPSHOT, artifact,
    parentStageId: state.stack.at(-1)?.stageId ?? null, ...details});
}

function finishPackageObservation(observer) {
  if (!observer) return null;
  const state = stateFor(observer);
  if (state.closed) {
    failure(state, OBSERVATION_FAILURE.OBSERVER_ALREADY_CLOSED);
  } else {
    if (state.stack.length !== 1) failure(state, OBSERVATION_FAILURE.OPEN_STAGES);
    else end(observer, state, state.stack[0], OPERATION_OUTCOME.SUCCESS);
    emit(observer, state, {kind: KIND.TERMINAL, event: EVENT.TERMINAL,
      outcome: state.failures.length ?
        OBSERVATION_COMPLETENESS.INCOMPLETE : OBSERVATION_COMPLETENESS.COMPLETE,
      failures: state.failures.join(FAILURE_SEPARATOR), overheadMs: state.overheadMs,
      overheadScope: OBSERVATION_OVERHEAD_SCOPE});
    state.closed = true;
  }
  const status = Object.freeze({complete: state.failures.length === 0,
    failures: state.failures.join(FAILURE_SEPARATOR),
    overheadMs: state.overheadMs, closed: state.closed});
  if (!status.complete) {
    try {
      process.stderr.write(`npm package observation incomplete: ${status.failures}\n`);
    } catch {
      // A broken warning destination cannot replace the package outcome.
    }
  }
  return status;
}

function validatePackageObservation(text, {requiredStages = []} = {}) {
  const validation = {outcome: OBSERVATION_COMPLETENESS.COMPLETE, reasons: []};
  const reject = (reason) => {
    validation.outcome = OBSERVATION_COMPLETENESS.INCOMPLETE;
    validation.reasons.push(reason);
  };
  const stack = [];
  const stageIds = new Set();
  const endedStages = new Set();
  const snapshots = new Set();
  let sequence = 0;
  let elapsedMs = -1;
  let terminal = null;
  let sessionEnded = false;
  if (typeof text !== 'string' || Buffer.byteLength(text) > TRACE_MAX_BYTES) {
    return {complete: false, reasons: [TRACE_REJECTION.INVALID_TRACE_SIZE], terminal};
  }
  if (!text.endsWith(RECORD_NEWLINE)) reject(TRACE_REJECTION.TRUNCATED_TRACE);
  try {
    for (const line of text.trimEnd().split(RECORD_NEWLINE)) {
      const record = JSON.parse(line);
      if (terminal) throw new Error(TRACE_REJECTION.RECORD_AFTER_TERMINAL);
      if (record?.schema !== OBSERVATION_SCHEMA || record.sequence !== ++sequence ||
        !Number.isFinite(record.elapsedMs) || record.elapsedMs < elapsedMs ||
        !Number.isFinite(Date.parse(record.wallTime)) ||
        Object.values(record).some((value) => value !== null &&
          typeof value !== 'number' && typeof value !== 'string')) {
        throw new Error(TRACE_REJECTION.INVALID_RECORD_OR_SEQUENCE);
      }
      elapsedMs = record.elapsedMs;
      if (sequence === 1 && (record.event !== EVENT.BEGIN ||
        record.kind !== KIND.SESSION || record.stage !== OBSERVATION_STAGE.SESSION)) {
        throw new Error(TRACE_REJECTION.MISSING_SESSION);
      }
      if (sessionEnded && record.event !== EVENT.TERMINAL) {
        throw new Error(TRACE_REJECTION.RECORD_AFTER_SESSION);
      }
      if (record.event === EVENT.BEGIN) {
        if (!Number.isInteger(record.stageId) || record.stageId < 1 ||
          stageIds.has(record.stageId) || typeof record.stage !== 'string' ||
          ![KIND.STAGE, KIND.COMMAND, KIND.SESSION].includes(record.kind) ||
          (record.kind === KIND.SESSION && sequence !== 1) ||
          record.parentStageId !== (stack.at(-1)?.stageId ?? null)) {
          throw new Error(TRACE_REJECTION.INVALID_STAGE_BEGIN);
        }
        stageIds.add(record.stageId);
        stack.push(record);
      } else if (record.event === EVENT.END) {
        const opened = stack.pop();
        if (!opened || opened.stageId !== record.stageId || opened.stage !== record.stage ||
          opened.kind !== record.kind || opened.parentStageId !== record.parentStageId ||
          ![OPERATION_OUTCOME.SUCCESS, OPERATION_OUTCOME.ERROR].includes(record.outcome) ||
          !Number.isFinite(record.durationMs) || record.durationMs < 0) {
          throw new Error(TRACE_REJECTION.INVALID_STAGE_END);
        }
        endedStages.add(record.stage);
        if (record.kind === KIND.COMMAND) validateCommandRecord(record);
        if (record.kind === KIND.SESSION) sessionEnded = true;
      } else if (record.event === EVENT.SNAPSHOT) {
        validateSnapshotRecord(record, stack, snapshots);
        if (record.snapshotOutcome !== SNAPSHOT_OUTCOME.SAVED &&
          !(record.artifact === PACKAGE_ARTIFACT.INSTALLED_LOCK &&
            record.snapshotOutcome === SNAPSHOT_OUTCOME.OPTIONAL_MISSING)) {
          reject(TRACE_REJECTION.SNAPSHOT_INCOMPLETE);
        }
      } else if (record.event === EVENT.TERMINAL) {
        if (record.kind !== KIND.TERMINAL || !sessionEnded || stack.length ||
          endedStages.size < 2 || !Number.isFinite(record.overheadMs) ||
          record.overheadMs < 0 || typeof record.failures !== 'string' ||
          !Object.values(OBSERVATION_COMPLETENESS).includes(record.outcome) ||
          record.overheadScope !== OBSERVATION_OVERHEAD_SCOPE) {
          throw new Error(TRACE_REJECTION.INVALID_TERMINAL);
        }
        terminal = record;
      } else {
        throw new Error(TRACE_REJECTION.INVALID_EVENT);
      }
    }
  } catch (error) {
    reject(error.message);
  }
  if (stack.length) reject(OBSERVATION_FAILURE.OPEN_STAGES);
  if (!terminal) reject(TRACE_REJECTION.MISSING_TERMINAL);
  else if (terminal.outcome !== OBSERVATION_COMPLETENESS.COMPLETE || terminal.failures !== '') {
    reject(TRACE_REJECTION.OBSERVATION_INCOMPLETE);
  }
  for (const stage of requiredStages) {
    if (!endedStages.has(stage)) reject(`missing-required-stage:${stage}`);
  }
  return {complete: validation.outcome === OBSERVATION_COMPLETENESS.COMPLETE,
    reasons: validation.reasons, terminal};
}

function validateCommandRecord(record) {
  const nullableString = (value) => value === null || typeof value === 'string';
  if (!(record.status === null || (Number.isInteger(record.status) && record.status >= 0)) ||
    !nullableString(record.signal) || !nullableString(record.errorCode) ||
    ((record.status === 0) !== (record.outcome === OPERATION_OUTCOME.SUCCESS)) ||
    (record.status === 0 && (record.signal !== null || record.errorCode !== null))) {
    throw new Error(TRACE_REJECTION.INVALID_COMMAND_OUTCOME);
  }
}

function validateSnapshotRecord(record, stack, snapshots) {
  if (record.kind !== KIND.SNAPSHOT || !stack.length ||
    record.parentStageId !== stack.at(-1).stageId || record.artifact === PACKAGE_ARTIFACT.TRACE ||
    !Object.hasOwn(PACKAGE_DIAGNOSTIC_FILES, record.artifact) || snapshots.has(record.artifact) ||
    !Object.values(SNAPSHOT_OUTCOME).includes(record.snapshotOutcome) ||
    !Number.isInteger(record.bytes) || record.bytes < 0 || record.bytes > SNAPSHOT_MAX_BYTES ||
    (record.snapshotOutcome !== SNAPSHOT_OUTCOME.SAVED && record.bytes !== 0)) {
    throw new Error(TRACE_REJECTION.INVALID_SNAPSHOT);
  }
  snapshots.add(record.artifact);
}

export {finishPackageObservation, observePackageAsync, observePackageSync,
  snapshotPackageObservation, validatePackageObservation};
