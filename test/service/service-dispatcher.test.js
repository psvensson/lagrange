import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ServiceDispatcher} from '../../src/service/service-dispatcher.js';
import {
  InvalidServiceMessageError,
  ServicePolicyViolationError,
} from '../../src/service/service-lifecycle-errors.js';

function validEnvelope() {
  return {
    messageId: 'msg-1',
    serviceId: 'svc-1',
    serviceType: 'runtime_service',
    operation: 'query',
    payload: {sql: 'SELECT 1'},
    traceId: 'trace-1',
  };
}

async function authenticateAlways(_envelope, _context) {
  return {
    principalId: 'principal-test',
  };
}

async function authorizeAlways(_envelope, _context) {
  return undefined;
}

describe('ServiceDispatcher', () => {
  it('dispatches canonical envelope through leader resolver and message router', async () => {
    const delivered = [];
    const messageRouter = {
      deliver: async (targetAddress, message, options) => {
        delivered.push({targetAddress, message, options});
        return {acknowledged: true, messageId: 'router-msg-1'};
      },
    };

    const dispatcher = new ServiceDispatcher({
      messageRouter,
      leaderResolver: async (_envelope, _context) => ({
        targetAddress: 'node-a/service/svc-1',
        targetNodeId: 'node-a',
      }),
      authenticate: authenticateAlways,
      authorize: authorizeAlways,
    });

    const result = await dispatcher.dispatch(validEnvelope(), {
      principal: 'admin',
    });

    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].targetAddress, 'node-a/service/svc-1');
    assert.equal(delivered[0].options.targetNodeId, 'node-a');
    assert.equal(delivered[0].options.traceId, 'trace-1');
    assert.equal(result.delivery.acknowledged, true);
    const metrics = dispatcher.getMetrics();
    assert.equal(metrics.dispatchTotal, 1);
    assert.equal(metrics.dispatchSuccess, 1);
    assert.equal(metrics.dispatchFailure, 0);
  });

  it('fails closed on invalid non-canonical envelopes', async () => {
    const dispatcher = new ServiceDispatcher({
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
      },
      leaderResolver: async () => ({
        targetAddress: 'node-a/service/svc-1',
      }),
      authenticate: authenticateAlways,
      authorize: authorizeAlways,
    });

    await assert.rejects(
      () => dispatcher.dispatch({serviceId: 'svc-1', operation: 'query'}),
      (error) => {
        assert.ok(error instanceof InvalidServiceMessageError);
        return true;
      },
    );
  });

  it('runs authorization hook before delivery', async () => {
    const calls = [];
    const dispatcher = new ServiceDispatcher({
      messageRouter: {
        deliver: async (_targetAddress, _message, _options) => {
          calls.push('deliver');
          return {acknowledged: true};
        },
      },
      leaderResolver: async (_envelope, _context) => {
        calls.push('resolveLeader');
        return {targetAddress: 'node-a/service/svc-1'};
      },
      authorize: async (_envelope, _context) => {
        calls.push('authorize');
      },
      authenticate: async (_envelope, _context) => {
        calls.push('authenticate');
        return {principalId: 'principal-test'};
      },
    });

    await dispatcher.dispatch(validEnvelope());

    assert.deepEqual(calls, ['authenticate', 'authorize', 'resolveLeader', 'deliver']);
  });

  it('throws when leader resolver does not return targetAddress', async () => {
    const dispatcher = new ServiceDispatcher({
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
      },
      leaderResolver: async () => ({}),
      authenticate: authenticateAlways,
      authorize: authorizeAlways,
    });

    await assert.rejects(
      () => dispatcher.dispatch(validEnvelope()),
      /targetAddress/,
    );
  });

  it('throws when delivery is not acknowledged', async () => {
    const dispatcher = new ServiceDispatcher({
      messageRouter: {
        deliver: async () => ({acknowledged: false, error: 'no route'}),
      },
      leaderResolver: async () => ({targetAddress: 'node-a/service/svc-1'}),
      authenticate: authenticateAlways,
      authorize: authorizeAlways,
    });

    await assert.rejects(
      () => dispatcher.dispatch(validEnvelope()),
      /not acknowledged/,
    );
  });

  it('fails closed when authenticate rejects', async () => {
    const dispatcher = new ServiceDispatcher({
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
      },
      leaderResolver: async () => ({targetAddress: 'node-a/service/svc-1'}),
      authenticate: async () => {
        throw new Error('authn failed');
      },
      authorize: authorizeAlways,
    });

    await assert.rejects(
      () => dispatcher.dispatch(validEnvelope()),
      (error) => {
        assert.equal(error instanceof ServicePolicyViolationError, true);
        assert.equal(error.policyType, 'authn');
        return true;
      },
    );
    const metrics = dispatcher.getMetrics();
    assert.equal(metrics.dispatchTotal, 1);
    assert.equal(metrics.authnFailure, 1);
    assert.equal(metrics.dispatchFailure, 1);
  });

  it('fails closed when authorize rejects', async () => {
    const dispatcher = new ServiceDispatcher({
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
      },
      leaderResolver: async () => ({targetAddress: 'node-a/service/svc-1'}),
      authenticate: authenticateAlways,
      authorize: async () => {
        throw new Error('authz denied');
      },
    });

    await assert.rejects(
      () => dispatcher.dispatch(validEnvelope()),
      (error) => {
        assert.equal(error instanceof ServicePolicyViolationError, true);
        assert.equal(error.policyType, 'authz');
        return true;
      },
    );
    const metrics = dispatcher.getMetrics();
    assert.equal(metrics.dispatchTotal, 1);
    assert.equal(metrics.authzFailure, 1);
    assert.equal(metrics.dispatchFailure, 1);
  });

  it('requires shared authenticate/authorize hooks', async () => {
    assert.throws(
      () => new ServiceDispatcher({
        messageRouter: {
          deliver: async () => ({acknowledged: true}),
        },
        leaderResolver: async () => ({targetAddress: 'node-a/service/svc-1'}),
        authorize: authorizeAlways,
      }),
      /authenticate/,
    );

    assert.throws(
      () => new ServiceDispatcher({
        messageRouter: {
          deliver: async () => ({acknowledged: true}),
        },
        leaderResolver: async () => ({targetAddress: 'node-a/service/svc-1'}),
        authenticate: authenticateAlways,
      }),
      /authorize/,
    );
  });
});
