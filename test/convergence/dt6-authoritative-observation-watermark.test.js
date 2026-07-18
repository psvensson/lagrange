import t from 'tap';
import {AdminPreflightSnapshot} from
  '../../src/admin/admin-preflight-snapshot.js';
import {AdminServiceDiscovery} from
  '../../src/admin/admin-service-discovery.js';
import {ReadOnlySystemTableCache} from
  '../../src/cache/read-only-system-table-cache.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_READ_STRATEGY,
  ControlPlaneSystemTableGateway,
} from
  '../../src/control-plane/control-plane-system-table-gateway.js';

// Quest movielens-authoritative-observation-watermark — deterministic
// reproduction of the Wave-4 schema-admission failure. A successful complete
// authoritative read is evidence about cache freshness even when it causes no
// row mutation. The mutation watermark must remain historically accurate while
// a distinct observation watermark lets preflight consume that new evidence.

const OLD_MUTATION_AT_MS = 1_000;
const AUTHORITATIVE_OBSERVED_AT_MS = 61_000;
const NEWER_MUTATION_AT_MS = 65_000;
const PREFLIGHT_CAPTURED_AT_MS = AUTHORITATIVE_OBSERVED_AT_MS + 10;
const REPAIR_CAUSE_ID = 'authoritative-repair:wave4-schema-admission';

function createFixture(options = {}) {
  const writableCache = new SystemTableCache();
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-seed',
    systemTableCache: writableCache,
    now: () => AUTHORITATIVE_OBSERVED_AT_MS,
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return options.authoritativeResult || {
          success: true,
          rows: options.authoritativeRows || [],
        };
      },
    },
  });
  const readableCache = new ReadOnlySystemTableCache(writableCache);
  const preflight = new AdminPreflightSnapshot({
    nodeId: 'node-seed',
    systemTableCache: readableCache,
  });
  const discovery = new AdminServiceDiscovery({
    nodeId: 'node-seed',
    systemTableCache: readableCache,
    cacheMutationTarget: writableCache,
    controlPlaneSystemTableGateway: gateway,
    nowFn: () => AUTHORITATIVE_OBSERVED_AT_MS,
  });
  return {discovery, gateway, preflight, readableCache, writableCache};
}

async function reconcileFreshEvidence(fixture) {
  const authoritativeRead =
    await fixture.discovery.readAuthoritativeSystemTableRows(
      TABLES.SERVICE_ENDPOINTS,
      {
        nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
        reason: 'control_snapshot',
      },
    );
  return fixture.discovery.applyAuthoritativeSystemTableRows(
    TABLES.SERVICE_ENDPOINTS,
    authoritativeRead.rows,
    REPAIR_CAUSE_ID,
    {authoritativeObservation: authoritativeRead.authoritativeObservation},
  );
}

function buildCompleteObservationContract(causeId = REPAIR_CAUSE_ID) {
  return {
    scope: CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
    tableName: TABLES.SERVICE_ENDPOINTS,
    observedAtMs: AUTHORITATIVE_OBSERVED_AT_MS,
    causeId,
    rowSetComplete: true,
  };
}

t.test(
  'unchanged authoritative rows publish observation evidence without ' +
    'rewriting the mutation watermark',
  async (t) => {
    const row = {
      endpoint_id: 'endpoint-1',
      service_id: 'service-1',
      node_id: 'node-seed',
      protocol: 'http',
      address: '127.0.0.1',
      port: 8080,
      health_status: 'healthy',
      metadata: '{}',
      created_at: OLD_MUTATION_AT_MS,
      updated_at: OLD_MUTATION_AT_MS,
    };
    const fixture = createFixture({authoritativeRows: [row]});
    fixture.writableCache.applySystemTableChange(
      TABLES.SERVICE_ENDPOINTS,
      CDC_OPERATION.UPSERT,
      row,
      {causeId: 'cdc:original-mutation'},
    );
    fixture.writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      OLD_MUTATION_AT_MS,
    );

    const mutationCount = await reconcileFreshEvidence(fixture);
    const freshness = fixture.preflight.buildPreflightCacheFreshnessSummary({
      capturedAtMs: PREFLIGHT_CAPTURED_AT_MS,
    });

    t.equal(mutationCount, 0, 'the equal row remains a reconcile no-op');
    t.equal(
      fixture.readableCache.getLastAppliedAtMs(TABLES.SERVICE_ENDPOINTS),
      OLD_MUTATION_AT_MS,
      'authoritative observation does not fabricate a CDC mutation time',
    );
    t.equal(
      fixture.readableCache.getLastAppliedCauseId(TABLES.SERVICE_ENDPOINTS),
      'cdc:original-mutation',
      'authoritative observation does not replace the mutation cause',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'the successful reconcile publishes a separate observation watermark',
    );
    t.equal(
      freshness.freshnessObservedAtMs,
      AUTHORITATIVE_OBSERVED_AT_MS,
      'preflight consumes the newer authoritative observation',
    );
    t.equal(freshness.stalenessMs, 10, 'freshness age is observation age');
    t.equal(
      freshness.freshnessSource,
      'authoritative_observation',
      'diagnostics name the evidence source explicitly',
    );
  },
);

t.test(
  'confirmed-empty authoritative rows refresh observation evidence without ' +
    'inventing a row mutation',
  async (t) => {
    const fixture = createFixture();

    const mutationCount = await reconcileFreshEvidence(fixture);
    const freshness = fixture.preflight.buildPreflightCacheFreshnessSummary({
      capturedAtMs: PREFLIGHT_CAPTURED_AT_MS,
    });

    t.equal(mutationCount, 0, 'empty authoritative truth mutates no row');
    t.equal(
      fixture.readableCache.getLastAppliedAtMs(TABLES.SERVICE_ENDPOINTS),
      null,
      'an empty observation does not invent a mutation watermark',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'confirmed-empty truth still publishes observation evidence',
    );
    t.equal(freshness.stalenessMs, 10, 'empty-table freshness can converge');
    t.equal(
      freshness.freshnessSource,
      'authoritative_observation',
      'the empty-table freshness source remains explicit',
    );
  },
);

t.test(
  'a scoped reconcile is rejected even when it asks to publish a complete ' +
    'observation',
  async (t) => {
    const fixture = createFixture();

    const scopedResult = await fixture.gateway.reconcileAuthoritativeCacheRows(
      TABLES.SERVICE_ENDPOINTS,
      [],
      {
        cacheMutationTarget: fixture.writableCache,
        systemTableCache: fixture.writableCache,
        cachedRows: [],
        cachedRowFilter: () => true,
        authoritativeObservation: buildCompleteObservationContract(
          'scoped-read-must-not-publish',
        ),
      },
    );
    t.equal(scopedResult.success, false, 'the contradictory scope fails closed');
    t.equal(
      scopedResult.error,
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CONTRACT_INVALID,
      'the gateway exposes the rejected completeness contract',
    );
    t.equal(
      scopedResult.authoritativeObservedAtMs,
      null,
      'a scoped reconcile cannot publish despite requesting observation',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      null,
      'partial/scoped callers cannot become a second freshness owner',
    );
  },
);

t.test(
  'a shape-compatible caller receipt cannot impersonate gateway evidence',
  async (t) => {
    const fixture = createFixture();
    const result = await fixture.gateway.reconcileAuthoritativeCacheRows(
      TABLES.SERVICE_ENDPOINTS,
      [],
      {
        cacheMutationTarget: fixture.writableCache,
        systemTableCache: fixture.writableCache,
        cachedRows: [],
        authoritativeObservation: buildCompleteObservationContract(
          'caller-forged-receipt',
        ),
      },
    );

    t.equal(result.success, false, 'caller-shaped evidence fails closed');
    t.equal(
      result.error,
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CONTRACT_INVALID,
      'only a receipt minted by the canonical read gateway is accepted',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      null,
      'forged receipt shape cannot publish freshness evidence',
    );
  },
);

t.test(
  'a minted receipt cannot be detached from its authoritative row array',
  async (t) => {
    const fixture = createFixture();
    const authoritativeRead =
      await fixture.discovery.readAuthoritativeSystemTableRows(
        TABLES.SERVICE_ENDPOINTS,
        {
          nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
          reason: 'control_snapshot',
        },
      );
    const result = await fixture.gateway.reconcileAuthoritativeCacheRows(
      TABLES.SERVICE_ENDPOINTS,
      [...authoritativeRead.rows],
      {
        cacheMutationTarget: fixture.writableCache,
        systemTableCache: fixture.writableCache,
        cachedRows: [],
        authoritativeObservation:
          authoritativeRead.authoritativeObservation,
      },
    );

    t.equal(result.success, false, 'row substitution fails closed');
    t.equal(
      result.error,
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CONTRACT_INVALID,
      'the receipt is bound to the canonical read result identity',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      null,
      'detached rows cannot publish observation evidence',
    );
  },
);

t.test(
  'a complete observation ignores caller equality overrides before ' +
    'publishing freshness',
  async (t) => {
    const authoritativeRow = {
      endpoint_id: 'endpoint-comparator-bypass',
      service_id: 'service-1',
      node_id: 'node-seed',
      protocol: 'http',
      address: '127.0.0.1',
      port: 8080,
      health_status: 'healthy',
      metadata: '{}',
      created_at: OLD_MUTATION_AT_MS,
      updated_at: OLD_MUTATION_AT_MS,
    };
    const fixture = createFixture({authoritativeRows: [authoritativeRow]});
    fixture.writableCache.applySystemTableChange(
      TABLES.SERVICE_ENDPOINTS,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativeRow,
        address: '127.0.0.99',
      },
      {causeId: 'cdc:divergent-endpoint'},
    );
    const authoritativeRead =
      await fixture.discovery.readAuthoritativeSystemTableRows(
        TABLES.SERVICE_ENDPOINTS,
        {
          nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
          reason: 'control_snapshot',
        },
      );

    const result = await fixture.gateway.reconcileAuthoritativeCacheRows(
      TABLES.SERVICE_ENDPOINTS,
      authoritativeRead.rows,
      {
        areRowsEqual: () => true,
        authoritativeObservation:
          authoritativeRead.authoritativeObservation,
        cacheMutationTarget: fixture.writableCache,
        cachedRows: fixture.writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
        causeId: REPAIR_CAUSE_ID,
        systemTableCache: fixture.writableCache,
      },
    );

    t.equal(result.success, true, 'canonical full-row reconciliation succeeds');
    t.equal(result.mutationCount, 1, 'the divergent row is repaired once');
    t.equal(
      fixture.readableCache.get(
        TABLES.SERVICE_ENDPOINTS,
        authoritativeRow.endpoint_id,
      ).address,
      authoritativeRow.address,
      'a caller comparator cannot hide durable field divergence',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'freshness publishes only after canonical equality is established',
    );
  },
);

t.test(
  'non-observation reconciliation retains caller equality overrides',
  async (t) => {
    const authoritativeRow = {
      endpoint_id: 'endpoint-scoped-comparator',
      address: '127.0.0.1',
      updated_at: OLD_MUTATION_AT_MS,
    };
    const fixture = createFixture();
    fixture.writableCache.applySystemTableChange(
      TABLES.SERVICE_ENDPOINTS,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativeRow,
        address: '127.0.0.99',
      },
      {causeId: 'message-group-forwarding'},
    );

    const result = await fixture.gateway.reconcileAuthoritativeCacheRows(
      TABLES.SERVICE_ENDPOINTS,
      [authoritativeRow],
      {
        areRowsEqual: () => true,
        cacheMutationTarget: fixture.writableCache,
        cachedRows: fixture.writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
        systemTableCache: fixture.writableCache,
      },
    );

    t.equal(result.success, true, 'the scoped reconcile remains valid');
    t.equal(result.mutationCount, 0, 'the custom comparator retains ownership');
    t.equal(
      fixture.readableCache.get(
        TABLES.SERVICE_ENDPOINTS,
        authoritativeRow.endpoint_id,
      ).address,
      '127.0.0.99',
      'non-observation callers keep their scoped equality semantics',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      null,
      'a scoped comparator cannot publish completeness evidence',
    );
  },
);

t.test(
  'post-mint mutation of the authoritative row array invalidates its receipt',
  async (t) => {
    const fixture = createFixture({
      authoritativeRows: [{
        endpoint_id: 'mutable-endpoint',
        service_id: 'service-1',
        node_id: 'node-seed',
      }],
    });
    const authoritativeRead =
      await fixture.discovery.readAuthoritativeSystemTableRows(
        TABLES.SERVICE_ENDPOINTS,
        {
          nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
          reason: 'control_snapshot',
        },
      );
    authoritativeRead.rows.splice(0, authoritativeRead.rows.length);
    const result = await fixture.gateway.reconcileAuthoritativeCacheRows(
      TABLES.SERVICE_ENDPOINTS,
      authoritativeRead.rows,
      {
        cacheMutationTarget: fixture.writableCache,
        systemTableCache: fixture.writableCache,
        cachedRows: [],
        authoritativeObservation:
          authoritativeRead.authoritativeObservation,
      },
    );

    t.equal(result.success, false, 'post-mint row mutation fails closed');
    t.equal(
      result.error,
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CONTRACT_INVALID,
      'receipt authority includes immutable row-content evidence',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      null,
      'mutated authoritative content cannot publish observation evidence',
    );
  },
);

t.test(
  'observation publication fails closed when storage support is unavailable',
  async (t) => {
    const cacheWithoutObservationStorage = {
      applySystemTableChange() {},
      getAll() {
        return [];
      },
    };
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-no-observation-storage',
      systemTableCache: cacheWithoutObservationStorage,
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead() {
          return {success: true, rows: []};
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
    const noOpObservationStorage = {
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
      now: () => AUTHORITATIVE_OBSERVED_AT_MS,
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead() {
          return {success: true, rows: []};
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

t.test(
  'confirmed-empty evidence cannot bless preserved cached rows as fresh',
  async (t) => {
    const fixture = createFixture();
    fixture.writableCache.applySystemTableChange(
      TABLES.SERVICE_ENDPOINTS,
      CDC_OPERATION.UPSERT,
      {
        endpoint_id: 'stale-endpoint',
        service_id: 'stale-service',
        node_id: 'node-seed',
        protocol: 'http',
        address: '127.0.0.1',
        port: 9090,
      },
    );

    await t.rejects(
      reconcileFreshEvidence(fixture),
      new RegExp(
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CACHE_NOT_RECONCILED +
          ':pre_apply_unreconciled_cached_keys=1',
      ),
      'the admin repair owner identifies pre-apply key-set divergence',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      null,
      'unreconciled cached contents receive no freshness observation',
    );
    t.equal(
      fixture.readableCache.getAll(TABLES.SERVICE_ENDPOINTS).length,
      1,
      'refresh-evidence safety still preserves the unmatched cached row',
    );
  },
);

t.test(
  'preflight selects a newer mutation over an older authoritative observation',
  async (t) => {
    const fixture = createFixture();

    await reconcileFreshEvidence(fixture);
    const currentObservationCauseId =
      fixture.readableCache.getLastAuthoritativeObservedCauseId(
        TABLES.SERVICE_ENDPOINTS,
      );
    fixture.writableCache.recordAuthoritativeObservation(
      TABLES.SERVICE_ENDPOINTS,
      {
        observedAtMs: AUTHORITATIVE_OBSERVED_AT_MS - 1,
        causeId: 'older-observation',
      },
    );
    fixture.writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      NEWER_MUTATION_AT_MS,
    );
    fixture.writableCache.lastAppliedCauseIdByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      'cdc:newer-mutation',
    );
    const freshness = fixture.preflight.buildPreflightCacheFreshnessSummary({
      capturedAtMs: NEWER_MUTATION_AT_MS + 10,
    });
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'out-of-order observations cannot regress the watermark',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedCauseId(
        TABLES.SERVICE_ENDPOINTS,
      ),
      currentObservationCauseId,
      'an older observation cannot replace the current evidence cause',
    );
    t.equal(
      freshness.freshnessObservedAtMs,
      NEWER_MUTATION_AT_MS,
      'the selected watermark is the maximum available evidence time',
    );
    t.equal(freshness.freshnessSource, 'mutation', 'the source remains explicit');
    t.equal(freshness.stalenessMs, 10, 'freshness age uses the newer mutation');
  },
);

t.test(
  'a successful authoritative response without an explicit row-set contract ' +
    'cannot enter repair reconciliation',
  async (t) => {
    const cache = new SystemTableCache();
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-incomplete-read',
      systemTableCache: cache,
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead() {
          return {success: true};
        },
      },
    });
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-incomplete-read',
      systemTableCache: new ReadOnlySystemTableCache(cache),
      cacheMutationTarget: cache,
      controlPlaneSystemTableGateway: gateway,
      nowFn: () => AUTHORITATIVE_OBSERVED_AT_MS,
    });

    await t.rejects(
      discovery.readAuthoritativeSystemTableRows(
        TABLES.SERVICE_ENDPOINTS,
        {reason: 'control_snapshot'},
      ),
      new RegExp(
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.READ_INCOMPLETE,
      ),
      'normalized empty rows are not treated as confirmed-empty truth',
    );
    t.equal(
      cache.getLastAuthoritativeObservedAtMs(TABLES.SERVICE_ENDPOINTS),
      null,
      'an incomplete read cannot publish through the later reconcile path',
    );
  },
);

t.test(
  'partial authoritative rows cannot mint complete-table observation evidence',
  async (t) => {
    const fixture = createFixture({
      authoritativeResult: {
        success: true,
        rows: [{endpoint_id: 'partial-endpoint'}],
        participantFailures: [{partitionId: 'service_endpoints-p1'}],
      },
    });

    await t.rejects(
      fixture.discovery.readAuthoritativeSystemTableRows(
        TABLES.SERVICE_ENDPOINTS,
        {
          nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
          reason: 'control_snapshot',
        },
      ),
      new RegExp(
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.READ_INCOMPLETE,
      ),
      'the canonical read gateway owns completeness classification',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      null,
      'partial row delivery cannot reach observation storage',
    );
  },
);

t.test(
  'a causally newer cached row is explained divergence, not a failed repair',
  async (t) => {
    const authoritativeRow = {
      endpoint_id: 'endpoint-stale-authority',
      service_id: 'service-1',
      node_id: 'node-seed',
      protocol: 'http',
      address: '127.0.0.1',
      port: 8080,
      updated_at: OLD_MUTATION_AT_MS,
    };
    const fixture = createFixture({authoritativeRows: [authoritativeRow]});
    fixture.writableCache.applySystemTableChange(
      TABLES.SERVICE_ENDPOINTS,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativeRow,
        address: '127.0.0.2',
        updated_at: NEWER_MUTATION_AT_MS,
      },
      {causeId: 'cdc:newer-row'},
    );

    const mutationCount = await reconcileFreshEvidence(fixture);

    t.equal(
      mutationCount,
      0,
      'a superseded authoritative row is not re-applied over newer evidence',
    );
    t.equal(
      fixture.readableCache.get(
        TABLES.SERVICE_ENDPOINTS,
        'endpoint-stale-authority',
      ).address,
      '127.0.0.2',
      'the causally newer cached row survives the repair untouched',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'causally explained divergence still publishes observation evidence',
    );
  },
);

t.test(
  'complete publication repair replaces merge-preserved created_at exactly',
  async (t) => {
    const authoritativePublicationRow = {
      publication_id: 'membership-publication:2:created-at-repair',
      publication_kind: 'cluster_membership',
      publication_epoch: 2,
      publisher_node_id: 'node-seed',
      source_topology_epoch: null,
      source_snapshot_version: null,
      status: 'PUBLISHED',
      published_active_node_ids: ['node-seed'],
      required_ack_node_ids: ['node-seed'],
      acknowledged_node_ids: ['node-seed'],
      priority_partition_summary: null,
      membership_lifecycle_summary: null,
      reason_code: '',
      created_at: OLD_MUTATION_AT_MS * 2,
      updated_at: NEWER_MUTATION_AT_MS,
      published_at: NEWER_MUTATION_AT_MS,
      closed_at: NEWER_MUTATION_AT_MS,
      transition_history: [],
    };
    const fixture = createFixture({
      authoritativeRows: [authoritativePublicationRow],
    });
    fixture.writableCache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativePublicationRow,
        created_at: OLD_MUTATION_AT_MS,
      },
      {causeId: 'cdc:projected-publication'},
    );
    fixture.writableCache.applySystemTableChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      CDC_OPERATION.UPSERT,
      authoritativePublicationRow,
      {causeId: 'cdc:ordinary-publication-merge'},
    );
    t.equal(
      fixture.readableCache.get(
        TABLES.CONTROL_PLANE_PUBLICATIONS,
        authoritativePublicationRow.publication_id,
      ).created_at,
      OLD_MUTATION_AT_MS,
      'ordinary CDC retains the first observed creation time',
    );

    const authoritativeRead =
      await fixture.discovery.readAuthoritativeSystemTableRows(
        TABLES.CONTROL_PLANE_PUBLICATIONS,
        {
          nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
          reason: 'control_snapshot',
        },
      );
    const mutationCount =
      await fixture.discovery.applyAuthoritativeSystemTableRows(
        TABLES.CONTROL_PLANE_PUBLICATIONS,
        authoritativeRead.rows,
        REPAIR_CAUSE_ID,
        {authoritativeObservation: authoritativeRead.authoritativeObservation},
      );

    t.equal(
      mutationCount,
      1,
      'complete authority replaces one merge-divergent cache row',
    );
    t.same(
      fixture.readableCache.get(
        TABLES.CONTROL_PLANE_PUBLICATIONS,
        authoritativePublicationRow.publication_id,
      ),
      authoritativePublicationRow,
      'complete authority leaves the cache exactly equal to durable truth',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.CONTROL_PLANE_PUBLICATIONS,
      ),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'exact replacement publishes complete observation evidence',
    );
  },
);

t.test(
  'cache-only origin HLC does not make a durable authoritative row divergent',
  async (t) => {
    const authoritativeNodeRow = {
      node_id: 'node-cache-hlc',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: AUTHORITATIVE_OBSERVED_AT_MS - 100,
      ready_lease_expires_at: AUTHORITATIVE_OBSERVED_AT_MS + 10_000,
      created_at: OLD_MUTATION_AT_MS,
    };
    const fixture = createFixture({authoritativeRows: [authoritativeNodeRow]});
    fixture.writableCache.applySystemTableChange(
      TABLES.NODES,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativeNodeRow,
        updated_at_hlc: '60900-0-node-cache-hlc',
      },
      {causeId: 'cdc:origin-hlc-envelope'},
    );

    const authoritativeRead =
      await fixture.discovery.readAuthoritativeSystemTableRows(
        TABLES.NODES,
        {
          nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
          reason: 'control_snapshot',
        },
      );
    const mutationCount =
      await fixture.discovery.applyAuthoritativeSystemTableRows(
        TABLES.NODES,
        authoritativeRead.rows,
        REPAIR_CAUSE_ID,
        {authoritativeObservation: authoritativeRead.authoritativeObservation},
      );

    t.equal(
      mutationCount,
      0,
      'cache-only HLC metadata does not fabricate a durable row mutation',
    );
    t.equal(
      fixture.readableCache.get(
        TABLES.NODES,
        authoritativeNodeRow.node_id,
      ).updated_at_hlc,
      '60900-0-node-cache-hlc',
      'the cache retains the origin HLC used by causal ordering',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(TABLES.NODES),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'durable row equality can publish despite cache-only envelope metadata',
    );
  },
);

t.test(
  'local partition tenure annotations survive durable authoritative repair',
  async (t) => {
    const authoritativePartitionRow = {
      partition_id: 'replica_operations-p1',
      table_id: 'replica_operations',
      partition_number: 1,
      leader_node_id: 'node-local-leader',
      state: 'active',
      created_at: OLD_MUTATION_AT_MS,
      updated_at: OLD_MUTATION_AT_MS,
    };
    const fixture = createFixture({
      authoritativeRows: [authoritativePartitionRow],
    });
    fixture.writableCache.applySystemTableChange(
      TABLES.PARTITIONS,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativePartitionRow,
        state: 'recovering',
        updated_at_hlc: '60900-0-node-local-leader',
        leader_claim_node_id: 'node-local-leader',
        leader_claim_raft_term: 17,
        leader_claim_minted_against_updated_at: OLD_MUTATION_AT_MS,
      },
      {causeId: 'local-raft-leader:elected:replica_operations-p1'},
    );

    const authoritativeRead =
      await fixture.discovery.readAuthoritativeSystemTableRows(
        TABLES.PARTITIONS,
        {
          nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
          reason: 'control_snapshot',
        },
      );
    const mutationCount =
      await fixture.discovery.applyAuthoritativeSystemTableRows(
        TABLES.PARTITIONS,
        authoritativeRead.rows,
        REPAIR_CAUSE_ID,
        {authoritativeObservation: authoritativeRead.authoritativeObservation},
      );
    const reconciledRow = fixture.readableCache.get(
      TABLES.PARTITIONS,
      authoritativePartitionRow.partition_id,
    );

    t.equal(
      mutationCount,
      1,
      'the divergent durable state is repaired once',
    );
    t.equal(
      reconciledRow.state,
      authoritativePartitionRow.state,
      'the authoritative durable state replaces the cached value',
    );
    t.equal(
      reconciledRow.leader_claim_node_id,
      'node-local-leader',
      'reconciliation retains the active local tenure claim',
    );
    t.equal(
      reconciledRow.leader_claim_raft_term,
      17,
      'reconciliation retains the term-bound replay fence',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.PARTITIONS,
      ),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'durable equality publishes despite local-only claim annotations',
    );
  },
);

t.test(
  'a causally newer cached nodes heartbeat cannot wedge complete-table ' +
    'observation',
  async (t) => {
    const authoritativeNodeRow = {
      node_id: 'node-a',
      node_address: 'localhost:8080',
      status: 'active',
      last_heartbeat: AUTHORITATIVE_OBSERVED_AT_MS - 100,
      created_at: OLD_MUTATION_AT_MS,
      updated_at: AUTHORITATIVE_OBSERVED_AT_MS - 100,
    };
    const fixture = createFixture({authoritativeRows: [authoritativeNodeRow]});
    fixture.writableCache.applySystemTableChange(
      TABLES.NODES,
      CDC_OPERATION.UPSERT,
      authoritativeNodeRow,
      {causeId: 'cdc:pre-read-heartbeat'},
    );

    const authoritativeRead =
      await fixture.discovery.readAuthoritativeSystemTableRows(
        TABLES.NODES,
        {
          nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
          reason: 'control_snapshot',
        },
      );
    // Live seam: heartbeat churn lands after the read minted its receipt but
    // before the repair reconciles, so the cache is causally newer than the
    // authoritative row set for the same key.
    fixture.writableCache.applySystemTableChange(
      TABLES.NODES,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativeNodeRow,
        last_heartbeat: NEWER_MUTATION_AT_MS,
        updated_at: NEWER_MUTATION_AT_MS,
      },
      {causeId: 'cdc:heartbeat-churn'},
    );

    const mutationCount =
      await fixture.discovery.applyAuthoritativeSystemTableRows(
        TABLES.NODES,
        authoritativeRead.rows,
        REPAIR_CAUSE_ID,
        {authoritativeObservation: authoritativeRead.authoritativeObservation},
      );

    t.equal(
      mutationCount,
      0,
      'the older authoritative heartbeat row is not re-applied',
    );
    t.equal(
      fixture.readableCache.get(TABLES.NODES, 'node-a').last_heartbeat,
      NEWER_MUTATION_AT_MS,
      'the newer heartbeat watermark survives the repair',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(TABLES.NODES),
      AUTHORITATIVE_OBSERVED_AT_MS,
      'continuous nodes churn cannot permanently block observation evidence',
    );
    t.equal(
      fixture.readableCache.getLastAppliedCauseId(TABLES.NODES),
      'cdc:heartbeat-churn',
      'the repair does not rewrite the mutation cause',
    );
  },
);

t.test(
  'a silently dropped repair write cannot publish observation evidence',
  async (t) => {
    const authoritativeRow = {
      endpoint_id: 'endpoint-dropped-write',
      service_id: 'service-1',
      node_id: 'node-seed',
      protocol: 'http',
      address: '127.0.0.1',
      port: 8080,
      updated_at: NEWER_MUTATION_AT_MS,
    };
    const fixture = createFixture({authoritativeRows: [authoritativeRow]});
    fixture.writableCache.applySystemTableChange(
      TABLES.SERVICE_ENDPOINTS,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativeRow,
        address: '127.0.0.2',
        updated_at: OLD_MUTATION_AT_MS,
      },
      {causeId: 'cdc:stale-row'},
    );
    // The cached row is causally OLDER, so the repair must write — but the
    // mutation target silently drops the write. Success here would report a
    // reconciled cache that was never actually repaired.
    const droppingMutationTarget = {
      applySystemTableChange() {},
      recordAuthoritativeObservation(tableName, evidence) {
        return fixture.writableCache.recordAuthoritativeObservation(
          tableName,
          evidence,
        );
      },
    };
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-seed',
      systemTableCache: fixture.readableCache,
      cacheMutationTarget: droppingMutationTarget,
      controlPlaneSystemTableGateway: fixture.gateway,
      nowFn: () => AUTHORITATIVE_OBSERVED_AT_MS,
    });

    const authoritativeRead = await discovery.readAuthoritativeSystemTableRows(
      TABLES.SERVICE_ENDPOINTS,
      {
        nowMs: AUTHORITATIVE_OBSERVED_AT_MS,
        reason: 'control_snapshot',
      },
    );
    await t.rejects(
      discovery.applyAuthoritativeSystemTableRows(
        TABLES.SERVICE_ENDPOINTS,
        authoritativeRead.rows,
        REPAIR_CAUSE_ID,
        {authoritativeObservation: authoritativeRead.authoritativeObservation},
      ),
      new RegExp(
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CACHE_NOT_RECONCILED +
          ':post_apply_cache_divergence=.*address',
      ),
      'post-apply divergence identifies the field a write failed to repair',
    );
    t.equal(
      fixture.readableCache.getLastAuthoritativeObservedAtMs(
        TABLES.SERVICE_ENDPOINTS,
      ),
      null,
      'a silently dropped write cannot bless the cache as observed',
    );
  },
);
