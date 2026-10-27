import {NodeService} from '../../node/node-service.js';
import {JOINING_ERROR_MSG} from '../node-joining-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  TABLES,
} from '../../constants/index.js';

class JoinMessageGroupRuntimeOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.delegates = options.delegates || {};
  }

  /**
   * A message-group replica is started on the node its active services row
   * names, or on a node no active row names; a replica another node owns is
   * never started here. No assignment authorizes taking one over: a
   * message-group identity is never moved to a joiner (its raft id derives
   * from its name; identity-reuse safety fix).
   * @param {string} replicaId - The replica about to start.
   */
  assertReplicaStartupOwnership(replicaId) {
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (!systemTableCache ||
        typeof systemTableCache.get !== 'function') {
      return;
    }

    const existingService =
      systemTableCache.get(TABLES.SERVICES, replicaId);
    if (!existingService) {
      return;
    }
    if (existingService[COLUMN.SERVICE_TYPE] !==
        SERVICE_TYPE.MESSAGE_GROUP) {
      return;
    }

    const existingNodeId =
      existingService[COLUMN.NODE_ID] || null;
    const existingStatus =
      String(existingService[COLUMN.STATUS] || STRING.UNKNOWN)
        .toLowerCase();
    if (!existingNodeId ||
        existingNodeId === this.nodeId ||
        existingStatus !== SERVICE_STATUS.ACTIVE) {
      return;
    }

    throw new Error(
      JOINING_ERROR_MSG.replicaOwnerConflict(
        replicaId,
        existingNodeId,
        this.nodeId,
      ),
    );
  }
}

export {JoinMessageGroupRuntimeOwner};
