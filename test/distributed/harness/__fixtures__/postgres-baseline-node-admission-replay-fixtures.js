const RERUN_20260403T102148Z_REPORT_PATH =
  'test-output/reports/rerun-postgres-baseline-comparison-20260403T102148Z.report.json';

const RERUN_20260403T102148Z_NODE_ADMISSION_CASES = Object.freeze([
  Object.freeze({
    name: 'circuit-open probe keeps topology-only node soft',
    reportPath: RERUN_20260403T102148Z_REPORT_PATH,
    nodeId: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
    input: Object.freeze({
      nodeId: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
      adminReady: true,
      localReadiness: Object.freeze({
        requiresConfirmation: true,
        evaluation: Object.freeze({
          ready: false,
          hasAdmission: false,
          reasons: Object.freeze([
            'leadership_unstable=leader coverage incomplete for readiness scope',
            'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
          ]),
        }),
      }),
      loadLaneAttempted: true,
      loadLaneReadiness: Object.freeze({
        ready: false,
        reasons: Object.freeze([
          'load_probe_failed:NodeClient queryLoadProbe failed (node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7, channel=probe, timeoutClass=none, code=circuit_open): circuit breaker is open',
        ]),
      }),
      allowTopologyDeferredSelection: true,
    }),
    expectedState: 'topology_deferred',
    expectedReasons: Object.freeze([]),
  }),
  Object.freeze({
    name: 'operation-error probe keeps topology-only node soft',
    reportPath: RERUN_20260403T102148Z_REPORT_PATH,
    nodeId: '7493b0ab-a054-5fad-a91b-5e331db29304',
    input: Object.freeze({
      nodeId: '7493b0ab-a054-5fad-a91b-5e331db29304',
      adminReady: true,
      localReadiness: Object.freeze({
        requiresConfirmation: true,
        evaluation: Object.freeze({
          ready: false,
          hasAdmission: false,
          reasons: Object.freeze([
            'leadership_unstable=leader coverage incomplete for readiness scope',
            'schema_partition_unavailable=table "benchmark_events" not query-ready on node',
          ]),
        }),
      }),
      loadLaneAttempted: true,
      loadLaneReadiness: Object.freeze({
        ready: false,
        reasons: Object.freeze([
          'load_probe_failed:NodeClient queryLoadProbe failed (node=7493b0ab-a054-5fad-a91b-5e331db29304, channel=probe, timeoutClass=non_timeout, code=operation_error): Admin API query fai',
        ]),
      }),
      allowTopologyDeferredSelection: true,
    }),
    expectedState: 'topology_deferred',
    expectedReasons: Object.freeze([]),
  }),
]);

export {
  RERUN_20260403T102148Z_REPORT_PATH,
  RERUN_20260403T102148Z_NODE_ADMISSION_CASES,
};
