function registerGatewayCausalTimeWitness({
  t,
  AdminServiceDiscovery,
  ReadOnlySystemTableCache,
  SystemTableCache,
  CDC_OPERATION,
  TABLES,
  ControlPlaneSystemTableGateway,
  withLeaderWitness,
  repairCauseId,
}) {
  t.test(
    'gateway receipt keeps leader causality separate from its local read clock',
    async (t) => {
      const leaderObservedAtMs = 100;
      const gatewayReadStartedAtMs = 10_000;
      const cache = new SystemTableCache();
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'node-reader-with-skew',
        systemTableCache: cache,
        now: () => gatewayReadStartedAtMs,
        cdcIntegrationService: {
          async executeAuthoritativeSystemTableRead() {
            return withLeaderWitness(
              {success: true, rows: []},
              TABLES.SERVICE_ENDPOINTS,
              leaderObservedAtMs,
            );
          },
        },
      });
      const discovery = new AdminServiceDiscovery({
        nodeId: 'node-reader-with-skew',
        systemTableCache: new ReadOnlySystemTableCache(cache),
        cacheMutationTarget: cache,
        controlPlaneSystemTableGateway: gateway,
        nowFn: () => gatewayReadStartedAtMs,
      });

      const authoritativeRead =
        await discovery.readAuthoritativeSystemTableRows(
          TABLES.SERVICE_ENDPOINTS,
          {nowMs: gatewayReadStartedAtMs, reason: 'control_snapshot'},
        );
      t.equal(
        authoritativeRead.authoritativeObservation.observedAtMs,
        leaderObservedAtMs,
        'the absence frontier remains the serving leader observation time',
      );
      t.equal(
        authoritativeRead.authoritativeObservation.readStartedAtMs,
        gatewayReadStartedAtMs,
        'the local read-start clock remains an independent race boundary',
      );
      await discovery.applyAuthoritativeSystemTableRows(
        TABLES.SERVICE_ENDPOINTS,
        authoritativeRead.rows,
        repairCauseId,
        {authoritativeObservation: authoritativeRead.authoritativeObservation},
      );

      const causallyNewerRow = {
        endpoint_id: 'endpoint-after-leader-observation',
        service_id: 'service-after-leader-observation',
        node_id: 'node-newer',
        updated_at: 200,
        updated_at_hlc: '200-0-owner',
      };
      cache.applySystemTableChange(
        TABLES.SERVICE_ENDPOINTS,
        CDC_OPERATION.UPSERT,
        causallyNewerRow,
        {causeId: 'cdc:newer-than-serving-leader-observation'},
      );
      t.equal(
        cache.has(TABLES.SERVICE_ENDPOINTS, causallyNewerRow.endpoint_id),
        true,
        'a CDC row newer than the serving leader observation is admitted',
      );
    },
  );
}

export {registerGatewayCausalTimeWitness};
