/**
 * Unified Replica Status and Operation Types.
 *
 * This module provides a single source of truth for replica states used
 * across all components: RebalanceCoordinator, ReplicaHandler, CDC, Admin CLI.
 *
 * Requirements: 5.1, 5.2
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
import { WORKFLOW_STEP } from '../constants/index.js';

/**
 * ReplicaStatus - Single source of truth for replica states.
 * Used by RebalanceCoordinator, ReplicaHandler, CDC, and Admin CLI.
 *
 * @enum {string}
 */
const ReplicaStatus = stryMutAct_9fa48("140672") ? {} : (stryCov_9fa48("140672"), {
  /** Operation created, not yet sent */
  PENDING: stryMutAct_9fa48("140673") ? "" : (stryCov_9fa48("140673"), 'pending'),
  /** Request sent, awaiting creation */
  CREATING: stryMutAct_9fa48("140674") ? "" : (stryCov_9fa48("140674"), 'creating'),
  /** Replica created, syncing data */
  SYNCING: stryMutAct_9fa48("140675") ? "" : (stryCov_9fa48("140675"), 'syncing'),
  /** Fully operational */
  ACTIVE: stryMutAct_9fa48("140676") ? "" : (stryCov_9fa48("140676"), 'active'),
  /** Removal in progress */
  REMOVING: stryMutAct_9fa48("140677") ? "" : (stryCov_9fa48("140677"), 'removing'),
  /** Fully removed */
  REMOVED: stryMutAct_9fa48("140678") ? "" : (stryCov_9fa48("140678"), 'removed'),
  /** Operation failed */
  FAILED: stryMutAct_9fa48("140679") ? "" : (stryCov_9fa48("140679"), 'failed')
});

/**
 * Terminal statuses represent completed or failed operations.
 * A replica in one of these statuses has reached a final state.
 *
 * @type {string[]}
 */
const TERMINAL_STATUSES = stryMutAct_9fa48("140680") ? [] : (stryCov_9fa48("140680"), [ReplicaStatus.ACTIVE, ReplicaStatus.REMOVED, ReplicaStatus.FAILED]);

/**
 * SQL clause fragment for filtering by terminal statuses.
 * Built programmatically from TERMINAL_STATUSES to ensure consistency.
 * Usage: `WHERE status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})`
 *
 * @type {string}
 */
const TERMINAL_STATUS_SQL_CLAUSE = TERMINAL_STATUSES.map(stryMutAct_9fa48("140681") ? () => undefined : (stryCov_9fa48("140681"), s => stryMutAct_9fa48("140682") ? `` : (stryCov_9fa48("140682"), `'${s}'`))).join(stryMutAct_9fa48("140683") ? "" : (stryCov_9fa48("140683"), ', '));

/**
 * Direction constants for adjustToOddCount function.
 *
 * @enum {string}
 */
const ADJUST_DIRECTION = Object.freeze(stryMutAct_9fa48("140684") ? {} : (stryCov_9fa48("140684"), {
  UP: stryMutAct_9fa48("140685") ? "" : (stryCov_9fa48("140685"), 'up'),
  DOWN: stryMutAct_9fa48("140686") ? "" : (stryCov_9fa48("140686"), 'down')
}));

/**
 * Workflow steps map to statuses.
 * Maps workflow step names to their corresponding ReplicaStatus values.
 *
 * @type {Object.<string, string>}
 */
const WORKFLOW_STEP_TO_STATUS = stryMutAct_9fa48("140687") ? {} : (stryCov_9fa48("140687"), {
  [WORKFLOW_STEP.PENDING]: ReplicaStatus.PENDING,
  [WORKFLOW_STEP.SENDING]: ReplicaStatus.PENDING,
  [WORKFLOW_STEP.CREATING]: ReplicaStatus.CREATING,
  [WORKFLOW_STEP.SYNCING]: ReplicaStatus.SYNCING,
  [WORKFLOW_STEP.ACTIVE]: ReplicaStatus.ACTIVE,
  [WORKFLOW_STEP.STOPPING]: ReplicaStatus.REMOVING,
  [WORKFLOW_STEP.REMOVED]: ReplicaStatus.REMOVED
});

/**
 * Operation types for replica operations.
 *
 * @enum {string}
 */
const OperationType = stryMutAct_9fa48("140688") ? {} : (stryCov_9fa48("140688"), {
  /** Add a new replica */
  ADD: stryMutAct_9fa48("140689") ? "" : (stryCov_9fa48("140689"), 'ADD'),
  /** Remove an existing replica */
  REMOVE: stryMutAct_9fa48("140690") ? "" : (stryCov_9fa48("140690"), 'REMOVE'),
  /** Replace an existing replica (create/sync/promote/remove source) */
  REPLACE: stryMutAct_9fa48("140691") ? "" : (stryCov_9fa48("140691"), 'REPLACE')
});
const COORDINATOR_OWNED_OPERATION_TYPES = Object.freeze(stryMutAct_9fa48("140692") ? [] : (stryCov_9fa48("140692"), [OperationType.ADD, OperationType.REMOVE, OperationType.REPLACE]));
const COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE = COORDINATOR_OWNED_OPERATION_TYPES.map(stryMutAct_9fa48("140693") ? () => undefined : (stryCov_9fa48("140693"), type => stryMutAct_9fa48("140694") ? `` : (stryCov_9fa48("140694"), `'${type}'`))).join(stryMutAct_9fa48("140695") ? "" : (stryCov_9fa48("140695"), ', '));

/**
 * Workflow steps for ADD operations.
 * Progress in order: PENDING → SENDING → CREATING → SYNCING → ACTIVE
 *
 * @type {string[]}
 */
const ADD_WORKFLOW_STEPS = stryMutAct_9fa48("140696") ? [] : (stryCov_9fa48("140696"), [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING, WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]);

/**
 * Workflow steps for REMOVE operations.
 * Progress in order: PENDING → SENDING → STOPPING → REMOVED
 *
 * @type {string[]}
 */
const REMOVE_WORKFLOW_STEPS = stryMutAct_9fa48("140697") ? [] : (stryCov_9fa48("140697"), [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.STOPPING, WORKFLOW_STEP.REMOVED]);

/**
 * Workflow steps for REPLACE operations.
 * Progress in order:
 * PENDING → SENDING → CREATING → SYNCING → ACTIVE → STOPPING → REMOVED
 *
 * ACTIVE represents "replacement promoted and voter-ready".
 *
 * @type {string[]}
 */
const REPLACE_WORKFLOW_STEPS = stryMutAct_9fa48("140698") ? [] : (stryCov_9fa48("140698"), [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING, WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.STOPPING, WORKFLOW_STEP.REMOVED]);

/**
 * Metadata keys stored in operation stepsHistory entries.
 *
 * @enum {string}
 */
const OPERATION_METADATA_KEY = Object.freeze(stryMutAct_9fa48("140699") ? {} : (stryCov_9fa48("140699"), {
  SOURCE_REPLICA_ID: stryMutAct_9fa48("140700") ? "" : (stryCov_9fa48("140700"), 'sourceReplicaId'),
  READINESS_SNAPSHOT: stryMutAct_9fa48("140701") ? "" : (stryCov_9fa48("140701"), 'readinessSnapshot'),
  MEMBERSHIP_PUBLICATION_EPOCH: stryMutAct_9fa48("140702") ? "" : (stryCov_9fa48("140702"), 'membershipPublicationEpoch'),
  REPLICA_IDS: stryMutAct_9fa48("140703") ? "" : (stryCov_9fa48("140703"), 'replicaIds'),
  PEER_ADDRESSES: stryMutAct_9fa48("140704") ? "" : (stryCov_9fa48("140704"), 'peerAddresses'),
  BOOTSTRAP_TABLE_METADATA: stryMutAct_9fa48("140705") ? "" : (stryCov_9fa48("140705"), 'bootstrapTableMetadata'),
  BOOTSTRAP_PARTITION_METADATA: stryMutAct_9fa48("140706") ? "" : (stryCov_9fa48("140706"), 'bootstrapPartitionMetadata')
}));
function getOperationMetadataValue(stepsHistory, metadataKey) {
  if (stryMutAct_9fa48("140707")) {
    {}
  } else {
    stryCov_9fa48("140707");
    if (stryMutAct_9fa48("140710") ? (!Array.isArray(stepsHistory) || typeof metadataKey !== 'string') && metadataKey.length === 0 : stryMutAct_9fa48("140709") ? false : stryMutAct_9fa48("140708") ? true : (stryCov_9fa48("140708", "140709", "140710"), (stryMutAct_9fa48("140712") ? !Array.isArray(stepsHistory) && typeof metadataKey !== 'string' : stryMutAct_9fa48("140711") ? false : (stryCov_9fa48("140711", "140712"), (stryMutAct_9fa48("140713") ? Array.isArray(stepsHistory) : (stryCov_9fa48("140713"), !Array.isArray(stepsHistory))) || (stryMutAct_9fa48("140715") ? typeof metadataKey === 'string' : stryMutAct_9fa48("140714") ? false : (stryCov_9fa48("140714", "140715"), typeof metadataKey !== (stryMutAct_9fa48("140716") ? "" : (stryCov_9fa48("140716"), 'string')))))) || (stryMutAct_9fa48("140718") ? metadataKey.length !== 0 : stryMutAct_9fa48("140717") ? false : (stryCov_9fa48("140717", "140718"), metadataKey.length === 0)))) {
      if (stryMutAct_9fa48("140719")) {
        {}
      } else {
        stryCov_9fa48("140719");
        return null;
      }
    }
    for (const stepEntry of stepsHistory) {
      if (stryMutAct_9fa48("140720")) {
        {}
      } else {
        stryCov_9fa48("140720");
        if (stryMutAct_9fa48("140723") ? !stepEntry && typeof stepEntry !== 'object' : stryMutAct_9fa48("140722") ? false : stryMutAct_9fa48("140721") ? true : (stryCov_9fa48("140721", "140722", "140723"), (stryMutAct_9fa48("140724") ? stepEntry : (stryCov_9fa48("140724"), !stepEntry)) || (stryMutAct_9fa48("140726") ? typeof stepEntry === 'object' : stryMutAct_9fa48("140725") ? false : (stryCov_9fa48("140725", "140726"), typeof stepEntry !== (stryMutAct_9fa48("140727") ? "" : (stryCov_9fa48("140727"), 'object')))))) {
          if (stryMutAct_9fa48("140728")) {
            {}
          } else {
            stryCov_9fa48("140728");
            continue;
          }
        }
        const value = stepEntry[metadataKey];
        if (stryMutAct_9fa48("140731") ? value !== undefined || value !== null : stryMutAct_9fa48("140730") ? false : stryMutAct_9fa48("140729") ? true : (stryCov_9fa48("140729", "140730", "140731"), (stryMutAct_9fa48("140733") ? value === undefined : stryMutAct_9fa48("140732") ? true : (stryCov_9fa48("140732", "140733"), value !== undefined)) && (stryMutAct_9fa48("140735") ? value === null : stryMutAct_9fa48("140734") ? true : (stryCov_9fa48("140734", "140735"), value !== null)))) {
          if (stryMutAct_9fa48("140736")) {
            {}
          } else {
            stryCov_9fa48("140736");
            return value;
          }
        }
      }
    }
    return null;
  }
}
function getOperationMetadataString(stepsHistory, metadataKey) {
  if (stryMutAct_9fa48("140737")) {
    {}
  } else {
    stryCov_9fa48("140737");
    const value = getOperationMetadataValue(stepsHistory, metadataKey);
    return (stryMutAct_9fa48("140740") ? typeof value === 'string' || value.length > 0 : stryMutAct_9fa48("140739") ? false : stryMutAct_9fa48("140738") ? true : (stryCov_9fa48("140738", "140739", "140740"), (stryMutAct_9fa48("140742") ? typeof value !== 'string' : stryMutAct_9fa48("140741") ? true : (stryCov_9fa48("140741", "140742"), typeof value === (stryMutAct_9fa48("140743") ? "" : (stryCov_9fa48("140743"), 'string')))) && (stryMutAct_9fa48("140746") ? value.length <= 0 : stryMutAct_9fa48("140745") ? value.length >= 0 : stryMutAct_9fa48("140744") ? true : (stryCov_9fa48("140744", "140745", "140746"), value.length > 0)))) ? value : null;
  }
}
function getOperationMetadataStringArray(stepsHistory, metadataKey) {
  if (stryMutAct_9fa48("140747")) {
    {}
  } else {
    stryCov_9fa48("140747");
    const value = getOperationMetadataValue(stepsHistory, metadataKey);
    if (stryMutAct_9fa48("140750") ? false : stryMutAct_9fa48("140749") ? true : stryMutAct_9fa48("140748") ? Array.isArray(value) : (stryCov_9fa48("140748", "140749", "140750"), !Array.isArray(value))) {
      if (stryMutAct_9fa48("140751")) {
        {}
      } else {
        stryCov_9fa48("140751");
        return stryMutAct_9fa48("140752") ? ["Stryker was here"] : (stryCov_9fa48("140752"), []);
      }
    }
    const normalized = stryMutAct_9fa48("140753") ? ["Stryker was here"] : (stryCov_9fa48("140753"), []);
    const seen = new Set();
    for (const entry of value) {
      if (stryMutAct_9fa48("140754")) {
        {}
      } else {
        stryCov_9fa48("140754");
        if (stryMutAct_9fa48("140757") ? (typeof entry !== 'string' || entry.length === 0) && seen.has(entry) : stryMutAct_9fa48("140756") ? false : stryMutAct_9fa48("140755") ? true : (stryCov_9fa48("140755", "140756", "140757"), (stryMutAct_9fa48("140759") ? typeof entry !== 'string' && entry.length === 0 : stryMutAct_9fa48("140758") ? false : (stryCov_9fa48("140758", "140759"), (stryMutAct_9fa48("140761") ? typeof entry === 'string' : stryMutAct_9fa48("140760") ? false : (stryCov_9fa48("140760", "140761"), typeof entry !== (stryMutAct_9fa48("140762") ? "" : (stryCov_9fa48("140762"), 'string')))) || (stryMutAct_9fa48("140764") ? entry.length !== 0 : stryMutAct_9fa48("140763") ? false : (stryCov_9fa48("140763", "140764"), entry.length === 0)))) || seen.has(entry))) {
          if (stryMutAct_9fa48("140765")) {
            {}
          } else {
            stryCov_9fa48("140765");
            continue;
          }
        }
        seen.add(entry);
        normalized.push(entry);
      }
    }
    return normalized;
  }
}
function getOperationMetadataObject(stepsHistory, metadataKey) {
  if (stryMutAct_9fa48("140766")) {
    {}
  } else {
    stryCov_9fa48("140766");
    const value = getOperationMetadataValue(stepsHistory, metadataKey);
    if (stryMutAct_9fa48("140769") ? (!value || typeof value !== 'object') && Array.isArray(value) : stryMutAct_9fa48("140768") ? false : stryMutAct_9fa48("140767") ? true : (stryCov_9fa48("140767", "140768", "140769"), (stryMutAct_9fa48("140771") ? !value && typeof value !== 'object' : stryMutAct_9fa48("140770") ? false : (stryCov_9fa48("140770", "140771"), (stryMutAct_9fa48("140772") ? value : (stryCov_9fa48("140772"), !value)) || (stryMutAct_9fa48("140774") ? typeof value === 'object' : stryMutAct_9fa48("140773") ? false : (stryCov_9fa48("140773", "140774"), typeof value !== (stryMutAct_9fa48("140775") ? "" : (stryCov_9fa48("140775"), 'object')))))) || Array.isArray(value))) {
      if (stryMutAct_9fa48("140776")) {
        {}
      } else {
        stryCov_9fa48("140776");
        return null;
      }
    }
    return value;
  }
}

/**
 * Get the workflow steps for an operation type.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @return {string[]} Array of workflow steps in order.
 */
function getWorkflowSteps(operationType) {
  if (stryMutAct_9fa48("140777")) {
    {}
  } else {
    stryCov_9fa48("140777");
    if (stryMutAct_9fa48("140780") ? operationType !== OperationType.ADD : stryMutAct_9fa48("140779") ? false : stryMutAct_9fa48("140778") ? true : (stryCov_9fa48("140778", "140779", "140780"), operationType === OperationType.ADD)) {
      if (stryMutAct_9fa48("140781")) {
        {}
      } else {
        stryCov_9fa48("140781");
        return stryMutAct_9fa48("140782") ? [] : (stryCov_9fa48("140782"), [...ADD_WORKFLOW_STEPS]);
      }
    }
    if (stryMutAct_9fa48("140785") ? operationType !== OperationType.REMOVE : stryMutAct_9fa48("140784") ? false : stryMutAct_9fa48("140783") ? true : (stryCov_9fa48("140783", "140784", "140785"), operationType === OperationType.REMOVE)) {
      if (stryMutAct_9fa48("140786")) {
        {}
      } else {
        stryCov_9fa48("140786");
        return stryMutAct_9fa48("140787") ? [] : (stryCov_9fa48("140787"), [...REMOVE_WORKFLOW_STEPS]);
      }
    }
    if (stryMutAct_9fa48("140790") ? operationType !== OperationType.REPLACE : stryMutAct_9fa48("140789") ? false : stryMutAct_9fa48("140788") ? true : (stryCov_9fa48("140788", "140789", "140790"), operationType === OperationType.REPLACE)) {
      if (stryMutAct_9fa48("140791")) {
        {}
      } else {
        stryCov_9fa48("140791");
        return stryMutAct_9fa48("140792") ? [] : (stryCov_9fa48("140792"), [...REPLACE_WORKFLOW_STEPS]);
      }
    }
    return stryMutAct_9fa48("140793") ? ["Stryker was here"] : (stryCov_9fa48("140793"), []);
  }
}

/**
 * Check if a workflow step is valid for an operation type.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} step - The workflow step to validate.
 * @return {boolean} True if the step is valid for the operation type.
 */
function isValidWorkflowStep(operationType, step) {
  if (stryMutAct_9fa48("140794")) {
    {}
  } else {
    stryCov_9fa48("140794");
    const steps = getWorkflowSteps(operationType);
    return steps.includes(step);
  }
}

/**
 * Get the next workflow step for an operation.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} currentStep - The current workflow step.
 * @return {string|null} The next step, or null if at final step or invalid.
 */
function getNextWorkflowStep(operationType, currentStep) {
  if (stryMutAct_9fa48("140795")) {
    {}
  } else {
    stryCov_9fa48("140795");
    const steps = getWorkflowSteps(operationType);
    const currentIndex = steps.indexOf(currentStep);
    if (stryMutAct_9fa48("140798") ? currentIndex === -1 && currentIndex >= steps.length - 1 : stryMutAct_9fa48("140797") ? false : stryMutAct_9fa48("140796") ? true : (stryCov_9fa48("140796", "140797", "140798"), (stryMutAct_9fa48("140800") ? currentIndex !== -1 : stryMutAct_9fa48("140799") ? false : (stryCov_9fa48("140799", "140800"), currentIndex === (stryMutAct_9fa48("140801") ? +1 : (stryCov_9fa48("140801"), -1)))) || (stryMutAct_9fa48("140804") ? currentIndex < steps.length - 1 : stryMutAct_9fa48("140803") ? currentIndex > steps.length - 1 : stryMutAct_9fa48("140802") ? false : (stryCov_9fa48("140802", "140803", "140804"), currentIndex >= (stryMutAct_9fa48("140805") ? steps.length + 1 : (stryCov_9fa48("140805"), steps.length - 1)))))) {
      if (stryMutAct_9fa48("140806")) {
        {}
      } else {
        stryCov_9fa48("140806");
        return null;
      }
    }
    return steps[stryMutAct_9fa48("140807") ? currentIndex - 1 : (stryCov_9fa48("140807"), currentIndex + 1)];
  }
}

/**
 * Check if a workflow step is a terminal step (final step or FAILED).
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} step - The workflow step to check.
 * @return {boolean} True if the step is terminal.
 */
function isTerminalStep(operationType, step) {
  if (stryMutAct_9fa48("140808")) {
    {}
  } else {
    stryCov_9fa48("140808");
    if (stryMutAct_9fa48("140811") ? step !== WORKFLOW_STEP.FAILED : stryMutAct_9fa48("140810") ? false : stryMutAct_9fa48("140809") ? true : (stryCov_9fa48("140809", "140810", "140811"), step === WORKFLOW_STEP.FAILED)) {
      if (stryMutAct_9fa48("140812")) {
        {}
      } else {
        stryCov_9fa48("140812");
        return stryMutAct_9fa48("140813") ? false : (stryCov_9fa48("140813"), true);
      }
    }
    const steps = getWorkflowSteps(operationType);
    if (stryMutAct_9fa48("140816") ? steps.length !== 0 : stryMutAct_9fa48("140815") ? false : stryMutAct_9fa48("140814") ? true : (stryCov_9fa48("140814", "140815", "140816"), steps.length === 0)) {
      if (stryMutAct_9fa48("140817")) {
        {}
      } else {
        stryCov_9fa48("140817");
        return stryMutAct_9fa48("140818") ? true : (stryCov_9fa48("140818"), false);
      }
    }
    return stryMutAct_9fa48("140821") ? step !== steps[steps.length - 1] : stryMutAct_9fa48("140820") ? false : stryMutAct_9fa48("140819") ? true : (stryCov_9fa48("140819", "140820", "140821"), step === steps[stryMutAct_9fa48("140822") ? steps.length + 1 : (stryCov_9fa48("140822"), steps.length - 1)]);
  }
}

/**
 * @typedef {Object} Operation
 * @property {string} operationId - Unique operation identifier (UUID).
 * @property {string} type - Operation type: 'ADD' or 'REMOVE'.
 * @property {string} partitionId - Target partition identifier.
 * @property {string|null} replicaId - Replica being created/removed (null for
 *   new ADD operations until replica is created).
 * @property {string} sourceNodeId - Node that initiated the operation.
 * @property {string} targetNodeId - Node where replica is created/removed.
 * @property {string} status - Current ReplicaStatus value.
 * @property {string} workflowStep - Current workflow step.
 * @property {number} createdAt - Creation timestamp (ms since epoch).
 * @property {number} updatedAt - Last update timestamp (ms since epoch).
 * @property {number|null} completedAt - Completion timestamp (null if not
 *   complete).
 * @property {string|null} errorMessage - Error message if failed.
 * @property {Array<{step: string, timestamp: number}>} stepsHistory - History
 *   of workflow step transitions.
 */

/**
 * Create a new Operation object with required fields.
 *
 * @param {Object} params - Operation parameters.
 * @param {string} params.operationId - Unique operation identifier.
 * @param {string} params.type - Operation type: 'ADD' or 'REMOVE'.
 * @param {string} params.partitionId - Target partition identifier.
 * @param {string} params.sourceNodeId - Node that initiated the operation.
 * @param {string} params.targetNodeId - Node where replica is created/removed.
 * @param {string} [params.replicaId] - Replica identifier (optional for ADD).
 * @param {string} [params.sourceReplicaId] - Source replica ID for REPLACE
 *   operations.
 * @return {Operation} A new Operation object.
 */
function createOperation(params) {
  if (stryMutAct_9fa48("140823")) {
    {}
  } else {
    stryCov_9fa48("140823");
    const now = Date.now();
    const initialStep = WORKFLOW_STEP.PENDING;
    const initialHistory = stryMutAct_9fa48("140824") ? {} : (stryCov_9fa48("140824"), {
      step: initialStep,
      timestamp: now
    });
    if (stryMutAct_9fa48("140827") ? params.type === OperationType.REPLACE || params.sourceReplicaId : stryMutAct_9fa48("140826") ? false : stryMutAct_9fa48("140825") ? true : (stryCov_9fa48("140825", "140826", "140827"), (stryMutAct_9fa48("140829") ? params.type !== OperationType.REPLACE : stryMutAct_9fa48("140828") ? true : (stryCov_9fa48("140828", "140829"), params.type === OperationType.REPLACE)) && params.sourceReplicaId)) {
      if (stryMutAct_9fa48("140830")) {
        {}
      } else {
        stryCov_9fa48("140830");
        initialHistory[OPERATION_METADATA_KEY.SOURCE_REPLICA_ID] = params.sourceReplicaId;
      }
    }
    if (stryMutAct_9fa48("140833") ? Number.isInteger(params.membershipPublicationEpoch) || params.membershipPublicationEpoch >= 0 : stryMutAct_9fa48("140832") ? false : stryMutAct_9fa48("140831") ? true : (stryCov_9fa48("140831", "140832", "140833"), Number.isInteger(params.membershipPublicationEpoch) && (stryMutAct_9fa48("140836") ? params.membershipPublicationEpoch < 0 : stryMutAct_9fa48("140835") ? params.membershipPublicationEpoch > 0 : stryMutAct_9fa48("140834") ? true : (stryCov_9fa48("140834", "140835", "140836"), params.membershipPublicationEpoch >= 0)))) {
      if (stryMutAct_9fa48("140837")) {
        {}
      } else {
        stryCov_9fa48("140837");
        initialHistory[OPERATION_METADATA_KEY.MEMBERSHIP_PUBLICATION_EPOCH] = params.membershipPublicationEpoch;
      }
    }
    return stryMutAct_9fa48("140838") ? {} : (stryCov_9fa48("140838"), {
      operationId: params.operationId,
      type: params.type,
      partitionId: params.partitionId,
      replicaId: stryMutAct_9fa48("140841") ? params.replicaId && null : stryMutAct_9fa48("140840") ? false : stryMutAct_9fa48("140839") ? true : (stryCov_9fa48("140839", "140840", "140841"), params.replicaId || null),
      sourceNodeId: params.sourceNodeId,
      targetNodeId: params.targetNodeId,
      status: WORKFLOW_STEP_TO_STATUS[initialStep],
      workflowStep: initialStep,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      errorMessage: null,
      stepsHistory: stryMutAct_9fa48("140842") ? [] : (stryCov_9fa48("140842"), [initialHistory])
    });
  }
}

/**
 * Get all valid ReplicaStatus values.
 *
 * @return {string[]} Array of all valid status values.
 */
function getAllStatusValues() {
  if (stryMutAct_9fa48("140843")) {
    {}
  } else {
    stryCov_9fa48("140843");
    return Object.values(ReplicaStatus);
  }
}

/**
 * Check if a value is a valid ReplicaStatus.
 *
 * @param {string} value - The value to check.
 * @return {boolean} True if the value is a valid ReplicaStatus.
 */
function isValidStatus(value) {
  if (stryMutAct_9fa48("140844")) {
    {}
  } else {
    stryCov_9fa48("140844");
    return getAllStatusValues().includes(value);
  }
}

/**
 * Check whether an operation type belongs to the steady-state coordinator
 * domain. Bootstrap-owned MOVE_ASSIGNMENT rows must not be treated as
 * dispatchable or recoverable coordinator work.
 *
 * @param {string} value - Operation type to check.
 * @return {boolean} True when the type is coordinator-owned.
 */
function isCoordinatorOwnedOperationType(value) {
  if (stryMutAct_9fa48("140845")) {
    {}
  } else {
    stryCov_9fa48("140845");
    if (stryMutAct_9fa48("140848") ? typeof value === 'string' : stryMutAct_9fa48("140847") ? false : stryMutAct_9fa48("140846") ? true : (stryCov_9fa48("140846", "140847", "140848"), typeof value !== (stryMutAct_9fa48("140849") ? "" : (stryCov_9fa48("140849"), 'string')))) {
      if (stryMutAct_9fa48("140850")) {
        {}
      } else {
        stryCov_9fa48("140850");
        return stryMutAct_9fa48("140851") ? true : (stryCov_9fa48("140851"), false);
      }
    }
    return COORDINATOR_OWNED_OPERATION_TYPES.includes(stryMutAct_9fa48("140852") ? value.toLowerCase() : (stryCov_9fa48("140852"), value.toUpperCase()));
  }
}

/**
 * Return true when a REPLACE operation has already completed add-side spread
 * and is only dispatching source removal.
 *
 * ACTIVE is the initial source-removal dispatch. STOPPING is the replay /
 * reconciliation phase while source-removal completion is still being
 * observed.
 *
 * @param {Object} operation
 * @return {boolean}
 */
function isReplaceRemoveDispatchPhase(operation) {
  if (stryMutAct_9fa48("140853")) {
    {}
  } else {
    stryCov_9fa48("140853");
    const type = stryMutAct_9fa48("140854") ? String(operation?.type || operation?.operation_type || operation?.operationType || '').toLowerCase() : (stryCov_9fa48("140854"), String(stryMutAct_9fa48("140857") ? (operation?.type || operation?.operation_type || operation?.operationType) && '' : stryMutAct_9fa48("140856") ? false : stryMutAct_9fa48("140855") ? true : (stryCov_9fa48("140855", "140856", "140857"), (stryMutAct_9fa48("140859") ? (operation?.type || operation?.operation_type) && operation?.operationType : stryMutAct_9fa48("140858") ? false : (stryCov_9fa48("140858", "140859"), (stryMutAct_9fa48("140861") ? operation?.type && operation?.operation_type : stryMutAct_9fa48("140860") ? false : (stryCov_9fa48("140860", "140861"), (stryMutAct_9fa48("140862") ? operation.type : (stryCov_9fa48("140862"), operation?.type)) || (stryMutAct_9fa48("140863") ? operation.operation_type : (stryCov_9fa48("140863"), operation?.operation_type)))) || (stryMutAct_9fa48("140864") ? operation.operationType : (stryCov_9fa48("140864"), operation?.operationType)))) || (stryMutAct_9fa48("140865") ? "Stryker was here!" : (stryCov_9fa48("140865"), '')))).toUpperCase());
    if (stryMutAct_9fa48("140868") ? type === OperationType.REPLACE : stryMutAct_9fa48("140867") ? false : stryMutAct_9fa48("140866") ? true : (stryCov_9fa48("140866", "140867", "140868"), type !== OperationType.REPLACE)) {
      if (stryMutAct_9fa48("140869")) {
        {}
      } else {
        stryCov_9fa48("140869");
        return stryMutAct_9fa48("140870") ? true : (stryCov_9fa48("140870"), false);
      }
    }
    const workflowStep = stryMutAct_9fa48("140871") ? String(operation?.workflowStep ?? operation?.workflow_step ?? '').toLowerCase() : (stryCov_9fa48("140871"), String(stryMutAct_9fa48("140872") ? (operation?.workflowStep ?? operation?.workflow_step) && '' : (stryCov_9fa48("140872"), (stryMutAct_9fa48("140873") ? operation?.workflowStep && operation?.workflow_step : (stryCov_9fa48("140873"), (stryMutAct_9fa48("140874") ? operation.workflowStep : (stryCov_9fa48("140874"), operation?.workflowStep)) ?? (stryMutAct_9fa48("140875") ? operation.workflow_step : (stryCov_9fa48("140875"), operation?.workflow_step)))) ?? (stryMutAct_9fa48("140876") ? "Stryker was here!" : (stryCov_9fa48("140876"), '')))).toUpperCase());
    return stryMutAct_9fa48("140879") ? workflowStep === WORKFLOW_STEP.ACTIVE && workflowStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("140878") ? false : stryMutAct_9fa48("140877") ? true : (stryCov_9fa48("140877", "140878", "140879"), (stryMutAct_9fa48("140881") ? workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("140880") ? false : (stryCov_9fa48("140880", "140881"), workflowStep === WORKFLOW_STEP.ACTIVE)) || (stryMutAct_9fa48("140883") ? workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("140882") ? false : (stryCov_9fa48("140882", "140883"), workflowStep === WORKFLOW_STEP.STOPPING)));
  }
}
export { ReplicaStatus, TERMINAL_STATUSES, TERMINAL_STATUS_SQL_CLAUSE, ADJUST_DIRECTION, WORKFLOW_STEP_TO_STATUS, OperationType, OPERATION_METADATA_KEY, ADD_WORKFLOW_STEPS, REMOVE_WORKFLOW_STEPS, REPLACE_WORKFLOW_STEPS, getWorkflowSteps, isValidWorkflowStep, getNextWorkflowStep, isTerminalStep, createOperation, getAllStatusValues, isValidStatus, COORDINATOR_OWNED_OPERATION_TYPES, COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE, isCoordinatorOwnedOperationType, isReplaceRemoveDispatchPhase, getOperationMetadataValue, getOperationMetadataString, getOperationMetadataStringArray, getOperationMetadataObject };