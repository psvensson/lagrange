// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {LeaderActivationGate} from '../../src/raft/leader-activation-gate.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('LeaderActivationGate dedupes repeated leader events for the same term', async (t) => {
  const gate = new LeaderActivationGate({holdoffMs: 20});
  let activations = 0;

  gate.schedule(7, () => {
    activations += 1;
  });
  gate.schedule(7, () => {
    activations += 1;
  });
  gate.schedule(7, () => {
    activations += 1;
  });

  await sleep(50);

  t.equal(activations, 1, 'same-term leader flaps should activate once');
  gate.shutdown();
});

test('LeaderActivationGate cancels pending activation on demotion', async (t) => {
  const gate = new LeaderActivationGate({holdoffMs: 20});
  let activations = 0;

  gate.schedule(8, () => {
    activations += 1;
  });
  gate.cancel({clearActivatedTerm: true});

  await sleep(50);

  t.equal(activations, 0, 'demotion should cancel pending leader activation');
  gate.shutdown();
});
