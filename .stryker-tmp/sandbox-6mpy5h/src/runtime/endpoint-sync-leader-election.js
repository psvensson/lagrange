/**
 * Lease-backed leader election for endpoint sync controller.
 *
 * Uses Kubernetes Lease objects so only one controller instance
 * performs reconciliation writes at a time.
 *
 * @module runtime/endpoint-sync-leader-election
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { TIME_MS, TYPEOF } from '../constants/index.js';
import { BaseError } from '../utils/base-error.js';
import { ENDPOINT_SYNC_LEASE, ENDPOINT_SYNC_NUM } from './endpoint-sync-constants.js';
const LEADER_ELECTOR_ERROR = Object.freeze(stryMutAct_9fa48("145784") ? {} : (stryCov_9fa48("145784"), {
  CLIENT_REQUIRED: stryMutAct_9fa48("145785") ? "" : (stryCov_9fa48("145785"), 'k8sClient is required'),
  CLIENT_METHOD_PREFIX: stryMutAct_9fa48("145786") ? "" : (stryCov_9fa48("145786"), 'k8sClient missing required lease method'),
  NAMESPACE_REQUIRED: stryMutAct_9fa48("145787") ? "" : (stryCov_9fa48("145787"), 'namespace is required'),
  LEASE_NAME_REQUIRED: stryMutAct_9fa48("145788") ? "" : (stryCov_9fa48("145788"), 'leaseName is required')
}));
const LEADER_ELECTOR_REQUIRED_METHODS = Object.freeze(stryMutAct_9fa48("145789") ? [] : (stryCov_9fa48("145789"), [stryMutAct_9fa48("145790") ? "" : (stryCov_9fa48("145790"), 'getLease'), stryMutAct_9fa48("145791") ? "" : (stryCov_9fa48("145791"), 'createLease'), stryMutAct_9fa48("145792") ? "" : (stryCov_9fa48("145792"), 'updateLease')]));

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
    if (stryMutAct_9fa48("145793")) {
      {}
    } else {
      stryCov_9fa48("145793");
      super(message, stryMutAct_9fa48("145794") ? {} : (stryCov_9fa48("145794"), {
        cause,
        context: stryMutAct_9fa48("145795") ? {} : (stryCov_9fa48("145795"), {
          component: stryMutAct_9fa48("145796") ? "" : (stryCov_9fa48("145796"), 'EndpointSyncLeaseLeaderElector'),
          operation: stryMutAct_9fa48("145797") ? "" : (stryCov_9fa48("145797"), 'tryAcquireLeadership'),
          metadata
        })
      }));
    }
  }
}

/**
 * Normalize holder identity from arbitrary input.
 *
 * @param {*} value - Raw holder identity.
 * @return {string}
 */
function normalizeHolderIdentity(value) {
  if (stryMutAct_9fa48("145798")) {
    {}
  } else {
    stryCov_9fa48("145798");
    if (stryMutAct_9fa48("145801") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("145800") ? false : stryMutAct_9fa48("145799") ? true : (stryCov_9fa48("145799", "145800", "145801"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("145802")) {
        {}
      } else {
        stryCov_9fa48("145802");
        return ENDPOINT_SYNC_LEASE.HOLDER_IDENTITY_FALLBACK;
      }
    }
    const trimmed = stryMutAct_9fa48("145803") ? value : (stryCov_9fa48("145803"), value.trim());
    if (stryMutAct_9fa48("145806") ? trimmed.length !== ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145805") ? false : stryMutAct_9fa48("145804") ? true : (stryCov_9fa48("145804", "145805", "145806"), trimmed.length === ENDPOINT_SYNC_NUM.ZERO)) {
      if (stryMutAct_9fa48("145807")) {
        {}
      } else {
        stryCov_9fa48("145807");
        return ENDPOINT_SYNC_LEASE.HOLDER_IDENTITY_FALLBACK;
      }
    }
    return trimmed;
  }
}

/**
 * Parse positive lease duration from Lease spec.
 *
 * @param {Object} lease - Lease resource.
 * @param {number} fallbackSeconds - Default duration.
 * @return {number}
 */
function resolveLeaseDurationSeconds(lease, fallbackSeconds) {
  if (stryMutAct_9fa48("145808")) {
    {}
  } else {
    stryCov_9fa48("145808");
    const parsed = Number(stryMutAct_9fa48("145810") ? lease.spec?.leaseDurationSeconds : stryMutAct_9fa48("145809") ? lease?.spec.leaseDurationSeconds : (stryCov_9fa48("145809", "145810"), lease?.spec?.leaseDurationSeconds));
    if (stryMutAct_9fa48("145813") ? !Number.isInteger(parsed) && parsed <= ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145812") ? false : stryMutAct_9fa48("145811") ? true : (stryCov_9fa48("145811", "145812", "145813"), (stryMutAct_9fa48("145814") ? Number.isInteger(parsed) : (stryCov_9fa48("145814"), !Number.isInteger(parsed))) || (stryMutAct_9fa48("145817") ? parsed > ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145816") ? parsed < ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145815") ? false : (stryCov_9fa48("145815", "145816", "145817"), parsed <= ENDPOINT_SYNC_NUM.ZERO)))) {
      if (stryMutAct_9fa48("145818")) {
        {}
      } else {
        stryCov_9fa48("145818");
        return fallbackSeconds;
      }
    }
    return parsed;
  }
}

/**
 * Parse lease transition counter.
 *
 * @param {Object} lease - Lease resource.
 * @return {number}
 */
function resolveLeaseTransitions(lease) {
  if (stryMutAct_9fa48("145819")) {
    {}
  } else {
    stryCov_9fa48("145819");
    const parsed = Number(stryMutAct_9fa48("145821") ? lease.spec?.leaseTransitions : stryMutAct_9fa48("145820") ? lease?.spec.leaseTransitions : (stryCov_9fa48("145820", "145821"), lease?.spec?.leaseTransitions));
    if (stryMutAct_9fa48("145824") ? !Number.isInteger(parsed) && parsed < ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145823") ? false : stryMutAct_9fa48("145822") ? true : (stryCov_9fa48("145822", "145823", "145824"), (stryMutAct_9fa48("145825") ? Number.isInteger(parsed) : (stryCov_9fa48("145825"), !Number.isInteger(parsed))) || (stryMutAct_9fa48("145828") ? parsed >= ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145827") ? parsed <= ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145826") ? false : (stryCov_9fa48("145826", "145827", "145828"), parsed < ENDPOINT_SYNC_NUM.ZERO)))) {
      if (stryMutAct_9fa48("145829")) {
        {}
      } else {
        stryCov_9fa48("145829");
        return ENDPOINT_SYNC_NUM.ZERO;
      }
    }
    return parsed;
  }
}

/**
 * Resolve milliseconds timestamp from lease spec.
 *
 * @param {Object} lease - Lease resource.
 * @return {number}
 */
function resolveLeaseRenewTimeMs(lease) {
  if (stryMutAct_9fa48("145830")) {
    {}
  } else {
    stryCov_9fa48("145830");
    const renewTime = stryMutAct_9fa48("145833") ? (lease?.spec?.renewTime || lease?.spec?.acquireTime) && null : stryMutAct_9fa48("145832") ? false : stryMutAct_9fa48("145831") ? true : (stryCov_9fa48("145831", "145832", "145833"), (stryMutAct_9fa48("145835") ? lease?.spec?.renewTime && lease?.spec?.acquireTime : stryMutAct_9fa48("145834") ? false : (stryCov_9fa48("145834", "145835"), (stryMutAct_9fa48("145837") ? lease.spec?.renewTime : stryMutAct_9fa48("145836") ? lease?.spec.renewTime : (stryCov_9fa48("145836", "145837"), lease?.spec?.renewTime)) || (stryMutAct_9fa48("145839") ? lease.spec?.acquireTime : stryMutAct_9fa48("145838") ? lease?.spec.acquireTime : (stryCov_9fa48("145838", "145839"), lease?.spec?.acquireTime)))) || null);
    if (stryMutAct_9fa48("145842") ? typeof renewTime !== TYPEOF.STRING && renewTime.trim().length === 0 : stryMutAct_9fa48("145841") ? false : stryMutAct_9fa48("145840") ? true : (stryCov_9fa48("145840", "145841", "145842"), (stryMutAct_9fa48("145844") ? typeof renewTime === TYPEOF.STRING : stryMutAct_9fa48("145843") ? false : (stryCov_9fa48("145843", "145844"), typeof renewTime !== TYPEOF.STRING)) || (stryMutAct_9fa48("145846") ? renewTime.trim().length !== 0 : stryMutAct_9fa48("145845") ? false : (stryCov_9fa48("145845", "145846"), (stryMutAct_9fa48("145847") ? renewTime.length : (stryCov_9fa48("145847"), renewTime.trim().length)) === 0)))) {
      if (stryMutAct_9fa48("145848")) {
        {}
      } else {
        stryCov_9fa48("145848");
        return Number.NaN;
      }
    }
    return Date.parse(renewTime);
  }
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
  if (stryMutAct_9fa48("145849")) {
    {}
  } else {
    stryCov_9fa48("145849");
    const renewMs = resolveLeaseRenewTimeMs(lease);
    if (stryMutAct_9fa48("145852") ? false : stryMutAct_9fa48("145851") ? true : stryMutAct_9fa48("145850") ? Number.isFinite(renewMs) : (stryCov_9fa48("145850", "145851", "145852"), !Number.isFinite(renewMs))) {
      if (stryMutAct_9fa48("145853")) {
        {}
      } else {
        stryCov_9fa48("145853");
        return stryMutAct_9fa48("145854") ? false : (stryCov_9fa48("145854"), true);
      }
    }
    const durationSeconds = resolveLeaseDurationSeconds(lease, fallbackDurationSeconds);
    return stryMutAct_9fa48("145858") ? renewMs + durationSeconds * TIME_MS.SECOND > nowMs : stryMutAct_9fa48("145857") ? renewMs + durationSeconds * TIME_MS.SECOND < nowMs : stryMutAct_9fa48("145856") ? false : stryMutAct_9fa48("145855") ? true : (stryCov_9fa48("145855", "145856", "145857", "145858"), (stryMutAct_9fa48("145859") ? renewMs - durationSeconds * TIME_MS.SECOND : (stryCov_9fa48("145859"), renewMs + (stryMutAct_9fa48("145860") ? durationSeconds / TIME_MS.SECOND : (stryCov_9fa48("145860"), durationSeconds * TIME_MS.SECOND)))) <= nowMs);
  }
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
  if (stryMutAct_9fa48("145861")) {
    {}
  } else {
    stryCov_9fa48("145861");
    const existingLease = stryMutAct_9fa48("145864") ? options.existingLease && null : stryMutAct_9fa48("145863") ? false : stryMutAct_9fa48("145862") ? true : (stryCov_9fa48("145862", "145863", "145864"), options.existingLease || null);
    const hasExistingLease = Boolean(existingLease);
    const metadata = stryMutAct_9fa48("145867") ? existingLease?.metadata && {} : stryMutAct_9fa48("145866") ? false : stryMutAct_9fa48("145865") ? true : (stryCov_9fa48("145865", "145866", "145867"), (stryMutAct_9fa48("145868") ? existingLease.metadata : (stryCov_9fa48("145868"), existingLease?.metadata)) || {});
    const existingSpec = stryMutAct_9fa48("145871") ? existingLease?.spec && {} : stryMutAct_9fa48("145870") ? false : stryMutAct_9fa48("145869") ? true : (stryCov_9fa48("145869", "145870", "145871"), (stryMutAct_9fa48("145872") ? existingLease.spec : (stryCov_9fa48("145872"), existingLease?.spec)) || {});
    const transitions = resolveLeaseTransitions(existingLease);
    const shouldIncrementTransitions = stryMutAct_9fa48("145875") ? options.takeover || hasExistingLease : stryMutAct_9fa48("145874") ? false : stryMutAct_9fa48("145873") ? true : (stryCov_9fa48("145873", "145874", "145875"), options.takeover && hasExistingLease);
    return stryMutAct_9fa48("145876") ? {} : (stryCov_9fa48("145876"), {
      apiVersion: ENDPOINT_SYNC_LEASE.API_VERSION,
      kind: ENDPOINT_SYNC_LEASE.KIND,
      metadata: stryMutAct_9fa48("145877") ? {} : (stryCov_9fa48("145877"), {
        name: options.leaseName,
        namespace: options.namespace,
        resourceVersion: stryMutAct_9fa48("145880") ? metadata.resourceVersion && undefined : stryMutAct_9fa48("145879") ? false : stryMutAct_9fa48("145878") ? true : (stryCov_9fa48("145878", "145879", "145880"), metadata.resourceVersion || undefined)
      }),
      spec: stryMutAct_9fa48("145881") ? {} : (stryCov_9fa48("145881"), {
        holderIdentity: options.holderIdentity,
        leaseDurationSeconds: options.durationSeconds,
        acquireTime: options.takeover ? options.nowIso : stryMutAct_9fa48("145884") ? existingSpec.acquireTime && options.nowIso : stryMutAct_9fa48("145883") ? false : stryMutAct_9fa48("145882") ? true : (stryCov_9fa48("145882", "145883", "145884"), existingSpec.acquireTime || options.nowIso),
        renewTime: options.nowIso,
        leaseTransitions: shouldIncrementTransitions ? stryMutAct_9fa48("145885") ? transitions - ENDPOINT_SYNC_NUM.ONE : (stryCov_9fa48("145885"), transitions + ENDPOINT_SYNC_NUM.ONE) : transitions
      })
    });
  }
}

/**
 * Validate leader elector constructor options.
 *
 * @param {Object} options - Constructor options.
 */
function validateLeaderElectorOptions(options) {
  if (stryMutAct_9fa48("145886")) {
    {}
  } else {
    stryCov_9fa48("145886");
    if (stryMutAct_9fa48("145889") ? !options && typeof options !== TYPEOF.OBJECT : stryMutAct_9fa48("145888") ? false : stryMutAct_9fa48("145887") ? true : (stryCov_9fa48("145887", "145888", "145889"), (stryMutAct_9fa48("145890") ? options : (stryCov_9fa48("145890"), !options)) || (stryMutAct_9fa48("145892") ? typeof options === TYPEOF.OBJECT : stryMutAct_9fa48("145891") ? false : (stryCov_9fa48("145891", "145892"), typeof options !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("145893")) {
        {}
      } else {
        stryCov_9fa48("145893");
        throw new EndpointSyncLeaderElectorError(LEADER_ELECTOR_ERROR.CLIENT_REQUIRED);
      }
    }
    const k8sClient = options.k8sClient;
    if (stryMutAct_9fa48("145896") ? !k8sClient && typeof k8sClient !== TYPEOF.OBJECT : stryMutAct_9fa48("145895") ? false : stryMutAct_9fa48("145894") ? true : (stryCov_9fa48("145894", "145895", "145896"), (stryMutAct_9fa48("145897") ? k8sClient : (stryCov_9fa48("145897"), !k8sClient)) || (stryMutAct_9fa48("145899") ? typeof k8sClient === TYPEOF.OBJECT : stryMutAct_9fa48("145898") ? false : (stryCov_9fa48("145898", "145899"), typeof k8sClient !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("145900")) {
        {}
      } else {
        stryCov_9fa48("145900");
        throw new EndpointSyncLeaderElectorError(LEADER_ELECTOR_ERROR.CLIENT_REQUIRED);
      }
    }
    for (const methodName of LEADER_ELECTOR_REQUIRED_METHODS) {
      if (stryMutAct_9fa48("145901")) {
        {}
      } else {
        stryCov_9fa48("145901");
        if (stryMutAct_9fa48("145904") ? typeof k8sClient[methodName] === TYPEOF.FUNCTION : stryMutAct_9fa48("145903") ? false : stryMutAct_9fa48("145902") ? true : (stryCov_9fa48("145902", "145903", "145904"), typeof k8sClient[methodName] !== TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("145905")) {
            {}
          } else {
            stryCov_9fa48("145905");
            throw new EndpointSyncLeaderElectorError(stryMutAct_9fa48("145906") ? `` : (stryCov_9fa48("145906"), `${LEADER_ELECTOR_ERROR.CLIENT_METHOD_PREFIX}: ${methodName}`));
          }
        }
      }
    }
    if (stryMutAct_9fa48("145909") ? !options.namespace && typeof options.namespace !== TYPEOF.STRING : stryMutAct_9fa48("145908") ? false : stryMutAct_9fa48("145907") ? true : (stryCov_9fa48("145907", "145908", "145909"), (stryMutAct_9fa48("145910") ? options.namespace : (stryCov_9fa48("145910"), !options.namespace)) || (stryMutAct_9fa48("145912") ? typeof options.namespace === TYPEOF.STRING : stryMutAct_9fa48("145911") ? false : (stryCov_9fa48("145911", "145912"), typeof options.namespace !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("145913")) {
        {}
      } else {
        stryCov_9fa48("145913");
        throw new EndpointSyncLeaderElectorError(LEADER_ELECTOR_ERROR.NAMESPACE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("145916") ? !options.leaseName && typeof options.leaseName !== TYPEOF.STRING : stryMutAct_9fa48("145915") ? false : stryMutAct_9fa48("145914") ? true : (stryCov_9fa48("145914", "145915", "145916"), (stryMutAct_9fa48("145917") ? options.leaseName : (stryCov_9fa48("145917"), !options.leaseName)) || (stryMutAct_9fa48("145919") ? typeof options.leaseName === TYPEOF.STRING : stryMutAct_9fa48("145918") ? false : (stryCov_9fa48("145918", "145919"), typeof options.leaseName !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("145920")) {
        {}
      } else {
        stryCov_9fa48("145920");
        throw new EndpointSyncLeaderElectorError(LEADER_ELECTOR_ERROR.LEASE_NAME_REQUIRED);
      }
    }
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
    if (stryMutAct_9fa48("145921")) {
      {}
    } else {
      stryCov_9fa48("145921");
      validateLeaderElectorOptions(options);
      this._k8sClient = options.k8sClient;
      this._namespace = stryMutAct_9fa48("145922") ? options.namespace : (stryCov_9fa48("145922"), options.namespace.trim());
      this._leaseName = stryMutAct_9fa48("145923") ? options.leaseName : (stryCov_9fa48("145923"), options.leaseName.trim());
      this._holderIdentity = normalizeHolderIdentity(stryMutAct_9fa48("145926") ? options.holderIdentity && process.env.HOSTNAME : stryMutAct_9fa48("145925") ? false : stryMutAct_9fa48("145924") ? true : (stryCov_9fa48("145924", "145925", "145926"), options.holderIdentity || process.env.HOSTNAME));
      const leaseDuration = Number(options.leaseDurationSeconds);
      this._leaseDurationSeconds = (stryMutAct_9fa48("145929") ? Number.isInteger(leaseDuration) || leaseDuration > ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145928") ? false : stryMutAct_9fa48("145927") ? true : (stryCov_9fa48("145927", "145928", "145929"), Number.isInteger(leaseDuration) && (stryMutAct_9fa48("145932") ? leaseDuration <= ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145931") ? leaseDuration >= ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145930") ? true : (stryCov_9fa48("145930", "145931", "145932"), leaseDuration > ENDPOINT_SYNC_NUM.ZERO)))) ? leaseDuration : ENDPOINT_SYNC_LEASE.DEFAULT_DURATION_SECONDS;
      this._nowProvider = (stryMutAct_9fa48("145935") ? typeof options.nowProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("145934") ? false : stryMutAct_9fa48("145933") ? true : (stryCov_9fa48("145933", "145934", "145935"), typeof options.nowProvider === TYPEOF.FUNCTION)) ? options.nowProvider : stryMutAct_9fa48("145936") ? () => undefined : (stryCov_9fa48("145936"), () => Date.now());
    }
  }

  /**
   * Acquire or renew lease and return leadership state.
   *
   * @return {Promise<Object>}
   */
  async tryAcquireLeadership() {
    if (stryMutAct_9fa48("145937")) {
      {}
    } else {
      stryCov_9fa48("145937");
      const nowMs = this._nowProvider();
      const nowIso = new Date(nowMs).toISOString();
      const existingLease = await this._k8sClient.getLease(this._namespace, this._leaseName);
      if (stryMutAct_9fa48("145940") ? false : stryMutAct_9fa48("145939") ? true : stryMutAct_9fa48("145938") ? existingLease : (stryCov_9fa48("145938", "145939", "145940"), !existingLease)) {
        if (stryMutAct_9fa48("145941")) {
          {}
        } else {
          stryCov_9fa48("145941");
          const createManifest = buildLeaseManifest(stryMutAct_9fa48("145942") ? {} : (stryCov_9fa48("145942"), {
            namespace: this._namespace,
            leaseName: this._leaseName,
            holderIdentity: this._holderIdentity,
            durationSeconds: this._leaseDurationSeconds,
            nowIso,
            existingLease: null,
            takeover: stryMutAct_9fa48("145943") ? false : (stryCov_9fa48("145943"), true)
          }));
          await this._k8sClient.createLease(createManifest);
          return stryMutAct_9fa48("145944") ? {} : (stryCov_9fa48("145944"), {
            isLeader: stryMutAct_9fa48("145945") ? false : (stryCov_9fa48("145945"), true),
            holderIdentity: this._holderIdentity,
            leaseName: this._leaseName,
            leaseNamespace: this._namespace,
            observedHolderIdentity: null
          });
        }
      }
      const observedHolderRaw = stryMutAct_9fa48("145947") ? existingLease.spec?.holderIdentity : stryMutAct_9fa48("145946") ? existingLease?.spec.holderIdentity : (stryCov_9fa48("145946", "145947"), existingLease?.spec?.holderIdentity);
      const observedHolderIdentity = (stryMutAct_9fa48("145950") ? typeof observedHolderRaw !== TYPEOF.STRING : stryMutAct_9fa48("145949") ? false : stryMutAct_9fa48("145948") ? true : (stryCov_9fa48("145948", "145949", "145950"), typeof observedHolderRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("145951") ? observedHolderRaw : (stryCov_9fa48("145951"), observedHolderRaw.trim()) : stryMutAct_9fa48("145952") ? "Stryker was here!" : (stryCov_9fa48("145952"), '');
      const hasObservedHolder = stryMutAct_9fa48("145956") ? observedHolderIdentity.length <= ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145955") ? observedHolderIdentity.length >= ENDPOINT_SYNC_NUM.ZERO : stryMutAct_9fa48("145954") ? false : stryMutAct_9fa48("145953") ? true : (stryCov_9fa48("145953", "145954", "145955", "145956"), observedHolderIdentity.length > ENDPOINT_SYNC_NUM.ZERO);
      const leaseExpired = isLeaseExpired(existingLease, nowMs, this._leaseDurationSeconds);
      const hasLeadership = stryMutAct_9fa48("145959") ? observedHolderIdentity !== this._holderIdentity : stryMutAct_9fa48("145958") ? false : stryMutAct_9fa48("145957") ? true : (stryCov_9fa48("145957", "145958", "145959"), observedHolderIdentity === this._holderIdentity);
      if (stryMutAct_9fa48("145962") ? hasObservedHolder && !hasLeadership || !leaseExpired : stryMutAct_9fa48("145961") ? false : stryMutAct_9fa48("145960") ? true : (stryCov_9fa48("145960", "145961", "145962"), (stryMutAct_9fa48("145964") ? hasObservedHolder || !hasLeadership : stryMutAct_9fa48("145963") ? true : (stryCov_9fa48("145963", "145964"), hasObservedHolder && (stryMutAct_9fa48("145965") ? hasLeadership : (stryCov_9fa48("145965"), !hasLeadership)))) && (stryMutAct_9fa48("145966") ? leaseExpired : (stryCov_9fa48("145966"), !leaseExpired)))) {
        if (stryMutAct_9fa48("145967")) {
          {}
        } else {
          stryCov_9fa48("145967");
          return stryMutAct_9fa48("145968") ? {} : (stryCov_9fa48("145968"), {
            isLeader: stryMutAct_9fa48("145969") ? true : (stryCov_9fa48("145969"), false),
            holderIdentity: this._holderIdentity,
            leaseName: this._leaseName,
            leaseNamespace: this._namespace,
            observedHolderIdentity
          });
        }
      }
      const updateManifest = buildLeaseManifest(stryMutAct_9fa48("145970") ? {} : (stryCov_9fa48("145970"), {
        namespace: this._namespace,
        leaseName: this._leaseName,
        holderIdentity: this._holderIdentity,
        durationSeconds: this._leaseDurationSeconds,
        nowIso,
        existingLease,
        takeover: stryMutAct_9fa48("145971") ? hasLeadership : (stryCov_9fa48("145971"), !hasLeadership)
      }));
      await this._k8sClient.updateLease(updateManifest);
      return stryMutAct_9fa48("145972") ? {} : (stryCov_9fa48("145972"), {
        isLeader: stryMutAct_9fa48("145973") ? false : (stryCov_9fa48("145973"), true),
        holderIdentity: this._holderIdentity,
        leaseName: this._leaseName,
        leaseNamespace: this._namespace,
        observedHolderIdentity: hasLeadership ? this._holderIdentity : observedHolderIdentity
      });
    }
  }
}
export { LEADER_ELECTOR_ERROR, LEADER_ELECTOR_REQUIRED_METHODS, EndpointSyncLeaderElectorError, normalizeHolderIdentity, resolveLeaseDurationSeconds, resolveLeaseTransitions, resolveLeaseRenewTimeMs, isLeaseExpired, buildLeaseManifest, validateLeaderElectorOptions, EndpointSyncLeaseLeaderElector };