export function registerUnifiedRebalancerBudgetQueryGatewayTests(context) {
  const {
    CONTROL_PLANE_WORKLOAD_CLASS,
    createTestRebalancer,
    EntityType,
    initializeTestEnvironment,
    test,
  } = context;

  test('UnifiedRebalancer budget queries use injected control-plane ' +
  'system-table gateway', async (t) => {
    initializeTestEnvironment();

    const gatewayCalls = [];
    const rebalancer = createTestRebalancer({
      sqlQueryEngine: {
        async executeQuery() {
          throw new Error('raw SQL path should not be used');
        },
      },
      controlPlaneSystemTableGateway: {
        async executeQuery(sql, params, queryOptions) {
          gatewayCalls.push({sql, params, queryOptions});
          if (sql.includes('SELECT config_value FROM config')) {
            return {success: true, rows: [{config_value: '7'}]};
          }
          return {success: true, rows: [{total_count: 2}]};
        },
      },
    });

    const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
    const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();

    t.equal(configuredBudget, 7, 'gateway should provide config-backed budget');
    t.equal(inFlightCount, 2, 'gateway should provide in-flight count');
    t.equal(gatewayCalls.length, 2, 'gateway should own both budget reads');
    t.equal(
      gatewayCalls[0]?.queryOptions?.workClass,
      'background',
      'ordinary rebalancers should continue using background pressure class for budget reads',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY,
      'ordinary rebalancers should emit the shared background workload class',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.deliveryPriority,
      'background',
      'ordinary rebalancers should continue using background delivery for budget reads',
    );
  });

  test('UnifiedRebalancer budget queries stay critical for priority control-plane partitions', async (t) => {
    initializeTestEnvironment();

    const gatewayCalls = [];
    const rebalancer = createTestRebalancer({
      entityId: 'replica_operations-p1',
      entityType: EntityType.PARTITION,
      controlPlaneSystemTableGateway: {
        async executeQuery(sql, params, queryOptions) {
          gatewayCalls.push({sql, params, queryOptions});
          if (sql.includes('SELECT config_value FROM config')) {
            return {success: true, rows: [{config_value: '5'}]};
          }
          return {success: true, rows: [{total_count: 1}]};
        },
      },
    });

    const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
    const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();

    t.equal(configuredBudget, 5, 'gateway should provide config-backed budget');
    t.equal(inFlightCount, 1, 'gateway should provide in-flight count');
    t.equal(gatewayCalls.length, 2, 'gateway should own both budget reads');
    t.equal(
      gatewayCalls[0]?.queryOptions?.workClass,
      'critical',
      'priority control-plane partitions should bypass background pressure gating for budget reads',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY,
      'priority rebalancers should emit the shared priority workload class',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.deliveryPriority,
      'critical',
      'priority control-plane partitions should route budget reads at critical delivery priority',
    );
    t.equal(
      gatewayCalls[1]?.queryOptions?.workClass,
      'critical',
      'priority control-plane partitions should keep in-flight reads on the critical path',
    );
    t.equal(
      gatewayCalls[1]?.queryOptions?.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY,
      'priority in-flight reads should use the same shared workload class',
    );
    t.equal(
      gatewayCalls[1]?.queryOptions?.deliveryPriority,
      'critical',
      'priority control-plane partitions should route in-flight reads at critical delivery priority',
    );
  });
}
