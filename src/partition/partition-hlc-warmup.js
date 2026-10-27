// Partition HLC warm-up (extracted from partition-service-raft-init-base.js
// for the raft-snapshot-atomic-install quest, and extended for SN1 / F5).
// Restart recovery reloads committed state without re-applying entries, so a
// fresh HLC clock would not witness already-committed HLCs and could regress
// below a value this node previously committed. Warm the clock from the max
// HLC over the applied commands of the rs-raft durable store AND any
// compacted/installed snapshot HLC witness in `_raft_rs_snapshot`. Entries
// committed but not yet applied are applied (and merged into the clock) by
// the runtime after restart.
//
// Fail closed: a database without the rs-raft record has nothing to warm
// from (a no-op), but an undecodable applied command means the durable log
// is not trustworthy, and the codec's typed error propagates out of init.

import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {readPartitionCommittedCommands} from './partition-committed-log.js';

function maxHlcOf(current, candidate) {
  if (!candidate) return current;
  if (current === null || candidate.compare(current) > 0) return candidate;
  return current;
}

/**
 * Warm a partition HLC clock from the applied commands and compacted snapshot
 * witness of its rs-raft durable store. Throws the codec's typed error on an
 * undecodable entry.
 * @param {Object} options warm-up inputs
 * @param {Object} options.service the partition (its open db and id)
 * @param {Object} options.hlcClock partition HLC clock
 * @return {void}
 */
function warmHlcFromDurableWitnesses({service, hlcClock}) {
  let maxHlc = null;
  for (const entry of readPartitionCommittedCommands(service)) {
    maxHlc = maxHlcOf(
      maxHlc, HLCTimestamp.tryFromString(entry.command?.timestamp));
  }
  const compactedHlc = RaftRsDurableStore.readCompactedMaxHlcIn(
    service?.db, service?.partitionId);
  if (compactedHlc) {
    maxHlc = maxHlcOf(maxHlc, HLCTimestamp.tryFromString(compactedHlc));
  }
  if (maxHlc) hlcClock.update(maxHlc);
}

export {warmHlcFromDurableWitnesses};
