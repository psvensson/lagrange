import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';

// A global topology view is identical for every canonical rebalancer sharing
// one cache. Keying the one-entry generation memo by that cache collapses the
// co-resident owner census without extending staleness beyond the authoritative
// replica_operations mutation version. Callers with overridden classifiers use
// their own instance as the memo owner and retain the prior isolated behavior.
const GLOBAL_TOPOLOGY_BLOCKING_OPERATION_MEMO = new WeakMap();

function readGlobalTopologyBlockingInFlightOperations({
  cache,
  memoOwner,
  isIncluded,
}) {
  const version =
    cache && typeof cache.getTableMutationVersion === 'function' ?
      cache.getTableMutationVersion(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) :
      null;
  const memo = version !== null ?
    GLOBAL_TOPOLOGY_BLOCKING_OPERATION_MEMO.get(memoOwner) :
    null;
  if (memo?.version === version) {
    return memo.operations;
  }
  const operations = cache.filter(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    isIncluded,
  );
  if (version === null) {
    return operations;
  }
  const nextMemo = {
    version,
    operations: Object.freeze(operations),
  };
  GLOBAL_TOPOLOGY_BLOCKING_OPERATION_MEMO.set(memoOwner, nextMemo);
  return nextMemo.operations;
}

export {readGlobalTopologyBlockingInFlightOperations};
