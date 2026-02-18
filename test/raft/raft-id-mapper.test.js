import {test} from '../../src/test-helpers/tap.js';
import {
  assertBijectiveRaftIdMaps,
  buildDeterministicRaftIdMaps,
} from '../../src/raft/raft-id-mapper.js';

test('buildDeterministicRaftIdMaps builds deterministic maps', async (t) => {
  const maps = buildDeterministicRaftIdMaps(['replica-b', 'replica-a']);

  t.equal(maps.externalToInternal.get('replica-b'), '1');
  t.equal(maps.externalToInternal.get('replica-a'), '2');
  t.equal(maps.internalToExternal.get('1'), 'replica-b');
  t.equal(maps.internalToExternal.get('2'), 'replica-a');
});

test('buildDeterministicRaftIdMaps rejects duplicate external IDs', async (t) => {
  t.throws(() => {
    buildDeterministicRaftIdMaps(['replica-1', 'replica-1']);
  });
});

test('assertBijectiveRaftIdMaps rejects non-bijective maps', async (t) => {
  const externalToInternal = new Map([
    ['replica-1', '1'],
    ['replica-2', '2'],
  ]);
  const internalToExternal = new Map([
    ['1', 'replica-1'],
  ]);

  t.throws(() => {
    assertBijectiveRaftIdMaps(externalToInternal, internalToExternal);
  });
});
