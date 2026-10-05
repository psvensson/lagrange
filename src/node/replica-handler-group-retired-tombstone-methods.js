/**
 * ReplicaHandler methods of the member-owned `group retired` tombstone
 * (group-retired-tombstone-store.js; owner ruling 2026-10-05): written once
 * the replica's own lifecycle row reads retired with its group and before
 * its database is deleted; read to answer a group-retirement REMOVE after a
 * restart; released only once the workflow's record is seen cleared.
 */
import {ReplicaOperationField} from
  '../rebalancer/replica-operation-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {
  GROUP_RETIREMENT_REASON,
  readGroupRetirementRecord,
  verifyGroupRetirement,
} from '../partition/group-retirement-evidence.js';
import {
  deleteGroupRetiredTombstone,
  isTombstoneWorkflowCleared,
  listGroupRetiredTombstones,
  readGroupRetiredTombstone,
  tombstoneProvesRetirement,
  writeGroupRetiredTombstone,
} from './group-retired-tombstone-store.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const TABLE_ROW_WRITE_OPERATIONS = Object.freeze(new Set(['INSERT', 'UPDATE']));
const TOMBSTONE_LOG_MSG = Object.freeze({
  WRITTEN: 'Group-retired tombstone written before the replica database is ' +
    'deleted',
  RELEASED: 'Group-retired tombstone released: the workflow record no ' +
    'longer belongs to its workflow',
  ANSWERED: 'Group-retirement REMOVE answered from the member\'s durable ' +
    'retirement proof',
  WRITE_FAILED: 'Group-retired tombstone could not be written; the replica ' +
    'database is kept and its lifecycle row answers',
  SWEEP_FAILED: 'Group-retired tombstone sweep failed; the tombstones are ' +
    'kept and re-checked on the next record change',
});
const TOMBSTONE_ERROR_MSG = Object.freeze({
  DELETE_REFUSED: 'Replica database delete refused: the replica is ' +
    'group-retired and has no durable tombstone yet: ',
});

class ReplicaHandlerGroupRetiredTombstoneMethods {
  /**
   * After the replica's lifecycle was retired by a verified group-retirement
   * REMOVE: write the tombstone when (and only when) its own durable
   * lifecycle row reads retired with the group-retired reason. A failed
   * write throws: the database is then not deleted.
   * @param {Object} removal - {partitionId, replicaId, evidence}.
   * @return {boolean} Whether a tombstone was written.
   * @private
   */
  recordGroupRetiredTombstone({partitionId, replicaId, evidence}) {
    if (!evidence ||
        !this.isReplicaDurablyGroupRetired(partitionId, replicaId)) {
      return false;
    }
    const record = writeGroupRetiredTombstone(this.dataDir, {
      groupId: partitionId, replicaIdentity: replicaId, evidence,
      retiredAt: Date.now()});
    this.logger.info(TOMBSTONE_LOG_MSG.WRITTEN, {replicaId, partitionId,
      workflowId: record.workflowId, fenceToken: record.fenceToken,
      nodeId: this.nodeId});
    return true;
  }

  /**
   * The one guard every replica database delete passes: a replica whose
   * lifecycle row reads group-retired keeps its database until its tombstone
   * is durable (its row is then the only proof left).
   * @param {string} partitionId
   * @param {string} replicaId
   * @return {void} Throws when the delete must wait.
   * @private
   */
  assertGroupRetiredTombstoneBeforeDelete(partitionId, replicaId) {
    if (this.isReplicaDurablyGroupRetired(partitionId, replicaId) &&
        !readGroupRetiredTombstone(this.dataDir, partitionId, replicaId)) {
      throw new Error(TOMBSTONE_ERROR_MSG.DELETE_REFUSED +
        `${partitionId}/${replicaId}`);
    }
  }

  /**
   * Whether this member durably proves the retirement a group-retirement
   * REMOVE asks about: its replica's own lifecycle row (retired, reason
   * group-retired, exact group and identity) - then the tombstone is made
   * durable too once the REMOVE's evidence verifies against the record - or
   * its tombstone for the exact table, group, identity and workflow. Never
   * from absence.
   * @param {Object} request - REMOVE_REPLICA request.
   * @return {Promise<boolean>}
   * @private
   */
  async provesGroupRetirement(request) {
    const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
    const evidence = request?.[ReplicaOperationField.GROUP_RETIREMENT];
    if (this.isReplicaDurablyGroupRetired(partitionId, replicaId)) {
      await this.tombstoneVerifiedRetirement({partitionId, replicaId,
        evidence});
      return true;
    }
    const proved = tombstoneProvesRetirement(readGroupRetiredTombstone(
      this.dataDir, partitionId, replicaId), {partitionId, replicaId,
      evidence});
    if (proved) {
      this.logger.info(TOMBSTONE_LOG_MSG.ANSWERED, {replicaId, partitionId,
        workflowId: evidence?.workflowId, nodeId: this.nodeId,
        proof: GROUP_RETIREMENT_REASON});
    }
    return proved;
  }

  /**
   * A replica whose lifecycle row proves its group retirement but whose
   * tombstone was never written (a restart between the two): the asking
   * REMOVE's evidence, verified against the record, names the workflow.
   * @param {Object} removal - {partitionId, replicaId, evidence}.
   * @return {Promise<void>}
   * @private
   */
  async tombstoneVerifiedRetirement({partitionId, replicaId, evidence}) {
    if (readGroupRetiredTombstone(this.dataDir, partitionId, replicaId)) {
      return;
    }
    const decision = await verifyGroupRetirement(
      this.getControlPlaneSystemTableGateway(), evidence, partitionId);
    if (decision?.retire !== true) {
      return;
    }
    try {
      this.recordGroupRetiredTombstone({partitionId, replicaId, evidence});
    } catch (error) {
      // The lifecycle row still proves it (and the database stays until a
      // tombstone is durable): the answer does not depend on this write.
      this.logger.warn(TOMBSTONE_LOG_MSG.WRITE_FAILED, {replicaId,
        partitionId, nodeId: this.nodeId, error: error?.message});
    }
  }

  /**
   * Release every tombstone (of one table, or all) whose workflow the
   * authoritative read of its record shows finished. Unreadable or absent
   * records keep them.
   * @param {string|null} [tableId]
   * @return {Promise<number>} How many were released.
   * @private
   */
  async sweepGroupRetiredTombstones(tableId = null) {
    const tombstones = listGroupRetiredTombstones(this.dataDir)
      .filter((tombstone) => tableId === null || tombstone.tableId === tableId);
    const reads = new Map();
    let released = 0;
    for (const tombstone of tombstones) {
      if (!reads.has(tombstone.tableId)) {
        reads.set(tombstone.tableId, await readGroupRetirementRecord(
          this.getControlPlaneSystemTableGateway(), tombstone.tableId));
      }
      if (isTombstoneWorkflowCleared(tombstone, reads.get(tombstone.tableId))) {
        deleteGroupRetiredTombstone(this.dataDir, tombstone);
        released += 1;
        this.logger.info(TOMBSTONE_LOG_MSG.RELEASED, {
          replicaId: tombstone.replicaIdentity, partitionId: tombstone.groupId,
          workflowId: tombstone.workflowId, nodeId: this.nodeId});
      }
    }
    return released;
  }

  /**
   * Release tombstones on their table's record changes (and once now): a
   * `tables` row written for a table this node holds tombstones of re-runs
   * the sweep for it, one run at a time per table.
   * @return {void}
   * @private
   */
  watchGroupRetiredTombstones() {
    const sweep = (tableId) => {
      this.groupRetiredTombstoneSweeps ??= new Map();
      if (this.groupRetiredTombstoneSweeps.has(tableId)) {
        return;
      }
      const run = this.sweepGroupRetiredTombstones(tableId).catch((error) => {
        this.logger.warn(TOMBSTONE_LOG_MSG.SWEEP_FAILED, {tableId,
          nodeId: this.nodeId, error: error?.message});
      }).finally(() => this.groupRetiredTombstoneSweeps.delete(tableId));
      this.groupRetiredTombstoneSweeps.set(tableId, run);
    };
    this.systemTableCache?.onCacheChange?.((tableName, operation, row) => {
      const tableId = String(row?.table_id || '');
      if (tableName === SYSTEM_TABLE_NAME.TABLES &&
          TABLE_ROW_WRITE_OPERATIONS.has(operation) && tableId &&
          listGroupRetiredTombstones(this.dataDir).some((tombstone) =>
            tombstone.tableId === tableId)) {
        sweep(tableId);
      }
    });
    for (const tableId of new Set(listGroupRetiredTombstones(this.dataDir)
      .map((tombstone) => tombstone.tableId))) {
      sweep(tableId);
    }
  }
}

function assignReplicaHandlerGroupRetiredTombstoneMethods(ReplicaHandler) {
  for (const name of Object.getOwnPropertyNames(
    ReplicaHandlerGroupRetiredTombstoneMethods.prototype)) {
    if (name === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(ReplicaHandler.prototype, name,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerGroupRetiredTombstoneMethods.prototype, name));
  }
}

export {assignReplicaHandlerGroupRetiredTombstoneMethods};
