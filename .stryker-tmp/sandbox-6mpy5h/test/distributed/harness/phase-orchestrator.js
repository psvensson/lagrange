// @ts-nocheck
import {
  PHASE_EVENT_TYPE,
  PHASE_STATUS,
  SCENARIO_PHASE,
  SCENARIO_PHASE_SEQUENCE,
} from './constants.js';

const ZERO = 0;
const ONE = 1;
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);
const SKIPPED_PHASE_ERROR = 'skipped_due_to_previous_failure';
const PHASE_PROGRESS_ARTIFACT_FIELD = 'phaseProgress';
const PHASE_PROGRESS_EVENT_FIELDS = Object.freeze([
  'message',
  'details',
  'timestampMs',
]);

function normalizeErrorMessage(error) {
  if (typeof error?.message === 'string' && error.message.length > ZERO) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > ZERO) {
    return error;
  }
  return 'unknown phase error';
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => String(value));
}

function normalizePhaseStatus(status) {
  if (status === PHASE_STATUS.OK ||
      status === PHASE_STATUS.WARN ||
      status === PHASE_STATUS.FAIL ||
      status === PHASE_STATUS.SKIPPED) {
    return status;
  }
  return PHASE_STATUS.OK;
}

function normalizePhaseResult(phase, result, startedAtMs, endedAtMs) {
  const candidate = result && typeof result === 'object' ? result : EMPTY_OBJECT;
  const normalizedStatus = normalizePhaseStatus(candidate.status);
  const normalizedArtifacts =
    candidate.artifacts && typeof candidate.artifacts === 'object' ?
      candidate.artifacts :
      EMPTY_OBJECT;

  return {
    phase,
    status: normalizedStatus,
    durationMs: Math.max(ZERO, endedAtMs - startedAtMs),
    artifacts: normalizedArtifacts,
    warnings: normalizeStringArray(candidate.warnings || EMPTY_ARRAY),
    errors: normalizeStringArray(candidate.errors || EMPTY_ARRAY),
    startedAtMs,
    endedAtMs,
  };
}

function cloneEventPayload(event) {
  return {
    ...(typeof event?.message === 'string' && event.message.length > ZERO ?
      {message: event.message} :
      {}),
    ...(event?.details && typeof event.details === 'object' &&
      !Array.isArray(event.details) ?
      {details: {...event.details}} :
      {}),
    timestampMs: Number.isFinite(event?.timestampMs) ?
      event.timestampMs :
      Date.now(),
  };
}

function createPhaseProgressTelemetry() {
  return {
    heartbeatCount: ZERO,
    lastProgressEvent: null,
    lastMeaningfulChange: null,
    noProgressWarnings: [],
    failedNoProgress: null,
  };
}

function buildPhaseProgressArtifact(telemetry) {
  const heartbeatCount = Number(telemetry?.heartbeatCount || ZERO);
  const noProgressWarnings = Array.isArray(telemetry?.noProgressWarnings) ?
    telemetry.noProgressWarnings.map((event) => cloneEventPayload(event)) :
    [];
  const artifact = {
    heartbeatCount,
    noProgressWarningCount: noProgressWarnings.length,
  };
  if (telemetry?.lastProgressEvent) {
    artifact.lastProgressEvent = cloneEventPayload(telemetry.lastProgressEvent);
  }
  if (telemetry?.lastMeaningfulChange) {
    artifact.lastMeaningfulChange = cloneEventPayload(
      telemetry.lastMeaningfulChange,
    );
  }
  if (noProgressWarnings.length > ZERO) {
    artifact.noProgressWarnings = noProgressWarnings;
  }
  if (telemetry?.failedNoProgress) {
    artifact.failedNoProgress = cloneEventPayload(telemetry.failedNoProgress);
  }
  return artifact;
}

function mergePhaseArtifacts(candidateArtifacts, phaseProgressArtifact) {
  const normalizedArtifacts =
    candidateArtifacts && typeof candidateArtifacts === 'object' ?
      candidateArtifacts :
      EMPTY_OBJECT;
  const hasPhaseProgressArtifact =
    phaseProgressArtifact.heartbeatCount > ZERO ||
    phaseProgressArtifact.noProgressWarningCount > ZERO ||
    phaseProgressArtifact.lastProgressEvent !== undefined ||
    phaseProgressArtifact.lastMeaningfulChange !== undefined ||
    phaseProgressArtifact.failedNoProgress !== undefined;
  if (!hasPhaseProgressArtifact) {
    return normalizedArtifacts;
  }
  return {
    ...normalizedArtifacts,
    [PHASE_PROGRESS_ARTIFACT_FIELD]: phaseProgressArtifact,
  };
}

function buildSkippedPhaseResult(phase) {
  const now = Date.now();
  return {
    phase,
    status: PHASE_STATUS.SKIPPED,
    durationMs: ZERO,
    artifacts: EMPTY_OBJECT,
    warnings: EMPTY_ARRAY,
    errors: [SKIPPED_PHASE_ERROR],
    startedAtMs: now,
    endedAtMs: now,
  };
}

function computeOverallStatus(results) {
  let hasWarn = false;
  for (const phaseResult of results) {
    if (phaseResult.status === PHASE_STATUS.FAIL) {
      return PHASE_STATUS.FAIL;
    }
    if (phaseResult.status === PHASE_STATUS.WARN) {
      hasWarn = true;
    }
  }
  if (hasWarn) {
    return PHASE_STATUS.WARN;
  }
  return PHASE_STATUS.OK;
}

function validatePhaseTransition(previousPhase, nextPhase) {
  const previousIndex = SCENARIO_PHASE_SEQUENCE.indexOf(previousPhase);
  const nextIndex = SCENARIO_PHASE_SEQUENCE.indexOf(nextPhase);
  if (previousIndex === -1 || nextIndex === -1) {
    throw new Error(
      'Illegal phase transition: unknown phase in transition ' +
      previousPhase + ' -> ' + nextPhase,
    );
  }
  if (nextIndex !== previousIndex + ONE) {
    throw new Error(
      'Illegal phase transition: ' + previousPhase +
      ' -> ' + nextPhase,
    );
  }
}

function validatePhaseSequence(sequence) {
  if (!Array.isArray(sequence) || sequence.length === ZERO) {
    throw new Error('Phase sequence must contain at least one phase');
  }
  for (let index = ONE; index < sequence.length; index++) {
    validatePhaseTransition(sequence[index - ONE], sequence[index]);
  }
}

class PhaseOrchestrator {
  constructor(options = {}) {
    this._phaseSequence = Array.isArray(options.phaseSequence) &&
      options.phaseSequence.length > ZERO ?
      [...options.phaseSequence] :
      [...SCENARIO_PHASE_SEQUENCE];
    this._onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  }

  getPhaseSequence() {
    return [...this._phaseSequence];
  }

  async run(phaseHandlers = {}, context = {}) {
    validatePhaseSequence(this._phaseSequence);

    const results = [];
    let skipUntilTeardown = false;

    for (const phase of this._phaseSequence) {
      if (skipUntilTeardown && phase !== SCENARIO_PHASE.TEARDOWN) {
        results.push(buildSkippedPhaseResult(phase));
        continue;
      }

      const phaseResult = await this._runOnePhase(phase, phaseHandlers, context);
      results.push(phaseResult);

      if (phaseResult.status === PHASE_STATUS.FAIL &&
          phase !== SCENARIO_PHASE.TEARDOWN) {
        skipUntilTeardown = true;
      }
    }

    return {
      status: computeOverallStatus(results),
      phases: results,
    };
  }

  async _runOnePhase(phase, phaseHandlers, context) {
    const startedAtMs = Date.now();
    const phaseProgressTelemetry = createPhaseProgressTelemetry();
    this._emitEvent({
      type: PHASE_EVENT_TYPE.START,
      phase,
      timestampMs: startedAtMs,
    });

    let rawResult;
    try {
      rawResult = await this._invokePhaseHandler(
        phase,
        phaseHandlers,
        context,
        phaseProgressTelemetry,
      );
    } catch (error) {
      rawResult = {
        status: PHASE_STATUS.FAIL,
        errors: [normalizeErrorMessage(error)],
      };
    }

    const endedAtMs = Date.now();
    const normalizedResult = normalizePhaseResult(
      phase,
      rawResult,
      startedAtMs,
      endedAtMs,
    );
    normalizedResult.artifacts = mergePhaseArtifacts(
      normalizedResult.artifacts,
      buildPhaseProgressArtifact(phaseProgressTelemetry),
    );

    this._emitEvent({
      type: PHASE_EVENT_TYPE.END,
      phase,
      status: normalizedResult.status,
      durationMs: normalizedResult.durationMs,
      timestampMs: endedAtMs,
    });

    return normalizedResult;
  }

  async _invokePhaseHandler(phase, phaseHandlers, context, phaseProgressTelemetry) {
    if (!phaseHandlers || typeof phaseHandlers !== 'object') {
      return {
        status: PHASE_STATUS.OK,
      };
    }
    const handler = phaseHandlers[phase];
    if (typeof handler !== 'function') {
      return {
        status: PHASE_STATUS.OK,
      };
    }
    const phaseContext = {
      ...(context && typeof context === 'object' ? context : EMPTY_OBJECT),
      phase,
      emitPhaseProgress: (event = EMPTY_OBJECT) =>
        this._recordPhaseEvent(
          phase,
          PHASE_EVENT_TYPE.PROGRESS,
          event,
          phaseProgressTelemetry,
        ),
      emitPhaseLastMeaningfulChange: (event = EMPTY_OBJECT) =>
        this._recordPhaseEvent(
          phase,
          PHASE_EVENT_TYPE.LAST_MEANINGFUL_CHANGE,
          event,
          phaseProgressTelemetry,
        ),
      emitPhaseNoProgressWarning: (event = EMPTY_OBJECT) =>
        this._recordPhaseEvent(
          phase,
          PHASE_EVENT_TYPE.NO_PROGRESS_WARNING,
          event,
          phaseProgressTelemetry,
        ),
      emitPhaseFailedNoProgress: (event = EMPTY_OBJECT) =>
        this._recordPhaseEvent(
          phase,
          PHASE_EVENT_TYPE.FAILED_NO_PROGRESS,
          event,
          phaseProgressTelemetry,
        ),
    };
    return handler(phaseContext);
  }

  _emitEvent(event) {
    if (!this._onEvent) {
      return;
    }
    this._onEvent(event);
  }

  _recordPhaseEvent(phase, type, event, phaseProgressTelemetry) {
    const timestampMs = Number.isFinite(event?.timestampMs) ?
      event.timestampMs :
      Date.now();
    const payload = {
      type,
      phase,
      timestampMs,
    };
    for (const field of PHASE_PROGRESS_EVENT_FIELDS) {
      if (field === 'timestampMs') {
        continue;
      }
      if (field === 'details' &&
          event?.details &&
          typeof event.details === 'object' &&
          !Array.isArray(event.details)) {
        payload.details = {...event.details};
        continue;
      }
      if (typeof event?.[field] === 'string' && event[field].length > ZERO) {
        payload[field] = event[field];
      }
    }

    if (type === PHASE_EVENT_TYPE.PROGRESS) {
      phaseProgressTelemetry.heartbeatCount += ONE;
      phaseProgressTelemetry.lastProgressEvent = payload;
    } else if (type === PHASE_EVENT_TYPE.LAST_MEANINGFUL_CHANGE) {
      phaseProgressTelemetry.lastMeaningfulChange = payload;
      phaseProgressTelemetry.lastProgressEvent = payload;
    } else if (type === PHASE_EVENT_TYPE.NO_PROGRESS_WARNING) {
      phaseProgressTelemetry.noProgressWarnings.push(payload);
    } else if (type === PHASE_EVENT_TYPE.FAILED_NO_PROGRESS) {
      phaseProgressTelemetry.failedNoProgress = payload;
    }

    this._emitEvent(payload);
    return payload;
  }
}

export {PhaseOrchestrator, validatePhaseSequence, validatePhaseTransition};
