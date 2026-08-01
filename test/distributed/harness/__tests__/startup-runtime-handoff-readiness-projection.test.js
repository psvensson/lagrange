import {test} from '../../../../src/test-helpers/tap.js';
import {CLUSTER_ACTIVE_WAIT_FORMATTING_LAYER} from
  '../cluster-active-wait-formatting-layer.js';

const {normalizeReadinessProbeResult} =
  CLUSTER_ACTIVE_WAIT_FORMATTING_LAYER;

function normalize(startupRuntimeHandoff) {
  return normalizeReadinessProbeResult({
    status: 503,
    body: {startupRuntimeHandoff},
  });
}

test('readiness normalization preserves an isolated runtime handoff witness',
  (t) => {
    const handoff = {
      infrastructureJoinComplete: true,
      canonicalAuthorityConsumed: true,
      transactionRecoveryReady: true,
      transactionRecoveryState: 'completed',
      transactionRecoveryOutcome: {
        kind: 'completed',
      },
    };

    const normalized = normalize(handoff);

    t.equal(normalized.status, 503, 'the readiness status remains unchanged');
    t.same(
      normalized.startupRuntimeHandoff,
      handoff,
      'the complete typed witness survives the generic readiness seam',
    );
    t.not(
      normalized.startupRuntimeHandoff,
      handoff,
      'the normalized witness does not alias the response object',
    );
    t.not(
      normalized.startupRuntimeHandoff.transactionRecoveryOutcome,
      handoff.transactionRecoveryOutcome,
      'nested witness state is also isolated',
    );

    handoff.transactionRecoveryReady = false;
    handoff.transactionRecoveryOutcome.kind = 'failed';
    t.equal(
      normalized.startupRuntimeHandoff.transactionRecoveryReady,
      true,
      'later response mutation cannot rewrite normalized readiness',
    );
    t.equal(
      normalized.startupRuntimeHandoff.transactionRecoveryOutcome.kind,
      'completed',
      'later nested mutation cannot rewrite normalized readiness',
    );
    t.end();
  });

test('readiness normalization rejects non-data runtime handoff evidence',
  (t) => {
    const inheritedBody = Object.create({
      startupRuntimeHandoff: {transactionRecoveryReady: true},
    });
    const inherited = normalizeReadinessProbeResult({
      status: 503,
      body: inheritedBody,
    });
    t.equal(
      inherited.startupRuntimeHandoff,
      null,
      'an inherited witness is not evidence',
    );

    let accessorReadCount = 0;
    const accessorBody = {};
    Object.defineProperty(accessorBody, 'startupRuntimeHandoff', {
      get() {
        accessorReadCount += 1;
        return {transactionRecoveryReady: true};
      },
    });
    const accessor = normalizeReadinessProbeResult({
      status: 503,
      body: accessorBody,
    });
    t.equal(
      accessor.startupRuntimeHandoff,
      null,
      'an accessor-backed witness is not evidence',
    );
    t.equal(accessorReadCount, 0, 'normalization never executes the accessor');
    t.end();
  });

test('readiness normalization rejects malformed runtime handoff evidence',
  (t) => {
    for (const value of [undefined, null, false, 1, 'ready', []]) {
      t.equal(
        normalize(value).startupRuntimeHandoff,
        null,
        'a non-record witness remains fail-closed',
      );
    }

    const circular = {};
    circular.self = circular;
    t.equal(
      normalize(circular).startupRuntimeHandoff,
      null,
      'an unserializable witness remains fail-closed',
    );
    t.end();
  });
