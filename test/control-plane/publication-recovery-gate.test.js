import {test} from '../../src/test-helpers/tap.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from '../../src/control-plane/publication-recovery-gate.js';

test('buildPublicationRecoveryGateSnapshot classifies acknowledgement lag explicitly',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: 7,
      publicationStatus: 'ACK_PENDING',
      recoveryProtocolState: 'publication_pending',
      requiredAckNodeIds: ['node-a', 'node-b'],
      acknowledgedNodeIds: ['node-a'],
      priorityRecoveryReasonCodes: ['publication_epoch_pending'],
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.pendingAckCount, 1);
    t.same(gate.pendingAckNodeIds, ['node-b']);
    t.same(gate.reasonCodes, ['publication_epoch_pending']);
    t.end();
  });

test('buildPublicationRecoveryGateSnapshot classifies priority spread once acknowledgements close',
  (t) => {
    const gate = buildPublicationRecoveryGateSnapshot({
      publicationEpoch: 7,
      publicationStatus: 'PUBLISHED',
      recoveryProtocolState: 'priority_spread_pending',
      requiredAckNodeIds: ['node-a', 'node-b'],
      acknowledgedNodeIds: ['node-a', 'node-b'],
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: ['replica_operations-p1'],
      },
    });

    t.equal(gate.state, PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_PENDING);
    t.equal(gate.ready, false);
    t.equal(gate.pendingAckCount, 0);
    t.equal(gate.prioritySpreadPending, true);
    t.same(gate.reasonCodes, ['priority_partitions_not_spread']);
    t.end();
  });
