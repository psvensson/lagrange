import {SYSTEM_TABLE_NAME} from './system-table-schemas-constants.js';
import {
  CRITICAL_PLACEMENT_EVIDENCE_STATE,
  resolveCriticalPlacementConvergence,
} from './critical-placement-convergence.js';
import {
  MEMBERSHIP_EPOCH_VALUE_STATE,
  buildMembershipEpochFence,
  selectLatestPublishedMembershipEpoch,
} from '../control-plane/membership-epoch-contract.js';

const LOCAL_STR_FUNCTION = 'function';
const arrayIsArray = Array.isArray;

// Why an observer rather than a second evaluator: the three-state
// distinct-voting-node invariant already has one owner
// (critical-placement-convergence.js). What formation lacked was a way to ASK
// it about the live cluster, so this module owns exactly one thing — reading
// the evidence tables out of the system-table cache — and delegates every
// judgement. Two tables carry the evidence: SERVICES holds the authoritative
// holder projection and PARTITIONS holds the persisted replication policy the
// requirement resolves through. A third read, CONTROL_PLANE_PUBLICATIONS,
// stamps the observation with the membership publication epoch it was
// computed under, so a consumer can refuse evidence from a superseded
// topology; the epoch owner stays membership-epoch-contract.js and no local
// generation counter exists here.
const CRITICAL_PLACEMENT_OBSERVATION_REASON = Object.freeze({
  MEMBERSHIP_EPOCH_UNAVAILABLE: 'membership_epoch_unavailable',
  PARTITION_POLICY_EVIDENCE_UNREADABLE:
    'partition_policy_evidence_unreadable',
  PROJECTED: 'projected',
  SERVICES_EVIDENCE_UNREADABLE: 'services_evidence_unreadable',
});

// The epoch stamp's own typing, mirrored from the membership epoch value
// contract so a consumer never has to guess what value 0 means: UNAVAILABLE
// says the publications surface could not be read, AVAILABLE with value 0
// says it was read and no membership publication exists yet — the
// pre-first-publication topology, which the epoch fence correctly ages to
// STALE the moment a real publication lands.
const CRITICAL_PLACEMENT_EPOCH_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});

/**
 * Read every row of one table the cache can supply. A cache that cannot
 * answer is a distinct, typed outcome: absent evidence must never read as an
 * observation. Both live cache API surfaces are accepted (getAll and filter),
 * matching the read shape snapshot-catchup already uses.
 *
 * @param {Object|null} systemTableCache
 * @param {string} tableName
 * @return {Object} {readable, rows}
 */
function readTableRows(systemTableCache, tableName) {
  let rows = null;
  try {
    if (typeof systemTableCache?.getAll === LOCAL_STR_FUNCTION) {
      rows = systemTableCache.getAll(tableName);
    } else if (typeof systemTableCache?.filter === LOCAL_STR_FUNCTION) {
      rows = systemTableCache.filter(tableName, () => true);
    } else {
      return {readable: false, rows: []};
    }
  } catch (error) {
    // A cache that throws is unreadable evidence, not an absent cluster. It
    // must not escape and abort the barrier snapshot that merely reports this.
    return {readable: false, rows: [], reason: error?.message || null};
  }
  // A thenable answer means an ASYNC cache (SystemCacheProxy.filter is async):
  // treating it as rows would drop the promise and report a permanent
  // unavailable, so name it rather than silently mis-read it.
  if (rows && typeof rows.then === LOCAL_STR_FUNCTION) {
    return {readable: false, rows: [], asynchronous: true};
  }
  return arrayIsArray(rows) ?
    {readable: true, rows} :
    {readable: false, rows: []};
}

/**
 * The membership publication epoch this observation was computed under.
 * Readable publications with no published row stamp AVAILABLE 0 — the
 * pre-first-publication topology is a real identity, and the fence ages it
 * the moment a publication lands. An UNREADABLE publications surface stamps
 * UNAVAILABLE: currency knowledge must never be minted from evidence that
 * could not be read, and the epoch fence resolves an unavailable snapshot
 * epoch to UNKNOWN currency.
 *
 * @param {Object|null} systemTableCache
 * @return {Object} frozen {state, value}
 */
function readMembershipEpochStamp(systemTableCache) {
  const publications = readTableRows(
    systemTableCache,
    SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  );
  if (!publications.readable) {
    return Object.freeze({
      state: CRITICAL_PLACEMENT_EPOCH_STATE.UNAVAILABLE,
      value: 0,
    });
  }
  return Object.freeze({
    state: CRITICAL_PLACEMENT_EPOCH_STATE.AVAILABLE,
    value: selectLatestPublishedMembershipEpoch(publications.rows),
  });
}

/**
 * Project critical-placement convergence for the live cluster. Projection
 * only: it mints no readiness phase, releases no barrier, and derives nothing
 * from nodes.status, publication counts, or coverage. The answer is the
 * owner's three-state evidence vocabulary; this module adds only WHERE the
 * rows came from and whether they could be read at all.
 *
 * @param {Object} options
 * @param {Object|null} [options.systemTableCache]
 * @return {Object} frozen observation
 */
const ABSENT_REASON = null;

/**
 * The observation's reason codes, computed as one dense decision rather than
 * accumulated from an empty state: each surface answers its own clause and
 * absent clauses drop out. Order is stable — unreadable surfaces first,
 * PROJECTED only when both evidence surfaces were read, the epoch stamp last.
 *
 * @param {Object} facts
 * @return {string[]} frozen reason codes
 */
function resolveObservationReasonCodes(facts) {
  return Object.freeze([
    facts.servicesReadable ?
      ABSENT_REASON :
      CRITICAL_PLACEMENT_OBSERVATION_REASON.SERVICES_EVIDENCE_UNREADABLE,
    facts.partitionsReadable ?
      ABSENT_REASON :
      CRITICAL_PLACEMENT_OBSERVATION_REASON
        .PARTITION_POLICY_EVIDENCE_UNREADABLE,
    facts.servicesReadable && facts.partitionsReadable ?
      CRITICAL_PLACEMENT_OBSERVATION_REASON.PROJECTED :
      ABSENT_REASON,
    facts.epochAvailable ?
      ABSENT_REASON :
      CRITICAL_PLACEMENT_OBSERVATION_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE,
  ].filter((reasonCode) => reasonCode !== ABSENT_REASON));
}

function observeCriticalPlacement(options = {}) {
  const membershipEpoch = readMembershipEpochStamp(options.systemTableCache);
  const services = readTableRows(
    options.systemTableCache,
    SYSTEM_TABLE_NAME.SERVICES,
  );
  const partitions = readTableRows(
    options.systemTableCache,
    SYSTEM_TABLE_NAME.PARTITIONS,
  );
  const reasonCodes = resolveObservationReasonCodes({
    servicesReadable: services.readable,
    partitionsReadable: partitions.readable,
    epochAvailable:
      membershipEpoch.state === CRITICAL_PLACEMENT_EPOCH_STATE.AVAILABLE,
  });
  if (!services.readable || !partitions.readable) {
    // Either evidence surface unreadable makes the whole observation UNKNOWN:
    // holders without a requirement answer nothing, and a requirement without
    // holders measures nothing. Never KNOWN_NOT_CONVERGED — that would be a
    // verdict minted from evidence that was not read.
    return Object.freeze({
      evidenceState: CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN,
      converged: false,
      reasonCodes,
      pendingPartitionIds: Object.freeze([]),
      unknownPartitionIds: Object.freeze([]),
      observedPartitionCount: 0,
      membershipEpoch,
    });
  }
  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: services.rows,
    partitionRows: partitions.rows,
  });
  return Object.freeze({
    evidenceState: convergence.evidenceState,
    converged: convergence.converged,
    reasonCodes,
    pendingPartitionIds: convergence.pendingPartitionIds,
    unknownPartitionIds: convergence.unknownPartitionIds,
    observedPartitionCount: convergence.partitions.length,
    membershipEpoch,
  });
}

/**
 * The currency of one critical-placement observation against the current
 * membership publication epoch — the single owned boundary between this
 * evidence and any consumer that would authorize on it. The consumer's
 * current epoch is the fence's snapshot side; the observation's stamp is the
 * observed side, so evidence computed under a superseded membership resolves
 * STALE, evidence from a membership the consumer has not yet seen resolves
 * FUTURE, and an UNAVAILABLE stamp resolves UNKNOWN. Only a CURRENT fence
 * (isMembershipEpochFenceCurrent) may let KNOWN_CONVERGED authorize; the
 * fence vocabulary belongs to membership-epoch-contract.js and is reused,
 * never reimplemented.
 *
 * @param {Object|null} observation an observeCriticalPlacement result
 * @param {number} [currentPublicationEpoch] the consumer's current epoch
 * @return {Object} frozen membership epoch fence
 */
function resolveCriticalPlacementEvidenceCurrency(
  observation, currentPublicationEpoch,
) {
  const stamp = observation?.membershipEpoch;
  return buildMembershipEpochFence({
    membershipEpochSnapshot: {
      publicationEpoch: currentPublicationEpoch,
      publicationEpochState: MEMBERSHIP_EPOCH_VALUE_STATE.AVAILABLE,
    },
    observedPublicationEpoch:
      stamp?.state === CRITICAL_PLACEMENT_EPOCH_STATE.AVAILABLE ?
        stamp.value :
        undefined,
  });
}

export {
  CRITICAL_PLACEMENT_EPOCH_STATE,
  CRITICAL_PLACEMENT_OBSERVATION_REASON,
  observeCriticalPlacement,
  resolveCriticalPlacementEvidenceCurrency,
};
