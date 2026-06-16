import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

// DT5: the LifeRaft election timeout() draws its randomized delay from an injected
// RandomSource when provided, so election jitter is seed-deterministic (the
// min==max workaround the freeze scenario used is no longer needed). No
// randomSource -> base Math.random, unchanged.

function makeNode(extraOptions) {
  return new LifeRaft('seed', {
    'election min': '150 ms',
    'election max': '300 ms',
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
    ...extraOptions,
  });
}

t.test('timeout() is deterministic and within [min, max] under a seed', async (t) => {
  // Use a virtual clock so construction arms no native timer (clean exit).
  const node = makeNode({
    timeSource: new VirtualTimeSource(),
    randomSource: new SeededRandomSource({seed: 42}),
  });
  t.teardown(() => node.end());

  const samples = Array.from({length: 50}, () => node.timeout());
  for (const value of samples) {
    t.ok(value >= 150 && value <= 300, 'within the configured election window');
  }

  // A fresh node with the SAME seed reproduces the SAME election-timeout stream.
  const node2 = makeNode({
    timeSource: new VirtualTimeSource(),
    randomSource: new SeededRandomSource({seed: 42}),
  });
  t.teardown(() => node2.end());
  // node consumed 1 draw at construction (the re-arm) + 50 above; align node2 by
  // matching its own construction draw, then compare fresh streams head-to-head.
  const a = new SeededRandomSource({seed: 7});
  const b = new SeededRandomSource({seed: 7});
  const nodeA = makeNode({timeSource: new VirtualTimeSource(), randomSource: a});
  const nodeB = makeNode({timeSource: new VirtualTimeSource(), randomSource: b});
  t.teardown(() => nodeA.end());
  t.teardown(() => nodeB.end());
  const seqA = Array.from({length: 10}, () => nodeA.timeout());
  const seqB = Array.from({length: 10}, () => nodeB.timeout());
  t.same(seqA, seqB, 'same seed -> identical election-timeout stream');
});

t.test('without a randomSource, timeout() uses base Math.random (in range)',
  async (t) => {
    const node = makeNode({timeSource: new VirtualTimeSource()});
    t.teardown(() => node.end());
    t.notOk(node._electionRandomSource, 'no election RandomSource is attached');
    for (let i = 0; i < 50; i += 1) {
      const value = node.timeout();
      t.ok(value >= 150 && value <= 300, 'base timeout() still within window');
    }
  });
