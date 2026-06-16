import t from 'tap';
import {MessageRetryHandler} from '../../src/message-group/message-retry-handler.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

// DT5 seam proof: backoff/jitter sites draw from an injected RandomSource, so a seed
// determines scheduling. Red-on-revert: with a bare Math.random the two same-seed
// handlers below could not produce identical jittered-delay sequences.

function delays(handler, attempts) {
  return attempts.map((attempt) => handler.calculateDelay(attempt));
}

t.test('MessageRetryHandler jitter is seed-deterministic', async (t) => {
  const attempts = [1, 2, 3, 4, 5, 6, 7];
  const a = new MessageRetryHandler({
    randomSource: new SeededRandomSource({seed: 2024}),
    jitterFactor: 0.5,
  });
  const b = new MessageRetryHandler({
    randomSource: new SeededRandomSource({seed: 2024}),
    jitterFactor: 0.5,
  });
  t.same(delays(a, attempts), delays(b, attempts),
    'same seed -> identical jittered backoff sequence');

  const c = new MessageRetryHandler({
    randomSource: new SeededRandomSource({seed: 999}),
    jitterFactor: 0.5,
  });
  t.notSame(delays(a, [1, 2, 3, 4, 5]), delays(c, [1, 2, 3, 4, 5]),
    'a different seed yields a different sequence');
});

t.test('default MessageRetryHandler still applies bounded Math.random jitter',
  async (t) => {
    const handler = new MessageRetryHandler({jitterFactor: 0.25});
    for (const attempt of [1, 2, 3, 4, 5]) {
      const delay = handler.calculateDelay(attempt);
      t.ok(delay >= 0, 'delay is non-negative');
      t.ok(Number.isFinite(delay), 'delay is finite (default RandomSource intact)');
    }
  });
