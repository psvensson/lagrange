// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStrictPreloadNodeReasonSummary,
} from '../../scenarios/postgres-baseline-diagnostics.js';

describe('postgres-baseline-diagnostics', () => {
  it('builds strict preload reason code and stale age summaries', () => {
    const gateResult = {
      reasonHistogram: {
        ['node_probe_error:seed-1=' +
          'discovery_not_ready:topology_not_ready|schema_version_unknown|' +
          'discovery_reasons=schema_table_missing=table benchmark_events not found&' +
          'replica_operation_stale_timeout=op-1:ADD:pending:PENDING:' +
          'ageMs=246157:timeoutMs=30000']: 2,
        ['node_probe_error:seed-2=' +
          'discovery_not_ready:schema_version_lag|probe_error=timeout']: 1,
      },
    };

    const summary = buildStrictPreloadNodeReasonSummary(gateResult);

    assert.deepEqual(summary.reasonCodeHistogram, {
      topology_not_ready: 2,
      schema_version_unknown: 2,
      schema_table_missing: 2,
      replica_operation_stale_timeout: 2,
      schema_version_lag: 1,
      probe_error: 1,
    });
    assert.deepEqual(summary.staleReplicaOperationAgeBuckets, {
      gte_120s: 2,
    });
  });
});
