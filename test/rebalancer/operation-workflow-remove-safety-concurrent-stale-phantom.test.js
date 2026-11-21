// CL-043 bounds serialization by the durable step deadline. An expired
// nonterminal REPLACE still in the ledger must yield to peer recovery,
// while a genuinely in-flight competitor continues to hold the lane.
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  BELOW_VOTER_FLOOR_ERROR, CONCURRENT_OPERATION_ERROR, evaluateConcurrentRemoveSafety,
} from './operation-workflow-remove-safety-concurrency-fixture.js';

const PAST_CREATING_TIMEOUT_MS = 60 * 60_000;

test('CL-043: a durable CREATING competitor past its deadline yields the lane', async (t) => {
  const result = await evaluateConcurrentRemoveSafety(t, {
    step: WORKFLOW_STEP.CREATING, stepAgeMs: PAST_CREATING_TIMEOUT_MS,
  });
  t.equal(result.targetPinged, false, 'the expired competitor is excluded before target probing');
  t.match(result.error, BELOW_VOTER_FLOOR_ERROR,
    'the independent voter floor still protects the peer remove');
});

test('CL-043: a fresh CREATING competitor blocks the peer remove', async (t) => {
  const result = await evaluateConcurrentRemoveSafety(t, {step: WORKFLOW_STEP.CREATING});
  t.equal(result.targetPinged, true, 'the fresh competitor reaches the target probe');
  t.match(result.error, CONCURRENT_OPERATION_ERROR,
    'a competitor still within its step timeout holds the removal lane');
});
