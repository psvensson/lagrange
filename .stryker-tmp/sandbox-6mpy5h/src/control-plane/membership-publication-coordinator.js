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
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF, WORKFLOW_STEP } from '../constants/index.js';
import { AuthoritativeControlPlaneView } from './authoritative-control-plane-view.js';
import { buildActiveMembershipSnapshot, buildReadinessByNodeId, resolveActiveNodeViews, resolveCanonicalActiveNodeIds, resolvePriorityRecoveryActiveNodeCohort } from './active-node-projection.js';
import { buildMembershipLifecycleSummary, MEMBERSHIP_MEMBER_STATE, MEMBERSHIP_LIFECYCLE_STATE } from './membership-lifecycle-constants.js';
import { normalizeControlPlanePublicationRow, normalizeServiceRow, serializeControlPlanePublicationRow } from './system-row-normalizers.js';
import { CONTROL_PLANE_PUBLICATION_STATUS, mergeControlPlanePublicationRows, publicationRowSatisfiesDesiredState } from './control-plane-publication-merge.js';
import { hasPriorityRecoverySpreadGap, shouldUseAuthoritativePriorityRecoveryRediscovery } from './priority-recovery-snapshot.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from './control-plane-readiness-constants.js';
import { buildRecoveryProtocolSnapshot } from './recovery-protocol-snapshot.js';
import { PRIORITY_CONTROL_PLANE_TABLE_IDS, buildPartitionRowByPartitionId, isPriorityControlPlanePartition, resolvePriorityControlPlanePartitionIds } from '../bootstrap/system-partition-classification.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { DurableWorkflowCoordinator } from '../workflow/durable-workflow-coordinator.js';
import { OwnerKeyReconcileQueue } from '../workflow/owner-key-reconcile-queue.js';
import { OperationLane } from '../workflow/operation-lane.js';
import { isCoordinatorOwnedOperationType } from '../rebalancer/replica-status.js';
const MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL = Object.freeze(stryMutAct_9fa48("67339") ? {} : (stryCov_9fa48("67339"), {
  EMPTY: stryMutAct_9fa48("67340") ? "Stryker was here!" : (stryCov_9fa48("67340"), ""),
  MEMBERSHIP_PUBLICATION: stryMutAct_9fa48("67341") ? "" : (stryCov_9fa48("67341"), "membership-publication:"),
  EMPTY_2: stryMutAct_9fa48("67342") ? "" : (stryCov_9fa48("67342"), ":"),
  MEMBERSHIP_PUBLICATION_RECONCILE: stryMutAct_9fa48("67343") ? "" : (stryCov_9fa48("67343"), "membership-publication-reconcile"),
  MEMBERSHIP_PUBLICATION_ACKNOWLEDGEMENT: stryMutAct_9fa48("67344") ? "" : (stryCov_9fa48("67344"), "membership-publication-acknowledgement"),
  MANUAL: stryMutAct_9fa48("67345") ? "" : (stryCov_9fa48("67345"), "manual")
}));
const MEMBERSHIP_PUBLICATION_KIND = stryMutAct_9fa48("67346") ? "" : (stryCov_9fa48("67346"), 'cluster_membership');
const MEMBERSHIP_PUBLICATION_OWNER_KEY = stryMutAct_9fa48("67347") ? `` : (stryCov_9fa48("67347"), `membership-publication:${MEMBERSHIP_PUBLICATION_KIND}`);
const MEMBERSHIP_PUBLICATION_STATUS = CONTROL_PLANE_PUBLICATION_STATUS;
const MEMBERSHIP_PUBLICATION_READ_PROFILE = Object.freeze(stryMutAct_9fa48("67348") ? {} : (stryCov_9fa48("67348"), {
  DIAGNOSTICS: stryMutAct_9fa48("67349") ? "" : (stryCov_9fa48("67349"), 'diagnostics'),
  PLANNING: stryMutAct_9fa48("67350") ? "" : (stryCov_9fa48("67350"), 'planning')
}));
const MEMBERSHIP_PUBLICATION_WORKFLOW_STEP = Object.freeze(stryMutAct_9fa48("67351") ? {} : (stryCov_9fa48("67351"), {
  IDLE: stryMutAct_9fa48("67352") ? "" : (stryCov_9fa48("67352"), 'IDLE'),
  DERIVING: stryMutAct_9fa48("67353") ? "" : (stryCov_9fa48("67353"), 'DERIVING'),
  OPEN: stryMutAct_9fa48("67354") ? "" : (stryCov_9fa48("67354"), 'OPEN')
}));
const PUBLICATION_WRITE_MAX_ATTEMPTS = 3;
const PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT = 3;
const PUBLICATION_REASON_ACK_TIMEOUT_EXCEEDED = stryMutAct_9fa48("67355") ? "" : (stryCov_9fa48("67355"), 'ack_timeout_exceeded');
const PUBLICATION_WORKFLOW_REASON = Object.freeze(stryMutAct_9fa48("67356") ? {} : (stryCov_9fa48("67356"), {
  DERIVE_MEMBERSHIP_PUBLICATION: stryMutAct_9fa48("67357") ? "" : (stryCov_9fa48("67357"), 'derive-membership-publication'),
  PERSIST_OPEN_PUBLICATION: stryMutAct_9fa48("67358") ? "" : (stryCov_9fa48("67358"), 'persist-open-publication')
}));
function normalizeNodeIdList(values = stryMutAct_9fa48("67359") ? ["Stryker was here"] : (stryCov_9fa48("67359"), [])) {
  if (stryMutAct_9fa48("67360")) {
    {}
  } else {
    stryCov_9fa48("67360");
    return stryMutAct_9fa48("67361") ? [...new Set((Array.isArray(values) ? values : []).map(value => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim()).filter(value => value.length > NUM.ZERO))] : (stryCov_9fa48("67361"), (stryMutAct_9fa48("67362") ? [] : (stryCov_9fa48("67362"), [...new Set(stryMutAct_9fa48("67363") ? (Array.isArray(values) ? values : []).map(value => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim()) : (stryCov_9fa48("67363"), (Array.isArray(values) ? values : stryMutAct_9fa48("67364") ? ["Stryker was here"] : (stryCov_9fa48("67364"), [])).map(stryMutAct_9fa48("67365") ? () => undefined : (stryCov_9fa48("67365"), value => stryMutAct_9fa48("67366") ? String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY) : (stryCov_9fa48("67366"), String(stryMutAct_9fa48("67369") ? value && MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY : stryMutAct_9fa48("67368") ? false : stryMutAct_9fa48("67367") ? true : (stryCov_9fa48("67367", "67368", "67369"), value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY)).trim()))).filter(stryMutAct_9fa48("67370") ? () => undefined : (stryCov_9fa48("67370"), value => stryMutAct_9fa48("67374") ? value.length <= NUM.ZERO : stryMutAct_9fa48("67373") ? value.length >= NUM.ZERO : stryMutAct_9fa48("67372") ? false : stryMutAct_9fa48("67371") ? true : (stryCov_9fa48("67371", "67372", "67373", "67374"), value.length > NUM.ZERO)))))])).sort());
  }
}
function normalizeStringList(values = stryMutAct_9fa48("67375") ? ["Stryker was here"] : (stryCov_9fa48("67375"), [])) {
  if (stryMutAct_9fa48("67376")) {
    {}
  } else {
    stryCov_9fa48("67376");
    return stryMutAct_9fa48("67377") ? [...new Set((Array.isArray(values) ? values : []).map(value => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim()).filter(value => value.length > NUM.ZERO))] : (stryCov_9fa48("67377"), (stryMutAct_9fa48("67378") ? [] : (stryCov_9fa48("67378"), [...new Set(stryMutAct_9fa48("67379") ? (Array.isArray(values) ? values : []).map(value => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim()) : (stryCov_9fa48("67379"), (Array.isArray(values) ? values : stryMutAct_9fa48("67380") ? ["Stryker was here"] : (stryCov_9fa48("67380"), [])).map(stryMutAct_9fa48("67381") ? () => undefined : (stryCov_9fa48("67381"), value => stryMutAct_9fa48("67382") ? String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY) : (stryCov_9fa48("67382"), String(stryMutAct_9fa48("67385") ? value && MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY : stryMutAct_9fa48("67384") ? false : stryMutAct_9fa48("67383") ? true : (stryCov_9fa48("67383", "67384", "67385"), value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY)).trim()))).filter(stryMutAct_9fa48("67386") ? () => undefined : (stryCov_9fa48("67386"), value => stryMutAct_9fa48("67390") ? value.length <= NUM.ZERO : stryMutAct_9fa48("67389") ? value.length >= NUM.ZERO : stryMutAct_9fa48("67388") ? false : stryMutAct_9fa48("67387") ? true : (stryCov_9fa48("67387", "67388", "67389", "67390"), value.length > NUM.ZERO)))))])).sort());
  }
}
function listEquals(left = stryMutAct_9fa48("67391") ? ["Stryker was here"] : (stryCov_9fa48("67391"), []), right = stryMutAct_9fa48("67392") ? ["Stryker was here"] : (stryCov_9fa48("67392"), [])) {
  if (stryMutAct_9fa48("67393")) {
    {}
  } else {
    stryCov_9fa48("67393");
    const normalizedLeft = normalizeNodeIdList(left);
    const normalizedRight = normalizeNodeIdList(right);
    if (stryMutAct_9fa48("67396") ? normalizedLeft.length === normalizedRight.length : stryMutAct_9fa48("67395") ? false : stryMutAct_9fa48("67394") ? true : (stryCov_9fa48("67394", "67395", "67396"), normalizedLeft.length !== normalizedRight.length)) {
      if (stryMutAct_9fa48("67397")) {
        {}
      } else {
        stryCov_9fa48("67397");
        return stryMutAct_9fa48("67398") ? true : (stryCov_9fa48("67398"), false);
      }
    }
    return stryMutAct_9fa48("67399") ? normalizedLeft.some((value, index) => value === normalizedRight[index]) : (stryCov_9fa48("67399"), normalizedLeft.every(stryMutAct_9fa48("67400") ? () => undefined : (stryCov_9fa48("67400"), (value, index) => stryMutAct_9fa48("67403") ? value !== normalizedRight[index] : stryMutAct_9fa48("67402") ? false : stryMutAct_9fa48("67401") ? true : (stryCov_9fa48("67401", "67402", "67403"), value === normalizedRight[index]))));
  }
}
function normalizePositiveInteger(value, fallback = null) {
  if (stryMutAct_9fa48("67404")) {
    {}
  } else {
    stryCov_9fa48("67404");
    const normalized = Number(value);
    if (stryMutAct_9fa48("67407") ? Number.isFinite(normalized) || normalized >= NUM.ZERO : stryMutAct_9fa48("67406") ? false : stryMutAct_9fa48("67405") ? true : (stryCov_9fa48("67405", "67406", "67407"), Number.isFinite(normalized) && (stryMutAct_9fa48("67410") ? normalized < NUM.ZERO : stryMutAct_9fa48("67409") ? normalized > NUM.ZERO : stryMutAct_9fa48("67408") ? true : (stryCov_9fa48("67408", "67409", "67410"), normalized >= NUM.ZERO)))) {
      if (stryMutAct_9fa48("67411")) {
        {}
      } else {
        stryCov_9fa48("67411");
        return Math.trunc(normalized);
      }
    }
    return fallback;
  }
}
function buildTransitionHistoryEntry({
  state,
  reasonCode,
  at,
  metadata
} = {}) {
  if (stryMutAct_9fa48("67412")) {
    {}
  } else {
    stryCov_9fa48("67412");
    const entry = stryMutAct_9fa48("67413") ? {} : (stryCov_9fa48("67413"), {
      state: String(stryMutAct_9fa48("67416") ? state && MEMBERSHIP_PUBLICATION_STATUS.OPEN : stryMutAct_9fa48("67415") ? false : stryMutAct_9fa48("67414") ? true : (stryCov_9fa48("67414", "67415", "67416"), state || MEMBERSHIP_PUBLICATION_STATUS.OPEN)),
      at: normalizePositiveInteger(at, Date.now())
    });
    if (stryMutAct_9fa48("67419") ? typeof reasonCode === TYPEOF.STRING || reasonCode.length > NUM.ZERO : stryMutAct_9fa48("67418") ? false : stryMutAct_9fa48("67417") ? true : (stryCov_9fa48("67417", "67418", "67419"), (stryMutAct_9fa48("67421") ? typeof reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("67420") ? true : (stryCov_9fa48("67420", "67421"), typeof reasonCode === TYPEOF.STRING)) && (stryMutAct_9fa48("67424") ? reasonCode.length <= NUM.ZERO : stryMutAct_9fa48("67423") ? reasonCode.length >= NUM.ZERO : stryMutAct_9fa48("67422") ? true : (stryCov_9fa48("67422", "67423", "67424"), reasonCode.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("67425")) {
        {}
      } else {
        stryCov_9fa48("67425");
        entry.reasonCode = reasonCode;
      }
    }
    if (stryMutAct_9fa48("67428") ? metadata || typeof metadata === TYPEOF.OBJECT : stryMutAct_9fa48("67427") ? false : stryMutAct_9fa48("67426") ? true : (stryCov_9fa48("67426", "67427", "67428"), metadata && (stryMutAct_9fa48("67430") ? typeof metadata !== TYPEOF.OBJECT : stryMutAct_9fa48("67429") ? true : (stryCov_9fa48("67429", "67430"), typeof metadata === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("67431")) {
        {}
      } else {
        stryCov_9fa48("67431");
        Object.assign(entry, metadata);
      }
    }
    return entry;
  }
}
function didOptionalSourceVersionChange(previousValue, nextValue) {
  if (stryMutAct_9fa48("67432")) {
    {}
  } else {
    stryCov_9fa48("67432");
    if (stryMutAct_9fa48("67435") ? nextValue === null && nextValue === undefined : stryMutAct_9fa48("67434") ? false : stryMutAct_9fa48("67433") ? true : (stryCov_9fa48("67433", "67434", "67435"), (stryMutAct_9fa48("67437") ? nextValue !== null : stryMutAct_9fa48("67436") ? false : (stryCov_9fa48("67436", "67437"), nextValue === null)) || (stryMutAct_9fa48("67439") ? nextValue !== undefined : stryMutAct_9fa48("67438") ? false : (stryCov_9fa48("67438", "67439"), nextValue === undefined)))) {
      if (stryMutAct_9fa48("67440")) {
        {}
      } else {
        stryCov_9fa48("67440");
        return stryMutAct_9fa48("67441") ? true : (stryCov_9fa48("67441"), false);
      }
    }
    return stryMutAct_9fa48("67444") ? previousValue === nextValue : stryMutAct_9fa48("67443") ? false : stryMutAct_9fa48("67442") ? true : (stryCov_9fa48("67442", "67443", "67444"), previousValue !== nextValue);
  }
}
function hasPublicationTimedOut(publicationRow, options = {}) {
  if (stryMutAct_9fa48("67445")) {
    {}
  } else {
    stryCov_9fa48("67445");
    const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
    const timeoutMs = normalizePositiveInteger(options.timeoutMs, null);
    const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
    const createdAt = normalizePositiveInteger(stryMutAct_9fa48("67446") ? publicationRow.created_at : (stryCov_9fa48("67446"), publicationRow?.created_at), normalizePositiveInteger(stryMutAct_9fa48("67447") ? publicationRow.createdAt : (stryCov_9fa48("67447"), publicationRow?.createdAt), null));
    if (stryMutAct_9fa48("67450") ? !timeoutMs && !createdAt : stryMutAct_9fa48("67449") ? false : stryMutAct_9fa48("67448") ? true : (stryCov_9fa48("67448", "67449", "67450"), (stryMutAct_9fa48("67451") ? timeoutMs : (stryCov_9fa48("67451"), !timeoutMs)) || (stryMutAct_9fa48("67452") ? createdAt : (stryCov_9fa48("67452"), !createdAt)))) {
      if (stryMutAct_9fa48("67453")) {
        {}
      } else {
        stryCov_9fa48("67453");
        return stryMutAct_9fa48("67454") ? true : (stryCov_9fa48("67454"), false);
      }
    }
    if (stryMutAct_9fa48("67457") ? (normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED || normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED) && normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("67456") ? false : stryMutAct_9fa48("67455") ? true : (stryCov_9fa48("67455", "67456", "67457"), (stryMutAct_9fa48("67459") ? normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED && normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("67458") ? false : (stryCov_9fa48("67458", "67459"), (stryMutAct_9fa48("67461") ? normalizedPublication.status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("67460") ? false : (stryCov_9fa48("67460", "67461"), normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) || (stryMutAct_9fa48("67463") ? normalizedPublication.status !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("67462") ? false : (stryCov_9fa48("67462", "67463"), normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED)))) || (stryMutAct_9fa48("67465") ? normalizedPublication.status !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("67464") ? false : (stryCov_9fa48("67464", "67465"), normalizedPublication.status === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED)))) {
      if (stryMutAct_9fa48("67466")) {
        {}
      } else {
        stryCov_9fa48("67466");
        return stryMutAct_9fa48("67467") ? true : (stryCov_9fa48("67467"), false);
      }
    }
    return stryMutAct_9fa48("67471") ? nowMs - createdAt < timeoutMs : stryMutAct_9fa48("67470") ? nowMs - createdAt > timeoutMs : stryMutAct_9fa48("67469") ? false : stryMutAct_9fa48("67468") ? true : (stryCov_9fa48("67468", "67469", "67470", "67471"), (stryMutAct_9fa48("67472") ? nowMs + createdAt : (stryCov_9fa48("67472"), nowMs - createdAt)) >= timeoutMs);
  }
}
function abandonMembershipPublication(options = {}) {
  if (stryMutAct_9fa48("67473")) {
    {}
  } else {
    stryCov_9fa48("67473");
    const publicationRow = stryMutAct_9fa48("67476") ? options.publicationRow && {} : stryMutAct_9fa48("67475") ? false : stryMutAct_9fa48("67474") ? true : (stryCov_9fa48("67474", "67475", "67476"), options.publicationRow || {});
    const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
    const reasonCode = (stryMutAct_9fa48("67479") ? typeof options.reasonCode === TYPEOF.STRING || options.reasonCode.length > 0 : stryMutAct_9fa48("67478") ? false : stryMutAct_9fa48("67477") ? true : (stryCov_9fa48("67477", "67478", "67479"), (stryMutAct_9fa48("67481") ? typeof options.reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("67480") ? true : (stryCov_9fa48("67480", "67481"), typeof options.reasonCode === TYPEOF.STRING)) && (stryMutAct_9fa48("67484") ? options.reasonCode.length <= 0 : stryMutAct_9fa48("67483") ? options.reasonCode.length >= 0 : stryMutAct_9fa48("67482") ? true : (stryCov_9fa48("67482", "67483", "67484"), options.reasonCode.length > 0)))) ? options.reasonCode : PUBLICATION_REASON_ACK_TIMEOUT_EXCEEDED;
    const existingHistory = Array.isArray(publicationRow.transition_history) ? stryMutAct_9fa48("67485") ? publicationRow.transition_history : (stryCov_9fa48("67485"), publicationRow.transition_history.slice()) : normalizeControlPlanePublicationRow(publicationRow).transitionHistory;
    return stryMutAct_9fa48("67486") ? {} : (stryCov_9fa48("67486"), {
      ...publicationRow,
      status: MEMBERSHIP_PUBLICATION_STATUS.ABANDONED,
      reason_code: reasonCode,
      updated_at: nowMs,
      closed_at: nowMs,
      transition_history: stryMutAct_9fa48("67487") ? [] : (stryCov_9fa48("67487"), [...existingHistory, buildTransitionHistoryEntry(stryMutAct_9fa48("67488") ? {} : (stryCov_9fa48("67488"), {
        state: MEMBERSHIP_PUBLICATION_STATUS.ABANDONED,
        reasonCode,
        at: nowMs
      }))])
    });
  }
}
function normalizeLatestPublicationRow(row) {
  if (stryMutAct_9fa48("67489")) {
    {}
  } else {
    stryCov_9fa48("67489");
    if (stryMutAct_9fa48("67492") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("67491") ? false : stryMutAct_9fa48("67490") ? true : (stryCov_9fa48("67490", "67491", "67492"), (stryMutAct_9fa48("67493") ? row : (stryCov_9fa48("67493"), !row)) || (stryMutAct_9fa48("67495") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("67494") ? false : (stryCov_9fa48("67494", "67495"), typeof row !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("67496")) {
        {}
      } else {
        stryCov_9fa48("67496");
        return null;
      }
    }
    return normalizeControlPlanePublicationRow(row);
  }
}
async function safelyGetLatestMembershipPublicationRow(coordinator, options = {}) {
  if (stryMutAct_9fa48("67497")) {
    {}
  } else {
    stryCov_9fa48("67497");
    if (stryMutAct_9fa48("67500") ? !coordinator && typeof coordinator.getLatestPublicationRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("67499") ? false : stryMutAct_9fa48("67498") ? true : (stryCov_9fa48("67498", "67499", "67500"), (stryMutAct_9fa48("67501") ? coordinator : (stryCov_9fa48("67501"), !coordinator)) || (stryMutAct_9fa48("67503") ? typeof coordinator.getLatestPublicationRow === TYPEOF.FUNCTION : stryMutAct_9fa48("67502") ? false : (stryCov_9fa48("67502", "67503"), typeof coordinator.getLatestPublicationRow !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("67504")) {
        {}
      } else {
        stryCov_9fa48("67504");
        return null;
      }
    }
    try {
      if (stryMutAct_9fa48("67505")) {
        {}
      } else {
        stryCov_9fa48("67505");
        return await coordinator.getLatestPublicationRow(options);
      }
    } catch (_error) {
      if (stryMutAct_9fa48("67506")) {
        {}
      } else {
        stryCov_9fa48("67506");
        return null;
      }
    }
  }
}
async function readMembershipPublicationConvergence(readinessService, nodeId, observedAt) {
  if (stryMutAct_9fa48("67507")) {
    {}
  } else {
    stryCov_9fa48("67507");
    if (stryMutAct_9fa48("67510") ? !readinessService && typeof readinessService !== TYPEOF.OBJECT : stryMutAct_9fa48("67509") ? false : stryMutAct_9fa48("67508") ? true : (stryCov_9fa48("67508", "67509", "67510"), (stryMutAct_9fa48("67511") ? readinessService : (stryCov_9fa48("67511"), !readinessService)) || (stryMutAct_9fa48("67513") ? typeof readinessService === TYPEOF.OBJECT : stryMutAct_9fa48("67512") ? false : (stryCov_9fa48("67512", "67513"), typeof readinessService !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("67514")) {
        {}
      } else {
        stryCov_9fa48("67514");
        return null;
      }
    }
    if (stryMutAct_9fa48("67517") ? typeof readinessService.getMembershipPublicationDiagnosticsSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("67516") ? false : stryMutAct_9fa48("67515") ? true : (stryCov_9fa48("67515", "67516", "67517"), typeof readinessService.getMembershipPublicationDiagnosticsSync === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("67518")) {
        {}
      } else {
        stryCov_9fa48("67518");
        return readinessService.getMembershipPublicationDiagnosticsSync(nodeId, observedAt);
      }
    }
    if (stryMutAct_9fa48("67521") ? typeof readinessService.getMembershipPublicationDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("67520") ? false : stryMutAct_9fa48("67519") ? true : (stryCov_9fa48("67519", "67520", "67521"), typeof readinessService.getMembershipPublicationDiagnostics === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("67522")) {
        {}
      } else {
        stryCov_9fa48("67522");
        return readinessService.getMembershipPublicationDiagnostics(nodeId, observedAt);
      }
    }
    return null;
  }
}
function publicationRowIncludesNode(publicationRow, nodeId) {
  if (stryMutAct_9fa48("67523")) {
    {}
  } else {
    stryCov_9fa48("67523");
    const normalizedPublication = normalizeLatestPublicationRow(publicationRow);
    const normalizedNodeId = stryMutAct_9fa48("67524") ? String(nodeId || '') : (stryCov_9fa48("67524"), String(stryMutAct_9fa48("67527") ? nodeId && '' : stryMutAct_9fa48("67526") ? false : stryMutAct_9fa48("67525") ? true : (stryCov_9fa48("67525", "67526", "67527"), nodeId || (stryMutAct_9fa48("67528") ? "Stryker was here!" : (stryCov_9fa48("67528"), '')))).trim());
    if (stryMutAct_9fa48("67531") ? false : stryMutAct_9fa48("67530") ? true : stryMutAct_9fa48("67529") ? normalizedPublication : (stryCov_9fa48("67529", "67530", "67531"), !normalizedPublication)) {
      if (stryMutAct_9fa48("67532")) {
        {}
      } else {
        stryCov_9fa48("67532");
        return stryMutAct_9fa48("67533") ? true : (stryCov_9fa48("67533"), false);
      }
    }
    if (stryMutAct_9fa48("67536") ? false : stryMutAct_9fa48("67535") ? true : stryMutAct_9fa48("67534") ? normalizedNodeId : (stryCov_9fa48("67534", "67535", "67536"), !normalizedNodeId)) {
      if (stryMutAct_9fa48("67537")) {
        {}
      } else {
        stryCov_9fa48("67537");
        return stryMutAct_9fa48("67538") ? false : (stryCov_9fa48("67538"), true);
      }
    }
    const publishedActiveNodeIds = normalizeNodeIdList(normalizedPublication.publishedActiveNodeIds);
    const requiredAckNodeIds = normalizeNodeIdList(normalizedPublication.requiredAckNodeIds);
    const acknowledgedNodeIds = normalizeNodeIdList(normalizedPublication.acknowledgedNodeIds);
    return stryMutAct_9fa48("67541") ? (publishedActiveNodeIds.includes(normalizedNodeId) || requiredAckNodeIds.includes(normalizedNodeId)) && acknowledgedNodeIds.includes(normalizedNodeId) : stryMutAct_9fa48("67540") ? false : stryMutAct_9fa48("67539") ? true : (stryCov_9fa48("67539", "67540", "67541"), (stryMutAct_9fa48("67543") ? publishedActiveNodeIds.includes(normalizedNodeId) && requiredAckNodeIds.includes(normalizedNodeId) : stryMutAct_9fa48("67542") ? false : (stryCov_9fa48("67542", "67543"), publishedActiveNodeIds.includes(normalizedNodeId) || requiredAckNodeIds.includes(normalizedNodeId))) || acknowledgedNodeIds.includes(normalizedNodeId));
  }
}
function normalizeTableRowsResult(result) {
  if (stryMutAct_9fa48("67544")) {
    {}
  } else {
    stryCov_9fa48("67544");
    if (stryMutAct_9fa48("67546") ? false : stryMutAct_9fa48("67545") ? true : (stryCov_9fa48("67545", "67546"), Array.isArray(result))) {
      if (stryMutAct_9fa48("67547")) {
        {}
      } else {
        stryCov_9fa48("67547");
        return result;
      }
    }
    if (stryMutAct_9fa48("67549") ? false : stryMutAct_9fa48("67548") ? true : (stryCov_9fa48("67548", "67549"), Array.isArray(stryMutAct_9fa48("67550") ? result.rows : (stryCov_9fa48("67550"), result?.rows)))) {
      if (stryMutAct_9fa48("67551")) {
        {}
      } else {
        stryCov_9fa48("67551");
        return result.rows;
      }
    }
    return stryMutAct_9fa48("67552") ? ["Stryker was here"] : (stryCov_9fa48("67552"), []);
  }
}
function resolveMembershipPublicationReadProfile(readProfile = null) {
  if (stryMutAct_9fa48("67553")) {
    {}
  } else {
    stryCov_9fa48("67553");
    return (stryMutAct_9fa48("67556") ? readProfile !== MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS : stryMutAct_9fa48("67555") ? false : stryMutAct_9fa48("67554") ? true : (stryCov_9fa48("67554", "67555", "67556"), readProfile === MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS)) ? MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS : MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING;
  }
}
function normalizeReplicaOperationView(operation) {
  if (stryMutAct_9fa48("67557")) {
    {}
  } else {
    stryCov_9fa48("67557");
    if (stryMutAct_9fa48("67560") ? !operation && typeof operation !== TYPEOF.OBJECT : stryMutAct_9fa48("67559") ? false : stryMutAct_9fa48("67558") ? true : (stryCov_9fa48("67558", "67559", "67560"), (stryMutAct_9fa48("67561") ? operation : (stryCov_9fa48("67561"), !operation)) || (stryMutAct_9fa48("67563") ? typeof operation === TYPEOF.OBJECT : stryMutAct_9fa48("67562") ? false : (stryCov_9fa48("67562", "67563"), typeof operation !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("67564")) {
        {}
      } else {
        stryCov_9fa48("67564");
        return null;
      }
    }
    const stepsHistory = Array.isArray(operation.stepsHistory) ? operation.stepsHistory : Array.isArray(operation.steps_history) ? operation.steps_history : stryMutAct_9fa48("67565") ? ["Stryker was here"] : (stryCov_9fa48("67565"), []);
    return stryMutAct_9fa48("67566") ? {} : (stryCov_9fa48("67566"), {
      operationId: stryMutAct_9fa48("67569") ? (operation.operationId || operation.operation_id) && null : stryMutAct_9fa48("67568") ? false : stryMutAct_9fa48("67567") ? true : (stryCov_9fa48("67567", "67568", "67569"), (stryMutAct_9fa48("67571") ? operation.operationId && operation.operation_id : stryMutAct_9fa48("67570") ? false : (stryCov_9fa48("67570", "67571"), operation.operationId || operation.operation_id)) || null),
      type: stryMutAct_9fa48("67574") ? operation.type && null : stryMutAct_9fa48("67573") ? false : stryMutAct_9fa48("67572") ? true : (stryCov_9fa48("67572", "67573", "67574"), operation.type || null),
      partitionId: stryMutAct_9fa48("67577") ? (operation.partitionId || operation.partition_id) && null : stryMutAct_9fa48("67576") ? false : stryMutAct_9fa48("67575") ? true : (stryCov_9fa48("67575", "67576", "67577"), (stryMutAct_9fa48("67579") ? operation.partitionId && operation.partition_id : stryMutAct_9fa48("67578") ? false : (stryCov_9fa48("67578", "67579"), operation.partitionId || operation.partition_id)) || null),
      replicaId: stryMutAct_9fa48("67582") ? (operation.replicaId || operation.replica_id) && null : stryMutAct_9fa48("67581") ? false : stryMutAct_9fa48("67580") ? true : (stryCov_9fa48("67580", "67581", "67582"), (stryMutAct_9fa48("67584") ? operation.replicaId && operation.replica_id : stryMutAct_9fa48("67583") ? false : (stryCov_9fa48("67583", "67584"), operation.replicaId || operation.replica_id)) || null),
      sourceNodeId: stryMutAct_9fa48("67587") ? (operation.sourceNodeId || operation.source_node_id) && null : stryMutAct_9fa48("67586") ? false : stryMutAct_9fa48("67585") ? true : (stryCov_9fa48("67585", "67586", "67587"), (stryMutAct_9fa48("67589") ? operation.sourceNodeId && operation.source_node_id : stryMutAct_9fa48("67588") ? false : (stryCov_9fa48("67588", "67589"), operation.sourceNodeId || operation.source_node_id)) || null),
      targetNodeId: stryMutAct_9fa48("67592") ? (operation.targetNodeId || operation.target_node_id) && null : stryMutAct_9fa48("67591") ? false : stryMutAct_9fa48("67590") ? true : (stryCov_9fa48("67590", "67591", "67592"), (stryMutAct_9fa48("67594") ? operation.targetNodeId && operation.target_node_id : stryMutAct_9fa48("67593") ? false : (stryCov_9fa48("67593", "67594"), operation.targetNodeId || operation.target_node_id)) || null),
      status: stryMutAct_9fa48("67597") ? operation.status && null : stryMutAct_9fa48("67596") ? false : stryMutAct_9fa48("67595") ? true : (stryCov_9fa48("67595", "67596", "67597"), operation.status || null),
      workflowStep: stryMutAct_9fa48("67600") ? (operation.workflowStep || operation.workflow_step) && null : stryMutAct_9fa48("67599") ? false : stryMutAct_9fa48("67598") ? true : (stryCov_9fa48("67598", "67599", "67600"), (stryMutAct_9fa48("67602") ? operation.workflowStep && operation.workflow_step : stryMutAct_9fa48("67601") ? false : (stryCov_9fa48("67601", "67602"), operation.workflowStep || operation.workflow_step)) || null),
      createdAt: stryMutAct_9fa48("67605") ? operation.createdAt && operation.created_at : stryMutAct_9fa48("67604") ? false : stryMutAct_9fa48("67603") ? true : (stryCov_9fa48("67603", "67604", "67605"), operation.createdAt || operation.created_at),
      updatedAt: stryMutAct_9fa48("67608") ? operation.updatedAt && operation.updated_at : stryMutAct_9fa48("67607") ? false : stryMutAct_9fa48("67606") ? true : (stryCov_9fa48("67606", "67607", "67608"), operation.updatedAt || operation.updated_at),
      completedAt: stryMutAct_9fa48("67611") ? operation.completedAt && operation.completed_at : stryMutAct_9fa48("67610") ? false : stryMutAct_9fa48("67609") ? true : (stryCov_9fa48("67609", "67610", "67611"), operation.completedAt || operation.completed_at),
      errorMessage: stryMutAct_9fa48("67614") ? (operation.errorMessage || operation.error_message) && null : stryMutAct_9fa48("67613") ? false : stryMutAct_9fa48("67612") ? true : (stryCov_9fa48("67612", "67613", "67614"), (stryMutAct_9fa48("67616") ? operation.errorMessage && operation.error_message : stryMutAct_9fa48("67615") ? false : (stryCov_9fa48("67615", "67616"), operation.errorMessage || operation.error_message)) || null),
      stepsHistory,
      entityType: stryMutAct_9fa48("67619") ? (operation.entityType || operation.entity_type) && null : stryMutAct_9fa48("67618") ? false : stryMutAct_9fa48("67617") ? true : (stryCov_9fa48("67617", "67618", "67619"), (stryMutAct_9fa48("67621") ? operation.entityType && operation.entity_type : stryMutAct_9fa48("67620") ? false : (stryCov_9fa48("67620", "67621"), operation.entityType || operation.entity_type)) || null),
      entityId: stryMutAct_9fa48("67624") ? (operation.entityId || operation.entity_id) && null : stryMutAct_9fa48("67623") ? false : stryMutAct_9fa48("67622") ? true : (stryCov_9fa48("67622", "67623", "67624"), (stryMutAct_9fa48("67626") ? operation.entityId && operation.entity_id : stryMutAct_9fa48("67625") ? false : (stryCov_9fa48("67625", "67626"), operation.entityId || operation.entity_id)) || null)
    });
  }
}
const mergePublicationRows = mergeControlPlanePublicationRows;
function buildPublicationReadOptions(options = {}) {
  if (stryMutAct_9fa48("67627")) {
    {}
  } else {
    stryCov_9fa48("67627");
    return stryMutAct_9fa48("67628") ? {} : (stryCov_9fa48("67628"), {
      ...options,
      preferAuthoritativeRead: stryMutAct_9fa48("67629") ? false : (stryCov_9fa48("67629"), true),
      preferOwnerRpcRead: stryMutAct_9fa48("67630") ? false : (stryCov_9fa48("67630"), true),
      readProfile: resolveMembershipPublicationReadProfile(options.readProfile)
    });
  }
}
function buildMembershipPublicationEvidenceSnapshot(options = {}) {
  if (stryMutAct_9fa48("67631")) {
    {}
  } else {
    stryCov_9fa48("67631");
    return Object.freeze(stryMutAct_9fa48("67632") ? {} : (stryCov_9fa48("67632"), {
      latestPublicationRow: stryMutAct_9fa48("67635") ? options.latestPublicationRow && null : stryMutAct_9fa48("67634") ? false : stryMutAct_9fa48("67633") ? true : (stryCov_9fa48("67633", "67634", "67635"), options.latestPublicationRow || null),
      latestPublishedPublicationRow: stryMutAct_9fa48("67638") ? options.latestPublishedPublicationRow && null : stryMutAct_9fa48("67637") ? false : stryMutAct_9fa48("67636") ? true : (stryCov_9fa48("67636", "67637", "67638"), options.latestPublishedPublicationRow || null),
      nodeRows: Array.isArray(options.nodeRows) ? options.nodeRows : stryMutAct_9fa48("67639") ? ["Stryker was here"] : (stryCov_9fa48("67639"), []),
      nodeEndpointRows: Array.isArray(options.nodeEndpointRows) ? options.nodeEndpointRows : stryMutAct_9fa48("67640") ? ["Stryker was here"] : (stryCov_9fa48("67640"), []),
      serviceRows: Array.isArray(options.serviceRows) ? options.serviceRows : stryMutAct_9fa48("67641") ? ["Stryker was here"] : (stryCov_9fa48("67641"), []),
      partitionRows: Array.isArray(options.partitionRows) ? options.partitionRows : stryMutAct_9fa48("67642") ? ["Stryker was here"] : (stryCov_9fa48("67642"), []),
      readinessByNodeId: (stryMutAct_9fa48("67645") ? options.readinessByNodeId || typeof options.readinessByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("67644") ? false : stryMutAct_9fa48("67643") ? true : (stryCov_9fa48("67643", "67644", "67645"), options.readinessByNodeId && (stryMutAct_9fa48("67647") ? typeof options.readinessByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("67646") ? true : (stryCov_9fa48("67646", "67647"), typeof options.readinessByNodeId === TYPEOF.OBJECT)))) ? options.readinessByNodeId : null,
      readinessEntries: Array.isArray(options.readinessEntries) ? options.readinessEntries : stryMutAct_9fa48("67648") ? ["Stryker was here"] : (stryCov_9fa48("67648"), []),
      recoveryEpochsByNodeId: (stryMutAct_9fa48("67651") ? options.recoveryEpochsByNodeId || typeof options.recoveryEpochsByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("67650") ? false : stryMutAct_9fa48("67649") ? true : (stryCov_9fa48("67649", "67650", "67651"), options.recoveryEpochsByNodeId && (stryMutAct_9fa48("67653") ? typeof options.recoveryEpochsByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("67652") ? true : (stryCov_9fa48("67652", "67653"), typeof options.recoveryEpochsByNodeId === TYPEOF.OBJECT)))) ? options.recoveryEpochsByNodeId : null,
      connectedNodeIds: normalizeNodeIdList(options.connectedNodeIds),
      publishedActiveNodeIds: Array.isArray(options.publishedActiveNodeIds) ? options.publishedActiveNodeIds : null,
      requiredAckNodeIds: Array.isArray(options.requiredAckNodeIds) ? options.requiredAckNodeIds : null,
      acknowledgedNodeIds: normalizeNodeIdList(options.acknowledgedNodeIds),
      sourceTopologyEpoch: options.sourceTopologyEpoch,
      sourceSnapshotVersion: options.sourceSnapshotVersion,
      priorityPartitionSummary: (stryMutAct_9fa48("67656") ? options.priorityPartitionSummary || typeof options.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("67655") ? false : stryMutAct_9fa48("67654") ? true : (stryCov_9fa48("67654", "67655", "67656"), options.priorityPartitionSummary && (stryMutAct_9fa48("67658") ? typeof options.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("67657") ? true : (stryCov_9fa48("67657", "67658"), typeof options.priorityPartitionSummary === TYPEOF.OBJECT)))) ? options.priorityPartitionSummary : null,
      priorityRecoveryPlanningSnapshot: (stryMutAct_9fa48("67661") ? options.priorityRecoveryPlanningSnapshot || typeof options.priorityRecoveryPlanningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("67660") ? false : stryMutAct_9fa48("67659") ? true : (stryCov_9fa48("67659", "67660", "67661"), options.priorityRecoveryPlanningSnapshot && (stryMutAct_9fa48("67663") ? typeof options.priorityRecoveryPlanningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("67662") ? true : (stryCov_9fa48("67662", "67663"), typeof options.priorityRecoveryPlanningSnapshot === TYPEOF.OBJECT)))) ? options.priorityRecoveryPlanningSnapshot : null,
      membershipLifecycleSummary: (stryMutAct_9fa48("67666") ? options.membershipLifecycleSummary || typeof options.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("67665") ? false : stryMutAct_9fa48("67664") ? true : (stryCov_9fa48("67664", "67665", "67666"), options.membershipLifecycleSummary && (stryMutAct_9fa48("67668") ? typeof options.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("67667") ? true : (stryCov_9fa48("67667", "67668"), typeof options.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? options.membershipLifecycleSummary : null,
      publisherNodeId: String(stryMutAct_9fa48("67671") ? options.publisherNodeId && MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY : stryMutAct_9fa48("67670") ? false : stryMutAct_9fa48("67669") ? true : (stryCov_9fa48("67669", "67670", "67671"), options.publisherNodeId || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY)),
      localNodeId: String(stryMutAct_9fa48("67674") ? options.localNodeId && MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY : stryMutAct_9fa48("67673") ? false : stryMutAct_9fa48("67672") ? true : (stryCov_9fa48("67672", "67673", "67674"), options.localNodeId || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY)),
      localNodeResponsive: stryMutAct_9fa48("67677") ? options.localNodeResponsive !== true : stryMutAct_9fa48("67676") ? false : stryMutAct_9fa48("67675") ? true : (stryCov_9fa48("67675", "67676", "67677"), options.localNodeResponsive === (stryMutAct_9fa48("67678") ? false : (stryCov_9fa48("67678"), true))),
      reasonCode: (stryMutAct_9fa48("67681") ? typeof options.reasonCode === TYPEOF.STRING || options.reasonCode.length > NUM.ZERO : stryMutAct_9fa48("67680") ? false : stryMutAct_9fa48("67679") ? true : (stryCov_9fa48("67679", "67680", "67681"), (stryMutAct_9fa48("67683") ? typeof options.reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("67682") ? true : (stryCov_9fa48("67682", "67683"), typeof options.reasonCode === TYPEOF.STRING)) && (stryMutAct_9fa48("67686") ? options.reasonCode.length <= NUM.ZERO : stryMutAct_9fa48("67685") ? options.reasonCode.length >= NUM.ZERO : stryMutAct_9fa48("67684") ? true : (stryCov_9fa48("67684", "67685", "67686"), options.reasonCode.length > NUM.ZERO)))) ? options.reasonCode : null,
      nowMs: normalizePositiveInteger(options.nowMs, Date.now())
    }));
  }
}
function resolveObservedActiveNodeIds(options = {}) {
  if (stryMutAct_9fa48("67687")) {
    {}
  } else {
    stryCov_9fa48("67687");
    const publishedBaselineNodeIds = normalizeNodeIdList(options.publishedBaselineNodeIds);
    const latestPublicationRow = normalizeLatestPublicationRow(options.latestPublicationRow);
    const latestPublishedPublicationRow = normalizeLatestPublicationRow(options.latestPublishedPublicationRow);
    const observedPublishedMembershipRow = (stryMutAct_9fa48("67691") ? publishedBaselineNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("67690") ? publishedBaselineNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("67689") ? false : stryMutAct_9fa48("67688") ? true : (stryCov_9fa48("67688", "67689", "67690", "67691"), publishedBaselineNodeIds.length > NUM.ZERO)) ? stryMutAct_9fa48("67692") ? {} : (stryCov_9fa48("67692"), {
      publication_epoch: stryMutAct_9fa48("67693") ? (latestPublishedPublicationRow?.publicationEpoch ?? latestPublicationRow?.publicationEpoch) && NUM.ONE : (stryCov_9fa48("67693"), (stryMutAct_9fa48("67694") ? latestPublishedPublicationRow?.publicationEpoch && latestPublicationRow?.publicationEpoch : (stryCov_9fa48("67694"), (stryMutAct_9fa48("67695") ? latestPublishedPublicationRow.publicationEpoch : (stryCov_9fa48("67695"), latestPublishedPublicationRow?.publicationEpoch)) ?? (stryMutAct_9fa48("67696") ? latestPublicationRow.publicationEpoch : (stryCov_9fa48("67696"), latestPublicationRow?.publicationEpoch)))) ?? NUM.ONE),
      status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: publishedBaselineNodeIds
    }) : latestPublishedPublicationRow;
    const activeNodeViews = resolveActiveNodeViews(stryMutAct_9fa48("67697") ? {} : (stryCov_9fa48("67697"), {
      ...options,
      latestPublicationRow: observedPublishedMembershipRow,
      publicationRows: observedPublishedMembershipRow ? stryMutAct_9fa48("67698") ? [] : (stryCov_9fa48("67698"), [observedPublishedMembershipRow]) : stryMutAct_9fa48("67699") ? ["Stryker was here"] : (stryCov_9fa48("67699"), []),
      requirePublishedMembership: stryMutAct_9fa48("67700") ? true : (stryCov_9fa48("67700"), false)
    }));
    return stryMutAct_9fa48("67701") ? [] : (stryCov_9fa48("67701"), [...activeNodeViews.projectedActiveNodeIds]);
  }
}
function buildLatestRecoveryEpochByNodeId(recoveryEpochsByNodeId = {}) {
  if (stryMutAct_9fa48("67702")) {
    {}
  } else {
    stryCov_9fa48("67702");
    const entries = {};
    if (stryMutAct_9fa48("67705") ? !recoveryEpochsByNodeId && typeof recoveryEpochsByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("67704") ? false : stryMutAct_9fa48("67703") ? true : (stryCov_9fa48("67703", "67704", "67705"), (stryMutAct_9fa48("67706") ? recoveryEpochsByNodeId : (stryCov_9fa48("67706"), !recoveryEpochsByNodeId)) || (stryMutAct_9fa48("67708") ? typeof recoveryEpochsByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("67707") ? false : (stryCov_9fa48("67707", "67708"), typeof recoveryEpochsByNodeId !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("67709")) {
        {}
      } else {
        stryCov_9fa48("67709");
        return entries;
      }
    }
    for (const [nodeId, history] of Object.entries(recoveryEpochsByNodeId)) {
      if (stryMutAct_9fa48("67710")) {
        {}
      } else {
        stryCov_9fa48("67710");
        const epochs = Array.isArray(history) ? history : stryMutAct_9fa48("67711") ? ["Stryker was here"] : (stryCov_9fa48("67711"), []);
        const latestEpoch = stryMutAct_9fa48("67714") ? epochs[epochs.length - 1] && null : stryMutAct_9fa48("67713") ? false : stryMutAct_9fa48("67712") ? true : (stryCov_9fa48("67712", "67713", "67714"), epochs[stryMutAct_9fa48("67715") ? epochs.length + 1 : (stryCov_9fa48("67715"), epochs.length - 1)] || null);
        if (stryMutAct_9fa48("67718") ? !latestEpoch && typeof latestEpoch !== TYPEOF.OBJECT : stryMutAct_9fa48("67717") ? false : stryMutAct_9fa48("67716") ? true : (stryCov_9fa48("67716", "67717", "67718"), (stryMutAct_9fa48("67719") ? latestEpoch : (stryCov_9fa48("67719"), !latestEpoch)) || (stryMutAct_9fa48("67721") ? typeof latestEpoch === TYPEOF.OBJECT : stryMutAct_9fa48("67720") ? false : (stryCov_9fa48("67720", "67721"), typeof latestEpoch !== TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("67722")) {
            {}
          } else {
            stryCov_9fa48("67722");
            continue;
          }
        }
        const epochId = stryMutAct_9fa48("67723") ? String(latestEpoch.epochId || '') : (stryCov_9fa48("67723"), String(stryMutAct_9fa48("67726") ? latestEpoch.epochId && '' : stryMutAct_9fa48("67725") ? false : stryMutAct_9fa48("67724") ? true : (stryCov_9fa48("67724", "67725", "67726"), latestEpoch.epochId || (stryMutAct_9fa48("67727") ? "Stryker was here!" : (stryCov_9fa48("67727"), '')))).trim());
        if (stryMutAct_9fa48("67730") ? false : stryMutAct_9fa48("67729") ? true : stryMutAct_9fa48("67728") ? epochId : (stryCov_9fa48("67728", "67729", "67730"), !epochId)) {
          if (stryMutAct_9fa48("67731")) {
            {}
          } else {
            stryCov_9fa48("67731");
            continue;
          }
        }
        entries[nodeId] = stryMutAct_9fa48("67732") ? {} : (stryCov_9fa48("67732"), {
          epochId,
          open: stryMutAct_9fa48("67735") ? latestEpoch.open !== true : stryMutAct_9fa48("67734") ? false : stryMutAct_9fa48("67733") ? true : (stryCov_9fa48("67733", "67734", "67735"), latestEpoch.open === (stryMutAct_9fa48("67736") ? false : (stryCov_9fa48("67736"), true)))
        });
      }
    }
    return entries;
  }
}
function normalizePartitionIdList(values = stryMutAct_9fa48("67737") ? ["Stryker was here"] : (stryCov_9fa48("67737"), [])) {
  if (stryMutAct_9fa48("67738")) {
    {}
  } else {
    stryCov_9fa48("67738");
    return stryMutAct_9fa48("67739") ? [...new Set((Array.isArray(values) ? values : []).map(value => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim()).filter(value => value.length > NUM.ZERO))] : (stryCov_9fa48("67739"), (stryMutAct_9fa48("67740") ? [] : (stryCov_9fa48("67740"), [...new Set(stryMutAct_9fa48("67741") ? (Array.isArray(values) ? values : []).map(value => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim()) : (stryCov_9fa48("67741"), (Array.isArray(values) ? values : stryMutAct_9fa48("67742") ? ["Stryker was here"] : (stryCov_9fa48("67742"), [])).map(stryMutAct_9fa48("67743") ? () => undefined : (stryCov_9fa48("67743"), value => stryMutAct_9fa48("67744") ? String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY) : (stryCov_9fa48("67744"), String(stryMutAct_9fa48("67747") ? value && MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY : stryMutAct_9fa48("67746") ? false : stryMutAct_9fa48("67745") ? true : (stryCov_9fa48("67745", "67746", "67747"), value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY)).trim()))).filter(stryMutAct_9fa48("67748") ? () => undefined : (stryCov_9fa48("67748"), value => stryMutAct_9fa48("67752") ? value.length <= NUM.ZERO : stryMutAct_9fa48("67751") ? value.length >= NUM.ZERO : stryMutAct_9fa48("67750") ? false : stryMutAct_9fa48("67749") ? true : (stryCov_9fa48("67749", "67750", "67751", "67752"), value.length > NUM.ZERO)))))])).sort());
  }
}
function normalizeBlockedPriorityPartition(entry, requiredDistinctNodeCount = NUM.ZERO) {
  if (stryMutAct_9fa48("67753")) {
    {}
  } else {
    stryCov_9fa48("67753");
    if (stryMutAct_9fa48("67756") ? !entry && typeof entry !== TYPEOF.OBJECT : stryMutAct_9fa48("67755") ? false : stryMutAct_9fa48("67754") ? true : (stryCov_9fa48("67754", "67755", "67756"), (stryMutAct_9fa48("67757") ? entry : (stryCov_9fa48("67757"), !entry)) || (stryMutAct_9fa48("67759") ? typeof entry === TYPEOF.OBJECT : stryMutAct_9fa48("67758") ? false : (stryCov_9fa48("67758", "67759"), typeof entry !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("67760")) {
        {}
      } else {
        stryCov_9fa48("67760");
        return null;
      }
    }
    const partitionId = stryMutAct_9fa48("67761") ? String(entry.partitionId || entry.partition_id || '') : (stryCov_9fa48("67761"), String(stryMutAct_9fa48("67764") ? (entry.partitionId || entry.partition_id) && '' : stryMutAct_9fa48("67763") ? false : stryMutAct_9fa48("67762") ? true : (stryCov_9fa48("67762", "67763", "67764"), (stryMutAct_9fa48("67766") ? entry.partitionId && entry.partition_id : stryMutAct_9fa48("67765") ? false : (stryCov_9fa48("67765", "67766"), entry.partitionId || entry.partition_id)) || (stryMutAct_9fa48("67767") ? "Stryker was here!" : (stryCov_9fa48("67767"), '')))).trim());
    if (stryMutAct_9fa48("67770") ? false : stryMutAct_9fa48("67769") ? true : stryMutAct_9fa48("67768") ? partitionId : (stryCov_9fa48("67768", "67769", "67770"), !partitionId)) {
      if (stryMutAct_9fa48("67771")) {
        {}
      } else {
        stryCov_9fa48("67771");
        return null;
      }
    }
    const normalizedRequiredDistinctNodeCount = normalizePositiveInteger(stryMutAct_9fa48("67772") ? entry.requiredDistinctNodeCount && entry.required_distinct_node_count : (stryCov_9fa48("67772"), entry.requiredDistinctNodeCount ?? entry.required_distinct_node_count), requiredDistinctNodeCount);
    const readyDistinctNodeCount = normalizePositiveInteger(stryMutAct_9fa48("67773") ? entry.readyDistinctNodeCount && entry.ready_distinct_node_count : (stryCov_9fa48("67773"), entry.readyDistinctNodeCount ?? entry.ready_distinct_node_count), 0);
    const readyReplicaCount = normalizePositiveInteger(stryMutAct_9fa48("67774") ? entry.readyReplicaCount && entry.ready_replica_count : (stryCov_9fa48("67774"), entry.readyReplicaCount ?? entry.ready_replica_count), readyDistinctNodeCount);
    const spreadGap = normalizePositiveInteger(stryMutAct_9fa48("67775") ? entry.spreadGap && entry.spread_gap : (stryCov_9fa48("67775"), entry.spreadGap ?? entry.spread_gap), stryMutAct_9fa48("67776") ? Math.min(0, normalizedRequiredDistinctNodeCount - readyDistinctNodeCount) : (stryCov_9fa48("67776"), Math.max(0, stryMutAct_9fa48("67777") ? normalizedRequiredDistinctNodeCount + readyDistinctNodeCount : (stryCov_9fa48("67777"), normalizedRequiredDistinctNodeCount - readyDistinctNodeCount))));
    return stryMutAct_9fa48("67778") ? {} : (stryCov_9fa48("67778"), {
      partitionId,
      requiredDistinctNodeCount: normalizedRequiredDistinctNodeCount,
      readyDistinctNodeCount,
      readyReplicaCount,
      spreadGap
    });
  }
}
function normalizePriorityPartitionSummary(summary, options = {}) {
  if (stryMutAct_9fa48("67779")) {
    {}
  } else {
    stryCov_9fa48("67779");
    if (stryMutAct_9fa48("67782") ? !summary && typeof summary !== TYPEOF.OBJECT : stryMutAct_9fa48("67781") ? false : stryMutAct_9fa48("67780") ? true : (stryCov_9fa48("67780", "67781", "67782"), (stryMutAct_9fa48("67783") ? summary : (stryCov_9fa48("67783"), !summary)) || (stryMutAct_9fa48("67785") ? typeof summary === TYPEOF.OBJECT : stryMutAct_9fa48("67784") ? false : (stryCov_9fa48("67784", "67785"), typeof summary !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("67786")) {
        {}
      } else {
        stryCov_9fa48("67786");
        return null;
      }
    }
    const fallbackRequiredDistinctNodeCount = normalizePositiveInteger(options.requiredDistinctNodeCount, 0);
    const requiredDistinctNodeCount = normalizePositiveInteger(stryMutAct_9fa48("67787") ? summary.requiredDistinctNodeCount && summary.required_distinct_node_count : (stryCov_9fa48("67787"), summary.requiredDistinctNodeCount ?? summary.required_distinct_node_count), fallbackRequiredDistinctNodeCount);
    const blockedPartitions = stryMutAct_9fa48("67789") ? (Array.isArray(summary.blockedPartitions) ? summary.blockedPartitions : []).map(entry => normalizeBlockedPriorityPartition(entry, requiredDistinctNodeCount)).sort((left, right) => left.partitionId.localeCompare(right.partitionId)) : stryMutAct_9fa48("67788") ? (Array.isArray(summary.blockedPartitions) ? summary.blockedPartitions : []).map(entry => normalizeBlockedPriorityPartition(entry, requiredDistinctNodeCount)).filter(Boolean) : (stryCov_9fa48("67788", "67789"), (Array.isArray(summary.blockedPartitions) ? summary.blockedPartitions : stryMutAct_9fa48("67790") ? ["Stryker was here"] : (stryCov_9fa48("67790"), [])).map(stryMutAct_9fa48("67791") ? () => undefined : (stryCov_9fa48("67791"), entry => normalizeBlockedPriorityPartition(entry, requiredDistinctNodeCount))).filter(Boolean).sort(stryMutAct_9fa48("67792") ? () => undefined : (stryCov_9fa48("67792"), (left, right) => left.partitionId.localeCompare(right.partitionId))));
    const missingPartitionIds = normalizePartitionIdList(stryMutAct_9fa48("67793") ? [] : (stryCov_9fa48("67793"), [...(Array.isArray(summary.missingPartitionIds) ? summary.missingPartitionIds : stryMutAct_9fa48("67794") ? ["Stryker was here"] : (stryCov_9fa48("67794"), [])), ...blockedPartitions.map(stryMutAct_9fa48("67795") ? () => undefined : (stryCov_9fa48("67795"), entry => entry.partitionId))]));
    const readyEligibleNodeCount = normalizePositiveInteger(stryMutAct_9fa48("67796") ? summary.readyEligibleNodeCount && summary.ready_eligible_node_count : (stryCov_9fa48("67796"), summary.readyEligibleNodeCount ?? summary.ready_eligible_node_count), normalizePositiveInteger(options.readyEligibleNodeCount, 0));
    const totalPriorityPartitionCount = normalizePositiveInteger(stryMutAct_9fa48("67797") ? summary.totalPriorityPartitionCount && summary.total_priority_partition_count : (stryCov_9fa48("67797"), summary.totalPriorityPartitionCount ?? summary.total_priority_partition_count), PRIORITY_CONTROL_PLANE_TABLE_IDS.size);
    const satisfied = (stryMutAct_9fa48("67800") ? summary.satisfied === true && missingPartitionIds.length === 0 || blockedPartitions.length === 0 : stryMutAct_9fa48("67799") ? false : stryMutAct_9fa48("67798") ? true : (stryCov_9fa48("67798", "67799", "67800"), (stryMutAct_9fa48("67802") ? summary.satisfied === true || missingPartitionIds.length === 0 : stryMutAct_9fa48("67801") ? true : (stryCov_9fa48("67801", "67802"), (stryMutAct_9fa48("67804") ? summary.satisfied !== true : stryMutAct_9fa48("67803") ? true : (stryCov_9fa48("67803", "67804"), summary.satisfied === (stryMutAct_9fa48("67805") ? false : (stryCov_9fa48("67805"), true)))) && (stryMutAct_9fa48("67807") ? missingPartitionIds.length !== 0 : stryMutAct_9fa48("67806") ? true : (stryCov_9fa48("67806", "67807"), missingPartitionIds.length === 0)))) && (stryMutAct_9fa48("67809") ? blockedPartitions.length !== 0 : stryMutAct_9fa48("67808") ? true : (stryCov_9fa48("67808", "67809"), blockedPartitions.length === 0)))) ? stryMutAct_9fa48("67810") ? false : (stryCov_9fa48("67810"), true) : stryMutAct_9fa48("67811") ? true : (stryCov_9fa48("67811"), false);
    return stryMutAct_9fa48("67812") ? {} : (stryCov_9fa48("67812"), {
      satisfied,
      requiredDistinctNodeCount,
      readyEligibleNodeCount,
      totalPriorityPartitionCount,
      missingPartitionIds,
      blockedPartitions
    });
  }
}
function arePriorityPartitionSummariesEqual(leftSummary, rightSummary) {
  if (stryMutAct_9fa48("67813")) {
    {}
  } else {
    stryCov_9fa48("67813");
    const left = normalizePriorityPartitionSummary(leftSummary);
    const right = normalizePriorityPartitionSummary(rightSummary);
    if (stryMutAct_9fa48("67816") ? left === null && right === null : stryMutAct_9fa48("67815") ? false : stryMutAct_9fa48("67814") ? true : (stryCov_9fa48("67814", "67815", "67816"), (stryMutAct_9fa48("67818") ? left !== null : stryMutAct_9fa48("67817") ? false : (stryCov_9fa48("67817", "67818"), left === null)) || (stryMutAct_9fa48("67820") ? right !== null : stryMutAct_9fa48("67819") ? false : (stryCov_9fa48("67819", "67820"), right === null)))) {
      if (stryMutAct_9fa48("67821")) {
        {}
      } else {
        stryCov_9fa48("67821");
        return stryMutAct_9fa48("67824") ? left !== right : stryMutAct_9fa48("67823") ? false : stryMutAct_9fa48("67822") ? true : (stryCov_9fa48("67822", "67823", "67824"), left === right);
      }
    }
    return stryMutAct_9fa48("67827") ? JSON.stringify(left) !== JSON.stringify(right) : stryMutAct_9fa48("67826") ? false : stryMutAct_9fa48("67825") ? true : (stryCov_9fa48("67825", "67826", "67827"), JSON.stringify(left) === JSON.stringify(right));
  }
}
function areMembershipLifecycleSummariesEqual(leftSummary, rightSummary) {
  if (stryMutAct_9fa48("67828")) {
    {}
  } else {
    stryCov_9fa48("67828");
    const left = (stryMutAct_9fa48("67831") ? leftSummary || typeof leftSummary === TYPEOF.OBJECT : stryMutAct_9fa48("67830") ? false : stryMutAct_9fa48("67829") ? true : (stryCov_9fa48("67829", "67830", "67831"), leftSummary && (stryMutAct_9fa48("67833") ? typeof leftSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("67832") ? true : (stryCov_9fa48("67832", "67833"), typeof leftSummary === TYPEOF.OBJECT)))) ? buildMembershipLifecycleSummary(leftSummary) : null;
    const right = (stryMutAct_9fa48("67836") ? rightSummary || typeof rightSummary === TYPEOF.OBJECT : stryMutAct_9fa48("67835") ? false : stryMutAct_9fa48("67834") ? true : (stryCov_9fa48("67834", "67835", "67836"), rightSummary && (stryMutAct_9fa48("67838") ? typeof rightSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("67837") ? true : (stryCov_9fa48("67837", "67838"), typeof rightSummary === TYPEOF.OBJECT)))) ? buildMembershipLifecycleSummary(rightSummary) : null;
    if (stryMutAct_9fa48("67841") ? left === null && right === null : stryMutAct_9fa48("67840") ? false : stryMutAct_9fa48("67839") ? true : (stryCov_9fa48("67839", "67840", "67841"), (stryMutAct_9fa48("67843") ? left !== null : stryMutAct_9fa48("67842") ? false : (stryCov_9fa48("67842", "67843"), left === null)) || (stryMutAct_9fa48("67845") ? right !== null : stryMutAct_9fa48("67844") ? false : (stryCov_9fa48("67844", "67845"), right === null)))) {
      if (stryMutAct_9fa48("67846")) {
        {}
      } else {
        stryCov_9fa48("67846");
        return stryMutAct_9fa48("67849") ? left !== right : stryMutAct_9fa48("67848") ? false : stryMutAct_9fa48("67847") ? true : (stryCov_9fa48("67847", "67848", "67849"), left === right);
      }
    }
    return stryMutAct_9fa48("67852") ? JSON.stringify(left) !== JSON.stringify(right) : stryMutAct_9fa48("67851") ? false : stryMutAct_9fa48("67850") ? true : (stryCov_9fa48("67850", "67851", "67852"), JSON.stringify(left) === JSON.stringify(right));
  }
}
function buildPrioritySpreadEligibleNodeIdSet(options = {}) {
  if (stryMutAct_9fa48("67853")) {
    {}
  } else {
    stryCov_9fa48("67853");
    const preferredNodeIds = normalizeNodeIdList((stryMutAct_9fa48("67857") ? options.locallyEligibleNodeIds?.length <= 0 : stryMutAct_9fa48("67856") ? options.locallyEligibleNodeIds?.length >= 0 : stryMutAct_9fa48("67855") ? false : stryMutAct_9fa48("67854") ? true : (stryCov_9fa48("67854", "67855", "67856", "67857"), (stryMutAct_9fa48("67858") ? options.locallyEligibleNodeIds.length : (stryCov_9fa48("67858"), options.locallyEligibleNodeIds?.length)) > 0)) ? options.locallyEligibleNodeIds : (stryMutAct_9fa48("67862") ? options.projectedServingNodeIds?.length <= 0 : stryMutAct_9fa48("67861") ? options.projectedServingNodeIds?.length >= 0 : stryMutAct_9fa48("67860") ? false : stryMutAct_9fa48("67859") ? true : (stryCov_9fa48("67859", "67860", "67861", "67862"), (stryMutAct_9fa48("67863") ? options.projectedServingNodeIds.length : (stryCov_9fa48("67863"), options.projectedServingNodeIds?.length)) > 0)) ? options.projectedServingNodeIds : options.publishedActiveNodeIds);
    if (stryMutAct_9fa48("67867") ? preferredNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("67866") ? preferredNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("67865") ? false : stryMutAct_9fa48("67864") ? true : (stryCov_9fa48("67864", "67865", "67866", "67867"), preferredNodeIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("67868")) {
        {}
      } else {
        stryCov_9fa48("67868");
        return new Set(preferredNodeIds);
      }
    }
    const readinessByNodeId = (stryMutAct_9fa48("67871") ? options.readinessByNodeId || typeof options.readinessByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("67870") ? false : stryMutAct_9fa48("67869") ? true : (stryCov_9fa48("67869", "67870", "67871"), options.readinessByNodeId && (stryMutAct_9fa48("67873") ? typeof options.readinessByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("67872") ? true : (stryCov_9fa48("67872", "67873"), typeof options.readinessByNodeId === TYPEOF.OBJECT)))) ? options.readinessByNodeId : {};
    const promotableNodeIds = normalizeNodeIdList(stryMutAct_9fa48("67874") ? Object.keys(readinessByNodeId) : (stryCov_9fa48("67874"), Object.keys(readinessByNodeId).filter(stryMutAct_9fa48("67875") ? () => undefined : (stryCov_9fa48("67875"), nodeId => isReadinessPromotable(readinessByNodeId[nodeId])))));
    return new Set(promotableNodeIds);
  }
}
function isPrioritySpreadReadyReplica(normalizedService, readinessByNodeId = {}) {
  if (stryMutAct_9fa48("67876")) {
    {}
  } else {
    stryCov_9fa48("67876");
    if (stryMutAct_9fa48("67879") ? !normalizedService && typeof normalizedService !== TYPEOF.OBJECT : stryMutAct_9fa48("67878") ? false : stryMutAct_9fa48("67877") ? true : (stryCov_9fa48("67877", "67878", "67879"), (stryMutAct_9fa48("67880") ? normalizedService : (stryCov_9fa48("67880"), !normalizedService)) || (stryMutAct_9fa48("67882") ? typeof normalizedService === TYPEOF.OBJECT : stryMutAct_9fa48("67881") ? false : (stryCov_9fa48("67881", "67882"), typeof normalizedService !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("67883")) {
        {}
      } else {
        stryCov_9fa48("67883");
        return stryMutAct_9fa48("67884") ? true : (stryCov_9fa48("67884"), false);
      }
    }
    if (stryMutAct_9fa48("67887") ? (normalizedService.serviceType !== SERVICE_TYPE.PARTITION || normalizedService.status !== SERVICE_STATUS.ACTIVE || !normalizedService.raftRole || !normalizedService.address) && !normalizedService.nodeId : stryMutAct_9fa48("67886") ? false : stryMutAct_9fa48("67885") ? true : (stryCov_9fa48("67885", "67886", "67887"), (stryMutAct_9fa48("67889") ? (normalizedService.serviceType !== SERVICE_TYPE.PARTITION || normalizedService.status !== SERVICE_STATUS.ACTIVE || !normalizedService.raftRole) && !normalizedService.address : stryMutAct_9fa48("67888") ? false : (stryCov_9fa48("67888", "67889"), (stryMutAct_9fa48("67891") ? (normalizedService.serviceType !== SERVICE_TYPE.PARTITION || normalizedService.status !== SERVICE_STATUS.ACTIVE) && !normalizedService.raftRole : stryMutAct_9fa48("67890") ? false : (stryCov_9fa48("67890", "67891"), (stryMutAct_9fa48("67893") ? normalizedService.serviceType !== SERVICE_TYPE.PARTITION && normalizedService.status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("67892") ? false : (stryCov_9fa48("67892", "67893"), (stryMutAct_9fa48("67895") ? normalizedService.serviceType === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("67894") ? false : (stryCov_9fa48("67894", "67895"), normalizedService.serviceType !== SERVICE_TYPE.PARTITION)) || (stryMutAct_9fa48("67897") ? normalizedService.status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("67896") ? false : (stryCov_9fa48("67896", "67897"), normalizedService.status !== SERVICE_STATUS.ACTIVE)))) || (stryMutAct_9fa48("67898") ? normalizedService.raftRole : (stryCov_9fa48("67898"), !normalizedService.raftRole)))) || (stryMutAct_9fa48("67899") ? normalizedService.address : (stryCov_9fa48("67899"), !normalizedService.address)))) || (stryMutAct_9fa48("67900") ? normalizedService.nodeId : (stryCov_9fa48("67900"), !normalizedService.nodeId)))) {
      if (stryMutAct_9fa48("67901")) {
        {}
      } else {
        stryCov_9fa48("67901");
        return stryMutAct_9fa48("67902") ? true : (stryCov_9fa48("67902"), false);
      }
    }
    if (stryMutAct_9fa48("67905") ? normalizedService.raftRole === RAFT_ROLE.LEARNER : stryMutAct_9fa48("67904") ? false : stryMutAct_9fa48("67903") ? true : (stryCov_9fa48("67903", "67904", "67905"), normalizedService.raftRole !== RAFT_ROLE.LEARNER)) {
      if (stryMutAct_9fa48("67906")) {
        {}
      } else {
        stryCov_9fa48("67906");
        return stryMutAct_9fa48("67907") ? false : (stryCov_9fa48("67907"), true);
      }
    }
    return isReadinessPromotable(stryMutAct_9fa48("67910") ? readinessByNodeId[normalizedService.nodeId] && null : stryMutAct_9fa48("67909") ? false : stryMutAct_9fa48("67908") ? true : (stryCov_9fa48("67908", "67909", "67910"), readinessByNodeId[normalizedService.nodeId] || null));
  }
}
function buildDerivedPriorityPartitionSummary(options = {}) {
  if (stryMutAct_9fa48("67911")) {
    {}
  } else {
    stryCov_9fa48("67911");
    const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : stryMutAct_9fa48("67912") ? ["Stryker was here"] : (stryCov_9fa48("67912"), []);
    if (stryMutAct_9fa48("67915") ? serviceRows.length !== NUM.ZERO : stryMutAct_9fa48("67914") ? false : stryMutAct_9fa48("67913") ? true : (stryCov_9fa48("67913", "67914", "67915"), serviceRows.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("67916")) {
        {}
      } else {
        stryCov_9fa48("67916");
        return null;
      }
    }
    const partitionRows = Array.isArray(options.partitionRows) ? options.partitionRows : stryMutAct_9fa48("67917") ? ["Stryker was here"] : (stryCov_9fa48("67917"), []);
    const readinessByNodeId = (stryMutAct_9fa48("67920") ? options.readinessByNodeId || typeof options.readinessByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("67919") ? false : stryMutAct_9fa48("67918") ? true : (stryCov_9fa48("67918", "67919", "67920"), options.readinessByNodeId && (stryMutAct_9fa48("67922") ? typeof options.readinessByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("67921") ? true : (stryCov_9fa48("67921", "67922"), typeof options.readinessByNodeId === TYPEOF.OBJECT)))) ? options.readinessByNodeId : {};
    const partitionRowByPartitionId = buildPartitionRowByPartitionId(partitionRows);
    const readyReplicaStatsByPartitionId = new Map();
    let observedPriorityServiceRow = stryMutAct_9fa48("67923") ? true : (stryCov_9fa48("67923"), false);
    const eligibleNodeIds = buildPrioritySpreadEligibleNodeIdSet(options);
    for (const serviceRow of serviceRows) {
      if (stryMutAct_9fa48("67924")) {
        {}
      } else {
        stryCov_9fa48("67924");
        const normalizedService = normalizeServiceRow(serviceRow);
        const partitionId = normalizedService.partitionId;
        const partitionRow = stryMutAct_9fa48("67927") ? partitionRowByPartitionId.get(partitionId) && null : stryMutAct_9fa48("67926") ? false : stryMutAct_9fa48("67925") ? true : (stryCov_9fa48("67925", "67926", "67927"), partitionRowByPartitionId.get(partitionId) || null);
        if (stryMutAct_9fa48("67930") ? false : stryMutAct_9fa48("67929") ? true : stryMutAct_9fa48("67928") ? isPriorityControlPlanePartition({
          partitionId,
          partitionRow
        }) : (stryCov_9fa48("67928", "67929", "67930"), !isPriorityControlPlanePartition(stryMutAct_9fa48("67931") ? {} : (stryCov_9fa48("67931"), {
          partitionId,
          partitionRow
        })))) {
          if (stryMutAct_9fa48("67932")) {
            {}
          } else {
            stryCov_9fa48("67932");
            continue;
          }
        }
        observedPriorityServiceRow = stryMutAct_9fa48("67933") ? false : (stryCov_9fa48("67933"), true);
        if (stryMutAct_9fa48("67936") ? false : stryMutAct_9fa48("67935") ? true : stryMutAct_9fa48("67934") ? isPrioritySpreadReadyReplica(normalizedService, readinessByNodeId) : (stryCov_9fa48("67934", "67935", "67936"), !isPrioritySpreadReadyReplica(normalizedService, readinessByNodeId))) {
          if (stryMutAct_9fa48("67937")) {
            {}
          } else {
            stryCov_9fa48("67937");
            continue;
          }
        }
        if (stryMutAct_9fa48("67940") ? eligibleNodeIds.size > NUM.ZERO || !eligibleNodeIds.has(normalizedService.nodeId) : stryMutAct_9fa48("67939") ? false : stryMutAct_9fa48("67938") ? true : (stryCov_9fa48("67938", "67939", "67940"), (stryMutAct_9fa48("67943") ? eligibleNodeIds.size <= NUM.ZERO : stryMutAct_9fa48("67942") ? eligibleNodeIds.size >= NUM.ZERO : stryMutAct_9fa48("67941") ? true : (stryCov_9fa48("67941", "67942", "67943"), eligibleNodeIds.size > NUM.ZERO)) && (stryMutAct_9fa48("67944") ? eligibleNodeIds.has(normalizedService.nodeId) : (stryCov_9fa48("67944"), !eligibleNodeIds.has(normalizedService.nodeId))))) {
          if (stryMutAct_9fa48("67945")) {
            {}
          } else {
            stryCov_9fa48("67945");
            continue;
          }
        }
        if (stryMutAct_9fa48("67948") ? false : stryMutAct_9fa48("67947") ? true : stryMutAct_9fa48("67946") ? readyReplicaStatsByPartitionId.has(partitionId) : (stryCov_9fa48("67946", "67947", "67948"), !readyReplicaStatsByPartitionId.has(partitionId))) {
          if (stryMutAct_9fa48("67949")) {
            {}
          } else {
            stryCov_9fa48("67949");
            readyReplicaStatsByPartitionId.set(partitionId, stryMutAct_9fa48("67950") ? {} : (stryCov_9fa48("67950"), {
              readyReplicaCount: NUM.ZERO,
              nodeIds: new Set()
            }));
          }
        }
        const stats = readyReplicaStatsByPartitionId.get(partitionId);
        stryMutAct_9fa48("67951") ? stats.readyReplicaCount -= NUM.ONE : (stryCov_9fa48("67951"), stats.readyReplicaCount += NUM.ONE);
        stats.nodeIds.add(normalizedService.nodeId);
      }
    }
    const observedPriorityPartitionRow = stryMutAct_9fa48("67952") ? partitionRows.every(partitionRow => isPriorityControlPlanePartition({
      partitionRow
    })) : (stryCov_9fa48("67952"), partitionRows.some(stryMutAct_9fa48("67953") ? () => undefined : (stryCov_9fa48("67953"), partitionRow => isPriorityControlPlanePartition(stryMutAct_9fa48("67954") ? {} : (stryCov_9fa48("67954"), {
      partitionRow
    })))));
    if (stryMutAct_9fa48("67957") ? !observedPriorityServiceRow || !observedPriorityPartitionRow : stryMutAct_9fa48("67956") ? false : stryMutAct_9fa48("67955") ? true : (stryCov_9fa48("67955", "67956", "67957"), (stryMutAct_9fa48("67958") ? observedPriorityServiceRow : (stryCov_9fa48("67958"), !observedPriorityServiceRow)) && (stryMutAct_9fa48("67959") ? observedPriorityPartitionRow : (stryCov_9fa48("67959"), !observedPriorityPartitionRow)))) {
      if (stryMutAct_9fa48("67960")) {
        {}
      } else {
        stryCov_9fa48("67960");
        return null;
      }
    }
    const priorityPartitionIds = resolvePriorityControlPlanePartitionIds(stryMutAct_9fa48("67961") ? {} : (stryCov_9fa48("67961"), {
      partitionRows,
      serviceRows,
      partitionRowByPartitionId,
      includeInitialWhenMissing: stryMutAct_9fa48("67962") ? false : (stryCov_9fa48("67962"), true)
    }));
    if (stryMutAct_9fa48("67965") ? eligibleNodeIds.size !== NUM.ZERO : stryMutAct_9fa48("67964") ? false : stryMutAct_9fa48("67963") ? true : (stryCov_9fa48("67963", "67964", "67965"), eligibleNodeIds.size === NUM.ZERO)) {
      if (stryMutAct_9fa48("67966")) {
        {}
      } else {
        stryCov_9fa48("67966");
        for (const stats of readyReplicaStatsByPartitionId.values()) {
          if (stryMutAct_9fa48("67967")) {
            {}
          } else {
            stryCov_9fa48("67967");
            for (const nodeId of stats.nodeIds) {
              if (stryMutAct_9fa48("67968")) {
                {}
              } else {
                stryCov_9fa48("67968");
                eligibleNodeIds.add(nodeId);
              }
            }
          }
        }
      }
    }
    const requiredDistinctNodeCount = stryMutAct_9fa48("67969") ? Math.max(PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT, eligibleNodeIds.size) : (stryCov_9fa48("67969"), Math.min(PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT, eligibleNodeIds.size));
    const blockedPartitions = stryMutAct_9fa48("67970") ? ["Stryker was here"] : (stryCov_9fa48("67970"), []);
    for (const partitionId of priorityPartitionIds) {
      if (stryMutAct_9fa48("67971")) {
        {}
      } else {
        stryCov_9fa48("67971");
        const stats = stryMutAct_9fa48("67974") ? readyReplicaStatsByPartitionId.get(partitionId) && {
          readyReplicaCount: 0,
          nodeIds: new Set()
        } : stryMutAct_9fa48("67973") ? false : stryMutAct_9fa48("67972") ? true : (stryCov_9fa48("67972", "67973", "67974"), readyReplicaStatsByPartitionId.get(partitionId) || (stryMutAct_9fa48("67975") ? {} : (stryCov_9fa48("67975"), {
          readyReplicaCount: 0,
          nodeIds: new Set()
        })));
        const readyDistinctNodeCount = stats.nodeIds.size;
        const spreadGap = stryMutAct_9fa48("67976") ? Math.min(0, requiredDistinctNodeCount - readyDistinctNodeCount) : (stryCov_9fa48("67976"), Math.max(0, stryMutAct_9fa48("67977") ? requiredDistinctNodeCount + readyDistinctNodeCount : (stryCov_9fa48("67977"), requiredDistinctNodeCount - readyDistinctNodeCount)));
        if (stryMutAct_9fa48("67980") ? requiredDistinctNodeCount <= NUM.ONE && spreadGap <= NUM.ZERO : stryMutAct_9fa48("67979") ? false : stryMutAct_9fa48("67978") ? true : (stryCov_9fa48("67978", "67979", "67980"), (stryMutAct_9fa48("67983") ? requiredDistinctNodeCount > NUM.ONE : stryMutAct_9fa48("67982") ? requiredDistinctNodeCount < NUM.ONE : stryMutAct_9fa48("67981") ? false : (stryCov_9fa48("67981", "67982", "67983"), requiredDistinctNodeCount <= NUM.ONE)) || (stryMutAct_9fa48("67986") ? spreadGap > NUM.ZERO : stryMutAct_9fa48("67985") ? spreadGap < NUM.ZERO : stryMutAct_9fa48("67984") ? false : (stryCov_9fa48("67984", "67985", "67986"), spreadGap <= NUM.ZERO)))) {
          if (stryMutAct_9fa48("67987")) {
            {}
          } else {
            stryCov_9fa48("67987");
            continue;
          }
        }
        blockedPartitions.push(stryMutAct_9fa48("67988") ? {} : (stryCov_9fa48("67988"), {
          partitionId,
          requiredDistinctNodeCount,
          readyDistinctNodeCount,
          readyReplicaCount: stats.readyReplicaCount,
          spreadGap
        }));
      }
    }
    return normalizePriorityPartitionSummary(stryMutAct_9fa48("67989") ? {} : (stryCov_9fa48("67989"), {
      satisfied: stryMutAct_9fa48("67992") ? blockedPartitions.length !== NUM.ZERO : stryMutAct_9fa48("67991") ? false : stryMutAct_9fa48("67990") ? true : (stryCov_9fa48("67990", "67991", "67992"), blockedPartitions.length === NUM.ZERO),
      requiredDistinctNodeCount,
      readyEligibleNodeCount: eligibleNodeIds.size,
      totalPriorityPartitionCount: priorityPartitionIds.length,
      missingPartitionIds: blockedPartitions.map(stryMutAct_9fa48("67993") ? () => undefined : (stryCov_9fa48("67993"), entry => entry.partitionId)),
      blockedPartitions
    }), stryMutAct_9fa48("67994") ? {} : (stryCov_9fa48("67994"), {
      requiredDistinctNodeCount,
      readyEligibleNodeCount: eligibleNodeIds.size
    }));
  }
}
function buildPriorityPartitionSummaryRefreshRow(options = {}) {
  if (stryMutAct_9fa48("67995")) {
    {}
  } else {
    stryCov_9fa48("67995");
    const publicationRow = options.publicationRow;
    const priorityPartitionSummary = normalizePriorityPartitionSummary(options.priorityPartitionSummary);
    if (stryMutAct_9fa48("67998") ? !publicationRow && !priorityPartitionSummary : stryMutAct_9fa48("67997") ? false : stryMutAct_9fa48("67996") ? true : (stryCov_9fa48("67996", "67997", "67998"), (stryMutAct_9fa48("67999") ? publicationRow : (stryCov_9fa48("67999"), !publicationRow)) || (stryMutAct_9fa48("68000") ? priorityPartitionSummary : (stryCov_9fa48("68000"), !priorityPartitionSummary)))) {
      if (stryMutAct_9fa48("68001")) {
        {}
      } else {
        stryCov_9fa48("68001");
        return publicationRow;
      }
    }
    const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
    return stryMutAct_9fa48("68002") ? {} : (stryCov_9fa48("68002"), {
      ...publicationRow,
      priority_partition_summary: priorityPartitionSummary,
      priorityPartitionSummary,
      updated_at: normalizePositiveInteger(options.nowMs, Date.now()),
      transition_history: Array.isArray(publicationRow.transition_history) ? publicationRow.transition_history : normalizedPublication.transitionHistory
    });
  }
}
function buildPublicationMetadataRefreshRow(options = {}) {
  if (stryMutAct_9fa48("68003")) {
    {}
  } else {
    stryCov_9fa48("68003");
    const publicationRow = options.publicationRow;
    if (stryMutAct_9fa48("68006") ? !publicationRow && typeof publicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("68005") ? false : stryMutAct_9fa48("68004") ? true : (stryCov_9fa48("68004", "68005", "68006"), (stryMutAct_9fa48("68007") ? publicationRow : (stryCov_9fa48("68007"), !publicationRow)) || (stryMutAct_9fa48("68009") ? typeof publicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("68008") ? false : (stryCov_9fa48("68008", "68009"), typeof publicationRow !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("68010")) {
        {}
      } else {
        stryCov_9fa48("68010");
        return publicationRow;
      }
    }
    const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
    const priorityPartitionSummary = normalizePriorityPartitionSummary(stryMutAct_9fa48("68011") ? options.priorityPartitionSummary && normalizedPublication.priorityPartitionSummary : (stryCov_9fa48("68011"), options.priorityPartitionSummary ?? normalizedPublication.priorityPartitionSummary));
    const membershipLifecycleSummary = (stryMutAct_9fa48("68014") ? options.membershipLifecycleSummary || typeof options.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("68013") ? false : stryMutAct_9fa48("68012") ? true : (stryCov_9fa48("68012", "68013", "68014"), options.membershipLifecycleSummary && (stryMutAct_9fa48("68016") ? typeof options.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("68015") ? true : (stryCov_9fa48("68015", "68016"), typeof options.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? buildMembershipLifecycleSummary(options.membershipLifecycleSummary) : (stryMutAct_9fa48("68019") ? normalizedPublication.membershipLifecycleSummary || typeof normalizedPublication.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("68018") ? false : stryMutAct_9fa48("68017") ? true : (stryCov_9fa48("68017", "68018", "68019"), normalizedPublication.membershipLifecycleSummary && (stryMutAct_9fa48("68021") ? typeof normalizedPublication.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("68020") ? true : (stryCov_9fa48("68020", "68021"), typeof normalizedPublication.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? buildMembershipLifecycleSummary(normalizedPublication.membershipLifecycleSummary) : null;
    return stryMutAct_9fa48("68022") ? {} : (stryCov_9fa48("68022"), {
      ...publicationRow,
      priority_partition_summary: priorityPartitionSummary,
      priorityPartitionSummary,
      membership_lifecycle_summary: membershipLifecycleSummary,
      membershipLifecycleSummary,
      updated_at: normalizePositiveInteger(options.nowMs, Date.now()),
      transition_history: Array.isArray(publicationRow.transition_history) ? publicationRow.transition_history : normalizedPublication.transitionHistory
    });
  }
}
function isReadinessPromotable(readinessEntry = null) {
  if (stryMutAct_9fa48("68023")) {
    {}
  } else {
    stryCov_9fa48("68023");
    const dimensions = (stryMutAct_9fa48("68026") ? readinessEntry?.dimensions || typeof readinessEntry.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("68025") ? false : stryMutAct_9fa48("68024") ? true : (stryCov_9fa48("68024", "68025", "68026"), (stryMutAct_9fa48("68027") ? readinessEntry.dimensions : (stryCov_9fa48("68027"), readinessEntry?.dimensions)) && (stryMutAct_9fa48("68029") ? typeof readinessEntry.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("68028") ? true : (stryCov_9fa48("68028", "68029"), typeof readinessEntry.dimensions === TYPEOF.OBJECT)))) ? readinessEntry.dimensions : null;
    if (stryMutAct_9fa48("68032") ? false : stryMutAct_9fa48("68031") ? true : stryMutAct_9fa48("68030") ? dimensions : (stryCov_9fa48("68030", "68031", "68032"), !dimensions)) {
      if (stryMutAct_9fa48("68033")) {
        {}
      } else {
        stryCov_9fa48("68033");
        return stryMutAct_9fa48("68034") ? false : (stryCov_9fa48("68034"), true);
      }
    }
    const hasPublicationSignal = stryMutAct_9fa48("68037") ? Object.hasOwn(dimensions, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED) && Object.hasOwn(dimensions, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE) : stryMutAct_9fa48("68036") ? false : stryMutAct_9fa48("68035") ? true : (stryCov_9fa48("68035", "68036", "68037"), Object.hasOwn(dimensions, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED) || Object.hasOwn(dimensions, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE));
    if (stryMutAct_9fa48("68040") ? false : stryMutAct_9fa48("68039") ? true : stryMutAct_9fa48("68038") ? hasPublicationSignal : (stryCov_9fa48("68038", "68039", "68040"), !hasPublicationSignal)) {
      if (stryMutAct_9fa48("68041")) {
        {}
      } else {
        stryCov_9fa48("68041");
        return stryMutAct_9fa48("68044") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false && dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== false || dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false : stryMutAct_9fa48("68043") ? false : stryMutAct_9fa48("68042") ? true : (stryCov_9fa48("68042", "68043", "68044"), (stryMutAct_9fa48("68046") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false || dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== false : stryMutAct_9fa48("68045") ? true : (stryCov_9fa48("68045", "68046"), (stryMutAct_9fa48("68048") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false : stryMutAct_9fa48("68047") ? true : (stryCov_9fa48("68047", "68048"), (stryMutAct_9fa48("68050") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] !== true : stryMutAct_9fa48("68049") ? true : (stryCov_9fa48("68049", "68050"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === (stryMutAct_9fa48("68051") ? false : (stryCov_9fa48("68051"), true)))) && (stryMutAct_9fa48("68053") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === false : stryMutAct_9fa48("68052") ? true : (stryCov_9fa48("68052", "68053"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== (stryMutAct_9fa48("68054") ? true : (stryCov_9fa48("68054"), false)))))) && (stryMutAct_9fa48("68056") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === false : stryMutAct_9fa48("68055") ? true : (stryCov_9fa48("68055", "68056"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== (stryMutAct_9fa48("68057") ? true : (stryCov_9fa48("68057"), false)))))) && (stryMutAct_9fa48("68059") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === false : stryMutAct_9fa48("68058") ? true : (stryCov_9fa48("68058", "68059"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== (stryMutAct_9fa48("68060") ? true : (stryCov_9fa48("68060"), false)))));
      }
    }
    if (stryMutAct_9fa48("68063") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] !== true : stryMutAct_9fa48("68062") ? false : stryMutAct_9fa48("68061") ? true : (stryCov_9fa48("68061", "68062", "68063"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === (stryMutAct_9fa48("68064") ? false : (stryCov_9fa48("68064"), true)))) {
      if (stryMutAct_9fa48("68065")) {
        {}
      } else {
        stryCov_9fa48("68065");
        return stryMutAct_9fa48("68068") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false && dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== false || dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false : stryMutAct_9fa48("68067") ? false : stryMutAct_9fa48("68066") ? true : (stryCov_9fa48("68066", "68067", "68068"), (stryMutAct_9fa48("68070") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false || dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== false : stryMutAct_9fa48("68069") ? true : (stryCov_9fa48("68069", "68070"), (stryMutAct_9fa48("68072") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false : stryMutAct_9fa48("68071") ? true : (stryCov_9fa48("68071", "68072"), (stryMutAct_9fa48("68074") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] !== true : stryMutAct_9fa48("68073") ? true : (stryCov_9fa48("68073", "68074"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === (stryMutAct_9fa48("68075") ? false : (stryCov_9fa48("68075"), true)))) && (stryMutAct_9fa48("68077") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] === false : stryMutAct_9fa48("68076") ? true : (stryCov_9fa48("68076", "68077"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== (stryMutAct_9fa48("68078") ? true : (stryCov_9fa48("68078"), false)))))) && (stryMutAct_9fa48("68080") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === false : stryMutAct_9fa48("68079") ? true : (stryCov_9fa48("68079", "68080"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== (stryMutAct_9fa48("68081") ? true : (stryCov_9fa48("68081"), false)))))) && (stryMutAct_9fa48("68083") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === false : stryMutAct_9fa48("68082") ? true : (stryCov_9fa48("68082", "68083"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== (stryMutAct_9fa48("68084") ? true : (stryCov_9fa48("68084"), false)))));
      }
    }
    return stryMutAct_9fa48("68087") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true : stryMutAct_9fa48("68086") ? false : stryMutAct_9fa48("68085") ? true : (stryCov_9fa48("68085", "68086", "68087"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === (stryMutAct_9fa48("68088") ? false : (stryCov_9fa48("68088"), true)));
  }
}
function shouldAllowRecoveryEligibleProjection(options = {}) {
  if (stryMutAct_9fa48("68089")) {
    {}
  } else {
    stryCov_9fa48("68089");
    const latestPublicationRow = normalizeLatestPublicationRow(options.latestPublicationRow);
    const latestPublishedPublicationRow = normalizeLatestPublicationRow(options.latestPublishedPublicationRow);
    const latestVisiblePublicationRow = stryMutAct_9fa48("68092") ? latestPublicationRow && latestPublishedPublicationRow : stryMutAct_9fa48("68091") ? false : stryMutAct_9fa48("68090") ? true : (stryCov_9fa48("68090", "68091", "68092"), latestPublicationRow || latestPublishedPublicationRow);
    const latestPublicationStatus = stryMutAct_9fa48("68093") ? String(latestVisiblePublicationRow?.status || '').toLowerCase() : (stryCov_9fa48("68093"), String(stryMutAct_9fa48("68096") ? latestVisiblePublicationRow?.status && '' : stryMutAct_9fa48("68095") ? false : stryMutAct_9fa48("68094") ? true : (stryCov_9fa48("68094", "68095", "68096"), (stryMutAct_9fa48("68097") ? latestVisiblePublicationRow.status : (stryCov_9fa48("68097"), latestVisiblePublicationRow?.status)) || (stryMutAct_9fa48("68098") ? "Stryker was here!" : (stryCov_9fa48("68098"), '')))).toUpperCase());
    if (stryMutAct_9fa48("68101") ? (!latestVisiblePublicationRow || latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED) && latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("68100") ? false : stryMutAct_9fa48("68099") ? true : (stryCov_9fa48("68099", "68100", "68101"), (stryMutAct_9fa48("68103") ? !latestVisiblePublicationRow && latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("68102") ? false : (stryCov_9fa48("68102", "68103"), (stryMutAct_9fa48("68104") ? latestVisiblePublicationRow : (stryCov_9fa48("68104"), !latestVisiblePublicationRow)) || (stryMutAct_9fa48("68106") ? latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("68105") ? false : (stryCov_9fa48("68105", "68106"), latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED)))) || (stryMutAct_9fa48("68108") ? latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("68107") ? false : (stryCov_9fa48("68107", "68108"), latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED)))) {
      if (stryMutAct_9fa48("68109")) {
        {}
      } else {
        stryCov_9fa48("68109");
        return stryMutAct_9fa48("68110") ? true : (stryCov_9fa48("68110"), false);
      }
    }
    if (stryMutAct_9fa48("68113") ? latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68112") ? false : stryMutAct_9fa48("68111") ? true : (stryCov_9fa48("68111", "68112", "68113"), latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) {
      if (stryMutAct_9fa48("68114")) {
        {}
      } else {
        stryCov_9fa48("68114");
        return stryMutAct_9fa48("68115") ? false : (stryCov_9fa48("68115"), true);
      }
    }
    const prioritySpreadGapPending = hasPriorityRecoverySpreadGap(stryMutAct_9fa48("68118") ? latestPublicationRow?.priorityPartitionSummary && latestPublishedPublicationRow?.priorityPartitionSummary : stryMutAct_9fa48("68117") ? false : stryMutAct_9fa48("68116") ? true : (stryCov_9fa48("68116", "68117", "68118"), (stryMutAct_9fa48("68119") ? latestPublicationRow.priorityPartitionSummary : (stryCov_9fa48("68119"), latestPublicationRow?.priorityPartitionSummary)) || (stryMutAct_9fa48("68120") ? latestPublishedPublicationRow.priorityPartitionSummary : (stryCov_9fa48("68120"), latestPublishedPublicationRow?.priorityPartitionSummary))));
    if (stryMutAct_9fa48("68122") ? false : stryMutAct_9fa48("68121") ? true : (stryCov_9fa48("68121", "68122"), prioritySpreadGapPending)) {
      if (stryMutAct_9fa48("68123")) {
        {}
      } else {
        stryCov_9fa48("68123");
        return stryMutAct_9fa48("68124") ? false : (stryCov_9fa48("68124"), true);
      }
    }
    if (stryMutAct_9fa48("68127") ? options.observedRecoveryProjectionGap !== true : stryMutAct_9fa48("68126") ? false : stryMutAct_9fa48("68125") ? true : (stryCov_9fa48("68125", "68126", "68127"), options.observedRecoveryProjectionGap === (stryMutAct_9fa48("68128") ? false : (stryCov_9fa48("68128"), true)))) {
      if (stryMutAct_9fa48("68129")) {
        {}
      } else {
        stryCov_9fa48("68129");
        return stryMutAct_9fa48("68130") ? false : (stryCov_9fa48("68130"), true);
      }
    }
    const publishedBaselineNodeIds = normalizeNodeIdList(options.publishedBaselineNodeIds);
    if (stryMutAct_9fa48("68133") ? publishedBaselineNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("68132") ? false : stryMutAct_9fa48("68131") ? true : (stryCov_9fa48("68131", "68132", "68133"), publishedBaselineNodeIds.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("68134")) {
        {}
      } else {
        stryCov_9fa48("68134");
        return stryMutAct_9fa48("68135") ? true : (stryCov_9fa48("68135"), false);
      }
    }
    const defaultObservedNodeIds = normalizeNodeIdList(resolveObservedActiveNodeIds(stryMutAct_9fa48("68136") ? {} : (stryCov_9fa48("68136"), {
      ...options,
      readinessByNodeId: options.readinessByNodeId
    })));
    const recoveryEligibleObservedNodeIds = normalizeNodeIdList(resolveObservedActiveNodeIds(stryMutAct_9fa48("68137") ? {} : (stryCov_9fa48("68137"), {
      ...options,
      readinessByNodeId: options.readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: stryMutAct_9fa48("68138") ? false : (stryCov_9fa48("68138"), true)
    })));
    return stryMutAct_9fa48("68139") ? recoveryEligibleObservedNodeIds.every(nodeId => !publishedBaselineNodeIds.includes(nodeId) && !defaultObservedNodeIds.includes(nodeId) && isReadinessPromotable(options.readinessByNodeId?.[nodeId] || null)) : (stryCov_9fa48("68139"), recoveryEligibleObservedNodeIds.some(stryMutAct_9fa48("68140") ? () => undefined : (stryCov_9fa48("68140"), nodeId => stryMutAct_9fa48("68143") ? !publishedBaselineNodeIds.includes(nodeId) && !defaultObservedNodeIds.includes(nodeId) || isReadinessPromotable(options.readinessByNodeId?.[nodeId] || null) : stryMutAct_9fa48("68142") ? false : stryMutAct_9fa48("68141") ? true : (stryCov_9fa48("68141", "68142", "68143"), (stryMutAct_9fa48("68145") ? !publishedBaselineNodeIds.includes(nodeId) || !defaultObservedNodeIds.includes(nodeId) : stryMutAct_9fa48("68144") ? true : (stryCov_9fa48("68144", "68145"), (stryMutAct_9fa48("68146") ? publishedBaselineNodeIds.includes(nodeId) : (stryCov_9fa48("68146"), !publishedBaselineNodeIds.includes(nodeId))) && (stryMutAct_9fa48("68147") ? defaultObservedNodeIds.includes(nodeId) : (stryCov_9fa48("68147"), !defaultObservedNodeIds.includes(nodeId))))) && isReadinessPromotable(stryMutAct_9fa48("68150") ? options.readinessByNodeId?.[nodeId] && null : stryMutAct_9fa48("68149") ? false : stryMutAct_9fa48("68148") ? true : (stryCov_9fa48("68148", "68149", "68150"), (stryMutAct_9fa48("68151") ? options.readinessByNodeId[nodeId] : (stryCov_9fa48("68151"), options.readinessByNodeId?.[nodeId])) || null))))));
  }
}
function shouldPreferAuthoritativeMembershipState(options = {}) {
  if (stryMutAct_9fa48("68152")) {
    {}
  } else {
    stryCov_9fa48("68152");
    if (stryMutAct_9fa48("68155") ? options.preferAuthoritativeRead === true && options.requireAuthoritative === true : stryMutAct_9fa48("68154") ? false : stryMutAct_9fa48("68153") ? true : (stryCov_9fa48("68153", "68154", "68155"), (stryMutAct_9fa48("68157") ? options.preferAuthoritativeRead !== true : stryMutAct_9fa48("68156") ? false : (stryCov_9fa48("68156", "68157"), options.preferAuthoritativeRead === (stryMutAct_9fa48("68158") ? false : (stryCov_9fa48("68158"), true)))) || (stryMutAct_9fa48("68160") ? options.requireAuthoritative !== true : stryMutAct_9fa48("68159") ? false : (stryCov_9fa48("68159", "68160"), options.requireAuthoritative === (stryMutAct_9fa48("68161") ? false : (stryCov_9fa48("68161"), true)))))) {
      if (stryMutAct_9fa48("68162")) {
        {}
      } else {
        stryCov_9fa48("68162");
        return stryMutAct_9fa48("68163") ? false : (stryCov_9fa48("68163"), true);
      }
    }
    const publicationRows = stryMutAct_9fa48("68164") ? [] : (stryCov_9fa48("68164"), [normalizeLatestPublicationRow(options.latestPublicationRow), normalizeLatestPublicationRow(options.latestPublishedPublicationRow)]);
    return stryMutAct_9fa48("68165") ? publicationRows.every(row => {
      if (!row || typeof row !== TYPEOF.OBJECT) {
        return false;
      }
      const status = String(row.status || '').toUpperCase();
      if (status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
        return hasPriorityRecoverySpreadGap(row.priorityPartitionSummary);
      }
      if (status === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED || status === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED) {
        return false;
      }
      return row.publishedActiveNodeIdsPresent === true || Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO || Array.isArray(row.requiredAckNodeIds) && row.requiredAckNodeIds.length > NUM.ZERO || Array.isArray(row.acknowledgedNodeIds) && row.acknowledgedNodeIds.length > NUM.ZERO;
    }) : (stryCov_9fa48("68165"), publicationRows.some(row => {
      if (stryMutAct_9fa48("68166")) {
        {}
      } else {
        stryCov_9fa48("68166");
        if (stryMutAct_9fa48("68169") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("68168") ? false : stryMutAct_9fa48("68167") ? true : (stryCov_9fa48("68167", "68168", "68169"), (stryMutAct_9fa48("68170") ? row : (stryCov_9fa48("68170"), !row)) || (stryMutAct_9fa48("68172") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("68171") ? false : (stryCov_9fa48("68171", "68172"), typeof row !== TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("68173")) {
            {}
          } else {
            stryCov_9fa48("68173");
            return stryMutAct_9fa48("68174") ? true : (stryCov_9fa48("68174"), false);
          }
        }
        const status = stryMutAct_9fa48("68175") ? String(row.status || '').toLowerCase() : (stryCov_9fa48("68175"), String(stryMutAct_9fa48("68178") ? row.status && '' : stryMutAct_9fa48("68177") ? false : stryMutAct_9fa48("68176") ? true : (stryCov_9fa48("68176", "68177", "68178"), row.status || (stryMutAct_9fa48("68179") ? "Stryker was here!" : (stryCov_9fa48("68179"), '')))).toUpperCase());
        if (stryMutAct_9fa48("68182") ? status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68181") ? false : stryMutAct_9fa48("68180") ? true : (stryCov_9fa48("68180", "68181", "68182"), status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) {
          if (stryMutAct_9fa48("68183")) {
            {}
          } else {
            stryCov_9fa48("68183");
            return hasPriorityRecoverySpreadGap(row.priorityPartitionSummary);
          }
        }
        if (stryMutAct_9fa48("68186") ? status === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED && status === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("68185") ? false : stryMutAct_9fa48("68184") ? true : (stryCov_9fa48("68184", "68185", "68186"), (stryMutAct_9fa48("68188") ? status !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("68187") ? false : (stryCov_9fa48("68187", "68188"), status === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED)) || (stryMutAct_9fa48("68190") ? status !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("68189") ? false : (stryCov_9fa48("68189", "68190"), status === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED)))) {
          if (stryMutAct_9fa48("68191")) {
            {}
          } else {
            stryCov_9fa48("68191");
            return stryMutAct_9fa48("68192") ? true : (stryCov_9fa48("68192"), false);
          }
        }
        return stryMutAct_9fa48("68195") ? (row.publishedActiveNodeIdsPresent === true || Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO || Array.isArray(row.requiredAckNodeIds) && row.requiredAckNodeIds.length > NUM.ZERO) && Array.isArray(row.acknowledgedNodeIds) && row.acknowledgedNodeIds.length > NUM.ZERO : stryMutAct_9fa48("68194") ? false : stryMutAct_9fa48("68193") ? true : (stryCov_9fa48("68193", "68194", "68195"), (stryMutAct_9fa48("68197") ? (row.publishedActiveNodeIdsPresent === true || Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO) && Array.isArray(row.requiredAckNodeIds) && row.requiredAckNodeIds.length > NUM.ZERO : stryMutAct_9fa48("68196") ? false : (stryCov_9fa48("68196", "68197"), (stryMutAct_9fa48("68199") ? row.publishedActiveNodeIdsPresent === true && Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("68198") ? false : (stryCov_9fa48("68198", "68199"), (stryMutAct_9fa48("68201") ? row.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("68200") ? false : (stryCov_9fa48("68200", "68201"), row.publishedActiveNodeIdsPresent === (stryMutAct_9fa48("68202") ? false : (stryCov_9fa48("68202"), true)))) || (stryMutAct_9fa48("68204") ? Array.isArray(row.publishedActiveNodeIds) || row.publishedActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("68203") ? false : (stryCov_9fa48("68203", "68204"), Array.isArray(row.publishedActiveNodeIds) && (stryMutAct_9fa48("68207") ? row.publishedActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("68206") ? row.publishedActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("68205") ? true : (stryCov_9fa48("68205", "68206", "68207"), row.publishedActiveNodeIds.length > NUM.ZERO)))))) || (stryMutAct_9fa48("68209") ? Array.isArray(row.requiredAckNodeIds) || row.requiredAckNodeIds.length > NUM.ZERO : stryMutAct_9fa48("68208") ? false : (stryCov_9fa48("68208", "68209"), Array.isArray(row.requiredAckNodeIds) && (stryMutAct_9fa48("68212") ? row.requiredAckNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("68211") ? row.requiredAckNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("68210") ? true : (stryCov_9fa48("68210", "68211", "68212"), row.requiredAckNodeIds.length > NUM.ZERO)))))) || (stryMutAct_9fa48("68214") ? Array.isArray(row.acknowledgedNodeIds) || row.acknowledgedNodeIds.length > NUM.ZERO : stryMutAct_9fa48("68213") ? false : (stryCov_9fa48("68213", "68214"), Array.isArray(row.acknowledgedNodeIds) && (stryMutAct_9fa48("68217") ? row.acknowledgedNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("68216") ? row.acknowledgedNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("68215") ? true : (stryCov_9fa48("68215", "68216", "68217"), row.acknowledgedNodeIds.length > NUM.ZERO)))));
      }
    }));
  }
}
function buildPublishedMemberStates(options = {}) {
  if (stryMutAct_9fa48("68218")) {
    {}
  } else {
    stryCov_9fa48("68218");
    const publishedBaselineNodeIds = normalizeNodeIdList(options.publishedBaselineNodeIds);
    const desiredPublishedNodeIds = normalizeNodeIdList(options.desiredPublishedNodeIds);
    const projectedServingNodeIds = normalizeNodeIdList(options.projectedServingNodeIds);
    const suspectedOrTransitioningNodeIds = normalizeNodeIdList(options.suspectedOrTransitioningNodeIds);
    const recoveryEpochByNodeId = stryMutAct_9fa48("68221") ? options.recoveryEpochByNodeId && {} : stryMutAct_9fa48("68220") ? false : stryMutAct_9fa48("68219") ? true : (stryCov_9fa48("68219", "68220", "68221"), options.recoveryEpochByNodeId || {});
    const explicitRetiredNodeIds = new Set(normalizeNodeIdList(options.explicitRetiredNodeIds));
    const states = {};
    const allNodeIds = normalizeNodeIdList(stryMutAct_9fa48("68222") ? [] : (stryCov_9fa48("68222"), [...publishedBaselineNodeIds, ...desiredPublishedNodeIds, ...projectedServingNodeIds, ...suspectedOrTransitioningNodeIds, ...Object.keys(recoveryEpochByNodeId), ...explicitRetiredNodeIds]));
    for (const nodeId of allNodeIds) {
      if (stryMutAct_9fa48("68223")) {
        {}
      } else {
        stryCov_9fa48("68223");
        const latestEpoch = stryMutAct_9fa48("68226") ? recoveryEpochByNodeId[nodeId] && null : stryMutAct_9fa48("68225") ? false : stryMutAct_9fa48("68224") ? true : (stryCov_9fa48("68224", "68225", "68226"), recoveryEpochByNodeId[nodeId] || null);
        const recoveryOpen = stryMutAct_9fa48("68229") ? latestEpoch?.open !== true : stryMutAct_9fa48("68228") ? false : stryMutAct_9fa48("68227") ? true : (stryCov_9fa48("68227", "68228", "68229"), (stryMutAct_9fa48("68230") ? latestEpoch.open : (stryCov_9fa48("68230"), latestEpoch?.open)) === (stryMutAct_9fa48("68231") ? false : (stryCov_9fa48("68231"), true)));
        if (stryMutAct_9fa48("68233") ? false : stryMutAct_9fa48("68232") ? true : (stryCov_9fa48("68232", "68233"), explicitRetiredNodeIds.has(nodeId))) {
          if (stryMutAct_9fa48("68234")) {
            {}
          } else {
            stryCov_9fa48("68234");
            states[nodeId] = MEMBERSHIP_MEMBER_STATE.RETIRED;
            continue;
          }
        }
        if (stryMutAct_9fa48("68236") ? false : stryMutAct_9fa48("68235") ? true : (stryCov_9fa48("68235", "68236"), desiredPublishedNodeIds.includes(nodeId))) {
          if (stryMutAct_9fa48("68237")) {
            {}
          } else {
            stryCov_9fa48("68237");
            if (stryMutAct_9fa48("68240") ? false : stryMutAct_9fa48("68239") ? true : stryMutAct_9fa48("68238") ? publishedBaselineNodeIds.includes(nodeId) : (stryCov_9fa48("68238", "68239", "68240"), !publishedBaselineNodeIds.includes(nodeId))) {
              if (stryMutAct_9fa48("68241")) {
                {}
              } else {
                stryCov_9fa48("68241");
                states[nodeId] = recoveryOpen ? MEMBERSHIP_MEMBER_STATE.CATCHING_UP : MEMBERSHIP_MEMBER_STATE.JOINING;
                continue;
              }
            }
            if (stryMutAct_9fa48("68244") ? false : stryMutAct_9fa48("68243") ? true : stryMutAct_9fa48("68242") ? projectedServingNodeIds.includes(nodeId) : (stryCov_9fa48("68242", "68243", "68244"), !projectedServingNodeIds.includes(nodeId))) {
              if (stryMutAct_9fa48("68245")) {
                {}
              } else {
                stryCov_9fa48("68245");
                states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
                continue;
              }
            }
            states[nodeId] = recoveryOpen ? MEMBERSHIP_MEMBER_STATE.CATCHING_UP : MEMBERSHIP_MEMBER_STATE.SERVING;
            continue;
          }
        }
        if (stryMutAct_9fa48("68247") ? false : stryMutAct_9fa48("68246") ? true : (stryCov_9fa48("68246", "68247"), projectedServingNodeIds.includes(nodeId))) {
          if (stryMutAct_9fa48("68248")) {
            {}
          } else {
            stryCov_9fa48("68248");
            states[nodeId] = recoveryOpen ? MEMBERSHIP_MEMBER_STATE.CATCHING_UP : MEMBERSHIP_MEMBER_STATE.JOINING;
            continue;
          }
        }
        if (stryMutAct_9fa48("68250") ? false : stryMutAct_9fa48("68249") ? true : (stryCov_9fa48("68249", "68250"), publishedBaselineNodeIds.includes(nodeId))) {
          if (stryMutAct_9fa48("68251")) {
            {}
          } else {
            stryCov_9fa48("68251");
            states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
          }
        }
      }
    }
    return states;
  }
}
function buildServingMemberStatesByNodeId(existingStates = {}, publishedNodeIds = stryMutAct_9fa48("68252") ? ["Stryker was here"] : (stryCov_9fa48("68252"), [])) {
  if (stryMutAct_9fa48("68253")) {
    {}
  } else {
    stryCov_9fa48("68253");
    const nextStates = stryMutAct_9fa48("68254") ? {} : (stryCov_9fa48("68254"), {
      ...(stryMutAct_9fa48("68257") ? existingStates && {} : stryMutAct_9fa48("68256") ? false : stryMutAct_9fa48("68255") ? true : (stryCov_9fa48("68255", "68256", "68257"), existingStates || {}))
    });
    for (const nodeId of normalizeNodeIdList(publishedNodeIds)) {
      if (stryMutAct_9fa48("68258")) {
        {}
      } else {
        stryCov_9fa48("68258");
        nextStates[nodeId] = MEMBERSHIP_MEMBER_STATE.SERVING;
      }
    }
    return nextStates;
  }
}
function buildProjectionDiagnosticsSummary(activeNodeViews = null) {
  if (stryMutAct_9fa48("68259")) {
    {}
  } else {
    stryCov_9fa48("68259");
    const projectionDiagnostics = (stryMutAct_9fa48("68262") ? activeNodeViews?.projectionDiagnostics || typeof activeNodeViews.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("68261") ? false : stryMutAct_9fa48("68260") ? true : (stryCov_9fa48("68260", "68261", "68262"), (stryMutAct_9fa48("68263") ? activeNodeViews.projectionDiagnostics : (stryCov_9fa48("68263"), activeNodeViews?.projectionDiagnostics)) && (stryMutAct_9fa48("68265") ? typeof activeNodeViews.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("68264") ? true : (stryCov_9fa48("68264", "68265"), typeof activeNodeViews.projectionDiagnostics === TYPEOF.OBJECT)))) ? activeNodeViews.projectionDiagnostics : null;
    if (stryMutAct_9fa48("68268") ? false : stryMutAct_9fa48("68267") ? true : stryMutAct_9fa48("68266") ? projectionDiagnostics : (stryCov_9fa48("68266", "68267", "68268"), !projectionDiagnostics)) {
      if (stryMutAct_9fa48("68269")) {
        {}
      } else {
        stryCov_9fa48("68269");
        return null;
      }
    }
    return stryMutAct_9fa48("68270") ? {} : (stryCov_9fa48("68270"), {
      readinessDecisionMode: (stryMutAct_9fa48("68273") ? typeof projectionDiagnostics.readinessDecisionMode === TYPEOF.STRING || projectionDiagnostics.readinessDecisionMode.length > NUM.ZERO : stryMutAct_9fa48("68272") ? false : stryMutAct_9fa48("68271") ? true : (stryCov_9fa48("68271", "68272", "68273"), (stryMutAct_9fa48("68275") ? typeof projectionDiagnostics.readinessDecisionMode !== TYPEOF.STRING : stryMutAct_9fa48("68274") ? true : (stryCov_9fa48("68274", "68275"), typeof projectionDiagnostics.readinessDecisionMode === TYPEOF.STRING)) && (stryMutAct_9fa48("68278") ? projectionDiagnostics.readinessDecisionMode.length <= NUM.ZERO : stryMutAct_9fa48("68277") ? projectionDiagnostics.readinessDecisionMode.length >= NUM.ZERO : stryMutAct_9fa48("68276") ? true : (stryCov_9fa48("68276", "68277", "68278"), projectionDiagnostics.readinessDecisionMode.length > NUM.ZERO)))) ? projectionDiagnostics.readinessDecisionMode : null,
      readinessDecisionDimensions: normalizeStringList(projectionDiagnostics.readinessDecisionDimensions),
      recoveryEligibleProjectionEnabled: stryMutAct_9fa48("68281") ? projectionDiagnostics.recoveryEligibleProjectionEnabled !== true : stryMutAct_9fa48("68280") ? false : stryMutAct_9fa48("68279") ? true : (stryCov_9fa48("68279", "68280", "68281"), projectionDiagnostics.recoveryEligibleProjectionEnabled === (stryMutAct_9fa48("68282") ? false : (stryCov_9fa48("68282"), true))),
      recoveryEligibleIncludedNodeIds: normalizeNodeIdList(projectionDiagnostics.recoveryEligibleIncludedNodeIds),
      livenessFallbackIncludedNodeIds: normalizeNodeIdList(projectionDiagnostics.livenessFallbackIncludedNodeIds),
      readinessExcludedNodeIds: normalizeNodeIdList(projectionDiagnostics.readinessExcludedNodeIds),
      clusterMemberUnhealthyExcludedNodeIds: normalizeNodeIdList(projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds)
    });
  }
}
function deriveMembershipPublicationCandidate(options = {}) {
  if (stryMutAct_9fa48("68283")) {
    {}
  } else {
    stryCov_9fa48("68283");
    const planningSnapshot = (stryMutAct_9fa48("68286") ? options.planningSnapshot || typeof options.planningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("68285") ? false : stryMutAct_9fa48("68284") ? true : (stryCov_9fa48("68284", "68285", "68286"), options.planningSnapshot && (stryMutAct_9fa48("68288") ? typeof options.planningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("68287") ? true : (stryCov_9fa48("68287", "68288"), typeof options.planningSnapshot === TYPEOF.OBJECT)))) ? options.planningSnapshot : buildMembershipPublicationEvidenceSnapshot(options);
    const latestPublicationRow = normalizeLatestPublicationRow(planningSnapshot.latestPublicationRow);
    const latestPublishedPublicationRow = normalizeLatestPublicationRow(planningSnapshot.latestPublishedPublicationRow);
    const latestPublicationStatus = stryMutAct_9fa48("68289") ? String(latestPublicationRow?.status || '').toLowerCase() : (stryCov_9fa48("68289"), String(stryMutAct_9fa48("68292") ? latestPublicationRow?.status && '' : stryMutAct_9fa48("68291") ? false : stryMutAct_9fa48("68290") ? true : (stryCov_9fa48("68290", "68291", "68292"), (stryMutAct_9fa48("68293") ? latestPublicationRow.status : (stryCov_9fa48("68293"), latestPublicationRow?.status)) || (stryMutAct_9fa48("68294") ? "Stryker was here!" : (stryCov_9fa48("68294"), '')))).toUpperCase());
    const carryForwardLatestPublicationBaseline = stryMutAct_9fa48("68297") ? latestPublicationRow && latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED && latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED && Array.isArray(latestPublicationRow.publishedActiveNodeIds) || latestPublicationRow.publishedActiveNodeIds.length > 0 : stryMutAct_9fa48("68296") ? false : stryMutAct_9fa48("68295") ? true : (stryCov_9fa48("68295", "68296", "68297"), (stryMutAct_9fa48("68299") ? latestPublicationRow && latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED && latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED || Array.isArray(latestPublicationRow.publishedActiveNodeIds) : stryMutAct_9fa48("68298") ? true : (stryCov_9fa48("68298", "68299"), (stryMutAct_9fa48("68301") ? latestPublicationRow && latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED || latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("68300") ? true : (stryCov_9fa48("68300", "68301"), (stryMutAct_9fa48("68303") ? latestPublicationRow || latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("68302") ? true : (stryCov_9fa48("68302", "68303"), latestPublicationRow && (stryMutAct_9fa48("68305") ? latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("68304") ? true : (stryCov_9fa48("68304", "68305"), latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED)))) && (stryMutAct_9fa48("68307") ? latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("68306") ? true : (stryCov_9fa48("68306", "68307"), latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED)))) && Array.isArray(latestPublicationRow.publishedActiveNodeIds))) && (stryMutAct_9fa48("68310") ? latestPublicationRow.publishedActiveNodeIds.length <= 0 : stryMutAct_9fa48("68309") ? latestPublicationRow.publishedActiveNodeIds.length >= 0 : stryMutAct_9fa48("68308") ? true : (stryCov_9fa48("68308", "68309", "68310"), latestPublicationRow.publishedActiveNodeIds.length > 0)));
    const publishedBaselineNodeIds = normalizeNodeIdList(carryForwardLatestPublicationBaseline ? latestPublicationRow.publishedActiveNodeIds : stryMutAct_9fa48("68311") ? latestPublishedPublicationRow.publishedActiveNodeIds : (stryCov_9fa48("68311"), latestPublishedPublicationRow?.publishedActiveNodeIds));
    const readinessByNodeId = buildReadinessByNodeId(stryMutAct_9fa48("68312") ? {} : (stryCov_9fa48("68312"), {
      readinessByNodeId: planningSnapshot.readinessByNodeId,
      readinessEntries: planningSnapshot.readinessEntries
    }));
    const observedRecoveryProjectionNodeIds = normalizeNodeIdList(resolveObservedActiveNodeIds(stryMutAct_9fa48("68313") ? {} : (stryCov_9fa48("68313"), {
      ...planningSnapshot,
      readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: stryMutAct_9fa48("68314") ? false : (stryCov_9fa48("68314"), true),
      allowLivenessFallbackProjection: stryMutAct_9fa48("68315") ? false : (stryCov_9fa48("68315"), true)
    })));
    const observedRecoveryProjectionGap = stryMutAct_9fa48("68316") ? observedRecoveryProjectionNodeIds.every(nodeId => !publishedBaselineNodeIds.includes(nodeId)) : (stryCov_9fa48("68316"), observedRecoveryProjectionNodeIds.some(stryMutAct_9fa48("68317") ? () => undefined : (stryCov_9fa48("68317"), nodeId => stryMutAct_9fa48("68318") ? publishedBaselineNodeIds.includes(nodeId) : (stryCov_9fa48("68318"), !publishedBaselineNodeIds.includes(nodeId)))));
    const allowRecoveryEligibleProjection = shouldAllowRecoveryEligibleProjection(stryMutAct_9fa48("68319") ? {} : (stryCov_9fa48("68319"), {
      ...options,
      latestPublicationRow,
      publishedBaselineNodeIds,
      readinessByNodeId,
      observedRecoveryProjectionGap
    }));
    const priorityRecoverySpreadGapPending = hasPriorityRecoverySpreadGap(stryMutAct_9fa48("68322") ? latestPublicationRow?.priorityPartitionSummary && latestPublishedPublicationRow?.priorityPartitionSummary : stryMutAct_9fa48("68321") ? false : stryMutAct_9fa48("68320") ? true : (stryCov_9fa48("68320", "68321", "68322"), (stryMutAct_9fa48("68323") ? latestPublicationRow.priorityPartitionSummary : (stryCov_9fa48("68323"), latestPublicationRow?.priorityPartitionSummary)) || (stryMutAct_9fa48("68324") ? latestPublishedPublicationRow.priorityPartitionSummary : (stryCov_9fa48("68324"), latestPublishedPublicationRow?.priorityPartitionSummary))));
    const allowPrioritySpreadLivenessFallbackProjection = stryMutAct_9fa48("68327") ? allowRecoveryEligibleProjection || priorityRecoverySpreadGapPending || observedRecoveryProjectionGap : stryMutAct_9fa48("68326") ? false : stryMutAct_9fa48("68325") ? true : (stryCov_9fa48("68325", "68326", "68327"), allowRecoveryEligibleProjection && (stryMutAct_9fa48("68329") ? priorityRecoverySpreadGapPending && observedRecoveryProjectionGap : stryMutAct_9fa48("68328") ? true : (stryCov_9fa48("68328", "68329"), priorityRecoverySpreadGapPending || observedRecoveryProjectionGap)));
    const activeNodeViews = resolveActiveNodeViews(stryMutAct_9fa48("68330") ? {} : (stryCov_9fa48("68330"), {
      ...planningSnapshot,
      publicationRows: (stryMutAct_9fa48("68334") ? publishedBaselineNodeIds.length <= 0 : stryMutAct_9fa48("68333") ? publishedBaselineNodeIds.length >= 0 : stryMutAct_9fa48("68332") ? false : stryMutAct_9fa48("68331") ? true : (stryCov_9fa48("68331", "68332", "68333", "68334"), publishedBaselineNodeIds.length > 0)) ? stryMutAct_9fa48("68335") ? [] : (stryCov_9fa48("68335"), [stryMutAct_9fa48("68336") ? {} : (stryCov_9fa48("68336"), {
        publication_epoch: stryMutAct_9fa48("68339") ? (latestPublishedPublicationRow?.publicationEpoch || latestPublicationRow?.publicationEpoch) && 1 : stryMutAct_9fa48("68338") ? false : stryMutAct_9fa48("68337") ? true : (stryCov_9fa48("68337", "68338", "68339"), (stryMutAct_9fa48("68341") ? latestPublishedPublicationRow?.publicationEpoch && latestPublicationRow?.publicationEpoch : stryMutAct_9fa48("68340") ? false : (stryCov_9fa48("68340", "68341"), (stryMutAct_9fa48("68342") ? latestPublishedPublicationRow.publicationEpoch : (stryCov_9fa48("68342"), latestPublishedPublicationRow?.publicationEpoch)) || (stryMutAct_9fa48("68343") ? latestPublicationRow.publicationEpoch : (stryCov_9fa48("68343"), latestPublicationRow?.publicationEpoch)))) || 1),
        status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: publishedBaselineNodeIds
      })]) : stryMutAct_9fa48("68344") ? ["Stryker was here"] : (stryCov_9fa48("68344"), []),
      latestPublicationRow: (stryMutAct_9fa48("68348") ? publishedBaselineNodeIds.length <= 0 : stryMutAct_9fa48("68347") ? publishedBaselineNodeIds.length >= 0 : stryMutAct_9fa48("68346") ? false : stryMutAct_9fa48("68345") ? true : (stryCov_9fa48("68345", "68346", "68347", "68348"), publishedBaselineNodeIds.length > 0)) ? stryMutAct_9fa48("68349") ? {} : (stryCov_9fa48("68349"), {
        publication_epoch: stryMutAct_9fa48("68352") ? (latestPublishedPublicationRow?.publicationEpoch || latestPublicationRow?.publicationEpoch) && 1 : stryMutAct_9fa48("68351") ? false : stryMutAct_9fa48("68350") ? true : (stryCov_9fa48("68350", "68351", "68352"), (stryMutAct_9fa48("68354") ? latestPublishedPublicationRow?.publicationEpoch && latestPublicationRow?.publicationEpoch : stryMutAct_9fa48("68353") ? false : (stryCov_9fa48("68353", "68354"), (stryMutAct_9fa48("68355") ? latestPublishedPublicationRow.publicationEpoch : (stryCov_9fa48("68355"), latestPublishedPublicationRow?.publicationEpoch)) || (stryMutAct_9fa48("68356") ? latestPublicationRow.publicationEpoch : (stryCov_9fa48("68356"), latestPublicationRow?.publicationEpoch)))) || 1),
        status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: publishedBaselineNodeIds
      }) : null,
      readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: allowRecoveryEligibleProjection,
      allowLivenessFallbackProjection: allowPrioritySpreadLivenessFallbackProjection
    }));
    const projectionDiagnostics = buildProjectionDiagnosticsSummary(activeNodeViews);
    const projectedServingNodeIds = normalizeNodeIdList(stryMutAct_9fa48("68359") ? activeNodeViews.projectedServingNodeIds && activeNodeViews.projectedActiveNodeIds : stryMutAct_9fa48("68358") ? false : stryMutAct_9fa48("68357") ? true : (stryCov_9fa48("68357", "68358", "68359"), activeNodeViews.projectedServingNodeIds || activeNodeViews.projectedActiveNodeIds));
    const locallyEligibleNodeIds = normalizeNodeIdList(stryMutAct_9fa48("68362") ? activeNodeViews.locallyEligibleNodeIds && projectedServingNodeIds : stryMutAct_9fa48("68361") ? false : stryMutAct_9fa48("68360") ? true : (stryCov_9fa48("68360", "68361", "68362"), activeNodeViews.locallyEligibleNodeIds || projectedServingNodeIds));
    const recoveryActiveNodeCohort = resolvePriorityRecoveryActiveNodeCohort(stryMutAct_9fa48("68363") ? {} : (stryCov_9fa48("68363"), {
      publishedActiveNodeIds: publishedBaselineNodeIds,
      membershipLifecycleSummary: stryMutAct_9fa48("68364") ? {} : (stryCov_9fa48("68364"), {
        publishedActiveNodeIds: publishedBaselineNodeIds,
        projectedServingNodeIds,
        locallyEligibleNodeIds,
        projectionDiagnostics
      })
    }));
    const recoveryEpochByNodeId = buildLatestRecoveryEpochByNodeId(options.recoveryEpochsByNodeId);
    const publishedActiveNodeIds = normalizeNodeIdList(Array.isArray(planningSnapshot.publishedActiveNodeIds) ? planningSnapshot.publishedActiveNodeIds : (stryMutAct_9fa48("68368") ? publishedBaselineNodeIds.length <= 0 : stryMutAct_9fa48("68367") ? publishedBaselineNodeIds.length >= 0 : stryMutAct_9fa48("68366") ? false : stryMutAct_9fa48("68365") ? true : (stryCov_9fa48("68365", "68366", "68367", "68368"), publishedBaselineNodeIds.length > 0)) ? recoveryActiveNodeCohort.activeNodeIds : resolveObservedActiveNodeIds(stryMutAct_9fa48("68369") ? {} : (stryCov_9fa48("68369"), {
      ...planningSnapshot,
      readinessByNodeId
    })));
    const priorityRecoveryPublicationContext = buildActiveMembershipSnapshot(stryMutAct_9fa48("68370") ? {} : (stryCov_9fa48("68370"), {
      publishedActiveNodeIds,
      membershipLifecycleSummary: stryMutAct_9fa48("68371") ? {} : (stryCov_9fa48("68371"), {
        publishedActiveNodeIds,
        projectedServingNodeIds,
        locallyEligibleNodeIds,
        projectionDiagnostics
      }),
      recoveryActiveNodeIds: recoveryActiveNodeCohort.activeNodeIds,
      recoveryActiveNodeSource: recoveryActiveNodeCohort.source
    }));
    const requiredAckNodeIds = normalizeNodeIdList(Array.isArray(planningSnapshot.requiredAckNodeIds) ? planningSnapshot.requiredAckNodeIds : publishedActiveNodeIds);
    const sourceTopologyEpoch = normalizePositiveInteger(planningSnapshot.sourceTopologyEpoch, null);
    const sourceSnapshotVersion = normalizePositiveInteger(planningSnapshot.sourceSnapshotVersion, null);
    const priorityPartitionSummary = stryMutAct_9fa48("68374") ? normalizePriorityPartitionSummary(planningSnapshot.priorityPartitionSummary || planningSnapshot.priorityRecoveryPlanningSnapshot?.priorityPartitionSummary, {
      requiredDistinctNodeCount: Math.min(PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT, locallyEligibleNodeIds.length),
      readyEligibleNodeCount: locallyEligibleNodeIds.length
    }) && buildDerivedPriorityPartitionSummary({
      serviceRows: planningSnapshot.serviceRows,
      partitionRows: planningSnapshot.partitionRows,
      readinessByNodeId,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      publishedActiveNodeIds
    }) : stryMutAct_9fa48("68373") ? false : stryMutAct_9fa48("68372") ? true : (stryCov_9fa48("68372", "68373", "68374"), normalizePriorityPartitionSummary(stryMutAct_9fa48("68377") ? planningSnapshot.priorityPartitionSummary && planningSnapshot.priorityRecoveryPlanningSnapshot?.priorityPartitionSummary : stryMutAct_9fa48("68376") ? false : stryMutAct_9fa48("68375") ? true : (stryCov_9fa48("68375", "68376", "68377"), planningSnapshot.priorityPartitionSummary || (stryMutAct_9fa48("68378") ? planningSnapshot.priorityRecoveryPlanningSnapshot.priorityPartitionSummary : (stryCov_9fa48("68378"), planningSnapshot.priorityRecoveryPlanningSnapshot?.priorityPartitionSummary))), stryMutAct_9fa48("68379") ? {} : (stryCov_9fa48("68379"), {
      requiredDistinctNodeCount: stryMutAct_9fa48("68380") ? Math.max(PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT, locallyEligibleNodeIds.length) : (stryCov_9fa48("68380"), Math.min(PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT, locallyEligibleNodeIds.length)),
      readyEligibleNodeCount: locallyEligibleNodeIds.length
    })) || buildDerivedPriorityPartitionSummary(stryMutAct_9fa48("68381") ? {} : (stryCov_9fa48("68381"), {
      serviceRows: planningSnapshot.serviceRows,
      partitionRows: planningSnapshot.partitionRows,
      readinessByNodeId,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      publishedActiveNodeIds
    })));
    const reasonCode = (stryMutAct_9fa48("68384") ? typeof planningSnapshot.reasonCode === TYPEOF.STRING || planningSnapshot.reasonCode.length > 0 : stryMutAct_9fa48("68383") ? false : stryMutAct_9fa48("68382") ? true : (stryCov_9fa48("68382", "68383", "68384"), (stryMutAct_9fa48("68386") ? typeof planningSnapshot.reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("68385") ? true : (stryCov_9fa48("68385", "68386"), typeof planningSnapshot.reasonCode === TYPEOF.STRING)) && (stryMutAct_9fa48("68389") ? planningSnapshot.reasonCode.length <= 0 : stryMutAct_9fa48("68388") ? planningSnapshot.reasonCode.length >= 0 : stryMutAct_9fa48("68387") ? true : (stryCov_9fa48("68387", "68388", "68389"), planningSnapshot.reasonCode.length > 0)))) ? planningSnapshot.reasonCode : stryMutAct_9fa48("68390") ? "" : (stryCov_9fa48("68390"), 'authoritative_membership_changed');
    const membershipLifecycleSummaryBase = (stryMutAct_9fa48("68393") ? planningSnapshot.membershipLifecycleSummary || typeof planningSnapshot.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("68392") ? false : stryMutAct_9fa48("68391") ? true : (stryCov_9fa48("68391", "68392", "68393"), planningSnapshot.membershipLifecycleSummary && (stryMutAct_9fa48("68395") ? typeof planningSnapshot.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("68394") ? true : (stryCov_9fa48("68394", "68395"), typeof planningSnapshot.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? buildMembershipLifecycleSummary(planningSnapshot.membershipLifecycleSummary) : buildMembershipLifecycleSummary(stryMutAct_9fa48("68396") ? {} : (stryCov_9fa48("68396"), {
      lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
      publishedActiveNodeIds,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      suspectedOrTransitioningNodeIds: activeNodeViews.suspectedOrTransitioningNodeIds,
      memberStatesByNodeId: buildPublishedMemberStates(stryMutAct_9fa48("68397") ? {} : (stryCov_9fa48("68397"), {
        publishedBaselineNodeIds,
        desiredPublishedNodeIds: publishedActiveNodeIds,
        projectedServingNodeIds,
        suspectedOrTransitioningNodeIds: activeNodeViews.suspectedOrTransitioningNodeIds,
        recoveryEpochByNodeId
      })),
      recoveryEpochByNodeId: Object.keys(recoveryEpochByNodeId).reduce((accumulator, nodeId) => {
        if (stryMutAct_9fa48("68398")) {
          {}
        } else {
          stryCov_9fa48("68398");
          accumulator[nodeId] = recoveryEpochByNodeId[nodeId].epochId;
          return accumulator;
        }
      }, {}),
      membershipFreeze: activeNodeViews.membershipFreeze,
      projectionDiagnostics,
      recoveryActiveNodeIds: priorityRecoveryPublicationContext.recoveryActiveNodeIds,
      recoveryActiveNodeSource: priorityRecoveryPublicationContext.recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds: priorityRecoveryPublicationContext.missingPublishedRecoveryActiveNodeIds
    }));
    const baselineEpoch = normalizePositiveInteger(stryMutAct_9fa48("68399") ? latestPublicationRow.publicationEpoch : (stryCov_9fa48("68399"), latestPublicationRow?.publicationEpoch), 0);
    const changed = stryMutAct_9fa48("68402") ? (!latestPublicationRow || !listEquals(latestPublicationRow.publishedActiveNodeIds, publishedActiveNodeIds) || didOptionalSourceVersionChange(latestPublicationRow.sourceTopologyEpoch, sourceTopologyEpoch)) && didOptionalSourceVersionChange(latestPublicationRow.sourceSnapshotVersion, sourceSnapshotVersion) : stryMutAct_9fa48("68401") ? false : stryMutAct_9fa48("68400") ? true : (stryCov_9fa48("68400", "68401", "68402"), (stryMutAct_9fa48("68404") ? (!latestPublicationRow || !listEquals(latestPublicationRow.publishedActiveNodeIds, publishedActiveNodeIds)) && didOptionalSourceVersionChange(latestPublicationRow.sourceTopologyEpoch, sourceTopologyEpoch) : stryMutAct_9fa48("68403") ? false : (stryCov_9fa48("68403", "68404"), (stryMutAct_9fa48("68406") ? !latestPublicationRow && !listEquals(latestPublicationRow.publishedActiveNodeIds, publishedActiveNodeIds) : stryMutAct_9fa48("68405") ? false : (stryCov_9fa48("68405", "68406"), (stryMutAct_9fa48("68407") ? latestPublicationRow : (stryCov_9fa48("68407"), !latestPublicationRow)) || (stryMutAct_9fa48("68408") ? listEquals(latestPublicationRow.publishedActiveNodeIds, publishedActiveNodeIds) : (stryCov_9fa48("68408"), !listEquals(latestPublicationRow.publishedActiveNodeIds, publishedActiveNodeIds))))) || didOptionalSourceVersionChange(latestPublicationRow.sourceTopologyEpoch, sourceTopologyEpoch))) || didOptionalSourceVersionChange(latestPublicationRow.sourceSnapshotVersion, sourceSnapshotVersion));
    const priorityPartitionSummaryChanged = stryMutAct_9fa48("68409") ? arePriorityPartitionSummariesEqual(latestPublicationRow?.priorityPartitionSummary, priorityPartitionSummary) : (stryCov_9fa48("68409"), !arePriorityPartitionSummariesEqual(stryMutAct_9fa48("68410") ? latestPublicationRow.priorityPartitionSummary : (stryCov_9fa48("68410"), latestPublicationRow?.priorityPartitionSummary), priorityPartitionSummary));
    const candidatePublicationEpoch = changed ? stryMutAct_9fa48("68411") ? baselineEpoch - 1 : (stryCov_9fa48("68411"), baselineEpoch + 1) : stryMutAct_9fa48("68412") ? Math.min(baselineEpoch, 1) : (stryCov_9fa48("68412"), Math.max(baselineEpoch, 1));
    const candidatePublicationStatus = (stryMutAct_9fa48("68415") ? changed !== true : stryMutAct_9fa48("68414") ? false : stryMutAct_9fa48("68413") ? true : (stryCov_9fa48("68413", "68414", "68415"), changed === (stryMutAct_9fa48("68416") ? false : (stryCov_9fa48("68416"), true)))) ? MEMBERSHIP_PUBLICATION_STATUS.OPEN : stryMutAct_9fa48("68417") ? String(latestPublicationRow?.status || MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED).toLowerCase() : (stryCov_9fa48("68417"), String(stryMutAct_9fa48("68420") ? latestPublicationRow?.status && MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68419") ? false : stryMutAct_9fa48("68418") ? true : (stryCov_9fa48("68418", "68419", "68420"), (stryMutAct_9fa48("68421") ? latestPublicationRow.status : (stryCov_9fa48("68421"), latestPublicationRow?.status)) || MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)).toUpperCase());
    const recoveryProtocolSnapshot = buildRecoveryProtocolSnapshot(stryMutAct_9fa48("68422") ? {} : (stryCov_9fa48("68422"), {
      publicationEpoch: candidatePublicationEpoch,
      publicationStatus: candidatePublicationStatus,
      publishedActiveNodeIdsPresent: stryMutAct_9fa48("68423") ? false : (stryCov_9fa48("68423"), true),
      durablePublishedActiveNodeIds: publishedBaselineNodeIds,
      publishedActiveNodeIds,
      requiredAckNodeIds,
      acknowledgedNodeIds: normalizeNodeIdList(options.acknowledgedNodeIds),
      sourceTopologyEpoch,
      sourceSnapshotVersion,
      priorityPartitionSummary,
      membershipLifecycleSummary: membershipLifecycleSummaryBase,
      projectionDiagnostics
    }));
    const membershipLifecycleSummary = buildMembershipLifecycleSummary(stryMutAct_9fa48("68424") ? {} : (stryCov_9fa48("68424"), {
      ...membershipLifecycleSummaryBase,
      participationByNodeId: recoveryProtocolSnapshot.participationByNodeId,
      participationStateCounts: recoveryProtocolSnapshot.participationStateCounts,
      recoveryProtocolState: recoveryProtocolSnapshot.recoveryProtocolState,
      recoveryProtocolReasonCodes: recoveryProtocolSnapshot.priorityRecoveryReasonCodes
    }));
    const membershipLifecycleSummaryChanged = stryMutAct_9fa48("68425") ? areMembershipLifecycleSummariesEqual(latestPublicationRow?.membershipLifecycleSummary, membershipLifecycleSummary) : (stryCov_9fa48("68425"), !areMembershipLifecycleSummariesEqual(stryMutAct_9fa48("68426") ? latestPublicationRow.membershipLifecycleSummary : (stryCov_9fa48("68426"), latestPublicationRow?.membershipLifecycleSummary), membershipLifecycleSummary));
    return stryMutAct_9fa48("68427") ? {} : (stryCov_9fa48("68427"), {
      publicationKind: MEMBERSHIP_PUBLICATION_KIND,
      publicationEpoch: candidatePublicationEpoch,
      publicationStatus: candidatePublicationStatus,
      publicationObservationState: recoveryProtocolSnapshot.publicationObservationState,
      publisherNodeId: planningSnapshot.publisherNodeId,
      sourceTopologyEpoch,
      sourceSnapshotVersion,
      publishedPlanningEpoch: recoveryProtocolSnapshot.publishedPlanningEpoch,
      publishedActiveNodeIdsPresent: recoveryProtocolSnapshot.publishedActiveNodeIdsPresent,
      publishedActiveNodeIds,
      requiredAckNodeIds,
      acknowledgedNodeIds: normalizeNodeIdList(planningSnapshot.acknowledgedNodeIds),
      priorityPartitionSummary,
      membershipLifecycleSummary,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      recoveryEligibleIncludedNodeIds: recoveryProtocolSnapshot.recoveryEligibleIncludedNodeIds,
      recoveryActiveNodeIds: recoveryProtocolSnapshot.recoveryActiveNodeIds,
      recoveryActiveNodeSource: recoveryProtocolSnapshot.recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds: recoveryProtocolSnapshot.missingPublishedRecoveryActiveNodeIds,
      participationByNodeId: recoveryProtocolSnapshot.participationByNodeId,
      participationStateCounts: recoveryProtocolSnapshot.participationStateCounts,
      recoveryProtocolState: recoveryProtocolSnapshot.recoveryProtocolState,
      targetParticipation: recoveryProtocolSnapshot.targetParticipation,
      priorityRecoveryReasonCodes: recoveryProtocolSnapshot.priorityRecoveryReasonCodes,
      projectionDiagnostics,
      reasonCode,
      changed,
      priorityPartitionSummaryChanged
    });
  }
}
function deriveMembershipPublicationId(candidate = {}) {
  if (stryMutAct_9fa48("68428")) {
    {}
  } else {
    stryCov_9fa48("68428");
    const fingerprint = JSON.stringify(stryMutAct_9fa48("68429") ? {} : (stryCov_9fa48("68429"), {
      publicationKind: String(stryMutAct_9fa48("68432") ? candidate.publicationKind && MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("68431") ? false : stryMutAct_9fa48("68430") ? true : (stryCov_9fa48("68430", "68431", "68432"), candidate.publicationKind || MEMBERSHIP_PUBLICATION_KIND)),
      publicationEpoch: normalizePositiveInteger(candidate.publicationEpoch, 1),
      sourceTopologyEpoch: normalizePositiveInteger(candidate.sourceTopologyEpoch, null),
      sourceSnapshotVersion: normalizePositiveInteger(candidate.sourceSnapshotVersion, null),
      publishedActiveNodeIds: normalizeNodeIdList(candidate.publishedActiveNodeIds),
      requiredAckNodeIds: normalizeNodeIdList(candidate.requiredAckNodeIds)
    }));
    const digest = stryMutAct_9fa48("68433") ? createHash('sha256').update(fingerprint).digest('hex') : (stryCov_9fa48("68433"), createHash(stryMutAct_9fa48("68434") ? "" : (stryCov_9fa48("68434"), 'sha256')).update(fingerprint).digest(stryMutAct_9fa48("68435") ? "" : (stryCov_9fa48("68435"), 'hex')).slice(0, 24));
    return stryMutAct_9fa48("68436") ? MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION + normalizePositiveInteger(candidate.publicationEpoch, NUM.ONE) + MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY_2 - digest : (stryCov_9fa48("68436"), (stryMutAct_9fa48("68437") ? MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION + normalizePositiveInteger(candidate.publicationEpoch, NUM.ONE) - MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY_2 : (stryCov_9fa48("68437"), (stryMutAct_9fa48("68438") ? MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION - normalizePositiveInteger(candidate.publicationEpoch, NUM.ONE) : (stryCov_9fa48("68438"), MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION + normalizePositiveInteger(candidate.publicationEpoch, NUM.ONE))) + MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY_2)) + digest);
  }
}
function buildMembershipPublicationRow(options = {}) {
  if (stryMutAct_9fa48("68439")) {
    {}
  } else {
    stryCov_9fa48("68439");
    const candidate = stryMutAct_9fa48("68442") ? options.candidate && {} : stryMutAct_9fa48("68441") ? false : stryMutAct_9fa48("68440") ? true : (stryCov_9fa48("68440", "68441", "68442"), options.candidate || {});
    const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
    const status = stryMutAct_9fa48("68443") ? String(options.status || MEMBERSHIP_PUBLICATION_STATUS.OPEN).toLowerCase() : (stryCov_9fa48("68443"), String(stryMutAct_9fa48("68446") ? options.status && MEMBERSHIP_PUBLICATION_STATUS.OPEN : stryMutAct_9fa48("68445") ? false : stryMutAct_9fa48("68444") ? true : (stryCov_9fa48("68444", "68445", "68446"), options.status || MEMBERSHIP_PUBLICATION_STATUS.OPEN)).toUpperCase());
    const transitionHistory = Array.isArray(options.transitionHistory) ? stryMutAct_9fa48("68447") ? options.transitionHistory : (stryCov_9fa48("68447"), options.transitionHistory.slice()) : stryMutAct_9fa48("68448") ? [] : (stryCov_9fa48("68448"), [buildTransitionHistoryEntry(stryMutAct_9fa48("68449") ? {} : (stryCov_9fa48("68449"), {
      state: status,
      reasonCode: candidate.reasonCode,
      at: nowMs
    }))]);
    return stryMutAct_9fa48("68450") ? {} : (stryCov_9fa48("68450"), {
      publication_id: String(stryMutAct_9fa48("68453") ? (options.publicationId || deriveMembershipPublicationId(candidate)) && uuidv4() : stryMutAct_9fa48("68452") ? false : stryMutAct_9fa48("68451") ? true : (stryCov_9fa48("68451", "68452", "68453"), (stryMutAct_9fa48("68455") ? options.publicationId && deriveMembershipPublicationId(candidate) : stryMutAct_9fa48("68454") ? false : (stryCov_9fa48("68454", "68455"), options.publicationId || deriveMembershipPublicationId(candidate))) || uuidv4())),
      publication_kind: String(stryMutAct_9fa48("68458") ? candidate.publicationKind && MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("68457") ? false : stryMutAct_9fa48("68456") ? true : (stryCov_9fa48("68456", "68457", "68458"), candidate.publicationKind || MEMBERSHIP_PUBLICATION_KIND)),
      publication_epoch: normalizePositiveInteger(candidate.publicationEpoch, NUM.ONE),
      publisher_node_id: String(stryMutAct_9fa48("68461") ? candidate.publisherNodeId && MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY : stryMutAct_9fa48("68460") ? false : stryMutAct_9fa48("68459") ? true : (stryCov_9fa48("68459", "68460", "68461"), candidate.publisherNodeId || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY)),
      source_topology_epoch: normalizePositiveInteger(candidate.sourceTopologyEpoch, null),
      source_snapshot_version: normalizePositiveInteger(candidate.sourceSnapshotVersion, null),
      published_active_node_ids: normalizeNodeIdList(candidate.publishedActiveNodeIds),
      required_ack_node_ids: normalizeNodeIdList(candidate.requiredAckNodeIds),
      acknowledged_node_ids: normalizeNodeIdList(candidate.acknowledgedNodeIds),
      priority_partition_summary: (stryMutAct_9fa48("68464") ? candidate.priorityPartitionSummary || typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("68463") ? false : stryMutAct_9fa48("68462") ? true : (stryCov_9fa48("68462", "68463", "68464"), candidate.priorityPartitionSummary && (stryMutAct_9fa48("68466") ? typeof candidate.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("68465") ? true : (stryCov_9fa48("68465", "68466"), typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT)))) ? candidate.priorityPartitionSummary : null,
      membership_lifecycle_summary: (stryMutAct_9fa48("68469") ? candidate.membershipLifecycleSummary || typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("68468") ? false : stryMutAct_9fa48("68467") ? true : (stryCov_9fa48("68467", "68468", "68469"), candidate.membershipLifecycleSummary && (stryMutAct_9fa48("68471") ? typeof candidate.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("68470") ? true : (stryCov_9fa48("68470", "68471"), typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? candidate.membershipLifecycleSummary : buildMembershipLifecycleSummary(stryMutAct_9fa48("68472") ? {} : (stryCov_9fa48("68472"), {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds: candidate.publishedActiveNodeIds
      })),
      status,
      reason_code: String(stryMutAct_9fa48("68475") ? candidate.reasonCode && MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY : stryMutAct_9fa48("68474") ? false : stryMutAct_9fa48("68473") ? true : (stryCov_9fa48("68473", "68474", "68475"), candidate.reasonCode || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY)),
      created_at: nowMs,
      updated_at: nowMs,
      published_at: (stryMutAct_9fa48("68478") ? status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68477") ? false : stryMutAct_9fa48("68476") ? true : (stryCov_9fa48("68476", "68477", "68478"), status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) ? nowMs : null,
      closed_at: (stryMutAct_9fa48("68481") ? status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68480") ? false : stryMutAct_9fa48("68479") ? true : (stryCov_9fa48("68479", "68480", "68481"), status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) ? nowMs : null,
      transition_history: transitionHistory
    });
  }
}
function serializeMembershipPublicationRow(publicationRow = {}) {
  if (stryMutAct_9fa48("68482")) {
    {}
  } else {
    stryCov_9fa48("68482");
    return serializeControlPlanePublicationRow(publicationRow);
  }
}
function acknowledgeMembershipPublication(options = {}) {
  if (stryMutAct_9fa48("68483")) {
    {}
  } else {
    stryCov_9fa48("68483");
    const publicationRow = stryMutAct_9fa48("68486") ? options.publicationRow && {} : stryMutAct_9fa48("68485") ? false : stryMutAct_9fa48("68484") ? true : (stryCov_9fa48("68484", "68485", "68486"), options.publicationRow || {});
    const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
    const nodeId = stryMutAct_9fa48("68487") ? String(options.nodeId || '') : (stryCov_9fa48("68487"), String(stryMutAct_9fa48("68490") ? options.nodeId && '' : stryMutAct_9fa48("68489") ? false : stryMutAct_9fa48("68488") ? true : (stryCov_9fa48("68488", "68489", "68490"), options.nodeId || (stryMutAct_9fa48("68491") ? "Stryker was here!" : (stryCov_9fa48("68491"), '')))).trim());
    const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
    const requiredAckNodeIds = normalizedPublication.requiredAckNodeIds;
    if (stryMutAct_9fa48("68494") ? nodeId || !requiredAckNodeIds.includes(nodeId) : stryMutAct_9fa48("68493") ? false : stryMutAct_9fa48("68492") ? true : (stryCov_9fa48("68492", "68493", "68494"), nodeId && (stryMutAct_9fa48("68495") ? requiredAckNodeIds.includes(nodeId) : (stryCov_9fa48("68495"), !requiredAckNodeIds.includes(nodeId))))) {
      if (stryMutAct_9fa48("68496")) {
        {}
      } else {
        stryCov_9fa48("68496");
        return stryMutAct_9fa48("68497") ? {} : (stryCov_9fa48("68497"), {
          ...publicationRow,
          acknowledged_node_ids: normalizedPublication.acknowledgedNodeIds,
          updated_at: nowMs,
          transition_history: stryMutAct_9fa48("68498") ? [] : (stryCov_9fa48("68498"), [...(Array.isArray(publicationRow.transition_history) ? publicationRow.transition_history : normalizedPublication.transitionHistory)])
        });
      }
    }
    if (stryMutAct_9fa48("68500") ? false : stryMutAct_9fa48("68499") ? true : (stryCov_9fa48("68499", "68500"), hasPublicationTimedOut(publicationRow, options))) {
      if (stryMutAct_9fa48("68501")) {
        {}
      } else {
        stryCov_9fa48("68501");
        return abandonMembershipPublication(stryMutAct_9fa48("68502") ? {} : (stryCov_9fa48("68502"), {
          publicationRow,
          nowMs,
          reasonCode: options.timeoutReasonCode
        }));
      }
    }
    const acknowledgedNodeIds = normalizeNodeIdList(stryMutAct_9fa48("68503") ? [] : (stryCov_9fa48("68503"), [...normalizedPublication.acknowledgedNodeIds, nodeId]));
    const isDuplicate = listEquals(acknowledgedNodeIds, normalizedPublication.acknowledgedNodeIds);
    if (stryMutAct_9fa48("68505") ? false : stryMutAct_9fa48("68504") ? true : (stryCov_9fa48("68504", "68505"), isDuplicate)) {
      if (stryMutAct_9fa48("68506")) {
        {}
      } else {
        stryCov_9fa48("68506");
        return stryMutAct_9fa48("68507") ? {} : (stryCov_9fa48("68507"), {
          ...publicationRow,
          acknowledged_node_ids: acknowledgedNodeIds,
          updated_at: nowMs,
          transition_history: stryMutAct_9fa48("68508") ? [] : (stryCov_9fa48("68508"), [...(Array.isArray(publicationRow.transition_history) ? publicationRow.transition_history : normalizedPublication.transitionHistory)])
        });
      }
    }
    const allAcknowledged = listEquals(acknowledgedNodeIds, requiredAckNodeIds);
    const nextStatus = allAcknowledged ? MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : MEMBERSHIP_PUBLICATION_STATUS.ACK_PENDING;
    const transitionHistory = stryMutAct_9fa48("68509") ? [] : (stryCov_9fa48("68509"), [...(Array.isArray(publicationRow.transition_history) ? publicationRow.transition_history : normalizedPublication.transitionHistory), buildTransitionHistoryEntry(stryMutAct_9fa48("68510") ? {} : (stryCov_9fa48("68510"), {
      state: nextStatus,
      reasonCode: allAcknowledged ? stryMutAct_9fa48("68511") ? "" : (stryCov_9fa48("68511"), 'required_acknowledgements_completed') : stryMutAct_9fa48("68512") ? "" : (stryCov_9fa48("68512"), 'acknowledgement_recorded'),
      at: nowMs,
      metadata: stryMutAct_9fa48("68513") ? {} : (stryCov_9fa48("68513"), {
        nodeId
      })
    }))]);
    const nextLifecycleState = allAcknowledged ? MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE : MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING;
    const publishedNodeIdsForState = (stryMutAct_9fa48("68517") ? normalizedPublication.publishedActiveNodeIds.length <= 0 : stryMutAct_9fa48("68516") ? normalizedPublication.publishedActiveNodeIds.length >= 0 : stryMutAct_9fa48("68515") ? false : stryMutAct_9fa48("68514") ? true : (stryCov_9fa48("68514", "68515", "68516", "68517"), normalizedPublication.publishedActiveNodeIds.length > 0)) ? normalizedPublication.publishedActiveNodeIds : normalizedPublication.requiredAckNodeIds;
    return stryMutAct_9fa48("68518") ? {} : (stryCov_9fa48("68518"), {
      ...publicationRow,
      acknowledged_node_ids: acknowledgedNodeIds,
      status: nextStatus,
      updated_at: nowMs,
      published_at: allAcknowledged ? nowMs : stryMutAct_9fa48("68521") ? publicationRow.published_at && null : stryMutAct_9fa48("68520") ? false : stryMutAct_9fa48("68519") ? true : (stryCov_9fa48("68519", "68520", "68521"), publicationRow.published_at || null),
      closed_at: allAcknowledged ? nowMs : stryMutAct_9fa48("68524") ? publicationRow.closed_at && null : stryMutAct_9fa48("68523") ? false : stryMutAct_9fa48("68522") ? true : (stryCov_9fa48("68522", "68523", "68524"), publicationRow.closed_at || null),
      membership_lifecycle_summary: buildMembershipLifecycleSummary(stryMutAct_9fa48("68525") ? {} : (stryCov_9fa48("68525"), {
        lifecycleState: nextLifecycleState,
        publishedActiveNodeIds: normalizedPublication.publishedActiveNodeIds,
        projectedServingNodeIds: stryMutAct_9fa48("68526") ? normalizedPublication.membershipLifecycleSummary.projectedServingNodeIds : (stryCov_9fa48("68526"), normalizedPublication.membershipLifecycleSummary?.projectedServingNodeIds),
        locallyEligibleNodeIds: stryMutAct_9fa48("68527") ? normalizedPublication.membershipLifecycleSummary.locallyEligibleNodeIds : (stryCov_9fa48("68527"), normalizedPublication.membershipLifecycleSummary?.locallyEligibleNodeIds),
        suspectedOrTransitioningNodeIds: stryMutAct_9fa48("68528") ? normalizedPublication.membershipLifecycleSummary.suspectedOrTransitioningNodeIds : (stryCov_9fa48("68528"), normalizedPublication.membershipLifecycleSummary?.suspectedOrTransitioningNodeIds),
        memberStatesByNodeId: allAcknowledged ? buildServingMemberStatesByNodeId(stryMutAct_9fa48("68529") ? normalizedPublication.membershipLifecycleSummary.memberStatesByNodeId : (stryCov_9fa48("68529"), normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId), publishedNodeIdsForState) : stryMutAct_9fa48("68530") ? normalizedPublication.membershipLifecycleSummary.memberStatesByNodeId : (stryCov_9fa48("68530"), normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId),
        recoveryEpochByNodeId: stryMutAct_9fa48("68531") ? normalizedPublication.membershipLifecycleSummary.recoveryEpochByNodeId : (stryCov_9fa48("68531"), normalizedPublication.membershipLifecycleSummary?.recoveryEpochByNodeId),
        membershipFreeze: stryMutAct_9fa48("68532") ? normalizedPublication.membershipLifecycleSummary.membershipFreeze : (stryCov_9fa48("68532"), normalizedPublication.membershipLifecycleSummary?.membershipFreeze),
        projectionDiagnostics: stryMutAct_9fa48("68533") ? normalizedPublication.membershipLifecycleSummary.projectionDiagnostics : (stryCov_9fa48("68533"), normalizedPublication.membershipLifecycleSummary?.projectionDiagnostics)
      })),
      transition_history: transitionHistory
    });
  }
}
class MembershipPublicationCoordinator {
  constructor(options = {}) {
    if (stryMutAct_9fa48("68534")) {
      {}
    } else {
      stryCov_9fa48("68534");
      this.nodeId = stryMutAct_9fa48("68537") ? options.nodeId && null : stryMutAct_9fa48("68536") ? false : stryMutAct_9fa48("68535") ? true : (stryCov_9fa48("68535", "68536", "68537"), options.nodeId || null);
      this.systemTableCache = stryMutAct_9fa48("68540") ? options.systemTableCache && null : stryMutAct_9fa48("68539") ? false : stryMutAct_9fa48("68538") ? true : (stryCov_9fa48("68538", "68539", "68540"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("68543") ? options.cdcIntegrationService && null : stryMutAct_9fa48("68542") ? false : stryMutAct_9fa48("68541") ? true : (stryCov_9fa48("68541", "68542", "68543"), options.cdcIntegrationService || null);
      this.authoritativeControlPlaneView = stryMutAct_9fa48("68546") ? options.authoritativeControlPlaneView && null : stryMutAct_9fa48("68545") ? false : stryMutAct_9fa48("68544") ? true : (stryCov_9fa48("68544", "68545", "68546"), options.authoritativeControlPlaneView || null);
      this.controlPlanePublicationsOwner = stryMutAct_9fa48("68549") ? options.controlPlanePublicationsOwner && null : stryMutAct_9fa48("68548") ? false : stryMutAct_9fa48("68547") ? true : (stryCov_9fa48("68547", "68548", "68549"), options.controlPlanePublicationsOwner || null);
      this.controlPlaneReadinessService = stryMutAct_9fa48("68552") ? options.controlPlaneReadinessService && null : stryMutAct_9fa48("68551") ? false : stryMutAct_9fa48("68550") ? true : (stryCov_9fa48("68550", "68551", "68552"), options.controlPlaneReadinessService || null);
      this.replicaOperationRepository = stryMutAct_9fa48("68555") ? options.replicaOperationRepository && null : stryMutAct_9fa48("68554") ? false : stryMutAct_9fa48("68553") ? true : (stryCov_9fa48("68553", "68554", "68555"), options.replicaOperationRepository || null);
      this.logger = stryMutAct_9fa48("68558") ? (options.logger || this.controlPlaneReadinessService?.logger) && console : stryMutAct_9fa48("68557") ? false : stryMutAct_9fa48("68556") ? true : (stryCov_9fa48("68556", "68557", "68558"), (stryMutAct_9fa48("68560") ? options.logger && this.controlPlaneReadinessService?.logger : stryMutAct_9fa48("68559") ? false : (stryCov_9fa48("68559", "68560"), options.logger || (stryMutAct_9fa48("68561") ? this.controlPlaneReadinessService.logger : (stryCov_9fa48("68561"), this.controlPlaneReadinessService?.logger)))) || console);
      this.now = (stryMutAct_9fa48("68564") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("68563") ? false : stryMutAct_9fa48("68562") ? true : (stryCov_9fa48("68562", "68563", "68564"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("68565") ? () => undefined : (stryCov_9fa48("68565"), () => Date.now());
      this.workflowCoordinator = stryMutAct_9fa48("68568") ? options.workflowCoordinator && new DurableWorkflowCoordinator({
        now: this.now
      }) : stryMutAct_9fa48("68567") ? false : stryMutAct_9fa48("68566") ? true : (stryCov_9fa48("68566", "68567", "68568"), options.workflowCoordinator || new DurableWorkflowCoordinator(stryMutAct_9fa48("68569") ? {} : (stryCov_9fa48("68569"), {
        now: this.now
      })));
      this.publicationReconcileLane = stryMutAct_9fa48("68572") ? options.publicationReconcileLane && new OperationLane({
        name: MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION_RECONCILE,
        workflowCoordinator: this.workflowCoordinator
      }) : stryMutAct_9fa48("68571") ? false : stryMutAct_9fa48("68570") ? true : (stryCov_9fa48("68570", "68571", "68572"), options.publicationReconcileLane || new OperationLane(stryMutAct_9fa48("68573") ? {} : (stryCov_9fa48("68573"), {
        name: MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION_RECONCILE,
        workflowCoordinator: this.workflowCoordinator
      })));
      this.publicationAcknowledgementLane = stryMutAct_9fa48("68576") ? options.publicationAcknowledgementLane && new OperationLane({
        name: MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION_ACKNOWLEDGEMENT,
        workflowCoordinator: this.workflowCoordinator
      }) : stryMutAct_9fa48("68575") ? false : stryMutAct_9fa48("68574") ? true : (stryCov_9fa48("68574", "68575", "68576"), options.publicationAcknowledgementLane || new OperationLane(stryMutAct_9fa48("68577") ? {} : (stryCov_9fa48("68577"), {
        name: MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION_ACKNOWLEDGEMENT,
        workflowCoordinator: this.workflowCoordinator
      })));
      this.reconcileQueue = stryMutAct_9fa48("68580") ? options.reconcileQueue && new OwnerKeyReconcileQueue({
        name: MEMBERSHIP_PUBLICATION_OWNER_KEY,
        reconcileFn: async (_ownerKey, _reasons, context) => this.reconcileClusterMembership(context || {})
      }) : stryMutAct_9fa48("68579") ? false : stryMutAct_9fa48("68578") ? true : (stryCov_9fa48("68578", "68579", "68580"), options.reconcileQueue || new OwnerKeyReconcileQueue(stryMutAct_9fa48("68581") ? {} : (stryCov_9fa48("68581"), {
        name: MEMBERSHIP_PUBLICATION_OWNER_KEY,
        reconcileFn: stryMutAct_9fa48("68582") ? () => undefined : (stryCov_9fa48("68582"), async (_ownerKey, _reasons, context) => this.reconcileClusterMembership(stryMutAct_9fa48("68585") ? context && {} : stryMutAct_9fa48("68584") ? false : stryMutAct_9fa48("68583") ? true : (stryCov_9fa48("68583", "68584", "68585"), context || {})))
      })));
    }
  }
  buildOwnerKey(publicationKind = MEMBERSHIP_PUBLICATION_KIND) {
    if (stryMutAct_9fa48("68586")) {
      {}
    } else {
      stryCov_9fa48("68586");
      return stryMutAct_9fa48("68587") ? `` : (stryCov_9fa48("68587"), `membership-publication:${publicationKind}`);
    }
  }
  getAuthoritativeControlPlaneView() {
    if (stryMutAct_9fa48("68588")) {
      {}
    } else {
      stryCov_9fa48("68588");
      if (stryMutAct_9fa48("68590") ? false : stryMutAct_9fa48("68589") ? true : (stryCov_9fa48("68589", "68590"), this.authoritativeControlPlaneView)) {
        if (stryMutAct_9fa48("68591")) {
          {}
        } else {
          stryCov_9fa48("68591");
          return this.authoritativeControlPlaneView;
        }
      }
      this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView(stryMutAct_9fa48("68592") ? {} : (stryCov_9fa48("68592"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        now: this.now
      }));
      return this.authoritativeControlPlaneView;
    }
  }
  async readTableRows(tableName, options = {}) {
    if (stryMutAct_9fa48("68593")) {
      {}
    } else {
      stryCov_9fa48("68593");
      const preloadedRows = options.preloadedRows;
      if (stryMutAct_9fa48("68596") ? Array.isArray(preloadedRows) || preloadedRows.length > NUM.ZERO || options.allowEmptyPreloadedRows === true : stryMutAct_9fa48("68595") ? false : stryMutAct_9fa48("68594") ? true : (stryCov_9fa48("68594", "68595", "68596"), Array.isArray(preloadedRows) && (stryMutAct_9fa48("68598") ? preloadedRows.length > NUM.ZERO && options.allowEmptyPreloadedRows === true : stryMutAct_9fa48("68597") ? true : (stryCov_9fa48("68597", "68598"), (stryMutAct_9fa48("68601") ? preloadedRows.length <= NUM.ZERO : stryMutAct_9fa48("68600") ? preloadedRows.length >= NUM.ZERO : stryMutAct_9fa48("68599") ? false : (stryCov_9fa48("68599", "68600", "68601"), preloadedRows.length > NUM.ZERO)) || (stryMutAct_9fa48("68603") ? options.allowEmptyPreloadedRows !== true : stryMutAct_9fa48("68602") ? false : (stryCov_9fa48("68602", "68603"), options.allowEmptyPreloadedRows === (stryMutAct_9fa48("68604") ? false : (stryCov_9fa48("68604"), true)))))))) {
        if (stryMutAct_9fa48("68605")) {
          {}
        } else {
          stryCov_9fa48("68605");
          return preloadedRows;
        }
      }
      const preferAuthoritativeRead = stryMutAct_9fa48("68608") ? options.preferAuthoritativeRead === true && options.requireAuthoritative === true : stryMutAct_9fa48("68607") ? false : stryMutAct_9fa48("68606") ? true : (stryCov_9fa48("68606", "68607", "68608"), (stryMutAct_9fa48("68610") ? options.preferAuthoritativeRead !== true : stryMutAct_9fa48("68609") ? false : (stryCov_9fa48("68609", "68610"), options.preferAuthoritativeRead === (stryMutAct_9fa48("68611") ? false : (stryCov_9fa48("68611"), true)))) || (stryMutAct_9fa48("68613") ? options.requireAuthoritative !== true : stryMutAct_9fa48("68612") ? false : (stryCov_9fa48("68612", "68613"), options.requireAuthoritative === (stryMutAct_9fa48("68614") ? false : (stryCov_9fa48("68614"), true)))));
      if (stryMutAct_9fa48("68617") ? tableName === TABLES.CONTROL_PLANE_PUBLICATIONS && preferAuthoritativeRead !== true && this.controlPlanePublicationsOwner || typeof this.controlPlanePublicationsOwner.listPublicationsFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("68616") ? false : stryMutAct_9fa48("68615") ? true : (stryCov_9fa48("68615", "68616", "68617"), (stryMutAct_9fa48("68619") ? tableName === TABLES.CONTROL_PLANE_PUBLICATIONS && preferAuthoritativeRead !== true || this.controlPlanePublicationsOwner : stryMutAct_9fa48("68618") ? true : (stryCov_9fa48("68618", "68619"), (stryMutAct_9fa48("68621") ? tableName === TABLES.CONTROL_PLANE_PUBLICATIONS || preferAuthoritativeRead !== true : stryMutAct_9fa48("68620") ? true : (stryCov_9fa48("68620", "68621"), (stryMutAct_9fa48("68623") ? tableName !== TABLES.CONTROL_PLANE_PUBLICATIONS : stryMutAct_9fa48("68622") ? true : (stryCov_9fa48("68622", "68623"), tableName === TABLES.CONTROL_PLANE_PUBLICATIONS)) && (stryMutAct_9fa48("68625") ? preferAuthoritativeRead === true : stryMutAct_9fa48("68624") ? true : (stryCov_9fa48("68624", "68625"), preferAuthoritativeRead !== (stryMutAct_9fa48("68626") ? false : (stryCov_9fa48("68626"), true)))))) && this.controlPlanePublicationsOwner)) && (stryMutAct_9fa48("68628") ? typeof this.controlPlanePublicationsOwner.listPublicationsFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("68627") ? true : (stryCov_9fa48("68627", "68628"), typeof this.controlPlanePublicationsOwner.listPublicationsFromCache === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("68629")) {
          {}
        } else {
          stryCov_9fa48("68629");
          const cachedPublicationRows = normalizeTableRowsResult(await this.controlPlanePublicationsOwner.listPublicationsFromCache(options));
          if (stryMutAct_9fa48("68632") ? cachedPublicationRows.length > NUM.ZERO && typeof this.controlPlanePublicationsOwner.listPublications !== TYPEOF.FUNCTION : stryMutAct_9fa48("68631") ? false : stryMutAct_9fa48("68630") ? true : (stryCov_9fa48("68630", "68631", "68632"), (stryMutAct_9fa48("68635") ? cachedPublicationRows.length <= NUM.ZERO : stryMutAct_9fa48("68634") ? cachedPublicationRows.length >= NUM.ZERO : stryMutAct_9fa48("68633") ? false : (stryCov_9fa48("68633", "68634", "68635"), cachedPublicationRows.length > NUM.ZERO)) || (stryMutAct_9fa48("68637") ? typeof this.controlPlanePublicationsOwner.listPublications === TYPEOF.FUNCTION : stryMutAct_9fa48("68636") ? false : (stryCov_9fa48("68636", "68637"), typeof this.controlPlanePublicationsOwner.listPublications !== TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("68638")) {
              {}
            } else {
              stryCov_9fa48("68638");
              return cachedPublicationRows;
            }
          }
        }
      }
      if (stryMutAct_9fa48("68641") ? tableName === TABLES.CONTROL_PLANE_PUBLICATIONS && this.controlPlanePublicationsOwner || typeof this.controlPlanePublicationsOwner.listPublications === TYPEOF.FUNCTION : stryMutAct_9fa48("68640") ? false : stryMutAct_9fa48("68639") ? true : (stryCov_9fa48("68639", "68640", "68641"), (stryMutAct_9fa48("68643") ? tableName === TABLES.CONTROL_PLANE_PUBLICATIONS || this.controlPlanePublicationsOwner : stryMutAct_9fa48("68642") ? true : (stryCov_9fa48("68642", "68643"), (stryMutAct_9fa48("68645") ? tableName !== TABLES.CONTROL_PLANE_PUBLICATIONS : stryMutAct_9fa48("68644") ? true : (stryCov_9fa48("68644", "68645"), tableName === TABLES.CONTROL_PLANE_PUBLICATIONS)) && this.controlPlanePublicationsOwner)) && (stryMutAct_9fa48("68647") ? typeof this.controlPlanePublicationsOwner.listPublications !== TYPEOF.FUNCTION : stryMutAct_9fa48("68646") ? true : (stryCov_9fa48("68646", "68647"), typeof this.controlPlanePublicationsOwner.listPublications === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("68648")) {
          {}
        } else {
          stryCov_9fa48("68648");
          const publicationReadOptions = buildPublicationReadOptions(options);
          return normalizeTableRowsResult(await this.controlPlanePublicationsOwner.listPublications(publicationReadOptions));
        }
      }
      const view = this.getAuthoritativeControlPlaneView();
      if (stryMutAct_9fa48("68651") ? view && typeof view.readRows === TYPEOF.FUNCTION || view.canRead() : stryMutAct_9fa48("68650") ? false : stryMutAct_9fa48("68649") ? true : (stryCov_9fa48("68649", "68650", "68651"), (stryMutAct_9fa48("68653") ? view || typeof view.readRows === TYPEOF.FUNCTION : stryMutAct_9fa48("68652") ? true : (stryCov_9fa48("68652", "68653"), view && (stryMutAct_9fa48("68655") ? typeof view.readRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("68654") ? true : (stryCov_9fa48("68654", "68655"), typeof view.readRows === TYPEOF.FUNCTION)))) && view.canRead())) {
        if (stryMutAct_9fa48("68656")) {
          {}
        } else {
          stryCov_9fa48("68656");
          const result = await view.readRows(tableName, stryMutAct_9fa48("68657") ? `` : (stryCov_9fa48("68657"), `SELECT * FROM ${tableName}`), stryMutAct_9fa48("68658") ? ["Stryker was here"] : (stryCov_9fa48("68658"), []), options);
          return normalizeTableRowsResult(result);
        }
      }
      if (stryMutAct_9fa48("68661") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("68660") ? false : stryMutAct_9fa48("68659") ? true : (stryCov_9fa48("68659", "68660", "68661"), typeof (stryMutAct_9fa48("68662") ? this.systemTableCache.getAll : (stryCov_9fa48("68662"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("68663")) {
          {}
        } else {
          stryCov_9fa48("68663");
          return stryMutAct_9fa48("68666") ? this.systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("68665") ? false : stryMutAct_9fa48("68664") ? true : (stryCov_9fa48("68664", "68665", "68666"), this.systemTableCache.getAll(tableName) || (stryMutAct_9fa48("68667") ? ["Stryker was here"] : (stryCov_9fa48("68667"), [])));
        }
      }
      return stryMutAct_9fa48("68668") ? ["Stryker was here"] : (stryCov_9fa48("68668"), []);
    }
  }
  async getLatestPublicationRow(options = {}) {
    if (stryMutAct_9fa48("68669")) {
      {}
    } else {
      stryCov_9fa48("68669");
      const publicationRows = await this.readTableRows(TABLES.CONTROL_PLANE_PUBLICATIONS, stryMutAct_9fa48("68670") ? {} : (stryCov_9fa48("68670"), {
        ...options,
        preloadedRows: options.publicationRows
      }));
      const normalizedRows = stryMutAct_9fa48("68672") ? publicationRows.map(row => normalizeControlPlanePublicationRow(row)).sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0)) : stryMutAct_9fa48("68671") ? publicationRows.map(row => normalizeControlPlanePublicationRow(row)).filter(row => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND) : (stryCov_9fa48("68671", "68672"), publicationRows.map(stryMutAct_9fa48("68673") ? () => undefined : (stryCov_9fa48("68673"), row => normalizeControlPlanePublicationRow(row))).filter(stryMutAct_9fa48("68674") ? () => undefined : (stryCov_9fa48("68674"), row => stryMutAct_9fa48("68677") ? row.publicationKind !== MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("68676") ? false : stryMutAct_9fa48("68675") ? true : (stryCov_9fa48("68675", "68676", "68677"), row.publicationKind === MEMBERSHIP_PUBLICATION_KIND))).sort(stryMutAct_9fa48("68678") ? () => undefined : (stryCov_9fa48("68678"), (left, right) => stryMutAct_9fa48("68679") ? (right.publicationEpoch || 0) + (left.publicationEpoch || 0) : (stryCov_9fa48("68679"), (stryMutAct_9fa48("68682") ? right.publicationEpoch && 0 : stryMutAct_9fa48("68681") ? false : stryMutAct_9fa48("68680") ? true : (stryCov_9fa48("68680", "68681", "68682"), right.publicationEpoch || 0)) - (stryMutAct_9fa48("68685") ? left.publicationEpoch && 0 : stryMutAct_9fa48("68684") ? false : stryMutAct_9fa48("68683") ? true : (stryCov_9fa48("68683", "68684", "68685"), left.publicationEpoch || 0))))));
      return stryMutAct_9fa48("68688") ? normalizedRows[NUM.ZERO] && null : stryMutAct_9fa48("68687") ? false : stryMutAct_9fa48("68686") ? true : (stryCov_9fa48("68686", "68687", "68688"), normalizedRows[NUM.ZERO] || null);
    }
  }
  getLatestPublicationRowSync(options = {}) {
    if (stryMutAct_9fa48("68689")) {
      {}
    } else {
      stryCov_9fa48("68689");
      const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
      const publicationRows = stryMutAct_9fa48("68692") ? preloadedRows && (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ? this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] : []) : stryMutAct_9fa48("68691") ? false : stryMutAct_9fa48("68690") ? true : (stryCov_9fa48("68690", "68691", "68692"), preloadedRows || ((stryMutAct_9fa48("68695") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("68694") ? false : stryMutAct_9fa48("68693") ? true : (stryCov_9fa48("68693", "68694", "68695"), typeof (stryMutAct_9fa48("68696") ? this.systemTableCache.getAll : (stryCov_9fa48("68696"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("68699") ? this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) && [] : stryMutAct_9fa48("68698") ? false : stryMutAct_9fa48("68697") ? true : (stryCov_9fa48("68697", "68698", "68699"), this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || (stryMutAct_9fa48("68700") ? ["Stryker was here"] : (stryCov_9fa48("68700"), []))) : stryMutAct_9fa48("68701") ? ["Stryker was here"] : (stryCov_9fa48("68701"), [])));
      const normalizedRows = stryMutAct_9fa48("68703") ? publicationRows.map(row => normalizeControlPlanePublicationRow(row)).sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0)) : stryMutAct_9fa48("68702") ? publicationRows.map(row => normalizeControlPlanePublicationRow(row)).filter(row => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND) : (stryCov_9fa48("68702", "68703"), publicationRows.map(stryMutAct_9fa48("68704") ? () => undefined : (stryCov_9fa48("68704"), row => normalizeControlPlanePublicationRow(row))).filter(stryMutAct_9fa48("68705") ? () => undefined : (stryCov_9fa48("68705"), row => stryMutAct_9fa48("68708") ? row.publicationKind !== MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("68707") ? false : stryMutAct_9fa48("68706") ? true : (stryCov_9fa48("68706", "68707", "68708"), row.publicationKind === MEMBERSHIP_PUBLICATION_KIND))).sort(stryMutAct_9fa48("68709") ? () => undefined : (stryCov_9fa48("68709"), (left, right) => stryMutAct_9fa48("68710") ? (right.publicationEpoch || 0) + (left.publicationEpoch || 0) : (stryCov_9fa48("68710"), (stryMutAct_9fa48("68713") ? right.publicationEpoch && 0 : stryMutAct_9fa48("68712") ? false : stryMutAct_9fa48("68711") ? true : (stryCov_9fa48("68711", "68712", "68713"), right.publicationEpoch || 0)) - (stryMutAct_9fa48("68716") ? left.publicationEpoch && 0 : stryMutAct_9fa48("68715") ? false : stryMutAct_9fa48("68714") ? true : (stryCov_9fa48("68714", "68715", "68716"), left.publicationEpoch || 0))))));
      return stryMutAct_9fa48("68719") ? normalizedRows[NUM.ZERO] && null : stryMutAct_9fa48("68718") ? false : stryMutAct_9fa48("68717") ? true : (stryCov_9fa48("68717", "68718", "68719"), normalizedRows[NUM.ZERO] || null);
    }
  }
  async getLatestClusterPublication(options = {}) {
    if (stryMutAct_9fa48("68720")) {
      {}
    } else {
      stryCov_9fa48("68720");
      return this.getLatestPublicationRow(options);
    }
  }
  getLatestClusterPublicationSync(options = {}) {
    if (stryMutAct_9fa48("68721")) {
      {}
    } else {
      stryCov_9fa48("68721");
      return this.getLatestPublicationRowSync(options);
    }
  }
  async getLatestPublishedPublicationRow(options = {}) {
    if (stryMutAct_9fa48("68722")) {
      {}
    } else {
      stryCov_9fa48("68722");
      const publicationRows = await this.readTableRows(TABLES.CONTROL_PLANE_PUBLICATIONS, stryMutAct_9fa48("68723") ? {} : (stryCov_9fa48("68723"), {
        ...options,
        preloadedRows: options.publicationRows
      }));
      const normalizedRows = stryMutAct_9fa48("68725") ? publicationRows.map(row => normalizeControlPlanePublicationRow(row)).sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0)) : stryMutAct_9fa48("68724") ? publicationRows.map(row => normalizeControlPlanePublicationRow(row)).filter(row => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND && row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) : (stryCov_9fa48("68724", "68725"), publicationRows.map(stryMutAct_9fa48("68726") ? () => undefined : (stryCov_9fa48("68726"), row => normalizeControlPlanePublicationRow(row))).filter(stryMutAct_9fa48("68727") ? () => undefined : (stryCov_9fa48("68727"), row => stryMutAct_9fa48("68730") ? row.publicationKind === MEMBERSHIP_PUBLICATION_KIND || row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68729") ? false : stryMutAct_9fa48("68728") ? true : (stryCov_9fa48("68728", "68729", "68730"), (stryMutAct_9fa48("68732") ? row.publicationKind !== MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("68731") ? true : (stryCov_9fa48("68731", "68732"), row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)) && (stryMutAct_9fa48("68734") ? row.status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68733") ? true : (stryCov_9fa48("68733", "68734"), row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED))))).sort(stryMutAct_9fa48("68735") ? () => undefined : (stryCov_9fa48("68735"), (left, right) => stryMutAct_9fa48("68736") ? (right.publicationEpoch || 0) + (left.publicationEpoch || 0) : (stryCov_9fa48("68736"), (stryMutAct_9fa48("68739") ? right.publicationEpoch && 0 : stryMutAct_9fa48("68738") ? false : stryMutAct_9fa48("68737") ? true : (stryCov_9fa48("68737", "68738", "68739"), right.publicationEpoch || 0)) - (stryMutAct_9fa48("68742") ? left.publicationEpoch && 0 : stryMutAct_9fa48("68741") ? false : stryMutAct_9fa48("68740") ? true : (stryCov_9fa48("68740", "68741", "68742"), left.publicationEpoch || 0))))));
      return stryMutAct_9fa48("68745") ? normalizedRows[NUM.ZERO] && null : stryMutAct_9fa48("68744") ? false : stryMutAct_9fa48("68743") ? true : (stryCov_9fa48("68743", "68744", "68745"), normalizedRows[NUM.ZERO] || null);
    }
  }
  getLatestPublishedPublicationRowSync(options = {}) {
    if (stryMutAct_9fa48("68746")) {
      {}
    } else {
      stryCov_9fa48("68746");
      const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
      const publicationRows = stryMutAct_9fa48("68749") ? preloadedRows && (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ? this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] : []) : stryMutAct_9fa48("68748") ? false : stryMutAct_9fa48("68747") ? true : (stryCov_9fa48("68747", "68748", "68749"), preloadedRows || ((stryMutAct_9fa48("68752") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("68751") ? false : stryMutAct_9fa48("68750") ? true : (stryCov_9fa48("68750", "68751", "68752"), typeof (stryMutAct_9fa48("68753") ? this.systemTableCache.getAll : (stryCov_9fa48("68753"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("68756") ? this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) && [] : stryMutAct_9fa48("68755") ? false : stryMutAct_9fa48("68754") ? true : (stryCov_9fa48("68754", "68755", "68756"), this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || (stryMutAct_9fa48("68757") ? ["Stryker was here"] : (stryCov_9fa48("68757"), []))) : stryMutAct_9fa48("68758") ? ["Stryker was here"] : (stryCov_9fa48("68758"), [])));
      const normalizedRows = stryMutAct_9fa48("68760") ? publicationRows.map(row => normalizeControlPlanePublicationRow(row)).sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0)) : stryMutAct_9fa48("68759") ? publicationRows.map(row => normalizeControlPlanePublicationRow(row)).filter(row => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND && row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) : (stryCov_9fa48("68759", "68760"), publicationRows.map(stryMutAct_9fa48("68761") ? () => undefined : (stryCov_9fa48("68761"), row => normalizeControlPlanePublicationRow(row))).filter(stryMutAct_9fa48("68762") ? () => undefined : (stryCov_9fa48("68762"), row => stryMutAct_9fa48("68765") ? row.publicationKind === MEMBERSHIP_PUBLICATION_KIND || row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68764") ? false : stryMutAct_9fa48("68763") ? true : (stryCov_9fa48("68763", "68764", "68765"), (stryMutAct_9fa48("68767") ? row.publicationKind !== MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("68766") ? true : (stryCov_9fa48("68766", "68767"), row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)) && (stryMutAct_9fa48("68769") ? row.status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68768") ? true : (stryCov_9fa48("68768", "68769"), row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED))))).sort(stryMutAct_9fa48("68770") ? () => undefined : (stryCov_9fa48("68770"), (left, right) => stryMutAct_9fa48("68771") ? (right.publicationEpoch || 0) + (left.publicationEpoch || 0) : (stryCov_9fa48("68771"), (stryMutAct_9fa48("68774") ? right.publicationEpoch && 0 : stryMutAct_9fa48("68773") ? false : stryMutAct_9fa48("68772") ? true : (stryCov_9fa48("68772", "68773", "68774"), right.publicationEpoch || 0)) - (stryMutAct_9fa48("68777") ? left.publicationEpoch && 0 : stryMutAct_9fa48("68776") ? false : stryMutAct_9fa48("68775") ? true : (stryCov_9fa48("68775", "68776", "68777"), left.publicationEpoch || 0))))));
      return stryMutAct_9fa48("68780") ? normalizedRows[NUM.ZERO] && null : stryMutAct_9fa48("68779") ? false : stryMutAct_9fa48("68778") ? true : (stryCov_9fa48("68778", "68779", "68780"), normalizedRows[NUM.ZERO] || null);
    }
  }
  async getLatestPublishedClusterPublication(options = {}) {
    if (stryMutAct_9fa48("68781")) {
      {}
    } else {
      stryCov_9fa48("68781");
      return this.getLatestPublishedPublicationRow(options);
    }
  }
  getLatestPublishedClusterPublicationSync(options = {}) {
    if (stryMutAct_9fa48("68782")) {
      {}
    } else {
      stryCov_9fa48("68782");
      return this.getLatestPublishedPublicationRowSync(options);
    }
  }
  async getLatestPublicationForNode(nodeId, options = {}) {
    if (stryMutAct_9fa48("68783")) {
      {}
    } else {
      stryCov_9fa48("68783");
      const latestPublicationRow = await this.getLatestPublicationRow(options);
      return publicationRowIncludesNode(latestPublicationRow, nodeId) ? latestPublicationRow : null;
    }
  }
  getLatestPublicationForNodeSync(nodeId, options = {}) {
    if (stryMutAct_9fa48("68784")) {
      {}
    } else {
      stryCov_9fa48("68784");
      const latestPublicationRow = this.getLatestPublicationRowSync(options);
      return publicationRowIncludesNode(latestPublicationRow, nodeId) ? latestPublicationRow : null;
    }
  }

  /**
   * Resolve the publication row that should answer one node acknowledgement.
   * Freshness, target-node inclusion, and bounded authoritative refresh remain
   * publication-owner concerns rather than dispatch concerns.
   *
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Promise<Object|null>}
   */
  async getAcknowledgementCandidateForNode(nodeId, options = {}) {
    if (stryMutAct_9fa48("68785")) {
      {}
    } else {
      stryCov_9fa48("68785");
      const normalizedNodeId = stryMutAct_9fa48("68786") ? String(nodeId || '') : (stryCov_9fa48("68786"), String(stryMutAct_9fa48("68789") ? nodeId && '' : stryMutAct_9fa48("68788") ? false : stryMutAct_9fa48("68787") ? true : (stryCov_9fa48("68787", "68788", "68789"), nodeId || (stryMutAct_9fa48("68790") ? "Stryker was here!" : (stryCov_9fa48("68790"), '')))).trim());
      if (stryMutAct_9fa48("68793") ? false : stryMutAct_9fa48("68792") ? true : stryMutAct_9fa48("68791") ? normalizedNodeId : (stryCov_9fa48("68791", "68792", "68793"), !normalizedNodeId)) {
        if (stryMutAct_9fa48("68794")) {
          {}
        } else {
          stryCov_9fa48("68794");
          return null;
        }
      }
      const initialPublicationRow = stryMutAct_9fa48("68797") ? this.getLatestPublicationRowSync({
        ...options,
        preferAuthoritativeRead: false
      }) && (await safelyGetLatestMembershipPublicationRow(this, {
        ...options,
        preferAuthoritativeRead: false
      })) : stryMutAct_9fa48("68796") ? false : stryMutAct_9fa48("68795") ? true : (stryCov_9fa48("68795", "68796", "68797"), this.getLatestPublicationRowSync(stryMutAct_9fa48("68798") ? {} : (stryCov_9fa48("68798"), {
        ...options,
        preferAuthoritativeRead: stryMutAct_9fa48("68799") ? true : (stryCov_9fa48("68799"), false)
      })) || (await safelyGetLatestMembershipPublicationRow(this, stryMutAct_9fa48("68800") ? {} : (stryCov_9fa48("68800"), {
        ...options,
        preferAuthoritativeRead: stryMutAct_9fa48("68801") ? true : (stryCov_9fa48("68801"), false)
      }))));
      if (stryMutAct_9fa48("68804") ? !initialPublicationRow && typeof initialPublicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("68803") ? false : stryMutAct_9fa48("68802") ? true : (stryCov_9fa48("68802", "68803", "68804"), (stryMutAct_9fa48("68805") ? initialPublicationRow : (stryCov_9fa48("68805"), !initialPublicationRow)) || (stryMutAct_9fa48("68807") ? typeof initialPublicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("68806") ? false : (stryCov_9fa48("68806", "68807"), typeof initialPublicationRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("68808")) {
          {}
        } else {
          stryCov_9fa48("68808");
          return null;
        }
      }
      const initialPublication = normalizeControlPlanePublicationRow(initialPublicationRow);
      const initialRequiredAckNodeIds = normalizeNodeIdList(initialPublication.requiredAckNodeIds);
      const authoritativeRefreshAttempted = stryMutAct_9fa48("68811") ? !this.isTerminalPublicationStatus(initialPublication.status) || !initialRequiredAckNodeIds.includes(normalizedNodeId) : stryMutAct_9fa48("68810") ? false : stryMutAct_9fa48("68809") ? true : (stryCov_9fa48("68809", "68810", "68811"), (stryMutAct_9fa48("68812") ? this.isTerminalPublicationStatus(initialPublication.status) : (stryCov_9fa48("68812"), !this.isTerminalPublicationStatus(initialPublication.status))) && (stryMutAct_9fa48("68813") ? initialRequiredAckNodeIds.includes(normalizedNodeId) : (stryCov_9fa48("68813"), !initialRequiredAckNodeIds.includes(normalizedNodeId))));
      const refreshedPublicationRow = authoritativeRefreshAttempted ? await safelyGetLatestMembershipPublicationRow(this, stryMutAct_9fa48("68814") ? {} : (stryCov_9fa48("68814"), {
        ...options,
        preferAuthoritativeRead: stryMutAct_9fa48("68815") ? false : (stryCov_9fa48("68815"), true)
      })) : null;
      const candidatePublicationRow = (stryMutAct_9fa48("68818") ? refreshedPublicationRow || typeof refreshedPublicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("68817") ? false : stryMutAct_9fa48("68816") ? true : (stryCov_9fa48("68816", "68817", "68818"), refreshedPublicationRow && (stryMutAct_9fa48("68820") ? typeof refreshedPublicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("68819") ? true : (stryCov_9fa48("68819", "68820"), typeof refreshedPublicationRow === TYPEOF.OBJECT)))) ? refreshedPublicationRow : initialPublicationRow;
      const normalizedPublication = normalizeControlPlanePublicationRow(candidatePublicationRow);
      const requiredAckNodeIds = normalizeNodeIdList(normalizedPublication.requiredAckNodeIds);
      const acknowledgedNodeIds = normalizeNodeIdList(normalizedPublication.acknowledgedNodeIds);
      return Object.freeze(stryMutAct_9fa48("68821") ? {} : (stryCov_9fa48("68821"), {
        nodeId: normalizedNodeId,
        publicationRow: candidatePublicationRow,
        authoritativeRefreshAttempted,
        terminal: this.isTerminalPublicationStatus(normalizedPublication.status),
        requiresAcknowledgement: requiredAckNodeIds.includes(normalizedNodeId),
        alreadyAcknowledged: acknowledgedNodeIds.includes(normalizedNodeId)
      }));
    }
  }

  /**
   * Resolve dispatch-retry rows for one target node from the publication-owner
   * path. Cache-first visibility and priority-recovery authoritative
   * rediscovery stay behind this owner surface.
   *
   * @param {string} nodeId
   * @return {Promise<Object[]>}
   */
  isLocallyOwnedReplicaOperationRow(operation) {
    if (stryMutAct_9fa48("68822")) {
      {}
    } else {
      stryCov_9fa48("68822");
      const normalizedOperation = normalizeReplicaOperationView(operation);
      if (stryMutAct_9fa48("68825") ? false : stryMutAct_9fa48("68824") ? true : stryMutAct_9fa48("68823") ? normalizedOperation : (stryCov_9fa48("68823", "68824", "68825"), !normalizedOperation)) {
        if (stryMutAct_9fa48("68826")) {
          {}
        } else {
          stryCov_9fa48("68826");
          return stryMutAct_9fa48("68827") ? true : (stryCov_9fa48("68827"), false);
        }
      }
      if (stryMutAct_9fa48("68830") ? this.replicaOperationRepository || typeof this.replicaOperationRepository.isOperationLocallyOwned === TYPEOF.FUNCTION : stryMutAct_9fa48("68829") ? false : stryMutAct_9fa48("68828") ? true : (stryCov_9fa48("68828", "68829", "68830"), this.replicaOperationRepository && (stryMutAct_9fa48("68832") ? typeof this.replicaOperationRepository.isOperationLocallyOwned !== TYPEOF.FUNCTION : stryMutAct_9fa48("68831") ? true : (stryCov_9fa48("68831", "68832"), typeof this.replicaOperationRepository.isOperationLocallyOwned === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("68833")) {
          {}
        } else {
          stryCov_9fa48("68833");
          return this.replicaOperationRepository.isOperationLocallyOwned(normalizedOperation);
        }
      }
      return stryMutAct_9fa48("68836") ? normalizedOperation.sourceNodeId !== this.nodeId : stryMutAct_9fa48("68835") ? false : stryMutAct_9fa48("68834") ? true : (stryCov_9fa48("68834", "68835", "68836"), normalizedOperation.sourceNodeId === this.nodeId);
    }
  }

  /**
   * Resolve dispatch-retry rows for one target node from the publication-owner
   * path. Cache-first visibility and priority-recovery authoritative
   * rediscovery stay behind this owner surface.
   *
   * @param {string} nodeId
   * @return {Promise<Object[]>}
   */
  async getDispatchRetryRowsForNode(nodeId) {
    if (stryMutAct_9fa48("68837")) {
      {}
    } else {
      stryCov_9fa48("68837");
      const normalizedNodeId = stryMutAct_9fa48("68838") ? String(nodeId || '') : (stryCov_9fa48("68838"), String(stryMutAct_9fa48("68841") ? nodeId && '' : stryMutAct_9fa48("68840") ? false : stryMutAct_9fa48("68839") ? true : (stryCov_9fa48("68839", "68840", "68841"), nodeId || (stryMutAct_9fa48("68842") ? "Stryker was here!" : (stryCov_9fa48("68842"), '')))).trim());
      if (stryMutAct_9fa48("68845") ? false : stryMutAct_9fa48("68844") ? true : stryMutAct_9fa48("68843") ? normalizedNodeId : (stryCov_9fa48("68843", "68844", "68845"), !normalizedNodeId)) {
        if (stryMutAct_9fa48("68846")) {
          {}
        } else {
          stryCov_9fa48("68846");
          return stryMutAct_9fa48("68847") ? ["Stryker was here"] : (stryCov_9fa48("68847"), []);
        }
      }
      const cacheRows = (stryMutAct_9fa48("68850") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("68849") ? false : stryMutAct_9fa48("68848") ? true : (stryCov_9fa48("68848", "68849", "68850"), typeof (stryMutAct_9fa48("68851") ? this.systemTableCache.getAll : (stryCov_9fa48("68851"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("68854") ? this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) && [] : stryMutAct_9fa48("68853") ? false : stryMutAct_9fa48("68852") ? true : (stryCov_9fa48("68852", "68853", "68854"), this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || (stryMutAct_9fa48("68855") ? ["Stryker was here"] : (stryCov_9fa48("68855"), []))) : stryMutAct_9fa48("68856") ? ["Stryker was here"] : (stryCov_9fa48("68856"), []);
      const dispatchRows = stryMutAct_9fa48("68857") ? cacheRows : (stryCov_9fa48("68857"), cacheRows.filter(row => {
        if (stryMutAct_9fa48("68858")) {
          {}
        } else {
          stryCov_9fa48("68858");
          const operation = normalizeReplicaOperationView(row);
          return stryMutAct_9fa48("68861") ? operation && isCoordinatorOwnedOperationType(operation.type) && this.isLocallyOwnedReplicaOperationRow(operation) && operation.targetNodeId === normalizedNodeId || operation.workflowStep === WORKFLOW_STEP.PENDING || operation.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("68860") ? false : stryMutAct_9fa48("68859") ? true : (stryCov_9fa48("68859", "68860", "68861"), (stryMutAct_9fa48("68863") ? operation && isCoordinatorOwnedOperationType(operation.type) && this.isLocallyOwnedReplicaOperationRow(operation) || operation.targetNodeId === normalizedNodeId : stryMutAct_9fa48("68862") ? true : (stryCov_9fa48("68862", "68863"), (stryMutAct_9fa48("68865") ? operation && isCoordinatorOwnedOperationType(operation.type) || this.isLocallyOwnedReplicaOperationRow(operation) : stryMutAct_9fa48("68864") ? true : (stryCov_9fa48("68864", "68865"), (stryMutAct_9fa48("68867") ? operation || isCoordinatorOwnedOperationType(operation.type) : stryMutAct_9fa48("68866") ? true : (stryCov_9fa48("68866", "68867"), operation && isCoordinatorOwnedOperationType(operation.type))) && this.isLocallyOwnedReplicaOperationRow(operation))) && (stryMutAct_9fa48("68869") ? operation.targetNodeId !== normalizedNodeId : stryMutAct_9fa48("68868") ? true : (stryCov_9fa48("68868", "68869"), operation.targetNodeId === normalizedNodeId)))) && (stryMutAct_9fa48("68871") ? operation.workflowStep === WORKFLOW_STEP.PENDING && operation.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("68870") ? true : (stryCov_9fa48("68870", "68871"), (stryMutAct_9fa48("68873") ? operation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("68872") ? false : (stryCov_9fa48("68872", "68873"), operation.workflowStep === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("68875") ? operation.workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("68874") ? false : (stryCov_9fa48("68874", "68875"), operation.workflowStep === WORKFLOW_STEP.SENDING)))));
        }
      }));
      if (stryMutAct_9fa48("68879") ? dispatchRows.length <= NUM.ZERO : stryMutAct_9fa48("68878") ? dispatchRows.length >= NUM.ZERO : stryMutAct_9fa48("68877") ? false : stryMutAct_9fa48("68876") ? true : (stryCov_9fa48("68876", "68877", "68878", "68879"), dispatchRows.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("68880")) {
          {}
        } else {
          stryCov_9fa48("68880");
          return dispatchRows;
        }
      }
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("68883") ? !readinessService && typeof readinessService !== TYPEOF.OBJECT : stryMutAct_9fa48("68882") ? false : stryMutAct_9fa48("68881") ? true : (stryCov_9fa48("68881", "68882", "68883"), (stryMutAct_9fa48("68884") ? readinessService : (stryCov_9fa48("68884"), !readinessService)) || (stryMutAct_9fa48("68886") ? typeof readinessService === TYPEOF.OBJECT : stryMutAct_9fa48("68885") ? false : (stryCov_9fa48("68885", "68886"), typeof readinessService !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("68887")) {
          {}
        } else {
          stryCov_9fa48("68887");
          return dispatchRows;
        }
      }
      let publicationConvergence = null;
      try {
        if (stryMutAct_9fa48("68888")) {
          {}
        } else {
          stryCov_9fa48("68888");
          publicationConvergence = await readMembershipPublicationConvergence(readinessService, normalizedNodeId, this.now());
        }
      } catch (_error) {
        if (stryMutAct_9fa48("68889")) {
          {}
        } else {
          stryCov_9fa48("68889");
          publicationConvergence = null;
        }
      }
      if (stryMutAct_9fa48("68892") ? false : stryMutAct_9fa48("68891") ? true : stryMutAct_9fa48("68890") ? shouldUseAuthoritativePriorityRecoveryRediscovery(normalizedNodeId, {
        cacheVisible: false,
        publicationConvergence
      }) : (stryCov_9fa48("68890", "68891", "68892"), !shouldUseAuthoritativePriorityRecoveryRediscovery(normalizedNodeId, stryMutAct_9fa48("68893") ? {} : (stryCov_9fa48("68893"), {
        cacheVisible: stryMutAct_9fa48("68894") ? true : (stryCov_9fa48("68894"), false),
        publicationConvergence
      })))) {
        if (stryMutAct_9fa48("68895")) {
          {}
        } else {
          stryCov_9fa48("68895");
          return dispatchRows;
        }
      }
      const repository = this.replicaOperationRepository;
      if (stryMutAct_9fa48("68898") ? !repository && typeof repository.queryIncompleteOperations !== TYPEOF.FUNCTION : stryMutAct_9fa48("68897") ? false : stryMutAct_9fa48("68896") ? true : (stryCov_9fa48("68896", "68897", "68898"), (stryMutAct_9fa48("68899") ? repository : (stryCov_9fa48("68899"), !repository)) || (stryMutAct_9fa48("68901") ? typeof repository.queryIncompleteOperations === TYPEOF.FUNCTION : stryMutAct_9fa48("68900") ? false : (stryCov_9fa48("68900", "68901"), typeof repository.queryIncompleteOperations !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("68902")) {
          {}
        } else {
          stryCov_9fa48("68902");
          return stryMutAct_9fa48("68903") ? ["Stryker was here"] : (stryCov_9fa48("68903"), []);
        }
      }
      try {
        if (stryMutAct_9fa48("68904")) {
          {}
        } else {
          stryCov_9fa48("68904");
          const operations = await repository.queryIncompleteOperations(stryMutAct_9fa48("68905") ? {} : (stryCov_9fa48("68905"), {
            preferAuthoritativeRead: stryMutAct_9fa48("68906") ? false : (stryCov_9fa48("68906"), true)
          }));
          if (stryMutAct_9fa48("68909") ? !Array.isArray(operations) && operations.length === NUM.ZERO : stryMutAct_9fa48("68908") ? false : stryMutAct_9fa48("68907") ? true : (stryCov_9fa48("68907", "68908", "68909"), (stryMutAct_9fa48("68910") ? Array.isArray(operations) : (stryCov_9fa48("68910"), !Array.isArray(operations))) || (stryMutAct_9fa48("68912") ? operations.length !== NUM.ZERO : stryMutAct_9fa48("68911") ? false : (stryCov_9fa48("68911", "68912"), operations.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("68913")) {
              {}
            } else {
              stryCov_9fa48("68913");
              return stryMutAct_9fa48("68914") ? ["Stryker was here"] : (stryCov_9fa48("68914"), []);
            }
          }
          return stryMutAct_9fa48("68915") ? operations.map(operation => this.buildDispatchRetryRowFromOperation(operation)) : (stryCov_9fa48("68915"), operations.filter(operation => {
            if (stryMutAct_9fa48("68916")) {
              {}
            } else {
              stryCov_9fa48("68916");
              const normalizedOperation = normalizeReplicaOperationView(operation);
              return stryMutAct_9fa48("68919") ? normalizedOperation && isCoordinatorOwnedOperationType(normalizedOperation.type) && this.isLocallyOwnedReplicaOperationRow(normalizedOperation) && normalizedOperation.targetNodeId === normalizedNodeId || normalizedOperation.workflowStep === WORKFLOW_STEP.PENDING || normalizedOperation.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("68918") ? false : stryMutAct_9fa48("68917") ? true : (stryCov_9fa48("68917", "68918", "68919"), (stryMutAct_9fa48("68921") ? normalizedOperation && isCoordinatorOwnedOperationType(normalizedOperation.type) && this.isLocallyOwnedReplicaOperationRow(normalizedOperation) || normalizedOperation.targetNodeId === normalizedNodeId : stryMutAct_9fa48("68920") ? true : (stryCov_9fa48("68920", "68921"), (stryMutAct_9fa48("68923") ? normalizedOperation && isCoordinatorOwnedOperationType(normalizedOperation.type) || this.isLocallyOwnedReplicaOperationRow(normalizedOperation) : stryMutAct_9fa48("68922") ? true : (stryCov_9fa48("68922", "68923"), (stryMutAct_9fa48("68925") ? normalizedOperation || isCoordinatorOwnedOperationType(normalizedOperation.type) : stryMutAct_9fa48("68924") ? true : (stryCov_9fa48("68924", "68925"), normalizedOperation && isCoordinatorOwnedOperationType(normalizedOperation.type))) && this.isLocallyOwnedReplicaOperationRow(normalizedOperation))) && (stryMutAct_9fa48("68927") ? normalizedOperation.targetNodeId !== normalizedNodeId : stryMutAct_9fa48("68926") ? true : (stryCov_9fa48("68926", "68927"), normalizedOperation.targetNodeId === normalizedNodeId)))) && (stryMutAct_9fa48("68929") ? normalizedOperation.workflowStep === WORKFLOW_STEP.PENDING && normalizedOperation.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("68928") ? true : (stryCov_9fa48("68928", "68929"), (stryMutAct_9fa48("68931") ? normalizedOperation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("68930") ? false : (stryCov_9fa48("68930", "68931"), normalizedOperation.workflowStep === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("68933") ? normalizedOperation.workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("68932") ? false : (stryCov_9fa48("68932", "68933"), normalizedOperation.workflowStep === WORKFLOW_STEP.SENDING)))));
            }
          }).map(stryMutAct_9fa48("68934") ? () => undefined : (stryCov_9fa48("68934"), operation => this.buildDispatchRetryRowFromOperation(operation))));
        }
      } catch (_error) {
        if (stryMutAct_9fa48("68935")) {
          {}
        } else {
          stryCov_9fa48("68935");
          return stryMutAct_9fa48("68936") ? ["Stryker was here"] : (stryCov_9fa48("68936"), []);
        }
      }
    }
  }

  /**
   * Convert one operation view back into replica_operations row shape for
   * dispatch queue re-entry.
   * @param {Object} operation
   * @return {Object|null}
   * @private
   */
  buildDispatchRetryRowFromOperation(operation) {
    if (stryMutAct_9fa48("68937")) {
      {}
    } else {
      stryCov_9fa48("68937");
      const normalizedOperation = normalizeReplicaOperationView(operation);
      if (stryMutAct_9fa48("68940") ? false : stryMutAct_9fa48("68939") ? true : stryMutAct_9fa48("68938") ? normalizedOperation : (stryCov_9fa48("68938", "68939", "68940"), !normalizedOperation)) {
        if (stryMutAct_9fa48("68941")) {
          {}
        } else {
          stryCov_9fa48("68941");
          return null;
        }
      }
      return stryMutAct_9fa48("68942") ? {} : (stryCov_9fa48("68942"), {
        operation_id: normalizedOperation.operationId,
        type: normalizedOperation.type,
        partition_id: normalizedOperation.partitionId,
        replica_id: normalizedOperation.replicaId,
        source_node_id: normalizedOperation.sourceNodeId,
        target_node_id: normalizedOperation.targetNodeId,
        status: normalizedOperation.status,
        workflow_step: normalizedOperation.workflowStep,
        created_at: normalizedOperation.createdAt,
        updated_at: normalizedOperation.updatedAt,
        completed_at: normalizedOperation.completedAt,
        error_message: normalizedOperation.errorMessage,
        steps_history: JSON.stringify(normalizedOperation.stepsHistory),
        entity_type: normalizedOperation.entityType,
        entity_id: normalizedOperation.entityId
      });
    }
  }
  isTerminalPublicationStatus(publicationStatus) {
    if (stryMutAct_9fa48("68943")) {
      {}
    } else {
      stryCov_9fa48("68943");
      const normalizedPublicationStatus = (stryMutAct_9fa48("68946") ? typeof publicationStatus !== TYPEOF.STRING : stryMutAct_9fa48("68945") ? false : stryMutAct_9fa48("68944") ? true : (stryCov_9fa48("68944", "68945", "68946"), typeof publicationStatus === TYPEOF.STRING)) ? stryMutAct_9fa48("68947") ? publicationStatus.toLowerCase() : (stryCov_9fa48("68947"), publicationStatus.toUpperCase()) : null;
      return stryMutAct_9fa48("68950") ? (normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED || normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED) && normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("68949") ? false : stryMutAct_9fa48("68948") ? true : (stryCov_9fa48("68948", "68949", "68950"), (stryMutAct_9fa48("68952") ? normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED && normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("68951") ? false : (stryCov_9fa48("68951", "68952"), (stryMutAct_9fa48("68954") ? normalizedPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("68953") ? false : (stryCov_9fa48("68953", "68954"), normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) || (stryMutAct_9fa48("68956") ? normalizedPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("68955") ? false : (stryCov_9fa48("68955", "68956"), normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED)))) || (stryMutAct_9fa48("68958") ? normalizedPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("68957") ? false : (stryCov_9fa48("68957", "68958"), normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED)));
    }
  }
  async acknowledgeMembershipPublicationForNode(nodeId, options = {}) {
    if (stryMutAct_9fa48("68959")) {
      {}
    } else {
      stryCov_9fa48("68959");
      const normalizedNodeId = stryMutAct_9fa48("68960") ? String(nodeId || '') : (stryCov_9fa48("68960"), String(stryMutAct_9fa48("68963") ? nodeId && '' : stryMutAct_9fa48("68962") ? false : stryMutAct_9fa48("68961") ? true : (stryCov_9fa48("68961", "68962", "68963"), nodeId || (stryMutAct_9fa48("68964") ? "Stryker was here!" : (stryCov_9fa48("68964"), '')))).trim());
      if (stryMutAct_9fa48("68967") ? false : stryMutAct_9fa48("68966") ? true : stryMutAct_9fa48("68965") ? normalizedNodeId : (stryCov_9fa48("68965", "68966", "68967"), !normalizedNodeId)) {
        if (stryMutAct_9fa48("68968")) {
          {}
        } else {
          stryCov_9fa48("68968");
          return null;
        }
      }
      const acknowledgementCandidate = await this.getAcknowledgementCandidateForNode(normalizedNodeId, options);
      if (stryMutAct_9fa48("68971") ? !acknowledgementCandidate && typeof acknowledgementCandidate !== TYPEOF.OBJECT : stryMutAct_9fa48("68970") ? false : stryMutAct_9fa48("68969") ? true : (stryCov_9fa48("68969", "68970", "68971"), (stryMutAct_9fa48("68972") ? acknowledgementCandidate : (stryCov_9fa48("68972"), !acknowledgementCandidate)) || (stryMutAct_9fa48("68974") ? typeof acknowledgementCandidate === TYPEOF.OBJECT : stryMutAct_9fa48("68973") ? false : (stryCov_9fa48("68973", "68974"), typeof acknowledgementCandidate !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("68975")) {
          {}
        } else {
          stryCov_9fa48("68975");
          return null;
        }
      }
      const candidatePublicationRow = acknowledgementCandidate.publicationRow;
      if (stryMutAct_9fa48("68978") ? !candidatePublicationRow && typeof candidatePublicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("68977") ? false : stryMutAct_9fa48("68976") ? true : (stryCov_9fa48("68976", "68977", "68978"), (stryMutAct_9fa48("68979") ? candidatePublicationRow : (stryCov_9fa48("68979"), !candidatePublicationRow)) || (stryMutAct_9fa48("68981") ? typeof candidatePublicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("68980") ? false : (stryCov_9fa48("68980", "68981"), typeof candidatePublicationRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("68982")) {
          {}
        } else {
          stryCov_9fa48("68982");
          return null;
        }
      }
      if (stryMutAct_9fa48("68985") ? (acknowledgementCandidate.terminal === true || acknowledgementCandidate.requiresAcknowledgement !== true) && acknowledgementCandidate.alreadyAcknowledged === true : stryMutAct_9fa48("68984") ? false : stryMutAct_9fa48("68983") ? true : (stryCov_9fa48("68983", "68984", "68985"), (stryMutAct_9fa48("68987") ? acknowledgementCandidate.terminal === true && acknowledgementCandidate.requiresAcknowledgement !== true : stryMutAct_9fa48("68986") ? false : (stryCov_9fa48("68986", "68987"), (stryMutAct_9fa48("68989") ? acknowledgementCandidate.terminal !== true : stryMutAct_9fa48("68988") ? false : (stryCov_9fa48("68988", "68989"), acknowledgementCandidate.terminal === (stryMutAct_9fa48("68990") ? false : (stryCov_9fa48("68990"), true)))) || (stryMutAct_9fa48("68992") ? acknowledgementCandidate.requiresAcknowledgement === true : stryMutAct_9fa48("68991") ? false : (stryCov_9fa48("68991", "68992"), acknowledgementCandidate.requiresAcknowledgement !== (stryMutAct_9fa48("68993") ? false : (stryCov_9fa48("68993"), true)))))) || (stryMutAct_9fa48("68995") ? acknowledgementCandidate.alreadyAcknowledged !== true : stryMutAct_9fa48("68994") ? false : (stryCov_9fa48("68994", "68995"), acknowledgementCandidate.alreadyAcknowledged === (stryMutAct_9fa48("68996") ? false : (stryCov_9fa48("68996"), true)))))) {
        if (stryMutAct_9fa48("68997")) {
          {}
        } else {
          stryCov_9fa48("68997");
          return serializeMembershipPublicationRow(candidatePublicationRow);
        }
      }
      return this.acknowledgePublication(stryMutAct_9fa48("69000") ? candidatePublicationRow.publication_id && candidatePublicationRow.publicationId : stryMutAct_9fa48("68999") ? false : stryMutAct_9fa48("68998") ? true : (stryCov_9fa48("68998", "68999", "69000"), candidatePublicationRow.publication_id || candidatePublicationRow.publicationId), normalizedNodeId, stryMutAct_9fa48("69001") ? {} : (stryCov_9fa48("69001"), {
        ...options,
        publicationRow: candidatePublicationRow,
        publicationWriteMaxAttempts: NUM.ONE,
        skipPublicationWriteReadback: stryMutAct_9fa48("69002") ? false : (stryCov_9fa48("69002"), true)
      }));
    }
  }
  async deriveClusterMembershipCandidate(options = {}) {
    if (stryMutAct_9fa48("69003")) {
      {}
    } else {
      stryCov_9fa48("69003");
      const planningSnapshot = (stryMutAct_9fa48("69006") ? options.planningSnapshot || typeof options.planningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("69005") ? false : stryMutAct_9fa48("69004") ? true : (stryCov_9fa48("69004", "69005", "69006"), options.planningSnapshot && (stryMutAct_9fa48("69008") ? typeof options.planningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("69007") ? true : (stryCov_9fa48("69007", "69008"), typeof options.planningSnapshot === TYPEOF.OBJECT)))) ? options.planningSnapshot : await this.readPublicationPlanningSnapshot(options);
      return deriveMembershipPublicationCandidate(stryMutAct_9fa48("69009") ? {} : (stryCov_9fa48("69009"), {
        ...options,
        planningSnapshot
      }));
    }
  }
  deriveClusterMembershipCandidateSync(options = {}) {
    if (stryMutAct_9fa48("69010")) {
      {}
    } else {
      stryCov_9fa48("69010");
      const planningSnapshot = (stryMutAct_9fa48("69013") ? options.planningSnapshot || typeof options.planningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("69012") ? false : stryMutAct_9fa48("69011") ? true : (stryCov_9fa48("69011", "69012", "69013"), options.planningSnapshot && (stryMutAct_9fa48("69015") ? typeof options.planningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("69014") ? true : (stryCov_9fa48("69014", "69015"), typeof options.planningSnapshot === TYPEOF.OBJECT)))) ? options.planningSnapshot : this.readPublicationPlanningSnapshotSync(options);
      return deriveMembershipPublicationCandidate(stryMutAct_9fa48("69016") ? {} : (stryCov_9fa48("69016"), {
        ...options,
        planningSnapshot
      }));
    }
  }
  async readPublicationPlanningSnapshot(options = {}) {
    if (stryMutAct_9fa48("69017")) {
      {}
    } else {
      stryCov_9fa48("69017");
      const planningReadOptions = stryMutAct_9fa48("69018") ? {} : (stryCov_9fa48("69018"), {
        ...options,
        readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING
      });
      const latestPublicationRow = stryMutAct_9fa48("69021") ? options.latestPublicationRow && (await this.getLatestPublicationRow(planningReadOptions)) : stryMutAct_9fa48("69020") ? false : stryMutAct_9fa48("69019") ? true : (stryCov_9fa48("69019", "69020", "69021"), options.latestPublicationRow || (await this.getLatestPublicationRow(planningReadOptions)));
      const latestPublishedPublicationRow = stryMutAct_9fa48("69024") ? options.latestPublishedPublicationRow && (String(latestPublicationRow?.status || '').toUpperCase() === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ? latestPublicationRow : await this.getLatestPublishedPublicationRow(planningReadOptions)) : stryMutAct_9fa48("69023") ? false : stryMutAct_9fa48("69022") ? true : (stryCov_9fa48("69022", "69023", "69024"), options.latestPublishedPublicationRow || ((stryMutAct_9fa48("69027") ? String(latestPublicationRow?.status || '').toUpperCase() !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("69026") ? false : stryMutAct_9fa48("69025") ? true : (stryCov_9fa48("69025", "69026", "69027"), (stryMutAct_9fa48("69028") ? String(latestPublicationRow?.status || '').toLowerCase() : (stryCov_9fa48("69028"), String(stryMutAct_9fa48("69031") ? latestPublicationRow?.status && '' : stryMutAct_9fa48("69030") ? false : stryMutAct_9fa48("69029") ? true : (stryCov_9fa48("69029", "69030", "69031"), (stryMutAct_9fa48("69032") ? latestPublicationRow.status : (stryCov_9fa48("69032"), latestPublicationRow?.status)) || (stryMutAct_9fa48("69033") ? "Stryker was here!" : (stryCov_9fa48("69033"), '')))).toUpperCase())) === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) ? latestPublicationRow : await this.getLatestPublishedPublicationRow(planningReadOptions)));
      const preferAuthoritativeMembershipState = shouldPreferAuthoritativeMembershipState(stryMutAct_9fa48("69034") ? {} : (stryCov_9fa48("69034"), {
        ...options,
        latestPublicationRow,
        latestPublishedPublicationRow
      }));
      const nodeRows = await this.readTableRows(TABLES.NODES, stryMutAct_9fa48("69035") ? {} : (stryCov_9fa48("69035"), {
        ...planningReadOptions,
        preferAuthoritativeRead: preferAuthoritativeMembershipState,
        preloadedRows: options.nodeRows
      }));
      const nodeEndpointRows = await this.readTableRows(TABLES.NODE_ENDPOINTS, stryMutAct_9fa48("69036") ? {} : (stryCov_9fa48("69036"), {
        ...planningReadOptions,
        preferAuthoritativeRead: preferAuthoritativeMembershipState,
        preloadedRows: options.nodeEndpointRows
      }));
      const serviceRows = await this.readTableRows(TABLES.SERVICES, stryMutAct_9fa48("69037") ? {} : (stryCov_9fa48("69037"), {
        ...planningReadOptions,
        preferAuthoritativeRead: preferAuthoritativeMembershipState,
        preloadedRows: options.serviceRows
      }));
      const partitionRows = await this.readTableRows(TABLES.PARTITIONS, stryMutAct_9fa48("69038") ? {} : (stryCov_9fa48("69038"), {
        ...planningReadOptions,
        preferAuthoritativeRead: preferAuthoritativeMembershipState,
        preloadedRows: options.partitionRows
      }));
      const readinessEntries = Array.isArray(options.readinessEntries) ? options.readinessEntries : (stryMutAct_9fa48("69041") ? this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getAllNodeReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("69040") ? false : stryMutAct_9fa48("69039") ? true : (stryCov_9fa48("69039", "69040", "69041"), this.controlPlaneReadinessService && (stryMutAct_9fa48("69043") ? typeof this.controlPlaneReadinessService.getAllNodeReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("69042") ? true : (stryCov_9fa48("69042", "69043"), typeof this.controlPlaneReadinessService.getAllNodeReadiness === TYPEOF.FUNCTION)))) ? await this.controlPlaneReadinessService.getAllNodeReadiness(stryMutAct_9fa48("69044") ? {} : (stryCov_9fa48("69044"), {
        allowAuthoritativeRefresh: preferAuthoritativeMembershipState
      })) : stryMutAct_9fa48("69045") ? ["Stryker was here"] : (stryCov_9fa48("69045"), []);
      const recoveryEpochsByNodeId = stryMutAct_9fa48("69048") ? options.recoveryEpochsByNodeId && (this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION ? this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() : null) : stryMutAct_9fa48("69047") ? false : stryMutAct_9fa48("69046") ? true : (stryCov_9fa48("69046", "69047", "69048"), options.recoveryEpochsByNodeId || ((stryMutAct_9fa48("69051") ? this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION : stryMutAct_9fa48("69050") ? false : stryMutAct_9fa48("69049") ? true : (stryCov_9fa48("69049", "69050", "69051"), this.controlPlaneReadinessService && (stryMutAct_9fa48("69053") ? typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId !== TYPEOF.FUNCTION : stryMutAct_9fa48("69052") ? true : (stryCov_9fa48("69052", "69053"), typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION)))) ? this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() : null));
      const connectedNodeIds = (stryMutAct_9fa48("69056") ? this.controlPlaneReadinessService?.messageRouter || typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes === TYPEOF.FUNCTION : stryMutAct_9fa48("69055") ? false : stryMutAct_9fa48("69054") ? true : (stryCov_9fa48("69054", "69055", "69056"), (stryMutAct_9fa48("69057") ? this.controlPlaneReadinessService.messageRouter : (stryCov_9fa48("69057"), this.controlPlaneReadinessService?.messageRouter)) && (stryMutAct_9fa48("69059") ? typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("69058") ? true : (stryCov_9fa48("69058", "69059"), typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes === TYPEOF.FUNCTION)))) ? this.controlPlaneReadinessService.messageRouter.getConnectedNodes() : stryMutAct_9fa48("69060") ? ["Stryker was here"] : (stryCov_9fa48("69060"), []);
      const priorityRecoveryPlanningSnapshot = (stryMutAct_9fa48("69063") ? options.disableNestedPriorityRecoveryPlanning !== true : stryMutAct_9fa48("69062") ? false : stryMutAct_9fa48("69061") ? true : (stryCov_9fa48("69061", "69062", "69063"), options.disableNestedPriorityRecoveryPlanning === (stryMutAct_9fa48("69064") ? false : (stryCov_9fa48("69064"), true)))) ? null : (stryMutAct_9fa48("69067") ? this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getMembershipPublicationPlanningAnswerBestEffort === TYPEOF.FUNCTION : stryMutAct_9fa48("69066") ? false : stryMutAct_9fa48("69065") ? true : (stryCov_9fa48("69065", "69066", "69067"), this.controlPlaneReadinessService && (stryMutAct_9fa48("69069") ? typeof this.controlPlaneReadinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("69068") ? true : (stryCov_9fa48("69068", "69069"), typeof this.controlPlaneReadinessService.getMembershipPublicationPlanningAnswerBestEffort === TYPEOF.FUNCTION)))) ? await this.controlPlaneReadinessService.getMembershipPublicationPlanningAnswerBestEffort(stryMutAct_9fa48("69072") ? options.publisherNodeId && this.nodeId : stryMutAct_9fa48("69071") ? false : stryMutAct_9fa48("69070") ? true : (stryCov_9fa48("69070", "69071", "69072"), options.publisherNodeId || this.nodeId), normalizePositiveInteger(options.nowMs, this.now())) : null;
      return buildMembershipPublicationEvidenceSnapshot(stryMutAct_9fa48("69073") ? {} : (stryCov_9fa48("69073"), {
        ...options,
        latestPublicationRow,
        latestPublishedPublicationRow,
        nodeRows,
        nodeEndpointRows,
        serviceRows,
        partitionRows,
        readinessEntries,
        recoveryEpochsByNodeId,
        connectedNodeIds,
        priorityRecoveryPlanningSnapshot,
        publisherNodeId: stryMutAct_9fa48("69076") ? options.publisherNodeId && this.nodeId : stryMutAct_9fa48("69075") ? false : stryMutAct_9fa48("69074") ? true : (stryCov_9fa48("69074", "69075", "69076"), options.publisherNodeId || this.nodeId),
        localNodeId: this.nodeId,
        localNodeResponsive: stryMutAct_9fa48("69077") ? false : (stryCov_9fa48("69077"), true),
        nowMs: normalizePositiveInteger(options.nowMs, this.now())
      }));
    }
  }
  readPublicationPlanningSnapshotSync(options = {}) {
    if (stryMutAct_9fa48("69078")) {
      {}
    } else {
      stryCov_9fa48("69078");
      const latestPublicationRow = stryMutAct_9fa48("69081") ? options.latestPublicationRow && this.getLatestPublicationRowSync(options) : stryMutAct_9fa48("69080") ? false : stryMutAct_9fa48("69079") ? true : (stryCov_9fa48("69079", "69080", "69081"), options.latestPublicationRow || this.getLatestPublicationRowSync(options));
      const latestPublishedPublicationRow = stryMutAct_9fa48("69084") ? options.latestPublishedPublicationRow && (String(latestPublicationRow?.status || '').toUpperCase() === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ? latestPublicationRow : this.getLatestPublishedPublicationRowSync(options)) : stryMutAct_9fa48("69083") ? false : stryMutAct_9fa48("69082") ? true : (stryCov_9fa48("69082", "69083", "69084"), options.latestPublishedPublicationRow || ((stryMutAct_9fa48("69087") ? String(latestPublicationRow?.status || '').toUpperCase() !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("69086") ? false : stryMutAct_9fa48("69085") ? true : (stryCov_9fa48("69085", "69086", "69087"), (stryMutAct_9fa48("69088") ? String(latestPublicationRow?.status || '').toLowerCase() : (stryCov_9fa48("69088"), String(stryMutAct_9fa48("69091") ? latestPublicationRow?.status && '' : stryMutAct_9fa48("69090") ? false : stryMutAct_9fa48("69089") ? true : (stryCov_9fa48("69089", "69090", "69091"), (stryMutAct_9fa48("69092") ? latestPublicationRow.status : (stryCov_9fa48("69092"), latestPublicationRow?.status)) || (stryMutAct_9fa48("69093") ? "Stryker was here!" : (stryCov_9fa48("69093"), '')))).toUpperCase())) === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) ? latestPublicationRow : this.getLatestPublishedPublicationRowSync(options)));
      const nodeRows = Array.isArray(options.nodeRows) ? options.nodeRows : (stryMutAct_9fa48("69096") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("69095") ? false : stryMutAct_9fa48("69094") ? true : (stryCov_9fa48("69094", "69095", "69096"), typeof (stryMutAct_9fa48("69097") ? this.systemTableCache.getAll : (stryCov_9fa48("69097"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("69100") ? this.systemTableCache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("69099") ? false : stryMutAct_9fa48("69098") ? true : (stryCov_9fa48("69098", "69099", "69100"), this.systemTableCache.getAll(TABLES.NODES) || (stryMutAct_9fa48("69101") ? ["Stryker was here"] : (stryCov_9fa48("69101"), []))) : stryMutAct_9fa48("69102") ? ["Stryker was here"] : (stryCov_9fa48("69102"), []);
      const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ? options.nodeEndpointRows : (stryMutAct_9fa48("69105") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("69104") ? false : stryMutAct_9fa48("69103") ? true : (stryCov_9fa48("69103", "69104", "69105"), typeof (stryMutAct_9fa48("69106") ? this.systemTableCache.getAll : (stryCov_9fa48("69106"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("69109") ? this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) && [] : stryMutAct_9fa48("69108") ? false : stryMutAct_9fa48("69107") ? true : (stryCov_9fa48("69107", "69108", "69109"), this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || (stryMutAct_9fa48("69110") ? ["Stryker was here"] : (stryCov_9fa48("69110"), []))) : stryMutAct_9fa48("69111") ? ["Stryker was here"] : (stryCov_9fa48("69111"), []);
      const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : (stryMutAct_9fa48("69114") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("69113") ? false : stryMutAct_9fa48("69112") ? true : (stryCov_9fa48("69112", "69113", "69114"), typeof (stryMutAct_9fa48("69115") ? this.systemTableCache.getAll : (stryCov_9fa48("69115"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("69118") ? this.systemTableCache.getAll(TABLES.SERVICES) && [] : stryMutAct_9fa48("69117") ? false : stryMutAct_9fa48("69116") ? true : (stryCov_9fa48("69116", "69117", "69118"), this.systemTableCache.getAll(TABLES.SERVICES) || (stryMutAct_9fa48("69119") ? ["Stryker was here"] : (stryCov_9fa48("69119"), []))) : stryMutAct_9fa48("69120") ? ["Stryker was here"] : (stryCov_9fa48("69120"), []);
      const partitionRows = Array.isArray(options.partitionRows) ? options.partitionRows : (stryMutAct_9fa48("69123") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("69122") ? false : stryMutAct_9fa48("69121") ? true : (stryCov_9fa48("69121", "69122", "69123"), typeof (stryMutAct_9fa48("69124") ? this.systemTableCache.getAll : (stryCov_9fa48("69124"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("69127") ? this.systemTableCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("69126") ? false : stryMutAct_9fa48("69125") ? true : (stryCov_9fa48("69125", "69126", "69127"), this.systemTableCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("69128") ? ["Stryker was here"] : (stryCov_9fa48("69128"), []))) : stryMutAct_9fa48("69129") ? ["Stryker was here"] : (stryCov_9fa48("69129"), []);
      const readinessEntries = Array.isArray(options.readinessEntries) ? options.readinessEntries : stryMutAct_9fa48("69130") ? ["Stryker was here"] : (stryCov_9fa48("69130"), []);
      const recoveryEpochsByNodeId = stryMutAct_9fa48("69133") ? options.recoveryEpochsByNodeId && (this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION ? this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() : null) : stryMutAct_9fa48("69132") ? false : stryMutAct_9fa48("69131") ? true : (stryCov_9fa48("69131", "69132", "69133"), options.recoveryEpochsByNodeId || ((stryMutAct_9fa48("69136") ? this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION : stryMutAct_9fa48("69135") ? false : stryMutAct_9fa48("69134") ? true : (stryCov_9fa48("69134", "69135", "69136"), this.controlPlaneReadinessService && (stryMutAct_9fa48("69138") ? typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId !== TYPEOF.FUNCTION : stryMutAct_9fa48("69137") ? true : (stryCov_9fa48("69137", "69138"), typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION)))) ? this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() : null));
      const connectedNodeIds = (stryMutAct_9fa48("69141") ? this.controlPlaneReadinessService?.messageRouter || typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes === TYPEOF.FUNCTION : stryMutAct_9fa48("69140") ? false : stryMutAct_9fa48("69139") ? true : (stryCov_9fa48("69139", "69140", "69141"), (stryMutAct_9fa48("69142") ? this.controlPlaneReadinessService.messageRouter : (stryCov_9fa48("69142"), this.controlPlaneReadinessService?.messageRouter)) && (stryMutAct_9fa48("69144") ? typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("69143") ? true : (stryCov_9fa48("69143", "69144"), typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes === TYPEOF.FUNCTION)))) ? this.controlPlaneReadinessService.messageRouter.getConnectedNodes() : stryMutAct_9fa48("69145") ? ["Stryker was here"] : (stryCov_9fa48("69145"), []);
      return buildMembershipPublicationEvidenceSnapshot(stryMutAct_9fa48("69146") ? {} : (stryCov_9fa48("69146"), {
        ...options,
        latestPublicationRow,
        latestPublishedPublicationRow,
        nodeRows,
        nodeEndpointRows,
        serviceRows,
        partitionRows,
        readinessEntries,
        recoveryEpochsByNodeId,
        connectedNodeIds,
        priorityRecoveryPlanningSnapshot: null,
        publisherNodeId: stryMutAct_9fa48("69149") ? options.publisherNodeId && this.nodeId : stryMutAct_9fa48("69148") ? false : stryMutAct_9fa48("69147") ? true : (stryCov_9fa48("69147", "69148", "69149"), options.publisherNodeId || this.nodeId),
        localNodeId: this.nodeId,
        localNodeResponsive: stryMutAct_9fa48("69150") ? false : (stryCov_9fa48("69150"), true),
        nowMs: normalizePositiveInteger(options.nowMs, this.now())
      }));
    }
  }
  async ensureWorkflow(ownerKey, candidate) {
    if (stryMutAct_9fa48("69151")) {
      {}
    } else {
      stryCov_9fa48("69151");
      const existingWorkflow = this.workflowCoordinator.getWorkflowByOwnerKey(ownerKey);
      if (stryMutAct_9fa48("69153") ? false : stryMutAct_9fa48("69152") ? true : (stryCov_9fa48("69152", "69153"), existingWorkflow)) {
        if (stryMutAct_9fa48("69154")) {
          {}
        } else {
          stryCov_9fa48("69154");
          return existingWorkflow;
        }
      }
      return this.workflowCoordinator.registerWorkflow(stryMutAct_9fa48("69155") ? {} : (stryCov_9fa48("69155"), {
        workflowId: stryMutAct_9fa48("69156") ? `` : (stryCov_9fa48("69156"), `membership-publication:${candidate.publicationEpoch}`),
        ownerKey,
        step: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.IDLE,
        metadata: stryMutAct_9fa48("69157") ? {} : (stryCov_9fa48("69157"), {
          publicationKind: candidate.publicationKind
        }),
        transitionHistory: stryMutAct_9fa48("69158") ? ["Stryker was here"] : (stryCov_9fa48("69158"), [])
      }));
    }
  }
  async persistPublicationRow(row, options = {}) {
    if (stryMutAct_9fa48("69159")) {
      {}
    } else {
      stryCov_9fa48("69159");
      let persistedRow = serializeMembershipPublicationRow(row);
      if (stryMutAct_9fa48("69162") ? this.controlPlanePublicationsOwner || typeof this.controlPlanePublicationsOwner.upsertPublication === TYPEOF.FUNCTION : stryMutAct_9fa48("69161") ? false : stryMutAct_9fa48("69160") ? true : (stryCov_9fa48("69160", "69161", "69162"), this.controlPlanePublicationsOwner && (stryMutAct_9fa48("69164") ? typeof this.controlPlanePublicationsOwner.upsertPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("69163") ? true : (stryCov_9fa48("69163", "69164"), typeof this.controlPlanePublicationsOwner.upsertPublication === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("69165")) {
          {}
        } else {
          stryCov_9fa48("69165");
          const publicationId = stryMutAct_9fa48("69168") ? persistedRow.publication_id && null : stryMutAct_9fa48("69167") ? false : stryMutAct_9fa48("69166") ? true : (stryCov_9fa48("69166", "69167", "69168"), persistedRow.publication_id || null);
          const canVerifyPersistedRow = stryMutAct_9fa48("69171") ? publicationId && options.skipPublicationWriteReadback !== true || typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION : stryMutAct_9fa48("69170") ? false : stryMutAct_9fa48("69169") ? true : (stryCov_9fa48("69169", "69170", "69171"), (stryMutAct_9fa48("69173") ? publicationId || options.skipPublicationWriteReadback !== true : stryMutAct_9fa48("69172") ? true : (stryCov_9fa48("69172", "69173"), publicationId && (stryMutAct_9fa48("69175") ? options.skipPublicationWriteReadback === true : stryMutAct_9fa48("69174") ? true : (stryCov_9fa48("69174", "69175"), options.skipPublicationWriteReadback !== (stryMutAct_9fa48("69176") ? false : (stryCov_9fa48("69176"), true)))))) && (stryMutAct_9fa48("69178") ? typeof this.controlPlanePublicationsOwner.getPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("69177") ? true : (stryCov_9fa48("69177", "69178"), typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION)));
          const maxAttempts = normalizePositiveInteger(options.publicationWriteMaxAttempts, PUBLICATION_WRITE_MAX_ATTEMPTS);
          for (let attempt = NUM.ZERO; stryMutAct_9fa48("69181") ? attempt >= maxAttempts : stryMutAct_9fa48("69180") ? attempt <= maxAttempts : stryMutAct_9fa48("69179") ? false : (stryCov_9fa48("69179", "69180", "69181"), attempt < maxAttempts); stryMutAct_9fa48("69182") ? attempt -= NUM.ONE : (stryCov_9fa48("69182"), attempt += NUM.ONE)) {
            if (stryMutAct_9fa48("69183")) {
              {}
            } else {
              stryCov_9fa48("69183");
              if (stryMutAct_9fa48("69185") ? false : stryMutAct_9fa48("69184") ? true : (stryCov_9fa48("69184", "69185"), canVerifyPersistedRow)) {
                if (stryMutAct_9fa48("69186")) {
                  {}
                } else {
                  stryCov_9fa48("69186");
                  const currentRow = await this.controlPlanePublicationsOwner.getPublication(publicationId, buildPublicationReadOptions(options));
                  persistedRow = serializeMembershipPublicationRow(mergePublicationRows(persistedRow, currentRow));
                }
              }
              try {
                if (stryMutAct_9fa48("69187")) {
                  {}
                } else {
                  stryCov_9fa48("69187");
                  await this.controlPlanePublicationsOwner.upsertPublication(persistedRow, options);
                }
              } catch (error) {
                if (stryMutAct_9fa48("69188")) {
                  {}
                } else {
                  stryCov_9fa48("69188");
                  if (stryMutAct_9fa48("69191") ? !canVerifyPersistedRow && attempt + NUM.ONE >= maxAttempts : stryMutAct_9fa48("69190") ? false : stryMutAct_9fa48("69189") ? true : (stryCov_9fa48("69189", "69190", "69191"), (stryMutAct_9fa48("69192") ? canVerifyPersistedRow : (stryCov_9fa48("69192"), !canVerifyPersistedRow)) || (stryMutAct_9fa48("69195") ? attempt + NUM.ONE < maxAttempts : stryMutAct_9fa48("69194") ? attempt + NUM.ONE > maxAttempts : stryMutAct_9fa48("69193") ? false : (stryCov_9fa48("69193", "69194", "69195"), (stryMutAct_9fa48("69196") ? attempt - NUM.ONE : (stryCov_9fa48("69196"), attempt + NUM.ONE)) >= maxAttempts)))) {
                    if (stryMutAct_9fa48("69197")) {
                      {}
                    } else {
                      stryCov_9fa48("69197");
                      throw error;
                    }
                  }
                  const durableRow = await this.controlPlanePublicationsOwner.getPublication(publicationId, buildPublicationReadOptions(options));
                  if (stryMutAct_9fa48("69199") ? false : stryMutAct_9fa48("69198") ? true : (stryCov_9fa48("69198", "69199"), publicationRowSatisfiesDesiredState(durableRow, persistedRow))) {
                    if (stryMutAct_9fa48("69200")) {
                      {}
                    } else {
                      stryCov_9fa48("69200");
                      return serializeMembershipPublicationRow(mergePublicationRows(durableRow, persistedRow));
                    }
                  }
                  persistedRow = serializeMembershipPublicationRow(mergePublicationRows(durableRow, persistedRow));
                  continue;
                }
              }
              if (stryMutAct_9fa48("69203") ? false : stryMutAct_9fa48("69202") ? true : stryMutAct_9fa48("69201") ? canVerifyPersistedRow : (stryCov_9fa48("69201", "69202", "69203"), !canVerifyPersistedRow)) {
                if (stryMutAct_9fa48("69204")) {
                  {}
                } else {
                  stryCov_9fa48("69204");
                  return persistedRow;
                }
              }
              if (stryMutAct_9fa48("69207") ? options.skipPublicationWriteReadback !== true : stryMutAct_9fa48("69206") ? false : stryMutAct_9fa48("69205") ? true : (stryCov_9fa48("69205", "69206", "69207"), options.skipPublicationWriteReadback === (stryMutAct_9fa48("69208") ? false : (stryCov_9fa48("69208"), true)))) {
                if (stryMutAct_9fa48("69209")) {
                  {}
                } else {
                  stryCov_9fa48("69209");
                  return persistedRow;
                }
              }
              const durableRow = await this.controlPlanePublicationsOwner.getPublication(publicationId, buildPublicationReadOptions(options));
              if (stryMutAct_9fa48("69211") ? false : stryMutAct_9fa48("69210") ? true : (stryCov_9fa48("69210", "69211"), publicationRowSatisfiesDesiredState(durableRow, persistedRow))) {
                if (stryMutAct_9fa48("69212")) {
                  {}
                } else {
                  stryCov_9fa48("69212");
                  return serializeMembershipPublicationRow(mergePublicationRows(durableRow, persistedRow));
                }
              }
              persistedRow = serializeMembershipPublicationRow(mergePublicationRows(durableRow, persistedRow));
            }
          }
        }
      }
      return persistedRow;
    }
  }
  async acknowledgePublication(publicationId, nodeId, options = {}) {
    if (stryMutAct_9fa48("69213")) {
      {}
    } else {
      stryCov_9fa48("69213");
      return this.publicationAcknowledgementLane.run(stryMutAct_9fa48("69214") ? {} : (stryCov_9fa48("69214"), {
        ownerKey: stryMutAct_9fa48("69215") ? `` : (stryCov_9fa48("69215"), `${this.buildOwnerKey()}:ack:${publicationId}`)
      }), async () => {
        if (stryMutAct_9fa48("69216")) {
          {}
        } else {
          stryCov_9fa48("69216");
          let existingRow = null;
          if (stryMutAct_9fa48("69219") ? this.controlPlanePublicationsOwner || typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION : stryMutAct_9fa48("69218") ? false : stryMutAct_9fa48("69217") ? true : (stryCov_9fa48("69217", "69218", "69219"), this.controlPlanePublicationsOwner && (stryMutAct_9fa48("69221") ? typeof this.controlPlanePublicationsOwner.getPublication !== TYPEOF.FUNCTION : stryMutAct_9fa48("69220") ? true : (stryCov_9fa48("69220", "69221"), typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("69222")) {
              {}
            } else {
              stryCov_9fa48("69222");
              existingRow = await this.controlPlanePublicationsOwner.getPublication(publicationId, buildPublicationReadOptions(options));
            }
          }
          const baseRow = mergePublicationRows(existingRow, stryMutAct_9fa48("69225") ? options.publicationRow && null : stryMutAct_9fa48("69224") ? false : stryMutAct_9fa48("69223") ? true : (stryCov_9fa48("69223", "69224", "69225"), options.publicationRow || null));
          if (stryMutAct_9fa48("69228") ? false : stryMutAct_9fa48("69227") ? true : stryMutAct_9fa48("69226") ? baseRow : (stryCov_9fa48("69226", "69227", "69228"), !baseRow)) {
            if (stryMutAct_9fa48("69229")) {
              {}
            } else {
              stryCov_9fa48("69229");
              return null;
            }
          }
          const normalizedBaseRow = normalizeControlPlanePublicationRow(baseRow);
          const acknowledgedRow = acknowledgeMembershipPublication(stryMutAct_9fa48("69230") ? {} : (stryCov_9fa48("69230"), {
            publicationRow: baseRow,
            nodeId,
            nowMs: this.now(),
            timeoutMs: options.timeoutMs,
            timeoutReasonCode: options.timeoutReasonCode
          }));
          const normalizedAcknowledgedRow = normalizeControlPlanePublicationRow(acknowledgedRow);
          const acknowledgementChanged = stryMutAct_9fa48("69233") ? normalizedAcknowledgedRow.status !== normalizedBaseRow.status && !listEquals(normalizedAcknowledgedRow.acknowledgedNodeIds, normalizedBaseRow.acknowledgedNodeIds) : stryMutAct_9fa48("69232") ? false : stryMutAct_9fa48("69231") ? true : (stryCov_9fa48("69231", "69232", "69233"), (stryMutAct_9fa48("69235") ? normalizedAcknowledgedRow.status === normalizedBaseRow.status : stryMutAct_9fa48("69234") ? false : (stryCov_9fa48("69234", "69235"), normalizedAcknowledgedRow.status !== normalizedBaseRow.status)) || (stryMutAct_9fa48("69236") ? listEquals(normalizedAcknowledgedRow.acknowledgedNodeIds, normalizedBaseRow.acknowledgedNodeIds) : (stryCov_9fa48("69236"), !listEquals(normalizedAcknowledgedRow.acknowledgedNodeIds, normalizedBaseRow.acknowledgedNodeIds))));
          if (stryMutAct_9fa48("69239") ? false : stryMutAct_9fa48("69238") ? true : stryMutAct_9fa48("69237") ? acknowledgementChanged : (stryCov_9fa48("69237", "69238", "69239"), !acknowledgementChanged)) {
            if (stryMutAct_9fa48("69240")) {
              {}
            } else {
              stryCov_9fa48("69240");
              return acknowledgedRow;
            }
          }
          return this.persistPublicationRow(acknowledgedRow, options);
        }
      });
    }
  }
  async reconcileClusterMembership(options = {}) {
    if (stryMutAct_9fa48("69241")) {
      {}
    } else {
      stryCov_9fa48("69241");
      const ownerKey = this.buildOwnerKey();
      return this.publicationReconcileLane.run(stryMutAct_9fa48("69242") ? {} : (stryCov_9fa48("69242"), {
        ownerKey
      }), stryMutAct_9fa48("69243") ? () => undefined : (stryCov_9fa48("69243"), async () => this.workflowCoordinator.runExclusive(ownerKey, async () => {
        if (stryMutAct_9fa48("69244")) {
          {}
        } else {
          stryCov_9fa48("69244");
          const latestPublicationRow = stryMutAct_9fa48("69247") ? options.latestPublicationRow && (await this.getLatestPublicationRow(options)) : stryMutAct_9fa48("69246") ? false : stryMutAct_9fa48("69245") ? true : (stryCov_9fa48("69245", "69246", "69247"), options.latestPublicationRow || (await this.getLatestPublicationRow(options)));
          const latestPublishedPublicationRow = stryMutAct_9fa48("69250") ? options.latestPublishedPublicationRow && (String(latestPublicationRow?.status || '').toUpperCase() === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ? latestPublicationRow : await this.getLatestPublishedPublicationRow(options)) : stryMutAct_9fa48("69249") ? false : stryMutAct_9fa48("69248") ? true : (stryCov_9fa48("69248", "69249", "69250"), options.latestPublishedPublicationRow || ((stryMutAct_9fa48("69253") ? String(latestPublicationRow?.status || '').toUpperCase() !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("69252") ? false : stryMutAct_9fa48("69251") ? true : (stryCov_9fa48("69251", "69252", "69253"), (stryMutAct_9fa48("69254") ? String(latestPublicationRow?.status || '').toLowerCase() : (stryCov_9fa48("69254"), String(stryMutAct_9fa48("69257") ? latestPublicationRow?.status && '' : stryMutAct_9fa48("69256") ? false : stryMutAct_9fa48("69255") ? true : (stryCov_9fa48("69255", "69256", "69257"), (stryMutAct_9fa48("69258") ? latestPublicationRow.status : (stryCov_9fa48("69258"), latestPublicationRow?.status)) || (stryMutAct_9fa48("69259") ? "Stryker was here!" : (stryCov_9fa48("69259"), '')))).toUpperCase())) === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) ? latestPublicationRow : await this.getLatestPublishedPublicationRow(options)));
          const candidate = await this.deriveClusterMembershipCandidate(stryMutAct_9fa48("69260") ? {} : (stryCov_9fa48("69260"), {
            ...options,
            latestPublicationRow,
            latestPublishedPublicationRow
          }));
          const workflow = await this.ensureWorkflow(ownerKey, candidate);
          if (stryMutAct_9fa48("69263") ? latestPublicationRow || candidate.changed !== true : stryMutAct_9fa48("69262") ? false : stryMutAct_9fa48("69261") ? true : (stryCov_9fa48("69261", "69262", "69263"), latestPublicationRow && (stryMutAct_9fa48("69265") ? candidate.changed === true : stryMutAct_9fa48("69264") ? true : (stryCov_9fa48("69264", "69265"), candidate.changed !== (stryMutAct_9fa48("69266") ? false : (stryCov_9fa48("69266"), true)))))) {
            if (stryMutAct_9fa48("69267")) {
              {}
            } else {
              stryCov_9fa48("69267");
              if (stryMutAct_9fa48("69270") ? candidate.priorityPartitionSummaryChanged === true || candidate.membershipLifecycleSummaryChanged === true || candidate.priorityPartitionSummary && typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT || candidate.membershipLifecycleSummary && typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("69269") ? false : stryMutAct_9fa48("69268") ? true : (stryCov_9fa48("69268", "69269", "69270"), (stryMutAct_9fa48("69272") ? candidate.priorityPartitionSummaryChanged === true && candidate.membershipLifecycleSummaryChanged === true : stryMutAct_9fa48("69271") ? true : (stryCov_9fa48("69271", "69272"), (stryMutAct_9fa48("69274") ? candidate.priorityPartitionSummaryChanged !== true : stryMutAct_9fa48("69273") ? false : (stryCov_9fa48("69273", "69274"), candidate.priorityPartitionSummaryChanged === (stryMutAct_9fa48("69275") ? false : (stryCov_9fa48("69275"), true)))) || (stryMutAct_9fa48("69277") ? candidate.membershipLifecycleSummaryChanged !== true : stryMutAct_9fa48("69276") ? false : (stryCov_9fa48("69276", "69277"), candidate.membershipLifecycleSummaryChanged === (stryMutAct_9fa48("69278") ? false : (stryCov_9fa48("69278"), true)))))) && (stryMutAct_9fa48("69280") ? candidate.priorityPartitionSummary && typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT && candidate.membershipLifecycleSummary && typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("69279") ? true : (stryCov_9fa48("69279", "69280"), (stryMutAct_9fa48("69282") ? candidate.priorityPartitionSummary || typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("69281") ? false : (stryCov_9fa48("69281", "69282"), candidate.priorityPartitionSummary && (stryMutAct_9fa48("69284") ? typeof candidate.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("69283") ? true : (stryCov_9fa48("69283", "69284"), typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT)))) || (stryMutAct_9fa48("69286") ? candidate.membershipLifecycleSummary || typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("69285") ? false : (stryCov_9fa48("69285", "69286"), candidate.membershipLifecycleSummary && (stryMutAct_9fa48("69288") ? typeof candidate.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("69287") ? true : (stryCov_9fa48("69287", "69288"), typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT)))))))) {
                if (stryMutAct_9fa48("69289")) {
                  {}
                } else {
                  stryCov_9fa48("69289");
                  const refreshedRow = buildPublicationMetadataRefreshRow(stryMutAct_9fa48("69290") ? {} : (stryCov_9fa48("69290"), {
                    publicationRow: latestPublicationRow,
                    priorityPartitionSummary: candidate.priorityPartitionSummary,
                    membershipLifecycleSummary: candidate.membershipLifecycleSummary,
                    nowMs: this.now()
                  }));
                  const persistedRow = await this.persistPublicationRow(refreshedRow, options);
                  return stryMutAct_9fa48("69291") ? {} : (stryCov_9fa48("69291"), {
                    candidate,
                    publicationRow: normalizeControlPlanePublicationRow(persistedRow),
                    workflow
                  });
                }
              }
              return stryMutAct_9fa48("69292") ? {} : (stryCov_9fa48("69292"), {
                candidate,
                publicationRow: (stryMutAct_9fa48("69295") ? String(latestPublicationRow.status || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).toUpperCase() === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED && !latestPublishedPublicationRow : stryMutAct_9fa48("69294") ? false : stryMutAct_9fa48("69293") ? true : (stryCov_9fa48("69293", "69294", "69295"), (stryMutAct_9fa48("69297") ? String(latestPublicationRow.status || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).toUpperCase() !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("69296") ? false : (stryCov_9fa48("69296", "69297"), (stryMutAct_9fa48("69298") ? String(latestPublicationRow.status || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).toLowerCase() : (stryCov_9fa48("69298"), String(stryMutAct_9fa48("69301") ? latestPublicationRow.status && MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY : stryMutAct_9fa48("69300") ? false : stryMutAct_9fa48("69299") ? true : (stryCov_9fa48("69299", "69300", "69301"), latestPublicationRow.status || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY)).toUpperCase())) === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED)) || (stryMutAct_9fa48("69302") ? latestPublishedPublicationRow : (stryCov_9fa48("69302"), !latestPublishedPublicationRow)))) ? latestPublicationRow : latestPublishedPublicationRow,
                workflow
              });
            }
          }
          await this.workflowCoordinator.transitionStep(workflow.workflowId, stryMutAct_9fa48("69303") ? {} : (stryCov_9fa48("69303"), {
            nextStep: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.DERIVING,
            reason: PUBLICATION_WORKFLOW_REASON.DERIVE_MEMBERSHIP_PUBLICATION,
            metadata: stryMutAct_9fa48("69304") ? {} : (stryCov_9fa48("69304"), {
              publicationEpoch: candidate.publicationEpoch
            })
          }));
          const row = buildMembershipPublicationRow(stryMutAct_9fa48("69305") ? {} : (stryCov_9fa48("69305"), {
            publicationId: options.publicationId,
            candidate,
            nowMs: this.now()
          }));
          await this.persistPublicationRow(row, options);
          await this.workflowCoordinator.transitionStep(workflow.workflowId, stryMutAct_9fa48("69306") ? {} : (stryCov_9fa48("69306"), {
            nextStep: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.OPEN,
            reason: PUBLICATION_WORKFLOW_REASON.PERSIST_OPEN_PUBLICATION,
            metadata: stryMutAct_9fa48("69307") ? {} : (stryCov_9fa48("69307"), {
              publicationId: row.publication_id,
              publicationEpoch: row.publication_epoch
            })
          }), stryMutAct_9fa48("69308") ? {} : (stryCov_9fa48("69308"), {
            metadata: stryMutAct_9fa48("69309") ? {} : (stryCov_9fa48("69309"), {
              publicationId: row.publication_id,
              publicationEpoch: row.publication_epoch
            })
          }));
          return stryMutAct_9fa48("69310") ? {} : (stryCov_9fa48("69310"), {
            candidate,
            publicationRow: row,
            workflow
          });
        }
      })));
    }
  }
  getLaneDiagnostics() {
    if (stryMutAct_9fa48("69311")) {
      {}
    } else {
      stryCov_9fa48("69311");
      const inFlightExecutions = (stryMutAct_9fa48("69312") ? this.workflowCoordinator.inFlightExecutionsByOwnerKey : (stryCov_9fa48("69312"), this.workflowCoordinator?.inFlightExecutionsByOwnerKey)) instanceof Map ? this.workflowCoordinator.inFlightExecutionsByOwnerKey : new Map();
      return Object.freeze(stryMutAct_9fa48("69313") ? {} : (stryCov_9fa48("69313"), {
        reconcileLane: Object.freeze(stryMutAct_9fa48("69314") ? {} : (stryCov_9fa48("69314"), {
          name: stryMutAct_9fa48("69317") ? this.publicationReconcileLane?.name && null : stryMutAct_9fa48("69316") ? false : stryMutAct_9fa48("69315") ? true : (stryCov_9fa48("69315", "69316", "69317"), (stryMutAct_9fa48("69318") ? this.publicationReconcileLane.name : (stryCov_9fa48("69318"), this.publicationReconcileLane?.name)) || null),
          activeExecutionCount: inFlightExecutions.has(this.buildOwnerKey()) ? NUM.ONE : NUM.ZERO
        })),
        acknowledgementLane: Object.freeze(stryMutAct_9fa48("69319") ? {} : (stryCov_9fa48("69319"), {
          name: stryMutAct_9fa48("69322") ? this.publicationAcknowledgementLane?.name && null : stryMutAct_9fa48("69321") ? false : stryMutAct_9fa48("69320") ? true : (stryCov_9fa48("69320", "69321", "69322"), (stryMutAct_9fa48("69323") ? this.publicationAcknowledgementLane.name : (stryCov_9fa48("69323"), this.publicationAcknowledgementLane?.name)) || null),
          activeExecutionCount: stryMutAct_9fa48("69324") ? [...inFlightExecutions.keys()].length : (stryCov_9fa48("69324"), (stryMutAct_9fa48("69325") ? [] : (stryCov_9fa48("69325"), [...inFlightExecutions.keys()])).filter(stryMutAct_9fa48("69326") ? () => undefined : (stryCov_9fa48("69326"), ownerKey => stryMutAct_9fa48("69327") ? String(ownerKey).endsWith(`${this.buildOwnerKey()}:ack:`) : (stryCov_9fa48("69327"), String(ownerKey).startsWith(stryMutAct_9fa48("69328") ? `` : (stryCov_9fa48("69328"), `${this.buildOwnerKey()}:ack:`))))).length)
        }))
      }));
    }
  }
  enqueueClusterMembershipReconcile(reason = MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MANUAL, context = {}, options = {}) {
    if (stryMutAct_9fa48("69329")) {
      {}
    } else {
      stryCov_9fa48("69329");
      return this.reconcileQueue.enqueue(this.buildOwnerKey(), reason, context, options);
    }
  }
}
export { MEMBERSHIP_PUBLICATION_KIND, MEMBERSHIP_PUBLICATION_OWNER_KEY, MEMBERSHIP_PUBLICATION_STATUS, MEMBERSHIP_PUBLICATION_WORKFLOW_STEP, MembershipPublicationCoordinator, acknowledgeMembershipPublication, abandonMembershipPublication, buildMembershipPublicationRow, buildTransitionHistoryEntry, deriveMembershipPublicationCandidate, hasPublicationTimedOut };