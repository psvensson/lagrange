import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE, CONTROL_PLANE_READ_STRATEGY,
  ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';

// The read gateway and source generation are real. Only the observation
// storage port is deliberately unavailable or falsely reports success.
function registerGatewayObservationStorageWitnesses({t, withLeaderWitness,
  authoritativeObservedAtMs}) {
  t.test(
    'observation publication fails closed when storage support is unavailable',
    async (t) => {
      const sourceCache = new SystemTableCache();
      const cacheWithoutObservationStorage = {
        sourceOrder: sourceCache.sourceOrder,
        applySystemTableChange() {},
        getAll() {
          return [];
        },
      };
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'node-no-observation-storage',
        systemTableCache: cacheWithoutObservationStorage,
        cdcIntegrationService: {
          cacheMutationTarget: cacheWithoutObservationStorage,
          async executeAuthoritativeSystemTableRead() {
            return withLeaderWitness({success: true, rows: []});
          },
        },
      });
      const authoritativeRead = await gateway.executeRead(
        {
          tableName: TABLES.SERVICE_ENDPOINTS,
          sql: `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
          params: [],
          strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
        },
        {
          sessionId: 'no-observation-storage',
          authoritativeObservationScope:
            CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
        },
      );
      t.equal(authoritativeRead.success, true, 'the source read minted genuine complete evidence');
      t.ok(authoritativeRead.authoritativeObservation, 'the intended storage boundary is reached');
      const result = await gateway.reconcileAuthoritativeCacheRows(
        TABLES.SERVICE_ENDPOINTS,
        authoritativeRead.rows,
        {
          cacheMutationTarget: cacheWithoutObservationStorage,
          systemTableCache: cacheWithoutObservationStorage,
          cachedRows: [],
          authoritativeObservation:
            authoritativeRead.authoritativeObservation,
        },
      );

      t.equal(result.success, false, 'requested evidence cannot silently no-op');
      t.equal(
        result.error,
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.STORAGE_UNAVAILABLE,
        'the result identifies missing observation storage',
      );
    },
  );

  t.test(
    'a finite recorder return cannot replace getter-visible storage evidence',
    async (t) => {
      const sourceCache = new SystemTableCache();
      const noOpObservationStorage = {
        sourceOrder: sourceCache.sourceOrder,
        applySystemTableChange() {},
        getAll() {
          return [];
        },
        recordAuthoritativeObservation(_tableName, options) {
          return Number(options.observedAtMs);
        },
        getLastAuthoritativeObservedAtMs() {
          return null;
        },
        getLastAuthoritativeObservedCauseId() {
          return null;
        },
      };
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'node-no-op-observation-storage',
        systemTableCache: noOpObservationStorage,
        now: () => authoritativeObservedAtMs,
        cdcIntegrationService: {
          cacheMutationTarget: noOpObservationStorage,
          async executeAuthoritativeSystemTableRead() {
            return withLeaderWitness({success: true, rows: []});
          },
        },
      });
      const authoritativeRead = await gateway.executeRead(
        {
          tableName: TABLES.SERVICE_ENDPOINTS,
          sql: `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
          params: [],
          strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
        },
        {
          sessionId: 'no-op-observation-storage',
          authoritativeObservationScope:
            CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
        },
      );
      t.equal(authoritativeRead.success, true, 'the source read minted genuine complete evidence');
      t.ok(authoritativeRead.authoritativeObservation, 'the intended storage boundary is reached');
      const result = await gateway.reconcileAuthoritativeCacheRows(
        TABLES.SERVICE_ENDPOINTS,
        authoritativeRead.rows,
        {
          cacheMutationTarget: noOpObservationStorage,
          systemTableCache: noOpObservationStorage,
          cachedRows: [],
          authoritativeObservation:
            authoritativeRead.authoritativeObservation,
        },
      );

      t.equal(result.success, false, 'finite no-op recorder fails closed');
      t.equal(
        result.error,
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.STORAGE_UNAVAILABLE,
        'publication requires getter-visible observation evidence',
      );
      t.equal(
        result.authoritativeObservedAtMs,
        null,
        'unverified storage cannot return a published observation time',
      );
    },
  );
}

export {registerGatewayObservationStorageWitnesses};
