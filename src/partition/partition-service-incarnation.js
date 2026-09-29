let partitionServiceCreatedAtHighWater = 0;
const PARTITION_SERVICE_INCARNATION_EXHAUSTED =
  'Partition service incarnation space exhausted';

/**
 * Mint one process-lifetime-unique durable partition-service incarnation.
 *
 * Registration evidence is deliberately process-local: its WeakSet brand
 * cannot survive or cross a process boundary. While such evidence can still
 * exist, every partition SERVICES creator executes in this owner isolate and
 * shares this bounded high-water. The data-directory process guard excludes a
 * second process; after restart, old evidence has lost its brand. The durable
 * created_at value therefore cannot be reused while evidence for its former
 * incarnation remains admissible.
 * @param {number} requestedTimestamp Owner clock candidate.
 * @return {number} Monotonic durable incarnation value.
 */
function mintPartitionServiceCreatedAt(requestedTimestamp) {
  const requested = Number.isSafeInteger(requestedTimestamp) ?
    requestedTimestamp :
    Date.now();
  if (partitionServiceCreatedAtHighWater >= Number.MAX_SAFE_INTEGER) {
    throw new Error(PARTITION_SERVICE_INCARNATION_EXHAUSTED);
  }
  const createdAt = Math.max(
    requested,
    partitionServiceCreatedAtHighWater + 1,
  );
  partitionServiceCreatedAtHighWater = createdAt;
  return createdAt;
}

export {mintPartitionServiceCreatedAt};
