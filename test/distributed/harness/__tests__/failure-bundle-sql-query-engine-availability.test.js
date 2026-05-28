import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPublicationConvergenceSummary,
} from '../failure-bundle-diagnostics-artifact-builder.js';

const SQL_QUERY_ENGINE_AVAILABLE_REASON = 'sql_query_engine_available';
const SQL_QUERY_ENGINE_AVAILABILITY_TEST_NAME =
  'preserves active-gate SQL query engine availability diagnostics';
const SQL_QUERY_ENGINE_BOOLEAN_TEST_NAME =
  'preserves active-gate SQL query engine availability boolean diagnostics';

describe('failure-bundle SQL query engine availability diagnostics', () => {
  it(SQL_QUERY_ENGINE_AVAILABILITY_TEST_NAME, () => {
    const queryEngineAvailability = {
      state: 'available',
      reasonCode: SQL_QUERY_ENGINE_AVAILABLE_REASON,
      queryEngineAvailable: true,
    };
    const publicationConvergence = buildPublicationConvergenceSummary({
      activeGateSnapshotCoverage: {
        completeCoverage: false,
        selectedPublicationConvergence: {
          publicationStatus: 'PUBLISHED',
          queryEngineAvailable: true,
          queryEngineAvailability,
        },
      },
      activeGate: {
        progress: {
          expectedNodeCount: 2,
          activeNodeCount: 2,
          snapshotCoverageNodeCount: 1,
          snapshotCoverageComplete: false,
          publicationStatus: 'PUBLISHED',
          pendingAckCount: 0,
          missingPublishedCount: 0,
          blockers: ['snapshot_coverage_incomplete'],
        },
      },
    });

    assert.equal(publicationConvergence.queryEngineAvailable, true);
    assert.deepEqual(
      publicationConvergence.queryEngineAvailability,
      queryEngineAvailability,
    );
  });

  it(SQL_QUERY_ENGINE_BOOLEAN_TEST_NAME, () => {
    const publicationConvergence = buildPublicationConvergenceSummary({
      activeGate: {
        progress: {
          expectedNodeCount: 2,
          activeNodeCount: 2,
          snapshotCoverageNodeCount: 1,
          snapshotCoverageComplete: false,
          publicationStatus: 'PUBLISHED',
          queryEngineAvailable: false,
          pendingAckCount: 0,
          missingPublishedCount: 0,
          blockers: ['snapshot_coverage_incomplete'],
        },
      },
    });

    assert.equal(publicationConvergence.queryEngineAvailable, false);
    assert.equal(
      Object.hasOwn(publicationConvergence, 'queryEngineAvailability'),
      false,
    );
  });
});
