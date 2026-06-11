/**
 * CL-014 wiring guards (mutation-test-proven gap): signalReadyForReplicas
 * must run the CDC catch-up hydration after the subscription readiness gate
 * and before any further readiness gate, and the catch-up must never block
 * or fail readiness. A regression that silently unwires the catch-up would
 * reproduce the exact CONVERGED/STALLED startup race CL-014 closed.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningReadySignalReadiness,
} from '../../src/bootstrap/node-joining-ready-signal-readiness.js';

const STOP_SENTINEL = 'stop-before-heartbeat';

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
      'catch-up runs between the CDC gate and the next readiness gate',
      async (t) => {
        const calls = [];
        const target = createTarget({
          calls,
          cdcIntegrationService: {
            hydrateCdcPropagatedTablesFromAuthority: async () => {
              calls.push('catch-up');
              return {tablesHydrated: 1, rowsApplied: 3, tablesFailed: []};
            },
          },
        });

        await target.signalReadyForReplicas().catch((error) => {
          t.equal(error.message, STOP_SENTINEL, 'stopped at the sentinel');
        });

        t.same(
          calls,
          ['cdc-gate', 'catch-up', 'transport-gate'],
          'catch-up wired after the CDC gate, before further gates',
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
        t.ok(
          calls.some((entry) => entry.startsWith('warn:')),
          'skip surfaced as a warn',
        );
        t.ok(calls.includes('transport-gate'), 'readiness flow continued');
      },
    );
  });
