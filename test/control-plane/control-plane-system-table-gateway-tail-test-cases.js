export function registerControlPlaneSystemTableGatewayTailTests({
  test,
  TABLES,
  SystemTableCache,
  PressureGovernor,
  PRESSURE_WORK_CLASS,
  ControlPlaneSystemTableGateway,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CDC_OPERATION,
  METRICS_LOG_TAG,
  GATEWAY_ROUTING_GAP_OWNER_MISSING,
  GATEWAY_ROUTING_IDENTITY_MISSING,
  GATEWAY_REPLACE_PENDING_SERVICE_KEY,
  GATEWAY_MUTATION_STATUS_CREATING,
  GATEWAY_MUTATION_STATUS_ACTIVE,
  GATEWAY_EXPECTED_FAILURE_MESSAGE,
  GATEWAY_FAILURE_PRIMARY_REASON,
  GATEWAY_FAILURE_DISTRIBUTED_PARTICIPANT_CODE,
  GATEWAY_FAILURE_RECONNECT_MESSAGE,
}) {
  test('ControlPlaneSystemTableGateway submitMutation defers background writes ' +
    'while authority establishment is still pending', async (t) => {
    let updateCallCount = 0;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
                true,
            },
            reasons: [],
            retryAfterMs: 125,
            runtimeAuthority: {
              state: 'establishing',
              authorityAvailable: true,
              ready: false,
              visibility: {
                state: 'pending_publication',
              },
              reasonCodes: ['publication_epoch_pending'],
            },
            priorityControlPlaneRecovery: {
              active: true,
              reasonCodes: ['publication_epoch_pending'],
            },
          };
        },
      },
      cdcIntegrationService: {
        async updateSystemTableRow() {
          updateCallCount += 1;
          return {success: true};
        },
      },
    });

    const result = await gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: 'active'},
    }, {
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      allowPressureDefer: true,
    });

    t.equal(updateCallCount, 0, 'gateway should defer before CDC execution');
    t.equal(result.success, false, 'deferred background writes should fail closed');
    t.equal(
      result.outcome,
      CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
      'gateway should preserve the canonical deferred outcome',
    );
    t.equal(
      result.error,
      'query_admission_deferred',
      'gateway should surface one canonical defer error',
    );
    t.equal(result.contractState, 'deferred');
    t.equal(result.nextAction, 'retry');
    t.same(
      result.reasonCodes,
      ['publication_epoch_pending'],
      'gateway should preserve authority-establishment reason codes',
    );
    t.equal(
      result.runtimeAuthority?.state,
      'establishing',
      'gateway should preserve compact runtime authority state',
    );
  });

  test('ControlPlaneSystemTableGateway submitMutation centralizes write ingress',
    async (t) => {
      const updateCalls = [];
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'node-gateway',
        cdcIntegrationService: {
          async updateSystemTableRow(tableName, whereClause, data, options) {
            updateCalls.push({tableName, whereClause, data, options});
            return {success: true};
          },
        },
      });

      const mutation = {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: {service_id: 'svc-1'},
        data: {status: 'active'},
      };
      const options = {
        allowPendingVisibility: true,
        workClass: 'background',
        allowPressureDefer: true,
        coalescingKey: 'services:svc-1',
      };
      await gateway.submitMutation(mutation, options);
      await gateway.submitMutation(mutation, options);

      t.equal(updateCalls.length, 2, 'central mutation ingress should delegate each submitted mutation once');
      t.same(
        updateCalls[0].whereClause,
        {service_id: 'svc-1'},
        'central mutation ingress should preserve the where clause',
      );
      t.equal(
        updateCalls[0].options.coalescingKey,
        'services:svc-1',
        'central mutation ingress should preserve gateway write options',
      );
      t.equal(
        updateCalls[0].options.allowPendingVisibility,
        true,
        'central mutation ingress should preserve pending-visibility semantics',
      );
      t.type(
        updateCalls[0].options.recoveryCandidateSelectionKey,
        'string',
        'central mutation ingress should forward one stable widened-routing selection key',
      );
      t.equal(
        updateCalls[0].options.recoveryCandidateSelectionKey,
        updateCalls[1].options.recoveryCandidateSelectionKey,
        'identical control-plane mutations should reuse the same widened-routing selection key',
      );
    });

  test('ControlPlaneSystemTableGateway submitMutation preserves workload-owned ' +
    'mutation defaults', async (t) => {
    const updateCalls = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      cdcIntegrationService: {
        async updateSystemTableRow(tableName, whereClause, data, options) {
          updateCalls.push({tableName, whereClause, data, options});
          return {success: true};
        },
      },
    });

    await gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SQL_TRANSACTIONS,
      whereClause: {transaction_id: 'tx-1'},
      data: {status: 'ACTIVE'},
    }, {
      workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION,
      skipCacheWait: true,
    });

    t.equal(updateCalls.length, 1, 'gateway should delegate one workload-owned mutation');
    t.equal(
      updateCalls[0].options.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION,
      'gateway should preserve the explicit mutation workload class',
    );
    t.equal(
      updateCalls[0].options.workClass,
      PRESSURE_WORK_CLASS.CRITICAL,
      'gateway should derive the workload-owned critical work class when callers omit it',
    );
    t.equal(
      updateCalls[0].options.allowPressureDefer,
      false,
      'gateway should derive the workload-owned no-defer contract when callers omit it',
    );
  });

  test('ControlPlaneSystemTableGateway submitMutation surfaces pending visibility outcomes',
    async (t) => {
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'node-gateway',
        cdcIntegrationService: {
          async updateSystemTableRow() {
            return {
              success: true,
              visibilityState: 'pending_visibility',
              authoritativeVisibilityConfirmed: true,
            };
          },
        },
      });

      const result = await gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: {service_id: 'svc-1'},
        data: {status: 'active'},
      });

      t.equal(
        result.outcome,
        CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
        'gateway should surface committed-but-not-yet-visible mutation outcomes explicitly',
      );
      t.equal(
        result.authoritativeVisibilityConfirmed,
        true,
        'gateway should preserve authoritative visibility confirmation details',
      );
      t.equal(result.contractState, 'pending');
      t.equal(result.nextAction, 'wait');
    });

  test('ControlPlaneSystemTableGateway submitMutation canonicalizes ' +
    'control_plane_publications upserts before delegating to CDC',
  async (t) => {
    const upsertCalls = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      cdcIntegrationService: {
        async upsertSystemTableRow(tableName, row) {
          upsertCalls.push({tableName, row});
          return {success: true};
        },
      },
    });

    await gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.CONTROL_PLANE_PUBLICATIONS,
      row: {
        publicationId: 'pub-1',
        publicationKind: 'cluster_membership',
        publicationEpoch: 7,
        publisherNodeId: 'node-a',
        publishedActiveNodeIds: ['node-a'],
        requiredAckNodeIds: ['node-a'],
        acknowledgedNodeIds: [],
        status: 'OPEN',
      },
    });

    t.equal(upsertCalls.length, 1, 'gateway should delegate one upsert');
    t.equal(
      upsertCalls[0].tableName,
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      'gateway should preserve the publication table name',
    );
    t.equal(
      upsertCalls[0].row.publication_id,
      'pub-1',
      'gateway should canonicalize the publication primary key',
    );
    t.same(
      upsertCalls[0].row.published_active_node_ids,
      ['node-a'],
      'gateway should canonicalize publication array fields',
    );
    t.equal(
      upsertCalls[0].row.status,
      'OPEN',
      'gateway should preserve publication status',
    );
  });

  test('ControlPlaneSystemTableGateway submitMutation falls back to SQL during ' +
    'bootstrap-scoped skip-cache-wait writes when CDC mutation helpers are unavailable',
  async (t) => {
    const sqlCalls = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      sqlQueryEngine: {
        async executeQuery(sql, params, options) {
          sqlCalls.push({sql, params, options});
          return {success: true, affectedRows: 1};
        },
      },
    });

    const result = await gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SERVICES,
      row: {
        service_id: 'svc-1',
        service_type: 'message_group',
        node_id: 'node-a',
        status: 'stopped',
      },
    }, {
      skipCacheWait: true,
      phaseScope: CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      deliveryPriority: 'critical',
    });

    t.equal(result.success, true, 'bootstrap fallback mutation should succeed');
    t.equal(result.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      'fallback mutation should still normalize as an applied write');
    t.equal(sqlCalls.length, 1, 'fallback should route through SQL once');
    t.match(
      sqlCalls[0].sql,
      /^INSERT OR REPLACE INTO services \(/,
      'fallback should emit an upsert statement for the system table',
    );
    t.same(
      sqlCalls[0].params,
      ['svc-1', 'message_group', 'node-a', 'stopped'],
      'fallback should preserve row values in statement order',
    );
    t.equal(
      sqlCalls[0].options.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'fallback should keep control-plane recovery routing semantics',
    );
  });

  test('ControlPlaneSystemTableGateway submitMutation still fails closed ' +
    'without CDC mutation helpers outside the explicit startup fallback',
  async (t) => {
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, affectedRows: 1};
        },
      },
    });

    await t.rejects(
      gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: {service_id: 'svc-1'},
        data: {status: 'active'},
      }),
      /requires cdcIntegrationService/,
      'steady-state writes should not silently bypass the CDC mutation owner',
    );
  });

  test('ControlPlaneSystemTableGateway supportsReadRows only when a readable ' +
    'backend is configured', async (t) => {
    const emptyGateway = new ControlPlaneSystemTableGateway();
    t.equal(
      emptyGateway.supportsReadRows(),
      false,
      'gateway without authoritative or SQL owner should not claim readability',
    );

    const authoritativeGateway = new ControlPlaneSystemTableGateway({
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead() {
          return {success: true, rows: []};
        },
      },
    });
    t.equal(
      authoritativeGateway.supportsReadRows(),
      true,
      'authoritative owner should make the gateway readable',
    );

    const sqlGateway = new ControlPlaneSystemTableGateway({
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: []};
        },
      },
    });
    t.equal(
      sqlGateway.supportsReadRows(),
      true,
      'SQL owner should make the gateway readable',
    );
  });

  test('ControlPlaneSystemTableGateway supportsMutationSubmission only when a ' +
    'mutation owner is configured', async (t) => {
    const emptyGateway = new ControlPlaneSystemTableGateway();
    t.equal(
      emptyGateway.supportsMutationSubmission(),
      false,
      'gateway without mutation owner should not claim write support',
    );

    const mutationGateway = new ControlPlaneSystemTableGateway({
      cdcIntegrationService: {
        async upsertSystemTableRow() {
          return {success: true};
        },
      },
    });
    t.equal(
      mutationGateway.supportsMutationSubmission(),
      true,
      'CDC mutation owner should make the gateway writable',
    );
  });

  test('ControlPlaneSystemTableGateway submitMutation replace_pending keeps ' +
    'only the newest pending mutation for one coalescing key', async (t) => {
    const updateCalls = [];
    const releaseUpdates = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      cdcIntegrationService: {
        async updateSystemTableRow(tableName, whereClause, data, options) {
          updateCalls.push({tableName, whereClause, data, options});
          await new Promise((resolve) => {
            releaseUpdates.push(resolve);
          });
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });

    const firstMutation = gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: 'creating'},
    }, {
      coalescingKey: 'services:svc-1',
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    });

    const secondMutation = gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: 'syncing'},
    }, {
      coalescingKey: 'services:svc-1',
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    });

    const thirdMutation = gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: 'active'},
    }, {
      coalescingKey: 'services:svc-1',
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    });

    await Promise.resolve();

    t.equal(updateCalls.length, 1, 'only the first write should start immediately');
    t.equal(
      gateway.getStats().retainedRequests.inFlightMutations,
      1,
      'gateway should retain one tracked in-flight mutation',
    );

    releaseUpdates.shift()();
    const firstResult = await firstMutation;
    const secondResult = await secondMutation;

    t.equal(
      secondResult.outcome,
      CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
      'superseded pending mutation should resolve as no_op',
    );
    t.equal(firstResult.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      'first mutation should still apply');

    await Promise.resolve();
    t.equal(updateCalls.length, 2, 'only the latest pending mutation should run next');
    t.same(
      updateCalls[1].data,
      {status: 'active'},
      'the newest pending mutation should replace the older pending mutation',
    );
    t.equal(
      gateway.getStats().metrics.mutationReplacePendingQueuedCount,
      2,
      'gateway should count queued replace_pending mutations',
    );
    t.equal(
      gateway.getStats().metrics.mutationReplacePendingSupersededCount,
      1,
      'gateway should count superseded pending mutations',
    );
    t.equal(
      gateway.getStats().metrics.maxObservedPendingReplaceMutationRequests,
      1,
      'gateway should keep at most one pending replacement per key',
    );

    releaseUpdates.shift()();
    const thirdResult = await thirdMutation;
    t.equal(thirdResult.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      'latest pending mutation should eventually apply');
  });

  test('ControlPlaneSystemTableGateway submitMutation replace_pending ' +
    'propagates queued execution failure without an unhandled rejection',
  async (t) => {
    const updateCalls = [];
    const releaseUpdates = [];
    const processUnhandledRejections = [];
    const onUnhandledRejection = (error) => {
      processUnhandledRejections.push(error);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    t.after(() => {
      process.off('unhandledRejection', onUnhandledRejection);
    });

    let shouldRejectQueuedMutation = false;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      cdcIntegrationService: {
        async updateSystemTableRow(tableName, whereClause, data, options) {
          updateCalls.push({tableName, whereClause, data, options});
          if (shouldRejectQueuedMutation) {
            throw new Error(GATEWAY_EXPECTED_FAILURE_MESSAGE);
          }
          await new Promise((resolve) => {
            releaseUpdates.push(resolve);
          });
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });

    const firstMutation = gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: GATEWAY_MUTATION_STATUS_CREATING},
    }, {
      coalescingKey: GATEWAY_REPLACE_PENDING_SERVICE_KEY,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    });

    const queuedMutation = gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: GATEWAY_MUTATION_STATUS_ACTIVE},
    }, {
      coalescingKey: GATEWAY_REPLACE_PENDING_SERVICE_KEY,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    });

    await Promise.resolve();
    shouldRejectQueuedMutation = true;

    releaseUpdates.shift()();
    const firstResult = await firstMutation;
    t.equal(firstResult.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      'first tracked mutation should still apply before the queued retry runs');

    let queuedMutationError = null;
    try {
      await queuedMutation;
    } catch (error) {
      queuedMutationError = error;
    }

    t.equal(
      queuedMutationError?.message,
      GATEWAY_EXPECTED_FAILURE_MESSAGE,
      'queued replacement mutation should reject through its deferred promise',
    );

    await Promise.resolve();
    await Promise.resolve();
    t.equal(
      processUnhandledRejections.length,
      0,
      'queued replacement failure should not surface as an unhandled rejection',
    );
    t.equal(updateCalls.length, 2, 'queued replacement mutation should still execute');
  });

  test('ControlPlaneSystemTableGateway submitMutation single-flights ' +
    'identical mutations in the gateway', async (t) => {
    const updateCalls = [];
    let releaseMutation = null;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      cdcIntegrationService: {
        async updateSystemTableRow(tableName, whereClause, data, options) {
          updateCalls.push({tableName, whereClause, data, options});
          await new Promise((resolve) => {
            releaseMutation = resolve;
          });
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });

    const firstMutation = gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: 'active'},
    });
    const secondMutation = gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: 'active'},
    });

    await Promise.resolve();

    t.equal(updateCalls.length, 1,
      'identical gateway mutations should collapse to one in-flight write');

    releaseMutation();
    const [firstResult, secondResult] = await Promise.all([
      firstMutation,
      secondMutation,
    ]);
    t.same(firstResult, secondResult,
      'single-flighted mutations should resolve with the same result');
    t.equal(
      gateway.getStats().metrics.mutationSingleFlightJoinCount,
      1,
      'gateway should record one mutation single-flight join',
    );
    t.equal(
      gateway.getStats().metrics.maxObservedInFlightMutationRequests,
      1,
      'gateway should bound tracked in-flight mutation retention to one key here',
    );
  });

  test('ControlPlaneSystemTableGateway readRows disables SQL fallback under ' +
    'pressure degrade', async (t) => {
    let sqlFallbackUsed = false;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 64,
            maxPendingUtilization: 1,
          };
        },
      },
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead(
          _tableName,
          _sql,
          _params,
          options,
        ) {
          t.equal(
            options.allowSqlFallback,
            false,
            'pressure degrade should disable routed SQL fallback',
          );
          return {
            success: false,
            error: 'local authoritative row unavailable',
            rows: [],
          };
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlFallbackUsed = true;
          return {
            success: true,
            rows: [{node_id: 'node-a'}],
          };
        },
      },
    });

    const result = await gateway.readRows(
      TABLES.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-a'],
      {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      },
    );

    t.equal(sqlFallbackUsed, false, 'gateway should not issue routed SQL fallback');
    t.equal(result.success, false, 'degraded read should fail closed');
    t.equal(
      result.errorCode,
      'CONTROL_PLANE_PRESSURE_DEGRADED',
      'gateway should return a typed degraded result',
    );
  });

  test('ControlPlaneSystemTableGateway executeRead returns typed defer and ' +
    'reject outcomes under pressure', async (t) => {
    const cases = [
      {
        name: 'defer',
        options: {
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
          allowPressureDegrade: false,
          allowPressureDefer: true,
        },
        expectedOutcome: 'deferred',
        expectedAction: 'defer',
      },
      {
        name: 'reject',
        options: {
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
          allowPressureDegrade: false,
        },
        expectedOutcome: 'rejected',
        expectedAction: 'reject',
      },
    ];

    for (const testCase of cases) {
      let authoritativeCalls = 0;
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: `node-gateway-${testCase.name}`,
        messageRouter: {
          getOutboundPressureSummary() {
            return {
              backpressured: true,
              saturatedNodeCount: 1,
              totalPending: 64,
              maxPendingUtilization: 1,
            };
          },
        },
        cdcIntegrationService: {
          async executeAuthoritativeSystemTableRead() {
            authoritativeCalls++;
            return {
              success: true,
              rows: [{node_id: 'node-a'}],
            };
          },
        },
      });

      const result = await gateway.executeRead({
        tableName: TABLES.NODES,
        strategy: 'authoritative',
        sql: 'SELECT * FROM nodes WHERE node_id = ?',
        params: ['node-a'],
      }, testCase.options);

      t.equal(authoritativeCalls, 0,
        `${testCase.name}: pressure outcome should stop the authoritative read`);
      t.equal(result.success, false,
        `${testCase.name}: pressure outcome should fail closed`);
      t.equal(result.outcome, testCase.expectedOutcome,
        `${testCase.name}: gateway should expose the typed read outcome`);
      t.equal(result.pressureAction, testCase.expectedAction,
        `${testCase.name}: gateway should preserve the underlying pressure action`);
    }
  });

  test('ControlPlaneSystemTableGateway restricts bootstrap snapshot reads to ' +
    'explicit bootstrap/join phase scopes', async (t) => {
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      pressureGovernor: new PressureGovernor({
        nodeId: 'node-gateway',
      }),
    });

    const deniedResult = await gateway.executeRead({
      tableName: TABLES.NODES,
      strategy: 'bootstrap_snapshot',
      bootstrapSnapshotRows: [{node_id: 'node-a'}],
    });

    t.equal(deniedResult.success, false,
      'runtime callers should not read bootstrap snapshots without an explicit phase scope');
    t.equal(
      deniedResult.error,
      'bootstrap_snapshot_phase_scope_required',
      'bootstrap snapshot reads should fail closed without bootstrap/join scope',
    );

    const allowedResult = await gateway.executeRead({
      tableName: TABLES.NODES,
      strategy: 'bootstrap_snapshot',
      bootstrapSnapshotRows: [{node_id: 'node-a'}],
      phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN,
    });

    t.equal(allowedResult.success, true,
      'explicit join scope should allow bootstrap snapshot reads');
    t.equal(allowedResult.rows.length, 1,
      'bootstrap snapshot read should return supplied rows when scope is explicit');
  });

  test('ControlPlaneSystemTableGateway readRows single-flights identical ' +
    'control-plane reads', async (t) => {
    let releaseRead = null;
    let callCount = 0;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      pressureGovernor: {
        configure() {},
        evaluate() {
          return {
            action: 'allow',
            reason: 'test-allow',
            summary: null,
            retryAfterMs: 0,
          };
        },
      },
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead() {
          callCount++;
          await new Promise((resolve) => {
            releaseRead = resolve;
          });
          return {
            success: true,
            rows: [{node_id: 'node-a'}],
          };
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          throw new Error('should not fall back to raw SQL');
        },
      },
    });

    const firstRead = gateway.readRows(
      TABLES.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-a'],
    );
    const secondRead = gateway.readRows(
      TABLES.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-a'],
    );

    await Promise.resolve();

    t.equal(callCount, 1, 'identical authoritative reads should collapse in flight');

    releaseRead();
    const [firstResult, secondResult] = await Promise.all([firstRead, secondRead]);
    t.same(firstResult, secondResult, 'coalesced reads should share one result');
    t.equal(
      gateway.getStats().metrics.readSingleFlightJoinCount,
      1,
      'gateway should record one read single-flight join',
    );
    t.equal(
      gateway.getStats().metrics.maxObservedInFlightReadRequests,
      1,
      'gateway should keep one tracked read request for the shared key',
    );
  });

  test('ControlPlaneSystemTableGateway readRows preserves delivery priority ' +
    'in authoritative read execution', async (t) => {
    let callCount = 0;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      pressureGovernor: {
        configure() {},
        evaluate() {
          return {
            action: 'allow',
            reason: 'test-allow',
            summary: null,
            retryAfterMs: 0,
          };
        },
      },
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead(_tableName, _sql, _params, options) {
          callCount++;
          return {
            success: true,
            rows: [{node_id: 'node-a'}],
            deliveryPriority: options?.queryOptions?.deliveryPriority || null,
          };
        },
      },
    });

    const result = await gateway.readRows(
      TABLES.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-a'],
      {deliveryPriority: 'critical'},
    );

    t.equal(callCount, 1, 'gateway should execute one authoritative read');
    t.equal(
      result.deliveryPriority,
      'critical',
      'gateway should preserve delivery priority in authoritative read execution',
    );
  });

  test('ControlPlaneSystemTableGateway fallback diagnostics prefer the shared routing gap over stale partition leaders',
    async (t) => {
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'node-gateway',
        systemTableCache: {
          filter(tableName, predicate) {
            if (tableName === TABLES.PARTITIONS) {
              return [{
                partition_id: 'replica_operations-p1',
                table_name: TABLES.REPLICA_OPERATIONS,
                leader_node_id: 'stale-node',
              }].filter(predicate);
            }
            if (tableName === TABLES.SERVICES) {
              return [{
                partition_id: 'replica_operations-p1',
                service_type: 'partition',
                node_id: 'node-a',
                status: 'active',
                address: 'node-a/partition/replica_operations-p1-r1',
              }].filter(predicate);
            }
            return [];
          },
        },
        sqlQueryEngine: {
          queryExecutor: {
            getPartitionRoutingSnapshot(receivedPartitionId) {
              t.equal(
                receivedPartitionId,
                'replica_operations-p1',
                'gateway should consult the shared routing snapshot for fallback diagnostics',
              );
              return {
                partitionId: receivedPartitionId,
                canonicalLeaderIdentityState:
                  GATEWAY_ROUTING_IDENTITY_MISSING,
                canonicalLeaderRoutingGapState:
                  GATEWAY_ROUTING_GAP_OWNER_MISSING,
                serviceRowCount: 1,
                routableServiceCount: 1,
                deniedByNodeId: {},
              };
            },
          },
        },
      });

      const diagnostics =
        gateway.buildFallbackSystemTableRoutingDiagnostics(
          TABLES.REPLICA_OPERATIONS,
        );

      t.equal(
        diagnostics.leaderNodeId,
        undefined,
        'gateway should not leak a stale partition-row leader once the shared routing owner reports an owner gap',
      );
      t.equal(
        diagnostics.canonicalLeaderIdentityState,
        GATEWAY_ROUTING_IDENTITY_MISSING,
        'gateway should preserve the shared leader-identity state',
      );
      t.equal(
        diagnostics.canonicalLeaderRoutingGapState,
        GATEWAY_ROUTING_GAP_OWNER_MISSING,
        'gateway should preserve the shared leader-gap state',
      );
    });

  test('ControlPlaneSystemTableGateway readRows bounds tracked read retention ' +
    'and records bypass metrics', async (t) => {
    let firstRelease = null;
    let secondRelease = null;
    let callCount = 0;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      maxTrackedReadRequests: 1,
      pressureGovernor: {
        configure() {},
        evaluate() {
          return {
            action: 'allow',
            reason: 'test-allow',
            summary: null,
            retryAfterMs: 0,
          };
        },
      },
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead(_tableName, _sql, params) {
          callCount++;
          await new Promise((resolve) => {
            if (params[0] === 'node-a') {
              firstRelease = resolve;
              return;
            }
            secondRelease = resolve;
          });
          return {
            success: true,
            rows: [{node_id: params[0]}],
          };
        },
      },
    });

    const firstRead = gateway.readRows(
      TABLES.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-a'],
    );
    await Promise.resolve();
    const secondRead = gateway.readRows(
      TABLES.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-b'],
    );

    await Promise.resolve();

    const statsWhileBusy = gateway.getStats();
    t.equal(callCount, 2, 'second distinct read should bypass tracking at capacity');
    t.equal(
      statsWhileBusy.retainedRequests.inFlightReads,
      1,
      'gateway should retain only one tracked read request at the configured limit',
    );
    t.equal(
      statsWhileBusy.metrics.readTrackingBypassCount,
      1,
      'gateway should record one read-tracking bypass at capacity',
    );

    firstRelease();
    secondRelease();
    await Promise.all([firstRead, secondRead]);
  });

  test('ControlPlaneSystemTableGateway emits bounded retention diagnostics for ' +
    'in-flight work', async (t) => {
    const metricEvents = [];
    let releaseRead = null;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'retention-node',
      logger: {
        info(tag, data) {
          metricEvents.push({tag, data});
        },
      },
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead() {
          await new Promise((resolve) => {
            releaseRead = resolve;
          });
          return {
            success: true,
            rows: [{node_id: 'node-a'}],
          };
        },
      },
    });

    const readPromise = gateway.readRows(
      TABLES.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-a'],
    );
    await Promise.resolve();

    const retentionMetrics = metricEvents.filter((entry) => {
      return entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_RETENTION;
    });
    const busyMetric = retentionMetrics.find((entry) => {
      return entry.data?.retainedRequests?.inFlightReads === 1;
    }) || null;

    t.ok(busyMetric, 'retention diagnostics should include in-flight work');
    t.equal(
      busyMetric?.data?.retainedRequests?.total,
      1,
      'retention diagnostics should report total retained work',
    );
    t.equal(
      busyMetric?.data?.boundedByTrackedCapacity,
      true,
      'retention diagnostics should confirm bounded retention',
    );
    t.equal(
      busyMetric?.data?.retainedRequestCapacity,
      gateway.getStats().limits.maxTrackedReadRequests +
        gateway.getStats().limits.maxTrackedQueryRequests +
        gateway.getStats().limits.maxTrackedMutationRequests +
        gateway.getStats().limits.maxPendingReplaceMutationRequests,
      'retention diagnostics should expose tracked capacity',
    );

    releaseRead();
    await readPromise;

    const idleMetric = metricEvents.find((entry) => {
      return entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_RETENTION &&
        entry.data?.retainedRequests?.total === 0 &&
        entry.data?.maxObservedRetainedRequestCount >= 1;
    }) || null;
    t.ok(idleMetric, 'retention diagnostics should include the release back to idle');
  });

  test('ControlPlaneSystemTableGateway submitMutation rejects replace_pending ' +
    'work when tracked mutation capacity is exhausted', async (t) => {
    const updateCalls = [];
    const releaseUpdates = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      maxTrackedMutationRequests: 1,
      cdcIntegrationService: {
        async updateSystemTableRow(tableName, whereClause, data, options) {
          updateCalls.push({tableName, whereClause, data, options});
          await new Promise((resolve) => {
            releaseUpdates.push(resolve);
          });
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });

    const firstMutation = gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: 'syncing'},
    }, {
      coalescingKey: 'services:svc-1',
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    });

    await Promise.resolve();

    const secondResult = await gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-2'},
      data: {status: 'active'},
    }, {
      coalescingKey: 'services:svc-2',
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    });

    t.equal(updateCalls.length, 1, 'gateway should not retain a second tracked mutation');
    t.equal(secondResult.success, false, 'saturated tracked mutation should be rejected');
    t.equal(
      secondResult.outcome,
      CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
      'saturated tracked mutation should fail with a typed rejected outcome',
    );
    t.equal(secondResult.contractState, 'blocked');
    t.equal(secondResult.nextAction, 'stop');
    t.equal(
      gateway.getStats().metrics.mutationTrackingRejectedCount,
      1,
      'gateway should count mutation tracking saturation',
    );
    t.equal(
      gateway.getStats().retainedRequests.inFlightMutations,
      1,
      'gateway should keep tracked mutation retention at the configured bound',
    );

    releaseUpdates.shift()();
    const firstResult = await firstMutation;
    t.equal(firstResult.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      'first tracked mutation should still complete normally');
  });

  test('ControlPlaneSystemTableGateway executeQuery defers opted-in raw ' +
    'system-table reads under pressure', async (t) => {
    let sqlCalls = 0;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 64,
            maxPendingUtilization: 1,
          };
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlCalls++;
          return {
            success: true,
            rows: [{total_count: 0}],
          };
        },
      },
    });

    const result = await gateway.executeQuery(
      'SELECT * FROM replica_operations WHERE status = ?',
      ['pending'],
      {
        controlPlaneTableName: TABLES.REPLICA_OPERATIONS,
        controlPlaneOperationKind: 'read',
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: true,
        deliveryPriority: 'background',
      },
    );

    t.equal(result.success, false, 'background raw query should fail closed');
    t.equal(
      result.errorCode,
      'CONTROL_PLANE_PRESSURE_DEGRADED',
      'gateway should expose typed pressure admission failures',
    );
    t.equal(sqlCalls, 0, 'deferred raw reads should not hit routed SQL');
  });

  test('ControlPlaneSystemTableGateway resolves runtime dependencies through providers',
    async (t) => {
      let sqlQueryEngine = null;
      let authoritativeReads = 0;
      const cache = {
        getAll() {
          return [{node_id: 'node-a'}];
        },
      };
      const gateway = new ControlPlaneSystemTableGateway({
        getSqlQueryEngine: () => sqlQueryEngine,
        getCdcIntegrationService: () => ({
          sqlQueryEngine,
          async executeAuthoritativeSystemTableRead() {
            authoritativeReads += 1;
            return {
              success: true,
              rows: [{node_id: 'node-a'}],
            };
          },
        }),
        getSystemTableCache: () => cache,
      });

      t.equal(gateway.supportsReadRows(), true,
        'provider-backed cache should satisfy read support');

      sqlQueryEngine = {
        async executeQuery() {
          return {
            success: true,
            rows: [{service_id: 'svc-1'}],
          };
        },
      };

      const queryResult = await gateway.executeQuery(
        'SELECT * FROM services WHERE service_id = ?',
        ['svc-1'],
        {
          controlPlaneTableName: TABLES.SERVICES,
          controlPlaneOperationKind: 'read',
        },
      );
      t.equal(queryResult.success, true,
        'provider-backed SQL engine should execute raw system-table reads');

      const authoritativeResult = await gateway.readRows(
        TABLES.NODES,
        'SELECT * FROM nodes WHERE node_id = ?',
        ['node-a'],
      );
      t.equal(authoritativeResult.success, true,
        'provider-backed authoritative read owner should execute reads');
      t.equal(authoritativeReads, 1,
        'gateway should evaluate provider-backed authoritative owner once');
    });
}
