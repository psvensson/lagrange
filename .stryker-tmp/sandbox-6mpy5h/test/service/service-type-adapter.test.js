// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ServiceTypeAdapter} from '../../src/service/service-type-adapter.js';
import {
  ServiceTypeAdapterNotImplementedError,
  UnknownServiceTypeError,
} from '../../src/service/service-lifecycle-errors.js';

class PartitionAdapterStub extends ServiceTypeAdapter {
  constructor() {
    super('partition');
  }
}

describe('ServiceTypeAdapter contract', () => {
  it('cannot instantiate abstract class directly', () => {
    assert.throws(
      () => new ServiceTypeAdapter('partition'),
      (err) => err.message.includes('abstract'),
    );
  });

  it('rejects unknown service type', () => {
    assert.throws(
      () => {
        class UnknownAdapter extends ServiceTypeAdapter {
          constructor() {
            super('legacy_service_kind');
          }
        }
        return new UnknownAdapter();
      },
      (err) => {
        assert.equal(err instanceof UnknownServiceTypeError, true);
        return true;
      },
    );
  });

  it('stores serviceType as readonly property', () => {
    const adapter = new PartitionAdapterStub();
    assert.equal(adapter.serviceType, 'partition');
    assert.throws(() => {
      adapter.serviceType = 'runtime_service';
    });
  });

  it('throws typed error for unimplemented contract methods', async () => {
    const adapter = new PartitionAdapterStub();

    assert.throws(
      () => adapter.validateDefinition({}),
      (err) => {
        assert.equal(err instanceof ServiceTypeAdapterNotImplementedError, true);
        assert.equal(err.methodName, 'validateDefinition');
        return true;
      },
    );

    await assert.rejects(
      () => adapter.createReplica({}),
      (err) => {
        assert.equal(err instanceof ServiceTypeAdapterNotImplementedError, true);
        assert.equal(err.methodName, 'createReplica');
        return true;
      },
    );

    await assert.rejects(
      () => adapter.startReplica({}, {}),
      (err) => {
        assert.equal(err instanceof ServiceTypeAdapterNotImplementedError, true);
        assert.equal(err.methodName, 'startReplica');
        return true;
      },
    );

    await assert.rejects(
      () => adapter.stopReplica({}, {}),
      (err) => {
        assert.equal(err instanceof ServiceTypeAdapterNotImplementedError, true);
        assert.equal(err.methodName, 'stopReplica');
        return true;
      },
    );

    await assert.rejects(
      () => adapter.health({}, {}),
      (err) => {
        assert.equal(err instanceof ServiceTypeAdapterNotImplementedError, true);
        assert.equal(err.methodName, 'health');
        return true;
      },
    );
  });
});
