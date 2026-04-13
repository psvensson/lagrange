// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  UnknownRuntimeKindError,
} from '../../src/runtime/runtime-driver-errors.js';
import {
  UnknownServiceTypeError,
  InvalidServiceMessageError,
  ServicePolicyViolationError,
  assertKnownServiceType,
  UnknownRuntimeKindError as LifecycleUnknownRuntimeKindError,
} from '../../src/service/service-lifecycle-errors.js';

describe('service-lifecycle-errors', () => {
  it('assertKnownServiceType accepts known service types', () => {
    assert.equal(assertKnownServiceType('partition'), 'partition');
    assert.equal(assertKnownServiceType('message_group'), 'message_group');
    assert.equal(assertKnownServiceType('runtime_service'), 'runtime_service');
  });

  it('assertKnownServiceType throws UnknownServiceTypeError', () => {
    assert.throws(
      () => assertKnownServiceType('legacy_service_kind'),
      (err) => {
        assert.equal(err instanceof UnknownServiceTypeError, true);
        assert.equal(err.serviceType, 'legacy_service_kind');
        assert.equal(err.context.component, 'ServiceLifecycle');
        assert.ok(err.message.includes('legacy_service_kind'));
        assert.ok(err.message.includes('partition'));
        return true;
      },
    );
  });

  it('InvalidServiceMessageError carries typed context', () => {
    const err = new InvalidServiceMessageError('missing field');
    assert.equal(err.name, 'InvalidServiceMessageError');
    assert.equal(err.reason, 'missing field');
    assert.equal(err.context.component, 'ServiceMessageContract');
    assert.equal(err.context.operation, 'validateEnvelope');
  });

  it('re-exports UnknownRuntimeKindError as canonical runtime typed error', () => {
    const err = new LifecycleUnknownRuntimeKindError('unknown_runtime', []);
    assert.equal(err instanceof UnknownRuntimeKindError, true);
    assert.equal(err.kind, 'unknown_runtime');
  });

  it('ServicePolicyViolationError carries typed policy context', () => {
    const err = new ServicePolicyViolationError(
      'runtime',
      'create',
      'svc-policy',
      'runtime denied',
    );

    assert.equal(err.name, 'ServicePolicyViolationError');
    assert.equal(err.policyType, 'runtime');
    assert.equal(err.operation, 'create');
    assert.equal(err.serviceId, 'svc-policy');
    assert.equal(err.reason, 'runtime denied');
    assert.equal(err.context.component, 'ServicePolicy');
  });
});
