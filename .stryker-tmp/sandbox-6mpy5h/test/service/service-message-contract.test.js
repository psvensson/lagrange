// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  assertServiceMessageEnvelope,
  validateServiceMessageEnvelope,
} from '../../src/service/service-message-contract.js';
import {
  InvalidServiceMessageError,
} from '../../src/service/service-lifecycle-errors.js';

describe('service-message-contract', () => {
  it('validates a canonical service message envelope', () => {
    const message = {
      messageId: 'm-1',
      serviceId: 'svc-1',
      operation: 'execute',
      payload: {k: 'v'},
    };

    const validation = validateServiceMessageEnvelope(message);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);

    const asserted = assertServiceMessageEnvelope(message);
    assert.equal(asserted, message);
  });

  it('returns validation errors for missing required fields', () => {
    const validation = validateServiceMessageEnvelope({serviceId: 'svc-1'});
    assert.equal(validation.valid, false);
    assert.equal(validation.errors.length > 0, true);
    assert.ok(validation.errors.join(' ').includes('messageId'));
  });

  it('throws InvalidServiceMessageError on assert failure', () => {
    assert.throws(
      () => assertServiceMessageEnvelope({messageId: 7}),
      (err) => {
        assert.equal(err instanceof InvalidServiceMessageError, true);
        assert.equal(err.context.component, 'ServiceMessageContract');
        assert.ok(err.message.includes('Invalid service message envelope'));
        return true;
      },
    );
  });
});
