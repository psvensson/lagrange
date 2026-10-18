import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ServiceTypeAdapter} from '../../src/service/service-type-adapter.js';
import {PartitionServiceAdapter} from '../../src/service/adapters/partition-service-adapter.js';
import {MessageGroupServiceAdapter} from
  '../../src/service/adapters/message-group-service-adapter.js';
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

// Design RECOVERY-DESIGN-20261017 R2-F (N11): the inventory's local-half verb
// is on the base; adapters without retained bound creations answer typed.
describe('ServiceTypeAdapter inspectRetainedCreation (R2-F N11)', () => {
  it('answers typed UNSUPPORTED on the partition and message-group adapters', async () => {
    const hooks = {createReplica: async () => ({}), startReplica: async () => ({}),
      stopReplica: async () => ({})};
    for (const adapter of [new PartitionAdapterStub(), new PartitionServiceAdapter(hooks),
      new MessageGroupServiceAdapter(hooks)]) {
      assert.deepEqual(await adapter.inspectRetainedCreation({consensusCreation: {}}),
        {outcome: 'UNSUPPORTED'}, adapter.serviceType);
    }
  });
});
