/**
 * CL-014 wiring guards (mutation-test-proven gap): signalReadyForReplicas
 * must run the CDC catch-up hydration after the subscription readiness gate,
 * and the catch-up must never block or fail readiness. A regression that
 * silently unwires the catch-up would reproduce the exact CONVERGED/STALLED
 * startup race CL-014 closed.
 *
 * The catch-up runs FIRE-AND-FORGET (honoring CL-014's "readiness must never
 * block on catch-up" contract): it is 19 sequential distributed full-table
 * reads to the single authoritative seed, so awaiting it serialized ~28s/join
 * into the join critical path and blew the join timeout by the ~5th joiner
 * under N-node formation. Backgrounding keeps the heartbeat/READY advertisement
 * off that read path; the live stream + steady-state owner-RPC repair close any
 * residual window. Rolling-restart gate N=3 CONVERGED 3/3 (0 corrupt).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningReadySignalReadiness,
} from '../../src/bootstrap/node-joining-ready-signal-readiness.js';

const STOP_SENTINEL = 'stop-before-heartbeat';

// Flush pending microtasks (the backgrounded catch-up) so its observable
// effects are settled before assertions. setImmediate runs after the microtask
// queue drains.
function flushBackground() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createTarget({cdcIntegrationService, calls}) {
  const target = Object.create(NodeJoiningReadySignalReadiness.prototype);
  target.nodeId = 'joiner-1';
  target.logger = {
    info: () => {},
    warn: (message) => calls.push(`warn:${message}`),
    error: () => {},
    debug: () => {},
  };
  target.cdcIntegrationService = cdcIntegrationService;
  target.awaitCdcSubscriptionsForReadiness = async () => {
    calls.push('cdc-gate');
  };
  // Stop the flow right after the catch-up seam so the test never reaches
  // the heartbeat/NodeService machinery.
  target.awaitLocalQueryTransportReadinessForReadySignal = async () => {
    calls.push('transport-gate');
    throw new Error(STOP_SENTINEL);
  };
  return target;
}

test('CL-014 wiring: signalReadyForReplicas runs catch-up hydration',
  async (t) => {
    await t.test(
      'catch-up is fire-and-forget after the CDC gate, never blocking ' +
        'the readiness flow',
      async (t) => {
        const calls = [];
        let catchupStarted = false;
        const target = createTarget({
          calls,
          cdcIntegrationService: {
            // A catch-up that never settles must NOT stall readiness — proves
            // the call is genuinely backgrounded, not awaited.
            hydrateCdcPropagatedTablesFromAuthority: () => {
              catchupStarted = true;
              calls.push('catch-up');
              return new Promise(() => {});
            },
          },
        });

        await target.signalReadyForReplicas().catch((error) => {
          t.equal(
            error.message,
            STOP_SENTINEL,
            'readiness reached the next gate without awaiting the catch-up',
          );
        });
        await flushBackground();

        t.ok(catchupStarted, 'background catch-up was started');
        // Wired after the CDC gate; the next readiness gate is NOT blocked by
        // the (never-settling) catch-up.
        t.ok(
          calls.indexOf('cdc-gate') >= 0 &&
            calls.indexOf('transport-gate') > calls.indexOf('cdc-gate'),
          'catch-up scheduled after the CDC gate; transport gate still reached',
        );
        t.ok(
          calls.indexOf('catch-up') > calls.indexOf('transport-gate'),
          'catch-up did not run before the next gate (fire-and-forget)',
        );
      },
    );

    await t.test(
      'a throwing catch-up never blocks readiness progression',
      async (t) => {
        const calls = [];
        const target = createTarget({
          calls,
          cdcIntegrationService: {
            hydrateCdcPropagatedTablesFromAuthority: async () => {
              throw new Error('catch-up boom');
            },
          },
        });

        await target.signalReadyForReplicas().catch((error) => {
          t.equal(
            error.message,
            STOP_SENTINEL,
            'flow reached the next gate despite the catch-up failure',
          );
        });
        await flushBackground();
        t.ok(
          calls.some((entry) => entry.startsWith('warn:')),
          'failure surfaced as a warn',
        );
        t.ok(calls.includes('transport-gate'), 'readiness flow continued');
      },
    );

    await t.test(
      'a missing CDC integration service is skipped with a warn',
      async (t) => {
        const calls = [];
        const target = createTarget({calls, cdcIntegrationService: null});

        await target.signalReadyForReplicas().catch((error) => {
          t.equal(error.message, STOP_SENTINEL, 'flow continued');
        });
        await flushBackground();
        t.ok(
          calls.some((entry) => entry.startsWith('warn:')),
          'skip surfaced as a warn',
        );
        t.ok(calls.includes('transport-gate'), 'readiness flow continued');
      },
    );
  });
