import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';

// Shadow-state-machine reintroduction guard
// (join-path-audit-finding-13-lifecycle-controller-shadow-state).
//
// The membership lifecycle controller was reduced to its live decision layer:
// the intent/drain delegates (submitJoinIntent, submitDrainIntent) stayed,
// while the unconsumed per-member state machine, the transition and intent
// histories, and the unreachable removal path were removed. Every removed
// symbol had zero production consumers when the reduction landed. This guard
// fails if any of them is reintroduced without a consumer: the presence of
// the symbol in the controller source is itself the failure, because the
// removal proved no live caller needs it.

const CONTROLLER_FILE = path.resolve(
  process.cwd(),
  'src/control-plane/membership-lifecycle-controller.js',
);

const REMOVED_SHADOW_SYMBOLS = Object.freeze([
  'getMemberLifecycleState',
  'snapshotMemberLifecycleStates',
  'applyMemberTransition',
  'advanceMemberForIntent',
  'submitRemovalIntent',
  'buildRemovalIntent',
  'memberLifecycleStates',
  'memberTransitionHistory',
  'intentHistory',
  'onRemovalIntent',
  'MEMBERSHIP_INTENT_TARGET_LIFECYCLE_STATE',
  'MEMBERSHIP_TRANSITION_OUTCOME',
]);

test('lifecycle controller keeps no shadow state machine surface', (t) => {
  const source = fs.readFileSync(CONTROLLER_FILE, 'utf8');
  const reintroduced = REMOVED_SHADOW_SYMBOLS.filter((symbol) =>
    source.includes(symbol),
  );
  t.same(
    reintroduced,
    [],
    'no removed shadow-machine symbol may reappear in the controller',
  );
  t.end();
});

test('lifecycle controller preserves the live intent/drain delegates', (t) => {
  const source = fs.readFileSync(CONTROLLER_FILE, 'utf8');
  for (const live of [
    'submitJoinIntent',
    'submitDrainIntent',
    'onJoinIntent',
    'onDrainIntent',
  ]) {
    t.ok(source.includes(live), `live delegate surface keeps ${live}`);
  }
  t.end();
});
