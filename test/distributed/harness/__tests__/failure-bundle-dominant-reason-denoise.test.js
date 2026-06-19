import {test} from '../../../../src/test-helpers/tap.js';
import {
  buildDominantReason,
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
} from '../failure-bundle-artifact-foundation.js';

// Census run2 rank5 (classifier de-noise): the load-generator WAIT reasons
// (nodeSlotUnavailable et al.) are pure harness constructs with zero src/ references
// and are never a real cluster blocker. With the floorless top-count pick a single
// transient nodeSlotUnavailable=1 over a HEALTHY cluster won dominantReason and RELABELLED
// CLASS-2 recovery-settle failures as a load/placement problem, sending investigation down
// dead paths and masking whether the core is closed. dominantReason must prefer a real
// (binding) reason over a load-wait artifact regardless of count, only falling back to the
// artifact when it is the sole reason (so a label is never lost).

test('rank5: a load-wait artifact never wins dominantReason over a real CLASS-2 reason', (t) => {
  t.equal(
    buildDominantReason({
      [LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE]: 5,
      convergence_timeout: 1,
    }),
    'convergence_timeout',
    'a real settle reason wins over a higher-count load-wait artifact ' +
    '(RED on revert: the floorless pick returned nodeSlotUnavailable)',
  );
  t.equal(
    buildDominantReason({
      [LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE]: 1,
      replica_operations_in_flight: 1,
    }),
    'replica_operations_in_flight',
    'a real reason wins even at equal count to the artifact',
  );
  t.end();
});

test('rank5: a sole load-wait artifact is still reported (no label is lost)', (t) => {
  t.equal(
    buildDominantReason({[LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE]: 3}),
    LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
    'when only a load-wait artifact is present it remains the dominant reason',
  );
  t.end();
});

test('rank5: among real reasons the top count still wins (unchanged behavior)', (t) => {
  t.equal(
    buildDominantReason({
      convergence_timeout: 2,
      replica_operations_in_flight: 5,
    }),
    'replica_operations_in_flight',
    'two binding reasons resolve by top count as before',
  );
  t.equal(buildDominantReason({}), null, 'empty reason counts -> null');
  t.end();
});
