// The repository's owner-fact read of the replica operation ledger: the
// canonical readOwnerFact (control-plane-owner-fact-read.js) over the
// repository's one ledger read ingress, so the participation deferral and
// the coalescing key of executeReplicaOperationsRead apply to it unchanged.
// The table is the ledger's; the request is otherwise the caller's draft.
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {readOwnerFact} from '../control-plane/control-plane-owner-fact-read.js';

function assignReplicaOperationOwnerFactReadMethods(Repository) {
  Object.assign(Repository.prototype, {
    /**
     * Read an owner fact of the replica operation ledger.
     * @param {Object} draft - {sql, params, minimumIndex, minimumTerm,
     *   expectedReplica?, timeoutBudget?} (readOwnerFact's request without
     *   its table).
     * @return {Promise<Object>} The readOwnerFact answer.
     */
    readOwnerFact(draft) {
      return readOwnerFact(
        (_tableName, sql, params, readOptions) =>
          this.executeReplicaOperationsRead(sql, params, readOptions),
        {...draft, tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS});
    },
  });
}

export {assignReplicaOperationOwnerFactReadMethods};
