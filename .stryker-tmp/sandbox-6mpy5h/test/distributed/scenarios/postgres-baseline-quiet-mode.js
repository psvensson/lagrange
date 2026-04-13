// @ts-nocheck
const ZERO = 0;

const QUIET_MODE_SCHEMA_VERSION = 1;
const QUIET_MODE_STATUS_ACTIVE = 'active';
const QUIET_MODE_STATUS_INACTIVE = 'inactive';
const QUIET_MODE_ACTION_ENTER = 'enter';
const QUIET_MODE_ACTION_EXIT = 'exit';

function normalizeActivePhases(value) {
  const configuredActivePhases = Array.isArray(value) ? value : [];
  return [...new Set(configuredActivePhases
    .map((phase) => String(phase || '').trim())
    .filter((phase) => phase.length > ZERO))];
}

function createQuietModeState(options = {}) {
  return {
    schemaVersion: QUIET_MODE_SCHEMA_VERSION,
    enabled: options.enabled === true,
    status: QUIET_MODE_STATUS_INACTIVE,
    enteredAtMs: null,
    exitedAtMs: null,
    activePhases: normalizeActivePhases(options.activePhases),
    activeDuringPhases: [],
    lifecycle: [],
  };
}

function addQuietModeActivePhase(quietModeState, phase) {
  if (!quietModeState || quietModeState.enabled !== true) {
    return;
  }
  const normalizedPhase = String(phase || '').trim();
  if (normalizedPhase.length === ZERO) {
    return;
  }
  if (!quietModeState.activePhases.includes(normalizedPhase)) {
    return;
  }
  if (!quietModeState.activeDuringPhases.includes(normalizedPhase)) {
    quietModeState.activeDuringPhases.push(normalizedPhase);
  }
}

function appendQuietModeLifecycleEvent(quietModeState, action, phase, reason) {
  if (!quietModeState || quietModeState.enabled !== true) {
    return;
  }
  quietModeState.lifecycle.push({
    action,
    phase,
    reason,
    timestampMs: Date.now(),
  });
}

function enterQuietMode(quietModeState, phase, reason) {
  if (!quietModeState || quietModeState.enabled !== true) {
    return;
  }
  addQuietModeActivePhase(quietModeState, phase);
  if (quietModeState.status === QUIET_MODE_STATUS_ACTIVE) {
    return;
  }
  quietModeState.status = QUIET_MODE_STATUS_ACTIVE;
  if (!Number.isFinite(quietModeState.enteredAtMs)) {
    quietModeState.enteredAtMs = Date.now();
  }
  appendQuietModeLifecycleEvent(
    quietModeState,
    QUIET_MODE_ACTION_ENTER,
    String(phase || ''),
    String(reason || ''),
  );
}

function markQuietModePhase(quietModeState, phase) {
  if (!quietModeState || quietModeState.enabled !== true) {
    return;
  }
  if (quietModeState.status !== QUIET_MODE_STATUS_ACTIVE) {
    return;
  }
  addQuietModeActivePhase(quietModeState, phase);
}

function exitQuietMode(quietModeState, phase, reason) {
  if (!quietModeState || quietModeState.enabled !== true) {
    return;
  }
  if (quietModeState.status !== QUIET_MODE_STATUS_ACTIVE) {
    return;
  }
  quietModeState.status = QUIET_MODE_STATUS_INACTIVE;
  quietModeState.exitedAtMs = Date.now();
  appendQuietModeLifecycleEvent(
    quietModeState,
    QUIET_MODE_ACTION_EXIT,
    String(phase || ''),
    String(reason || ''),
  );
}

function buildQuietModeDetails(quietModeState, options = {}) {
  const defaultActivePhases = normalizeActivePhases(options.defaultActivePhases);
  if (!quietModeState || quietModeState.enabled !== true) {
    return {
      schemaVersion: QUIET_MODE_SCHEMA_VERSION,
      enabled: false,
      status: QUIET_MODE_STATUS_INACTIVE,
      enteredAtMs: null,
      exitedAtMs: null,
      activePhases: [...defaultActivePhases],
      activeDuringPhases: [],
      lifecycle: [],
    };
  }
  return {
    schemaVersion: quietModeState.schemaVersion,
    enabled: true,
    status: quietModeState.status,
    enteredAtMs: quietModeState.enteredAtMs,
    exitedAtMs: quietModeState.exitedAtMs,
    activePhases: [...quietModeState.activePhases],
    activeDuringPhases: [...quietModeState.activeDuringPhases],
    lifecycle: quietModeState.lifecycle.map((event) => ({...event})),
  };
}

export {
  QUIET_MODE_SCHEMA_VERSION,
  QUIET_MODE_STATUS_ACTIVE,
  QUIET_MODE_STATUS_INACTIVE,
  createQuietModeState,
  enterQuietMode,
  markQuietModePhase,
  exitQuietMode,
  buildQuietModeDetails,
};
