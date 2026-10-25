import {COLUMN, TABLES} from '../../constants/index.js';
import {NODE_STATE} from '../../constants/node-state.js';
import {requireIssuedBootIncarnation} from '../../bootstrap/boot-incarnation-contract.js';
import {classifyControlPlaneMutationResult} from '../control-plane-mutation-outcome-classifier.js';
import {
  buildSystemMetadataMutationError,
  SystemMetadataOwnerBase,
  unwrapRowReadResult,
} from './system-metadata-owner-base.js';

const LOCAL_STR_NODES_OWNER = 'nodes-owner';
const LOCAL_STR_READ = 'read';

const NODE_REMOVAL_ERROR_CODE = Object.freeze({
  NODE_ID_REQUIRED: 'NODE_REMOVE_ID_REQUIRED',
  INCARNATION_REQUIRED: 'NODE_REMOVE_INCARNATION_REQUIRED',
  TERMINAL_STATUS_REQUIRED: 'NODE_REMOVE_TERMINAL_STATUS_REQUIRED',
  OBSERVATION_CHANGED: 'NODE_REMOVE_OBSERVATION_CHANGED',
  OUTCOME_UNCONFIRMED: 'NODE_REMOVE_OUTCOME_UNCONFIRMED',
});
const REMOVABLE_NODE_STATUSES = new Set([NODE_STATE.STOPPED, NODE_STATE.FAILED]);
const NODE_REMOVAL_ERROR_MESSAGE = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId is required',
  TERMINAL_STATUS_REQUIRED: 'Removal requires the observed stopped or failed status',
  OBSERVATION_CHANGED: 'The observed node row changed or is absent; no row was removed',
  OUTCOME_UNCONFIRMED: 'The owner could not confirm removal of the observed node row',
});

function removalError(code, message, result = null) {
  const error = new Error(message);
  error.code = code;
  error.errorCode = code;
  if (result?.outcome) error.outcome = result.outcome;
  return error;
}

function terminalRemovalPredicate(nodeId, observation) {
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    throw removalError(NODE_REMOVAL_ERROR_CODE.NODE_ID_REQUIRED,
      NODE_REMOVAL_ERROR_MESSAGE.NODE_ID_REQUIRED);
  }
  const bootIncarnation = requireIssuedBootIncarnation(observation?.bootIncarnation,
    LOCAL_STR_NODES_OWNER, NODE_REMOVAL_ERROR_CODE.INCARNATION_REQUIRED);
  const status = observation?.status;
  if (!REMOVABLE_NODE_STATUSES.has(status)) {
    throw removalError(NODE_REMOVAL_ERROR_CODE.TERMINAL_STATUS_REQUIRED,
      NODE_REMOVAL_ERROR_MESSAGE.TERMINAL_STATUS_REQUIRED);
  }
  return Object.freeze({
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    [COLUMN.STATUS]: status,
  });
}

class NodesOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_NODES_OWNER;
  static TABLE_NAME = TABLES.NODES;

  async getNode(nodeId, options = {}) {
    const result = await this.readByPrimaryKeyObservation(nodeId, options);
    if (result?.success === false) {
      throw buildSystemMetadataMutationError(result, {
        tableName: this.getTableName(),
        ownerName: this.getOwnerName(),
        operation: LOCAL_STR_READ,
      });
    }
    return unwrapRowReadResult(result);
  }

  async getNodeFromCache(nodeId, options = {}) {
    return this.readCachedByPrimaryKey(nodeId, options);
  }

  async listNodes(options = {}) {
    return this.listRows(options);
  }

  async listNodesFromCache(options = {}) {
    return this.listCachedRows(options);
  }

  async insertNode(row, options = {}) {
    return this.insertRow(row, options);
  }

  async updateNode(nodeId, data, options = {}) {
    return this.updateByPrimaryKey(nodeId, data, options);
  }

  /** Remove only the exact terminal observation the caller intends to remove. */
  async removeTerminalNode(nodeId, observation, options = {}) {
    // Capture once: retrying the gateway write cannot select another row.
    const predicate = terminalRemovalPredicate(nodeId, observation);
    const result = await this.deleteWhere(predicate, options);
    const effect = classifyControlPlaneMutationResult(result);
    if (effect.applied && effect.affectedRowsPresent && effect.affectedRows === 1) {
      return Object.freeze({nodeId, bootIncarnation: predicate[COLUMN.BOOT_INCARNATION],
        status: predicate[COLUMN.STATUS],
        affectedRows: effect.affectedRows, mutationOutcome: result.outcome});
    }
    if (effect.zeroAffectedRows && effect.accepted && !effect.failed && !effect.deferred) {
      throw removalError(NODE_REMOVAL_ERROR_CODE.OBSERVATION_CHANGED,
        NODE_REMOVAL_ERROR_MESSAGE.OBSERVATION_CHANGED, result);
    }
    const error = removalError(NODE_REMOVAL_ERROR_CODE.OUTCOME_UNCONFIRMED,
      NODE_REMOVAL_ERROR_MESSAGE.OUTCOME_UNCONFIRMED, result);
    error.deferRetry = true;
    throw error;
  }
}

export {NODE_REMOVAL_ERROR_CODE, NodesOwner};
