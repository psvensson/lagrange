import {test} from '../../src/test-helpers/tap.js';
import {OWNER_OUTCOME_FRESHNESS} from '../../src/control-plane/owner-outcome-contract.js';
import {
  assertProjectionFresh,
  normalizeProjectionEpoch,
} from '../../src/control-plane/projection-freshness-guard.js';

test('assertProjectionFresh treats the unknown-epoch sentinel as unobserved',
  async (t) => {
    const result = assertProjectionFresh({observedEpoch: 0, unknownEpoch: 0});
    t.equal(result.revisionObserved, false);
    t.equal(result.projectionFresh, false);
  });

test('assertProjectionFresh accepts an observed epoch above the sentinel',
  async (t) => {
    const result = assertProjectionFresh({observedEpoch: 1, unknownEpoch: 0});
    t.equal(result.revisionObserved, true);
    t.equal(result.freshnessSatisfied, true);
    t.equal(result.epochFenceSatisfied, true);
    t.equal(result.projectionFresh, true);
  });

test('assertProjectionFresh normalizes numeric-string epochs',
  async (t) => {
    const result = assertProjectionFresh({observedEpoch: '7', unknownEpoch: 0});
    t.equal(result.observedEpoch, 7);
    t.equal(result.revisionObserved, true);
    t.equal(result.projectionFresh, true);
  });

test('assertProjectionFresh blocks when freshness is not FRESH',
  async (t) => {
    const result = assertProjectionFresh({
      observedEpoch: 5,
      freshness: OWNER_OUTCOME_FRESHNESS.STALE,
    });
    t.equal(result.freshnessSatisfied, false);
    t.equal(result.projectionFresh, false);
  });

test('assertProjectionFresh ignores freshness when it is omitted',
  async (t) => {
    const result = assertProjectionFresh({observedEpoch: 5});
    t.equal(result.freshnessSatisfied, true);
    t.equal(result.projectionFresh, true);
  });

test('assertProjectionFresh enforces the required epoch fence when supplied',
  async (t) => {
    const behind = assertProjectionFresh({observedEpoch: 4, requiredEpoch: 6});
    t.equal(behind.epochFenceSatisfied, false);
    t.equal(behind.projectionFresh, false);
    const caughtUp = assertProjectionFresh({observedEpoch: 6, requiredEpoch: 6});
    t.equal(caughtUp.epochFenceSatisfied, true);
    t.equal(caughtUp.projectionFresh, true);
  });

test('assertProjectionFresh skips the epoch fence when no required epoch is given',
  async (t) => {
    const result = assertProjectionFresh({observedEpoch: 2});
    t.equal(result.requiredEpoch, null);
    t.equal(result.epochFenceSatisfied, true);
  });

test('normalizeProjectionEpoch returns null for non-finite input',
  async (t) => {
    t.equal(normalizeProjectionEpoch(undefined), null);
    t.equal(normalizeProjectionEpoch('not-a-number'), null);
    t.equal(normalizeProjectionEpoch(9.8), 9);
  });
