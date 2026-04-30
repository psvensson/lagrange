/**
 * Lease-backed leader election for endpoint sync controller.
 *
 * Uses Kubernetes Lease objects so only one controller instance
 * performs reconciliation writes at a time.
 *
 * @module runtime/endpoint-sync-leader-election
 */

import {TIME_MS, TYPEOF} from '../constants/index.js';
import {BaseError} from '../utils/base-error.js';
import {
  ENDPOINT_SYNC_LEASE,
  ENDPOINT_SYNC_NUM,
} from './endpoint-sync-constants.js';

const LOCAL_STR_1QI4R = 'EndpointSyncLeaseLeaderElector';
const LOCAL_STR_BPD4X = 'tryAcquireLeadership';
const LOCAL_NUM_ZERO = 0;

const LEADER_ELECTOR_ERROR = Object.freeze({
  CLIENT_REQUIRED: 'k8sClient is required',
  CLIENT_METHOD_PREFIX: 'k8sClient missing required lease method',
  NAMESPACE_REQUIRED: 'namespace is required',
  LEASE_NAME_REQUIRED: 'leaseName is required',
});

const LEADER_ELECTOR_REQUIRED_METHODS = Object.freeze([
  'getLease',
  'createLease',
  'updateLease',
]);

/**
 * Typed leader-election error.
 *
 * @extends BaseError
 */
class EndpointSyncLeaderElectorError extends BaseError {
  /**
   * @param {string} message - Error message.
   * @param {Object} [metadata={}] - Error metadata.
   * @param {Error} [cause] - Underlying cause.
   */
  constructor(message, metadata = {}, cause = undefined) {
    super(message, {
      cause,
      context: {
        component: LOCAL_STR_1QI4R,
        operation: LOCAL_STR_BPD4X,
        metadata,
      },
    });
  }
}

/**
 * Normalize holder identity from arbitrary input.
 *
 * @param {*} value - Raw holder identity.
 * @return {string}
 */
function normalizeHolderIdentity(value) {
  if (typeof value !== TYPEOF.STRING) {
    return ENDPOINT_SYNC_LEASE.HOLDER_IDENTITY_FALLBACK;
  }
  const trimmed = value.trim();
  if (trimmed.length === ENDPOINT_SYNC_NUM.ZERO) {
    return ENDPOINT_SYNC_LEASE.HOLDER_IDENTITY_FALLBACK;
  }
  return trimmed;
}

/**
 * Parse positive lease duration from Lease spec.
 *
 * @param {Object} lease - Lease resource.
 * @param {number} fallbackSeconds - Default duration.
 * @return {number}
 */
function resolveLeaseDurationSeconds(lease, fallbackSeconds) {
  const parsed = Number(lease?.spec?.leaseDurationSeconds);
  if (!Number.isInteger(parsed) || parsed <= ENDPOINT_SYNC_NUM.ZERO) {
    return fallbackSeconds;
  }
  return parsed;
}

/**
 * Parse lease transition counter.
 *
 * @param {Object} lease - Lease resource.
 * @return {number}
 */
function resolveLeaseTransitions(lease) {
  const parsed = Number(lease?.spec?.leaseTransitions);
  if (!Number.isInteger(parsed) || parsed < ENDPOINT_SYNC_NUM.ZERO) {
    return ENDPOINT_SYNC_NUM.ZERO;
  }
  return parsed;
}

/**
 * Resolve milliseconds timestamp from lease spec.
 *
 * @param {Object} lease - Lease resource.
 * @return {number}
 */
function resolveLeaseRenewTimeMs(lease) {
  const renewTime = lease?.spec?.renewTime || lease?.spec?.acquireTime || null;
  if (typeof renewTime !== TYPEOF.STRING || renewTime.trim().length === LOCAL_NUM_ZERO) {
    return Number.NaN;
  }
  return Date.parse(renewTime);
}

/**
 * Determine whether lease is expired at given time.
 *
 * @param {Object} lease - Lease resource.
 * @param {number} nowMs - Current timestamp.
 * @param {number} fallbackDurationSeconds - Default duration.
 * @return {boolean}
 */
function isLeaseExpired(lease, nowMs, fallbackDurationSeconds) {
  const renewMs = resolveLeaseRenewTimeMs(lease);
  if (!Number.isFinite(renewMs)) {
    return true;
  }
  const durationSeconds = resolveLeaseDurationSeconds(
    lease,
    fallbackDurationSeconds,
  );
  return renewMs + (durationSeconds * TIME_MS.SECOND) <= nowMs;
}

/**
 * Build Lease manifest from current state.
 *
 * @param {Object} options - Manifest options.
 * @param {string} options.namespace - Lease namespace.
 * @param {string} options.leaseName - Lease resource name.
 * @param {string} options.holderIdentity - Local holder identity.
 * @param {number} options.durationSeconds - Lease duration.
 * @param {string} options.nowIso - Current timestamp.
 * @param {Object|null} options.existingLease - Existing lease if present.
 * @param {boolean} options.takeover - Whether holder identity changed.
 * @return {Object}
 */
function buildLeaseManifest(options) {
  const existingLease = options.existingLease || null;
  const hasExistingLease = Boolean(existingLease);
  const metadata = existingLease?.metadata || {};
  const existingSpec = existingLease?.spec || {};
  const transitions = resolveLeaseTransitions(existingLease);
  const shouldIncrementTransitions = options.takeover && hasExistingLease;

  return {
    apiVersion: ENDPOINT_SYNC_LEASE.API_VERSION,
    kind: ENDPOINT_SYNC_LEASE.KIND,
    metadata: {
      name: options.leaseName,
      namespace: options.namespace,
      resourceVersion: metadata.resourceVersion || undefined,
    },
    spec: {
      holderIdentity: options.holderIdentity,
      leaseDurationSeconds: options.durationSeconds,
      acquireTime: options.takeover ?
        options.nowIso :
        existingSpec.acquireTime || options.nowIso,
      renewTime: options.nowIso,
      leaseTransitions: shouldIncrementTransitions ?
        transitions + ENDPOINT_SYNC_NUM.ONE :
        transitions,
    },
  };
}

/**
 * Validate leader elector constructor options.
 *
 * @param {Object} options - Constructor options.
 */
function validateLeaderElectorOptions(options) {
  if (!options || typeof options !== TYPEOF.OBJECT) {
    throw new EndpointSyncLeaderElectorError(LEADER_ELECTOR_ERROR.CLIENT_REQUIRED);
  }

  const k8sClient = options.k8sClient;
  if (!k8sClient || typeof k8sClient !== TYPEOF.OBJECT) {
    throw new EndpointSyncLeaderElectorError(LEADER_ELECTOR_ERROR.CLIENT_REQUIRED);
  }
  for (const methodName of LEADER_ELECTOR_REQUIRED_METHODS) {
    if (typeof k8sClient[methodName] !== TYPEOF.FUNCTION) {
      throw new EndpointSyncLeaderElectorError(
        `${LEADER_ELECTOR_ERROR.CLIENT_METHOD_PREFIX}: ${methodName}`,
      );
    }
  }

  if (!options.namespace || typeof options.namespace !== TYPEOF.STRING) {
    throw new EndpointSyncLeaderElectorError(
      LEADER_ELECTOR_ERROR.NAMESPACE_REQUIRED,
    );
  }
  if (!options.leaseName || typeof options.leaseName !== TYPEOF.STRING) {
    throw new EndpointSyncLeaderElectorError(
      LEADER_ELECTOR_ERROR.LEASE_NAME_REQUIRED,
    );
  }
}

/**
 * Lease-backed leader elector.
 */
class EndpointSyncLeaseLeaderElector {
  /**
   * @param {Object} options - Elector options.
   * @param {Object} options.k8sClient - Kubernetes client.
   * @param {string} options.namespace - Lease namespace.
   * @param {string} options.leaseName - Lease name.
   * @param {string} [options.holderIdentity] - Local holder id.
   * @param {number} [options.leaseDurationSeconds] - Lease duration.
   * @param {Function} [options.nowProvider] - Clock override for tests.
   */
  constructor(options) {
    validateLeaderElectorOptions(options);

    this._k8sClient = options.k8sClient;
    this._namespace = options.namespace.trim();
    this._leaseName = options.leaseName.trim();
    this._holderIdentity = normalizeHolderIdentity(
      options.holderIdentity || process.env.HOSTNAME,
    );
    const leaseDuration = Number(options.leaseDurationSeconds);
    this._leaseDurationSeconds =
      Number.isInteger(leaseDuration) && leaseDuration > ENDPOINT_SYNC_NUM.ZERO ?
        leaseDuration :
        ENDPOINT_SYNC_LEASE.DEFAULT_DURATION_SECONDS;
    this._nowProvider =
      typeof options.nowProvider === TYPEOF.FUNCTION ?
        options.nowProvider :
        () => Date.now();
  }

  /**
   * Acquire or renew lease and return leadership state.
   *
   * @return {Promise<Object>}
   */
  async tryAcquireLeadership() {
    const nowMs = this._nowProvider();
    const nowIso = new Date(nowMs).toISOString();

    const existingLease = await this._k8sClient.getLease(
      this._namespace,
      this._leaseName,
    );
    if (!existingLease) {
      const createManifest = buildLeaseManifest({
        namespace: this._namespace,
        leaseName: this._leaseName,
        holderIdentity: this._holderIdentity,
        durationSeconds: this._leaseDurationSeconds,
        nowIso,
        existingLease: null,
        takeover: true,
      });
      await this._k8sClient.createLease(createManifest);
      return {
        isLeader: true,
        holderIdentity: this._holderIdentity,
        leaseName: this._leaseName,
        leaseNamespace: this._namespace,
        observedHolderIdentity: null,
      };
    }

    const observedHolderRaw = existingLease?.spec?.holderIdentity;
    const observedHolderIdentity =
      typeof observedHolderRaw === TYPEOF.STRING ?
        observedHolderRaw.trim() :
        '';
    const hasObservedHolder = observedHolderIdentity.length > ENDPOINT_SYNC_NUM.ZERO;
    const leaseExpired = isLeaseExpired(
      existingLease,
      nowMs,
      this._leaseDurationSeconds,
    );
    const hasLeadership = observedHolderIdentity === this._holderIdentity;
    if (hasObservedHolder && !hasLeadership && !leaseExpired) {
      return {
        isLeader: false,
        holderIdentity: this._holderIdentity,
        leaseName: this._leaseName,
        leaseNamespace: this._namespace,
        observedHolderIdentity,
      };
    }

    const updateManifest = buildLeaseManifest({
      namespace: this._namespace,
      leaseName: this._leaseName,
      holderIdentity: this._holderIdentity,
      durationSeconds: this._leaseDurationSeconds,
      nowIso,
      existingLease,
      takeover: !hasLeadership,
    });
    await this._k8sClient.updateLease(updateManifest);

    return {
      isLeader: true,
      holderIdentity: this._holderIdentity,
      leaseName: this._leaseName,
      leaseNamespace: this._namespace,
      observedHolderIdentity: hasLeadership ? this._holderIdentity :
        observedHolderIdentity,
    };
  }
}

export {
  LEADER_ELECTOR_ERROR,
  LEADER_ELECTOR_REQUIRED_METHODS,
  EndpointSyncLeaderElectorError,
  normalizeHolderIdentity,
  resolveLeaseDurationSeconds,
  resolveLeaseTransitions,
  resolveLeaseRenewTimeMs,
  isLeaseExpired,
  buildLeaseManifest,
  validateLeaderElectorOptions,
  EndpointSyncLeaseLeaderElector,
};
