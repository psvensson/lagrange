/**
 * CL-009 guard (part i): a saturated per-source outbound lane must
 * rate-limit its backpressure warns. One full-payload warn per rejected
 * enqueue converted containment into a log storm on the already-pressured
 * seed (5.9k warns in <80s against one stillborn replica in BOTH
 * stat-gate-20260610T192851Z runs — 67-69% of the seed's entire run log).
 *
 * Rejections themselves are unchanged: every over-limit enqueue is still
 * rejected with the backpressure error; only warn emission is bounded, and
 * each emitted warn reports how many occurrences were suppressed since the
 * previous one.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  OUTBOUND_SATURATION_WARN_INTERVAL_MS,
  OutboundDeliveryRegistryOwner,
  takeOutboundSaturationWarnSample,
} from '../../src/transport/message-router-shared-stage-3.js';

const TARGET_NODE_ID = 'node-b';
const SOURCE_ADDRESS = `${TARGET_NODE_ID}/partition/sql_transactions-p1-r5`;

function createRegistryWithStubRouter({maxPending = 2} = {}) {
  const warns = [];
  const router = {
    nodeId: 'node-a',
    outboundQueues: new Map(),
    outboundQueueMaxConcurrent: 1,
    outboundQueueMaxPending: maxPending,
    outboundQueueCriticalReserve: 0,
    outboundQueueReadinessReserve: 0,
    outboundQueueReadinessInflightReserve: 0,
    logger: {
      warn: (message, context) => warns.push({message, context}),
      info: () => {},
      debug: () => {},
      error: () => {},
    },
  };
  return {registry: new OutboundDeliveryRegistryOwner(router), warns};
}

test('CL-009: outbound saturation warn rate limit', async (t) => {
  await t.test('sampler bounds emission per interval and counts suppressed',
    async (t) => {
      const queue = {};
      const baseMs = 1_000_000;

      const first = takeOutboundSaturationWarnSample(queue, baseMs);
      t.ok(first, 'first occurrence emits');
      t.equal(first.suppressedSinceLastWarn, 0, 'nothing suppressed yet');

      let suppressed = 0;
      for (let i = 1; i < 50; i++) {
        const sample = takeOutboundSaturationWarnSample(queue, baseMs + i);
        if (sample === null) {
          suppressed += 1;
        }
      }
      t.equal(suppressed, 49, 'same-interval occurrences are suppressed');

      const next = takeOutboundSaturationWarnSample(
        queue,
        baseMs + OUTBOUND_SATURATION_WARN_INTERVAL_MS,
      );
      t.ok(next, 'next interval emits again');
      t.equal(
        next.suppressedSinceLastWarn,
        49,
        'emitted warn reports the suppressed count',
      );
      t.equal(
        takeOutboundSaturationWarnSample(
          queue,
          baseMs + OUTBOUND_SATURATION_WARN_INTERVAL_MS + 1,
        ),
        null,
        'counter resets after emission',
      );
    });

  await t.test(
    'enqueue storm: every attempt is rejected but warns stay bounded',
    async (t) => {
      const {registry, warns} = createRegistryWithStubRouter({maxPending: 2});
      const neverDeliver = () => new Promise(() => {});
      const stormSize = 200;
      let rejected = 0;

      const admitted = [];
      for (let i = 0; i < stormSize; i++) {
        const promise = registry
          .enqueue(TARGET_NODE_ID, neverDeliver, {
            targetAddress: SOURCE_ADDRESS,
            deliveryPriority: 'background',
          })
          .catch((error) => {
            rejected += 1;
            return error;
          });
        admitted.push(promise);
      }
      // Give the rejected promises a tick to settle; admitted ones hang on
      // the never-resolving deliver function by design.
      await new Promise((resolve) => setImmediate(resolve));

      t.ok(
        rejected >= stormSize - 10,
        `storm is contained (${rejected}/${stormSize} rejected)`,
      );
      t.ok(
        warns.length <= 2,
        `warn emission is bounded (${warns.length} warns for ${rejected} rejections)`,
      );
      t.ok(
        warns.length > 0,
        'saturation still surfaces at least one warn',
      );
      const lastWarn = warns[warns.length - 1];
      t.equal(
        typeof lastWarn.context.suppressedSinceLastWarn,
        'number',
        'warn payload carries the suppressed counter',
      );
    },
  );
});
