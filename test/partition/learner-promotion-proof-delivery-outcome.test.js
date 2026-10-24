// A learner promotion proof authorizes promotion only on the transport
// owner's DELIVERED state: a failed, contradictory, no-handler or deferred
// outcome that still carries a valid binding and proof is refused.
import {test} from '../../src/test-helpers/tap.js';
import {createPartitionServiceLearnerPromotionProofMethods} from
  '../../src/partition/partition-service-learner-promotion-proof-methods.js';
import {buildTransportDeliveryOutcome} from
  '../../src/transport/transport-semantic-outcome.js';

const BINDING = Object.freeze({partitionId: 'p1', learnerReplicaId: 'r1', proof: {}});
const LEARNER = Object.freeze({partitionId: 'p1', replicaId: 'r1'});

test('a learner promotion proof binds only on a delivered transport outcome', async (t) => {
  const {learnerPromotionProofResponseBindsThisLearner: binds} =
    createPartitionServiceLearnerPromotionProofMethods();
  const cases = [
    [{acknowledged: true, deliveryState: 'failed'}, false, 'a failed claim'],
    [{acknowledged: true, deliveryState: 'delivered', retryAfterMs: 5}, false,
      'a contradictory delivered claim with a retry hint'],
    [{acknowledged: true, noHandler: true}, false, 'a missing handler'],
    [{acknowledged: false, deferRetry: true}, false, 'a deferral'],
    [{acknowledged: true}, true, 'an ordinary delivered proof'],
  ];
  for (const [fields, expected, label] of cases) {
    const response = buildTransportDeliveryOutcome({...fields, ...BINDING});
    t.equal(binds.call(LEARNER, response), expected,
      `${label}: ${expected ? 'binds' : 'never binds'} this learner`);
  }
});
