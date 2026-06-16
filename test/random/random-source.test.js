import t from 'tap';
import {
  RealRandomSource,
  SeededRandomSource,
  resolveRandomSource,
} from '../../src/random/random-source.js';

// DT5 seeded-randomness seam. RealRandomSource must be byte-for-byte Math.random
// (so threading it changes nothing); SeededRandomSource must be deterministic and
// well-distributed so a seed fully determines a run.

t.test('RealRandomSource returns values in [0, 1)', async (t) => {
  const rng = new RealRandomSource();
  for (let i = 0; i < 1000; i += 1) {
    const value = rng.random();
    t.ok(value >= 0 && value < 1, 'value in [0, 1)');
  }
});

t.test('SeededRandomSource is deterministic for a given seed', async (t) => {
  const a = new SeededRandomSource({seed: 12345});
  const b = new SeededRandomSource({seed: 12345});
  const seqA = Array.from({length: 20}, () => a.random());
  const seqB = Array.from({length: 20}, () => b.random());
  t.same(seqA, seqB, 'same seed -> identical stream');
});

t.test('different seeds produce different streams', async (t) => {
  const a = new SeededRandomSource({seed: 1});
  const b = new SeededRandomSource({seed: 2});
  const seqA = Array.from({length: 10}, () => a.random());
  const seqB = Array.from({length: 10}, () => b.random());
  t.notSame(seqA, seqB, 'distinct seeds diverge');
});

t.test('SeededRandomSource values are in [0, 1) and reasonably spread',
  async (t) => {
    const rng = new SeededRandomSource({seed: 99});
    const buckets = new Array(10).fill(0);
    const n = 10000;
    for (let i = 0; i < n; i += 1) {
      const value = rng.random();
      t.ok(value >= 0 && value < 1, 'in range');
      buckets[Math.floor(value * 10)] += 1;
    }
    // Every decile should get a non-trivial share (no gross bias / stuck stream).
    for (const count of buckets) {
      t.ok(count > n / 20, 'each decile is populated (well-distributed)');
    }
  });

t.test('SeededRandomSource defaults a bad seed to 0 deterministically',
  async (t) => {
    const a = new SeededRandomSource();
    const b = new SeededRandomSource({seed: 'nope'});
    const c = new SeededRandomSource({seed: 0});
    t.equal(a.random(), c.random(), 'no seed === seed 0');
    const b2 = new SeededRandomSource({seed: 'nope'});
    t.equal(b.random(), b2.random(), 'NaN seed is stable (-> 0)');
  });

t.test('resolveRandomSource returns the explicit source or a RealRandomSource',
  async (t) => {
    const seeded = new SeededRandomSource({seed: 5});
    t.equal(resolveRandomSource({randomSource: seeded}), seeded,
      'a valid randomSource is returned as-is');
    t.type(resolveRandomSource({}), RealRandomSource, 'no source -> Real default');
    t.type(resolveRandomSource(), RealRandomSource, 'no options -> Real default');
    t.type(resolveRandomSource({randomSource: {}}), RealRandomSource,
      'an invalid source (no random()) falls back to Real');
  });
