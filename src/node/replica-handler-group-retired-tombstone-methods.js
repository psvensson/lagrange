/**
 * ReplicaHandler methods of the member-owned `group retired` tombstone
 * (group-retired-tombstone-store.js; owner ruling 2026-10-05): written from
 * the replica's own retired lifecycle row, bound to its incarnation, and
 * durable before its database is deleted; read to answer a group-retirement
 * REMOVE after a restart, never beside a live row or a row of another
 * incarnation; dropped when the same replica is created again; released
 * only once the workflow's record is seen cleared.
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
  isTombstoneOfRow,
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
  DROPPED: 'Group-retired tombstone dropped: it belongs to another ' +
    'incarnation of the replica',
});
const TOMBSTONE_ERROR_MSG = Object.freeze({
  DELETE_REFUSED: 'Replica database delete refused: the replica is ' +
    'group-retired and has no durable tombstone yet: ',
});

class ReplicaHandlerGroupRetiredTombstoneMethods {
  /**
   * One replica's durable lifecycle read with the lifecycle
   * administration's verdicts (lifecycleVerdictsOf).
   * @param {string} partitionId
   * @param {string} replicaId
   * @return {Object}
   * @private
   */
  durableLifecycleOf(partitionId, replicaId) {
    return this.lifecycleVerdictsOf(this.readReplicaDurableLifecycle(
      partitionId, replicaId));
  }

  /**
   * Whether the replica's own durable lifecycle row records it retired
   * with its whole group (reason group-retired), for exactly this identity
   * and group. Never from absence.
   * @param {string} partitionId
   * @param {string} replicaId
   * @return {boolean}
   * @private
   */
  isReplicaDurablyGroupRetired(partitionId, replicaId) {
    return this.durableLifecycleOf(partitionId, replicaId).groupRetired;
  }

  /**
   * After a verified group-retirement removal retired the replica's
   * lifecycle: write the tombstone from its own durable row (retired, with
   * its incarnation), naming the evidence the row recorded with a
   * group-retired retirement, else the removal's verified evidence (a row
   * retired earlier for another reason). A failed write throws: the database
   * is then not deleted.
   * @param {Object} removal - {partitionId, replicaId, evidence}.
   * @return {boolean} Whether a tombstone was written.
   * @private
   */
  recordGroupRetiredTombstone({partitionId, replicaId, evidence}) {
    const lifecycle = this.durableLifecycleOf(partitionId, replicaId);
    return this.writeTombstoneFromRow({partitionId, replicaId, lifecycle,
      evidence: lifecycle.retirementEvidence ?? evidence});
  }

  /**
   * The one tombstone writer: only from a lifecycle read of a retired row
   * that carries its incarnation (never a live, absent, unreadable or
   * unstamped row). A failed write throws.
   * @param {Object} fact - {partitionId, replicaId, lifecycle, evidence}.
   * @return {boolean} Whether a tombstone was written.
   * @private
   */
  writeTombstoneFromRow({partitionId, replicaId, lifecycle, evidence}) {
    if (!evidence || !lifecycle?.retired || !lifecycle.incarnation) {
      return false;
    }
    const record = writeGroupRetiredTombstone(this.dataDir, {
      groupId: partitionId, replicaIdentity: replicaId,
      incarnation: lifecycle.incarnation, lifecycleReason: lifecycle.reason,
      evidence, retiredAt: Date.now()});
    this.logger.info(TOMBSTONE_LOG_MSG.WRITTEN, {replicaId, partitionId,
      workflowId: record.workflowId, fenceToken: record.fenceToken,
      incarnation: record.incarnation, nodeId: this.nodeId});
    return true;
  }

  /**
   * The one guard every replica database delete passes. A tombstone of
   * another incarnation than the row being deleted is dropped first (it
   * would otherwise outlive the row that blocked it). A replica whose
   * lifecycle row reads group-retired keeps its database until its
   * tombstone is durable: when it is missing (a crash between the
   * retirement and the tombstone write), it is written now from the row's
   * own durable fact - its incarnation and the evidence its retirement
   * recorded - else the delete is refused (its row is then the only proof
   * left).
   * @param {string} partitionId
   * @param {string} replicaId
   * @return {void} Throws when the delete must wait.
   * @private
   */
  assertGroupRetiredTombstoneBeforeDelete(partitionId, replicaId) {
    const lifecycle = this.durableLifecycleOf(partitionId, replicaId);
    this.dropTombstoneOfAnotherIncarnation(partitionId, replicaId, lifecycle,
      {beforeBirth: false});
    if (!lifecycle.groupRetired || isTombstoneOfRow(readGroupRetiredTombstone(
      this.dataDir, partitionId, replicaId), lifecycle)) {
      return;
    }
    let written = false;
    try {
      written = this.writeTombstoneFromRow({partitionId, replicaId,
        lifecycle, evidence: lifecycle.retirementEvidence});
    } catch (error) {
      this.logger.warn(TOMBSTONE_LOG_MSG.WRITE_FAILED, {replicaId,
        partitionId, nodeId: this.nodeId, error: error?.message});
    }
    if (!written) {
      throw new Error(TOMBSTONE_ERROR_MSG.DELETE_REFUSED +
        `${partitionId}/${replicaId}`);
    }
  }

  /**
   * Before a replica of this (group, identity) is born (CREATE): drop any
   * tombstone that is not of the retired row this node still holds for it,
   * durably (unlink, fsync the directory), so the new incarnation never
   * meets an earlier one's proof - also after a restart. A failed drop
   * throws: the create does not proceed.
   * @param {string} partitionId
   * @param {string} replicaId
   * @return {boolean} Whether a tombstone was dropped.
   * @private
   */
  dropGroupRetiredTombstoneBeforeBirth(partitionId, replicaId) {
    if (!readGroupRetiredTombstone(this.dataDir, partitionId, replicaId)) {
      return false;
    }
    return this.dropTombstoneOfAnotherIncarnation(partitionId, replicaId,
      this.durableLifecycleOf(partitionId, replicaId), {beforeBirth: true});
  }

  /**
   * Drop the tombstone of (group, identity) unless it was written from the
   * retired row the lifecycle read found. Before a birth any other tombstone
   * goes; before a delete only one beside a row of another incarnation (an
   * absent or unreadable row keeps it).
   * @param {string} partitionId
   * @param {string} replicaId
   * @param {Object} lifecycle - The durable lifecycle read (verdicts).
   * @param {Object} options - {beforeBirth}.
   * @return {boolean} Whether a tombstone was dropped.
   * @private
   */
  dropTombstoneOfAnotherIncarnation(partitionId, replicaId, lifecycle,
    {beforeBirth}) {
    const tombstone = readGroupRetiredTombstone(this.dataDir, partitionId,
      replicaId);
    if (!tombstone || isTombstoneOfRow(tombstone, lifecycle) ||
        !(beforeBirth || lifecycle.holdsRow)) {
      return false;
    }
    deleteGroupRetiredTombstone(this.dataDir, tombstone);
    this.logger.info(TOMBSTONE_LOG_MSG.DROPPED, {replicaId, partitionId,
      workflowId: tombstone.workflowId, incarnation: tombstone.incarnation,
      rowIncarnation: lifecycle?.incarnation ?? null, nodeId: this.nodeId});
    return true;
  }

  /**
   * Whether this member durably proves the retirement a group-retirement
   * REMOVE asks about, never from absence: its replica's own lifecycle row
   * retired with the group-retired reason (its tombstone made durable too);
   * its tombstone, for the exact table, group, identity and workflow and
   * the incarnation it holds; or (owner decision 2026-10-05) its own row
   * retired for another reason - a reseed hold never acts for the group
   * again - once the REMOVE's evidence verifies against the record and its
   * tombstone is durable.
   * @param {Object} request - REMOVE_REPLICA request.
   * @return {Promise<boolean>}
   * @private
   */
  async provesGroupRetirement(request) {
    const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
    const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
    const evidence = request?.[ReplicaOperationField.GROUP_RETIREMENT];
    const lifecycle = this.durableLifecycleOf(partitionId, replicaId);
    if (lifecycle.groupRetired) {
      await this.tombstoneGroupRetiredRow({partitionId, replicaId, lifecycle,
        evidence});
      return true;
    }
    if (tombstoneProvesRetirement(readGroupRetiredTombstone(this.dataDir,
      partitionId, replicaId), {partitionId, replicaId, evidence},
    lifecycle)) {
      this.logger.info(TOMBSTONE_LOG_MSG.ANSWERED, {replicaId, partitionId,
        workflowId: evidence?.workflowId, nodeId: this.nodeId,
        proof: GROUP_RETIREMENT_REASON});
      return true;
    }
    return this.provesHeldMemberRetirement({partitionId, replicaId,
      lifecycle, evidence});
  }

  /**
   * A group-retired row whose tombstone is not durable yet (a restart
   * between the two): written from the row's own recorded evidence, or -
   * a row retired before evidence was recorded - from the asking REMOVE's,
   * verified against the record.
   * @param {Object} fact - {partitionId, replicaId, lifecycle, evidence}.
   * @return {Promise<void>}
   * @private
   */
  async tombstoneGroupRetiredRow({partitionId, replicaId, lifecycle,
    evidence}) {
    if (isTombstoneOfRow(readGroupRetiredTombstone(this.dataDir, partitionId,
      replicaId), lifecycle)) {
      return;
    }
    let rowEvidence = lifecycle.retirementEvidence;
    let row = lifecycle;
    if (!rowEvidence) {
      const decision = await verifyGroupRetirement(
        this.getControlPlaneSystemTableGateway(), evidence, partitionId);
      rowEvidence = decision?.retire === true ? evidence : null;
      // The row as it is AFTER the await, and only the same incarnation.
      row = this.sameRetiredRowAfterAwait(partitionId, replicaId, lifecycle);
    }
    try {
      this.writeTombstoneFromRow({partitionId, replicaId, lifecycle: row,
        evidence: rowEvidence});
    } catch (error) {
      // The lifecycle row still proves it (and the database stays until a
      // tombstone is durable): the answer does not depend on this write.
      this.logger.warn(TOMBSTONE_LOG_MSG.WRITE_FAILED, {replicaId,
        partitionId, nodeId: this.nodeId, error: error?.message});
    }
  }

  /**
   * The replica's durable lifecycle row read again after an await, when it
   * is still the SAME incarnation, retired; else null (deleted, reborn, or
   * live again: nothing may be written from the earlier read).
   * @param {string} partitionId
   * @param {string} replicaId
   * @param {Object} before - The lifecycle read before the await.
   * @return {Object|null}
   * @private
   */
  sameRetiredRowAfterAwait(partitionId, replicaId, before) {
    const after = this.durableLifecycleOf(partitionId, replicaId);
    return after.retired && Boolean(after.incarnation) &&
      after.incarnation === before.incarnation ? after : null;
  }

  /**
   * A frozen member whose own row is retired for another reason than its
   * group (a reseed hold): it answers a group-retirement REMOVE whose
   * evidence verifies against the record, once its tombstone - written from
   * that row and that evidence - is durable (nothing else writes one before
   * its database may go). Never for an unverified REMOVE.
   * @param {Object} fact - {partitionId, replicaId, lifecycle, evidence}.
   * @return {Promise<boolean>}
   * @private
   */
  async provesHeldMemberRetirement({partitionId, replicaId, lifecycle,
    evidence}) {
    if (!lifecycle.retired) {
      return false;
    }
    const decision = await verifyGroupRetirement(
      this.getControlPlaneSystemTableGateway(), evidence, partitionId);
    if (decision?.retire !== true) {
      return false;
    }
    // The tombstone is written from the row as it is AFTER the await: the
    // database may have been deleted and the identity reborn meanwhile.
    const row = this.sameRetiredRowAfterAwait(partitionId, replicaId,
      lifecycle);
    if (!row) {
      return false;
    }
    try {
      return this.writeTombstoneFromRow({partitionId, replicaId,
        lifecycle: row, evidence});
    } catch (error) {
      this.logger.warn(TOMBSTONE_LOG_MSG.WRITE_FAILED, {replicaId,
        partitionId, nodeId: this.nodeId, error: error?.message});
      return false;
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
