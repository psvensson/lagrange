const arrayMap = Function.call.bind(Array.prototype.map);

// The census publishes its holder identities on each blocked partition
// (owner decision 2026-10-04: readyReplicaCountByNodeId, the narrowed REPLACE
// grace's evidence). The replay expectations predate that field; the holder
// map is checked for consistency with the counts the fixtures already pin,
// and the rest of each entry is compared exactly as before.

export function assertReplayedBlockedPartitionsMatch(
  assert,
  actualPartitions,
  expectedPartitions,
) {
  const withoutHolders = arrayMap(actualPartitions, (partition) => {
    const holders = partition.readyReplicaCountByNodeId || {};
    const holderCounts = Object.values(holders);
    assert.equal(holderCounts.length, partition.readyDistinctNodeCount,
      `${partition.partitionId}: one holder per ready distinct node`);
    assert.equal(
      holderCounts.reduce((total, count) => total + count, 0),
      partition.readyReplicaCount,
      `${partition.partitionId}: holder counts sum to the ready replicas`,
    );
    const copy = {...partition};
    delete copy.readyReplicaCountByNodeId;
    return copy;
  });
  assert.deepEqual(withoutHolders, expectedPartitions);
}
