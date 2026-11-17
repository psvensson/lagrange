/**
 * The vocabulary of the comparative-benchmark deployment layer: typed
 * failures, the campaign container label, storage kinds, run classes and the
 * claim status words a deployment can contribute. One owner; the deployers,
 * the campaign owner and the runner import from here (R06/R07).
 *
 * Status words use stream A's hyphen spelling (`not-measured`, `blocked`);
 * when stream A's admission owner lands, CLAIM_STATUS is re-exported from it.
 */
import {
  dateNow,
  numberIsFinite,
  numberIsSafeInteger,
} from './real-product-captured-intrinsics.js';
import {
  TIDB_REFERENCE_DEFAULTS,
} from './tidb-reference-lifecycle.js';

const DEPLOYMENT_FAILURE = Object.freeze({
  READINESS_EXHAUSTED: 'readiness_exhausted',
  IDENTITY_UNVERIFIED: 'identity_unverified',
  DATASET_UNVERIFIED: 'dataset_unverified',
  ENDPOINT_UNBOUND: 'endpoint_unbound',
  IMPAIRMENT_FAILED: 'impairment_failed',
  PRODUCT_CHANGED: 'product_changed',
  DEPLOYMENT_COMMAND_FAILED: 'deployment_command_failed',
  WORKLOAD_ENTRY_UNAVAILABLE: 'workload_entry_unavailable',
  WORKLOAD_FAILED: 'workload_failed',
  LOAD_GENERATOR_COLOCATED: 'load_generator_colocated',
  THERMAL_EXHAUSTED: 'thermal_exhausted',
  IMAGE_UNAVAILABLE: 'image_unavailable',
  THERMAL_UNMEASURABLE: 'thermal_unmeasurable',
  LAB_HOST_UNAVAILABLE: 'lab_host_unavailable',
  WATCHDOG_STOPPED: 'watchdog_stopped',
  // Docker answered that the container does not exist ("No such container").
  CONTAINER_ABSENT: 'container_absent',
});

const BENCH_LABEL = Object.freeze({
  CAMPAIGN: 'lagrange.bench.campaign',
  ROLE: 'lagrange.bench.role',
});

// A campaign id is used inside a docker label filter and a host path: one
// token, no separators a shell or a filter could widen.
const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/u;

const STORAGE_KIND = Object.freeze({
  HOST_VOLUME: 'host-volume',
  CONTAINER_LAYER: 'container-layer',
});

const RUN_CLASS = Object.freeze({PUBLISHABLE: 'publishable', SMOKE: 'smoke'});

// A docker image id (`docker image inspect .Id`): the one predicate the
// identity owner and the claim admission share.
const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function isImageId(value) {
  return typeof value === 'string' && IMAGE_ID_PATTERN.test(value);
}

const CLAIM_STATUS = Object.freeze({
  OBSERVED: 'observed',
  NOT_MEASURED: 'not-measured',
  BLOCKED: 'blocked',
});

const READINESS_STATE = Object.freeze({READY: 'ready', EXHAUSTED: 'exhausted'});

const LAGRANGE_IMAGE_DEFAULT = 'psvensson/lagrange:0.4.0';
const PD_IMAGE_DEFAULT = TIDB_REFERENCE_DEFAULTS.pdImage;
const TIKV_IMAGE_DEFAULT = TIDB_REFERENCE_DEFAULTS.tikvImage;
const TIDB_IMAGE_DEFAULT = TIDB_REFERENCE_DEFAULTS.tidbImage;
const TIDB_SQL_CLIENT_IMAGE = TIDB_REFERENCE_DEFAULTS.mysqlClientImage;
const POSTGRES_IMAGE_DEFAULT = 'postgres:17-alpine';
// psql for PostgreSQL and the Lagrange PG wire, and the busybox userland the
// listener-ownership probe needs: the image the PostgreSQL arm already pulls.
const SQL_CLIENT_IMAGE = POSTGRES_IMAGE_DEFAULT;

const DEFAULT_READINESS = Object.freeze({
  attempts: 120,
  // Consecutive ready verdicts the cluster predicate must hold (quiet window).
  stablePolls: 3,
  intervalMs: 1000,
  timeoutMs: TIDB_REFERENCE_DEFAULTS.readinessTimeoutMs,
  pollIntervalMs: TIDB_REFERENCE_DEFAULTS.readinessPollIntervalMs,
});

// Shared wall-clock deadline across all sequential readiness stages of cold
// 3-node Lagrange formation (420 seconds = 7 minutes, matching
// FORMATION_BOUND_MS = 420_000 in
// test/distributed/scenarios/fresh-formation-user-table-routability.js).
const DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS = 420_000;
const DEFAULT_LAGRANGE_ROUTABLE_DEADLINE_MS = 900_000;
const DEFAULT_LAGRANGE_OBSERVE_ROLES_DEADLINE_MS = 15_000;
const DEFAULT_TIDB_FORMATION_DEADLINE_MS = 240_000;
const DEFAULT_TIDB_PLACEMENT_DEADLINE_MS = 120_000;
const DEFAULT_TIDB_OBSERVE_ROLES_DEADLINE_MS = 30_000;
const DEFAULT_POSTGRES_FORMATION_DEADLINE_MS = 240_000;
const DEFAULT_POSTGRES_OBSERVATION_DEADLINE_MS = 30_000;
const DEFAULT_POST_FAILURE_DIAGNOSTIC_DEADLINE_MS = 30_000;
const DEFAULT_INSPECT_TIMEOUT_MS = 10_000;

function stripTransientExecutionOptions(opts) {
  const copy = {...(opts || {})};
  delete copy.signal;
  delete copy.deadlineAtMs;
  delete copy.deadlineMs;
  delete copy.timeoutMs;
  return copy;
}

function withExplicitSignalOption(baseOpts, signal) {
  return signal === undefined ? {...(baseOpts || {})} : {...(baseOpts || {}), signal};
}

function intersectDeadlineAtMs(callerDeadlineAtMs, ownDeadlineAtMs) {
  if (!numberIsFinite(callerDeadlineAtMs)) return ownDeadlineAtMs;
  if (ownDeadlineAtMs === null) return callerDeadlineAtMs;
  return Math.min(callerDeadlineAtMs, ownDeadlineAtMs);
}

function resolveOperationWindow(input = {}) {
  const clock = input.clock ?? dateNow;
  const startedAtMs = clock();
  const signal = input.callerSignal ?? null;
  const budgetMs = numberIsFinite(input.callerDeadlineMs) ?
    input.callerDeadlineMs :
    (input.defaultDeadlineMs ?? null);
  const ownDeadlineAtMs = numberIsFinite(budgetMs) ? startedAtMs + budgetMs : null;
  const deadlineAtMs = intersectDeadlineAtMs(input.callerDeadlineAtMs, ownDeadlineAtMs);
  const deadlineMs = deadlineAtMs !== null ? Math.max(0, deadlineAtMs - startedAtMs) : null;
  return {signal, startedAtMs, deadlineAtMs, deadlineMs};
}

class DeploymentFailure extends Error {
  constructor(code, message, diagnostic = null) {
    super(message);
    this.name = 'DeploymentFailure';
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

const SEMANTIC_FAILURE_CODE_PATTERN = /^[a-z][a-z0-9_-]*$/u;

function isDeploymentFailure(error) {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof DeploymentFailure || error.name === 'DeploymentFailure') {
    return typeof error.code === 'string' && SEMANTIC_FAILURE_CODE_PATTERN.test(error.code);
  }
  if (error.name === 'AbortError' || typeof error.syscall === 'string') return false;
  return typeof error.code === 'string' && SEMANTIC_FAILURE_CODE_PATTERN.test(error.code);
}

function deploymentFailure(code, message, diagnostic = null) {
  return new DeploymentFailure(code, message, diagnostic);
}

function resolveNumericExitCode(rawCode) {
  if (rawCode === null || rawCode === undefined || rawCode === '' || typeof rawCode === 'boolean') {
    return null;
  }
  const parsed = Number(rawCode);
  return numberIsSafeInteger(parsed) ? parsed : null;
}

function extractCommandProcessFacts(error) {
  const exitCode = resolveNumericExitCode(error?.exitCode) ??
    (typeof error?.code === 'number' ? resolveNumericExitCode(error.code) : null);
  let osErrorCode = null;
  if (typeof error?.osErrorCode === 'string' && error.osErrorCode !== '') {
    osErrorCode = error.osErrorCode;
  } else if (typeof error?.code === 'string' && !isDeploymentFailure(error)) {
    osErrorCode = error.code;
  }
  const signal = typeof error?.signal === 'string' && error.signal !== '' ? error.signal : null;
  const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
  const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
  return {exitCode, osErrorCode, signal, stdout, stderr};
}

function attachRemoteCommandAttribution(failure, classified, cause = null) {
  if (!failure || typeof failure !== 'object' || !classified) return failure;
  Object.assign(failure, {
    exitCode: classified.exitCode ?? null,
    signal: classified.signal ?? null,
    killed: Boolean(classified.killed),
    ...(typeof classified.stdout === 'string' ? {stdout: classified.stdout} : {}),
    ...(typeof classified.stderr === 'string' ? {stderr: classified.stderr} : {}),
    ...(typeof classified.osErrorCode === 'string' ?
      {osErrorCode: classified.osErrorCode} : {}),
    aborted: Boolean(classified.aborted),
    deadlineExpired: Boolean(classified.deadlineExpired),
    timedOut: Boolean(classified.timedOut),
    httpTimedOut: Boolean(classified.httpTimedOut),
    transportError: Boolean(classified.transportError),
    observerInfrastructure: Boolean(classified.observerInfrastructure),
  });
  if (cause instanceof Error && cause !== failure && failure.cause === undefined) {
    failure.cause = cause;
  }
  return failure;
}

function buildRemoteFailureDiagnostic(classified, extra = {}) {
  return {
    ...extra,
    exitCode: classified.exitCode ?? null,
    signal: classified.signal ?? null,
    killed: Boolean(classified.killed),
    aborted: Boolean(classified.aborted),
    deadlineExpired: Boolean(classified.deadlineExpired),
    timedOut: Boolean(classified.timedOut),
    ...(classified.httpTimedOut ? {httpTimedOut: true} : {}),
    transportError: Boolean(classified.transportError),
    observerInfrastructure: Boolean(classified.observerInfrastructure),
  };
}

function requireCampaignId(campaignId) {
  if (typeof campaignId !== 'string' || !CAMPAIGN_ID_PATTERN.test(campaignId)) {
    throw new Error(`benchmark campaign id must match ${CAMPAIGN_ID_PATTERN}: ` +
      JSON.stringify(campaignId));
  }
  return campaignId;
}

function resolveReadinessBudget(opts = {}) {
  return Object.freeze({...DEFAULT_READINESS, ...(opts.readiness || {})});
}

export {
  BENCH_LABEL,
  DeploymentFailure,
  attachRemoteCommandAttribution,
  buildRemoteFailureDiagnostic,
  extractCommandProcessFacts,
  isDeploymentFailure,
  isImageId,
  resolveNumericExitCode,
  CLAIM_STATUS,
  DEFAULT_INSPECT_TIMEOUT_MS,
  DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS,
  DEFAULT_LAGRANGE_OBSERVE_ROLES_DEADLINE_MS,
  DEFAULT_LAGRANGE_ROUTABLE_DEADLINE_MS,
  DEFAULT_POSTGRES_FORMATION_DEADLINE_MS,
  DEFAULT_POSTGRES_OBSERVATION_DEADLINE_MS,
  DEFAULT_POST_FAILURE_DIAGNOSTIC_DEADLINE_MS,
  DEFAULT_READINESS,
  DEFAULT_TIDB_FORMATION_DEADLINE_MS,
  DEFAULT_TIDB_OBSERVE_ROLES_DEADLINE_MS,
  DEFAULT_TIDB_PLACEMENT_DEADLINE_MS,
  DEPLOYMENT_FAILURE,
  LAGRANGE_IMAGE_DEFAULT,
  PD_IMAGE_DEFAULT,
  POSTGRES_IMAGE_DEFAULT,
  READINESS_STATE,
  RUN_CLASS,
  SQL_CLIENT_IMAGE,
  STORAGE_KIND,
  TIDB_IMAGE_DEFAULT,
  TIDB_SQL_CLIENT_IMAGE,
  TIKV_IMAGE_DEFAULT,
  deploymentFailure,
  requireCampaignId,
  resolveOperationWindow,
  resolveReadinessBudget,
  stripTransientExecutionOptions,
  withExplicitSignalOption,
};
