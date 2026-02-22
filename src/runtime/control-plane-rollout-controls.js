import {NUM, TYPEOF} from '../constants/index.js';

const CONTROL_PLANE_ROLLOUT_CONTROL = Object.freeze({
  LIFECYCLE_PROBES: 'lifecycleProbes',
  WORK_CLASS_SCHEDULER: 'workClassScheduler',
  DURABLE_JOIN_SESSIONS: 'durableJoinSessions',
});

const CONTROL_PLANE_ROLLOUT_DEFAULT = Object.freeze({
  LIFECYCLE_PROBES: true,
  WORK_CLASS_SCHEDULER: true,
  DURABLE_JOIN_SESSIONS: true,
});

const CONTROL_PLANE_ROLLOUT_REQUIRED = Object.freeze({
  BOOTSTRAP_API: Object.freeze([
    CONTROL_PLANE_ROLLOUT_CONTROL.LIFECYCLE_PROBES,
  ]),
  BOOTSTRAP_SERVICE: Object.freeze([
    CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER,
  ]),
  NODE_JOINING_SERVICE: Object.freeze([
    CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER,
    CONTROL_PLANE_ROLLOUT_CONTROL.DURABLE_JOIN_SESSIONS,
  ]),
  LOGS_TABLE_SERVICE: Object.freeze([
    CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER,
  ]),
});

const CONTROL_PLANE_ROLLOUT_BOOLEAN = Object.freeze({
  TRUE: 'true',
  FALSE: 'false',
  ONE: '1',
  ZERO: '0',
});

const CONTROL_PLANE_ROLLOUT_ERROR = Object.freeze({
  requiredControlDisabled: (owner, controlName) =>
    `${owner} rollout control "${controlName}" must be true`,
});

/**
 * Parse rollout control boolean from mixed input.
 * @param {*} value
 * @param {boolean} fallback
 * @return {boolean}
 */
function parseRolloutControlBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === TYPEOF.BOOLEAN) {
    return value;
  }
  if (typeof value === TYPEOF.NUMBER) {
    return value === NUM.ONE;
  }
  if (typeof value !== TYPEOF.STRING) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.TRUE ||
      normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.ONE) {
    return true;
  }
  if (normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.FALSE ||
      normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.ZERO) {
    return false;
  }
  return fallback;
}

/**
 * Resolve rollout controls with defaults.
 * @param {Object} [controls]
 * @return {Object}
 */
function resolveControlPlaneRolloutControls(controls = {}) {
  return {
    [CONTROL_PLANE_ROLLOUT_CONTROL.LIFECYCLE_PROBES]: parseRolloutControlBoolean(
      controls[CONTROL_PLANE_ROLLOUT_CONTROL.LIFECYCLE_PROBES],
      CONTROL_PLANE_ROLLOUT_DEFAULT.LIFECYCLE_PROBES,
    ),
    [CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER]: parseRolloutControlBoolean(
      controls[CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER],
      CONTROL_PLANE_ROLLOUT_DEFAULT.WORK_CLASS_SCHEDULER,
    ),
    [CONTROL_PLANE_ROLLOUT_CONTROL.DURABLE_JOIN_SESSIONS]: parseRolloutControlBoolean(
      controls[CONTROL_PLANE_ROLLOUT_CONTROL.DURABLE_JOIN_SESSIONS],
      CONTROL_PLANE_ROLLOUT_DEFAULT.DURABLE_JOIN_SESSIONS,
    ),
  };
}

/**
 * Validate required rollout controls for an owner.
 * @param {Object} options
 * @param {string} options.owner
 * @param {Object} [options.controls]
 * @param {Array<string>} [options.required]
 * @return {Object}
 */
function assertRequiredControlPlaneRollout(options = {}) {
  const owner = typeof options.owner === TYPEOF.STRING &&
      options.owner.length > NUM.ZERO ?
    options.owner :
    'control-plane';
  const controls = resolveControlPlaneRolloutControls(options.controls || {});
  const required = Array.isArray(options.required) ?
    options.required :
    [];

  for (const controlName of required) {
    if (controls[controlName] !== true) {
      throw new Error(
        CONTROL_PLANE_ROLLOUT_ERROR.requiredControlDisabled(owner, controlName),
      );
    }
  }
  return controls;
}

export {
  CONTROL_PLANE_ROLLOUT_CONTROL,
  CONTROL_PLANE_ROLLOUT_DEFAULT,
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  CONTROL_PLANE_ROLLOUT_ERROR,
  assertRequiredControlPlaneRollout,
  resolveControlPlaneRolloutControls,
};
