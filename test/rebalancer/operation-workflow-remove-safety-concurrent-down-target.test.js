// CL-044 reproduced head-of-line blocking when a replacement's unreachable
// target kept its retry loop active and its updatedAt fresh. The same live
// competitor still serializes removal when its target answers.
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  BELOW_VOTER_FLOOR_ERROR, CONCURRENT_OPERATION_ERROR, evaluateConcurrentRemoveSafety,
} from './operation-workflow-remove-safety-concurrency-fixture.js';

const PAST_SYNCING_TIMEOUT_MS = 10 * 60_000;
const FRESH_STEP_AGE_MS = 10_000;

test('CL-044: a fresh SYNCING competitor with a down target reaches the voter floor', async (t) => {
  const result = await evaluateConcurrentRemoveSafety(t, {
    step: WORKFLOW_STEP.SYNCING, targetContactable: false,
  });
  t.equal(result.targetPinged, true, 'arbitration checks the fresh competitor’s target');
  t.match(result.error, BELOW_VOTER_FLOOR_ERROR,
    'the independent voter floor is enforced after the down competitor is excluded');
});

test('CL-044: a fresh SYNCING competitor with a contactable target blocks removal', async (t) => {
  const result = await evaluateConcurrentRemoveSafety(t, {step: WORKFLOW_STEP.SYNCING});
  t.equal(result.targetPinged, true, 'arbitration checks the fresh competitor’s target');
  t.match(result.error, CONCURRENT_OPERATION_ERROR,
    'the contactable competitor holds the removal lane');
});

test('CL-044: durable time in step retires a wedged competitor despite a fresh update', async (t) => {
  const result = await evaluateConcurrentRemoveSafety(t, {
    step: WORKFLOW_STEP.SYNCING, stepAgeMs: PAST_SYNCING_TIMEOUT_MS, updateAgeMs: 0,
  });
  t.equal(result.targetPinged, false, 'an expired competitor is excluded before target probing');
  t.match(result.error, BELOW_VOTER_FLOOR_ERROR,
    'arbitration allows the remove to reach its independent voter-floor check');
});

test('CL-044: a recent durable step still serializes removal', async (t) => {
  const result = await evaluateConcurrentRemoveSafety(t, {
    step: WORKFLOW_STEP.SYNCING, stepAgeMs: FRESH_STEP_AGE_MS, updateAgeMs: 0,
  });
  t.equal(result.targetPinged, true, 'a fresh step reaches the target probe');
  t.match(result.error, CONCURRENT_OPERATION_ERROR,
    'a competitor still within its step timeout holds the removal lane');
});
