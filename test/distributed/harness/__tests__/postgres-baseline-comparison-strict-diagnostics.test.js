import {
  describe,
  it,
  assert,
  mkdtemp,
  rm,
  join,
  tmpdir,
  runWithVirtualScenarioTiming as run,
  resolveBenchmarkConfig,
  buildComparison,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  SCENARIO_PHASE_SEQUENCE,
  PROBE_SQL,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_DISCOVERY_HEALTH,
  DEFAULT_DISCOVERY_REPLICA_PORT,
  DISCOVERY_ADMIN_META_SERVICE_ID,
  DISCOVERY_ADMIN_META_PROTOCOL,
  SERVICE_DISCOVERY_SQL_PREFIX,
  DEFAULT_DISCOVERY_TABLE_NAME,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION,
  PREFLIGHT_CRITICAL_PATH_SNAPSHOT_ADDRESS_FALLBACK,
  QUIET_MODE_ACTION_ENTER,
  QUIET_MODE_ACTION_EXIT,
  QUIET_MODE_PHASE_PRE_FLIGHT,
  QUIET_MODE_PHASE_TEARDOWN,
  isRecord,
  buildControlSnapshotPayload,
  hasValidControlSnapshotResult,
  hasValidServiceDiscoveryResult,
  buildServiceDiscoverySnapshot,
  buildPreflightCriticalPathSnapshotPayload,
  asNodeHandle,
  asNodeHandles,
  buildVersionedStrictReadinessCluster,
} from './postgres-baseline-comparison-test-helpers.js';


describe('postgres-baseline-comparison scenario', () => {
  function buildVersionedConvergenceBarrierCluster(options = {}) {
    const loadCalls = [];
    const benchmarkTableProbeSql =
      'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const requiredSchemaVersion = typeof options.requiredSchemaVersion === 'string' ?
      options.requiredSchemaVersion :
      '1740589945123:7:seed-1';
    const laggingSchemaVersion = typeof options.laggingSchemaVersion === 'string' ?
      options.laggingSchemaVersion :
      '1740589945123:6:seed-1';
    const joinerLagPolls = Number.isInteger(options.joinerLagPolls) &&
      options.joinerLagPolls >= 0 ?
      options.joinerLagPolls :
      Number.MAX_SAFE_INTEGER;
    const quiescentTimeoutMs = Number.isInteger(options.quiescentTimeoutMs) &&
      options.quiescentTimeoutMs > 0 ?
      options.quiescentTimeoutMs :
      240;
    let discoveryPollCount = 0;
    const provider = {
      createContainer: async (_options) => ({
        containerId: 'benchmark-postgres-1',
        ip: '172.18.0.80',
        name: 'benchmark-postgres-1',
      }),
      execInContainer: async (_containerId, cmd) => {
        const command = String(cmd[2] || '');
        if (command.includes('pg_isready')) {
          return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
        }
        if (command.includes('pg_stat_replication')) {
          return {exitCode: 0, stdout: '0\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    function buildDiscoverySnapshot(nodeId) {
      discoveryPollCount += 1;
      const joinerAppliedSchemaVersion =
        discoveryPollCount > joinerLagPolls ?
          requiredSchemaVersion :
          laggingSchemaVersion;
      return {
        schemaVersion: NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
        nodeId,
        capturedAt: Date.now(),
        serviceCount: 1,
        replicaCount: 2,
        services: [{
          serviceKey:
            NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE +
            '|' +
            NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
          logicalServiceName: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
          protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
          serviceIds: [NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE],
          nodes: ['seed-1', 'joiner-1'],
          replicas: [{
            endpointId: 'sys-postgres-wire-ep-seed-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'seed-1',
            address: '127.0.0.1',
            port: 5432,
            healthStatus: 'healthy',
            updatedAt: Date.now(),
            metadata: {},
            readiness: {
              workloadReady: true,
              benchmarkReady: true,
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              replicaOpsInFlight: 0,
              leadershipStable: true,
              tableName: 'benchmark_events',
              reasons: [],
              appliedSchemaVersion: requiredSchemaVersion,
            },
          }, {
            endpointId: 'sys-postgres-wire-ep-joiner-1',
            serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
            nodeId: 'joiner-1',
            address: '127.0.0.1',
            port: 5432,
            healthStatus: 'healthy',
            updatedAt: Date.now(),
            metadata: {},
            readiness: {
              workloadReady: true,
              benchmarkReady: true,
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              replicaOpsInFlight: 0,
              leadershipStable: true,
              tableName: 'benchmark_events',
              reasons: [],
              appliedSchemaVersion: joinerAppliedSchemaVersion,
            },
          }],
        }],
      };
    }

    function createNode(nodeId, role) {
      return {
        id: nodeId,
        role,
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          if (statement.includes('FROM tables')) {
            return {
              rows: [{
                table_id: 'tbl-benchmark',
                schema_version: requiredSchemaVersion,
              }],
            };
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id)],
            };
          }
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
              statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildDiscoverySnapshot(this.id)],
            };
          }
          return this.query(statement, params);
        },
        getReachabilityDiagnostics: async function() {
          return {
            nodeId: this.id,
            reachable: true,
            adminReady: true,
          };
        },
      };
    }

    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:16',
          durationSeconds: 5,
          clients: 2,
          jobs: 1,
          loadOpsPerSec: 40,
          loadDuration: '5s',
          loadMaxInFlight: 64,
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          strictPreloadReadiness: true,
          quiescentTimeoutMs,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
        },
        convergence: {
          settleTimeoutMs: 1000,
          quietWindowMs: 100,
          targetVoterCount: 3,
        },
        resourceLimits: {
          memory: '1g',
          cpus: '1.0',
        },
        timeouts: {
          nodeStartup: 1000,
        },
      },
      _scenarioOverrides: {
        postgresBaselineComparison: {
          createPostgresPool: () => ({
            query: async () => ({rows: []}),
            end: async () => {},
          }),
          createLoadGenerator: (nodes) => {
            loadCalls.push(nodes.map((node) => node.id));
            const isBaselineLoad =
              String(nodes?.[0]?.id || '').startsWith(
                'postgres-baseline-load-node-',
              );
            return {
              start: () => ({
                waitComplete: async () => (
                  isBaselineLoad ?
                    {
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 100,
                      latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                    } :
                    {
                      total: 100,
                      success: 100,
                      failed: 0,
                      errors: 0,
                      opsPerSec: 50,
                      latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                    }
                ),
              }),
            };
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => [
        createNode('seed-1', 'seed'),
        createNode('joiner-1', 'joiner'),
      ],
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    return {
      cluster,
      loadCalls,
      requiredSchemaVersion,
    };
  }

  it('blocks load until all strict required nodes converge to required schema version',
    async () => {
      const {cluster, loadCalls, requiredSchemaVersion} =
        buildVersionedConvergenceBarrierCluster({
          joinerLagPolls: 4,
          quiescentTimeoutMs: 600,
        });

      const result = await run(cluster);
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'load should start only after both required nodes converge',
      );
      assert.equal(
        result.details.phaseArtifacts.pre_load_gate.versionConvergence.requiredSchemaVersion,
        requiredSchemaVersion,
        'pre-load gate artifacts should capture required schema version barrier',
      );
    });

  it('reports per-node unmet reasons when strict versioned convergence barrier times out',
    async () => {
      const {cluster, loadCalls} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: Number.MAX_SAFE_INTEGER,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          assert.match(
            String(error?.message || ''),
            /strict_preload_readiness_failed.*schema_version_lag/i,
          );
          const nodeReasons =
            error?.diagnostics?.failure?.versionConvergence?.nodes;
          assert.ok(
            nodeReasons &&
              nodeReasons['seed-1'] &&
              nodeReasons['joiner-1'],
            'failure diagnostics should include per-node unmet reasons',
          );
          return true;
        },
      );
      assert.equal(
        loadCalls.length,
        0,
        'strict barrier timeout should abort before load starts',
      );
    });

  it('emits convergence timeline diagnostics with required event types and keys',
    async () => {
      const {cluster, requiredSchemaVersion} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: 2,
        quiescentTimeoutMs: 600,
      });

      const result = await run(cluster);
      const convergenceTimeline = result.details?.benchmark?.convergenceTimeline;
      assert.ok(
        Array.isArray(convergenceTimeline) && convergenceTimeline.length > 0,
        'benchmark details should include a non-empty convergence timeline',
      );

      const eventTypes = new Set(
        convergenceTimeline.map((event) => String(event?.type || '')),
      );
      assert.ok(
        eventTypes.has('table_create_committed'),
        'timeline should include table_create_committed',
      );
      assert.ok(eventTypes.has('cdc_emitted'), 'timeline should include cdc_emitted');
      assert.ok(eventTypes.has('cdc_received'), 'timeline should include cdc_received');
      assert.ok(
        eventTypes.has('cache_applied_version'),
        'timeline should include cache_applied_version',
      );
      assert.ok(
        eventTypes.has('readiness_predicate_pass'),
        'timeline should include readiness_predicate_pass',
      );

      const predicatePassEvent = convergenceTimeline.find(
        (event) => event?.type === 'readiness_predicate_pass',
      );
      assert.equal(
        predicatePassEvent?.requiredSchemaVersion,
        requiredSchemaVersion,
        'timeline readiness events should be keyed by required schema version',
      );
      assert.ok(
        typeof predicatePassEvent?.nodeId === 'string' &&
          predicatePassEvent.nodeId.length > 0,
        'timeline readiness events should include nodeId',
      );
      assert.ok(
        typeof predicatePassEvent?.tableId === 'string' &&
          predicatePassEvent.tableId.length > 0,
        'timeline readiness events should include tableId',
      );
    });

  it('records benchmark metadata flow snapshots for create and readiness stages',
    async () => {
      const {cluster} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: 2,
        quiescentTimeoutMs: 600,
      });

      const result = await run(cluster);
      const metadataFlow = result.details?.benchmark?.benchmarkMetadataFlow;
      assert.equal(
        metadataFlow?.schemaVersion,
        1,
        'benchmark details should include metadata flow schema version',
      );
      assert.equal(
        metadataFlow?.createCommitted?.stage,
        'create_committed',
        'metadata flow should capture create-committed snapshot',
      );
      assert.deepEqual(
        metadataFlow?.createCommitted?.tables?.tableIds,
        ['tbl-benchmark'],
        'create snapshot should include benchmark table id',
      );
      assert.deepEqual(
        metadataFlow?.createCommitted?.partitions?.partitionIds,
        ['p1'],
        'create snapshot should include benchmark partition ids',
      );
      assert.ok(
        metadataFlow?.nodeSnapshots?.['seed-1'],
        'metadata flow should include seed-node readiness snapshot',
      );
      assert.ok(
        metadataFlow?.nodeSnapshots?.['joiner-1'],
        'metadata flow should include joiner readiness snapshot',
      );
      assert.equal(
        metadataFlow?.nodeSnapshots?.['joiner-1']?.stage,
        'readiness_poll',
        'node snapshots should come from readiness polling stage',
      );
      assert.equal(
        metadataFlow?.nodeSnapshots?.['joiner-1']?.readinessState?.schemaReady,
        true,
        'node snapshot should preserve discovery readiness state',
      );
    });

  it('emits version lag summary diagnostics on strict convergence timeout',
    async () => {
      const {cluster} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: Number.MAX_SAFE_INTEGER,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const versionLagSummary = error?.diagnostics?.failure?.versionLagSummary;
          assert.ok(
            versionLagSummary && typeof versionLagSummary === 'object',
            'failure diagnostics should include version lag summary',
          );
          assert.ok(
            versionLagSummary.nodes &&
              versionLagSummary.nodes['joiner-1'],
            'version lag summary should include lagging node entry',
          );
          return true;
        },
      );
    });

  it('includes benchmark metadata flow in strict pre-load failure diagnostics',
    async () => {
      const {cluster} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: Number.MAX_SAFE_INTEGER,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const metadataFlow = error?.diagnostics?.failure?.benchmarkMetadataFlow;
          assert.ok(
            metadataFlow && typeof metadataFlow === 'object',
            'strict failure diagnostics should include benchmark metadata flow',
          );
          assert.ok(
            metadataFlow?.createCommitted &&
              metadataFlow?.nodeSnapshots?.['joiner-1'],
            'strict failure diagnostics should retain create and joiner snapshots',
          );
          return true;
        },
      );
    });

  it('selects deterministic dominant strict reason by precedence when multiple reasons are present',
    async () => {
      const {cluster} = buildVersionedStrictReadinessCluster({
        includeTopologyReady: false,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const failure = error?.diagnostics?.failure;
          assert.equal(
            failure?.dominantReason,
            'admin_not_queryable',
            'strict failure should choose highest-precedence dominant reason',
          );
          return true;
        },
      );
    });

  it('includes exactly one dominant reason in strict failure envelope',
    async () => {
      const {cluster} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: Number.MAX_SAFE_INTEGER,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const failure = error?.diagnostics?.failure;
          assert.equal(
            typeof failure?.dominantReason,
            'string',
            'failure envelope should include dominantReason string',
          );
          assert.ok(
            failure.dominantReason.length > 0,
            'dominantReason should be non-empty',
          );
          assert.equal(
            Array.isArray(failure?.dominantReason),
            false,
            'dominantReason should be singular, not an array',
          );
          return true;
        },
      );
    });

  it('emits root-cause bundle on strict pre-load failure', async () => {
    const {cluster} = buildVersionedStrictReadinessCluster({
      includeAppliedSchemaVersion: false,
      quiescentTimeoutMs: 120,
    });

    await assert.rejects(
      run(cluster),
      (error) => {
        const bundle = error?.diagnostics?.rootCauseBundle;
        assert.ok(
          bundle && typeof bundle === 'object',
          'strict failure diagnostics should include rootCauseBundle object',
        );
        assert.equal(
          typeof bundle?.rootCauseCode,
          'string',
          'rootCauseBundle should include rootCauseCode string',
        );
        assert.equal(
          typeof bundle?.rootCauseClass,
          'string',
          'rootCauseBundle should include rootCauseClass string',
        );
        return true;
      },
    );
  });

  it('fails strict runs on hard pre-load invariant breaches before load starts',
    async () => {
      const leaderKnownEntry = {
        leaderKnown: true,
        leaderNodeId: 'seed-1',
        isLeaderLocal: true,
        lastErrorCode: null,
      };
      const {cluster, loadCalls} = buildVersionedStrictReadinessCluster({
        includeAppliedSchemaVersion: true,
        quiescentTimeoutMs: 120,
        preflightSnapshotOverrides: {
          controlPlanePartitions: {
            nodes: leaderKnownEntry,
            services: {
              leaderKnown: false,
              leaderNodeId: null,
              isLeaderLocal: false,
              lastErrorCode: 'leader_service_missing',
            },
            node_endpoints: leaderKnownEntry,
            service_endpoints: leaderKnownEntry,
          },
          rowCounts: {
            sysPostgresWireServiceCount: 1,
            nodeEndpointsCount: 1,
            serviceEndpointsCount: 1,
          },
        },
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          assert.match(error?.message || '', /phase pre_load_gate/i);
          assert.equal(
            loadCalls.length,
            0,
            'load phase should not start after hard invariant breach',
          );
          assert.equal(
            error?.diagnostics?.invariantBreaches?.hardCount,
            1,
            'failure diagnostics should summarize hard invariant breaches',
          );
          const failingCodes = (error?.diagnostics?.rootCauseBundle?.invariants || [])
            .filter((invariant) => invariant?.passed === false)
            .map((invariant) => invariant?.reasonCode || invariant?.code);
          assert.ok(
            failingCodes.includes('leadership_unknown_control_plane_partition'),
            'rootCauseBundle should retain the failing invariant reason code',
          );
          return true;
        },
      );
    });

  it('emits root-cause bundle using harness-owned taxonomy constants', async () => {
    const {cluster} = buildVersionedStrictReadinessCluster({
      includeAppliedSchemaVersion: false,
      quiescentTimeoutMs: 120,
    });

    let error = null;
    try {
      await run(cluster);
    } catch (err) {
      error = err;
    }

    assert.ok(error, 'expected strict pre-load readiness failure');
    const bundle = error?.diagnostics?.rootCauseBundle;
    assert.ok(
      bundle && typeof bundle === 'object',
      'strict failure diagnostics should include rootCauseBundle object',
    );

    const taxonomy = await import('../root-cause-constants.js');
    const codes = Object.values(taxonomy.ROOT_CAUSE_CODE || {});
    const classes = Object.values(taxonomy.ROOT_CAUSE_CLASS || {});
    assert.ok(
      codes.includes(bundle.rootCauseCode),
      'rootCauseBundle.rootCauseCode should come from ROOT_CAUSE_CODE constants',
    );
    assert.ok(
      classes.includes(bundle.rootCauseClass),
      'rootCauseBundle.rootCauseClass should come from ROOT_CAUSE_CLASS constants',
    );
  });

  it('captures preflight critical-path snapshots on strict pre-load failure',
    async () => {
      const {cluster} = buildVersionedStrictReadinessCluster({
        includeAppliedSchemaVersion: false,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const snapshotsByNodeId = error?.diagnostics?.rootCauseBundle?.
            snapshotsByNodeId;
          assert.ok(
            snapshotsByNodeId && typeof snapshotsByNodeId === 'object',
            'rootCauseBundle should include snapshotsByNodeId object',
          );

          const snapshot = snapshotsByNodeId?.['seed-1'];
          assert.ok(
            snapshot && typeof snapshot === 'object',
            'snapshotsByNodeId should include seed-1 snapshot object',
          );
          assert.equal(
            snapshot.nodeId,
            'seed-1',
            'preflight snapshot nodeId should match map key',
          );
          assert.ok(
            typeof snapshot.address === 'string' && snapshot.address.length > 0,
            'preflight snapshot should include non-empty address',
          );
          assert.ok(
            Number.isFinite(snapshot.capturedAtMs),
            'preflight snapshot should include capturedAtMs epoch number',
          );

          const routerConnectivity = snapshot.routerConnectivity;
          assert.ok(
            routerConnectivity && typeof routerConnectivity === 'object',
            'preflight snapshot should include routerConnectivity object',
          );
          for (const field of [
            'connectedCount',
            'reconnectingCount',
            'disconnectedCount',
          ]) {
            assert.ok(
              Number.isInteger(routerConnectivity[field]) &&
                routerConnectivity[field] >= 0 &&
                routerConnectivity[field] <= 100,
              'routerConnectivity.' + field + ' should be bounded integer',
            );
          }

          const partitions = snapshot.controlPlanePartitions;
          assert.ok(
            partitions && typeof partitions === 'object',
            'preflight snapshot should include controlPlanePartitions object',
          );
          for (const key of [
            'nodes',
            'services',
            'node_endpoints',
            'service_endpoints',
          ]) {
            const entry = partitions[key];
            assert.ok(
              entry && typeof entry === 'object',
              'controlPlanePartitions should include ' + key + ' entry',
            );
            assert.equal(
              typeof entry.leaderKnown,
              'boolean',
              key + '.leaderKnown should be boolean',
            );
            assert.ok(
              entry.leaderNodeId === null || typeof entry.leaderNodeId === 'string',
              key + '.leaderNodeId should be string|null',
            );
            assert.equal(
              typeof entry.isLeaderLocal,
              'boolean',
              key + '.isLeaderLocal should be boolean',
            );
            assert.ok(
              entry.lastErrorCode === null ||
                (typeof entry.lastErrorCode === 'string' &&
                  entry.lastErrorCode.length <= 64),
              key + '.lastErrorCode should be bounded string|null',
            );
          }

          const cdcHealth = snapshot.cdcHealth;
          assert.ok(
            cdcHealth && typeof cdcHealth === 'object',
            'preflight snapshot should include cdcHealth object',
          );
          for (const field of ['bufferDepth', 'retryCount']) {
            assert.ok(
              Number.isInteger(cdcHealth[field]) && cdcHealth[field] >= 0,
              'cdcHealth.' + field + ' should be non-negative integer',
            );
          }
          assert.ok(
            cdcHealth.lastErrorCode === null ||
              (typeof cdcHealth.lastErrorCode === 'string' &&
                cdcHealth.lastErrorCode.length <= 64),
            'cdcHealth.lastErrorCode should be bounded string|null',
          );
          assert.ok(
            cdcHealth.lastForwardAttemptAtMs === null ||
              Number.isFinite(cdcHealth.lastForwardAttemptAtMs),
            'cdcHealth.lastForwardAttemptAtMs should be number|null',
          );

          const cacheFreshness = snapshot.cacheFreshness;
          assert.ok(
            cacheFreshness && typeof cacheFreshness === 'object',
            'preflight snapshot should include cacheFreshness object',
          );
          assert.ok(
            cacheFreshness.lastAppliedAtMs === null ||
              Number.isFinite(cacheFreshness.lastAppliedAtMs),
            'cacheFreshness.lastAppliedAtMs should be number|null',
          );
          assert.ok(
            cacheFreshness.appliedSchemaVersion === null ||
              typeof cacheFreshness.appliedSchemaVersion === 'string',
            'cacheFreshness.appliedSchemaVersion should be string|null',
          );
          assert.ok(
            cacheFreshness.stalenessMs === null ||
              (Number.isFinite(cacheFreshness.stalenessMs) &&
                cacheFreshness.stalenessMs >= 0),
            'cacheFreshness.stalenessMs should be non-negative number|null',
          );

          const rowCounts = snapshot.rowCounts;
          assert.ok(
            rowCounts && typeof rowCounts === 'object',
            'preflight snapshot should include rowCounts object',
          );
          for (const field of [
            'sysPostgresWireServiceCount',
            'nodeEndpointsCount',
            'serviceEndpointsCount',
          ]) {
            assert.ok(
              Number.isInteger(rowCounts[field]) && rowCounts[field] >= 0,
              'rowCounts.' + field + ' should be non-negative integer',
            );
          }

          const discovery = snapshot.discovery;
          assert.ok(
            discovery && typeof discovery === 'object',
            'preflight snapshot should include discovery object',
          );
          assert.ok(
            Array.isArray(discovery.selectedNodeIds),
            'discovery.selectedNodeIds should be array',
          );
          assert.ok(
            discovery.selectedNodeIds.length <= 100,
            'discovery.selectedNodeIds should be bounded',
          );
          assert.ok(
            discovery.excludedByNodeId &&
              typeof discovery.excludedByNodeId === 'object',
            'discovery.excludedByNodeId should be object',
          );
          assert.ok(
            Object.keys(discovery.excludedByNodeId).length <= 100,
            'discovery.excludedByNodeId should be bounded',
          );

          return true;
        },
      );
    });

  it('captures admin query traces on strict pre-load failure',
    async () => {
      const {cluster} = buildVersionedStrictReadinessCluster({
        includeAppliedSchemaVersion: false,
        quiescentTimeoutMs: 120,
        adminQueryTraceSnapshot: [{
          queryId: 'q-timeout-1',
          lane: 'default',
          operation: 'query',
          outcome: 'timeout',
          statementPreview: 'SELECT * FROM service_discovery_local()',
          startedAtMs: Date.now(),
          socketReadyAtMs: Date.now(),
          sentAtMs: Date.now(),
          timeoutAtMs: Date.now(),
          resolvedAtMs: null,
          error: 'Admin API query timed out',
        }],
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const tracesByNodeId = error?.diagnostics?.rootCauseBundle?.
            adminQueryTraceByNodeId;
          assert.ok(
            tracesByNodeId && typeof tracesByNodeId === 'object',
            'rootCauseBundle should include adminQueryTraceByNodeId object',
          );
          const seedTraces = tracesByNodeId?.['seed-1'];
          assert.ok(
            Array.isArray(seedTraces) && seedTraces.length > 0,
            'admin query traces should include non-empty seed-1 array',
          );
          assert.equal(seedTraces[0].queryId, 'q-timeout-1');
          assert.equal(seedTraces[0].outcome, 'timeout');
          return true;
        },
      );
    });

  it('records stable missing-data reasons when a preflight snapshot cannot be collected',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const requiredSchemaVersion = '1740589945123:7:seed-1';

      const seedNode = {
        id: 'seed-1',
        ip: PREFLIGHT_CRITICAL_PATH_SNAPSHOT_ADDRESS_FALLBACK,
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement.includes('FROM tables')) {
            return {
              rows: [{
                table_id: 'tbl-benchmark',
                schema_version: requiredSchemaVersion,
              }],
            };
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
            return {
              rows: [buildPreflightCriticalPathSnapshotPayload(this)],
            };
          }
          if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id)],
            };
          }
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
              statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                ip: this.ip,
                discoveryNodeIds: ['seed-1'],
              })],
            };
          }
          return this.query(statement, params);
        },
        getReachabilityDiagnostics: async function() {
          return {
            nodeId: this.id,
            reachable: true,
            adminReady: true,
          };
        },
      };

      const joinerNode = {
        id: 'joiner-1',
        ip: PREFLIGHT_CRITICAL_PATH_SNAPSHOT_ADDRESS_FALLBACK,
        role: 'joiner',
        query: seedNode.query,
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          const statement = String(sql);
          if (statement === PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SQL) {
            throw new Error('preflight snapshot unavailable');
          }
          if (statement === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id)],
            };
          }
          if (statement === NODE_CLIENT_SERVICE_DISCOVERY_SQL ||
              statement.startsWith(SERVICE_DISCOVERY_SQL_PREFIX)) {
            return {
              rows: [buildServiceDiscoverySnapshot({
                id: this.id,
                ip: this.ip,
                discoveryNodeIds: ['joiner-1'],
                discoveryServiceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
                discoveryProtocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
              })],
            };
          }
          return this.query(statement, params);
        },
        getReachabilityDiagnostics: async function() {
          return {
            nodeId: this.id,
            reachable: true,
            adminReady: true,
          };
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictPreloadReadiness: true,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: () => ({
              start: () => ({
                waitComplete: async () => ({
                  total: 100,
                  success: 100,
                  failed: 0,
                  errors: 0,
                  opsPerSec: 50,
                  latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                }),
              }),
            }),
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => [seedNode, joinerNode],
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        (error) => {
          const snapshotsByNodeId = error?.diagnostics?.rootCauseBundle?.
            snapshotsByNodeId;
          assert.ok(
            snapshotsByNodeId && typeof snapshotsByNodeId === 'object',
            'rootCauseBundle should include snapshotsByNodeId object',
          );

          const joinerSnapshot = snapshotsByNodeId?.['joiner-1'];
          assert.ok(
            joinerSnapshot && typeof joinerSnapshot === 'object',
            'snapshotsByNodeId should include joiner-1 snapshot entry',
          );
          assert.ok(
            joinerSnapshot.missing && typeof joinerSnapshot.missing === 'object',
            'missing snapshot entry should include missing object',
          );
          assert.ok(
            typeof joinerSnapshot.missing.reasonCode === 'string' &&
              /^[a-z0-9_]+$/.test(joinerSnapshot.missing.reasonCode) &&
              joinerSnapshot.missing.reasonCode.length <= 64,
            'missing.reasonCode should be a bounded machine-readable identifier',
          );
          return true;
        },
      );
    });

  it('captures saturation counters in strict failure artifacts',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictWritePressure: true,
            writePressureThresholds: {
              maxAttemptedWrites: 10,
            },
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                        controlPlaneWrites: {
                          attempted: 50,
                          coalesced: 0,
                          unchangedSkipped: 0,
                          failed: 0,
                          timeouts: 0,
                        },
                        distinctErrors: [
                          'CDC forward to leader failed: Message timeout',
                          'system table query timeout while probing readiness',
                        ],
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([{
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM tables')) {
              return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
            }
            if (statement.startsWith('UPDATE partitions SET table_name')) {
              return {rows: [], changes: 1};
            }
            if (statement.includes('FROM partitions')) {
              return {rows: [{partition_id: 'p1'}]};
            }
            return {rows: []};
          },
        }]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        (error) => {
          const saturation = error?.diagnostics?.failure?.saturation;
          assert.ok(
            saturation && typeof saturation === 'object',
            'failure artifact should include saturation object',
          );
          assert.ok(
            saturation.cdcForwardTimeoutCount > 0,
            'saturation should include CDC forward timeout count',
          );
          assert.ok(
            saturation.systemTableQueryTimeoutCount > 0,
            'saturation should include system-table query timeout count',
          );
          return true;
        },
      );
    });

  it('includes per-poll readiness snapshots and reason transitions in strict failure timeline',
    async () => {
      const {cluster} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: Number.MAX_SAFE_INTEGER,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const readinessTimeline = error?.diagnostics?.failure?.readinessTimeline;
          assert.ok(
            Array.isArray(readinessTimeline) && readinessTimeline.length > 0,
            'failure artifact should include non-empty readiness timeline',
          );
          assert.ok(
            readinessTimeline.some((entry) => entry?.type === 'poll_snapshot'),
            'timeline should include per-poll readiness snapshots',
          );
          assert.ok(
            readinessTimeline.some((entry) => entry?.type === 'reason_transition'),
            'timeline should include reason transitions',
          );
          return true;
        },
      );
    });

  it('emits strict readiness reason transitions only when reason signatures change',
    async () => {
      const {cluster} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: Number.MAX_SAFE_INTEGER,
        quiescentTimeoutMs: 120,
      });

      await assert.rejects(
        run(cluster),
        (error) => {
          const readinessTimeline = error?.diagnostics?.failure?.readinessTimeline;
          assert.ok(
            Array.isArray(readinessTimeline) && readinessTimeline.length > 0,
            'failure artifact should include readiness timeline',
          );
          const seedTransitions = readinessTimeline.filter((entry) =>
            entry?.type === 'reason_transition' &&
              entry?.nodeId === 'seed-1');
          assert.equal(
            seedTransitions.length,
            1,
            'seed should emit one reason transition when readiness reasons stay stable',
          );
          return true;
        },
      );
    });

  it('enters and exits strict benchmark quiet mode across lifecycle phases',
    async () => {
      const {cluster} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: 2,
        quiescentTimeoutMs: 600,
      });

      const result = await run(cluster);
      const quietMode = result.details?.benchmark?.quietMode;
      assert.equal(
        quietMode?.enabled,
        true,
        'strict benchmark run should enable quiet mode',
      );
      assert.ok(
        Array.isArray(quietMode?.lifecycle) &&
          quietMode.lifecycle.length >= 2,
        'quiet mode should record lifecycle events',
      );
      assert.ok(
        quietMode.lifecycle.some((event) =>
          event?.action === QUIET_MODE_ACTION_ENTER &&
          event?.phase === QUIET_MODE_PHASE_PRE_FLIGHT),
        'quiet mode should enter at pre-flight',
      );
      assert.ok(
        quietMode.lifecycle.some((event) =>
          event?.action === QUIET_MODE_ACTION_EXIT &&
          event?.phase === QUIET_MODE_PHASE_TEARDOWN),
        'quiet mode should exit at teardown',
      );
    });

  it('emits quiet-mode lifecycle fields in benchmark details for strict runs',
    async () => {
      const {cluster} = buildVersionedConvergenceBarrierCluster({
        joinerLagPolls: 1,
        quiescentTimeoutMs: 600,
      });

      const result = await run(cluster);
      const quietMode = result.details?.benchmark?.quietMode;
      assert.equal(
        quietMode?.status,
        'inactive',
        'quiet mode status should be inactive after scenario teardown',
      );
      assert.ok(
        Number.isFinite(quietMode?.enteredAtMs) &&
          Number.isFinite(quietMode?.exitedAtMs),
        'quiet mode details should include enter and exit timestamps',
      );
      assert.ok(
        quietMode.exitedAtMs >= quietMode.enteredAtMs,
        'quiet mode exit timestamp should not precede enter timestamp',
      );
    });

  it('emits unified failure artifact fields on strict pre-load readiness failure',
    async () => {
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictPreloadReadiness: true,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(run(cluster), (error) => {
        const failure = error?.diagnostics?.failure;
        assert.equal(
          typeof failure?.rootCauseClass,
          'string',
          'failure artifact should include rootCauseClass',
        );
        assert.equal(
          typeof failure?.phase,
          'string',
          'failure artifact should include phase',
        );
        assert.ok(
          Array.isArray(failure?.affectedNodeIds),
          'failure artifact should include affectedNodeIds array',
        );
        assert.equal(
          failure?.reasonCounts && typeof failure.reasonCounts,
          'object',
          'failure artifact should include reasonCounts object',
        );
        return true;
      });
    });

  it('tolerates repeated transient table probe errors before SUT load',
    async () => {
      const loadCalls = [];
      let joinerTableProbeCount = 0;
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const sharedNodes = ['seed-1', 'joiner-1'];
      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            return {rows: []};
          }
          if (statement.includes('FROM tables')) {
            return {
              rows: [{
                table_id: 'tbl-benchmark',
                updated_at: 1740589945123,
              }],
            };
          }
          if (statement.startsWith(
            'UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _opts = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                nodes: sharedNodes,
              })],
            };
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            joinerTableProbeCount += 1;
            if (joinerTableProbeCount <= 5) {
              throw new Error(
                'Table not found: benchmark_events',
              );
            }
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _opts = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                nodes: sharedNodes,
              })],
            };
          }
          return this.query(sql, params);
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 300,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await run(cluster);
      assert.ok(
        joinerTableProbeCount >= 6,
        'pre-load gate should keep retrying transient table probe failures',
      );
      assert.deepEqual(
        loadCalls[0],
        ['seed-1', 'joiner-1'],
        'sut load should proceed after transient table probe failures recover',
      );
    });

  it('fails preflight when no discovered node reaches table visibility',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
          }
          return {rows: []};
        },
      };
      const laggingNode = {
        id: 'joiner-2',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
          }
          return {rows: []};
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 200,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode, laggingNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        (error) => {
          assert.match(
            error?.message || '',
            /No discovered admin-ready load service nodes available for benchmark load/i,
          );
          assert.equal(
            error?.diagnostics?.failedPhase?.phase,
            'preflight',
            'table-visibility admission failures should stop in preflight',
          );
          assert.equal(
            error?.diagnostics?.failedPhase?.artifacts?.phaseProgress?.
              lastProgressEvent?.details?.reachableNodeCount,
            0,
            'failure diagnostics should retain the zero reachable-node admission snapshot',
          );
          return true;
        },
      );
      assert.equal(
        loadCalls.length,
        0,
        'scenario should not run SUT load when no selected node passes pre-load gate',
      );
    });

  it('fails pre-load gate when quiescence cannot confirm in-flight drain',
    async () => {
      const loadCalls = [];
      let inFlightProbeCount = 0;
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM replica_operations') &&
            statement.includes('status NOT IN')) {
            inFlightProbeCount++;
            if (inFlightProbeCount === 1) {
              return {rows: []};
            }
            throw new Error('connection timed out');
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            inFlightProbeCount++;
            if (inFlightProbeCount === 1) {
              return {
                rows: [buildControlSnapshotPayload(this.id, {
                  replicaOperations: {
                    inFlightCount: 1,
                    statusHistogram: {creating: 1},
                  },
                })],
              };
            }
            throw new Error('connection timed out');
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            throw new Error('connection timed out');
          }
          return this.query(sql, params);
        },
      };
      const laggingNode = {
        id: 'joiner-2',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            throw new Error('Table not found: benchmark_events');
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            throw new Error('connection timed out');
          }
          return this.query(sql, params);
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 80,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode, laggingNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        run(cluster),
        /SUT load nodes did not reach quiescent state/i,
      );
      assert.ok(
        inFlightProbeCount > 1,
        'scenario should continue polling after initial successful in-flight probe',
      );
      assert.equal(
        loadCalls.length,
        0,
        'scenario should not run SUT load when quiescence cannot be proven',
      );
    });

  it('fails pre-load gate early when quiescence makes no progress', async () => {
    const loadCalls = [];
    let inFlightProbeCount = 0;
    const benchmarkTableProbeSql =
      'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
    const provider = {
      createContainer: async (_options) => ({
        containerId: 'benchmark-postgres-1',
        ip: '172.18.0.80',
        name: 'benchmark-postgres-1',
      }),
      execInContainer: async (_containerId, cmd) => {
        const command = String(cmd[2] || '');
        if (command.includes('pg_isready')) {
          return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
        }
        if (command.includes('pg_stat_replication')) {
          return {exitCode: 0, stdout: '0\n', stderr: ''};
        }
        return {exitCode: 0, stdout: '', stderr: ''};
      },
      stopContainer: async () => {},
      removeContainer: async () => {},
    };

    const seedNode = {
      id: 'seed-1',
      role: 'seed',
      query: async (sql) => {
        const statement = String(sql);
        if (statement === 'SELECT 1') {
          return {rows: [{value: 1}]};
        }
        if (statement === benchmarkTableProbeSql) {
          return {rows: [{count: 0}]};
        }
        if (statement.includes('FROM tables')) {
          return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
        }
        if (statement.startsWith('UPDATE partitions SET table_name')) {
          return {rows: [], changes: 1};
        }
        if (statement.includes('FROM partitions')) {
          return {rows: [{partition_id: 'p1'}]};
        }
        return {rows: []};
      },
      queryWithTimeout: async function(sql, params = [], _options = {}) {
        if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
          inFlightProbeCount++;
          return {
            rows: [buildControlSnapshotPayload(this.id, {
              replicaOperations: {
                inFlightCount: 5,
                statusHistogram: {creating: 5},
              },
            })],
          };
        }
        return this.query(sql, params);
      },
    };

    const cluster = {
      _config: {
        benchmark: {
          baselineImage: 'postgres:16',
          durationSeconds: 5,
          clients: 2,
          jobs: 1,
          loadOpsPerSec: 40,
          loadDuration: '5s',
          loadMaxInFlight: 64,
          tableName: 'benchmark_events',
          replicationFactor: 1,
          syncReplicaAcks: 0,
          quiescentTimeoutMs: 500,
          quiescentPollIntervalMs: 5,
          quiescentStableWindowMs: 0,
          quiescentNoProgressTimeoutMs: 20,
        },
        convergence: {
          settleTimeoutMs: 1000,
          quietWindowMs: 100,
          targetVoterCount: 3,
        },
        resourceLimits: {
          memory: '1g',
          cpus: '1.0',
        },
        timeouts: {
          nodeStartup: 1000,
        },
      },
      _scenarioOverrides: {
        postgresBaselineComparison: {
          createPostgresPool: () => ({
            query: async () => ({rows: []}),
            end: async () => {},
          }),
          createLoadGenerator: (nodes) => {
            loadCalls.push(nodes.map((node) => node.id));
            return {
              start: () => ({
                waitComplete: async () => ({
                  total: 10,
                  success: 10,
                  failed: 0,
                  errors: 0,
                  opsPerSec: 10,
                  latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                }),
              }),
            };
          },
        },
      },
      _providers: [provider],
      _hostAssignment: [0],
      _networkName: 'test-net',
      getNodes: () => asNodeHandles([seedNode]),
      waitForConvergence: async () => ({settledAfterMs: 1}),
      assertConsistency: async () => {},
    };

    await assert.rejects(
      run(cluster),
      (error) => {
        assert.match(error?.message || '', /gate aborted due to stalled progress/i);
        assert.equal(
          error?.diagnostics?.noProgress?.reasonCode,
          'stalled_no_progress',
          'no-progress failures should carry dedicated diagnostics',
        );
        assert.equal(
          error?.diagnostics?.noProgress?.phase,
          'pre_load_gate',
          'no-progress diagnostics should identify the failed phase',
        );
        assert.equal(
          error?.diagnostics?.noProgress?.failedNoProgress?.details?.budgetMs,
          20,
          'no-progress diagnostics should include the active budget',
        );
        return true;
      },
    );
    assert.ok(
      inFlightProbeCount >= 2,
      'scenario should sample quiescence multiple times before aborting',
    );
    assert.ok(
      inFlightProbeCount < 30,
      'scenario should fail fast instead of exhausting full timeout budget',
    );
    assert.equal(
      loadCalls.length,
      0,
      'scenario should not start load when quiescence is stalled',
    );
  });

  it('fails degraded preload fallback when soft stall candidates still fail load-lane revalidation',
    async () => {
      const loadCalls = [];
      let inFlightProbeCount = 0;
      let tableProbeCount = 0;
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            tableProbeCount += 1;
            if (tableProbeCount === 1) {
              return {rows: [{count: 0}]};
            }
            throw new Error(
              'Distributed operation failed due to participant failures',
            );
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            inFlightProbeCount += 1;
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: this.id},
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
              })],
            };
          }
          return this.query(sql, params);
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            strictDiscovery: false,
            allowPreloadStallSoftFallback: true,
            requiredSutLoadNodeCount: 1,
            quiescentTimeoutMs: 500,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            quiescentNoProgressTimeoutMs: 20,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              return {
                start: () => ({
                  waitComplete: async () => ({
                    total: 10,
                    success: 10,
                    failed: 0,
                    errors: 0,
                    opsPerSec: 10,
                    latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                  }),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await assert.rejects(
        () => run(cluster),
        (error) => {
          assert.match(
            String(error?.message || ''),
            /degraded pre-load fallback produced no strict load-admissible nodes/,
            'soft stall fallback should fail when degraded candidates still fail load-lane revalidation',
          );
          assert.equal(
            error?.diagnostics?.failedPhase?.artifacts?.mode,
            'degraded_soft_stall_fallback',
            'failure diagnostics should preserve degraded pre-load gate mode',
          );
          return true;
        },
      );
      assert.equal(
        loadCalls.length,
        0,
        'soft stall fallback should not start load when degraded candidates fail revalidation',
      );
      assert.ok(
        inFlightProbeCount >= 2,
        'soft stall fallback should still exercise quiescence polling before failing',
      );
    });

  it('treats replica operation timeline movement as preload progress',
    async () => {
      const loadCalls = [];
      let inFlightProbeCount = 0;
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            inFlightProbeCount += 1;
            const timelineTimestampMs = 1000 + (inFlightProbeCount * 5);
            const inFlightCount = inFlightProbeCount < 6 ? 2 : 0;
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                replicaOperations: {
                  inFlightCount,
                  statusHistogram: inFlightCount > 0 ?
                    {creating: inFlightCount} :
                    {},
                  operationTimelineById: inFlightCount > 0 ?
                    {
                      'op-move-1': [{
                        eventType: 'state',
                        operationId: 'op-move-1',
                        step: 'CREATE_REPLICA',
                        status: 'creating',
                        timestampMs: timelineTimestampMs,
                        inFlight: true,
                      }],
                    } :
                    {},
                },
              })],
            };
          }
          return this.query(sql, params);
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 500,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            quiescentNoProgressTimeoutMs: 20,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              return {
                start: () => ({
                  waitComplete: async () => ({
                    total: 10,
                    success: 10,
                    failed: 0,
                    errors: 0,
                    opsPerSec: 10,
                    latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                  }),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.equal(result.loadMetrics?.failed, 0);
      assert.ok(
        inFlightProbeCount >= 6,
        'quiescence gate should sample until in-flight operations drain',
      );
      assert.equal(
        loadCalls.length,
        2,
        'scenario should execute SUT and baseline load after preload gate',
      );
    });

  it('does not abort preload gate while in-flight operations stay within ' +
    'their timeout budget', async () => {
      const loadCalls = [];
      let inFlightProbeCount = 0;
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            inFlightProbeCount += 1;
            const inFlightCount = inFlightProbeCount < 7 ? 1 : 0;
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                replicaOperations: {
                  inFlightCount,
                  statusHistogram: inFlightCount > 0 ?
                    {removing: inFlightCount} :
                    {},
                  operationTimelineById: inFlightCount > 0 ?
                    {
                      'op-removing-1': [{
                        eventType: 'state',
                        operationId: 'op-removing-1',
                        step: 'STOPPING',
                        status: 'removing',
                        timestampMs: 1000,
                        inFlight: true,
                        ageMs: inFlightProbeCount * 5,
                        timeoutMs: 200,
                        staleTimeout: false,
                      }],
                    } :
                    {},
                },
              })],
            };
          }
          return this.query(sql, params);
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            quiescentTimeoutMs: 500,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
            quiescentNoProgressTimeoutMs: 20,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              return {
                start: () => ({
                  waitComplete: async () => ({
                    total: 10,
                    success: 10,
                    failed: 0,
                    errors: 0,
                    opsPerSec: 10,
                    latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                  }),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      const result = await run(cluster);
      assert.equal(result.loadMetrics?.failed, 0);
      assert.ok(
        inFlightProbeCount >= 7,
        'gate should keep polling until in-flight operations drain',
      );
      assert.equal(
        loadCalls.length,
        2,
        'scenario should continue once in-flight operations settle',
      );
    });

  it('uses alternate snapshot node when seed snapshot lane is timing out',
    async () => {
      const loadCalls = [];
      const benchmarkTableProbeSql =
        'SELECT count(*) FROM benchmark_events WHERE 1 = 0';
      const provider = {
        createContainer: async (_options) => ({
          containerId: 'benchmark-postgres-1',
          ip: '172.18.0.80',
          name: 'benchmark-postgres-1',
        }),
        execInContainer: async (_containerId, cmd) => {
          const command = String(cmd[2] || '');
          if (command.includes('pg_isready')) {
            return {exitCode: 0, stdout: 'accepting connections', stderr: ''};
          }
          if (command.includes('pg_stat_replication')) {
            return {exitCode: 0, stdout: '0\n', stderr: ''};
          }
          return {exitCode: 0, stdout: '', stderr: ''};
        },
        stopContainer: async () => {},
        removeContainer: async () => {},
      };

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          if (statement.includes('FROM tables')) {
            return {rows: [{table_id: 'tbl-benchmark', updated_at: 1740589945123}]};
          }
          if (statement.startsWith('UPDATE partitions SET table_name')) {
            return {rows: [], changes: 1};
          }
          if (statement.includes('FROM partitions')) {
            return {rows: [{partition_id: 'p1'}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            throw new Error('seed snapshot timed out');
          }
          return this.query(sql, params);
        },
      };
      const joinerNode = {
        id: 'joiner-1',
        role: 'joiner',
        query: async (sql) => {
          const statement = String(sql);
          if (statement === 'SELECT 1') {
            return {rows: [{value: 1}]};
          }
          if (statement === benchmarkTableProbeSql) {
            return {rows: [{count: 0}]};
          }
          return {rows: []};
        },
        queryWithTimeout: async function(sql, params = [], _options = {}) {
          if (String(sql) === NODE_CLIENT_CONTROL_SNAPSHOT_SQL) {
            return {
              rows: [buildControlSnapshotPayload(this.id, {
                leaders: {p1: 'seed-1'},
                replicaOperations: {
                  inFlightCount: 0,
                  statusHistogram: {},
                },
              })],
            };
          }
          return this.query(sql, params);
        },
      };

      const cluster = {
        _config: {
          benchmark: {
            baselineImage: 'postgres:16',
            durationSeconds: 5,
            clients: 2,
            jobs: 1,
            loadOpsPerSec: 40,
            loadDuration: '5s',
            loadMaxInFlight: 64,
            tableName: 'benchmark_events',
            replicationFactor: 1,
            syncReplicaAcks: 0,
            readyTimeoutMs: 150,
            readyPollIntervalMs: 5,
            quiescentTimeoutMs: 120,
            quiescentPollIntervalMs: 5,
            quiescentStableWindowMs: 0,
          },
          convergence: {
            settleTimeoutMs: 1000,
            quietWindowMs: 100,
            targetVoterCount: 3,
          },
          resourceLimits: {
            memory: '1g',
            cpus: '1.0',
          },
          timeouts: {
            nodeStartup: 1000,
          },
        },
        _scenarioOverrides: {
          postgresBaselineComparison: {
            createPostgresPool: () => ({
              query: async () => ({rows: []}),
              end: async () => {},
            }),
            createLoadGenerator: (nodes) => {
              loadCalls.push(nodes.map((node) => node.id));
              const isBaselineLoad =
                String(nodes?.[0]?.id || '').startsWith(
                  'postgres-baseline-load-node-',
                );
              return {
                start: () => ({
                  waitComplete: async () => (
                    isBaselineLoad ?
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 100,
                        latency: {avg: 1, p50: 1, p95: 2, p99: 2},
                      } :
                      {
                        total: 100,
                        success: 100,
                        failed: 0,
                        errors: 0,
                        opsPerSec: 50,
                        latency: {avg: 4, p50: 3, p95: 6, p99: 7},
                      }
                  ),
                }),
              };
            },
          },
        },
        _providers: [provider],
        _hostAssignment: [0],
        _networkName: 'test-net',
        getNodes: () => asNodeHandles([seedNode, joinerNode]),
        waitForConvergence: async () => ({settledAfterMs: 1}),
        assertConsistency: async () => {},
      };

      await run(cluster);
      assert.ok(
        loadCalls.length >= 1,
        'scenario should proceed to load phase when alternate snapshot node is available',
      );
    });

});
