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
import { NUM, TIME_MS, WORKFLOW_STEP } from '../constants/index.js';
import { OperationType, isTerminalStep as isTerminalReplicaOperationStep } from './replica-status.js';
import { REBALANCER_DEFAULT } from './rebalancer-constants.js';
const UNKNOWN_STATUS = stryMutAct_9fa48("137922") ? "" : (stryCov_9fa48("137922"), 'unknown');
const UNKNOWN_PARTITION_GROUP_ID = stryMutAct_9fa48("137923") ? "" : (stryCov_9fa48("137923"), 'unknown');
const UNKNOWN_WORKFLOW_STEP = stryMutAct_9fa48("137924") ? "" : (stryCov_9fa48("137924"), 'UNKNOWN');
const REPLICA_OPERATION_STATUS_FAILED = stryMutAct_9fa48("137925") ? "" : (stryCov_9fa48("137925"), 'failed');
const REPLICA_OPERATION_STATUS_ACTIVE = stryMutAct_9fa48("137926") ? "" : (stryCov_9fa48("137926"), 'active');
const WORKFLOW_STEP_FAILED = stryMutAct_9fa48("137927") ? "" : (stryCov_9fa48("137927"), 'FAILED');
const OPERATION_TIMELINE_EVENT_STEP = stryMutAct_9fa48("137928") ? "" : (stryCov_9fa48("137928"), 'step');
const OPERATION_TIMELINE_EVENT_STATE = stryMutAct_9fa48("137929") ? "" : (stryCov_9fa48("137929"), 'state');
const DEFAULT_TIMELINE_ENTRIES_PER_OPERATION = 16;
const HOURS_PER_DAY = stryMutAct_9fa48("137930") ? NUM.THREE / NUM.EIGHT : (stryCov_9fa48("137930"), NUM.THREE * NUM.EIGHT);
const MINUTES_PER_HOUR = stryMutAct_9fa48("137931") ? NUM.THIRTY / NUM.TWO : (stryCov_9fa48("137931"), NUM.THIRTY * NUM.TWO);
const SERVICE_TYPE_PARTITION = stryMutAct_9fa48("137932") ? "" : (stryCov_9fa48("137932"), 'partition');
const SERVICE_TYPE_MESSAGE_GROUP = stryMutAct_9fa48("137933") ? "" : (stryCov_9fa48("137933"), 'message_group');
const BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE = stryMutAct_9fa48("137934") ? "" : (stryCov_9fa48("137934"), 'MOVE_ASSIGNMENT');
const STALE_TIMEOUT_CLASSIFICATION_LOOKBACK_MS = stryMutAct_9fa48("137935") ? TIME_MS.MINUTE * HOURS_PER_DAY / MINUTES_PER_HOUR : (stryCov_9fa48("137935"), (stryMutAct_9fa48("137936") ? TIME_MS.MINUTE / HOURS_PER_DAY : (stryCov_9fa48("137936"), TIME_MS.MINUTE * HOURS_PER_DAY)) * MINUTES_PER_HOUR);
const REPLICA_OPERATION_IN_FLIGHT_EXCLUDED_STATUSES = new Set(stryMutAct_9fa48("137937") ? [] : (stryCov_9fa48("137937"), [stryMutAct_9fa48("137938") ? "" : (stryCov_9fa48("137938"), 'active'), stryMutAct_9fa48("137939") ? "" : (stryCov_9fa48("137939"), 'removed'), REPLICA_OPERATION_STATUS_FAILED]));
const DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP = Object.freeze(stryMutAct_9fa48("137940") ? {} : (stryCov_9fa48("137940"), {
  [WORKFLOW_STEP.PENDING]: REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
  [WORKFLOW_STEP.SENDING]: REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
  [WORKFLOW_STEP.CREATING]: REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS,
  [WORKFLOW_STEP.SYNCING]: REBALANCER_DEFAULT.COORDINATOR.SYNCING_TIMEOUT_MS,
  [WORKFLOW_STEP.STOPPING]: REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS
}));
function firstStringField(record, ...keys) {
  if (stryMutAct_9fa48("137941")) {
    {}
  } else {
    stryCov_9fa48("137941");
    for (const key of keys) {
      if (stryMutAct_9fa48("137942")) {
        {}
      } else {
        stryCov_9fa48("137942");
        const value = stryMutAct_9fa48("137943") ? record[key] : (stryCov_9fa48("137943"), record?.[key]);
        if (stryMutAct_9fa48("137946") ? typeof value === 'string' || value.length > NUM.ZERO : stryMutAct_9fa48("137945") ? false : stryMutAct_9fa48("137944") ? true : (stryCov_9fa48("137944", "137945", "137946"), (stryMutAct_9fa48("137948") ? typeof value !== 'string' : stryMutAct_9fa48("137947") ? true : (stryCov_9fa48("137947", "137948"), typeof value === (stryMutAct_9fa48("137949") ? "" : (stryCov_9fa48("137949"), 'string')))) && (stryMutAct_9fa48("137952") ? value.length <= NUM.ZERO : stryMutAct_9fa48("137951") ? value.length >= NUM.ZERO : stryMutAct_9fa48("137950") ? true : (stryCov_9fa48("137950", "137951", "137952"), value.length > NUM.ZERO)))) {
          if (stryMutAct_9fa48("137953")) {
            {}
          } else {
            stryCov_9fa48("137953");
            return value;
          }
        }
      }
    }
    return null;
  }
}
function normalizeEpochMillis(value) {
  if (stryMutAct_9fa48("137954")) {
    {}
  } else {
    stryCov_9fa48("137954");
    if (stryMutAct_9fa48("137957") ? false : stryMutAct_9fa48("137956") ? true : stryMutAct_9fa48("137955") ? Number.isFinite(value) : (stryCov_9fa48("137955", "137956", "137957"), !Number.isFinite(value))) {
      if (stryMutAct_9fa48("137958")) {
        {}
      } else {
        stryCov_9fa48("137958");
        return null;
      }
    }
    return Math.floor(value);
  }
}
function parseStepsHistory(stepsHistoryRaw) {
  if (stryMutAct_9fa48("137959")) {
    {}
  } else {
    stryCov_9fa48("137959");
    if (stryMutAct_9fa48("137962") ? false : stryMutAct_9fa48("137961") ? true : stryMutAct_9fa48("137960") ? stepsHistoryRaw : (stryCov_9fa48("137960", "137961", "137962"), !stepsHistoryRaw)) {
      if (stryMutAct_9fa48("137963")) {
        {}
      } else {
        stryCov_9fa48("137963");
        return stryMutAct_9fa48("137964") ? ["Stryker was here"] : (stryCov_9fa48("137964"), []);
      }
    }
    if (stryMutAct_9fa48("137966") ? false : stryMutAct_9fa48("137965") ? true : (stryCov_9fa48("137965", "137966"), Array.isArray(stepsHistoryRaw))) {
      if (stryMutAct_9fa48("137967")) {
        {}
      } else {
        stryCov_9fa48("137967");
        return stepsHistoryRaw;
      }
    }
    if (stryMutAct_9fa48("137970") ? typeof stepsHistoryRaw === 'string' : stryMutAct_9fa48("137969") ? false : stryMutAct_9fa48("137968") ? true : (stryCov_9fa48("137968", "137969", "137970"), typeof stepsHistoryRaw !== (stryMutAct_9fa48("137971") ? "" : (stryCov_9fa48("137971"), 'string')))) {
      if (stryMutAct_9fa48("137972")) {
        {}
      } else {
        stryCov_9fa48("137972");
        return stryMutAct_9fa48("137973") ? ["Stryker was here"] : (stryCov_9fa48("137973"), []);
      }
    }
    try {
      if (stryMutAct_9fa48("137974")) {
        {}
      } else {
        stryCov_9fa48("137974");
        const parsed = JSON.parse(stepsHistoryRaw);
        return Array.isArray(parsed) ? parsed : stryMutAct_9fa48("137975") ? ["Stryker was here"] : (stryCov_9fa48("137975"), []);
      }
    } catch (_error) {
      if (stryMutAct_9fa48("137976")) {
        {}
      } else {
        stryCov_9fa48("137976");
        return stryMutAct_9fa48("137977") ? ["Stryker was here"] : (stryCov_9fa48("137977"), []);
      }
    }
  }
}
function resolveAgeMs(record, nowMs) {
  if (stryMutAct_9fa48("137978")) {
    {}
  } else {
    stryCov_9fa48("137978");
    const referenceAtMs = normalizeEpochMillis(stryMutAct_9fa48("137979") ? record?.updatedAt && record?.createdAt : (stryCov_9fa48("137979"), (stryMutAct_9fa48("137980") ? record.updatedAt : (stryCov_9fa48("137980"), record?.updatedAt)) ?? (stryMutAct_9fa48("137981") ? record.createdAt : (stryCov_9fa48("137981"), record?.createdAt))));
    if (stryMutAct_9fa48("137984") ? !Number.isFinite(referenceAtMs) && !Number.isFinite(nowMs) : stryMutAct_9fa48("137983") ? false : stryMutAct_9fa48("137982") ? true : (stryCov_9fa48("137982", "137983", "137984"), (stryMutAct_9fa48("137985") ? Number.isFinite(referenceAtMs) : (stryCov_9fa48("137985"), !Number.isFinite(referenceAtMs))) || (stryMutAct_9fa48("137986") ? Number.isFinite(nowMs) : (stryCov_9fa48("137986"), !Number.isFinite(nowMs))))) {
      if (stryMutAct_9fa48("137987")) {
        {}
      } else {
        stryCov_9fa48("137987");
        return null;
      }
    }
    return stryMutAct_9fa48("137988") ? Math.min(NUM.ZERO, Math.floor(nowMs - referenceAtMs)) : (stryCov_9fa48("137988"), Math.max(NUM.ZERO, Math.floor(stryMutAct_9fa48("137989") ? nowMs + referenceAtMs : (stryCov_9fa48("137989"), nowMs - referenceAtMs))));
  }
}
function normalizeReplicaOperationRecord(row, options = {}) {
  if (stryMutAct_9fa48("137990")) {
    {}
  } else {
    stryCov_9fa48("137990");
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const type = stryMutAct_9fa48("137991") ? String(firstStringField(row, 'type', 'operation_type', 'operationType') || '').toLowerCase() : (stryCov_9fa48("137991"), String(stryMutAct_9fa48("137994") ? firstStringField(row, 'type', 'operation_type', 'operationType') && '' : stryMutAct_9fa48("137993") ? false : stryMutAct_9fa48("137992") ? true : (stryCov_9fa48("137992", "137993", "137994"), firstStringField(row, stryMutAct_9fa48("137995") ? "" : (stryCov_9fa48("137995"), 'type'), stryMutAct_9fa48("137996") ? "" : (stryCov_9fa48("137996"), 'operation_type'), stryMutAct_9fa48("137997") ? "" : (stryCov_9fa48("137997"), 'operationType')) || (stryMutAct_9fa48("137998") ? "Stryker was here!" : (stryCov_9fa48("137998"), '')))).toUpperCase());
    const status = stryMutAct_9fa48("137999") ? String(firstStringField(row, 'status') || '').toUpperCase() : (stryCov_9fa48("137999"), String(stryMutAct_9fa48("138002") ? firstStringField(row, 'status') && '' : stryMutAct_9fa48("138001") ? false : stryMutAct_9fa48("138000") ? true : (stryCov_9fa48("138000", "138001", "138002"), firstStringField(row, stryMutAct_9fa48("138003") ? "" : (stryCov_9fa48("138003"), 'status')) || (stryMutAct_9fa48("138004") ? "Stryker was here!" : (stryCov_9fa48("138004"), '')))).toLowerCase());
    const workflowStep = stryMutAct_9fa48("138005") ? String(firstStringField(row, 'workflow_step', 'workflowStep') || '').toLowerCase() : (stryCov_9fa48("138005"), String(stryMutAct_9fa48("138008") ? firstStringField(row, 'workflow_step', 'workflowStep') && '' : stryMutAct_9fa48("138007") ? false : stryMutAct_9fa48("138006") ? true : (stryCov_9fa48("138006", "138007", "138008"), firstStringField(row, stryMutAct_9fa48("138009") ? "" : (stryCov_9fa48("138009"), 'workflow_step'), stryMutAct_9fa48("138010") ? "" : (stryCov_9fa48("138010"), 'workflowStep')) || (stryMutAct_9fa48("138011") ? "Stryker was here!" : (stryCov_9fa48("138011"), '')))).toUpperCase());
    const createdAt = normalizeEpochMillis(stryMutAct_9fa48("138012") ? row?.created_at && row?.createdAt : (stryCov_9fa48("138012"), (stryMutAct_9fa48("138013") ? row.created_at : (stryCov_9fa48("138013"), row?.created_at)) ?? (stryMutAct_9fa48("138014") ? row.createdAt : (stryCov_9fa48("138014"), row?.createdAt))));
    const updatedAt = normalizeEpochMillis(stryMutAct_9fa48("138015") ? row?.updated_at && row?.updatedAt : (stryCov_9fa48("138015"), (stryMutAct_9fa48("138016") ? row.updated_at : (stryCov_9fa48("138016"), row?.updated_at)) ?? (stryMutAct_9fa48("138017") ? row.updatedAt : (stryCov_9fa48("138017"), row?.updatedAt))));
    const completedAt = normalizeEpochMillis(stryMutAct_9fa48("138018") ? row?.completed_at && row?.completedAt : (stryCov_9fa48("138018"), (stryMutAct_9fa48("138019") ? row.completed_at : (stryCov_9fa48("138019"), row?.completed_at)) ?? (stryMutAct_9fa48("138020") ? row.completedAt : (stryCov_9fa48("138020"), row?.completedAt))));
    const hasCompletedAt = stryMutAct_9fa48("138023") ? completedAt === null : stryMutAct_9fa48("138022") ? false : stryMutAct_9fa48("138021") ? true : (stryCov_9fa48("138021", "138022", "138023"), completedAt !== null);
    const stepsHistory = parseStepsHistory(stryMutAct_9fa48("138024") ? row?.steps_history && row?.stepsHistory : (stryCov_9fa48("138024"), (stryMutAct_9fa48("138025") ? row.steps_history : (stryCov_9fa48("138025"), row?.steps_history)) ?? (stryMutAct_9fa48("138026") ? row.stepsHistory : (stryCov_9fa48("138026"), row?.stepsHistory))));
    return stryMutAct_9fa48("138027") ? {} : (stryCov_9fa48("138027"), {
      operationId: String(stryMutAct_9fa48("138030") ? firstStringField(row, 'operation_id', 'operationId') && '' : stryMutAct_9fa48("138029") ? false : stryMutAct_9fa48("138028") ? true : (stryCov_9fa48("138028", "138029", "138030"), firstStringField(row, stryMutAct_9fa48("138031") ? "" : (stryCov_9fa48("138031"), 'operation_id'), stryMutAct_9fa48("138032") ? "" : (stryCov_9fa48("138032"), 'operationId')) || (stryMutAct_9fa48("138033") ? "Stryker was here!" : (stryCov_9fa48("138033"), '')))),
      type,
      status,
      workflowStep,
      partitionGroupId: String(stryMutAct_9fa48("138036") ? firstStringField(row, 'partition_id', 'partitionId', 'entity_id', 'entityId') && UNKNOWN_PARTITION_GROUP_ID : stryMutAct_9fa48("138035") ? false : stryMutAct_9fa48("138034") ? true : (stryCov_9fa48("138034", "138035", "138036"), firstStringField(row, stryMutAct_9fa48("138037") ? "" : (stryCov_9fa48("138037"), 'partition_id'), stryMutAct_9fa48("138038") ? "" : (stryCov_9fa48("138038"), 'partitionId'), stryMutAct_9fa48("138039") ? "" : (stryCov_9fa48("138039"), 'entity_id'), stryMutAct_9fa48("138040") ? "" : (stryCov_9fa48("138040"), 'entityId')) || UNKNOWN_PARTITION_GROUP_ID)),
      entityType: stryMutAct_9fa48("138041") ? String(firstStringField(row, 'entity_type', 'entityType') || SERVICE_TYPE_PARTITION).toUpperCase() : (stryCov_9fa48("138041"), String(stryMutAct_9fa48("138044") ? firstStringField(row, 'entity_type', 'entityType') && SERVICE_TYPE_PARTITION : stryMutAct_9fa48("138043") ? false : stryMutAct_9fa48("138042") ? true : (stryCov_9fa48("138042", "138043", "138044"), firstStringField(row, stryMutAct_9fa48("138045") ? "" : (stryCov_9fa48("138045"), 'entity_type'), stryMutAct_9fa48("138046") ? "" : (stryCov_9fa48("138046"), 'entityType')) || SERVICE_TYPE_PARTITION)).toLowerCase()),
      entityId: String(stryMutAct_9fa48("138049") ? firstStringField(row, 'entity_id', 'entityId', 'partition_id', 'partitionId') && UNKNOWN_PARTITION_GROUP_ID : stryMutAct_9fa48("138048") ? false : stryMutAct_9fa48("138047") ? true : (stryCov_9fa48("138047", "138048", "138049"), firstStringField(row, stryMutAct_9fa48("138050") ? "" : (stryCov_9fa48("138050"), 'entity_id'), stryMutAct_9fa48("138051") ? "" : (stryCov_9fa48("138051"), 'entityId'), stryMutAct_9fa48("138052") ? "" : (stryCov_9fa48("138052"), 'partition_id'), stryMutAct_9fa48("138053") ? "" : (stryCov_9fa48("138053"), 'partitionId')) || UNKNOWN_PARTITION_GROUP_ID)),
      sourceNodeId: String(stryMutAct_9fa48("138056") ? firstStringField(row, 'source_node_id', 'sourceNodeId') && '' : stryMutAct_9fa48("138055") ? false : stryMutAct_9fa48("138054") ? true : (stryCov_9fa48("138054", "138055", "138056"), firstStringField(row, stryMutAct_9fa48("138057") ? "" : (stryCov_9fa48("138057"), 'source_node_id'), stryMutAct_9fa48("138058") ? "" : (stryCov_9fa48("138058"), 'sourceNodeId')) || (stryMutAct_9fa48("138059") ? "Stryker was here!" : (stryCov_9fa48("138059"), '')))),
      replicaId: String(stryMutAct_9fa48("138062") ? firstStringField(row, 'replica_id', 'replicaId', 'service_id', 'serviceId') && '' : stryMutAct_9fa48("138061") ? false : stryMutAct_9fa48("138060") ? true : (stryCov_9fa48("138060", "138061", "138062"), firstStringField(row, stryMutAct_9fa48("138063") ? "" : (stryCov_9fa48("138063"), 'replica_id'), stryMutAct_9fa48("138064") ? "" : (stryCov_9fa48("138064"), 'replicaId'), stryMutAct_9fa48("138065") ? "" : (stryCov_9fa48("138065"), 'service_id'), stryMutAct_9fa48("138066") ? "" : (stryCov_9fa48("138066"), 'serviceId')) || (stryMutAct_9fa48("138067") ? "Stryker was here!" : (stryCov_9fa48("138067"), '')))),
      targetNodeId: String(stryMutAct_9fa48("138070") ? firstStringField(row, 'target_node_id', 'targetNodeId') && '' : stryMutAct_9fa48("138069") ? false : stryMutAct_9fa48("138068") ? true : (stryCov_9fa48("138068", "138069", "138070"), firstStringField(row, stryMutAct_9fa48("138071") ? "" : (stryCov_9fa48("138071"), 'target_node_id'), stryMutAct_9fa48("138072") ? "" : (stryCov_9fa48("138072"), 'targetNodeId')) || (stryMutAct_9fa48("138073") ? "Stryker was here!" : (stryCov_9fa48("138073"), '')))),
      createdAt,
      updatedAt,
      completedAt,
      hasCompletedAt,
      stepsHistory,
      ageMs: resolveAgeMs(stryMutAct_9fa48("138074") ? {} : (stryCov_9fa48("138074"), {
        updatedAt,
        createdAt
      }), nowMs)
    });
  }
}
function isReplicaOperationTerminalSuccess(record) {
  if (stryMutAct_9fa48("138075")) {
    {}
  } else {
    stryCov_9fa48("138075");
    if (stryMutAct_9fa48("138078") ? !record?.type && !record?.status : stryMutAct_9fa48("138077") ? false : stryMutAct_9fa48("138076") ? true : (stryCov_9fa48("138076", "138077", "138078"), (stryMutAct_9fa48("138079") ? record?.type : (stryCov_9fa48("138079"), !(stryMutAct_9fa48("138080") ? record.type : (stryCov_9fa48("138080"), record?.type)))) || (stryMutAct_9fa48("138081") ? record?.status : (stryCov_9fa48("138081"), !(stryMutAct_9fa48("138082") ? record.status : (stryCov_9fa48("138082"), record?.status)))))) {
      if (stryMutAct_9fa48("138083")) {
        {}
      } else {
        stryCov_9fa48("138083");
        return stryMutAct_9fa48("138084") ? true : (stryCov_9fa48("138084"), false);
      }
    }
    if (stryMutAct_9fa48("138087") ? record.status === REPLICA_OPERATION_STATUS_FAILED && record.workflowStep === WORKFLOW_STEP_FAILED : stryMutAct_9fa48("138086") ? false : stryMutAct_9fa48("138085") ? true : (stryCov_9fa48("138085", "138086", "138087"), (stryMutAct_9fa48("138089") ? record.status !== REPLICA_OPERATION_STATUS_FAILED : stryMutAct_9fa48("138088") ? false : (stryCov_9fa48("138088", "138089"), record.status === REPLICA_OPERATION_STATUS_FAILED)) || (stryMutAct_9fa48("138091") ? record.workflowStep !== WORKFLOW_STEP_FAILED : stryMutAct_9fa48("138090") ? false : (stryCov_9fa48("138090", "138091"), record.workflowStep === WORKFLOW_STEP_FAILED)))) {
      if (stryMutAct_9fa48("138092")) {
        {}
      } else {
        stryCov_9fa48("138092");
        return stryMutAct_9fa48("138093") ? true : (stryCov_9fa48("138093"), false);
      }
    }
    if (stryMutAct_9fa48("138096") ? record.workflowStep || isTerminalReplicaOperationStep(record.type, record.workflowStep) : stryMutAct_9fa48("138095") ? false : stryMutAct_9fa48("138094") ? true : (stryCov_9fa48("138094", "138095", "138096"), record.workflowStep && isTerminalReplicaOperationStep(record.type, record.workflowStep))) {
      if (stryMutAct_9fa48("138097")) {
        {}
      } else {
        stryCov_9fa48("138097");
        return stryMutAct_9fa48("138098") ? false : (stryCov_9fa48("138098"), true);
      }
    }
    if (stryMutAct_9fa48("138101") ? false : stryMutAct_9fa48("138100") ? true : stryMutAct_9fa48("138099") ? record.hasCompletedAt : (stryCov_9fa48("138099", "138100", "138101"), !record.hasCompletedAt)) {
      if (stryMutAct_9fa48("138102")) {
        {}
      } else {
        stryCov_9fa48("138102");
        return stryMutAct_9fa48("138103") ? true : (stryCov_9fa48("138103"), false);
      }
    }
    if (stryMutAct_9fa48("138106") ? record.type !== OperationType.ADD : stryMutAct_9fa48("138105") ? false : stryMutAct_9fa48("138104") ? true : (stryCov_9fa48("138104", "138105", "138106"), record.type === OperationType.ADD)) {
      if (stryMutAct_9fa48("138107")) {
        {}
      } else {
        stryCov_9fa48("138107");
        return stryMutAct_9fa48("138110") ? record.status !== 'active' : stryMutAct_9fa48("138109") ? false : stryMutAct_9fa48("138108") ? true : (stryCov_9fa48("138108", "138109", "138110"), record.status === (stryMutAct_9fa48("138111") ? "" : (stryCov_9fa48("138111"), 'active')));
      }
    }
    return stryMutAct_9fa48("138114") ? record.status !== 'removed' : stryMutAct_9fa48("138113") ? false : stryMutAct_9fa48("138112") ? true : (stryCov_9fa48("138112", "138113", "138114"), record.status === (stryMutAct_9fa48("138115") ? "" : (stryCov_9fa48("138115"), 'removed')));
  }
}
function hasObservedActiveTargetReplica(record, options = {}) {
  if (stryMutAct_9fa48("138116")) {
    {}
  } else {
    stryCov_9fa48("138116");
    if (stryMutAct_9fa48("138119") ? record?.type === OperationType.ADD : stryMutAct_9fa48("138118") ? false : stryMutAct_9fa48("138117") ? true : (stryCov_9fa48("138117", "138118", "138119"), (stryMutAct_9fa48("138120") ? record.type : (stryCov_9fa48("138120"), record?.type)) !== OperationType.ADD)) {
      if (stryMutAct_9fa48("138121")) {
        {}
      } else {
        stryCov_9fa48("138121");
        return hasObservedActiveTargetServiceOwnership(record, options);
      }
    }
    const replicaId = String(stryMutAct_9fa48("138124") ? record?.replicaId && '' : stryMutAct_9fa48("138123") ? false : stryMutAct_9fa48("138122") ? true : (stryCov_9fa48("138122", "138123", "138124"), (stryMutAct_9fa48("138125") ? record.replicaId : (stryCov_9fa48("138125"), record?.replicaId)) || (stryMutAct_9fa48("138126") ? "Stryker was here!" : (stryCov_9fa48("138126"), ''))));
    const entityType = stryMutAct_9fa48("138127") ? String(record?.entityType || SERVICE_TYPE_PARTITION).toUpperCase() : (stryCov_9fa48("138127"), String(stryMutAct_9fa48("138130") ? record?.entityType && SERVICE_TYPE_PARTITION : stryMutAct_9fa48("138129") ? false : stryMutAct_9fa48("138128") ? true : (stryCov_9fa48("138128", "138129", "138130"), (stryMutAct_9fa48("138131") ? record.entityType : (stryCov_9fa48("138131"), record?.entityType)) || SERVICE_TYPE_PARTITION)).toLowerCase());
    const entityId = String(stryMutAct_9fa48("138134") ? (record?.entityId || record?.partitionGroupId) && '' : stryMutAct_9fa48("138133") ? false : stryMutAct_9fa48("138132") ? true : (stryCov_9fa48("138132", "138133", "138134"), (stryMutAct_9fa48("138136") ? record?.entityId && record?.partitionGroupId : stryMutAct_9fa48("138135") ? false : (stryCov_9fa48("138135", "138136"), (stryMutAct_9fa48("138137") ? record.entityId : (stryCov_9fa48("138137"), record?.entityId)) || (stryMutAct_9fa48("138138") ? record.partitionGroupId : (stryCov_9fa48("138138"), record?.partitionGroupId)))) || (stryMutAct_9fa48("138139") ? "Stryker was here!" : (stryCov_9fa48("138139"), ''))));
    const targetNodeId = String(stryMutAct_9fa48("138142") ? record?.targetNodeId && '' : stryMutAct_9fa48("138141") ? false : stryMutAct_9fa48("138140") ? true : (stryCov_9fa48("138140", "138141", "138142"), (stryMutAct_9fa48("138143") ? record.targetNodeId : (stryCov_9fa48("138143"), record?.targetNodeId)) || (stryMutAct_9fa48("138144") ? "Stryker was here!" : (stryCov_9fa48("138144"), ''))));
    if (stryMutAct_9fa48("138147") ? (!replicaId || !entityId) && !targetNodeId : stryMutAct_9fa48("138146") ? false : stryMutAct_9fa48("138145") ? true : (stryCov_9fa48("138145", "138146", "138147"), (stryMutAct_9fa48("138149") ? !replicaId && !entityId : stryMutAct_9fa48("138148") ? false : (stryCov_9fa48("138148", "138149"), (stryMutAct_9fa48("138150") ? replicaId : (stryCov_9fa48("138150"), !replicaId)) || (stryMutAct_9fa48("138151") ? entityId : (stryCov_9fa48("138151"), !entityId)))) || (stryMutAct_9fa48("138152") ? targetNodeId : (stryCov_9fa48("138152"), !targetNodeId)))) {
      if (stryMutAct_9fa48("138153")) {
        {}
      } else {
        stryCov_9fa48("138153");
        return stryMutAct_9fa48("138154") ? true : (stryCov_9fa48("138154"), false);
      }
    }
    const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : stryMutAct_9fa48("138155") ? ["Stryker was here"] : (stryCov_9fa48("138155"), []);
    for (const serviceRow of serviceRows) {
      if (stryMutAct_9fa48("138156")) {
        {}
      } else {
        stryCov_9fa48("138156");
        const serviceType = stryMutAct_9fa48("138157") ? String(firstStringField(serviceRow, 'service_type', 'serviceType', 'type') || '').toUpperCase() : (stryCov_9fa48("138157"), String(stryMutAct_9fa48("138160") ? firstStringField(serviceRow, 'service_type', 'serviceType', 'type') && '' : stryMutAct_9fa48("138159") ? false : stryMutAct_9fa48("138158") ? true : (stryCov_9fa48("138158", "138159", "138160"), firstStringField(serviceRow, stryMutAct_9fa48("138161") ? "" : (stryCov_9fa48("138161"), 'service_type'), stryMutAct_9fa48("138162") ? "" : (stryCov_9fa48("138162"), 'serviceType'), stryMutAct_9fa48("138163") ? "" : (stryCov_9fa48("138163"), 'type')) || (stryMutAct_9fa48("138164") ? "Stryker was here!" : (stryCov_9fa48("138164"), '')))).toLowerCase());
        if (stryMutAct_9fa48("138167") ? serviceType || serviceType !== entityType : stryMutAct_9fa48("138166") ? false : stryMutAct_9fa48("138165") ? true : (stryCov_9fa48("138165", "138166", "138167"), serviceType && (stryMutAct_9fa48("138169") ? serviceType === entityType : stryMutAct_9fa48("138168") ? true : (stryCov_9fa48("138168", "138169"), serviceType !== entityType)))) {
          if (stryMutAct_9fa48("138170")) {
            {}
          } else {
            stryCov_9fa48("138170");
            continue;
          }
        }
        if (stryMutAct_9fa48("138173") ? String(firstStringField(serviceRow, 'status') || '').toLowerCase() === REPLICA_OPERATION_STATUS_ACTIVE : stryMutAct_9fa48("138172") ? false : stryMutAct_9fa48("138171") ? true : (stryCov_9fa48("138171", "138172", "138173"), (stryMutAct_9fa48("138174") ? String(firstStringField(serviceRow, 'status') || '').toUpperCase() : (stryCov_9fa48("138174"), String(stryMutAct_9fa48("138177") ? firstStringField(serviceRow, 'status') && '' : stryMutAct_9fa48("138176") ? false : stryMutAct_9fa48("138175") ? true : (stryCov_9fa48("138175", "138176", "138177"), firstStringField(serviceRow, stryMutAct_9fa48("138178") ? "" : (stryCov_9fa48("138178"), 'status')) || (stryMutAct_9fa48("138179") ? "Stryker was here!" : (stryCov_9fa48("138179"), '')))).toLowerCase())) !== REPLICA_OPERATION_STATUS_ACTIVE)) {
          if (stryMutAct_9fa48("138180")) {
            {}
          } else {
            stryCov_9fa48("138180");
            continue;
          }
        }
        if (stryMutAct_9fa48("138183") ? String(firstStringField(serviceRow, 'node_id', 'nodeId') || '') === targetNodeId : stryMutAct_9fa48("138182") ? false : stryMutAct_9fa48("138181") ? true : (stryCov_9fa48("138181", "138182", "138183"), String(stryMutAct_9fa48("138186") ? firstStringField(serviceRow, 'node_id', 'nodeId') && '' : stryMutAct_9fa48("138185") ? false : stryMutAct_9fa48("138184") ? true : (stryCov_9fa48("138184", "138185", "138186"), firstStringField(serviceRow, stryMutAct_9fa48("138187") ? "" : (stryCov_9fa48("138187"), 'node_id'), stryMutAct_9fa48("138188") ? "" : (stryCov_9fa48("138188"), 'nodeId')) || (stryMutAct_9fa48("138189") ? "Stryker was here!" : (stryCov_9fa48("138189"), '')))) !== targetNodeId)) {
          if (stryMutAct_9fa48("138190")) {
            {}
          } else {
            stryCov_9fa48("138190");
            continue;
          }
        }
        const serviceReplicaId = firstStringField(serviceRow, stryMutAct_9fa48("138191") ? "" : (stryCov_9fa48("138191"), 'replica_id'), stryMutAct_9fa48("138192") ? "" : (stryCov_9fa48("138192"), 'replicaId'), stryMutAct_9fa48("138193") ? "" : (stryCov_9fa48("138193"), 'service_id'), stryMutAct_9fa48("138194") ? "" : (stryCov_9fa48("138194"), 'serviceId'), stryMutAct_9fa48("138195") ? "" : (stryCov_9fa48("138195"), 'id'));
        if (stryMutAct_9fa48("138198") ? serviceReplicaId !== replicaId : stryMutAct_9fa48("138197") ? false : stryMutAct_9fa48("138196") ? true : (stryCov_9fa48("138196", "138197", "138198"), serviceReplicaId === replicaId)) {
          if (stryMutAct_9fa48("138199")) {
            {}
          } else {
            stryCov_9fa48("138199");
            if (stryMutAct_9fa48("138202") ? entityType !== SERVICE_TYPE_PARTITION : stryMutAct_9fa48("138201") ? false : stryMutAct_9fa48("138200") ? true : (stryCov_9fa48("138200", "138201", "138202"), entityType === SERVICE_TYPE_PARTITION)) {
              if (stryMutAct_9fa48("138203")) {
                {}
              } else {
                stryCov_9fa48("138203");
                if (stryMutAct_9fa48("138206") ? String(firstStringField(serviceRow, 'partition_id', 'partitionId', 'id') || '') !== entityId : stryMutAct_9fa48("138205") ? false : stryMutAct_9fa48("138204") ? true : (stryCov_9fa48("138204", "138205", "138206"), String(stryMutAct_9fa48("138209") ? firstStringField(serviceRow, 'partition_id', 'partitionId', 'id') && '' : stryMutAct_9fa48("138208") ? false : stryMutAct_9fa48("138207") ? true : (stryCov_9fa48("138207", "138208", "138209"), firstStringField(serviceRow, stryMutAct_9fa48("138210") ? "" : (stryCov_9fa48("138210"), 'partition_id'), stryMutAct_9fa48("138211") ? "" : (stryCov_9fa48("138211"), 'partitionId'), stryMutAct_9fa48("138212") ? "" : (stryCov_9fa48("138212"), 'id')) || (stryMutAct_9fa48("138213") ? "Stryker was here!" : (stryCov_9fa48("138213"), '')))) === entityId)) {
                  if (stryMutAct_9fa48("138214")) {
                    {}
                  } else {
                    stryCov_9fa48("138214");
                    return stryMutAct_9fa48("138215") ? false : (stryCov_9fa48("138215"), true);
                  }
                }
                continue;
              }
            }
            if (stryMutAct_9fa48("138218") ? entityType !== SERVICE_TYPE_MESSAGE_GROUP : stryMutAct_9fa48("138217") ? false : stryMutAct_9fa48("138216") ? true : (stryCov_9fa48("138216", "138217", "138218"), entityType === SERVICE_TYPE_MESSAGE_GROUP)) {
              if (stryMutAct_9fa48("138219")) {
                {}
              } else {
                stryCov_9fa48("138219");
                if (stryMutAct_9fa48("138222") ? String(firstStringField(serviceRow, 'group_id', 'groupId', 'id') || '') !== entityId : stryMutAct_9fa48("138221") ? false : stryMutAct_9fa48("138220") ? true : (stryCov_9fa48("138220", "138221", "138222"), String(stryMutAct_9fa48("138225") ? firstStringField(serviceRow, 'group_id', 'groupId', 'id') && '' : stryMutAct_9fa48("138224") ? false : stryMutAct_9fa48("138223") ? true : (stryCov_9fa48("138223", "138224", "138225"), firstStringField(serviceRow, stryMutAct_9fa48("138226") ? "" : (stryCov_9fa48("138226"), 'group_id'), stryMutAct_9fa48("138227") ? "" : (stryCov_9fa48("138227"), 'groupId'), stryMutAct_9fa48("138228") ? "" : (stryCov_9fa48("138228"), 'id')) || (stryMutAct_9fa48("138229") ? "Stryker was here!" : (stryCov_9fa48("138229"), '')))) === entityId)) {
                  if (stryMutAct_9fa48("138230")) {
                    {}
                  } else {
                    stryCov_9fa48("138230");
                    return stryMutAct_9fa48("138231") ? false : (stryCov_9fa48("138231"), true);
                  }
                }
                continue;
              }
            }
            return stryMutAct_9fa48("138232") ? false : (stryCov_9fa48("138232"), true);
          }
        }
      }
    }
    return stryMutAct_9fa48("138233") ? true : (stryCov_9fa48("138233"), false);
  }
}
function hasObservedActiveTargetServiceOwnership(record, options = {}) {
  if (stryMutAct_9fa48("138234")) {
    {}
  } else {
    stryCov_9fa48("138234");
    if (stryMutAct_9fa48("138237") ? record?.type === BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE : stryMutAct_9fa48("138236") ? false : stryMutAct_9fa48("138235") ? true : (stryCov_9fa48("138235", "138236", "138237"), (stryMutAct_9fa48("138238") ? record.type : (stryCov_9fa48("138238"), record?.type)) !== BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE)) {
      if (stryMutAct_9fa48("138239")) {
        {}
      } else {
        stryCov_9fa48("138239");
        return stryMutAct_9fa48("138240") ? true : (stryCov_9fa48("138240"), false);
      }
    }
    const replicaId = String(stryMutAct_9fa48("138243") ? record?.replicaId && '' : stryMutAct_9fa48("138242") ? false : stryMutAct_9fa48("138241") ? true : (stryCov_9fa48("138241", "138242", "138243"), (stryMutAct_9fa48("138244") ? record.replicaId : (stryCov_9fa48("138244"), record?.replicaId)) || (stryMutAct_9fa48("138245") ? "Stryker was here!" : (stryCov_9fa48("138245"), ''))));
    const targetNodeId = String(stryMutAct_9fa48("138248") ? record?.targetNodeId && '' : stryMutAct_9fa48("138247") ? false : stryMutAct_9fa48("138246") ? true : (stryCov_9fa48("138246", "138247", "138248"), (stryMutAct_9fa48("138249") ? record.targetNodeId : (stryCov_9fa48("138249"), record?.targetNodeId)) || (stryMutAct_9fa48("138250") ? "Stryker was here!" : (stryCov_9fa48("138250"), ''))));
    if (stryMutAct_9fa48("138253") ? !replicaId && !targetNodeId : stryMutAct_9fa48("138252") ? false : stryMutAct_9fa48("138251") ? true : (stryCov_9fa48("138251", "138252", "138253"), (stryMutAct_9fa48("138254") ? replicaId : (stryCov_9fa48("138254"), !replicaId)) || (stryMutAct_9fa48("138255") ? targetNodeId : (stryCov_9fa48("138255"), !targetNodeId)))) {
      if (stryMutAct_9fa48("138256")) {
        {}
      } else {
        stryCov_9fa48("138256");
        return stryMutAct_9fa48("138257") ? true : (stryCov_9fa48("138257"), false);
      }
    }
    const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : stryMutAct_9fa48("138258") ? ["Stryker was here"] : (stryCov_9fa48("138258"), []);
    for (const serviceRow of serviceRows) {
      if (stryMutAct_9fa48("138259")) {
        {}
      } else {
        stryCov_9fa48("138259");
        if (stryMutAct_9fa48("138262") ? String(firstStringField(serviceRow, 'status') || '').toLowerCase() === REPLICA_OPERATION_STATUS_ACTIVE : stryMutAct_9fa48("138261") ? false : stryMutAct_9fa48("138260") ? true : (stryCov_9fa48("138260", "138261", "138262"), (stryMutAct_9fa48("138263") ? String(firstStringField(serviceRow, 'status') || '').toUpperCase() : (stryCov_9fa48("138263"), String(stryMutAct_9fa48("138266") ? firstStringField(serviceRow, 'status') && '' : stryMutAct_9fa48("138265") ? false : stryMutAct_9fa48("138264") ? true : (stryCov_9fa48("138264", "138265", "138266"), firstStringField(serviceRow, stryMutAct_9fa48("138267") ? "" : (stryCov_9fa48("138267"), 'status')) || (stryMutAct_9fa48("138268") ? "Stryker was here!" : (stryCov_9fa48("138268"), '')))).toLowerCase())) !== REPLICA_OPERATION_STATUS_ACTIVE)) {
          if (stryMutAct_9fa48("138269")) {
            {}
          } else {
            stryCov_9fa48("138269");
            continue;
          }
        }
        if (stryMutAct_9fa48("138272") ? String(firstStringField(serviceRow, 'node_id', 'nodeId') || '') === targetNodeId : stryMutAct_9fa48("138271") ? false : stryMutAct_9fa48("138270") ? true : (stryCov_9fa48("138270", "138271", "138272"), String(stryMutAct_9fa48("138275") ? firstStringField(serviceRow, 'node_id', 'nodeId') && '' : stryMutAct_9fa48("138274") ? false : stryMutAct_9fa48("138273") ? true : (stryCov_9fa48("138273", "138274", "138275"), firstStringField(serviceRow, stryMutAct_9fa48("138276") ? "" : (stryCov_9fa48("138276"), 'node_id'), stryMutAct_9fa48("138277") ? "" : (stryCov_9fa48("138277"), 'nodeId')) || (stryMutAct_9fa48("138278") ? "Stryker was here!" : (stryCov_9fa48("138278"), '')))) !== targetNodeId)) {
          if (stryMutAct_9fa48("138279")) {
            {}
          } else {
            stryCov_9fa48("138279");
            continue;
          }
        }
        const serviceReplicaId = firstStringField(serviceRow, stryMutAct_9fa48("138280") ? "" : (stryCov_9fa48("138280"), 'replica_id'), stryMutAct_9fa48("138281") ? "" : (stryCov_9fa48("138281"), 'replicaId'), stryMutAct_9fa48("138282") ? "" : (stryCov_9fa48("138282"), 'service_id'), stryMutAct_9fa48("138283") ? "" : (stryCov_9fa48("138283"), 'serviceId'), stryMutAct_9fa48("138284") ? "" : (stryCov_9fa48("138284"), 'id'));
        if (stryMutAct_9fa48("138287") ? serviceReplicaId !== replicaId : stryMutAct_9fa48("138286") ? false : stryMutAct_9fa48("138285") ? true : (stryCov_9fa48("138285", "138286", "138287"), serviceReplicaId === replicaId)) {
          if (stryMutAct_9fa48("138288")) {
            {}
          } else {
            stryCov_9fa48("138288");
            return stryMutAct_9fa48("138289") ? false : (stryCov_9fa48("138289"), true);
          }
        }
      }
    }
    return stryMutAct_9fa48("138290") ? true : (stryCov_9fa48("138290"), false);
  }
}
function isReplicaOperationInFlight(record, options = {}) {
  if (stryMutAct_9fa48("138291")) {
    {}
  } else {
    stryCov_9fa48("138291");
    if (stryMutAct_9fa48("138294") ? !record && typeof record !== 'object' : stryMutAct_9fa48("138293") ? false : stryMutAct_9fa48("138292") ? true : (stryCov_9fa48("138292", "138293", "138294"), (stryMutAct_9fa48("138295") ? record : (stryCov_9fa48("138295"), !record)) || (stryMutAct_9fa48("138297") ? typeof record === 'object' : stryMutAct_9fa48("138296") ? false : (stryCov_9fa48("138296", "138297"), typeof record !== (stryMutAct_9fa48("138298") ? "" : (stryCov_9fa48("138298"), 'object')))))) {
      if (stryMutAct_9fa48("138299")) {
        {}
      } else {
        stryCov_9fa48("138299");
        return stryMutAct_9fa48("138300") ? true : (stryCov_9fa48("138300"), false);
      }
    }
    const normalizedStatus = stryMutAct_9fa48("138301") ? String(record.status || '').toUpperCase() : (stryCov_9fa48("138301"), String(stryMutAct_9fa48("138304") ? record.status && '' : stryMutAct_9fa48("138303") ? false : stryMutAct_9fa48("138302") ? true : (stryCov_9fa48("138302", "138303", "138304"), record.status || (stryMutAct_9fa48("138305") ? "Stryker was here!" : (stryCov_9fa48("138305"), '')))).toLowerCase());
    if (stryMutAct_9fa48("138307") ? false : stryMutAct_9fa48("138306") ? true : (stryCov_9fa48("138306", "138307"), REPLICA_OPERATION_IN_FLIGHT_EXCLUDED_STATUSES.has(normalizedStatus))) {
      if (stryMutAct_9fa48("138308")) {
        {}
      } else {
        stryCov_9fa48("138308");
        return stryMutAct_9fa48("138309") ? true : (stryCov_9fa48("138309"), false);
      }
    }
    if (stryMutAct_9fa48("138311") ? false : stryMutAct_9fa48("138310") ? true : (stryCov_9fa48("138310", "138311"), isReplicaOperationTerminalSuccess(record))) {
      if (stryMutAct_9fa48("138312")) {
        {}
      } else {
        stryCov_9fa48("138312");
        return stryMutAct_9fa48("138313") ? true : (stryCov_9fa48("138313"), false);
      }
    }
    return stryMutAct_9fa48("138314") ? hasObservedActiveTargetReplica(record, options) : (stryCov_9fa48("138314"), !hasObservedActiveTargetReplica(record, options));
  }
}
function resolveStepTimeoutMs(workflowStep, options = {}) {
  if (stryMutAct_9fa48("138315")) {
    {}
  } else {
    stryCov_9fa48("138315");
    if (stryMutAct_9fa48("138318") ? false : stryMutAct_9fa48("138317") ? true : stryMutAct_9fa48("138316") ? workflowStep : (stryCov_9fa48("138316", "138317", "138318"), !workflowStep)) {
      if (stryMutAct_9fa48("138319")) {
        {}
      } else {
        stryCov_9fa48("138319");
        return null;
      }
    }
    const timeoutByStep = (stryMutAct_9fa48("138322") ? options.stepTimeoutMsByWorkflowStep || typeof options.stepTimeoutMsByWorkflowStep === 'object' : stryMutAct_9fa48("138321") ? false : stryMutAct_9fa48("138320") ? true : (stryCov_9fa48("138320", "138321", "138322"), options.stepTimeoutMsByWorkflowStep && (stryMutAct_9fa48("138324") ? typeof options.stepTimeoutMsByWorkflowStep !== 'object' : stryMutAct_9fa48("138323") ? true : (stryCov_9fa48("138323", "138324"), typeof options.stepTimeoutMsByWorkflowStep === (stryMutAct_9fa48("138325") ? "" : (stryCov_9fa48("138325"), 'object')))))) ? options.stepTimeoutMsByWorkflowStep : DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP;
    const timeoutMs = Number(timeoutByStep[workflowStep]);
    return (stryMutAct_9fa48("138328") ? Number.isFinite(timeoutMs) || timeoutMs > NUM.ZERO : stryMutAct_9fa48("138327") ? false : stryMutAct_9fa48("138326") ? true : (stryCov_9fa48("138326", "138327", "138328"), Number.isFinite(timeoutMs) && (stryMutAct_9fa48("138331") ? timeoutMs <= NUM.ZERO : stryMutAct_9fa48("138330") ? timeoutMs >= NUM.ZERO : stryMutAct_9fa48("138329") ? true : (stryCov_9fa48("138329", "138330", "138331"), timeoutMs > NUM.ZERO)))) ? Math.floor(timeoutMs) : null;
  }
}
function isReplicaOperationStale(record, options = {}) {
  if (stryMutAct_9fa48("138332")) {
    {}
  } else {
    stryCov_9fa48("138332");
    if (stryMutAct_9fa48("138335") ? false : stryMutAct_9fa48("138334") ? true : stryMutAct_9fa48("138333") ? isReplicaOperationInFlight(record, options) : (stryCov_9fa48("138333", "138334", "138335"), !isReplicaOperationInFlight(record, options))) {
      if (stryMutAct_9fa48("138336")) {
        {}
      } else {
        stryCov_9fa48("138336");
        return stryMutAct_9fa48("138337") ? true : (stryCov_9fa48("138337"), false);
      }
    }
    const nowMs = Number.isFinite(options.nowMs) ? Math.floor(options.nowMs) : Date.now();
    const updatedAtMs = normalizeEpochMillis(stryMutAct_9fa48("138338") ? record.updatedAt : (stryCov_9fa48("138338"), record?.updatedAt));
    const staleTimeoutLookbackMs = (stryMutAct_9fa48("138341") ? Number.isFinite(options.staleTimeoutLookbackMs) || options.staleTimeoutLookbackMs > NUM.ZERO : stryMutAct_9fa48("138340") ? false : stryMutAct_9fa48("138339") ? true : (stryCov_9fa48("138339", "138340", "138341"), Number.isFinite(options.staleTimeoutLookbackMs) && (stryMutAct_9fa48("138344") ? options.staleTimeoutLookbackMs <= NUM.ZERO : stryMutAct_9fa48("138343") ? options.staleTimeoutLookbackMs >= NUM.ZERO : stryMutAct_9fa48("138342") ? true : (stryCov_9fa48("138342", "138343", "138344"), options.staleTimeoutLookbackMs > NUM.ZERO)))) ? Math.floor(options.staleTimeoutLookbackMs) : STALE_TIMEOUT_CLASSIFICATION_LOOKBACK_MS;
    if (stryMutAct_9fa48("138347") ? Number.isFinite(updatedAtMs) || nowMs - updatedAtMs > staleTimeoutLookbackMs : stryMutAct_9fa48("138346") ? false : stryMutAct_9fa48("138345") ? true : (stryCov_9fa48("138345", "138346", "138347"), Number.isFinite(updatedAtMs) && (stryMutAct_9fa48("138350") ? nowMs - updatedAtMs <= staleTimeoutLookbackMs : stryMutAct_9fa48("138349") ? nowMs - updatedAtMs >= staleTimeoutLookbackMs : stryMutAct_9fa48("138348") ? true : (stryCov_9fa48("138348", "138349", "138350"), (stryMutAct_9fa48("138351") ? nowMs + updatedAtMs : (stryCov_9fa48("138351"), nowMs - updatedAtMs)) > staleTimeoutLookbackMs)))) {
      if (stryMutAct_9fa48("138352")) {
        {}
      } else {
        stryCov_9fa48("138352");
        return stryMutAct_9fa48("138353") ? true : (stryCov_9fa48("138353"), false);
      }
    }
    const timeoutMs = resolveStepTimeoutMs(record.workflowStep, options);
    if (stryMutAct_9fa48("138356") ? false : stryMutAct_9fa48("138355") ? true : stryMutAct_9fa48("138354") ? Number.isFinite(timeoutMs) : (stryCov_9fa48("138354", "138355", "138356"), !Number.isFinite(timeoutMs))) {
      if (stryMutAct_9fa48("138357")) {
        {}
      } else {
        stryCov_9fa48("138357");
        return stryMutAct_9fa48("138358") ? true : (stryCov_9fa48("138358"), false);
      }
    }
    const ageMs = Number(record.ageMs);
    if (stryMutAct_9fa48("138361") ? false : stryMutAct_9fa48("138360") ? true : stryMutAct_9fa48("138359") ? Number.isFinite(ageMs) : (stryCov_9fa48("138359", "138360", "138361"), !Number.isFinite(ageMs))) {
      if (stryMutAct_9fa48("138362")) {
        {}
      } else {
        stryCov_9fa48("138362");
        return stryMutAct_9fa48("138363") ? true : (stryCov_9fa48("138363"), false);
      }
    }
    return stryMutAct_9fa48("138367") ? ageMs < timeoutMs : stryMutAct_9fa48("138366") ? ageMs > timeoutMs : stryMutAct_9fa48("138365") ? false : stryMutAct_9fa48("138364") ? true : (stryCov_9fa48("138364", "138365", "138366", "138367"), ageMs >= timeoutMs);
  }
}
function normalizeTimelineEventEntry(event, operationId, nowMs) {
  if (stryMutAct_9fa48("138368")) {
    {}
  } else {
    stryCov_9fa48("138368");
    if (stryMutAct_9fa48("138371") ? !event && typeof event !== 'object' : stryMutAct_9fa48("138370") ? false : stryMutAct_9fa48("138369") ? true : (stryCov_9fa48("138369", "138370", "138371"), (stryMutAct_9fa48("138372") ? event : (stryCov_9fa48("138372"), !event)) || (stryMutAct_9fa48("138374") ? typeof event === 'object' : stryMutAct_9fa48("138373") ? false : (stryCov_9fa48("138373", "138374"), typeof event !== (stryMutAct_9fa48("138375") ? "" : (stryCov_9fa48("138375"), 'object')))))) {
      if (stryMutAct_9fa48("138376")) {
        {}
      } else {
        stryCov_9fa48("138376");
        return null;
      }
    }
    const step = stryMutAct_9fa48("138377") ? String(event.step || '').toLowerCase() : (stryCov_9fa48("138377"), String(stryMutAct_9fa48("138380") ? event.step && '' : stryMutAct_9fa48("138379") ? false : stryMutAct_9fa48("138378") ? true : (stryCov_9fa48("138378", "138379", "138380"), event.step || (stryMutAct_9fa48("138381") ? "Stryker was here!" : (stryCov_9fa48("138381"), '')))).toUpperCase());
    const timestampMs = normalizeEpochMillis(stryMutAct_9fa48("138382") ? event.timestamp && event.timestampMs : (stryCov_9fa48("138382"), event.timestamp ?? event.timestampMs));
    if (stryMutAct_9fa48("138385") ? !step && !Number.isFinite(timestampMs) : stryMutAct_9fa48("138384") ? false : stryMutAct_9fa48("138383") ? true : (stryCov_9fa48("138383", "138384", "138385"), (stryMutAct_9fa48("138386") ? step : (stryCov_9fa48("138386"), !step)) || (stryMutAct_9fa48("138387") ? Number.isFinite(timestampMs) : (stryCov_9fa48("138387"), !Number.isFinite(timestampMs))))) {
      if (stryMutAct_9fa48("138388")) {
        {}
      } else {
        stryCov_9fa48("138388");
        return null;
      }
    }
    const metadata = {};
    for (const [key, value] of Object.entries(event)) {
      if (stryMutAct_9fa48("138389")) {
        {}
      } else {
        stryCov_9fa48("138389");
        if (stryMutAct_9fa48("138392") ? (key === 'step' || key === 'timestamp') && key === 'timestampMs' : stryMutAct_9fa48("138391") ? false : stryMutAct_9fa48("138390") ? true : (stryCov_9fa48("138390", "138391", "138392"), (stryMutAct_9fa48("138394") ? key === 'step' && key === 'timestamp' : stryMutAct_9fa48("138393") ? false : (stryCov_9fa48("138393", "138394"), (stryMutAct_9fa48("138396") ? key !== 'step' : stryMutAct_9fa48("138395") ? false : (stryCov_9fa48("138395", "138396"), key === (stryMutAct_9fa48("138397") ? "" : (stryCov_9fa48("138397"), 'step')))) || (stryMutAct_9fa48("138399") ? key !== 'timestamp' : stryMutAct_9fa48("138398") ? false : (stryCov_9fa48("138398", "138399"), key === (stryMutAct_9fa48("138400") ? "" : (stryCov_9fa48("138400"), 'timestamp')))))) || (stryMutAct_9fa48("138402") ? key !== 'timestampMs' : stryMutAct_9fa48("138401") ? false : (stryCov_9fa48("138401", "138402"), key === (stryMutAct_9fa48("138403") ? "" : (stryCov_9fa48("138403"), 'timestampMs')))))) {
          if (stryMutAct_9fa48("138404")) {
            {}
          } else {
            stryCov_9fa48("138404");
            continue;
          }
        }
        metadata[key] = value;
      }
    }
    return stryMutAct_9fa48("138405") ? {} : (stryCov_9fa48("138405"), {
      eventType: OPERATION_TIMELINE_EVENT_STEP,
      operationId,
      step,
      timestampMs,
      ageMs: Number.isFinite(nowMs) ? stryMutAct_9fa48("138406") ? Math.min(NUM.ZERO, Math.floor(nowMs - timestampMs)) : (stryCov_9fa48("138406"), Math.max(NUM.ZERO, Math.floor(stryMutAct_9fa48("138407") ? nowMs + timestampMs : (stryCov_9fa48("138407"), nowMs - timestampMs)))) : null,
      ...((stryMutAct_9fa48("138411") ? Object.keys(metadata).length <= NUM.ZERO : stryMutAct_9fa48("138410") ? Object.keys(metadata).length >= NUM.ZERO : stryMutAct_9fa48("138409") ? false : stryMutAct_9fa48("138408") ? true : (stryCov_9fa48("138408", "138409", "138410", "138411"), Object.keys(metadata).length > NUM.ZERO)) ? stryMutAct_9fa48("138412") ? {} : (stryCov_9fa48("138412"), {
        metadata
      }) : {})
    });
  }
}
function buildReplicaOperationTimeline(record, options = {}) {
  if (stryMutAct_9fa48("138413")) {
    {}
  } else {
    stryCov_9fa48("138413");
    if (stryMutAct_9fa48("138416") ? false : stryMutAct_9fa48("138415") ? true : stryMutAct_9fa48("138414") ? record?.operationId : (stryCov_9fa48("138414", "138415", "138416"), !(stryMutAct_9fa48("138417") ? record.operationId : (stryCov_9fa48("138417"), record?.operationId)))) {
      if (stryMutAct_9fa48("138418")) {
        {}
      } else {
        stryCov_9fa48("138418");
        return stryMutAct_9fa48("138419") ? ["Stryker was here"] : (stryCov_9fa48("138419"), []);
      }
    }
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const maxEntries = (stryMutAct_9fa48("138422") ? Number.isInteger(options.maxEntriesPerOperation) || options.maxEntriesPerOperation > NUM.ZERO : stryMutAct_9fa48("138421") ? false : stryMutAct_9fa48("138420") ? true : (stryCov_9fa48("138420", "138421", "138422"), Number.isInteger(options.maxEntriesPerOperation) && (stryMutAct_9fa48("138425") ? options.maxEntriesPerOperation <= NUM.ZERO : stryMutAct_9fa48("138424") ? options.maxEntriesPerOperation >= NUM.ZERO : stryMutAct_9fa48("138423") ? true : (stryCov_9fa48("138423", "138424", "138425"), options.maxEntriesPerOperation > NUM.ZERO)))) ? options.maxEntriesPerOperation : DEFAULT_TIMELINE_ENTRIES_PER_OPERATION;
    const timeline = stryMutAct_9fa48("138426") ? ["Stryker was here"] : (stryCov_9fa48("138426"), []);
    for (const entry of stryMutAct_9fa48("138429") ? record.stepsHistory && [] : stryMutAct_9fa48("138428") ? false : stryMutAct_9fa48("138427") ? true : (stryCov_9fa48("138427", "138428", "138429"), record.stepsHistory || (stryMutAct_9fa48("138430") ? ["Stryker was here"] : (stryCov_9fa48("138430"), [])))) {
      if (stryMutAct_9fa48("138431")) {
        {}
      } else {
        stryCov_9fa48("138431");
        const normalizedEntry = normalizeTimelineEventEntry(entry, record.operationId, nowMs);
        if (stryMutAct_9fa48("138433") ? false : stryMutAct_9fa48("138432") ? true : (stryCov_9fa48("138432", "138433"), normalizedEntry)) {
          if (stryMutAct_9fa48("138434")) {
            {}
          } else {
            stryCov_9fa48("138434");
            timeline.push(normalizedEntry);
          }
        }
      }
    }
    if (stryMutAct_9fa48("138437") ? options.includeCurrentState !== false && record.workflowStep || Number.isFinite(record.updatedAt) : stryMutAct_9fa48("138436") ? false : stryMutAct_9fa48("138435") ? true : (stryCov_9fa48("138435", "138436", "138437"), (stryMutAct_9fa48("138439") ? options.includeCurrentState !== false || record.workflowStep : stryMutAct_9fa48("138438") ? true : (stryCov_9fa48("138438", "138439"), (stryMutAct_9fa48("138441") ? options.includeCurrentState === false : stryMutAct_9fa48("138440") ? true : (stryCov_9fa48("138440", "138441"), options.includeCurrentState !== (stryMutAct_9fa48("138442") ? true : (stryCov_9fa48("138442"), false)))) && record.workflowStep)) && Number.isFinite(record.updatedAt))) {
      if (stryMutAct_9fa48("138443")) {
        {}
      } else {
        stryCov_9fa48("138443");
        timeline.push(stryMutAct_9fa48("138444") ? {} : (stryCov_9fa48("138444"), {
          eventType: OPERATION_TIMELINE_EVENT_STATE,
          operationId: record.operationId,
          step: record.workflowStep,
          timestampMs: record.updatedAt,
          ageMs: Number.isFinite(record.ageMs) ? record.ageMs : null,
          status: stryMutAct_9fa48("138447") ? record.status && UNKNOWN_STATUS : stryMutAct_9fa48("138446") ? false : stryMutAct_9fa48("138445") ? true : (stryCov_9fa48("138445", "138446", "138447"), record.status || UNKNOWN_STATUS),
          inFlight: isReplicaOperationInFlight(record, options),
          staleTimeout: isReplicaOperationStale(record, options),
          timeoutMs: resolveStepTimeoutMs(record.workflowStep, options)
        }));
      }
    }
    stryMutAct_9fa48("138448") ? timeline : (stryCov_9fa48("138448"), timeline.sort((left, right) => {
      if (stryMutAct_9fa48("138449")) {
        {}
      } else {
        stryCov_9fa48("138449");
        const leftTs = Number(stryMutAct_9fa48("138452") ? left?.timestampMs && NUM.ZERO : stryMutAct_9fa48("138451") ? false : stryMutAct_9fa48("138450") ? true : (stryCov_9fa48("138450", "138451", "138452"), (stryMutAct_9fa48("138453") ? left.timestampMs : (stryCov_9fa48("138453"), left?.timestampMs)) || NUM.ZERO));
        const rightTs = Number(stryMutAct_9fa48("138456") ? right?.timestampMs && NUM.ZERO : stryMutAct_9fa48("138455") ? false : stryMutAct_9fa48("138454") ? true : (stryCov_9fa48("138454", "138455", "138456"), (stryMutAct_9fa48("138457") ? right.timestampMs : (stryCov_9fa48("138457"), right?.timestampMs)) || NUM.ZERO));
        return stryMutAct_9fa48("138458") ? leftTs + rightTs : (stryCov_9fa48("138458"), leftTs - rightTs);
      }
    }));
    if (stryMutAct_9fa48("138462") ? timeline.length > maxEntries : stryMutAct_9fa48("138461") ? timeline.length < maxEntries : stryMutAct_9fa48("138460") ? false : stryMutAct_9fa48("138459") ? true : (stryCov_9fa48("138459", "138460", "138461", "138462"), timeline.length <= maxEntries)) {
      if (stryMutAct_9fa48("138463")) {
        {}
      } else {
        stryCov_9fa48("138463");
        return timeline;
      }
    }
    return stryMutAct_9fa48("138464") ? timeline : (stryCov_9fa48("138464"), timeline.slice(stryMutAct_9fa48("138465") ? timeline.length + maxEntries : (stryCov_9fa48("138465"), timeline.length - maxEntries)));
  }
}
function summarizeReplicaOperationLiveness(rows = stryMutAct_9fa48("138466") ? ["Stryker was here"] : (stryCov_9fa48("138466"), []), options = {}) {
  if (stryMutAct_9fa48("138467")) {
    {}
  } else {
    stryCov_9fa48("138467");
    const scopedPartitionIds = (stryMutAct_9fa48("138470") ? options.partitionIds instanceof Set || options.partitionIds.size > NUM.ZERO : stryMutAct_9fa48("138469") ? false : stryMutAct_9fa48("138468") ? true : (stryCov_9fa48("138468", "138469", "138470"), options.partitionIds instanceof Set && (stryMutAct_9fa48("138473") ? options.partitionIds.size <= NUM.ZERO : stryMutAct_9fa48("138472") ? options.partitionIds.size >= NUM.ZERO : stryMutAct_9fa48("138471") ? true : (stryCov_9fa48("138471", "138472", "138473"), options.partitionIds.size > NUM.ZERO)))) ? options.partitionIds : null;
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const includeTimeline = stryMutAct_9fa48("138476") ? options.includeTimeline === false : stryMutAct_9fa48("138475") ? false : stryMutAct_9fa48("138474") ? true : (stryCov_9fa48("138474", "138475", "138476"), options.includeTimeline !== (stryMutAct_9fa48("138477") ? true : (stryCov_9fa48("138477"), false)));
    const statusHistogram = {};
    const stepHistogram = {};
    const partitionGroupInFlight = {};
    const operationTimelineById = {};
    const inFlightOperationIds = stryMutAct_9fa48("138478") ? ["Stryker was here"] : (stryCov_9fa48("138478"), []);
    let inFlightCount = NUM.ZERO;
    let staleInFlightCount = NUM.ZERO;
    let oldestInFlightAgeMs = null;
    for (const row of rows) {
      if (stryMutAct_9fa48("138479")) {
        {}
      } else {
        stryCov_9fa48("138479");
        const record = normalizeReplicaOperationRecord(row, stryMutAct_9fa48("138480") ? {} : (stryCov_9fa48("138480"), {
          nowMs
        }));
        if (stryMutAct_9fa48("138483") ? scopedPartitionIds || !scopedPartitionIds.has(record.partitionGroupId) : stryMutAct_9fa48("138482") ? false : stryMutAct_9fa48("138481") ? true : (stryCov_9fa48("138481", "138482", "138483"), scopedPartitionIds && (stryMutAct_9fa48("138484") ? scopedPartitionIds.has(record.partitionGroupId) : (stryCov_9fa48("138484"), !scopedPartitionIds.has(record.partitionGroupId))))) {
          if (stryMutAct_9fa48("138485")) {
            {}
          } else {
            stryCov_9fa48("138485");
            continue;
          }
        }
        const statusKey = stryMutAct_9fa48("138488") ? record.status && UNKNOWN_STATUS : stryMutAct_9fa48("138487") ? false : stryMutAct_9fa48("138486") ? true : (stryCov_9fa48("138486", "138487", "138488"), record.status || UNKNOWN_STATUS);
        statusHistogram[statusKey] = stryMutAct_9fa48("138489") ? (statusHistogram[statusKey] || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("138489"), (stryMutAct_9fa48("138492") ? statusHistogram[statusKey] && NUM.ZERO : stryMutAct_9fa48("138491") ? false : stryMutAct_9fa48("138490") ? true : (stryCov_9fa48("138490", "138491", "138492"), statusHistogram[statusKey] || NUM.ZERO)) + NUM.ONE);
        if (stryMutAct_9fa48("138495") ? includeTimeline || record.operationId : stryMutAct_9fa48("138494") ? false : stryMutAct_9fa48("138493") ? true : (stryCov_9fa48("138493", "138494", "138495"), includeTimeline && record.operationId)) {
          if (stryMutAct_9fa48("138496")) {
            {}
          } else {
            stryCov_9fa48("138496");
            operationTimelineById[record.operationId] = buildReplicaOperationTimeline(record, stryMutAct_9fa48("138497") ? {} : (stryCov_9fa48("138497"), {
              ...options,
              nowMs,
              includeCurrentState: stryMutAct_9fa48("138498") ? false : (stryCov_9fa48("138498"), true)
            }));
          }
        }
        if (stryMutAct_9fa48("138501") ? false : stryMutAct_9fa48("138500") ? true : stryMutAct_9fa48("138499") ? isReplicaOperationInFlight(record, options) : (stryCov_9fa48("138499", "138500", "138501"), !isReplicaOperationInFlight(record, options))) {
          if (stryMutAct_9fa48("138502")) {
            {}
          } else {
            stryCov_9fa48("138502");
            continue;
          }
        }
        stryMutAct_9fa48("138503") ? inFlightCount -= NUM.ONE : (stryCov_9fa48("138503"), inFlightCount += NUM.ONE);
        inFlightOperationIds.push(record.operationId);
        partitionGroupInFlight[record.partitionGroupId] = stryMutAct_9fa48("138504") ? (partitionGroupInFlight[record.partitionGroupId] || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("138504"), (stryMutAct_9fa48("138507") ? partitionGroupInFlight[record.partitionGroupId] && NUM.ZERO : stryMutAct_9fa48("138506") ? false : stryMutAct_9fa48("138505") ? true : (stryCov_9fa48("138505", "138506", "138507"), partitionGroupInFlight[record.partitionGroupId] || NUM.ZERO)) + NUM.ONE);
        const stepKey = stryMutAct_9fa48("138510") ? record.workflowStep && UNKNOWN_WORKFLOW_STEP : stryMutAct_9fa48("138509") ? false : stryMutAct_9fa48("138508") ? true : (stryCov_9fa48("138508", "138509", "138510"), record.workflowStep || UNKNOWN_WORKFLOW_STEP);
        stepHistogram[stepKey] = stryMutAct_9fa48("138511") ? (stepHistogram[stepKey] || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("138511"), (stryMutAct_9fa48("138514") ? stepHistogram[stepKey] && NUM.ZERO : stryMutAct_9fa48("138513") ? false : stryMutAct_9fa48("138512") ? true : (stryCov_9fa48("138512", "138513", "138514"), stepHistogram[stepKey] || NUM.ZERO)) + NUM.ONE);
        if (stryMutAct_9fa48("138516") ? false : stryMutAct_9fa48("138515") ? true : (stryCov_9fa48("138515", "138516"), Number.isFinite(record.ageMs))) {
          if (stryMutAct_9fa48("138517")) {
            {}
          } else {
            stryCov_9fa48("138517");
            oldestInFlightAgeMs = (stryMutAct_9fa48("138520") ? oldestInFlightAgeMs !== null : stryMutAct_9fa48("138519") ? false : stryMutAct_9fa48("138518") ? true : (stryCov_9fa48("138518", "138519", "138520"), oldestInFlightAgeMs === null)) ? record.ageMs : stryMutAct_9fa48("138521") ? Math.min(oldestInFlightAgeMs, record.ageMs) : (stryCov_9fa48("138521"), Math.max(oldestInFlightAgeMs, record.ageMs));
          }
        }
        if (stryMutAct_9fa48("138523") ? false : stryMutAct_9fa48("138522") ? true : (stryCov_9fa48("138522", "138523"), isReplicaOperationStale(record, options))) {
          if (stryMutAct_9fa48("138524")) {
            {}
          } else {
            stryCov_9fa48("138524");
            stryMutAct_9fa48("138525") ? staleInFlightCount -= NUM.ONE : (stryCov_9fa48("138525"), staleInFlightCount += NUM.ONE);
          }
        }
      }
    }
    return stryMutAct_9fa48("138526") ? {} : (stryCov_9fa48("138526"), {
      inFlightCount,
      statusHistogram,
      partitionGroupInFlight,
      stepHistogram,
      oldestInFlightAgeMs,
      staleInFlightCount,
      inFlightOperationIds,
      operationTimelineById
    });
  }
}
export { DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP, REPLICA_OPERATION_IN_FLIGHT_EXCLUDED_STATUSES, buildReplicaOperationTimeline, isReplicaOperationInFlight, isReplicaOperationStale, isReplicaOperationTerminalSuccess, normalizeReplicaOperationRecord, resolveStepTimeoutMs, summarizeReplicaOperationLiveness };