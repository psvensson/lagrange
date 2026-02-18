import {test} from '../../src/test-helpers/tap.js';
import {
  getProcessRaftProvider,
  resetProcessRaftProviderForTests,
  resolveRaftProvider,
} from '../../src/raft/raft-provider-control.js';
import {
  RAFT_PROVIDER_CONTROL,
} from '../../src/raft/raft-provider-control-constants.js';

test('resolveRaftProvider defaults to liferaft', async (t) => {
  t.equal(resolveRaftProvider({}), RAFT_PROVIDER_CONTROL.LIFERAFT);
});

test('resolveRaftProvider accepts raft_logic and raft_logic_spike', async (t) => {
  const raftLogic = resolveRaftProvider({
    [RAFT_PROVIDER_CONTROL.ENV_KEY]: RAFT_PROVIDER_CONTROL.RAFT_LOGIC,
  });
  const raftLogicSpike = resolveRaftProvider({
    [RAFT_PROVIDER_CONTROL.ENV_KEY]: RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE,
  });

  t.equal(raftLogic, RAFT_PROVIDER_CONTROL.RAFT_LOGIC);
  t.equal(raftLogicSpike, RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE);
});

test('getProcessRaftProvider locks provider for process lifetime', async (t) => {
  resetProcessRaftProviderForTests();
  t.teardown(() => {
    resetProcessRaftProviderForTests();
  });

  const first = getProcessRaftProvider({
    [RAFT_PROVIDER_CONTROL.ENV_KEY]: RAFT_PROVIDER_CONTROL.LIFERAFT,
  });
  t.equal(first, RAFT_PROVIDER_CONTROL.LIFERAFT);

  t.throws(() => {
    getProcessRaftProvider({
      [RAFT_PROVIDER_CONTROL.ENV_KEY]: RAFT_PROVIDER_CONTROL.RAFT_LOGIC,
    });
  });
});
