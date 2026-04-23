import {test} from '../../src/test-helpers/tap.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';

function createRepository(overrides = {}) {
  return new ReplicaOperationRepository({
    nodeId: 'node-1',
    systemTableCache: {},
    cdcIntegrationService: {},
    logger: console,
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    ...overrides,
  });
}

test('ReplicaOperationRepository treats authoritative absence as distinct from cache visibility',
  async (t) => {
    const repository = createRepository();
    repository.getObservedReplicaRowFromCache = () => ({
      lifecycle_status: 'ACTIVE',
    });

    const observation = await repository.getActualReplicaObservation(
      'replica-1',
      'partition-1',
      'node-2',
    );

    t.same(
      observation,
      {
        state: 'absent',
        source: 'authoritative',
      },
      'successful authoritative no-row reads should not fall back to stale cache',
    );
  });

test('ReplicaOperationRepository exposes cache fallback after authoritative failure explicitly',
  async (t) => {
    const repository = createRepository({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {
            success: false,
            rows: [],
          };
        },
    },
    });
    repository.getObservedReplicaRowFromCache = () => ({
      status: 'STOPPING',
    });

    const observation = await repository.getActualReplicaObservation(
      'replica-1',
      'partition-1',
      'node-2',
    );

    t.same(
      observation,
      {
        state: 'observed',
        source: 'cache_fallback_after_authoritative_failure',
        lifecycleStatus: 'stopping',
      },
      'cache fallback should remain explicit when authoritative reads fail',
    );
  });

test('ReplicaOperationRepository keeps authoritative failure without cache visibility unavailable',
  async (t) => {
    const repository = createRepository({
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          return {
            success: false,
            rows: [],
          };
        },
      },
    });
    repository.getObservedReplicaRowFromCache = () => null;

    const observation = await repository.getActualReplicaObservation(
      'replica-1',
      'partition-1',
      'node-2',
    );

    t.same(
      observation,
      {
        state: 'unavailable',
        source: 'unavailable',
      },
      'failed authoritative reads without cache visibility should stay unresolved',
    );
  });
