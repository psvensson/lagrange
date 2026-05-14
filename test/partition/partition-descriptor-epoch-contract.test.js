import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_DESCRIPTOR_EPOCH_DECISION,
  PARTITION_DESCRIPTOR_EPOCH_REASON,
  PARTITION_DESCRIPTOR_EPOCH_STATE,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
} from '../../src/partition/partition-descriptor-epoch-contract.js';

const ACTIVE_VERSION = 2;
const PENDING_VERSION = 3;
const STALE_VERSION = 1;
const LEFT_PARTITION_ID = 'users-left';
const RIGHT_PARTITION_ID = 'users-right';

function createTargetDescriptor(partitionId, partitionVersion) {
  return {
    partition_id: partitionId,
    partition_version: partitionVersion,
  };
}

test('partition descriptor epoch contract accepts active descriptor truth',
  (t) => {
    const decision = buildPartitionDescriptorEpochDecision({
      tableDescriptor: {
        active_partition_version: ACTIVE_VERSION,
      },
      partitionDescriptor: {
        partition_version: ACTIVE_VERSION,
      },
      requirePartitionDescriptor: true,
    });

    t.equal(decision.decision, PARTITION_DESCRIPTOR_EPOCH_DECISION.ACCEPT);
    t.equal(decision.state, PARTITION_DESCRIPTOR_EPOCH_STATE.ACTIVE_MATCH);
    t.equal(
      decision.reason,
      PARTITION_DESCRIPTOR_EPOCH_REASON.ACTIVE_DESCRIPTOR_EPOCH_MATCH,
    );
    t.equal(decision.descriptorEpoch, ACTIVE_VERSION);
    t.end();
  });

test('partition descriptor epoch contract accepts pending split targets',
  (t) => {
    const decision = buildPartitionDescriptorEpochDecision({
      tableDescriptor: {
        active_partition_version: ACTIVE_VERSION,
        pending_partition_version: PENDING_VERSION,
      },
      splitMetadata: {
        [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
          PENDING_VERSION,
      },
      targetPartitionDescriptors: [
        createTargetDescriptor(LEFT_PARTITION_ID, PENDING_VERSION),
        createTargetDescriptor(RIGHT_PARTITION_ID, PENDING_VERSION),
      ],
      requireRouteTargetVersion: true,
      requireTargetDescriptors: true,
    });

    t.equal(decision.decision, PARTITION_DESCRIPTOR_EPOCH_DECISION.ACCEPT);
    t.equal(decision.state, PARTITION_DESCRIPTOR_EPOCH_STATE.PENDING_MATCH);
    t.equal(
      decision.reason,
      PARTITION_DESCRIPTOR_EPOCH_REASON.PENDING_DESCRIPTOR_EPOCH_MATCH,
    );
    t.equal(decision.descriptorEpoch, PENDING_VERSION);
    t.end();
  });

test('partition descriptor epoch contract rejects stale route targets',
  (t) => {
    const decision = buildPartitionDescriptorEpochDecision({
      tableDescriptor: {
        active_partition_version: ACTIVE_VERSION,
      },
      splitMetadata: {
        [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
          STALE_VERSION,
      },
      targetPartitionDescriptors: [
        createTargetDescriptor(LEFT_PARTITION_ID, STALE_VERSION),
        createTargetDescriptor(RIGHT_PARTITION_ID, STALE_VERSION),
      ],
      requireRouteTargetVersion: true,
      requireTargetDescriptors: true,
    });

    t.equal(decision.decision, PARTITION_DESCRIPTOR_EPOCH_DECISION.REJECT);
    t.equal(decision.state, PARTITION_DESCRIPTOR_EPOCH_STATE.STALE_ROUTE);
    t.equal(
      decision.reason,
      PARTITION_DESCRIPTOR_EPOCH_REASON.ROUTE_TARGET_VERSION_STALE,
    );
    t.end();
  });

test('partition descriptor epoch contract rejects stale partition rows',
  (t) => {
    const decision = buildPartitionDescriptorEpochDecision({
      tableDescriptor: {
        active_partition_version: ACTIVE_VERSION,
      },
      partitionDescriptor: {
        partition_version: STALE_VERSION,
      },
      requirePartitionDescriptor: true,
    });

    t.equal(decision.decision, PARTITION_DESCRIPTOR_EPOCH_DECISION.REJECT);
    t.equal(
      decision.reason,
      PARTITION_DESCRIPTOR_EPOCH_REASON.PARTITION_DESCRIPTOR_STALE,
    );
    t.end();
  });
