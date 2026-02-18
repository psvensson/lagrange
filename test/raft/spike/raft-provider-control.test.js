import {test} from '../../../src/test-helpers/tap.js';
import {
  isRaftLogicSpikeEnabled,
  resolveRaftProvider,
} from '../../../src/raft/spike/raft-provider-control.js';
import {RAFT_PROVIDER_CONTROL} from '../../../src/raft/spike/raft-logic-spike-constants.js';

test('resolveRaftProvider defaults to liferaft when env var is missing', async (t) => {
  const provider = resolveRaftProvider({});
  t.equal(provider, RAFT_PROVIDER_CONTROL.LIFERAFT);
  t.equal(isRaftLogicSpikeEnabled({}), false);
});

test('resolveRaftProvider returns spike value when explicitly configured', async (t) => {
  const provider = resolveRaftProvider({
    [RAFT_PROVIDER_CONTROL.ENV_KEY]: RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE,
  });
  t.equal(provider, RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE);
  t.equal(
    isRaftLogicSpikeEnabled({
      [RAFT_PROVIDER_CONTROL.ENV_KEY]: RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE,
    }),
    true,
  );
});

test('resolveRaftProvider throws for unsupported values', async (t) => {
  t.throws(
    () => resolveRaftProvider({
      [RAFT_PROVIDER_CONTROL.ENV_KEY]: 'unknown-provider',
    }),
  );
});
