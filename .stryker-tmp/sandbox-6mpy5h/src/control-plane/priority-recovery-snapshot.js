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
import { NUM, TIME_MS, TYPEOF } from '../constants/index.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from './control-plane-readiness-constants.js';
import { buildActiveMembershipSnapshot as buildPriorityRecoveryPublicationContext, resolvePriorityRecoveryActiveNodeCohort } from './active-node-projection.js';
import { PRIORITY_RECOVERY_BLOCKER_REASON, PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE, PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE, PRIORITY_RECOVERY_CORRELATION_KEY, PRIORITY_RECOVERY_PROGRESS_CLASS_IDS, PRIORITY_RECOVERY_SEMANTIC_STATE, PRIORITY_RECOVERY_SEMANTIC_STATE_IDS, PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON, PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS } from './priority-recovery-diagnostics-constants.js';
import { OperationType, TERMINAL_STATUSES as REPLICA_OPERATION_TERMINAL_STATUSES, isReplaceRemoveDispatchPhase, isTerminalStep as isTerminalReplicaOperationStep, isValidWorkflowStep as isValidReplicaOperationStep } from '../rebalancer/replica-status.js';
const PRIORITY_RECOVERY_SNAPSHOT_LITERAL = Object.freeze(stryMutAct_9fa48("70418") ? {} : (stryCov_9fa48("70418"), {
  VALUE: stryMutAct_9fa48("70419") ? "Stryker was here!" : (stryCov_9fa48("70419"), ''),
  TYPE: stryMutAct_9fa48("70420") ? "" : (stryCov_9fa48("70420"), 'type'),
  OPERATION_TYPE: stryMutAct_9fa48("70421") ? "" : (stryCov_9fa48("70421"), 'operation_type'),
  OPERATIONTYPE: stryMutAct_9fa48("70422") ? "" : (stryCov_9fa48("70422"), 'operationType'),
  STATUS: stryMutAct_9fa48("70423") ? "" : (stryCov_9fa48("70423"), 'status'),
  WORKFLOWSTEP: stryMutAct_9fa48("70424") ? "" : (stryCov_9fa48("70424"), 'workflowStep'),
  SOURCENODEID: stryMutAct_9fa48("70425") ? "" : (stryCov_9fa48("70425"), 'sourceNodeId'),
  TARGETNODEID: stryMutAct_9fa48("70426") ? "" : (stryCov_9fa48("70426"), 'targetNodeId'),
  REPLICAID: stryMutAct_9fa48("70427") ? "" : (stryCov_9fa48("70427"), 'replicaId'),
  SERVICE_ID: stryMutAct_9fa48("70428") ? "" : (stryCov_9fa48("70428"), 'service_id'),
  SERVICEID: stryMutAct_9fa48("70429") ? "" : (stryCov_9fa48("70429"), 'serviceId'),
  ACTIVE: stryMutAct_9fa48("70430") ? "" : (stryCov_9fa48("70430"), 'ACTIVE')
}));
const STATUS_ACTIVE = stryMutAct_9fa48("70431") ? "" : (stryCov_9fa48("70431"), 'active');
const PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION = stryMutAct_9fa48("70432") ? "" : (stryCov_9fa48("70432"), 'partition');
const PRIORITY_RECOVERY_RAFT_ROLE_LEARNER = stryMutAct_9fa48("70433") ? "" : (stryCov_9fa48("70433"), 'learner');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID = stryMutAct_9fa48("70434") ? "" : (stryCov_9fa48("70434"), 'operation_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID = stryMutAct_9fa48("70435") ? "" : (stryCov_9fa48("70435"), 'partition_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID = stryMutAct_9fa48("70436") ? "" : (stryCov_9fa48("70436"), 'entity_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE = stryMutAct_9fa48("70437") ? "" : (stryCov_9fa48("70437"), 'entity_type');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS = stryMutAct_9fa48("70438") ? "" : (stryCov_9fa48("70438"), 'status');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP = stryMutAct_9fa48("70439") ? "" : (stryCov_9fa48("70439"), 'workflow_step');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID = stryMutAct_9fa48("70440") ? "" : (stryCov_9fa48("70440"), 'target_node_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID = stryMutAct_9fa48("70441") ? "" : (stryCov_9fa48("70441"), 'source_node_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID = stryMutAct_9fa48("70442") ? "" : (stryCov_9fa48("70442"), 'replica_id');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT = stryMutAct_9fa48("70443") ? "" : (stryCov_9fa48("70443"), 'created_at');
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT = stryMutAct_9fa48("70444") ? "" : (stryCov_9fa48("70444"), 'updated_at');
const PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE = stryMutAct_9fa48("70445") ? "" : (stryCov_9fa48("70445"), 'raft_role');
const PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID = stryMutAct_9fa48("70446") ? "" : (stryCov_9fa48("70446"), 'node_id');
const PRIORITY_RECOVERY_SERVICE_FIELD_STATUS = stryMutAct_9fa48("70447") ? "" : (stryCov_9fa48("70447"), 'status');
const PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID = stryMutAct_9fa48("70448") ? "" : (stryCov_9fa48("70448"), 'partition_id');
const PRIORITY_RECOVERY_STATUS_ACTIVE = stryMutAct_9fa48("70449") ? "" : (stryCov_9fa48("70449"), 'active');
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE = stryMutAct_9fa48("70450") ? "" : (stryCov_9fa48("70450"), 'not_control_plane_recovery_eligible');
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY = stryMutAct_9fa48("70451") ? "" : (stryCov_9fa48("70451"), 'recovery_eligible_not_repair_eligible');
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS = stryMutAct_9fa48("70452") ? "" : (stryCov_9fa48("70452"), 'readiness_unknown');
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP = stryMutAct_9fa48("70453") ? "" : (stryCov_9fa48("70453"), 'priority_spread_gap');
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING = stryMutAct_9fa48("70454") ? "" : (stryCov_9fa48("70454"), 'priority_partition_missing');
const PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED = stryMutAct_9fa48("70455") ? "" : (stryCov_9fa48("70455"), 'recovery_eligible_projection_included');
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED = stryMutAct_9fa48("70456") ? "" : (stryCov_9fa48("70456"), 'readiness_projection_excluded');
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY = stryMutAct_9fa48("70457") ? "" : (stryCov_9fa48("70457"), 'cluster_member_unhealthy');
const PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET = new Set(REPLICA_OPERATION_TERMINAL_STATUSES.map(stryMutAct_9fa48("70458") ? () => undefined : (stryCov_9fa48("70458"), status => stryMutAct_9fa48("70459") ? String(status || '').toUpperCase() : (stryCov_9fa48("70459"), String(stryMutAct_9fa48("70462") ? status && '' : stryMutAct_9fa48("70461") ? false : stryMutAct_9fa48("70460") ? true : (stryCov_9fa48("70460", "70461", "70462"), status || (stryMutAct_9fa48("70463") ? "Stryker was here!" : (stryCov_9fa48("70463"), '')))).toLowerCase()))));
const PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE = Object.freeze(stryMutAct_9fa48("70464") ? {} : (stryCov_9fa48("70464"), {
  WORKFLOW_ADMISSION: stryMutAct_9fa48("70465") ? "" : (stryCov_9fa48("70465"), 'workflow_admission'),
  PUBLICATION_MEMBERSHIP: stryMutAct_9fa48("70466") ? "" : (stryCov_9fa48("70466"), 'publication_membership'),
  PUBLICATION_RECOVERY_PROJECTION: stryMutAct_9fa48("70467") ? "" : (stryCov_9fa48("70467"), 'publication_recovery_projection'),
  PRIORITY_SUMMARY_READY_ELIGIBLE: stryMutAct_9fa48("70468") ? "" : (stryCov_9fa48("70468"), 'priority_summary_ready_eligible'),
  UNKNOWN: stryMutAct_9fa48("70469") ? "" : (stryCov_9fa48("70469"), 'unknown')
}));
const PRIORITY_RECOVERY_ADMISSION_SOURCE = Object.freeze(stryMutAct_9fa48("70470") ? {} : (stryCov_9fa48("70470"), {
  PUBLICATION_SUMMARY: stryMutAct_9fa48("70471") ? "" : (stryCov_9fa48("70471"), 'publication_summary'),
  STALE_ACTIVE_GRACE: stryMutAct_9fa48("70472") ? "" : (stryCov_9fa48("70472"), 'stale_active_grace'),
  INACTIVE_DEFAULT: stryMutAct_9fa48("70473") ? "" : (stryCov_9fa48("70473"), 'inactive_default')
}));
const PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS = Object.freeze(stryMutAct_9fa48("70474") ? {} : (stryCov_9fa48("70474"), {
  NON_PRIORITY: stryMutAct_9fa48("70475") ? "" : (stryCov_9fa48("70475"), 'non_priority'),
  ORDINARY_PRIORITY: stryMutAct_9fa48("70476") ? "" : (stryCov_9fa48("70476"), 'ordinary_priority'),
  EMERGENCY_PRIORITY: stryMutAct_9fa48("70477") ? "" : (stryCov_9fa48("70477"), 'emergency_priority')
}));
const PRIORITY_RECOVERY_ADMISSION_DECISION_REASON = Object.freeze(stryMutAct_9fa48("70478") ? {} : (stryCov_9fa48("70478"), {
  ADMITTED: stryMutAct_9fa48("70479") ? "" : (stryCov_9fa48("70479"), 'admitted'),
  NOT_PRIORITY_PARTITION: stryMutAct_9fa48("70480") ? "" : (stryCov_9fa48("70480"), 'not_priority_partition'),
  PRIORITY_LANE_DISABLED: stryMutAct_9fa48("70481") ? "" : (stryCov_9fa48("70481"), 'priority_lane_disabled'),
  ORDINARY_PRIORITY_LANE_EXHAUSTED: stryMutAct_9fa48("70482") ? "" : (stryCov_9fa48("70482"), 'ordinary_priority_lane_exhausted'),
  EMERGENCY_PRIORITY_LANE_EXHAUSTED: stryMutAct_9fa48("70483") ? "" : (stryCov_9fa48("70483"), 'emergency_priority_lane_exhausted')
}));
const DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS = stryMutAct_9fa48("70484") ? TIME_MS.SECOND / 15 : (stryCov_9fa48("70484"), TIME_MS.SECOND * 15);
function normalizePriorityRecoveryInteger(value) {
  if (stryMutAct_9fa48("70485")) {
    {}
  } else {
    stryCov_9fa48("70485");
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? Math.floor(parsedValue) : null;
  }
}
function normalizePriorityRecoveryStringList(values = stryMutAct_9fa48("70486") ? ["Stryker was here"] : (stryCov_9fa48("70486"), [])) {
  if (stryMutAct_9fa48("70487")) {
    {}
  } else {
    stryCov_9fa48("70487");
    return stryMutAct_9fa48("70488") ? [...new Set((Array.isArray(values) ? values : []).map(value => String(value || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).trim()).filter(value => value.length > NUM.ZERO))] : (stryCov_9fa48("70488"), (stryMutAct_9fa48("70489") ? [] : (stryCov_9fa48("70489"), [...new Set(stryMutAct_9fa48("70490") ? (Array.isArray(values) ? values : []).map(value => String(value || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).trim()) : (stryCov_9fa48("70490"), (Array.isArray(values) ? values : stryMutAct_9fa48("70491") ? ["Stryker was here"] : (stryCov_9fa48("70491"), [])).map(stryMutAct_9fa48("70492") ? () => undefined : (stryCov_9fa48("70492"), value => stryMutAct_9fa48("70493") ? String(value || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE) : (stryCov_9fa48("70493"), String(stryMutAct_9fa48("70496") ? value && PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("70495") ? false : stryMutAct_9fa48("70494") ? true : (stryCov_9fa48("70494", "70495", "70496"), value || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE)).trim()))).filter(stryMutAct_9fa48("70497") ? () => undefined : (stryCov_9fa48("70497"), value => stryMutAct_9fa48("70501") ? value.length <= NUM.ZERO : stryMutAct_9fa48("70500") ? value.length >= NUM.ZERO : stryMutAct_9fa48("70499") ? false : stryMutAct_9fa48("70498") ? true : (stryCov_9fa48("70498", "70499", "70500", "70501"), value.length > NUM.ZERO)))))])).sort());
  }
}
function readFirstStringField(row, ...keys) {
  if (stryMutAct_9fa48("70502")) {
    {}
  } else {
    stryCov_9fa48("70502");
    for (const key of keys) {
      if (stryMutAct_9fa48("70503")) {
        {}
      } else {
        stryCov_9fa48("70503");
        const value = stryMutAct_9fa48("70504") ? row[key] : (stryCov_9fa48("70504"), row?.[key]);
        if (stryMutAct_9fa48("70507") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("70506") ? false : stryMutAct_9fa48("70505") ? true : (stryCov_9fa48("70505", "70506", "70507"), typeof value === TYPEOF.STRING)) {
          if (stryMutAct_9fa48("70508")) {
            {}
          } else {
            stryCov_9fa48("70508");
            const trimmedValue = stryMutAct_9fa48("70509") ? value : (stryCov_9fa48("70509"), value.trim());
            if (stryMutAct_9fa48("70513") ? trimmedValue.length <= NUM.ZERO : stryMutAct_9fa48("70512") ? trimmedValue.length >= NUM.ZERO : stryMutAct_9fa48("70511") ? false : stryMutAct_9fa48("70510") ? true : (stryCov_9fa48("70510", "70511", "70512", "70513"), trimmedValue.length > NUM.ZERO)) {
              if (stryMutAct_9fa48("70514")) {
                {}
              } else {
                stryCov_9fa48("70514");
                return trimmedValue;
              }
            }
          }
        }
      }
    }
    return null;
  }
}
function inferPriorityRecoveryTableNameFromPartitionId(partitionId) {
  if (stryMutAct_9fa48("70515")) {
    {}
  } else {
    stryCov_9fa48("70515");
    const normalizedPartitionId = String(stryMutAct_9fa48("70518") ? partitionId && '' : stryMutAct_9fa48("70517") ? false : stryMutAct_9fa48("70516") ? true : (stryCov_9fa48("70516", "70517", "70518"), partitionId || (stryMutAct_9fa48("70519") ? "Stryker was here!" : (stryCov_9fa48("70519"), ''))));
    if (stryMutAct_9fa48("70522") ? normalizedPartitionId.length !== NUM.ZERO : stryMutAct_9fa48("70521") ? false : stryMutAct_9fa48("70520") ? true : (stryCov_9fa48("70520", "70521", "70522"), normalizedPartitionId.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("70523")) {
        {}
      } else {
        stryCov_9fa48("70523");
        return null;
      }
    }
    const partitionSuffixIndex = normalizedPartitionId.lastIndexOf(stryMutAct_9fa48("70524") ? "" : (stryCov_9fa48("70524"), '-p'));
    if (stryMutAct_9fa48("70528") ? partitionSuffixIndex > NUM.ZERO : stryMutAct_9fa48("70527") ? partitionSuffixIndex < NUM.ZERO : stryMutAct_9fa48("70526") ? false : stryMutAct_9fa48("70525") ? true : (stryCov_9fa48("70525", "70526", "70527", "70528"), partitionSuffixIndex <= NUM.ZERO)) {
      if (stryMutAct_9fa48("70529")) {
        {}
      } else {
        stryCov_9fa48("70529");
        return normalizedPartitionId;
      }
    }
    const suffix = stryMutAct_9fa48("70530") ? normalizedPartitionId : (stryCov_9fa48("70530"), normalizedPartitionId.slice(stryMutAct_9fa48("70531") ? partitionSuffixIndex - 2 : (stryCov_9fa48("70531"), partitionSuffixIndex + 2)));
    if (stryMutAct_9fa48("70534") ? false : stryMutAct_9fa48("70533") ? true : stryMutAct_9fa48("70532") ? /^\d+$/.test(suffix) : (stryCov_9fa48("70532", "70533", "70534"), !(stryMutAct_9fa48("70538") ? /^\D+$/ : stryMutAct_9fa48("70537") ? /^\d$/ : stryMutAct_9fa48("70536") ? /^\d+/ : stryMutAct_9fa48("70535") ? /\d+$/ : (stryCov_9fa48("70535", "70536", "70537", "70538"), /^\d+$/)).test(suffix))) {
      if (stryMutAct_9fa48("70539")) {
        {}
      } else {
        stryCov_9fa48("70539");
        return normalizedPartitionId;
      }
    }
    return stryMutAct_9fa48("70540") ? normalizedPartitionId : (stryCov_9fa48("70540"), normalizedPartitionId.slice(NUM.ZERO, partitionSuffixIndex));
  }
}
function buildPriorityRecoveryCorrelationKey(partitionId, epoch, operationId) {
  if (stryMutAct_9fa48("70541")) {
    {}
  } else {
    stryCov_9fa48("70541");
    const normalizedPartitionId = stryMutAct_9fa48("70542") ? String(partitionId || '') : (stryCov_9fa48("70542"), String(stryMutAct_9fa48("70545") ? partitionId && '' : stryMutAct_9fa48("70544") ? false : stryMutAct_9fa48("70543") ? true : (stryCov_9fa48("70543", "70544", "70545"), partitionId || (stryMutAct_9fa48("70546") ? "Stryker was here!" : (stryCov_9fa48("70546"), '')))).trim());
    if (stryMutAct_9fa48("70549") ? normalizedPartitionId.length !== NUM.ZERO : stryMutAct_9fa48("70548") ? false : stryMutAct_9fa48("70547") ? true : (stryCov_9fa48("70547", "70548", "70549"), normalizedPartitionId.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("70550")) {
        {}
      } else {
        stryCov_9fa48("70550");
        return null;
      }
    }
    const normalizedEpoch = Number.isInteger(epoch) ? String(epoch) : PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
    const normalizedOperationId = (stryMutAct_9fa48("70553") ? typeof operationId === TYPEOF.STRING || operationId.length > NUM.ZERO : stryMutAct_9fa48("70552") ? false : stryMutAct_9fa48("70551") ? true : (stryCov_9fa48("70551", "70552", "70553"), (stryMutAct_9fa48("70555") ? typeof operationId !== TYPEOF.STRING : stryMutAct_9fa48("70554") ? true : (stryCov_9fa48("70554", "70555"), typeof operationId === TYPEOF.STRING)) && (stryMutAct_9fa48("70558") ? operationId.length <= NUM.ZERO : stryMutAct_9fa48("70557") ? operationId.length >= NUM.ZERO : stryMutAct_9fa48("70556") ? true : (stryCov_9fa48("70556", "70557", "70558"), operationId.length > NUM.ZERO)))) ? operationId : PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN;
    return (stryMutAct_9fa48("70559") ? [] : (stryCov_9fa48("70559"), [normalizedPartitionId, normalizedEpoch, normalizedOperationId])).join(PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR);
  }
}
function buildPriorityRecoverySemanticPartitionSetMap() {
  if (stryMutAct_9fa48("70560")) {
    {}
  } else {
    stryCov_9fa48("70560");
    const partitionIdsBySemanticState = {};
    for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
      if (stryMutAct_9fa48("70561")) {
        {}
      } else {
        stryCov_9fa48("70561");
        partitionIdsBySemanticState[semanticState] = new Set();
      }
    }
    return partitionIdsBySemanticState;
  }
}
function isPriorityRecoverySpreadSatisfyingOperationContext(operationContext, options = {}) {
  if (stryMutAct_9fa48("70562")) {
    {}
  } else {
    stryCov_9fa48("70562");
    if (stryMutAct_9fa48("70565") ? false : stryMutAct_9fa48("70564") ? true : stryMutAct_9fa48("70563") ? isReplaceRemoveDispatchPhase(operationContext) : (stryCov_9fa48("70563", "70564", "70565"), !isReplaceRemoveDispatchPhase(operationContext))) {
      if (stryMutAct_9fa48("70566")) {
        {}
      } else {
        stryCov_9fa48("70566");
        return stryMutAct_9fa48("70567") ? true : (stryCov_9fa48("70567"), false);
      }
    }
    const targetNodeId = stryMutAct_9fa48("70568") ? String(operationContext?.targetNodeId || '') : (stryCov_9fa48("70568"), String(stryMutAct_9fa48("70571") ? operationContext?.targetNodeId && '' : stryMutAct_9fa48("70570") ? false : stryMutAct_9fa48("70569") ? true : (stryCov_9fa48("70569", "70570", "70571"), (stryMutAct_9fa48("70572") ? operationContext.targetNodeId : (stryCov_9fa48("70572"), operationContext?.targetNodeId)) || (stryMutAct_9fa48("70573") ? "Stryker was here!" : (stryCov_9fa48("70573"), '')))).trim());
    if (stryMutAct_9fa48("70576") ? targetNodeId.length !== NUM.ZERO : stryMutAct_9fa48("70575") ? false : stryMutAct_9fa48("70574") ? true : (stryCov_9fa48("70574", "70575", "70576"), targetNodeId.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("70577")) {
        {}
      } else {
        stryCov_9fa48("70577");
        return stryMutAct_9fa48("70578") ? true : (stryCov_9fa48("70578"), false);
      }
    }
    const eligibleTargetNodeIds = new Set(normalizePriorityRecoveryStringList(options.eligibleTargetNodeIds));
    if (stryMutAct_9fa48("70581") ? eligibleTargetNodeIds.size !== NUM.ZERO : stryMutAct_9fa48("70580") ? false : stryMutAct_9fa48("70579") ? true : (stryCov_9fa48("70579", "70580", "70581"), eligibleTargetNodeIds.size === NUM.ZERO)) {
      if (stryMutAct_9fa48("70582")) {
        {}
      } else {
        stryCov_9fa48("70582");
        return stryMutAct_9fa48("70583") ? true : (stryCov_9fa48("70583"), false);
      }
    }
    return eligibleTargetNodeIds.has(targetNodeId);
  }
}
function buildPriorityRecoverySpreadCompletion(options = {}) {
  if (stryMutAct_9fa48("70584")) {
    {}
  } else {
    stryCov_9fa48("70584");
    const activeOperationContexts = Array.isArray(options.activeOperationContexts) ? options.activeOperationContexts : stryMutAct_9fa48("70585") ? ["Stryker was here"] : (stryCov_9fa48("70585"), []);
    const eligibleTargetNodeIds = normalizePriorityRecoveryStringList(options.eligibleTargetNodeIds);
    const satisfyingOperationIds = stryMutAct_9fa48("70586") ? ["Stryker was here"] : (stryCov_9fa48("70586"), []);
    const blockingOperationIds = stryMutAct_9fa48("70587") ? ["Stryker was here"] : (stryCov_9fa48("70587"), []);
    for (const operationContext of activeOperationContexts) {
      if (stryMutAct_9fa48("70588")) {
        {}
      } else {
        stryCov_9fa48("70588");
        const operationId = stryMutAct_9fa48("70589") ? String(operationContext?.operationId || '') : (stryCov_9fa48("70589"), String(stryMutAct_9fa48("70592") ? operationContext?.operationId && '' : stryMutAct_9fa48("70591") ? false : stryMutAct_9fa48("70590") ? true : (stryCov_9fa48("70590", "70591", "70592"), (stryMutAct_9fa48("70593") ? operationContext.operationId : (stryCov_9fa48("70593"), operationContext?.operationId)) || (stryMutAct_9fa48("70594") ? "Stryker was here!" : (stryCov_9fa48("70594"), '')))).trim());
        if (stryMutAct_9fa48("70597") ? operationId.length !== NUM.ZERO : stryMutAct_9fa48("70596") ? false : stryMutAct_9fa48("70595") ? true : (stryCov_9fa48("70595", "70596", "70597"), operationId.length === NUM.ZERO)) {
          if (stryMutAct_9fa48("70598")) {
            {}
          } else {
            stryCov_9fa48("70598");
            continue;
          }
        }
        if (stryMutAct_9fa48("70600") ? false : stryMutAct_9fa48("70599") ? true : (stryCov_9fa48("70599", "70600"), isPriorityRecoverySpreadSatisfyingOperationContext(operationContext, stryMutAct_9fa48("70601") ? {} : (stryCov_9fa48("70601"), {
          eligibleTargetNodeIds
        })))) {
          if (stryMutAct_9fa48("70602")) {
            {}
          } else {
            stryCov_9fa48("70602");
            satisfyingOperationIds.push(operationId);
            continue;
          }
        }
        blockingOperationIds.push(operationId);
      }
    }
    if (stryMutAct_9fa48("70605") ? options.plannerReady !== true : stryMutAct_9fa48("70604") ? false : stryMutAct_9fa48("70603") ? true : (stryCov_9fa48("70603", "70604", "70605"), options.plannerReady === (stryMutAct_9fa48("70606") ? false : (stryCov_9fa48("70606"), true)))) {
      if (stryMutAct_9fa48("70607")) {
        {}
      } else {
        stryCov_9fa48("70607");
        return Object.freeze(stryMutAct_9fa48("70608") ? {} : (stryCov_9fa48("70608"), {
          satisfied: stryMutAct_9fa48("70609") ? false : (stryCov_9fa48("70609"), true),
          reasonCode: PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.PLANNER_READY,
          satisfyingOperationIds: Object.freeze(stryMutAct_9fa48("70610") ? [] : (stryCov_9fa48("70610"), [...satisfyingOperationIds])),
          satisfyingOperationCount: satisfyingOperationIds.length,
          blockingOperationIds: Object.freeze(stryMutAct_9fa48("70611") ? [] : (stryCov_9fa48("70611"), [...blockingOperationIds])),
          blockingOperationCount: blockingOperationIds.length
        }));
      }
    }
    if (stryMutAct_9fa48("70615") ? satisfyingOperationIds.length <= NUM.ZERO : stryMutAct_9fa48("70614") ? satisfyingOperationIds.length >= NUM.ZERO : stryMutAct_9fa48("70613") ? false : stryMutAct_9fa48("70612") ? true : (stryCov_9fa48("70612", "70613", "70614", "70615"), satisfyingOperationIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("70616")) {
        {}
      } else {
        stryCov_9fa48("70616");
        return Object.freeze(stryMutAct_9fa48("70617") ? {} : (stryCov_9fa48("70617"), {
          satisfied: stryMutAct_9fa48("70618") ? false : (stryCov_9fa48("70618"), true),
          reasonCode: PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.REPLACE_REMOVE_DISPATCH_PHASE_ON_ELIGIBLE_TARGET,
          satisfyingOperationIds: Object.freeze(stryMutAct_9fa48("70619") ? [] : (stryCov_9fa48("70619"), [...satisfyingOperationIds])),
          satisfyingOperationCount: satisfyingOperationIds.length,
          blockingOperationIds: Object.freeze(stryMutAct_9fa48("70620") ? [] : (stryCov_9fa48("70620"), [...blockingOperationIds])),
          blockingOperationCount: blockingOperationIds.length
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("70621") ? {} : (stryCov_9fa48("70621"), {
      satisfied: stryMutAct_9fa48("70622") ? true : (stryCov_9fa48("70622"), false),
      reasonCode: (stryMutAct_9fa48("70626") ? blockingOperationIds.length <= NUM.ZERO : stryMutAct_9fa48("70625") ? blockingOperationIds.length >= NUM.ZERO : stryMutAct_9fa48("70624") ? false : stryMutAct_9fa48("70623") ? true : (stryCov_9fa48("70623", "70624", "70625", "70626"), blockingOperationIds.length > NUM.ZERO)) ? PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.ACTIVE_OPERATION_STILL_BLOCKS_SPREAD : PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.UNSATISFIED,
      satisfyingOperationIds: Object.freeze(stryMutAct_9fa48("70627") ? ["Stryker was here"] : (stryCov_9fa48("70627"), [])),
      satisfyingOperationCount: NUM.ZERO,
      blockingOperationIds: Object.freeze(stryMutAct_9fa48("70628") ? [] : (stryCov_9fa48("70628"), [...blockingOperationIds])),
      blockingOperationCount: blockingOperationIds.length
    }));
  }
}
function resolvePriorityRecoverySemanticState(options = {}) {
  if (stryMutAct_9fa48("70629")) {
    {}
  } else {
    stryCov_9fa48("70629");
    const blockerReasons = normalizePriorityRecoveryStringList(options.blockerReasons);
    for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
      if (stryMutAct_9fa48("70630")) {
        {}
      } else {
        stryCov_9fa48("70630");
        if (stryMutAct_9fa48("70633") ? false : stryMutAct_9fa48("70632") ? true : stryMutAct_9fa48("70631") ? blockerReasons.includes(blockerReason) : (stryCov_9fa48("70631", "70632", "70633"), !blockerReasons.includes(blockerReason))) {
          if (stryMutAct_9fa48("70634")) {
            {}
          } else {
            stryCov_9fa48("70634");
            continue;
          }
        }
        return stryMutAct_9fa48("70637") ? PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] && PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED : stryMutAct_9fa48("70636") ? false : stryMutAct_9fa48("70635") ? true : (stryCov_9fa48("70635", "70636", "70637"), PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] || PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED);
      }
    }
    if (stryMutAct_9fa48("70640") ? options.spreadCompletion?.satisfied === true || options.hasActiveOperationContexts === true : stryMutAct_9fa48("70639") ? false : stryMutAct_9fa48("70638") ? true : (stryCov_9fa48("70638", "70639", "70640"), (stryMutAct_9fa48("70642") ? options.spreadCompletion?.satisfied !== true : stryMutAct_9fa48("70641") ? true : (stryCov_9fa48("70641", "70642"), (stryMutAct_9fa48("70643") ? options.spreadCompletion.satisfied : (stryCov_9fa48("70643"), options.spreadCompletion?.satisfied)) === (stryMutAct_9fa48("70644") ? false : (stryCov_9fa48("70644"), true)))) && (stryMutAct_9fa48("70646") ? options.hasActiveOperationContexts !== true : stryMutAct_9fa48("70645") ? true : (stryCov_9fa48("70645", "70646"), options.hasActiveOperationContexts === (stryMutAct_9fa48("70647") ? false : (stryCov_9fa48("70647"), true)))))) {
      if (stryMutAct_9fa48("70648")) {
        {}
      } else {
        stryCov_9fa48("70648");
        return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
      }
    }
    if (stryMutAct_9fa48("70651") ? options.plannerReady !== true : stryMutAct_9fa48("70650") ? false : stryMutAct_9fa48("70649") ? true : (stryCov_9fa48("70649", "70650", "70651"), options.plannerReady === (stryMutAct_9fa48("70652") ? false : (stryCov_9fa48("70652"), true)))) {
      if (stryMutAct_9fa48("70653")) {
        {}
      } else {
        stryCov_9fa48("70653");
        return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
      }
    }
    if (stryMutAct_9fa48("70656") ? options.spreadCompletion?.satisfied !== true : stryMutAct_9fa48("70655") ? false : stryMutAct_9fa48("70654") ? true : (stryCov_9fa48("70654", "70655", "70656"), (stryMutAct_9fa48("70657") ? options.spreadCompletion.satisfied : (stryCov_9fa48("70657"), options.spreadCompletion?.satisfied)) === (stryMutAct_9fa48("70658") ? false : (stryCov_9fa48("70658"), true)))) {
      if (stryMutAct_9fa48("70659")) {
        {}
      } else {
        stryCov_9fa48("70659");
        return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
      }
    }
    if (stryMutAct_9fa48("70662") ? options.hasActiveOperationContexts !== true : stryMutAct_9fa48("70661") ? false : stryMutAct_9fa48("70660") ? true : (stryCov_9fa48("70660", "70661", "70662"), options.hasActiveOperationContexts === (stryMutAct_9fa48("70663") ? false : (stryCov_9fa48("70663"), true)))) {
      if (stryMutAct_9fa48("70664")) {
        {}
      } else {
        stryCov_9fa48("70664");
        return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
      }
    }
    return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
  }
}
function resolvePriorityRecoveryReasonCodesFromReadiness(readinessEntry) {
  if (stryMutAct_9fa48("70665")) {
    {}
  } else {
    stryCov_9fa48("70665");
    const reasons = Array.isArray(stryMutAct_9fa48("70666") ? readinessEntry.reasons : (stryCov_9fa48("70666"), readinessEntry?.reasons)) ? readinessEntry.reasons : stryMutAct_9fa48("70667") ? ["Stryker was here"] : (stryCov_9fa48("70667"), []);
    return normalizePriorityRecoveryStringList(reasons.map(stryMutAct_9fa48("70668") ? () => undefined : (stryCov_9fa48("70668"), reason => stryMutAct_9fa48("70669") ? String(reason?.code || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE) : (stryCov_9fa48("70669"), String(stryMutAct_9fa48("70672") ? reason?.code && PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("70671") ? false : stryMutAct_9fa48("70670") ? true : (stryCov_9fa48("70670", "70671", "70672"), (stryMutAct_9fa48("70673") ? reason.code : (stryCov_9fa48("70673"), reason?.code)) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE)).trim()))));
  }
}
function buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary) {
  if (stryMutAct_9fa48("70674")) {
    {}
  } else {
    stryCov_9fa48("70674");
    const normalizedSummary = (stryMutAct_9fa48("70677") ? priorityPartitionSummary || typeof priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("70676") ? false : stryMutAct_9fa48("70675") ? true : (stryCov_9fa48("70675", "70676", "70677"), priorityPartitionSummary && (stryMutAct_9fa48("70679") ? typeof priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("70678") ? true : (stryCov_9fa48("70678", "70679"), typeof priorityPartitionSummary === TYPEOF.OBJECT)))) ? priorityPartitionSummary : null;
    const blockedPartitions = Array.isArray(stryMutAct_9fa48("70680") ? normalizedSummary.blockedPartitions : (stryCov_9fa48("70680"), normalizedSummary?.blockedPartitions)) ? normalizedSummary.blockedPartitions : stryMutAct_9fa48("70681") ? ["Stryker was here"] : (stryCov_9fa48("70681"), []);
    const missingPartitionIds = normalizePriorityRecoveryStringList(stryMutAct_9fa48("70682") ? normalizedSummary.missingPartitionIds : (stryCov_9fa48("70682"), normalizedSummary?.missingPartitionIds));
    const plannerByPartitionId = {};
    for (const partition of blockedPartitions) {
      if (stryMutAct_9fa48("70683")) {
        {}
      } else {
        stryCov_9fa48("70683");
        const partitionId = stryMutAct_9fa48("70684") ? String(partition?.partitionId || '') : (stryCov_9fa48("70684"), String(stryMutAct_9fa48("70687") ? partition?.partitionId && '' : stryMutAct_9fa48("70686") ? false : stryMutAct_9fa48("70685") ? true : (stryCov_9fa48("70685", "70686", "70687"), (stryMutAct_9fa48("70688") ? partition.partitionId : (stryCov_9fa48("70688"), partition?.partitionId)) || (stryMutAct_9fa48("70689") ? "Stryker was here!" : (stryCov_9fa48("70689"), '')))).trim());
        if (stryMutAct_9fa48("70692") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("70691") ? false : stryMutAct_9fa48("70690") ? true : (stryCov_9fa48("70690", "70691", "70692"), partitionId.length === NUM.ZERO)) {
          if (stryMutAct_9fa48("70693")) {
            {}
          } else {
            stryCov_9fa48("70693");
            continue;
          }
        }
        const spreadGap = stryMutAct_9fa48("70694") ? Math.min(NUM.ZERO, normalizePriorityRecoveryInteger(partition?.spreadGap) || NUM.ZERO) : (stryCov_9fa48("70694"), Math.max(NUM.ZERO, stryMutAct_9fa48("70697") ? normalizePriorityRecoveryInteger(partition?.spreadGap) && NUM.ZERO : stryMutAct_9fa48("70696") ? false : stryMutAct_9fa48("70695") ? true : (stryCov_9fa48("70695", "70696", "70697"), normalizePriorityRecoveryInteger(stryMutAct_9fa48("70698") ? partition.spreadGap : (stryCov_9fa48("70698"), partition?.spreadGap)) || NUM.ZERO)));
        plannerByPartitionId[partitionId] = stryMutAct_9fa48("70699") ? {} : (stryCov_9fa48("70699"), {
          partitionId,
          requiredDistinctNodeCount: normalizePriorityRecoveryInteger(stryMutAct_9fa48("70700") ? partition.requiredDistinctNodeCount : (stryCov_9fa48("70700"), partition?.requiredDistinctNodeCount)),
          readyDistinctNodeCount: normalizePriorityRecoveryInteger(stryMutAct_9fa48("70701") ? partition.readyDistinctNodeCount : (stryCov_9fa48("70701"), partition?.readyDistinctNodeCount)),
          spreadGap,
          ready: stryMutAct_9fa48("70704") ? spreadGap !== NUM.ZERO : stryMutAct_9fa48("70703") ? false : stryMutAct_9fa48("70702") ? true : (stryCov_9fa48("70702", "70703", "70704"), spreadGap === NUM.ZERO),
          reasons: (stryMutAct_9fa48("70708") ? spreadGap <= NUM.ZERO : stryMutAct_9fa48("70707") ? spreadGap >= NUM.ZERO : stryMutAct_9fa48("70706") ? false : stryMutAct_9fa48("70705") ? true : (stryCov_9fa48("70705", "70706", "70707", "70708"), spreadGap > NUM.ZERO)) ? stryMutAct_9fa48("70709") ? [] : (stryCov_9fa48("70709"), [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP]) : stryMutAct_9fa48("70710") ? ["Stryker was here"] : (stryCov_9fa48("70710"), [])
        });
      }
    }
    for (const partitionId of missingPartitionIds) {
      if (stryMutAct_9fa48("70711")) {
        {}
      } else {
        stryCov_9fa48("70711");
        if (stryMutAct_9fa48("70713") ? false : stryMutAct_9fa48("70712") ? true : (stryCov_9fa48("70712", "70713"), plannerByPartitionId[partitionId])) {
          if (stryMutAct_9fa48("70714")) {
            {}
          } else {
            stryCov_9fa48("70714");
            if (stryMutAct_9fa48("70717") ? false : stryMutAct_9fa48("70716") ? true : stryMutAct_9fa48("70715") ? plannerByPartitionId[partitionId].reasons.includes(PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING) : (stryCov_9fa48("70715", "70716", "70717"), !plannerByPartitionId[partitionId].reasons.includes(PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING))) {
              if (stryMutAct_9fa48("70718")) {
                {}
              } else {
                stryCov_9fa48("70718");
                plannerByPartitionId[partitionId].reasons.push(PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING);
              }
            }
            continue;
          }
        }
        plannerByPartitionId[partitionId] = stryMutAct_9fa48("70719") ? {} : (stryCov_9fa48("70719"), {
          partitionId,
          requiredDistinctNodeCount: normalizePriorityRecoveryInteger(stryMutAct_9fa48("70720") ? normalizedSummary.requiredDistinctNodeCount : (stryCov_9fa48("70720"), normalizedSummary?.requiredDistinctNodeCount)),
          readyDistinctNodeCount: NUM.ZERO,
          spreadGap: stryMutAct_9fa48("70723") ? normalizePriorityRecoveryInteger(normalizedSummary?.requiredDistinctNodeCount) && NUM.ONE : stryMutAct_9fa48("70722") ? false : stryMutAct_9fa48("70721") ? true : (stryCov_9fa48("70721", "70722", "70723"), normalizePriorityRecoveryInteger(stryMutAct_9fa48("70724") ? normalizedSummary.requiredDistinctNodeCount : (stryCov_9fa48("70724"), normalizedSummary?.requiredDistinctNodeCount)) || NUM.ONE),
          ready: stryMutAct_9fa48("70725") ? true : (stryCov_9fa48("70725"), false),
          reasons: stryMutAct_9fa48("70726") ? [] : (stryCov_9fa48("70726"), [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING])
        });
      }
    }
    return plannerByPartitionId;
  }
}
function buildUnknownPriorityRecoveryPlanner(partitionId) {
  if (stryMutAct_9fa48("70727")) {
    {}
  } else {
    stryCov_9fa48("70727");
    return stryMutAct_9fa48("70728") ? {} : (stryCov_9fa48("70728"), {
      partitionId,
      requiredDistinctNodeCount: null,
      readyDistinctNodeCount: null,
      spreadGap: null,
      ready: null,
      reasons: stryMutAct_9fa48("70729") ? ["Stryker was here"] : (stryCov_9fa48("70729"), [])
    });
  }
}
function buildPriorityRecoveryPlannerEntry(partitionId, priorityPartitionSummary, plannerByPartitionId = null) {
  if (stryMutAct_9fa48("70730")) {
    {}
  } else {
    stryCov_9fa48("70730");
    const normalizedPartitionId = stryMutAct_9fa48("70731") ? String(partitionId || '') : (stryCov_9fa48("70731"), String(stryMutAct_9fa48("70734") ? partitionId && '' : stryMutAct_9fa48("70733") ? false : stryMutAct_9fa48("70732") ? true : (stryCov_9fa48("70732", "70733", "70734"), partitionId || (stryMutAct_9fa48("70735") ? "Stryker was here!" : (stryCov_9fa48("70735"), '')))).trim());
    if (stryMutAct_9fa48("70738") ? normalizedPartitionId.length !== NUM.ZERO : stryMutAct_9fa48("70737") ? false : stryMutAct_9fa48("70736") ? true : (stryCov_9fa48("70736", "70737", "70738"), normalizedPartitionId.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("70739")) {
        {}
      } else {
        stryCov_9fa48("70739");
        return buildUnknownPriorityRecoveryPlanner(normalizedPartitionId);
      }
    }
    const normalizedSummary = (stryMutAct_9fa48("70742") ? priorityPartitionSummary || typeof priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("70741") ? false : stryMutAct_9fa48("70740") ? true : (stryCov_9fa48("70740", "70741", "70742"), priorityPartitionSummary && (stryMutAct_9fa48("70744") ? typeof priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("70743") ? true : (stryCov_9fa48("70743", "70744"), typeof priorityPartitionSummary === TYPEOF.OBJECT)))) ? priorityPartitionSummary : null;
    const plannerById = (stryMutAct_9fa48("70747") ? plannerByPartitionId || typeof plannerByPartitionId === TYPEOF.OBJECT : stryMutAct_9fa48("70746") ? false : stryMutAct_9fa48("70745") ? true : (stryCov_9fa48("70745", "70746", "70747"), plannerByPartitionId && (stryMutAct_9fa48("70749") ? typeof plannerByPartitionId !== TYPEOF.OBJECT : stryMutAct_9fa48("70748") ? true : (stryCov_9fa48("70748", "70749"), typeof plannerByPartitionId === TYPEOF.OBJECT)))) ? plannerByPartitionId : buildPriorityRecoveryPlannerByPartitionId(normalizedSummary);
    if (stryMutAct_9fa48("70751") ? false : stryMutAct_9fa48("70750") ? true : (stryCov_9fa48("70750", "70751"), plannerById[normalizedPartitionId])) {
      if (stryMutAct_9fa48("70752")) {
        {}
      } else {
        stryCov_9fa48("70752");
        return plannerById[normalizedPartitionId];
      }
    }
    if (stryMutAct_9fa48("70755") ? false : stryMutAct_9fa48("70754") ? true : stryMutAct_9fa48("70753") ? normalizedSummary : (stryCov_9fa48("70753", "70754", "70755"), !normalizedSummary)) {
      if (stryMutAct_9fa48("70756")) {
        {}
      } else {
        stryCov_9fa48("70756");
        return buildUnknownPriorityRecoveryPlanner(normalizedPartitionId);
      }
    }
    const blockedPartitionIds = buildPriorityRecoveryBlockedPartitionIds(normalizedSummary);
    if (stryMutAct_9fa48("70759") ? hasPriorityRecoverySpreadGap(normalizedSummary) || blockedPartitionIds.length === NUM.ZERO : stryMutAct_9fa48("70758") ? false : stryMutAct_9fa48("70757") ? true : (stryCov_9fa48("70757", "70758", "70759"), hasPriorityRecoverySpreadGap(normalizedSummary) && (stryMutAct_9fa48("70761") ? blockedPartitionIds.length !== NUM.ZERO : stryMutAct_9fa48("70760") ? true : (stryCov_9fa48("70760", "70761"), blockedPartitionIds.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("70762")) {
        {}
      } else {
        stryCov_9fa48("70762");
        return buildUnknownPriorityRecoveryPlanner(normalizedPartitionId);
      }
    }
    return stryMutAct_9fa48("70763") ? {} : (stryCov_9fa48("70763"), {
      partitionId: normalizedPartitionId,
      requiredDistinctNodeCount: normalizePriorityRecoveryInteger(normalizedSummary.requiredDistinctNodeCount),
      readyDistinctNodeCount: null,
      spreadGap: NUM.ZERO,
      ready: stryMutAct_9fa48("70764") ? false : (stryCov_9fa48("70764"), true),
      reasons: stryMutAct_9fa48("70765") ? ["Stryker was here"] : (stryCov_9fa48("70765"), [])
    });
  }
}
function buildPriorityRecoveryBlockedPartitions(priorityPartitionSummary) {
  if (stryMutAct_9fa48("70766")) {
    {}
  } else {
    stryCov_9fa48("70766");
    return stryMutAct_9fa48("70767") ? Object.values(buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary)) : (stryCov_9fa48("70767"), Object.values(buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary)).sort(stryMutAct_9fa48("70768") ? () => undefined : (stryCov_9fa48("70768"), (left, right) => left.partitionId.localeCompare(right.partitionId))));
  }
}
function buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary) {
  if (stryMutAct_9fa48("70769")) {
    {}
  } else {
    stryCov_9fa48("70769");
    return buildPriorityRecoveryBlockedPartitions(priorityPartitionSummary).map(stryMutAct_9fa48("70770") ? () => undefined : (stryCov_9fa48("70770"), entry => entry.partitionId));
  }
}
function hasPriorityRecoverySpreadGap(priorityPartitionSummary) {
  if (stryMutAct_9fa48("70771")) {
    {}
  } else {
    stryCov_9fa48("70771");
    const normalizedSummary = (stryMutAct_9fa48("70774") ? priorityPartitionSummary || typeof priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("70773") ? false : stryMutAct_9fa48("70772") ? true : (stryCov_9fa48("70772", "70773", "70774"), priorityPartitionSummary && (stryMutAct_9fa48("70776") ? typeof priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("70775") ? true : (stryCov_9fa48("70775", "70776"), typeof priorityPartitionSummary === TYPEOF.OBJECT)))) ? priorityPartitionSummary : null;
    if (stryMutAct_9fa48("70779") ? false : stryMutAct_9fa48("70778") ? true : stryMutAct_9fa48("70777") ? normalizedSummary : (stryCov_9fa48("70777", "70778", "70779"), !normalizedSummary)) {
      if (stryMutAct_9fa48("70780")) {
        {}
      } else {
        stryCov_9fa48("70780");
        return stryMutAct_9fa48("70781") ? true : (stryCov_9fa48("70781"), false);
      }
    }
    if (stryMutAct_9fa48("70785") ? buildPriorityRecoveryBlockedPartitionIds(normalizedSummary).length <= NUM.ZERO : stryMutAct_9fa48("70784") ? buildPriorityRecoveryBlockedPartitionIds(normalizedSummary).length >= NUM.ZERO : stryMutAct_9fa48("70783") ? false : stryMutAct_9fa48("70782") ? true : (stryCov_9fa48("70782", "70783", "70784", "70785"), buildPriorityRecoveryBlockedPartitionIds(normalizedSummary).length > NUM.ZERO)) {
      if (stryMutAct_9fa48("70786")) {
        {}
      } else {
        stryCov_9fa48("70786");
        return stryMutAct_9fa48("70787") ? false : (stryCov_9fa48("70787"), true);
      }
    }
    return stryMutAct_9fa48("70790") ? normalizedSummary.satisfied !== false : stryMutAct_9fa48("70789") ? false : stryMutAct_9fa48("70788") ? true : (stryCov_9fa48("70788", "70789", "70790"), normalizedSummary.satisfied === (stryMutAct_9fa48("70791") ? true : (stryCov_9fa48("70791"), false)));
  }
}
function resolvePriorityPartitionSummaryFromPublication(publicationRow = null) {
  if (stryMutAct_9fa48("70792")) {
    {}
  } else {
    stryCov_9fa48("70792");
    if (stryMutAct_9fa48("70795") ? !publicationRow && typeof publicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("70794") ? false : stryMutAct_9fa48("70793") ? true : (stryCov_9fa48("70793", "70794", "70795"), (stryMutAct_9fa48("70796") ? publicationRow : (stryCov_9fa48("70796"), !publicationRow)) || (stryMutAct_9fa48("70798") ? typeof publicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("70797") ? false : (stryCov_9fa48("70797", "70798"), typeof publicationRow !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("70799")) {
        {}
      } else {
        stryCov_9fa48("70799");
        return null;
      }
    }
    const summary = stryMutAct_9fa48("70800") ? (publicationRow.priorityPartitionSummary ?? publicationRow.priority_partition_summary) && null : (stryCov_9fa48("70800"), (stryMutAct_9fa48("70801") ? publicationRow.priorityPartitionSummary && publicationRow.priority_partition_summary : (stryCov_9fa48("70801"), publicationRow.priorityPartitionSummary ?? publicationRow.priority_partition_summary)) ?? null);
    return (stryMutAct_9fa48("70804") ? summary || typeof summary === TYPEOF.OBJECT : stryMutAct_9fa48("70803") ? false : stryMutAct_9fa48("70802") ? true : (stryCov_9fa48("70802", "70803", "70804"), summary && (stryMutAct_9fa48("70806") ? typeof summary !== TYPEOF.OBJECT : stryMutAct_9fa48("70805") ? true : (stryCov_9fa48("70805", "70806"), typeof summary === TYPEOF.OBJECT)))) ? summary : null;
  }
}
function buildPriorityRecoveryAdmissionPlan(options = {}) {
  if (stryMutAct_9fa48("70807")) {
    {}
  } else {
    stryCov_9fa48("70807");
    const maxConcurrentAdds = stryMutAct_9fa48("70808") ? Math.min(NUM.ZERO, normalizePriorityRecoveryInteger(options.maxConcurrentAdds) || NUM.ZERO) : (stryCov_9fa48("70808"), Math.max(NUM.ZERO, stryMutAct_9fa48("70811") ? normalizePriorityRecoveryInteger(options.maxConcurrentAdds) && NUM.ZERO : stryMutAct_9fa48("70810") ? false : stryMutAct_9fa48("70809") ? true : (stryCov_9fa48("70809", "70810", "70811"), normalizePriorityRecoveryInteger(options.maxConcurrentAdds) || NUM.ZERO)));
    const isEmergencyPriorityPartition = (stryMutAct_9fa48("70814") ? typeof options.isEmergencyPriorityPartition !== TYPEOF.FUNCTION : stryMutAct_9fa48("70813") ? false : stryMutAct_9fa48("70812") ? true : (stryCov_9fa48("70812", "70813", "70814"), typeof options.isEmergencyPriorityPartition === TYPEOF.FUNCTION)) ? options.isEmergencyPriorityPartition : stryMutAct_9fa48("70815") ? () => undefined : (stryCov_9fa48("70815"), () => stryMutAct_9fa48("70816") ? true : (stryCov_9fa48("70816"), false));
    const isPriorityPartition = (stryMutAct_9fa48("70819") ? typeof options.isPriorityPartition !== TYPEOF.FUNCTION : stryMutAct_9fa48("70818") ? false : stryMutAct_9fa48("70817") ? true : (stryCov_9fa48("70817", "70818", "70819"), typeof options.isPriorityPartition === TYPEOF.FUNCTION)) ? options.isPriorityPartition : isEmergencyPriorityPartition;
    const blockedPartitions = buildPriorityRecoveryBlockedPartitions(options.priorityPartitionSummary);
    const blockedPartitionIds = blockedPartitions.map(stryMutAct_9fa48("70820") ? () => undefined : (stryCov_9fa48("70820"), entry => entry.partitionId));
    const blockedPartitionIdSet = new Set(blockedPartitionIds);
    const recoveryActive = hasPriorityRecoverySpreadGap(options.priorityPartitionSummary);
    const blockedPartitionDetailUnavailable = stryMutAct_9fa48("70823") ? recoveryActive === true || blockedPartitionIds.length === NUM.ZERO : stryMutAct_9fa48("70822") ? false : stryMutAct_9fa48("70821") ? true : (stryCov_9fa48("70821", "70822", "70823"), (stryMutAct_9fa48("70825") ? recoveryActive !== true : stryMutAct_9fa48("70824") ? true : (stryCov_9fa48("70824", "70825"), recoveryActive === (stryMutAct_9fa48("70826") ? false : (stryCov_9fa48("70826"), true)))) && (stryMutAct_9fa48("70828") ? blockedPartitionIds.length !== NUM.ZERO : stryMutAct_9fa48("70827") ? true : (stryCov_9fa48("70827", "70828"), blockedPartitionIds.length === NUM.ZERO)));
    const emergencyBlockedPartitionIds = stryMutAct_9fa48("70829") ? blockedPartitionIds : (stryCov_9fa48("70829"), blockedPartitionIds.filter(stryMutAct_9fa48("70830") ? () => undefined : (stryCov_9fa48("70830"), partitionId => isEmergencyPriorityPartition(partitionId))));
    const emergencyRecoveryActive = stryMutAct_9fa48("70833") ? emergencyBlockedPartitionIds.length > NUM.ZERO && blockedPartitionDetailUnavailable : stryMutAct_9fa48("70832") ? false : stryMutAct_9fa48("70831") ? true : (stryCov_9fa48("70831", "70832", "70833"), (stryMutAct_9fa48("70836") ? emergencyBlockedPartitionIds.length <= NUM.ZERO : stryMutAct_9fa48("70835") ? emergencyBlockedPartitionIds.length >= NUM.ZERO : stryMutAct_9fa48("70834") ? false : (stryCov_9fa48("70834", "70835", "70836"), emergencyBlockedPartitionIds.length > NUM.ZERO)) || blockedPartitionDetailUnavailable);
    const ordinaryPriorityAddBudgetLimit = maxConcurrentAdds;
    const emergencyPriorityAddBudgetLimit = emergencyRecoveryActive ? stryMutAct_9fa48("70837") ? maxConcurrentAdds - NUM.ONE : (stryCov_9fa48("70837"), maxConcurrentAdds + NUM.ONE) : maxConcurrentAdds;
    const admissionSource = (stryMutAct_9fa48("70840") ? typeof options.admissionSource === TYPEOF.STRING || options.admissionSource.trim().length > NUM.ZERO : stryMutAct_9fa48("70839") ? false : stryMutAct_9fa48("70838") ? true : (stryCov_9fa48("70838", "70839", "70840"), (stryMutAct_9fa48("70842") ? typeof options.admissionSource !== TYPEOF.STRING : stryMutAct_9fa48("70841") ? true : (stryCov_9fa48("70841", "70842"), typeof options.admissionSource === TYPEOF.STRING)) && (stryMutAct_9fa48("70845") ? options.admissionSource.trim().length <= NUM.ZERO : stryMutAct_9fa48("70844") ? options.admissionSource.trim().length >= NUM.ZERO : stryMutAct_9fa48("70843") ? true : (stryCov_9fa48("70843", "70844", "70845"), (stryMutAct_9fa48("70846") ? options.admissionSource.length : (stryCov_9fa48("70846"), options.admissionSource.trim().length)) > NUM.ZERO)))) ? stryMutAct_9fa48("70847") ? options.admissionSource : (stryCov_9fa48("70847"), options.admissionSource.trim()) : options.priorityPartitionSummary ? PRIORITY_RECOVERY_ADMISSION_SOURCE.PUBLICATION_SUMMARY : PRIORITY_RECOVERY_ADMISSION_SOURCE.INACTIVE_DEFAULT;
    const getPartitionClass = partitionId => {
      if (stryMutAct_9fa48("70848")) {
        {}
      } else {
        stryCov_9fa48("70848");
        const normalizedPartitionId = stryMutAct_9fa48("70849") ? String(partitionId || '') : (stryCov_9fa48("70849"), String(stryMutAct_9fa48("70852") ? partitionId && '' : stryMutAct_9fa48("70851") ? false : stryMutAct_9fa48("70850") ? true : (stryCov_9fa48("70850", "70851", "70852"), partitionId || (stryMutAct_9fa48("70853") ? "Stryker was here!" : (stryCov_9fa48("70853"), '')))).trim());
        if (stryMutAct_9fa48("70856") ? normalizedPartitionId.length === NUM.ZERO && !isPriorityPartition(normalizedPartitionId) : stryMutAct_9fa48("70855") ? false : stryMutAct_9fa48("70854") ? true : (stryCov_9fa48("70854", "70855", "70856"), (stryMutAct_9fa48("70858") ? normalizedPartitionId.length !== NUM.ZERO : stryMutAct_9fa48("70857") ? false : (stryCov_9fa48("70857", "70858"), normalizedPartitionId.length === NUM.ZERO)) || (stryMutAct_9fa48("70859") ? isPriorityPartition(normalizedPartitionId) : (stryCov_9fa48("70859"), !isPriorityPartition(normalizedPartitionId))))) {
          if (stryMutAct_9fa48("70860")) {
            {}
          } else {
            stryCov_9fa48("70860");
            return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY;
          }
        }
        if (stryMutAct_9fa48("70862") ? false : stryMutAct_9fa48("70861") ? true : (stryCov_9fa48("70861", "70862"), isEmergencyPriorityPartition(normalizedPartitionId))) {
          if (stryMutAct_9fa48("70863")) {
            {}
          } else {
            stryCov_9fa48("70863");
            return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY;
          }
        }
        return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY;
      }
    };
    const getReservedNonPrioritySlots = (partitionId, slotType = stryMutAct_9fa48("70864") ? "" : (stryCov_9fa48("70864"), 'add')) => {
      if (stryMutAct_9fa48("70865")) {
        {}
      } else {
        stryCov_9fa48("70865");
        if (stryMutAct_9fa48("70868") ? getPartitionClass(partitionId) === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY : stryMutAct_9fa48("70867") ? false : stryMutAct_9fa48("70866") ? true : (stryCov_9fa48("70866", "70867", "70868"), getPartitionClass(partitionId) !== PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY)) {
          if (stryMutAct_9fa48("70869")) {
            {}
          } else {
            stryCov_9fa48("70869");
            return NUM.ZERO;
          }
        }
        return (stryMutAct_9fa48("70872") ? slotType !== 'move' : stryMutAct_9fa48("70871") ? false : stryMutAct_9fa48("70870") ? true : (stryCov_9fa48("70870", "70871", "70872"), slotType === (stryMutAct_9fa48("70873") ? "" : (stryCov_9fa48("70873"), 'move')))) ? recoveryActive ? NUM.ONE : NUM.ZERO : recoveryActive ? NUM.ONE : NUM.ZERO;
      }
    };
    const getPriorityAddBudgetLimit = stryMutAct_9fa48("70874") ? () => undefined : (stryCov_9fa48("70874"), (() => {
      const getPriorityAddBudgetLimit = partitionId => (stryMutAct_9fa48("70877") ? getPartitionClass(partitionId) !== PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY : stryMutAct_9fa48("70876") ? false : stryMutAct_9fa48("70875") ? true : (stryCov_9fa48("70875", "70876", "70877"), getPartitionClass(partitionId) === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY)) ? emergencyPriorityAddBudgetLimit : ordinaryPriorityAddBudgetLimit;
      return getPriorityAddBudgetLimit;
    })());
    const usesEmergencyPriorityOverflow = stryMutAct_9fa48("70878") ? () => undefined : (stryCov_9fa48("70878"), (() => {
      const usesEmergencyPriorityOverflow = partitionId => stryMutAct_9fa48("70881") ? emergencyRecoveryActive === true || getPartitionClass(partitionId) === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY : stryMutAct_9fa48("70880") ? false : stryMutAct_9fa48("70879") ? true : (stryCov_9fa48("70879", "70880", "70881"), (stryMutAct_9fa48("70883") ? emergencyRecoveryActive !== true : stryMutAct_9fa48("70882") ? true : (stryCov_9fa48("70882", "70883"), emergencyRecoveryActive === (stryMutAct_9fa48("70884") ? false : (stryCov_9fa48("70884"), true)))) && (stryMutAct_9fa48("70886") ? getPartitionClass(partitionId) !== PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY : stryMutAct_9fa48("70885") ? true : (stryCov_9fa48("70885", "70886"), getPartitionClass(partitionId) === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY)));
      return usesEmergencyPriorityOverflow;
    })());
    const evaluatePriorityAddAdmission = (partitionId, counts = {}) => {
      if (stryMutAct_9fa48("70887")) {
        {}
      } else {
        stryCov_9fa48("70887");
        const partitionClass = getPartitionClass(partitionId);
        const priorityCount = Number(stryMutAct_9fa48("70890") ? counts.priorityCount && NUM.ZERO : stryMutAct_9fa48("70889") ? false : stryMutAct_9fa48("70888") ? true : (stryCov_9fa48("70888", "70889", "70890"), counts.priorityCount || NUM.ZERO));
        const ordinaryPriorityCount = Number(stryMutAct_9fa48("70893") ? counts.ordinaryPriorityCount && NUM.ZERO : stryMutAct_9fa48("70892") ? false : stryMutAct_9fa48("70891") ? true : (stryCov_9fa48("70891", "70892", "70893"), counts.ordinaryPriorityCount || NUM.ZERO));
        const budgetLimit = getPriorityAddBudgetLimit(partitionId);
        if (stryMutAct_9fa48("70896") ? partitionClass !== PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY : stryMutAct_9fa48("70895") ? false : stryMutAct_9fa48("70894") ? true : (stryCov_9fa48("70894", "70895", "70896"), partitionClass === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY)) {
          if (stryMutAct_9fa48("70897")) {
            {}
          } else {
            stryCov_9fa48("70897");
            return Object.freeze(stryMutAct_9fa48("70898") ? {} : (stryCov_9fa48("70898"), {
              allowed: stryMutAct_9fa48("70899") ? true : (stryCov_9fa48("70899"), false),
              reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.NOT_PRIORITY_PARTITION,
              partitionClass,
              budgetLimit
            }));
          }
        }
        if (stryMutAct_9fa48("70903") ? emergencyPriorityAddBudgetLimit > NUM.ZERO : stryMutAct_9fa48("70902") ? emergencyPriorityAddBudgetLimit < NUM.ZERO : stryMutAct_9fa48("70901") ? false : stryMutAct_9fa48("70900") ? true : (stryCov_9fa48("70900", "70901", "70902", "70903"), emergencyPriorityAddBudgetLimit <= NUM.ZERO)) {
          if (stryMutAct_9fa48("70904")) {
            {}
          } else {
            stryCov_9fa48("70904");
            return Object.freeze(stryMutAct_9fa48("70905") ? {} : (stryCov_9fa48("70905"), {
              allowed: stryMutAct_9fa48("70906") ? true : (stryCov_9fa48("70906"), false),
              reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.PRIORITY_LANE_DISABLED,
              partitionClass,
              budgetLimit
            }));
          }
        }
        if (stryMutAct_9fa48("70910") ? priorityCount < emergencyPriorityAddBudgetLimit : stryMutAct_9fa48("70909") ? priorityCount > emergencyPriorityAddBudgetLimit : stryMutAct_9fa48("70908") ? false : stryMutAct_9fa48("70907") ? true : (stryCov_9fa48("70907", "70908", "70909", "70910"), priorityCount >= emergencyPriorityAddBudgetLimit)) {
          if (stryMutAct_9fa48("70911")) {
            {}
          } else {
            stryCov_9fa48("70911");
            return Object.freeze(stryMutAct_9fa48("70912") ? {} : (stryCov_9fa48("70912"), {
              allowed: stryMutAct_9fa48("70913") ? true : (stryCov_9fa48("70913"), false),
              reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.EMERGENCY_PRIORITY_LANE_EXHAUSTED,
              partitionClass,
              budgetLimit: emergencyPriorityAddBudgetLimit
            }));
          }
        }
        if (stryMutAct_9fa48("70916") ? partitionClass !== PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY : stryMutAct_9fa48("70915") ? false : stryMutAct_9fa48("70914") ? true : (stryCov_9fa48("70914", "70915", "70916"), partitionClass === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY)) {
          if (stryMutAct_9fa48("70917")) {
            {}
          } else {
            stryCov_9fa48("70917");
            return Object.freeze(stryMutAct_9fa48("70918") ? {} : (stryCov_9fa48("70918"), {
              allowed: stryMutAct_9fa48("70919") ? false : (stryCov_9fa48("70919"), true),
              reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ADMITTED,
              partitionClass,
              budgetLimit: emergencyPriorityAddBudgetLimit
            }));
          }
        }
        if (stryMutAct_9fa48("70923") ? ordinaryPriorityAddBudgetLimit > NUM.ZERO : stryMutAct_9fa48("70922") ? ordinaryPriorityAddBudgetLimit < NUM.ZERO : stryMutAct_9fa48("70921") ? false : stryMutAct_9fa48("70920") ? true : (stryCov_9fa48("70920", "70921", "70922", "70923"), ordinaryPriorityAddBudgetLimit <= NUM.ZERO)) {
          if (stryMutAct_9fa48("70924")) {
            {}
          } else {
            stryCov_9fa48("70924");
            return Object.freeze(stryMutAct_9fa48("70925") ? {} : (stryCov_9fa48("70925"), {
              allowed: stryMutAct_9fa48("70926") ? true : (stryCov_9fa48("70926"), false),
              reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.PRIORITY_LANE_DISABLED,
              partitionClass,
              budgetLimit
            }));
          }
        }
        if (stryMutAct_9fa48("70930") ? ordinaryPriorityCount < ordinaryPriorityAddBudgetLimit : stryMutAct_9fa48("70929") ? ordinaryPriorityCount > ordinaryPriorityAddBudgetLimit : stryMutAct_9fa48("70928") ? false : stryMutAct_9fa48("70927") ? true : (stryCov_9fa48("70927", "70928", "70929", "70930"), ordinaryPriorityCount >= ordinaryPriorityAddBudgetLimit)) {
          if (stryMutAct_9fa48("70931")) {
            {}
          } else {
            stryCov_9fa48("70931");
            return Object.freeze(stryMutAct_9fa48("70932") ? {} : (stryCov_9fa48("70932"), {
              allowed: stryMutAct_9fa48("70933") ? true : (stryCov_9fa48("70933"), false),
              reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ORDINARY_PRIORITY_LANE_EXHAUSTED,
              partitionClass,
              budgetLimit: ordinaryPriorityAddBudgetLimit
            }));
          }
        }
        return Object.freeze(stryMutAct_9fa48("70934") ? {} : (stryCov_9fa48("70934"), {
          allowed: stryMutAct_9fa48("70935") ? false : (stryCov_9fa48("70935"), true),
          reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ADMITTED,
          partitionClass,
          budgetLimit
        }));
      }
    };
    return Object.freeze(stryMutAct_9fa48("70936") ? {} : (stryCov_9fa48("70936"), {
      maxConcurrentAdds,
      admissionSource,
      recoveryActive,
      blockedPartitionIds: Object.freeze(stryMutAct_9fa48("70937") ? [] : (stryCov_9fa48("70937"), [...blockedPartitionIds])),
      blockedPartitionIdSet,
      emergencyRecoveryActive,
      emergencyBlockedPartitionIds: Object.freeze(stryMutAct_9fa48("70938") ? [] : (stryCov_9fa48("70938"), [...emergencyBlockedPartitionIds])),
      blockedPartitionDetailUnavailable,
      reservedNonPriorityAddSlots: recoveryActive ? NUM.ONE : NUM.ZERO,
      reservedNonPriorityMoveSlots: recoveryActive ? NUM.ONE : NUM.ZERO,
      ordinaryPriorityAddBudgetLimit,
      emergencyPriorityAddBudgetLimit,
      getPartitionClass,
      getReservedNonPrioritySlots,
      getPriorityAddBudgetLimit,
      usesEmergencyPriorityOverflow,
      evaluatePriorityAddAdmission,
      hasBlockedPartition(partitionId) {
        if (stryMutAct_9fa48("70939")) {
          {}
        } else {
          stryCov_9fa48("70939");
          const normalizedPartitionId = stryMutAct_9fa48("70940") ? String(partitionId || '') : (stryCov_9fa48("70940"), String(stryMutAct_9fa48("70943") ? partitionId && '' : stryMutAct_9fa48("70942") ? false : stryMutAct_9fa48("70941") ? true : (stryCov_9fa48("70941", "70942", "70943"), partitionId || (stryMutAct_9fa48("70944") ? "Stryker was here!" : (stryCov_9fa48("70944"), '')))).trim());
          if (stryMutAct_9fa48("70947") ? blockedPartitionDetailUnavailable !== true : stryMutAct_9fa48("70946") ? false : stryMutAct_9fa48("70945") ? true : (stryCov_9fa48("70945", "70946", "70947"), blockedPartitionDetailUnavailable === (stryMutAct_9fa48("70948") ? false : (stryCov_9fa48("70948"), true)))) {
            if (stryMutAct_9fa48("70949")) {
              {}
            } else {
              stryCov_9fa48("70949");
              return stryMutAct_9fa48("70952") ? normalizedPartitionId.length > NUM.ZERO || isEmergencyPriorityPartition(normalizedPartitionId) : stryMutAct_9fa48("70951") ? false : stryMutAct_9fa48("70950") ? true : (stryCov_9fa48("70950", "70951", "70952"), (stryMutAct_9fa48("70955") ? normalizedPartitionId.length <= NUM.ZERO : stryMutAct_9fa48("70954") ? normalizedPartitionId.length >= NUM.ZERO : stryMutAct_9fa48("70953") ? true : (stryCov_9fa48("70953", "70954", "70955"), normalizedPartitionId.length > NUM.ZERO)) && isEmergencyPriorityPartition(normalizedPartitionId));
            }
          }
          return stryMutAct_9fa48("70958") ? normalizedPartitionId.length > NUM.ZERO || blockedPartitionIdSet.has(normalizedPartitionId) : stryMutAct_9fa48("70957") ? false : stryMutAct_9fa48("70956") ? true : (stryCov_9fa48("70956", "70957", "70958"), (stryMutAct_9fa48("70961") ? normalizedPartitionId.length <= NUM.ZERO : stryMutAct_9fa48("70960") ? normalizedPartitionId.length >= NUM.ZERO : stryMutAct_9fa48("70959") ? true : (stryCov_9fa48("70959", "70960", "70961"), normalizedPartitionId.length > NUM.ZERO)) && blockedPartitionIdSet.has(normalizedPartitionId));
        }
      }
    }));
  }
}
function withPriorityRecoveryAdmissionSource(admissionPlan, admissionSource) {
  if (stryMutAct_9fa48("70962")) {
    {}
  } else {
    stryCov_9fa48("70962");
    if (stryMutAct_9fa48("70965") ? !admissionPlan && typeof admissionPlan !== TYPEOF.OBJECT : stryMutAct_9fa48("70964") ? false : stryMutAct_9fa48("70963") ? true : (stryCov_9fa48("70963", "70964", "70965"), (stryMutAct_9fa48("70966") ? admissionPlan : (stryCov_9fa48("70966"), !admissionPlan)) || (stryMutAct_9fa48("70968") ? typeof admissionPlan === TYPEOF.OBJECT : stryMutAct_9fa48("70967") ? false : (stryCov_9fa48("70967", "70968"), typeof admissionPlan !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("70969")) {
        {}
      } else {
        stryCov_9fa48("70969");
        return admissionPlan;
      }
    }
    return Object.freeze(stryMutAct_9fa48("70970") ? {} : (stryCov_9fa48("70970"), {
      ...admissionPlan,
      admissionSource
    }));
  }
}
function resolvePriorityRecoveryAdmissionPlanFromPublication(options = {}) {
  if (stryMutAct_9fa48("70971")) {
    {}
  } else {
    stryCov_9fa48("70971");
    const publicationRow = (stryMutAct_9fa48("70974") ? options.publicationRow || typeof options.publicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("70973") ? false : stryMutAct_9fa48("70972") ? true : (stryCov_9fa48("70972", "70973", "70974"), options.publicationRow && (stryMutAct_9fa48("70976") ? typeof options.publicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("70975") ? true : (stryCov_9fa48("70975", "70976"), typeof options.publicationRow === TYPEOF.OBJECT)))) ? options.publicationRow : null;
    const nowMs = normalizePriorityRecoveryInteger(options.nowMs);
    const staleGraceMs = stryMutAct_9fa48("70977") ? Math.min(NUM.ZERO, normalizePriorityRecoveryInteger(options.staleGraceMs) || NUM.ZERO) : (stryCov_9fa48("70977"), Math.max(NUM.ZERO, stryMutAct_9fa48("70980") ? normalizePriorityRecoveryInteger(options.staleGraceMs) && NUM.ZERO : stryMutAct_9fa48("70979") ? false : stryMutAct_9fa48("70978") ? true : (stryCov_9fa48("70978", "70979", "70980"), normalizePriorityRecoveryInteger(options.staleGraceMs) || NUM.ZERO)));
    const lastObservedAdmissionPlan = (stryMutAct_9fa48("70983") ? options.lastObservedAdmissionPlan || typeof options.lastObservedAdmissionPlan === TYPEOF.OBJECT : stryMutAct_9fa48("70982") ? false : stryMutAct_9fa48("70981") ? true : (stryCov_9fa48("70981", "70982", "70983"), options.lastObservedAdmissionPlan && (stryMutAct_9fa48("70985") ? typeof options.lastObservedAdmissionPlan !== TYPEOF.OBJECT : stryMutAct_9fa48("70984") ? true : (stryCov_9fa48("70984", "70985"), typeof options.lastObservedAdmissionPlan === TYPEOF.OBJECT)))) ? options.lastObservedAdmissionPlan : null;
    const lastObservedAdmissionPlanAtMs = normalizePriorityRecoveryInteger(options.lastObservedAdmissionPlanAtMs);
    const maxConcurrentAdds = stryMutAct_9fa48("70986") ? Math.min(NUM.ZERO, normalizePriorityRecoveryInteger(options.maxConcurrentAdds) || NUM.ZERO) : (stryCov_9fa48("70986"), Math.max(NUM.ZERO, stryMutAct_9fa48("70989") ? normalizePriorityRecoveryInteger(options.maxConcurrentAdds) && NUM.ZERO : stryMutAct_9fa48("70988") ? false : stryMutAct_9fa48("70987") ? true : (stryCov_9fa48("70987", "70988", "70989"), normalizePriorityRecoveryInteger(options.maxConcurrentAdds) || NUM.ZERO)));
    const isPriorityPartition = (stryMutAct_9fa48("70992") ? typeof options.isPriorityPartition !== TYPEOF.FUNCTION : stryMutAct_9fa48("70991") ? false : stryMutAct_9fa48("70990") ? true : (stryCov_9fa48("70990", "70991", "70992"), typeof options.isPriorityPartition === TYPEOF.FUNCTION)) ? options.isPriorityPartition : options.isEmergencyPriorityPartition;
    const isEmergencyPriorityPartition = (stryMutAct_9fa48("70995") ? typeof options.isEmergencyPriorityPartition !== TYPEOF.FUNCTION : stryMutAct_9fa48("70994") ? false : stryMutAct_9fa48("70993") ? true : (stryCov_9fa48("70993", "70994", "70995"), typeof options.isEmergencyPriorityPartition === TYPEOF.FUNCTION)) ? options.isEmergencyPriorityPartition : stryMutAct_9fa48("70996") ? () => undefined : (stryCov_9fa48("70996"), () => stryMutAct_9fa48("70997") ? true : (stryCov_9fa48("70997"), false));
    const buildAdmissionPlan = stryMutAct_9fa48("70998") ? () => undefined : (stryCov_9fa48("70998"), (() => {
      const buildAdmissionPlan = (priorityPartitionSummary = null, admissionSource = null) => buildPriorityRecoveryAdmissionPlan(stryMutAct_9fa48("70999") ? {} : (stryCov_9fa48("70999"), {
        admissionSource,
        isPriorityPartition,
        maxConcurrentAdds,
        priorityPartitionSummary,
        isEmergencyPriorityPartition
      }));
      return buildAdmissionPlan;
    })());
    const priorityPartitionSummary = resolvePriorityPartitionSummaryFromPublication(publicationRow);
    let admissionPlan = null;
    let nextLastObservedAdmissionPlan = null;
    let nextLastObservedAdmissionPlanAtMs = null;
    if (stryMutAct_9fa48("71001") ? false : stryMutAct_9fa48("71000") ? true : (stryCov_9fa48("71000", "71001"), priorityPartitionSummary)) {
      if (stryMutAct_9fa48("71002")) {
        {}
      } else {
        stryCov_9fa48("71002");
        admissionPlan = buildAdmissionPlan(priorityPartitionSummary, PRIORITY_RECOVERY_ADMISSION_SOURCE.PUBLICATION_SUMMARY);
        if (stryMutAct_9fa48("71005") ? admissionPlan.recoveryActive === true || Number.isFinite(nowMs) : stryMutAct_9fa48("71004") ? false : stryMutAct_9fa48("71003") ? true : (stryCov_9fa48("71003", "71004", "71005"), (stryMutAct_9fa48("71007") ? admissionPlan.recoveryActive !== true : stryMutAct_9fa48("71006") ? true : (stryCov_9fa48("71006", "71007"), admissionPlan.recoveryActive === (stryMutAct_9fa48("71008") ? false : (stryCov_9fa48("71008"), true)))) && Number.isFinite(nowMs))) {
          if (stryMutAct_9fa48("71009")) {
            {}
          } else {
            stryCov_9fa48("71009");
            nextLastObservedAdmissionPlan = admissionPlan;
            nextLastObservedAdmissionPlanAtMs = nowMs;
          }
        }
      }
    } else if (stryMutAct_9fa48("71012") ? lastObservedAdmissionPlan && lastObservedAdmissionPlanAtMs !== null && staleGraceMs > NUM.ZERO && Number.isFinite(nowMs) || nowMs - lastObservedAdmissionPlanAtMs <= staleGraceMs : stryMutAct_9fa48("71011") ? false : stryMutAct_9fa48("71010") ? true : (stryCov_9fa48("71010", "71011", "71012"), (stryMutAct_9fa48("71014") ? lastObservedAdmissionPlan && lastObservedAdmissionPlanAtMs !== null && staleGraceMs > NUM.ZERO || Number.isFinite(nowMs) : stryMutAct_9fa48("71013") ? true : (stryCov_9fa48("71013", "71014"), (stryMutAct_9fa48("71016") ? lastObservedAdmissionPlan && lastObservedAdmissionPlanAtMs !== null || staleGraceMs > NUM.ZERO : stryMutAct_9fa48("71015") ? true : (stryCov_9fa48("71015", "71016"), (stryMutAct_9fa48("71018") ? lastObservedAdmissionPlan || lastObservedAdmissionPlanAtMs !== null : stryMutAct_9fa48("71017") ? true : (stryCov_9fa48("71017", "71018"), lastObservedAdmissionPlan && (stryMutAct_9fa48("71020") ? lastObservedAdmissionPlanAtMs === null : stryMutAct_9fa48("71019") ? true : (stryCov_9fa48("71019", "71020"), lastObservedAdmissionPlanAtMs !== null)))) && (stryMutAct_9fa48("71023") ? staleGraceMs <= NUM.ZERO : stryMutAct_9fa48("71022") ? staleGraceMs >= NUM.ZERO : stryMutAct_9fa48("71021") ? true : (stryCov_9fa48("71021", "71022", "71023"), staleGraceMs > NUM.ZERO)))) && Number.isFinite(nowMs))) && (stryMutAct_9fa48("71026") ? nowMs - lastObservedAdmissionPlanAtMs > staleGraceMs : stryMutAct_9fa48("71025") ? nowMs - lastObservedAdmissionPlanAtMs < staleGraceMs : stryMutAct_9fa48("71024") ? true : (stryCov_9fa48("71024", "71025", "71026"), (stryMutAct_9fa48("71027") ? nowMs + lastObservedAdmissionPlanAtMs : (stryCov_9fa48("71027"), nowMs - lastObservedAdmissionPlanAtMs)) <= staleGraceMs)))) {
      if (stryMutAct_9fa48("71028")) {
        {}
      } else {
        stryCov_9fa48("71028");
        admissionPlan = withPriorityRecoveryAdmissionSource(lastObservedAdmissionPlan, PRIORITY_RECOVERY_ADMISSION_SOURCE.STALE_ACTIVE_GRACE);
        nextLastObservedAdmissionPlan = lastObservedAdmissionPlan;
        nextLastObservedAdmissionPlanAtMs = lastObservedAdmissionPlanAtMs;
      }
    } else {
      if (stryMutAct_9fa48("71029")) {
        {}
      } else {
        stryCov_9fa48("71029");
        admissionPlan = buildAdmissionPlan(null, PRIORITY_RECOVERY_ADMISSION_SOURCE.INACTIVE_DEFAULT);
      }
    }
    return buildPriorityRecoveryAdmissionPlanResult(admissionPlan, nextLastObservedAdmissionPlan, nextLastObservedAdmissionPlanAtMs);
  }
}
function buildPriorityRecoveryAdmissionPlanResult(admissionPlan, lastObservedAdmissionPlan, lastObservedAdmissionPlanAtMs) {
  if (stryMutAct_9fa48("71030")) {
    {}
  } else {
    stryCov_9fa48("71030");
    return stryMutAct_9fa48("71031") ? {} : (stryCov_9fa48("71031"), {
      admissionPlan,
      lastObservedAdmissionPlan,
      lastObservedAdmissionPlanAtMs
    });
  }
}
function resolveTrackedPriorityRecoveryAdmissionPlan(options = {}) {
  if (stryMutAct_9fa48("71032")) {
    {}
  } else {
    stryCov_9fa48("71032");
    const tracker = (stryMutAct_9fa48("71035") ? options.tracker || typeof options.tracker === TYPEOF.OBJECT : stryMutAct_9fa48("71034") ? false : stryMutAct_9fa48("71033") ? true : (stryCov_9fa48("71033", "71034", "71035"), options.tracker && (stryMutAct_9fa48("71037") ? typeof options.tracker !== TYPEOF.OBJECT : stryMutAct_9fa48("71036") ? true : (stryCov_9fa48("71036", "71037"), typeof options.tracker === TYPEOF.OBJECT)))) ? options.tracker : null;
    const resolvedAdmission = resolvePriorityRecoveryAdmissionPlanFromPublication(stryMutAct_9fa48("71038") ? {} : (stryCov_9fa48("71038"), {
      publicationRow: options.publicationRow,
      nowMs: options.nowMs,
      staleGraceMs: options.staleGraceMs,
      lastObservedAdmissionPlan: stryMutAct_9fa48("71039") ? tracker?.lastObservedAdmissionPlan && null : (stryCov_9fa48("71039"), (stryMutAct_9fa48("71040") ? tracker.lastObservedAdmissionPlan : (stryCov_9fa48("71040"), tracker?.lastObservedAdmissionPlan)) ?? null),
      lastObservedAdmissionPlanAtMs: stryMutAct_9fa48("71041") ? tracker?.lastObservedAdmissionPlanAtMs && null : (stryCov_9fa48("71041"), (stryMutAct_9fa48("71042") ? tracker.lastObservedAdmissionPlanAtMs : (stryCov_9fa48("71042"), tracker?.lastObservedAdmissionPlanAtMs)) ?? null),
      maxConcurrentAdds: options.maxConcurrentAdds,
      isPriorityPartition: options.isPriorityPartition,
      isEmergencyPriorityPartition: options.isEmergencyPriorityPartition
    }));
    if (stryMutAct_9fa48("71044") ? false : stryMutAct_9fa48("71043") ? true : (stryCov_9fa48("71043", "71044"), tracker)) {
      if (stryMutAct_9fa48("71045")) {
        {}
      } else {
        stryCov_9fa48("71045");
        tracker.lastObservedAdmissionPlan = stryMutAct_9fa48("71046") ? resolvedAdmission.lastObservedAdmissionPlan && null : (stryCov_9fa48("71046"), resolvedAdmission.lastObservedAdmissionPlan ?? null);
        tracker.lastObservedAdmissionPlanAtMs = stryMutAct_9fa48("71047") ? resolvedAdmission.lastObservedAdmissionPlanAtMs && null : (stryCov_9fa48("71047"), resolvedAdmission.lastObservedAdmissionPlanAtMs ?? null);
      }
    }
    return resolvedAdmission.admissionPlan;
  }
}
function buildPriorityRecoveryReplicaOperationContexts(replicaOperationRows = stryMutAct_9fa48("71048") ? ["Stryker was here"] : (stryCov_9fa48("71048"), []), replicaOperationsSummary = null) {
  if (stryMutAct_9fa48("71049")) {
    {}
  } else {
    stryCov_9fa48("71049");
    const operationTimelineById = (stryMutAct_9fa48("71052") ? replicaOperationsSummary?.operationTimelineById || typeof replicaOperationsSummary.operationTimelineById === TYPEOF.OBJECT : stryMutAct_9fa48("71051") ? false : stryMutAct_9fa48("71050") ? true : (stryCov_9fa48("71050", "71051", "71052"), (stryMutAct_9fa48("71053") ? replicaOperationsSummary.operationTimelineById : (stryCov_9fa48("71053"), replicaOperationsSummary?.operationTimelineById)) && (stryMutAct_9fa48("71055") ? typeof replicaOperationsSummary.operationTimelineById !== TYPEOF.OBJECT : stryMutAct_9fa48("71054") ? true : (stryCov_9fa48("71054", "71055"), typeof replicaOperationsSummary.operationTimelineById === TYPEOF.OBJECT)))) ? replicaOperationsSummary.operationTimelineById : {};
    const byOperationId = {};
    const byPartitionId = {};
    for (const replicaOperationRow of Array.isArray(replicaOperationRows) ? replicaOperationRows : stryMutAct_9fa48("71056") ? ["Stryker was here"] : (stryCov_9fa48("71056"), [])) {
      if (stryMutAct_9fa48("71057")) {
        {}
      } else {
        stryCov_9fa48("71057");
        const operationId = readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID, stryMutAct_9fa48("71058") ? "" : (stryCov_9fa48("71058"), 'operationId'));
        if (stryMutAct_9fa48("71061") ? false : stryMutAct_9fa48("71060") ? true : stryMutAct_9fa48("71059") ? operationId : (stryCov_9fa48("71059", "71060", "71061"), !operationId)) {
          if (stryMutAct_9fa48("71062")) {
            {}
          } else {
            stryCov_9fa48("71062");
            continue;
          }
        }
        const entityType = stryMutAct_9fa48("71063") ? String(readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE, 'entityType', 'service_type', 'serviceType') || PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION).toUpperCase() : (stryCov_9fa48("71063"), String(stryMutAct_9fa48("71066") ? readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE, 'entityType', 'service_type', 'serviceType') && PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION : stryMutAct_9fa48("71065") ? false : stryMutAct_9fa48("71064") ? true : (stryCov_9fa48("71064", "71065", "71066"), readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE, stryMutAct_9fa48("71067") ? "" : (stryCov_9fa48("71067"), 'entityType'), stryMutAct_9fa48("71068") ? "" : (stryCov_9fa48("71068"), 'service_type'), stryMutAct_9fa48("71069") ? "" : (stryCov_9fa48("71069"), 'serviceType')) || PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION)).toLowerCase());
        if (stryMutAct_9fa48("71072") ? entityType === PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION : stryMutAct_9fa48("71071") ? false : stryMutAct_9fa48("71070") ? true : (stryCov_9fa48("71070", "71071", "71072"), entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION)) {
          if (stryMutAct_9fa48("71073")) {
            {}
          } else {
            stryCov_9fa48("71073");
            continue;
          }
        }
        const partitionId = readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID, stryMutAct_9fa48("71074") ? "" : (stryCov_9fa48("71074"), 'partitionId'), PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID, stryMutAct_9fa48("71075") ? "" : (stryCov_9fa48("71075"), 'entityId'));
        if (stryMutAct_9fa48("71078") ? false : stryMutAct_9fa48("71077") ? true : stryMutAct_9fa48("71076") ? partitionId : (stryCov_9fa48("71076", "71077", "71078"), !partitionId)) {
          if (stryMutAct_9fa48("71079")) {
            {}
          } else {
            stryCov_9fa48("71079");
            continue;
          }
        }
        const timeline = Array.isArray(operationTimelineById[operationId]) ? operationTimelineById[operationId] : stryMutAct_9fa48("71080") ? ["Stryker was here"] : (stryCov_9fa48("71080"), []);
        const timelineSteps = normalizePriorityRecoveryStringList(timeline.map(stryMutAct_9fa48("71081") ? () => undefined : (stryCov_9fa48("71081"), entry => stryMutAct_9fa48("71082") ? String(entry?.step || '') : (stryCov_9fa48("71082"), String(stryMutAct_9fa48("71085") ? entry?.step && '' : stryMutAct_9fa48("71084") ? false : stryMutAct_9fa48("71083") ? true : (stryCov_9fa48("71083", "71084", "71085"), (stryMutAct_9fa48("71086") ? entry.step : (stryCov_9fa48("71086"), entry?.step)) || (stryMutAct_9fa48("71087") ? "Stryker was here!" : (stryCov_9fa48("71087"), '')))).trim()))));
        const latestTimelineEntry = (stryMutAct_9fa48("71091") ? timeline.length <= NUM.ZERO : stryMutAct_9fa48("71090") ? timeline.length >= NUM.ZERO : stryMutAct_9fa48("71089") ? false : stryMutAct_9fa48("71088") ? true : (stryCov_9fa48("71088", "71089", "71090", "71091"), timeline.length > NUM.ZERO)) ? timeline[stryMutAct_9fa48("71092") ? timeline.length + 1 : (stryCov_9fa48("71092"), timeline.length - 1)] : null;
        const context = stryMutAct_9fa48("71093") ? {} : (stryCov_9fa48("71093"), {
          operationId,
          partitionId,
          tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
          type: stryMutAct_9fa48("71094") ? String(readFirstStringField(replicaOperationRow, 'type', 'operation_type', 'operationType') || '').toLowerCase() : (stryCov_9fa48("71094"), String(stryMutAct_9fa48("71097") ? readFirstStringField(replicaOperationRow, 'type', 'operation_type', 'operationType') && '' : stryMutAct_9fa48("71096") ? false : stryMutAct_9fa48("71095") ? true : (stryCov_9fa48("71095", "71096", "71097"), readFirstStringField(replicaOperationRow, stryMutAct_9fa48("71098") ? "" : (stryCov_9fa48("71098"), 'type'), stryMutAct_9fa48("71099") ? "" : (stryCov_9fa48("71099"), 'operation_type'), stryMutAct_9fa48("71100") ? "" : (stryCov_9fa48("71100"), 'operationType')) || (stryMutAct_9fa48("71101") ? "Stryker was here!" : (stryCov_9fa48("71101"), '')))).toUpperCase()),
          status: stryMutAct_9fa48("71102") ? String(readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, 'status') || '').toUpperCase() : (stryCov_9fa48("71102"), String(stryMutAct_9fa48("71105") ? readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, 'status') && '' : stryMutAct_9fa48("71104") ? false : stryMutAct_9fa48("71103") ? true : (stryCov_9fa48("71103", "71104", "71105"), readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, stryMutAct_9fa48("71106") ? "" : (stryCov_9fa48("71106"), 'status')) || (stryMutAct_9fa48("71107") ? "Stryker was here!" : (stryCov_9fa48("71107"), '')))).toLowerCase()),
          workflowStep: stryMutAct_9fa48("71108") ? String(readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, 'workflowStep') || '').toLowerCase() : (stryCov_9fa48("71108"), String(stryMutAct_9fa48("71111") ? readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, 'workflowStep') && '' : stryMutAct_9fa48("71110") ? false : stryMutAct_9fa48("71109") ? true : (stryCov_9fa48("71109", "71110", "71111"), readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, stryMutAct_9fa48("71112") ? "" : (stryCov_9fa48("71112"), 'workflowStep')) || (stryMutAct_9fa48("71113") ? "Stryker was here!" : (stryCov_9fa48("71113"), '')))).toUpperCase()),
          sourceNodeId: readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID, stryMutAct_9fa48("71114") ? "" : (stryCov_9fa48("71114"), 'sourceNodeId')),
          targetNodeId: readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID, stryMutAct_9fa48("71115") ? "" : (stryCov_9fa48("71115"), 'targetNodeId')),
          replicaId: readFirstStringField(replicaOperationRow, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID, stryMutAct_9fa48("71116") ? "" : (stryCov_9fa48("71116"), 'replicaId'), stryMutAct_9fa48("71117") ? "" : (stryCov_9fa48("71117"), 'service_id'), stryMutAct_9fa48("71118") ? "" : (stryCov_9fa48("71118"), 'serviceId')),
          createdAtMs: normalizePriorityRecoveryInteger(stryMutAct_9fa48("71119") ? replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] && replicaOperationRow.createdAt : (stryCov_9fa48("71119"), replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] ?? replicaOperationRow.createdAt)),
          updatedAtMs: normalizePriorityRecoveryInteger(stryMutAct_9fa48("71120") ? replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] && replicaOperationRow.updatedAt : (stryCov_9fa48("71120"), replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] ?? replicaOperationRow.updatedAt)),
          timelineLength: timeline.length,
          timelineStepCount: timelineSteps.length,
          latestTimelineStep: stryMutAct_9fa48("71123") ? String(latestTimelineEntry?.step || '').toUpperCase() && null : stryMutAct_9fa48("71122") ? false : stryMutAct_9fa48("71121") ? true : (stryCov_9fa48("71121", "71122", "71123"), (stryMutAct_9fa48("71124") ? String(latestTimelineEntry?.step || '').toLowerCase() : (stryCov_9fa48("71124"), String(stryMutAct_9fa48("71127") ? latestTimelineEntry?.step && '' : stryMutAct_9fa48("71126") ? false : stryMutAct_9fa48("71125") ? true : (stryCov_9fa48("71125", "71126", "71127"), (stryMutAct_9fa48("71128") ? latestTimelineEntry.step : (stryCov_9fa48("71128"), latestTimelineEntry?.step)) || (stryMutAct_9fa48("71129") ? "Stryker was here!" : (stryCov_9fa48("71129"), '')))).toUpperCase())) || null),
          latestTimelineStatus: stryMutAct_9fa48("71132") ? String(latestTimelineEntry?.status || '').toLowerCase() && null : stryMutAct_9fa48("71131") ? false : stryMutAct_9fa48("71130") ? true : (stryCov_9fa48("71130", "71131", "71132"), (stryMutAct_9fa48("71133") ? String(latestTimelineEntry?.status || '').toUpperCase() : (stryCov_9fa48("71133"), String(stryMutAct_9fa48("71136") ? latestTimelineEntry?.status && '' : stryMutAct_9fa48("71135") ? false : stryMutAct_9fa48("71134") ? true : (stryCov_9fa48("71134", "71135", "71136"), (stryMutAct_9fa48("71137") ? latestTimelineEntry.status : (stryCov_9fa48("71137"), latestTimelineEntry?.status)) || (stryMutAct_9fa48("71138") ? "Stryker was here!" : (stryCov_9fa48("71138"), '')))).toLowerCase())) || null),
          latestTimelineInFlight: stryMutAct_9fa48("71141") ? latestTimelineEntry?.inFlight !== true : stryMutAct_9fa48("71140") ? false : stryMutAct_9fa48("71139") ? true : (stryCov_9fa48("71139", "71140", "71141"), (stryMutAct_9fa48("71142") ? latestTimelineEntry.inFlight : (stryCov_9fa48("71142"), latestTimelineEntry?.inFlight)) === (stryMutAct_9fa48("71143") ? false : (stryCov_9fa48("71143"), true)))
        });
        byOperationId[operationId] = context;
        if (stryMutAct_9fa48("71146") ? false : stryMutAct_9fa48("71145") ? true : stryMutAct_9fa48("71144") ? byPartitionId[partitionId] : (stryCov_9fa48("71144", "71145", "71146"), !byPartitionId[partitionId])) {
          if (stryMutAct_9fa48("71147")) {
            {}
          } else {
            stryCov_9fa48("71147");
            byPartitionId[partitionId] = stryMutAct_9fa48("71148") ? ["Stryker was here"] : (stryCov_9fa48("71148"), []);
          }
        }
        byPartitionId[partitionId].push(context);
      }
    }
    for (const partitionId of Object.keys(byPartitionId)) {
      if (stryMutAct_9fa48("71149")) {
        {}
      } else {
        stryCov_9fa48("71149");
        stryMutAct_9fa48("71150") ? byPartitionId[partitionId] : (stryCov_9fa48("71150"), byPartitionId[partitionId].sort(stryMutAct_9fa48("71151") ? () => undefined : (stryCov_9fa48("71151"), (left, right) => String(left.operationId).localeCompare(String(right.operationId)))));
      }
    }
    return stryMutAct_9fa48("71152") ? {} : (stryCov_9fa48("71152"), {
      byOperationId,
      byPartitionId
    });
  }
}
function parsePriorityRecoveryStepsHistory(stepsHistoryRaw) {
  if (stryMutAct_9fa48("71153")) {
    {}
  } else {
    stryCov_9fa48("71153");
    if (stryMutAct_9fa48("71155") ? false : stryMutAct_9fa48("71154") ? true : (stryCov_9fa48("71154", "71155"), Array.isArray(stepsHistoryRaw))) {
      if (stryMutAct_9fa48("71156")) {
        {}
      } else {
        stryCov_9fa48("71156");
        return stepsHistoryRaw;
      }
    }
    if (stryMutAct_9fa48("71159") ? typeof stepsHistoryRaw !== TYPEOF.STRING && stepsHistoryRaw.length === NUM.ZERO : stryMutAct_9fa48("71158") ? false : stryMutAct_9fa48("71157") ? true : (stryCov_9fa48("71157", "71158", "71159"), (stryMutAct_9fa48("71161") ? typeof stepsHistoryRaw === TYPEOF.STRING : stryMutAct_9fa48("71160") ? false : (stryCov_9fa48("71160", "71161"), typeof stepsHistoryRaw !== TYPEOF.STRING)) || (stryMutAct_9fa48("71163") ? stepsHistoryRaw.length !== NUM.ZERO : stryMutAct_9fa48("71162") ? false : (stryCov_9fa48("71162", "71163"), stepsHistoryRaw.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("71164")) {
        {}
      } else {
        stryCov_9fa48("71164");
        return stryMutAct_9fa48("71165") ? ["Stryker was here"] : (stryCov_9fa48("71165"), []);
      }
    }
    try {
      if (stryMutAct_9fa48("71166")) {
        {}
      } else {
        stryCov_9fa48("71166");
        const parsed = JSON.parse(stepsHistoryRaw);
        return Array.isArray(parsed) ? parsed : stryMutAct_9fa48("71167") ? ["Stryker was here"] : (stryCov_9fa48("71167"), []);
      }
    } catch {
      if (stryMutAct_9fa48("71168")) {
        {}
      } else {
        stryCov_9fa48("71168");
        return stryMutAct_9fa48("71169") ? ["Stryker was here"] : (stryCov_9fa48("71169"), []);
      }
    }
  }
}
function buildPriorityRecoveryOperationContextFromRecord(record) {
  if (stryMutAct_9fa48("71170")) {
    {}
  } else {
    stryCov_9fa48("71170");
    if (stryMutAct_9fa48("71173") ? !record && typeof record !== TYPEOF.OBJECT : stryMutAct_9fa48("71172") ? false : stryMutAct_9fa48("71171") ? true : (stryCov_9fa48("71171", "71172", "71173"), (stryMutAct_9fa48("71174") ? record : (stryCov_9fa48("71174"), !record)) || (stryMutAct_9fa48("71176") ? typeof record === TYPEOF.OBJECT : stryMutAct_9fa48("71175") ? false : (stryCov_9fa48("71175", "71176"), typeof record !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("71177")) {
        {}
      } else {
        stryCov_9fa48("71177");
        return null;
      }
    }
    const operationId = readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID, stryMutAct_9fa48("71178") ? "" : (stryCov_9fa48("71178"), 'operationId'));
    if (stryMutAct_9fa48("71181") ? false : stryMutAct_9fa48("71180") ? true : stryMutAct_9fa48("71179") ? operationId : (stryCov_9fa48("71179", "71180", "71181"), !operationId)) {
      if (stryMutAct_9fa48("71182")) {
        {}
      } else {
        stryCov_9fa48("71182");
        return null;
      }
    }
    const partitionId = readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID, stryMutAct_9fa48("71183") ? "" : (stryCov_9fa48("71183"), 'partitionId'), PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID, stryMutAct_9fa48("71184") ? "" : (stryCov_9fa48("71184"), 'entityId'));
    if (stryMutAct_9fa48("71187") ? false : stryMutAct_9fa48("71186") ? true : stryMutAct_9fa48("71185") ? partitionId : (stryCov_9fa48("71185", "71186", "71187"), !partitionId)) {
      if (stryMutAct_9fa48("71188")) {
        {}
      } else {
        stryCov_9fa48("71188");
        return null;
      }
    }
    const stepsHistory = parsePriorityRecoveryStepsHistory(stryMutAct_9fa48("71189") ? record.stepsHistory && record.steps_history : (stryCov_9fa48("71189"), record.stepsHistory ?? record.steps_history));
    const timelineSteps = normalizePriorityRecoveryStringList(stepsHistory.map(stryMutAct_9fa48("71190") ? () => undefined : (stryCov_9fa48("71190"), entry => stryMutAct_9fa48("71191") ? String(entry?.step || entry?.workflowStep || '') : (stryCov_9fa48("71191"), String(stryMutAct_9fa48("71194") ? (entry?.step || entry?.workflowStep) && '' : stryMutAct_9fa48("71193") ? false : stryMutAct_9fa48("71192") ? true : (stryCov_9fa48("71192", "71193", "71194"), (stryMutAct_9fa48("71196") ? entry?.step && entry?.workflowStep : stryMutAct_9fa48("71195") ? false : (stryCov_9fa48("71195", "71196"), (stryMutAct_9fa48("71197") ? entry.step : (stryCov_9fa48("71197"), entry?.step)) || (stryMutAct_9fa48("71198") ? entry.workflowStep : (stryCov_9fa48("71198"), entry?.workflowStep)))) || (stryMutAct_9fa48("71199") ? "Stryker was here!" : (stryCov_9fa48("71199"), '')))).trim()))));
    const latestTimelineEntry = (stryMutAct_9fa48("71203") ? stepsHistory.length <= NUM.ZERO : stryMutAct_9fa48("71202") ? stepsHistory.length >= NUM.ZERO : stryMutAct_9fa48("71201") ? false : stryMutAct_9fa48("71200") ? true : (stryCov_9fa48("71200", "71201", "71202", "71203"), stepsHistory.length > NUM.ZERO)) ? stepsHistory[stryMutAct_9fa48("71204") ? stepsHistory.length + NUM.ONE : (stryCov_9fa48("71204"), stepsHistory.length - NUM.ONE)] : null;
    return stryMutAct_9fa48("71205") ? {} : (stryCov_9fa48("71205"), {
      operationId,
      partitionId,
      tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
      type: stryMutAct_9fa48("71206") ? String(readFirstStringField(record, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.TYPE, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.OPERATION_TYPE, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.OPERATIONTYPE) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).toLowerCase() : (stryCov_9fa48("71206"), String(stryMutAct_9fa48("71209") ? readFirstStringField(record, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.TYPE, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.OPERATION_TYPE, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.OPERATIONTYPE) && PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("71208") ? false : stryMutAct_9fa48("71207") ? true : (stryCov_9fa48("71207", "71208", "71209"), readFirstStringField(record, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.TYPE, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.OPERATION_TYPE, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.OPERATIONTYPE) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE)).toUpperCase()),
      status: stryMutAct_9fa48("71210") ? String(readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.STATUS) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("71210"), String(stryMutAct_9fa48("71213") ? readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.STATUS) && PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("71212") ? false : stryMutAct_9fa48("71211") ? true : (stryCov_9fa48("71211", "71212", "71213"), readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.STATUS) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE)).toLowerCase()),
      workflowStep: stryMutAct_9fa48("71214") ? String(readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.WORKFLOWSTEP) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).toLowerCase() : (stryCov_9fa48("71214"), String(stryMutAct_9fa48("71217") ? readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.WORKFLOWSTEP) && PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("71216") ? false : stryMutAct_9fa48("71215") ? true : (stryCov_9fa48("71215", "71216", "71217"), readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.WORKFLOWSTEP) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE)).toUpperCase()),
      sourceNodeId: readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.SOURCENODEID),
      targetNodeId: readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.TARGETNODEID),
      replicaId: readFirstStringField(record, PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.REPLICAID, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.SERVICE_ID, PRIORITY_RECOVERY_SNAPSHOT_LITERAL.SERVICEID),
      createdAtMs: normalizePriorityRecoveryInteger(stryMutAct_9fa48("71218") ? record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] && record.createdAt : (stryCov_9fa48("71218"), record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] ?? record.createdAt)),
      updatedAtMs: normalizePriorityRecoveryInteger(stryMutAct_9fa48("71219") ? record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] && record.updatedAt : (stryCov_9fa48("71219"), record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] ?? record.updatedAt)),
      timelineLength: stepsHistory.length,
      timelineStepCount: timelineSteps.length,
      latestTimelineStep: stryMutAct_9fa48("71222") ? String(latestTimelineEntry?.step || latestTimelineEntry?.workflowStep || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).toUpperCase() && null : stryMutAct_9fa48("71221") ? false : stryMutAct_9fa48("71220") ? true : (stryCov_9fa48("71220", "71221", "71222"), (stryMutAct_9fa48("71223") ? String(latestTimelineEntry?.step || latestTimelineEntry?.workflowStep || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).toLowerCase() : (stryCov_9fa48("71223"), String(stryMutAct_9fa48("71226") ? (latestTimelineEntry?.step || latestTimelineEntry?.workflowStep) && PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("71225") ? false : stryMutAct_9fa48("71224") ? true : (stryCov_9fa48("71224", "71225", "71226"), (stryMutAct_9fa48("71228") ? latestTimelineEntry?.step && latestTimelineEntry?.workflowStep : stryMutAct_9fa48("71227") ? false : (stryCov_9fa48("71227", "71228"), (stryMutAct_9fa48("71229") ? latestTimelineEntry.step : (stryCov_9fa48("71229"), latestTimelineEntry?.step)) || (stryMutAct_9fa48("71230") ? latestTimelineEntry.workflowStep : (stryCov_9fa48("71230"), latestTimelineEntry?.workflowStep)))) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE)).toUpperCase())) || null),
      latestTimelineStatus: stryMutAct_9fa48("71233") ? String(latestTimelineEntry?.status || latestTimelineEntry?.state || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).toLowerCase() && null : stryMutAct_9fa48("71232") ? false : stryMutAct_9fa48("71231") ? true : (stryCov_9fa48("71231", "71232", "71233"), (stryMutAct_9fa48("71234") ? String(latestTimelineEntry?.status || latestTimelineEntry?.state || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).toUpperCase() : (stryCov_9fa48("71234"), String(stryMutAct_9fa48("71237") ? (latestTimelineEntry?.status || latestTimelineEntry?.state) && PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("71236") ? false : stryMutAct_9fa48("71235") ? true : (stryCov_9fa48("71235", "71236", "71237"), (stryMutAct_9fa48("71239") ? latestTimelineEntry?.status && latestTimelineEntry?.state : stryMutAct_9fa48("71238") ? false : (stryCov_9fa48("71238", "71239"), (stryMutAct_9fa48("71240") ? latestTimelineEntry.status : (stryCov_9fa48("71240"), latestTimelineEntry?.status)) || (stryMutAct_9fa48("71241") ? latestTimelineEntry.state : (stryCov_9fa48("71241"), latestTimelineEntry?.state)))) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE)).toLowerCase())) || null),
      latestTimelineInFlight: stryMutAct_9fa48("71244") ? latestTimelineEntry?.inFlight !== true : stryMutAct_9fa48("71243") ? false : stryMutAct_9fa48("71242") ? true : (stryCov_9fa48("71242", "71243", "71244"), (stryMutAct_9fa48("71245") ? latestTimelineEntry.inFlight : (stryCov_9fa48("71245"), latestTimelineEntry?.inFlight)) === (stryMutAct_9fa48("71246") ? false : (stryCov_9fa48("71246"), true)))
    });
  }
}
function resolvePriorityRecoveryOperationStepTerminalState(operationType, workflowStep) {
  if (stryMutAct_9fa48("71247")) {
    {}
  } else {
    stryCov_9fa48("71247");
    const normalizedOperationType = stryMutAct_9fa48("71248") ? String(operationType || '').toLowerCase() : (stryCov_9fa48("71248"), String(stryMutAct_9fa48("71251") ? operationType && '' : stryMutAct_9fa48("71250") ? false : stryMutAct_9fa48("71249") ? true : (stryCov_9fa48("71249", "71250", "71251"), operationType || (stryMutAct_9fa48("71252") ? "Stryker was here!" : (stryCov_9fa48("71252"), '')))).toUpperCase());
    const normalizedWorkflowStep = stryMutAct_9fa48("71253") ? String(workflowStep || '').toLowerCase() : (stryCov_9fa48("71253"), String(stryMutAct_9fa48("71256") ? workflowStep && '' : stryMutAct_9fa48("71255") ? false : stryMutAct_9fa48("71254") ? true : (stryCov_9fa48("71254", "71255", "71256"), workflowStep || (stryMutAct_9fa48("71257") ? "Stryker was here!" : (stryCov_9fa48("71257"), '')))).toUpperCase());
    if (stryMutAct_9fa48("71260") ? (normalizedOperationType.length === NUM.ZERO || normalizedWorkflowStep.length === NUM.ZERO) && !isValidReplicaOperationStep(normalizedOperationType, normalizedWorkflowStep) : stryMutAct_9fa48("71259") ? false : stryMutAct_9fa48("71258") ? true : (stryCov_9fa48("71258", "71259", "71260"), (stryMutAct_9fa48("71262") ? normalizedOperationType.length === NUM.ZERO && normalizedWorkflowStep.length === NUM.ZERO : stryMutAct_9fa48("71261") ? false : (stryCov_9fa48("71261", "71262"), (stryMutAct_9fa48("71264") ? normalizedOperationType.length !== NUM.ZERO : stryMutAct_9fa48("71263") ? false : (stryCov_9fa48("71263", "71264"), normalizedOperationType.length === NUM.ZERO)) || (stryMutAct_9fa48("71266") ? normalizedWorkflowStep.length !== NUM.ZERO : stryMutAct_9fa48("71265") ? false : (stryCov_9fa48("71265", "71266"), normalizedWorkflowStep.length === NUM.ZERO)))) || (stryMutAct_9fa48("71267") ? isValidReplicaOperationStep(normalizedOperationType, normalizedWorkflowStep) : (stryCov_9fa48("71267"), !isValidReplicaOperationStep(normalizedOperationType, normalizedWorkflowStep))))) {
      if (stryMutAct_9fa48("71268")) {
        {}
      } else {
        stryCov_9fa48("71268");
        return null;
      }
    }
    return isTerminalReplicaOperationStep(normalizedOperationType, normalizedWorkflowStep);
  }
}
function isPriorityRecoveryOperationContextTerminal(operationContext) {
  if (stryMutAct_9fa48("71269")) {
    {}
  } else {
    stryCov_9fa48("71269");
    if (stryMutAct_9fa48("71272") ? !operationContext && typeof operationContext !== TYPEOF.OBJECT : stryMutAct_9fa48("71271") ? false : stryMutAct_9fa48("71270") ? true : (stryCov_9fa48("71270", "71271", "71272"), (stryMutAct_9fa48("71273") ? operationContext : (stryCov_9fa48("71273"), !operationContext)) || (stryMutAct_9fa48("71275") ? typeof operationContext === TYPEOF.OBJECT : stryMutAct_9fa48("71274") ? false : (stryCov_9fa48("71274", "71275"), typeof operationContext !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("71276")) {
        {}
      } else {
        stryCov_9fa48("71276");
        return stryMutAct_9fa48("71277") ? true : (stryCov_9fa48("71277"), false);
      }
    }
    const operationType = stryMutAct_9fa48("71278") ? String(operationContext.type || '').toLowerCase() : (stryCov_9fa48("71278"), String(stryMutAct_9fa48("71281") ? operationContext.type && '' : stryMutAct_9fa48("71280") ? false : stryMutAct_9fa48("71279") ? true : (stryCov_9fa48("71279", "71280", "71281"), operationContext.type || (stryMutAct_9fa48("71282") ? "Stryker was here!" : (stryCov_9fa48("71282"), '')))).toUpperCase());
    const workflowStepTerminalState = resolvePriorityRecoveryOperationStepTerminalState(operationType, operationContext.workflowStep);
    if (stryMutAct_9fa48("71285") ? typeof workflowStepTerminalState !== TYPEOF.BOOLEAN : stryMutAct_9fa48("71284") ? false : stryMutAct_9fa48("71283") ? true : (stryCov_9fa48("71283", "71284", "71285"), typeof workflowStepTerminalState === TYPEOF.BOOLEAN)) {
      if (stryMutAct_9fa48("71286")) {
        {}
      } else {
        stryCov_9fa48("71286");
        return workflowStepTerminalState;
      }
    }
    const latestTimelineStepTerminalState = resolvePriorityRecoveryOperationStepTerminalState(operationType, operationContext.latestTimelineStep);
    if (stryMutAct_9fa48("71289") ? typeof latestTimelineStepTerminalState !== TYPEOF.BOOLEAN : stryMutAct_9fa48("71288") ? false : stryMutAct_9fa48("71287") ? true : (stryCov_9fa48("71287", "71288", "71289"), typeof latestTimelineStepTerminalState === TYPEOF.BOOLEAN)) {
      if (stryMutAct_9fa48("71290")) {
        {}
      } else {
        stryCov_9fa48("71290");
        return latestTimelineStepTerminalState;
      }
    }
    if (stryMutAct_9fa48("71293") ? operationContext.latestTimelineInFlight !== true : stryMutAct_9fa48("71292") ? false : stryMutAct_9fa48("71291") ? true : (stryCov_9fa48("71291", "71292", "71293"), operationContext.latestTimelineInFlight === (stryMutAct_9fa48("71294") ? false : (stryCov_9fa48("71294"), true)))) {
      if (stryMutAct_9fa48("71295")) {
        {}
      } else {
        stryCov_9fa48("71295");
        return stryMutAct_9fa48("71296") ? true : (stryCov_9fa48("71296"), false);
      }
    }
    const status = stryMutAct_9fa48("71297") ? String(operationContext.status || '').toUpperCase() : (stryCov_9fa48("71297"), String(stryMutAct_9fa48("71300") ? operationContext.status && '' : stryMutAct_9fa48("71299") ? false : stryMutAct_9fa48("71298") ? true : (stryCov_9fa48("71298", "71299", "71300"), operationContext.status || (stryMutAct_9fa48("71301") ? "Stryker was here!" : (stryCov_9fa48("71301"), '')))).toLowerCase());
    if (stryMutAct_9fa48("71304") ? status.length !== NUM.ZERO : stryMutAct_9fa48("71303") ? false : stryMutAct_9fa48("71302") ? true : (stryCov_9fa48("71302", "71303", "71304"), status.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("71305")) {
        {}
      } else {
        stryCov_9fa48("71305");
        return stryMutAct_9fa48("71306") ? true : (stryCov_9fa48("71306"), false);
      }
    }
    if (stryMutAct_9fa48("71309") ? status !== STATUS_ACTIVE : stryMutAct_9fa48("71308") ? false : stryMutAct_9fa48("71307") ? true : (stryCov_9fa48("71307", "71308", "71309"), status === STATUS_ACTIVE)) {
      if (stryMutAct_9fa48("71310")) {
        {}
      } else {
        stryCov_9fa48("71310");
        return stryMutAct_9fa48("71313") ? operationType === OperationType.REPLACE : stryMutAct_9fa48("71312") ? false : stryMutAct_9fa48("71311") ? true : (stryCov_9fa48("71311", "71312", "71313"), operationType !== OperationType.REPLACE);
      }
    }
    return PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET.has(status);
  }
}
function isPriorityRecoveryCompletedAddOperationContext(operationContext) {
  if (stryMutAct_9fa48("71314")) {
    {}
  } else {
    stryCov_9fa48("71314");
    if (stryMutAct_9fa48("71317") ? !operationContext && typeof operationContext !== TYPEOF.OBJECT : stryMutAct_9fa48("71316") ? false : stryMutAct_9fa48("71315") ? true : (stryCov_9fa48("71315", "71316", "71317"), (stryMutAct_9fa48("71318") ? operationContext : (stryCov_9fa48("71318"), !operationContext)) || (stryMutAct_9fa48("71320") ? typeof operationContext === TYPEOF.OBJECT : stryMutAct_9fa48("71319") ? false : (stryCov_9fa48("71319", "71320"), typeof operationContext !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("71321")) {
        {}
      } else {
        stryCov_9fa48("71321");
        return stryMutAct_9fa48("71322") ? true : (stryCov_9fa48("71322"), false);
      }
    }
    const operationType = stryMutAct_9fa48("71323") ? String(operationContext.type || '').toLowerCase() : (stryCov_9fa48("71323"), String(stryMutAct_9fa48("71326") ? operationContext.type && '' : stryMutAct_9fa48("71325") ? false : stryMutAct_9fa48("71324") ? true : (stryCov_9fa48("71324", "71325", "71326"), operationContext.type || (stryMutAct_9fa48("71327") ? "Stryker was here!" : (stryCov_9fa48("71327"), '')))).toUpperCase());
    if (stryMutAct_9fa48("71330") ? operationType === OperationType.ADD : stryMutAct_9fa48("71329") ? false : stryMutAct_9fa48("71328") ? true : (stryCov_9fa48("71328", "71329", "71330"), operationType !== OperationType.ADD)) {
      if (stryMutAct_9fa48("71331")) {
        {}
      } else {
        stryCov_9fa48("71331");
        return stryMutAct_9fa48("71332") ? true : (stryCov_9fa48("71332"), false);
      }
    }
    const workflowStep = stryMutAct_9fa48("71333") ? String(operationContext.workflowStep || '').toLowerCase() : (stryCov_9fa48("71333"), String(stryMutAct_9fa48("71336") ? operationContext.workflowStep && '' : stryMutAct_9fa48("71335") ? false : stryMutAct_9fa48("71334") ? true : (stryCov_9fa48("71334", "71335", "71336"), operationContext.workflowStep || (stryMutAct_9fa48("71337") ? "Stryker was here!" : (stryCov_9fa48("71337"), '')))).toUpperCase());
    if (stryMutAct_9fa48("71340") ? workflowStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE || resolvePriorityRecoveryOperationStepTerminalState(operationType, workflowStep) === true : stryMutAct_9fa48("71339") ? false : stryMutAct_9fa48("71338") ? true : (stryCov_9fa48("71338", "71339", "71340"), (stryMutAct_9fa48("71342") ? workflowStep !== PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE : stryMutAct_9fa48("71341") ? true : (stryCov_9fa48("71341", "71342"), workflowStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE)) && (stryMutAct_9fa48("71344") ? resolvePriorityRecoveryOperationStepTerminalState(operationType, workflowStep) !== true : stryMutAct_9fa48("71343") ? true : (stryCov_9fa48("71343", "71344"), resolvePriorityRecoveryOperationStepTerminalState(operationType, workflowStep) === (stryMutAct_9fa48("71345") ? false : (stryCov_9fa48("71345"), true)))))) {
      if (stryMutAct_9fa48("71346")) {
        {}
      } else {
        stryCov_9fa48("71346");
        return stryMutAct_9fa48("71347") ? false : (stryCov_9fa48("71347"), true);
      }
    }
    const latestTimelineStep = stryMutAct_9fa48("71348") ? String(operationContext.latestTimelineStep || '').toLowerCase() : (stryCov_9fa48("71348"), String(stryMutAct_9fa48("71351") ? operationContext.latestTimelineStep && '' : stryMutAct_9fa48("71350") ? false : stryMutAct_9fa48("71349") ? true : (stryCov_9fa48("71349", "71350", "71351"), operationContext.latestTimelineStep || (stryMutAct_9fa48("71352") ? "Stryker was here!" : (stryCov_9fa48("71352"), '')))).toUpperCase());
    return stryMutAct_9fa48("71355") ? latestTimelineStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE && operationContext.latestTimelineInFlight !== true || resolvePriorityRecoveryOperationStepTerminalState(operationType, latestTimelineStep) === true : stryMutAct_9fa48("71354") ? false : stryMutAct_9fa48("71353") ? true : (stryCov_9fa48("71353", "71354", "71355"), (stryMutAct_9fa48("71357") ? latestTimelineStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE || operationContext.latestTimelineInFlight !== true : stryMutAct_9fa48("71356") ? true : (stryCov_9fa48("71356", "71357"), (stryMutAct_9fa48("71359") ? latestTimelineStep !== PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE : stryMutAct_9fa48("71358") ? true : (stryCov_9fa48("71358", "71359"), latestTimelineStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE)) && (stryMutAct_9fa48("71361") ? operationContext.latestTimelineInFlight === true : stryMutAct_9fa48("71360") ? true : (stryCov_9fa48("71360", "71361"), operationContext.latestTimelineInFlight !== (stryMutAct_9fa48("71362") ? false : (stryCov_9fa48("71362"), true)))))) && (stryMutAct_9fa48("71364") ? resolvePriorityRecoveryOperationStepTerminalState(operationType, latestTimelineStep) !== true : stryMutAct_9fa48("71363") ? true : (stryCov_9fa48("71363", "71364"), resolvePriorityRecoveryOperationStepTerminalState(operationType, latestTimelineStep) === (stryMutAct_9fa48("71365") ? false : (stryCov_9fa48("71365"), true)))));
  }
}
function buildPriorityRecoveryAdmissionByPartitionId(workflowAdmissionsByWorkflowId = {}) {
  if (stryMutAct_9fa48("71366")) {
    {}
  } else {
    stryCov_9fa48("71366");
    const admissionByPartitionId = {};
    for (const workflow of Object.values(stryMutAct_9fa48("71369") ? workflowAdmissionsByWorkflowId && {} : stryMutAct_9fa48("71368") ? false : stryMutAct_9fa48("71367") ? true : (stryCov_9fa48("71367", "71368", "71369"), workflowAdmissionsByWorkflowId || {}))) {
      if (stryMutAct_9fa48("71370")) {
        {}
      } else {
        stryCov_9fa48("71370");
        if (stryMutAct_9fa48("71373") ? !workflow && typeof workflow !== TYPEOF.OBJECT : stryMutAct_9fa48("71372") ? false : stryMutAct_9fa48("71371") ? true : (stryCov_9fa48("71371", "71372", "71373"), (stryMutAct_9fa48("71374") ? workflow : (stryCov_9fa48("71374"), !workflow)) || (stryMutAct_9fa48("71376") ? typeof workflow === TYPEOF.OBJECT : stryMutAct_9fa48("71375") ? false : (stryCov_9fa48("71375", "71376"), typeof workflow !== TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("71377")) {
            {}
          } else {
            stryCov_9fa48("71377");
            continue;
          }
        }
        const workflowId = stryMutAct_9fa48("71378") ? String(workflow.workflowId || '') : (stryCov_9fa48("71378"), String(stryMutAct_9fa48("71381") ? workflow.workflowId && '' : stryMutAct_9fa48("71380") ? false : stryMutAct_9fa48("71379") ? true : (stryCov_9fa48("71379", "71380", "71381"), workflow.workflowId || (stryMutAct_9fa48("71382") ? "Stryker was here!" : (stryCov_9fa48("71382"), '')))).trim());
        if (stryMutAct_9fa48("71385") ? workflowId.length !== NUM.ZERO : stryMutAct_9fa48("71384") ? false : stryMutAct_9fa48("71383") ? true : (stryCov_9fa48("71383", "71384", "71385"), workflowId.length === NUM.ZERO)) {
          if (stryMutAct_9fa48("71386")) {
            {}
          } else {
            stryCov_9fa48("71386");
            continue;
          }
        }
        const admission = (stryMutAct_9fa48("71389") ? workflow.admission || typeof workflow.admission === TYPEOF.OBJECT : stryMutAct_9fa48("71388") ? false : stryMutAct_9fa48("71387") ? true : (stryCov_9fa48("71387", "71388", "71389"), workflow.admission && (stryMutAct_9fa48("71391") ? typeof workflow.admission !== TYPEOF.OBJECT : stryMutAct_9fa48("71390") ? true : (stryCov_9fa48("71390", "71391"), typeof workflow.admission === TYPEOF.OBJECT)))) ? workflow.admission : null;
        const partitionIds = normalizePriorityRecoveryStringList(stryMutAct_9fa48("71392") ? [] : (stryCov_9fa48("71392"), [workflow.sourcePartitionId, ...(Array.isArray(workflow.targetPartitionIds) ? workflow.targetPartitionIds : stryMutAct_9fa48("71393") ? ["Stryker was here"] : (stryCov_9fa48("71393"), []))]));
        for (const partitionId of partitionIds) {
          if (stryMutAct_9fa48("71394")) {
            {}
          } else {
            stryCov_9fa48("71394");
            admissionByPartitionId[partitionId] = stryMutAct_9fa48("71395") ? {} : (stryCov_9fa48("71395"), {
              workflowId,
              workflowType: stryMutAct_9fa48("71398") ? workflow.workflowType && null : stryMutAct_9fa48("71397") ? false : stryMutAct_9fa48("71396") ? true : (stryCov_9fa48("71396", "71397", "71398"), workflow.workflowType || null),
              transitionState: stryMutAct_9fa48("71401") ? workflow.transitionState && null : stryMutAct_9fa48("71400") ? false : stryMutAct_9fa48("71399") ? true : (stryCov_9fa48("71399", "71400", "71401"), workflow.transitionState || null),
              decisionType: stryMutAct_9fa48("71404") ? admission?.decisionType && null : stryMutAct_9fa48("71403") ? false : stryMutAct_9fa48("71402") ? true : (stryCov_9fa48("71402", "71403", "71404"), (stryMutAct_9fa48("71405") ? admission.decisionType : (stryCov_9fa48("71405"), admission?.decisionType)) || null),
              decisionDimension: stryMutAct_9fa48("71408") ? admission?.decisionDimension && null : stryMutAct_9fa48("71407") ? false : stryMutAct_9fa48("71406") ? true : (stryCov_9fa48("71406", "71407", "71408"), (stryMutAct_9fa48("71409") ? admission.decisionDimension : (stryCov_9fa48("71409"), admission?.decisionDimension)) || null),
              admissionDecisionAt: stryMutAct_9fa48("71412") ? workflow.admissionDecisionAt && null : stryMutAct_9fa48("71411") ? false : stryMutAct_9fa48("71410") ? true : (stryCov_9fa48("71410", "71411", "71412"), workflow.admissionDecisionAt || null),
              eligibleNodeIds: normalizePriorityRecoveryStringList(stryMutAct_9fa48("71413") ? admission.eligibleNodeIds : (stryCov_9fa48("71413"), admission?.eligibleNodeIds)),
              ineligibleNodes: Array.isArray(stryMutAct_9fa48("71414") ? admission.ineligibleNodes : (stryCov_9fa48("71414"), admission?.ineligibleNodes)) ? stryMutAct_9fa48("71415") ? admission.ineligibleNodes.map(entry => ({
                nodeId: String(entry?.nodeId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE),
                reasonCodes: normalizePriorityRecoveryStringList(entry?.reasonCodes)
              })) : (stryCov_9fa48("71415"), admission.ineligibleNodes.map(stryMutAct_9fa48("71416") ? () => undefined : (stryCov_9fa48("71416"), entry => stryMutAct_9fa48("71417") ? {} : (stryCov_9fa48("71417"), {
                nodeId: String(stryMutAct_9fa48("71420") ? entry?.nodeId && PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE : stryMutAct_9fa48("71419") ? false : stryMutAct_9fa48("71418") ? true : (stryCov_9fa48("71418", "71419", "71420"), (stryMutAct_9fa48("71421") ? entry.nodeId : (stryCov_9fa48("71421"), entry?.nodeId)) || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE)),
                reasonCodes: normalizePriorityRecoveryStringList(stryMutAct_9fa48("71422") ? entry.reasonCodes : (stryCov_9fa48("71422"), entry?.reasonCodes))
              }))).filter(stryMutAct_9fa48("71423") ? () => undefined : (stryCov_9fa48("71423"), entry => stryMutAct_9fa48("71427") ? entry.nodeId.length <= NUM.ZERO : stryMutAct_9fa48("71426") ? entry.nodeId.length >= NUM.ZERO : stryMutAct_9fa48("71425") ? false : stryMutAct_9fa48("71424") ? true : (stryCov_9fa48("71424", "71425", "71426", "71427"), entry.nodeId.length > NUM.ZERO)))) : stryMutAct_9fa48("71428") ? ["Stryker was here"] : (stryCov_9fa48("71428"), []),
              blockingReasons: normalizePriorityRecoveryStringList(workflow.blockingReasons)
            });
          }
        }
      }
    }
    return admissionByPartitionId;
  }
}
function buildPriorityRecoveryLearnerPromotionByPartitionId(serviceRows = stryMutAct_9fa48("71429") ? ["Stryker was here"] : (stryCov_9fa48("71429"), []), readinessByNodeId = {}) {
  if (stryMutAct_9fa48("71430")) {
    {}
  } else {
    stryCov_9fa48("71430");
    const learnerByPartitionId = {};
    for (const serviceRow of Array.isArray(serviceRows) ? serviceRows : stryMutAct_9fa48("71431") ? ["Stryker was here"] : (stryCov_9fa48("71431"), [])) {
      if (stryMutAct_9fa48("71432")) {
        {}
      } else {
        stryCov_9fa48("71432");
        const partitionId = readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID, stryMutAct_9fa48("71433") ? "" : (stryCov_9fa48("71433"), 'partitionId'));
        if (stryMutAct_9fa48("71436") ? false : stryMutAct_9fa48("71435") ? true : stryMutAct_9fa48("71434") ? partitionId : (stryCov_9fa48("71434", "71435", "71436"), !partitionId)) {
          if (stryMutAct_9fa48("71437")) {
            {}
          } else {
            stryCov_9fa48("71437");
            continue;
          }
        }
        const status = stryMutAct_9fa48("71438") ? String(readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_STATUS, 'status') || '').toUpperCase() : (stryCov_9fa48("71438"), String(stryMutAct_9fa48("71441") ? readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_STATUS, 'status') && '' : stryMutAct_9fa48("71440") ? false : stryMutAct_9fa48("71439") ? true : (stryCov_9fa48("71439", "71440", "71441"), readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_STATUS, stryMutAct_9fa48("71442") ? "" : (stryCov_9fa48("71442"), 'status')) || (stryMutAct_9fa48("71443") ? "Stryker was here!" : (stryCov_9fa48("71443"), '')))).toLowerCase());
        const raftRole = stryMutAct_9fa48("71444") ? String(readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE, 'raftRole') || '').toUpperCase() : (stryCov_9fa48("71444"), String(stryMutAct_9fa48("71447") ? readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE, 'raftRole') && '' : stryMutAct_9fa48("71446") ? false : stryMutAct_9fa48("71445") ? true : (stryCov_9fa48("71445", "71446", "71447"), readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE, stryMutAct_9fa48("71448") ? "" : (stryCov_9fa48("71448"), 'raftRole')) || (stryMutAct_9fa48("71449") ? "Stryker was here!" : (stryCov_9fa48("71449"), '')))).toLowerCase());
        if (stryMutAct_9fa48("71452") ? status !== PRIORITY_RECOVERY_STATUS_ACTIVE && raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER : stryMutAct_9fa48("71451") ? false : stryMutAct_9fa48("71450") ? true : (stryCov_9fa48("71450", "71451", "71452"), (stryMutAct_9fa48("71454") ? status === PRIORITY_RECOVERY_STATUS_ACTIVE : stryMutAct_9fa48("71453") ? false : (stryCov_9fa48("71453", "71454"), status !== PRIORITY_RECOVERY_STATUS_ACTIVE)) || (stryMutAct_9fa48("71456") ? raftRole === PRIORITY_RECOVERY_RAFT_ROLE_LEARNER : stryMutAct_9fa48("71455") ? false : (stryCov_9fa48("71455", "71456"), raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER)))) {
          if (stryMutAct_9fa48("71457")) {
            {}
          } else {
            stryCov_9fa48("71457");
            continue;
          }
        }
        const nodeId = readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID, stryMutAct_9fa48("71458") ? "" : (stryCov_9fa48("71458"), 'nodeId'));
        if (stryMutAct_9fa48("71461") ? false : stryMutAct_9fa48("71460") ? true : stryMutAct_9fa48("71459") ? nodeId : (stryCov_9fa48("71459", "71460", "71461"), !nodeId)) {
          if (stryMutAct_9fa48("71462")) {
            {}
          } else {
            stryCov_9fa48("71462");
            continue;
          }
        }
        if (stryMutAct_9fa48("71465") ? false : stryMutAct_9fa48("71464") ? true : stryMutAct_9fa48("71463") ? learnerByPartitionId[partitionId] : (stryCov_9fa48("71463", "71464", "71465"), !learnerByPartitionId[partitionId])) {
          if (stryMutAct_9fa48("71466")) {
            {}
          } else {
            stryCov_9fa48("71466");
            learnerByPartitionId[partitionId] = stryMutAct_9fa48("71467") ? ["Stryker was here"] : (stryCov_9fa48("71467"), []);
          }
        }
        learnerByPartitionId[partitionId].push(nodeId);
      }
    }
    const learnerPromotionByPartitionId = {};
    for (const [partitionId, learnerNodeIds] of Object.entries(learnerByPartitionId)) {
      if (stryMutAct_9fa48("71468")) {
        {}
      } else {
        stryCov_9fa48("71468");
        const learnerHoldByNodeId = {};
        const promotableLearnerNodeIds = stryMutAct_9fa48("71469") ? ["Stryker was here"] : (stryCov_9fa48("71469"), []);
        for (const nodeId of normalizePriorityRecoveryStringList(learnerNodeIds)) {
          if (stryMutAct_9fa48("71470")) {
            {}
          } else {
            stryCov_9fa48("71470");
            const readiness = stryMutAct_9fa48("71473") ? readinessByNodeId[nodeId] && null : stryMutAct_9fa48("71472") ? false : stryMutAct_9fa48("71471") ? true : (stryCov_9fa48("71471", "71472", "71473"), readinessByNodeId[nodeId] || null);
            const dimensions = (stryMutAct_9fa48("71476") ? readiness?.dimensions || typeof readiness.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("71475") ? false : stryMutAct_9fa48("71474") ? true : (stryCov_9fa48("71474", "71475", "71476"), (stryMutAct_9fa48("71477") ? readiness.dimensions : (stryCov_9fa48("71477"), readiness?.dimensions)) && (stryMutAct_9fa48("71479") ? typeof readiness.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("71478") ? true : (stryCov_9fa48("71478", "71479"), typeof readiness.dimensions === TYPEOF.OBJECT)))) ? readiness.dimensions : {};
            const repairEligible = stryMutAct_9fa48("71482") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true : stryMutAct_9fa48("71481") ? false : stryMutAct_9fa48("71480") ? true : (stryCov_9fa48("71480", "71481", "71482"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === (stryMutAct_9fa48("71483") ? false : (stryCov_9fa48("71483"), true)));
            const recoveryEligible = stryMutAct_9fa48("71486") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true : stryMutAct_9fa48("71485") ? false : stryMutAct_9fa48("71484") ? true : (stryCov_9fa48("71484", "71485", "71486"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === (stryMutAct_9fa48("71487") ? false : (stryCov_9fa48("71487"), true)));
            if (stryMutAct_9fa48("71489") ? false : stryMutAct_9fa48("71488") ? true : (stryCov_9fa48("71488", "71489"), repairEligible)) {
              if (stryMutAct_9fa48("71490")) {
                {}
              } else {
                stryCov_9fa48("71490");
                promotableLearnerNodeIds.push(nodeId);
                continue;
              }
            }
            const reasonCodes = resolvePriorityRecoveryReasonCodesFromReadiness(readiness);
            learnerHoldByNodeId[nodeId] = stryMutAct_9fa48("71491") ? {} : (stryCov_9fa48("71491"), {
              holdReason: readiness ? recoveryEligible ? PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY : PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE : PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
              reasonCodes
            });
          }
        }
        learnerPromotionByPartitionId[partitionId] = stryMutAct_9fa48("71492") ? {} : (stryCov_9fa48("71492"), {
          activeLearnerNodeIds: normalizePriorityRecoveryStringList(learnerNodeIds),
          promotableLearnerNodeIds,
          activeLearnerNodeCount: learnerNodeIds.length,
          promotableLearnerNodeCount: promotableLearnerNodeIds.length,
          learnerHoldByNodeId
        });
      }
    }
    return learnerPromotionByPartitionId;
  }
}
function buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence) {
  if (stryMutAct_9fa48("71493")) {
    {}
  } else {
    stryCov_9fa48("71493");
    const projectionDiagnostics = (stryMutAct_9fa48("71496") ? publicationConvergence?.projectionDiagnostics || typeof publicationConvergence.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("71495") ? false : stryMutAct_9fa48("71494") ? true : (stryCov_9fa48("71494", "71495", "71496"), (stryMutAct_9fa48("71497") ? publicationConvergence.projectionDiagnostics : (stryCov_9fa48("71497"), publicationConvergence?.projectionDiagnostics)) && (stryMutAct_9fa48("71499") ? typeof publicationConvergence.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("71498") ? true : (stryCov_9fa48("71498", "71499"), typeof publicationConvergence.projectionDiagnostics === TYPEOF.OBJECT)))) ? publicationConvergence.projectionDiagnostics : (stryMutAct_9fa48("71502") ? publicationConvergence?.membershipLifecycleSummary?.projectionDiagnostics || typeof publicationConvergence.membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("71501") ? false : stryMutAct_9fa48("71500") ? true : (stryCov_9fa48("71500", "71501", "71502"), (stryMutAct_9fa48("71504") ? publicationConvergence.membershipLifecycleSummary?.projectionDiagnostics : stryMutAct_9fa48("71503") ? publicationConvergence?.membershipLifecycleSummary.projectionDiagnostics : (stryCov_9fa48("71503", "71504"), publicationConvergence?.membershipLifecycleSummary?.projectionDiagnostics)) && (stryMutAct_9fa48("71506") ? typeof publicationConvergence.membershipLifecycleSummary.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("71505") ? true : (stryCov_9fa48("71505", "71506"), typeof publicationConvergence.membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT)))) ? publicationConvergence.membershipLifecycleSummary.projectionDiagnostics : null;
    const inclusionReasonsByNodeId = {};
    const exclusionReasonsByNodeId = {};
    for (const nodeId of normalizePriorityRecoveryStringList(stryMutAct_9fa48("71507") ? projectionDiagnostics.recoveryEligibleIncludedNodeIds : (stryCov_9fa48("71507"), projectionDiagnostics?.recoveryEligibleIncludedNodeIds))) {
      if (stryMutAct_9fa48("71508")) {
        {}
      } else {
        stryCov_9fa48("71508");
        inclusionReasonsByNodeId[nodeId] = stryMutAct_9fa48("71509") ? [] : (stryCov_9fa48("71509"), [PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED]);
      }
    }
    for (const nodeId of normalizePriorityRecoveryStringList(stryMutAct_9fa48("71510") ? projectionDiagnostics.readinessExcludedNodeIds : (stryCov_9fa48("71510"), projectionDiagnostics?.readinessExcludedNodeIds))) {
      if (stryMutAct_9fa48("71511")) {
        {}
      } else {
        stryCov_9fa48("71511");
        exclusionReasonsByNodeId[nodeId] = stryMutAct_9fa48("71512") ? [] : (stryCov_9fa48("71512"), [PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED]);
      }
    }
    for (const nodeId of normalizePriorityRecoveryStringList(stryMutAct_9fa48("71513") ? projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds : (stryCov_9fa48("71513"), projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds))) {
      if (stryMutAct_9fa48("71514")) {
        {}
      } else {
        stryCov_9fa48("71514");
        exclusionReasonsByNodeId[nodeId] = stryMutAct_9fa48("71515") ? [] : (stryCov_9fa48("71515"), [...(Array.isArray(exclusionReasonsByNodeId[nodeId]) ? exclusionReasonsByNodeId[nodeId] : stryMutAct_9fa48("71516") ? ["Stryker was here"] : (stryCov_9fa48("71516"), [])), PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY]);
      }
    }
    return stryMutAct_9fa48("71517") ? {} : (stryCov_9fa48("71517"), {
      inclusionReasonsByNodeId,
      exclusionReasonsByNodeId
    });
  }
}
function buildEffectivePriorityRecoveryAdmission(admission, options = {}) {
  if (stryMutAct_9fa48("71518")) {
    {}
  } else {
    stryCov_9fa48("71518");
    const normalizedAdmission = (stryMutAct_9fa48("71521") ? admission || typeof admission === TYPEOF.OBJECT : stryMutAct_9fa48("71520") ? false : stryMutAct_9fa48("71519") ? true : (stryCov_9fa48("71519", "71520", "71521"), admission && (stryMutAct_9fa48("71523") ? typeof admission !== TYPEOF.OBJECT : stryMutAct_9fa48("71522") ? true : (stryCov_9fa48("71522", "71523"), typeof admission === TYPEOF.OBJECT)))) ? admission : {};
    const explicitEligibleNodeIds = normalizePriorityRecoveryStringList(normalizedAdmission.eligibleNodeIds);
    const publicationEligibleNodeIds = normalizePriorityRecoveryStringList(options.publicationEligibleNodeIds);
    const projectionEligibleNodeIds = normalizePriorityRecoveryStringList(options.recoveryEligibleIncludedNodeIds);
    const readyEligibleNodeCount = stryMutAct_9fa48("71524") ? Math.min(NUM.ZERO, normalizePriorityRecoveryInteger(options.prioritySummaryReadyEligibleNodeCount) || NUM.ZERO) : (stryCov_9fa48("71524"), Math.max(NUM.ZERO, stryMutAct_9fa48("71527") ? normalizePriorityRecoveryInteger(options.prioritySummaryReadyEligibleNodeCount) && NUM.ZERO : stryMutAct_9fa48("71526") ? false : stryMutAct_9fa48("71525") ? true : (stryCov_9fa48("71525", "71526", "71527"), normalizePriorityRecoveryInteger(options.prioritySummaryReadyEligibleNodeCount) || NUM.ZERO)));
    let effectiveEligibleNodeIds = explicitEligibleNodeIds;
    let effectiveEligibleNodeCount = explicitEligibleNodeIds.length;
    let eligibilityEvidenceSource = PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.UNKNOWN;
    if (stryMutAct_9fa48("71531") ? effectiveEligibleNodeCount <= NUM.ZERO : stryMutAct_9fa48("71530") ? effectiveEligibleNodeCount >= NUM.ZERO : stryMutAct_9fa48("71529") ? false : stryMutAct_9fa48("71528") ? true : (stryCov_9fa48("71528", "71529", "71530", "71531"), effectiveEligibleNodeCount > NUM.ZERO)) {
      if (stryMutAct_9fa48("71532")) {
        {}
      } else {
        stryCov_9fa48("71532");
        eligibilityEvidenceSource = PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.WORKFLOW_ADMISSION;
      }
    } else if (stryMutAct_9fa48("71536") ? publicationEligibleNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("71535") ? publicationEligibleNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("71534") ? false : stryMutAct_9fa48("71533") ? true : (stryCov_9fa48("71533", "71534", "71535", "71536"), publicationEligibleNodeIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("71537")) {
        {}
      } else {
        stryCov_9fa48("71537");
        effectiveEligibleNodeIds = publicationEligibleNodeIds;
        effectiveEligibleNodeCount = publicationEligibleNodeIds.length;
        eligibilityEvidenceSource = PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PUBLICATION_MEMBERSHIP;
      }
    } else if (stryMutAct_9fa48("71541") ? projectionEligibleNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("71540") ? projectionEligibleNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("71539") ? false : stryMutAct_9fa48("71538") ? true : (stryCov_9fa48("71538", "71539", "71540", "71541"), projectionEligibleNodeIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("71542")) {
        {}
      } else {
        stryCov_9fa48("71542");
        effectiveEligibleNodeIds = projectionEligibleNodeIds;
        effectiveEligibleNodeCount = projectionEligibleNodeIds.length;
        eligibilityEvidenceSource = PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PUBLICATION_RECOVERY_PROJECTION;
      }
    } else if (stryMutAct_9fa48("71546") ? readyEligibleNodeCount <= NUM.ZERO : stryMutAct_9fa48("71545") ? readyEligibleNodeCount >= NUM.ZERO : stryMutAct_9fa48("71544") ? false : stryMutAct_9fa48("71543") ? true : (stryCov_9fa48("71543", "71544", "71545", "71546"), readyEligibleNodeCount > NUM.ZERO)) {
      if (stryMutAct_9fa48("71547")) {
        {}
      } else {
        stryCov_9fa48("71547");
        effectiveEligibleNodeCount = readyEligibleNodeCount;
        eligibilityEvidenceSource = PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PRIORITY_SUMMARY_READY_ELIGIBLE;
      }
    }
    return stryMutAct_9fa48("71548") ? {} : (stryCov_9fa48("71548"), {
      workflowId: stryMutAct_9fa48("71551") ? normalizedAdmission.workflowId && null : stryMutAct_9fa48("71550") ? false : stryMutAct_9fa48("71549") ? true : (stryCov_9fa48("71549", "71550", "71551"), normalizedAdmission.workflowId || null),
      workflowType: stryMutAct_9fa48("71554") ? normalizedAdmission.workflowType && null : stryMutAct_9fa48("71553") ? false : stryMutAct_9fa48("71552") ? true : (stryCov_9fa48("71552", "71553", "71554"), normalizedAdmission.workflowType || null),
      transitionState: stryMutAct_9fa48("71557") ? normalizedAdmission.transitionState && null : stryMutAct_9fa48("71556") ? false : stryMutAct_9fa48("71555") ? true : (stryCov_9fa48("71555", "71556", "71557"), normalizedAdmission.transitionState || null),
      decisionType: stryMutAct_9fa48("71560") ? normalizedAdmission.decisionType && null : stryMutAct_9fa48("71559") ? false : stryMutAct_9fa48("71558") ? true : (stryCov_9fa48("71558", "71559", "71560"), normalizedAdmission.decisionType || null),
      decisionDimension: stryMutAct_9fa48("71563") ? normalizedAdmission.decisionDimension && null : stryMutAct_9fa48("71562") ? false : stryMutAct_9fa48("71561") ? true : (stryCov_9fa48("71561", "71562", "71563"), normalizedAdmission.decisionDimension || null),
      admissionDecisionAt: stryMutAct_9fa48("71566") ? normalizedAdmission.admissionDecisionAt && null : stryMutAct_9fa48("71565") ? false : stryMutAct_9fa48("71564") ? true : (stryCov_9fa48("71564", "71565", "71566"), normalizedAdmission.admissionDecisionAt || null),
      eligibleNodeIds: explicitEligibleNodeIds,
      ineligibleNodes: Array.isArray(normalizedAdmission.ineligibleNodes) ? normalizedAdmission.ineligibleNodes : stryMutAct_9fa48("71567") ? ["Stryker was here"] : (stryCov_9fa48("71567"), []),
      blockingReasons: normalizePriorityRecoveryStringList(normalizedAdmission.blockingReasons),
      effectiveEligibleNodeIds,
      effectiveEligibleNodeCount,
      eligibilityEvidenceSource,
      eligibilityCohortComplete: stryMutAct_9fa48("71570") ? effectiveEligibleNodeIds.length !== effectiveEligibleNodeCount : stryMutAct_9fa48("71569") ? false : stryMutAct_9fa48("71568") ? true : (stryCov_9fa48("71568", "71569", "71570"), effectiveEligibleNodeIds.length === effectiveEligibleNodeCount),
      decisionMissing: stryMutAct_9fa48("71573") ? normalizedAdmission.decisionType === null && normalizedAdmission.decisionDimension === null && explicitEligibleNodeIds.length === NUM.ZERO && (!Array.isArray(normalizedAdmission.ineligibleNodes) || normalizedAdmission.ineligibleNodes.length === NUM.ZERO) || !Array.isArray(normalizedAdmission.blockingReasons) || normalizedAdmission.blockingReasons.length === NUM.ZERO : stryMutAct_9fa48("71572") ? false : stryMutAct_9fa48("71571") ? true : (stryCov_9fa48("71571", "71572", "71573"), (stryMutAct_9fa48("71575") ? normalizedAdmission.decisionType === null && normalizedAdmission.decisionDimension === null && explicitEligibleNodeIds.length === NUM.ZERO || !Array.isArray(normalizedAdmission.ineligibleNodes) || normalizedAdmission.ineligibleNodes.length === NUM.ZERO : stryMutAct_9fa48("71574") ? true : (stryCov_9fa48("71574", "71575"), (stryMutAct_9fa48("71577") ? normalizedAdmission.decisionType === null && normalizedAdmission.decisionDimension === null || explicitEligibleNodeIds.length === NUM.ZERO : stryMutAct_9fa48("71576") ? true : (stryCov_9fa48("71576", "71577"), (stryMutAct_9fa48("71579") ? normalizedAdmission.decisionType === null || normalizedAdmission.decisionDimension === null : stryMutAct_9fa48("71578") ? true : (stryCov_9fa48("71578", "71579"), (stryMutAct_9fa48("71581") ? normalizedAdmission.decisionType !== null : stryMutAct_9fa48("71580") ? true : (stryCov_9fa48("71580", "71581"), normalizedAdmission.decisionType === null)) && (stryMutAct_9fa48("71583") ? normalizedAdmission.decisionDimension !== null : stryMutAct_9fa48("71582") ? true : (stryCov_9fa48("71582", "71583"), normalizedAdmission.decisionDimension === null)))) && (stryMutAct_9fa48("71585") ? explicitEligibleNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("71584") ? true : (stryCov_9fa48("71584", "71585"), explicitEligibleNodeIds.length === NUM.ZERO)))) && (stryMutAct_9fa48("71587") ? !Array.isArray(normalizedAdmission.ineligibleNodes) && normalizedAdmission.ineligibleNodes.length === NUM.ZERO : stryMutAct_9fa48("71586") ? true : (stryCov_9fa48("71586", "71587"), (stryMutAct_9fa48("71588") ? Array.isArray(normalizedAdmission.ineligibleNodes) : (stryCov_9fa48("71588"), !Array.isArray(normalizedAdmission.ineligibleNodes))) || (stryMutAct_9fa48("71590") ? normalizedAdmission.ineligibleNodes.length !== NUM.ZERO : stryMutAct_9fa48("71589") ? false : (stryCov_9fa48("71589", "71590"), normalizedAdmission.ineligibleNodes.length === NUM.ZERO)))))) && (stryMutAct_9fa48("71592") ? !Array.isArray(normalizedAdmission.blockingReasons) && normalizedAdmission.blockingReasons.length === NUM.ZERO : stryMutAct_9fa48("71591") ? true : (stryCov_9fa48("71591", "71592"), (stryMutAct_9fa48("71593") ? Array.isArray(normalizedAdmission.blockingReasons) : (stryCov_9fa48("71593"), !Array.isArray(normalizedAdmission.blockingReasons))) || (stryMutAct_9fa48("71595") ? normalizedAdmission.blockingReasons.length !== NUM.ZERO : stryMutAct_9fa48("71594") ? false : (stryCov_9fa48("71594", "71595"), normalizedAdmission.blockingReasons.length === NUM.ZERO)))))
    });
  }
}
function buildPriorityRecoveryDecisionSnapshots(options = {}) {
  if (stryMutAct_9fa48("71596")) {
    {}
  } else {
    stryCov_9fa48("71596");
    const publicationConvergence = (stryMutAct_9fa48("71599") ? options.publicationConvergence || typeof options.publicationConvergence === TYPEOF.OBJECT : stryMutAct_9fa48("71598") ? false : stryMutAct_9fa48("71597") ? true : (stryCov_9fa48("71597", "71598", "71599"), options.publicationConvergence && (stryMutAct_9fa48("71601") ? typeof options.publicationConvergence !== TYPEOF.OBJECT : stryMutAct_9fa48("71600") ? true : (stryCov_9fa48("71600", "71601"), typeof options.publicationConvergence === TYPEOF.OBJECT)))) ? options.publicationConvergence : null;
    const publicationEpoch = normalizePriorityRecoveryInteger(stryMutAct_9fa48("71602") ? publicationConvergence.publicationEpoch : (stryCov_9fa48("71602"), publicationConvergence?.publicationEpoch));
    const readinessByNodeId = (stryMutAct_9fa48("71605") ? options.readinessByNodeId || typeof options.readinessByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("71604") ? false : stryMutAct_9fa48("71603") ? true : (stryCov_9fa48("71603", "71604", "71605"), options.readinessByNodeId && (stryMutAct_9fa48("71607") ? typeof options.readinessByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("71606") ? true : (stryCov_9fa48("71606", "71607"), typeof options.readinessByNodeId === TYPEOF.OBJECT)))) ? options.readinessByNodeId : {};
    const priorityPartitionSummary = stryMutAct_9fa48("71610") ? publicationConvergence?.priorityPartitionSummary && null : stryMutAct_9fa48("71609") ? false : stryMutAct_9fa48("71608") ? true : (stryCov_9fa48("71608", "71609", "71610"), (stryMutAct_9fa48("71611") ? publicationConvergence.priorityPartitionSummary : (stryCov_9fa48("71611"), publicationConvergence?.priorityPartitionSummary)) || null);
    const plannerByPartitionId = buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary);
    const publicationContext = buildPriorityRecoveryPublicationContext(publicationConvergence);
    const admissionByPartitionId = buildPriorityRecoveryAdmissionByPartitionId(options.workflowAdmissionsByWorkflowId);
    const replicaOperationContexts = buildPriorityRecoveryReplicaOperationContexts(options.replicaOperationRows, options.replicaOperations);
    const learnerPromotionByPartitionId = buildPriorityRecoveryLearnerPromotionByPartitionId(options.serviceRows, readinessByNodeId);
    const publicationNodeDecisions = buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence);
    const allPartitionIds = new Set(stryMutAct_9fa48("71612") ? [] : (stryCov_9fa48("71612"), [...Object.keys(plannerByPartitionId), ...Object.keys(admissionByPartitionId), ...Object.keys(replicaOperationContexts.byPartitionId), ...Object.keys(learnerPromotionByPartitionId)]));
    const snapshots = stryMutAct_9fa48("71613") ? ["Stryker was here"] : (stryCov_9fa48("71613"), []);
    const blockerPartitionIdsByReason = {};
    for (const blockerReason of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
      if (stryMutAct_9fa48("71614")) {
        {}
      } else {
        stryCov_9fa48("71614");
        blockerPartitionIdsByReason[blockerReason] = new Set();
      }
    }
    const partitionIdsBySemanticState = buildPriorityRecoverySemanticPartitionSetMap();
    for (const partitionId of stryMutAct_9fa48("71615") ? [...allPartitionIds] : (stryCov_9fa48("71615"), (stryMutAct_9fa48("71616") ? [] : (stryCov_9fa48("71616"), [...allPartitionIds])).sort())) {
      if (stryMutAct_9fa48("71617")) {
        {}
      } else {
        stryCov_9fa48("71617");
        const planner = buildPriorityRecoveryPlannerEntry(partitionId, priorityPartitionSummary, plannerByPartitionId);
        const admission = buildEffectivePriorityRecoveryAdmission(stryMutAct_9fa48("71620") ? admissionByPartitionId[partitionId] && null : stryMutAct_9fa48("71619") ? false : stryMutAct_9fa48("71618") ? true : (stryCov_9fa48("71618", "71619", "71620"), admissionByPartitionId[partitionId] || null), stryMutAct_9fa48("71621") ? {} : (stryCov_9fa48("71621"), {
          publicationEligibleNodeIds: publicationContext.concreteEligibleNodeIds,
          recoveryEligibleIncludedNodeIds: publicationContext.recoveryEligibleIncludedNodeIds,
          prioritySummaryReadyEligibleNodeCount: stryMutAct_9fa48("71622") ? priorityPartitionSummary.readyEligibleNodeCount : (stryCov_9fa48("71622"), priorityPartitionSummary?.readyEligibleNodeCount)
        }));
        const learnerPromotion = stryMutAct_9fa48("71625") ? learnerPromotionByPartitionId[partitionId] && {
          activeLearnerNodeIds: [],
          promotableLearnerNodeIds: [],
          activeLearnerNodeCount: 0,
          promotableLearnerNodeCount: 0,
          learnerHoldByNodeId: {}
        } : stryMutAct_9fa48("71624") ? false : stryMutAct_9fa48("71623") ? true : (stryCov_9fa48("71623", "71624", "71625"), learnerPromotionByPartitionId[partitionId] || (stryMutAct_9fa48("71626") ? {} : (stryCov_9fa48("71626"), {
          activeLearnerNodeIds: stryMutAct_9fa48("71627") ? ["Stryker was here"] : (stryCov_9fa48("71627"), []),
          promotableLearnerNodeIds: stryMutAct_9fa48("71628") ? ["Stryker was here"] : (stryCov_9fa48("71628"), []),
          activeLearnerNodeCount: 0,
          promotableLearnerNodeCount: 0,
          learnerHoldByNodeId: {}
        })));
        const operationContexts = Array.isArray(replicaOperationContexts.byPartitionId[partitionId]) ? replicaOperationContexts.byPartitionId[partitionId] : stryMutAct_9fa48("71629") ? ["Stryker was here"] : (stryCov_9fa48("71629"), []);
        const assessment = buildPriorityRecoveryPartitionAssessment(stryMutAct_9fa48("71630") ? {} : (stryCov_9fa48("71630"), {
          partitionId,
          priorityPartitionSummary,
          planner,
          admission,
          learnerPromotion,
          operationContexts
        }));
        const operationIds = (stryMutAct_9fa48("71634") ? operationContexts.length <= NUM.ZERO : stryMutAct_9fa48("71633") ? operationContexts.length >= NUM.ZERO : stryMutAct_9fa48("71632") ? false : stryMutAct_9fa48("71631") ? true : (stryCov_9fa48("71631", "71632", "71633", "71634"), operationContexts.length > NUM.ZERO)) ? operationContexts.map(stryMutAct_9fa48("71635") ? () => undefined : (stryCov_9fa48("71635"), context => context.operationId)) : stryMutAct_9fa48("71636") ? [] : (stryCov_9fa48("71636"), [null]);
        const activeOperationContexts = assessment.activeOperationContexts;
        const spreadCompletion = assessment.spreadCompletion;
        const blockerReasons = assessment.blockerReasons;
        const ineligibleNodeIds = assessment.ineligibleNodeIds;
        const recoveryEligibleExcludedNodeIds = assessment.recoveryEligibleExcludedNodeIds;
        for (const blockerReason of blockerReasons) {
          if (stryMutAct_9fa48("71637")) {
            {}
          } else {
            stryCov_9fa48("71637");
            blockerPartitionIdsByReason[blockerReason].add(partitionId);
          }
        }
        const semanticState = assessment.semanticState;
        if (stryMutAct_9fa48("71639") ? false : stryMutAct_9fa48("71638") ? true : (stryCov_9fa48("71638", "71639"), partitionIdsBySemanticState[semanticState] instanceof Set)) {
          if (stryMutAct_9fa48("71640")) {
            {}
          } else {
            stryCov_9fa48("71640");
            partitionIdsBySemanticState[semanticState].add(partitionId);
          }
        }
        for (const operationId of operationIds) {
          if (stryMutAct_9fa48("71641")) {
            {}
          } else {
            stryCov_9fa48("71641");
            const operationContext = (stryMutAct_9fa48("71644") ? operationId || replicaOperationContexts.byOperationId[operationId] : stryMutAct_9fa48("71643") ? false : stryMutAct_9fa48("71642") ? true : (stryCov_9fa48("71642", "71643", "71644"), operationId && replicaOperationContexts.byOperationId[operationId])) ? replicaOperationContexts.byOperationId[operationId] : null;
            snapshots.push(stryMutAct_9fa48("71645") ? {} : (stryCov_9fa48("71645"), {
              partitionId,
              epoch: publicationEpoch,
              operationId,
              correlationKey: buildPriorityRecoveryCorrelationKey(partitionId, publicationEpoch, operationId),
              semanticState,
              planner,
              admission: stryMutAct_9fa48("71646") ? {} : (stryCov_9fa48("71646"), {
                ...admission,
                ineligibleNodeIds,
                recoveryEligibleExcludedNodeIds
              }),
              spreadCompletion,
              coordinator: stryMutAct_9fa48("71647") ? {} : (stryCov_9fa48("71647"), {
                operationCount: operationContexts.length,
                operationIds: operationContexts.map(stryMutAct_9fa48("71648") ? () => undefined : (stryCov_9fa48("71648"), context => context.operationId)),
                operation: operationContext
              }),
              publication: stryMutAct_9fa48("71649") ? {} : (stryCov_9fa48("71649"), {
                publicationStatus: stryMutAct_9fa48("71652") ? publicationConvergence?.publicationStatus && null : stryMutAct_9fa48("71651") ? false : stryMutAct_9fa48("71650") ? true : (stryCov_9fa48("71650", "71651", "71652"), (stryMutAct_9fa48("71653") ? publicationConvergence.publicationStatus : (stryCov_9fa48("71653"), publicationConvergence?.publicationStatus)) || null),
                publishedActiveNodeIds: publicationContext.publishedActiveNodeIds,
                projectedServingNodeIds: publicationContext.projectedServingNodeIds,
                locallyEligibleNodeIds: publicationContext.locallyEligibleNodeIds,
                concreteEligibleNodeIds: publicationContext.concreteEligibleNodeIds,
                recoveryActiveNodeIds: publicationContext.recoveryActiveNodeIds,
                recoveryActiveNodeSource: publicationContext.recoveryActiveNodeSource,
                missingPublishedRecoveryActiveNodeIds: publicationContext.missingPublishedRecoveryActiveNodeIds,
                missingPublishedEligibleNodeIds: publicationContext.missingPublishedEligibleNodeIds,
                pendingAckNodeIds: normalizePriorityRecoveryStringList(stryMutAct_9fa48("71654") ? publicationConvergence.pendingAckNodeIds : (stryCov_9fa48("71654"), publicationConvergence?.pendingAckNodeIds)),
                inclusionReasonsByNodeId: publicationNodeDecisions.inclusionReasonsByNodeId,
                exclusionReasonsByNodeId: publicationNodeDecisions.exclusionReasonsByNodeId
              }),
              readiness: stryMutAct_9fa48("71655") ? {} : (stryCov_9fa48("71655"), {
                recoveryEligibleOnlyNodeIds: normalizePriorityRecoveryStringList(stryMutAct_9fa48("71656") ? Object.entries(readinessByNodeId).map(([nodeId]) => nodeId) : (stryCov_9fa48("71656"), Object.entries(readinessByNodeId).filter(([_nodeId, readinessEntry]) => {
                  if (stryMutAct_9fa48("71657")) {
                    {}
                  } else {
                    stryCov_9fa48("71657");
                    const dimensions = (stryMutAct_9fa48("71660") ? readinessEntry?.dimensions || typeof readinessEntry.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("71659") ? false : stryMutAct_9fa48("71658") ? true : (stryCov_9fa48("71658", "71659", "71660"), (stryMutAct_9fa48("71661") ? readinessEntry.dimensions : (stryCov_9fa48("71661"), readinessEntry?.dimensions)) && (stryMutAct_9fa48("71663") ? typeof readinessEntry.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("71662") ? true : (stryCov_9fa48("71662", "71663"), typeof readinessEntry.dimensions === TYPEOF.OBJECT)))) ? readinessEntry.dimensions : {};
                    return stryMutAct_9fa48("71666") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true || dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true : stryMutAct_9fa48("71665") ? false : stryMutAct_9fa48("71664") ? true : (stryCov_9fa48("71664", "71665", "71666"), (stryMutAct_9fa48("71668") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true : stryMutAct_9fa48("71667") ? true : (stryCov_9fa48("71667", "71668"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === (stryMutAct_9fa48("71669") ? false : (stryCov_9fa48("71669"), true)))) && (stryMutAct_9fa48("71671") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true : stryMutAct_9fa48("71670") ? true : (stryCov_9fa48("71670", "71671"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== (stryMutAct_9fa48("71672") ? false : (stryCov_9fa48("71672"), true)))));
                  }
                }).map(stryMutAct_9fa48("71673") ? () => undefined : (stryCov_9fa48("71673"), ([nodeId]) => nodeId)))),
                learnerPromotion
              }),
              blockerReasons
            }));
          }
        }
      }
    }
    const normalizedPartitionIdsBySemanticState = {};
    for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
      if (stryMutAct_9fa48("71674")) {
        {}
      } else {
        stryCov_9fa48("71674");
        normalizedPartitionIdsBySemanticState[semanticState] = stryMutAct_9fa48("71675") ? [...partitionIdsBySemanticState[semanticState]] : (stryCov_9fa48("71675"), (stryMutAct_9fa48("71676") ? [] : (stryCov_9fa48("71676"), [...partitionIdsBySemanticState[semanticState]])).sort());
      }
    }
    const unresolvedSemanticStateIds = stryMutAct_9fa48("71677") ? PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS : (stryCov_9fa48("71677"), PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(stryMutAct_9fa48("71678") ? () => undefined : (stryCov_9fa48("71678"), semanticState => stryMutAct_9fa48("71682") ? normalizedPartitionIdsBySemanticState[semanticState].length <= NUM.ZERO : stryMutAct_9fa48("71681") ? normalizedPartitionIdsBySemanticState[semanticState].length >= NUM.ZERO : stryMutAct_9fa48("71680") ? false : stryMutAct_9fa48("71679") ? true : (stryCov_9fa48("71679", "71680", "71681", "71682"), normalizedPartitionIdsBySemanticState[semanticState].length > NUM.ZERO))));
    const unresolvedSemanticPartitionIds = normalizePriorityRecoveryStringList(unresolvedSemanticStateIds.flatMap(stryMutAct_9fa48("71683") ? () => undefined : (stryCov_9fa48("71683"), semanticState => normalizedPartitionIdsBySemanticState[semanticState])));
    return stryMutAct_9fa48("71684") ? {} : (stryCov_9fa48("71684"), {
      schemaVersion: stryMutAct_9fa48("71687") ? options.schemaVersion && NUM.ONE : stryMutAct_9fa48("71686") ? false : stryMutAct_9fa48("71685") ? true : (stryCov_9fa48("71685", "71686", "71687"), options.schemaVersion || NUM.ONE),
      capturedAt: stryMutAct_9fa48("71690") ? options.capturedAt && null : stryMutAct_9fa48("71689") ? false : stryMutAct_9fa48("71688") ? true : (stryCov_9fa48("71688", "71689", "71690"), options.capturedAt || null),
      publicationEpoch,
      snapshotCount: snapshots.length,
      partitionCount: allPartitionIds.size,
      snapshots,
      blockerPartitionIdsByReason: PRIORITY_RECOVERY_PROGRESS_CLASS_IDS.reduce((accumulator, blockerReason) => {
        if (stryMutAct_9fa48("71691")) {
          {}
        } else {
          stryCov_9fa48("71691");
          accumulator[blockerReason] = stryMutAct_9fa48("71692") ? [...(blockerPartitionIdsByReason[blockerReason] || [])] : (stryCov_9fa48("71692"), (stryMutAct_9fa48("71693") ? [] : (stryCov_9fa48("71693"), [...(stryMutAct_9fa48("71696") ? blockerPartitionIdsByReason[blockerReason] && [] : stryMutAct_9fa48("71695") ? false : stryMutAct_9fa48("71694") ? true : (stryCov_9fa48("71694", "71695", "71696"), blockerPartitionIdsByReason[blockerReason] || (stryMutAct_9fa48("71697") ? ["Stryker was here"] : (stryCov_9fa48("71697"), []))))])).sort());
          return accumulator;
        }
      }, {}),
      partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
      unresolvedSemanticStateIds,
      unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
      unresolvedSemanticBlockedPartitionIds: unresolvedSemanticPartitionIds,
      unresolvedSemanticBlockedPartitionCount: unresolvedSemanticPartitionIds.length
    });
  }
}
function buildPriorityRecoveryPartitionAssessment(options = {}) {
  if (stryMutAct_9fa48("71698")) {
    {}
  } else {
    stryCov_9fa48("71698");
    const partitionId = stryMutAct_9fa48("71699") ? String(options.partitionId || '') : (stryCov_9fa48("71699"), String(stryMutAct_9fa48("71702") ? options.partitionId && '' : stryMutAct_9fa48("71701") ? false : stryMutAct_9fa48("71700") ? true : (stryCov_9fa48("71700", "71701", "71702"), options.partitionId || (stryMutAct_9fa48("71703") ? "Stryker was here!" : (stryCov_9fa48("71703"), '')))).trim());
    const planner = stryMutAct_9fa48("71706") ? options.planner && buildPriorityRecoveryPlannerEntry(partitionId, options.priorityPartitionSummary, options.plannerByPartitionId) : stryMutAct_9fa48("71705") ? false : stryMutAct_9fa48("71704") ? true : (stryCov_9fa48("71704", "71705", "71706"), options.planner || buildPriorityRecoveryPlannerEntry(partitionId, options.priorityPartitionSummary, options.plannerByPartitionId));
    const admission = (stryMutAct_9fa48("71709") ? options.admission || typeof options.admission === TYPEOF.OBJECT : stryMutAct_9fa48("71708") ? false : stryMutAct_9fa48("71707") ? true : (stryCov_9fa48("71707", "71708", "71709"), options.admission && (stryMutAct_9fa48("71711") ? typeof options.admission !== TYPEOF.OBJECT : stryMutAct_9fa48("71710") ? true : (stryCov_9fa48("71710", "71711"), typeof options.admission === TYPEOF.OBJECT)))) ? options.admission : {};
    const learnerPromotion = (stryMutAct_9fa48("71714") ? options.learnerPromotion || typeof options.learnerPromotion === TYPEOF.OBJECT : stryMutAct_9fa48("71713") ? false : stryMutAct_9fa48("71712") ? true : (stryCov_9fa48("71712", "71713", "71714"), options.learnerPromotion && (stryMutAct_9fa48("71716") ? typeof options.learnerPromotion !== TYPEOF.OBJECT : stryMutAct_9fa48("71715") ? true : (stryCov_9fa48("71715", "71716"), typeof options.learnerPromotion === TYPEOF.OBJECT)))) ? options.learnerPromotion : stryMutAct_9fa48("71717") ? {} : (stryCov_9fa48("71717"), {
      activeLearnerNodeIds: stryMutAct_9fa48("71718") ? ["Stryker was here"] : (stryCov_9fa48("71718"), []),
      promotableLearnerNodeIds: stryMutAct_9fa48("71719") ? ["Stryker was here"] : (stryCov_9fa48("71719"), []),
      activeLearnerNodeCount: NUM.ZERO,
      promotableLearnerNodeCount: NUM.ZERO,
      learnerHoldByNodeId: {}
    });
    const operationContexts = Array.isArray(options.operationContexts) ? options.operationContexts : stryMutAct_9fa48("71720") ? ["Stryker was here"] : (stryCov_9fa48("71720"), []);
    const activeOperationContexts = stryMutAct_9fa48("71721") ? operationContexts : (stryCov_9fa48("71721"), operationContexts.filter(stryMutAct_9fa48("71722") ? () => undefined : (stryCov_9fa48("71722"), context => stryMutAct_9fa48("71723") ? isPriorityRecoveryOperationContextTerminal(context) : (stryCov_9fa48("71723"), !isPriorityRecoveryOperationContextTerminal(context)))));
    const spreadCompletion = buildPriorityRecoverySpreadCompletion(stryMutAct_9fa48("71724") ? {} : (stryCov_9fa48("71724"), {
      plannerReady: stryMutAct_9fa48("71727") ? planner.ready !== true : stryMutAct_9fa48("71726") ? false : stryMutAct_9fa48("71725") ? true : (stryCov_9fa48("71725", "71726", "71727"), planner.ready === (stryMutAct_9fa48("71728") ? false : (stryCov_9fa48("71728"), true))),
      activeOperationContexts,
      eligibleTargetNodeIds: admission.effectiveEligibleNodeIds
    }));
    const blockingOperationIdSet = new Set(spreadCompletion.blockingOperationIds);
    const hasActiveOperationContexts = stryMutAct_9fa48("71732") ? activeOperationContexts.length <= NUM.ZERO : stryMutAct_9fa48("71731") ? activeOperationContexts.length >= NUM.ZERO : stryMutAct_9fa48("71730") ? false : stryMutAct_9fa48("71729") ? true : (stryCov_9fa48("71729", "71730", "71731", "71732"), activeOperationContexts.length > NUM.ZERO);
    const hasCompletedAddOperationContext = stryMutAct_9fa48("71733") ? operationContexts.every(context => isPriorityRecoveryCompletedAddOperationContext(context)) : (stryCov_9fa48("71733"), operationContexts.some(stryMutAct_9fa48("71734") ? () => undefined : (stryCov_9fa48("71734"), context => isPriorityRecoveryCompletedAddOperationContext(context))));
    const ineligibleNodeIds = normalizePriorityRecoveryStringList(stryMutAct_9fa48("71735") ? admission.ineligibleNodes.map(entry => entry?.nodeId) : (stryCov_9fa48("71735"), admission.ineligibleNodes?.map(stryMutAct_9fa48("71736") ? () => undefined : (stryCov_9fa48("71736"), entry => stryMutAct_9fa48("71737") ? entry.nodeId : (stryCov_9fa48("71737"), entry?.nodeId)))));
    const recoveryEligibleExcludedNodeIds = stryMutAct_9fa48("71738") ? normalizePriorityRecoveryStringList(admission.effectiveEligibleNodeIds) : (stryCov_9fa48("71738"), normalizePriorityRecoveryStringList(admission.effectiveEligibleNodeIds).filter(stryMutAct_9fa48("71739") ? () => undefined : (stryCov_9fa48("71739"), nodeId => ineligibleNodeIds.includes(nodeId))));
    const operationTargetsOutsideEligibleCohort = stryMutAct_9fa48("71742") ? normalizePriorityRecoveryStringList(admission.effectiveEligibleNodeIds).length > NUM.ZERO || activeOperationContexts.filter(context => blockingOperationIdSet.has(context.operationId)).some(context => {
      const targetNodeId = String(context?.targetNodeId || '').trim();
      return targetNodeId.length > NUM.ZERO && !admission.effectiveEligibleNodeIds.includes(targetNodeId);
    }) : stryMutAct_9fa48("71741") ? false : stryMutAct_9fa48("71740") ? true : (stryCov_9fa48("71740", "71741", "71742"), (stryMutAct_9fa48("71745") ? normalizePriorityRecoveryStringList(admission.effectiveEligibleNodeIds).length <= NUM.ZERO : stryMutAct_9fa48("71744") ? normalizePriorityRecoveryStringList(admission.effectiveEligibleNodeIds).length >= NUM.ZERO : stryMutAct_9fa48("71743") ? true : (stryCov_9fa48("71743", "71744", "71745"), normalizePriorityRecoveryStringList(admission.effectiveEligibleNodeIds).length > NUM.ZERO)) && (stryMutAct_9fa48("71747") ? activeOperationContexts.some(context => {
      const targetNodeId = String(context?.targetNodeId || '').trim();
      return targetNodeId.length > NUM.ZERO && !admission.effectiveEligibleNodeIds.includes(targetNodeId);
    }) : stryMutAct_9fa48("71746") ? activeOperationContexts.filter(context => blockingOperationIdSet.has(context.operationId)).every(context => {
      const targetNodeId = String(context?.targetNodeId || '').trim();
      return targetNodeId.length > NUM.ZERO && !admission.effectiveEligibleNodeIds.includes(targetNodeId);
    }) : (stryCov_9fa48("71746", "71747"), activeOperationContexts.filter(stryMutAct_9fa48("71748") ? () => undefined : (stryCov_9fa48("71748"), context => blockingOperationIdSet.has(context.operationId))).some(context => {
      if (stryMutAct_9fa48("71749")) {
        {}
      } else {
        stryCov_9fa48("71749");
        const targetNodeId = stryMutAct_9fa48("71750") ? String(context?.targetNodeId || '') : (stryCov_9fa48("71750"), String(stryMutAct_9fa48("71753") ? context?.targetNodeId && '' : stryMutAct_9fa48("71752") ? false : stryMutAct_9fa48("71751") ? true : (stryCov_9fa48("71751", "71752", "71753"), (stryMutAct_9fa48("71754") ? context.targetNodeId : (stryCov_9fa48("71754"), context?.targetNodeId)) || (stryMutAct_9fa48("71755") ? "Stryker was here!" : (stryCov_9fa48("71755"), '')))).trim());
        return stryMutAct_9fa48("71758") ? targetNodeId.length > NUM.ZERO || !admission.effectiveEligibleNodeIds.includes(targetNodeId) : stryMutAct_9fa48("71757") ? false : stryMutAct_9fa48("71756") ? true : (stryCov_9fa48("71756", "71757", "71758"), (stryMutAct_9fa48("71761") ? targetNodeId.length <= NUM.ZERO : stryMutAct_9fa48("71760") ? targetNodeId.length >= NUM.ZERO : stryMutAct_9fa48("71759") ? true : (stryCov_9fa48("71759", "71760", "71761"), targetNodeId.length > NUM.ZERO)) && (stryMutAct_9fa48("71762") ? admission.effectiveEligibleNodeIds.includes(targetNodeId) : (stryCov_9fa48("71762"), !admission.effectiveEligibleNodeIds.includes(targetNodeId))));
      }
    }))));
    const eligibleButNoOperation = stryMutAct_9fa48("71765") ? planner.ready === false && admission.effectiveEligibleNodeCount !== NUM.ZERO && hasActiveOperationContexts === false || hasCompletedAddOperationContext === false : stryMutAct_9fa48("71764") ? false : stryMutAct_9fa48("71763") ? true : (stryCov_9fa48("71763", "71764", "71765"), (stryMutAct_9fa48("71767") ? planner.ready === false && admission.effectiveEligibleNodeCount !== NUM.ZERO || hasActiveOperationContexts === false : stryMutAct_9fa48("71766") ? true : (stryCov_9fa48("71766", "71767"), (stryMutAct_9fa48("71769") ? planner.ready === false || admission.effectiveEligibleNodeCount !== NUM.ZERO : stryMutAct_9fa48("71768") ? true : (stryCov_9fa48("71768", "71769"), (stryMutAct_9fa48("71771") ? planner.ready !== false : stryMutAct_9fa48("71770") ? true : (stryCov_9fa48("71770", "71771"), planner.ready === (stryMutAct_9fa48("71772") ? true : (stryCov_9fa48("71772"), false)))) && (stryMutAct_9fa48("71774") ? admission.effectiveEligibleNodeCount === NUM.ZERO : stryMutAct_9fa48("71773") ? true : (stryCov_9fa48("71773", "71774"), admission.effectiveEligibleNodeCount !== NUM.ZERO)))) && (stryMutAct_9fa48("71776") ? hasActiveOperationContexts !== false : stryMutAct_9fa48("71775") ? true : (stryCov_9fa48("71775", "71776"), hasActiveOperationContexts === (stryMutAct_9fa48("71777") ? true : (stryCov_9fa48("71777"), false)))))) && (stryMutAct_9fa48("71779") ? hasCompletedAddOperationContext !== false : stryMutAct_9fa48("71778") ? true : (stryCov_9fa48("71778", "71779"), hasCompletedAddOperationContext === (stryMutAct_9fa48("71780") ? true : (stryCov_9fa48("71780"), false)))));
    const operationCreatedNoStepTransitions = stryMutAct_9fa48("71783") ? hasActiveOperationContexts && spreadCompletion.blockingOperationCount > NUM.ZERO || activeOperationContexts.filter(context => blockingOperationIdSet.has(context.operationId)).every(context => context.timelineStepCount <= NUM.ONE) : stryMutAct_9fa48("71782") ? false : stryMutAct_9fa48("71781") ? true : (stryCov_9fa48("71781", "71782", "71783"), (stryMutAct_9fa48("71785") ? hasActiveOperationContexts || spreadCompletion.blockingOperationCount > NUM.ZERO : stryMutAct_9fa48("71784") ? true : (stryCov_9fa48("71784", "71785"), hasActiveOperationContexts && (stryMutAct_9fa48("71788") ? spreadCompletion.blockingOperationCount <= NUM.ZERO : stryMutAct_9fa48("71787") ? spreadCompletion.blockingOperationCount >= NUM.ZERO : stryMutAct_9fa48("71786") ? true : (stryCov_9fa48("71786", "71787", "71788"), spreadCompletion.blockingOperationCount > NUM.ZERO)))) && (stryMutAct_9fa48("71790") ? activeOperationContexts.every(context => context.timelineStepCount <= NUM.ONE) : stryMutAct_9fa48("71789") ? activeOperationContexts.filter(context => blockingOperationIdSet.has(context.operationId)).some(context => context.timelineStepCount <= NUM.ONE) : (stryCov_9fa48("71789", "71790"), activeOperationContexts.filter(stryMutAct_9fa48("71791") ? () => undefined : (stryCov_9fa48("71791"), context => blockingOperationIdSet.has(context.operationId))).every(stryMutAct_9fa48("71792") ? () => undefined : (stryCov_9fa48("71792"), context => stryMutAct_9fa48("71796") ? context.timelineStepCount > NUM.ONE : stryMutAct_9fa48("71795") ? context.timelineStepCount < NUM.ONE : stryMutAct_9fa48("71794") ? false : stryMutAct_9fa48("71793") ? true : (stryCov_9fa48("71793", "71794", "71795", "71796"), context.timelineStepCount <= NUM.ONE))))));
    const learnerActiveNeverPromotable = stryMutAct_9fa48("71799") ? learnerPromotion.activeLearnerNodeCount > NUM.ZERO || learnerPromotion.promotableLearnerNodeCount === NUM.ZERO : stryMutAct_9fa48("71798") ? false : stryMutAct_9fa48("71797") ? true : (stryCov_9fa48("71797", "71798", "71799"), (stryMutAct_9fa48("71802") ? learnerPromotion.activeLearnerNodeCount <= NUM.ZERO : stryMutAct_9fa48("71801") ? learnerPromotion.activeLearnerNodeCount >= NUM.ZERO : stryMutAct_9fa48("71800") ? true : (stryCov_9fa48("71800", "71801", "71802"), learnerPromotion.activeLearnerNodeCount > NUM.ZERO)) && (stryMutAct_9fa48("71804") ? learnerPromotion.promotableLearnerNodeCount !== NUM.ZERO : stryMutAct_9fa48("71803") ? true : (stryCov_9fa48("71803", "71804"), learnerPromotion.promotableLearnerNodeCount === NUM.ZERO)));
    const publicationRecoveryEligibleButCoordinatorExcludesNode = stryMutAct_9fa48("71807") ? recoveryEligibleExcludedNodeIds.length > NUM.ZERO && operationTargetsOutsideEligibleCohort : stryMutAct_9fa48("71806") ? false : stryMutAct_9fa48("71805") ? true : (stryCov_9fa48("71805", "71806", "71807"), (stryMutAct_9fa48("71810") ? recoveryEligibleExcludedNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("71809") ? recoveryEligibleExcludedNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("71808") ? false : (stryCov_9fa48("71808", "71809", "71810"), recoveryEligibleExcludedNodeIds.length > NUM.ZERO)) || operationTargetsOutsideEligibleCohort);
    const blockerReasons = stryMutAct_9fa48("71811") ? ["Stryker was here"] : (stryCov_9fa48("71811"), []);
    if (stryMutAct_9fa48("71813") ? false : stryMutAct_9fa48("71812") ? true : (stryCov_9fa48("71812", "71813"), eligibleButNoOperation)) {
      if (stryMutAct_9fa48("71814")) {
        {}
      } else {
        stryCov_9fa48("71814");
        blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION);
      }
    }
    if (stryMutAct_9fa48("71816") ? false : stryMutAct_9fa48("71815") ? true : (stryCov_9fa48("71815", "71816"), operationCreatedNoStepTransitions)) {
      if (stryMutAct_9fa48("71817")) {
        {}
      } else {
        stryCov_9fa48("71817");
        blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS);
      }
    }
    if (stryMutAct_9fa48("71819") ? false : stryMutAct_9fa48("71818") ? true : (stryCov_9fa48("71818", "71819"), learnerActiveNeverPromotable)) {
      if (stryMutAct_9fa48("71820")) {
        {}
      } else {
        stryCov_9fa48("71820");
        blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE);
      }
    }
    if (stryMutAct_9fa48("71822") ? false : stryMutAct_9fa48("71821") ? true : (stryCov_9fa48("71821", "71822"), publicationRecoveryEligibleButCoordinatorExcludesNode)) {
      if (stryMutAct_9fa48("71823")) {
        {}
      } else {
        stryCov_9fa48("71823");
        blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED);
      }
    }
    const semanticState = resolvePriorityRecoverySemanticState(stryMutAct_9fa48("71824") ? {} : (stryCov_9fa48("71824"), {
      blockerReasons,
      plannerReady: stryMutAct_9fa48("71827") ? planner.ready !== true : stryMutAct_9fa48("71826") ? false : stryMutAct_9fa48("71825") ? true : (stryCov_9fa48("71825", "71826", "71827"), planner.ready === (stryMutAct_9fa48("71828") ? false : (stryCov_9fa48("71828"), true))),
      hasActiveOperationContexts,
      spreadCompletion
    }));
    return stryMutAct_9fa48("71829") ? {} : (stryCov_9fa48("71829"), {
      planner,
      spreadCompletion,
      blockerReasons,
      semanticState,
      activeOperationContexts,
      ineligibleNodeIds,
      recoveryEligibleExcludedNodeIds,
      publicationRecoveryEligibleButCoordinatorExcludesNode
    });
  }
}
function buildPriorityRecoveryOperationAssessment(options = {}) {
  if (stryMutAct_9fa48("71830")) {
    {}
  } else {
    stryCov_9fa48("71830");
    const operationContext = buildPriorityRecoveryOperationContextFromRecord(options.operation);
    const effectiveEligibleNodeIds = normalizePriorityRecoveryStringList(options.effectiveEligibleNodeIds);
    const assessment = buildPriorityRecoveryPartitionAssessment(stryMutAct_9fa48("71831") ? {} : (stryCov_9fa48("71831"), {
      partitionId: stryMutAct_9fa48("71834") ? (operationContext?.partitionId || options.partitionId) && '' : stryMutAct_9fa48("71833") ? false : stryMutAct_9fa48("71832") ? true : (stryCov_9fa48("71832", "71833", "71834"), (stryMutAct_9fa48("71836") ? operationContext?.partitionId && options.partitionId : stryMutAct_9fa48("71835") ? false : (stryCov_9fa48("71835", "71836"), (stryMutAct_9fa48("71837") ? operationContext.partitionId : (stryCov_9fa48("71837"), operationContext?.partitionId)) || options.partitionId)) || (stryMutAct_9fa48("71838") ? "Stryker was here!" : (stryCov_9fa48("71838"), ''))),
      priorityPartitionSummary: options.priorityPartitionSummary,
      admission: stryMutAct_9fa48("71839") ? {} : (stryCov_9fa48("71839"), {
        effectiveEligibleNodeIds,
        effectiveEligibleNodeCount: effectiveEligibleNodeIds.length,
        ineligibleNodes: stryMutAct_9fa48("71840") ? ["Stryker was here"] : (stryCov_9fa48("71840"), [])
      }),
      operationContexts: operationContext ? stryMutAct_9fa48("71841") ? [] : (stryCov_9fa48("71841"), [operationContext]) : stryMutAct_9fa48("71842") ? ["Stryker was here"] : (stryCov_9fa48("71842"), [])
    }));
    return stryMutAct_9fa48("71843") ? {} : (stryCov_9fa48("71843"), {
      ...assessment,
      operationContext
    });
  }
}
function shouldPriorityRecoveryOperationBlockPlanning(assessment) {
  if (stryMutAct_9fa48("71844")) {
    {}
  } else {
    stryCov_9fa48("71844");
    if (stryMutAct_9fa48("71847") ? !assessment && typeof assessment !== TYPEOF.OBJECT : stryMutAct_9fa48("71846") ? false : stryMutAct_9fa48("71845") ? true : (stryCov_9fa48("71845", "71846", "71847"), (stryMutAct_9fa48("71848") ? assessment : (stryCov_9fa48("71848"), !assessment)) || (stryMutAct_9fa48("71850") ? typeof assessment === TYPEOF.OBJECT : stryMutAct_9fa48("71849") ? false : (stryCov_9fa48("71849", "71850"), typeof assessment !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("71851")) {
        {}
      } else {
        stryCov_9fa48("71851");
        return stryMutAct_9fa48("71852") ? false : (stryCov_9fa48("71852"), true);
      }
    }
    if (stryMutAct_9fa48("71855") ? assessment.spreadCompletion?.satisfied !== true : stryMutAct_9fa48("71854") ? false : stryMutAct_9fa48("71853") ? true : (stryCov_9fa48("71853", "71854", "71855"), (stryMutAct_9fa48("71856") ? assessment.spreadCompletion.satisfied : (stryCov_9fa48("71856"), assessment.spreadCompletion?.satisfied)) === (stryMutAct_9fa48("71857") ? false : (stryCov_9fa48("71857"), true)))) {
      if (stryMutAct_9fa48("71858")) {
        {}
      } else {
        stryCov_9fa48("71858");
        return stryMutAct_9fa48("71859") ? true : (stryCov_9fa48("71859"), false);
      }
    }
    return stryMutAct_9fa48("71862") ? assessment.semanticState === PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH : stryMutAct_9fa48("71861") ? false : stryMutAct_9fa48("71860") ? true : (stryCov_9fa48("71860", "71861", "71862"), assessment.semanticState !== PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH);
  }
}
function buildPriorityRecoveryRediscoveryState(options = {}) {
  if (stryMutAct_9fa48("71863")) {
    {}
  } else {
    stryCov_9fa48("71863");
    const publicationConvergence = (stryMutAct_9fa48("71866") ? options.publicationConvergence || typeof options.publicationConvergence === TYPEOF.OBJECT : stryMutAct_9fa48("71865") ? false : stryMutAct_9fa48("71864") ? true : (stryCov_9fa48("71864", "71865", "71866"), options.publicationConvergence && (stryMutAct_9fa48("71868") ? typeof options.publicationConvergence !== TYPEOF.OBJECT : stryMutAct_9fa48("71867") ? true : (stryCov_9fa48("71867", "71868"), typeof options.publicationConvergence === TYPEOF.OBJECT)))) ? options.publicationConvergence : null;
    const priorityPartitionSummary = (stryMutAct_9fa48("71871") ? options.priorityPartitionSummary || typeof options.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("71870") ? false : stryMutAct_9fa48("71869") ? true : (stryCov_9fa48("71869", "71870", "71871"), options.priorityPartitionSummary && (stryMutAct_9fa48("71873") ? typeof options.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("71872") ? true : (stryCov_9fa48("71872", "71873"), typeof options.priorityPartitionSummary === TYPEOF.OBJECT)))) ? options.priorityPartitionSummary : stryMutAct_9fa48("71876") ? publicationConvergence?.priorityPartitionSummary && null : stryMutAct_9fa48("71875") ? false : stryMutAct_9fa48("71874") ? true : (stryCov_9fa48("71874", "71875", "71876"), (stryMutAct_9fa48("71877") ? publicationConvergence.priorityPartitionSummary : (stryCov_9fa48("71877"), publicationConvergence?.priorityPartitionSummary)) || null);
    const publicationContext = buildPriorityRecoveryPublicationContext(publicationConvergence);
    const nodeId = stryMutAct_9fa48("71878") ? String(options.nodeId || '') : (stryCov_9fa48("71878"), String(stryMutAct_9fa48("71881") ? options.nodeId && '' : stryMutAct_9fa48("71880") ? false : stryMutAct_9fa48("71879") ? true : (stryCov_9fa48("71879", "71880", "71881"), options.nodeId || (stryMutAct_9fa48("71882") ? "Stryker was here!" : (stryCov_9fa48("71882"), '')))).trim());
    const spreadGapPending = hasPriorityRecoverySpreadGap(priorityPartitionSummary);
    const targetNodeInConcreteEligibleCohort = stryMutAct_9fa48("71885") ? nodeId.length > NUM.ZERO || publicationContext.concreteEligibleNodeIds.includes(nodeId) : stryMutAct_9fa48("71884") ? false : stryMutAct_9fa48("71883") ? true : (stryCov_9fa48("71883", "71884", "71885"), (stryMutAct_9fa48("71888") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("71887") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("71886") ? true : (stryCov_9fa48("71886", "71887", "71888"), nodeId.length > NUM.ZERO)) && publicationContext.concreteEligibleNodeIds.includes(nodeId));
    const targetNodePublishedActive = stryMutAct_9fa48("71891") ? nodeId.length > NUM.ZERO || publicationContext.publishedActiveNodeIds.includes(nodeId) : stryMutAct_9fa48("71890") ? false : stryMutAct_9fa48("71889") ? true : (stryCov_9fa48("71889", "71890", "71891"), (stryMutAct_9fa48("71894") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("71893") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("71892") ? true : (stryCov_9fa48("71892", "71893", "71894"), nodeId.length > NUM.ZERO)) && publicationContext.publishedActiveNodeIds.includes(nodeId));
    const targetNodeMissingPublished = stryMutAct_9fa48("71897") ? nodeId.length > NUM.ZERO || publicationContext.missingPublishedEligibleNodeIds.includes(nodeId) : stryMutAct_9fa48("71896") ? false : stryMutAct_9fa48("71895") ? true : (stryCov_9fa48("71895", "71896", "71897"), (stryMutAct_9fa48("71900") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("71899") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("71898") ? true : (stryCov_9fa48("71898", "71899", "71900"), nodeId.length > NUM.ZERO)) && publicationContext.missingPublishedEligibleNodeIds.includes(nodeId));
    const requiresAuthoritativeRediscovery = stryMutAct_9fa48("71903") ? options.cacheVisible !== true && spreadGapPending || publicationContext.concreteEligibleNodeIds.length === NUM.ZERO || targetNodeInConcreteEligibleCohort || targetNodePublishedActive || targetNodeMissingPublished : stryMutAct_9fa48("71902") ? false : stryMutAct_9fa48("71901") ? true : (stryCov_9fa48("71901", "71902", "71903"), (stryMutAct_9fa48("71905") ? options.cacheVisible !== true || spreadGapPending : stryMutAct_9fa48("71904") ? true : (stryCov_9fa48("71904", "71905"), (stryMutAct_9fa48("71907") ? options.cacheVisible === true : stryMutAct_9fa48("71906") ? true : (stryCov_9fa48("71906", "71907"), options.cacheVisible !== (stryMutAct_9fa48("71908") ? false : (stryCov_9fa48("71908"), true)))) && spreadGapPending)) && (stryMutAct_9fa48("71910") ? (publicationContext.concreteEligibleNodeIds.length === NUM.ZERO || targetNodeInConcreteEligibleCohort || targetNodePublishedActive) && targetNodeMissingPublished : stryMutAct_9fa48("71909") ? true : (stryCov_9fa48("71909", "71910"), (stryMutAct_9fa48("71912") ? (publicationContext.concreteEligibleNodeIds.length === NUM.ZERO || targetNodeInConcreteEligibleCohort) && targetNodePublishedActive : stryMutAct_9fa48("71911") ? false : (stryCov_9fa48("71911", "71912"), (stryMutAct_9fa48("71914") ? publicationContext.concreteEligibleNodeIds.length === NUM.ZERO && targetNodeInConcreteEligibleCohort : stryMutAct_9fa48("71913") ? false : (stryCov_9fa48("71913", "71914"), (stryMutAct_9fa48("71916") ? publicationContext.concreteEligibleNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("71915") ? false : (stryCov_9fa48("71915", "71916"), publicationContext.concreteEligibleNodeIds.length === NUM.ZERO)) || targetNodeInConcreteEligibleCohort)) || targetNodePublishedActive)) || targetNodeMissingPublished)));
    return Object.freeze(stryMutAct_9fa48("71917") ? {} : (stryCov_9fa48("71917"), {
      nodeId: stryMutAct_9fa48("71920") ? nodeId && null : stryMutAct_9fa48("71919") ? false : stryMutAct_9fa48("71918") ? true : (stryCov_9fa48("71918", "71919", "71920"), nodeId || null),
      spreadGapPending,
      concreteEligibleNodeIds: Object.freeze(stryMutAct_9fa48("71921") ? [] : (stryCov_9fa48("71921"), [...publicationContext.concreteEligibleNodeIds])),
      publishedActiveNodeIds: Object.freeze(stryMutAct_9fa48("71922") ? [] : (stryCov_9fa48("71922"), [...publicationContext.publishedActiveNodeIds])),
      missingPublishedEligibleNodeIds: Object.freeze(stryMutAct_9fa48("71923") ? [] : (stryCov_9fa48("71923"), [...publicationContext.missingPublishedEligibleNodeIds])),
      targetNodeInConcreteEligibleCohort,
      targetNodePublishedActive,
      targetNodeMissingPublished,
      requiresAuthoritativeRediscovery
    }));
  }
}
function shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId, options = {}) {
  if (stryMutAct_9fa48("71924")) {
    {}
  } else {
    stryCov_9fa48("71924");
    return buildPriorityRecoveryRediscoveryState(stryMutAct_9fa48("71925") ? {} : (stryCov_9fa48("71925"), {
      ...options,
      nodeId
    })).requiresAuthoritativeRediscovery;
  }
}
export { DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS, PRIORITY_RECOVERY_ADMISSION_DECISION_REASON, PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS, PRIORITY_RECOVERY_ADMISSION_SOURCE, buildPriorityRecoveryPublicationContext, buildPriorityRecoveryAdmissionPlan, buildPriorityRecoveryOperationAssessment, buildPriorityRecoveryOperationContextFromRecord, buildPriorityRecoveryPartitionAssessment, buildPriorityRecoveryBlockedPartitionIds, buildPriorityRecoveryBlockedPartitions, buildPriorityRecoveryCorrelationKey, buildPriorityRecoveryDecisionSnapshots, buildPriorityRecoveryPlannerEntry, buildPriorityRecoveryPlannerByPartitionId, buildPriorityRecoveryRediscoveryState, hasPriorityRecoverySpreadGap, normalizePriorityRecoveryInteger, normalizePriorityRecoveryStringList, resolvePriorityPartitionSummaryFromPublication, resolvePriorityRecoveryAdmissionPlanFromPublication, resolveTrackedPriorityRecoveryAdmissionPlan, resolvePriorityRecoveryActiveNodeCohort, shouldUseAuthoritativePriorityRecoveryRediscovery, shouldPriorityRecoveryOperationBlockPlanning };