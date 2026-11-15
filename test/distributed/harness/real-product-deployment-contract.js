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

class DeploymentFailure extends Error {
  constructor(code, message, diagnostic = null) {
    super(message);
    this.name = 'DeploymentFailure';
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

function deploymentFailure(code, message, diagnostic = null) {
  return new DeploymentFailure(code, message, diagnostic);
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
  isImageId,
  CLAIM_STATUS,
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
  resolveReadinessBudget,
};
