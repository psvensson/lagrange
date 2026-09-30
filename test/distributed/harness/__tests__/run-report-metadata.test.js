/**
 * Unit tests for the distributed runner's report metadata owner
 * (test/distributed/run-report-metadata.js).
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDistributedExecutionMetadata,
  buildReportMetadata,
  resolveRunRaftProvider,
} from '../../run-report-metadata.js';
import {
  DISTRIBUTED_EXECUTION_ENV,
  DISTRIBUTED_EXECUTION_TARGET,
  DISTRIBUTED_MATRIX_PROFILE,
} from '../constants.js';
import {
  SOURCE_FINGERPRINT_ALGORITHM,
} from '../../../../src/diagnostics/source-fingerprint.js';

describe('report metadata source fingerprint', () => {
  // Release verification binds a memory-soak report to the exact booted
  // source bytes through metadata.srcFingerprint; the report-metadata owner
  // stamps the run config's computed fingerprint on every written report.
  it('soak-report-carries-src-fingerprint: metadata stamps the run config ' +
    'srcFingerprint and algorithm, empty when no fingerprinted config exists',
  () => {
    const fingerprint = 'abcdef0123456789';
    const stamped = buildReportMetadata(
      {config: 'local.json', scenario: null},
      {
        raftProvider: 'liferaft',
        docker: {
          srcFingerprint: fingerprint,
          srcFingerprintAlgo: SOURCE_FINGERPRINT_ALGORITHM,
        },
      },
      {enabled: false},
    );
    assert.equal(stamped.srcFingerprint, fingerprint);
    assert.equal(stamped.srcFingerprintAlgo, SOURCE_FINGERPRINT_ALGORITHM);
    const unstamped = buildReportMetadata(
      {config: 'local.json', scenario: null},
      {raftProvider: 'liferaft'},
      {enabled: false},
    );
    assert.equal(unstamped.srcFingerprint, '');
    assert.equal(unstamped.srcFingerprintAlgo, '');
  });
});

describe('distributed execution metadata', () => {
  it('records target profile and physical hosts without adding a raft selector',
    () => {
      const metadata = buildDistributedExecutionMetadata({
        [DISTRIBUTED_EXECUTION_ENV.TARGET]:
          DISTRIBUTED_EXECUTION_TARGET.LAB,
        [DISTRIBUTED_EXECUTION_ENV.PROFILE]:
          DISTRIBUTED_MATRIX_PROFILE.TOPOLOGY,
        [DISTRIBUTED_EXECUTION_ENV.HOSTS]: 'lab-a,lab-b,lab-c',
        [DISTRIBUTED_EXECUTION_ENV.CONFIG]: 'local-three-node.json',
      });

      assert.equal(
        metadata.executionTarget,
        DISTRIBUTED_EXECUTION_TARGET.LAB,
      );
      assert.equal(
        metadata.matrixProfile,
        DISTRIBUTED_MATRIX_PROFILE.TOPOLOGY,
      );
      assert.deepEqual(metadata.executionHosts, [
        'lab-a',
        'lab-b',
        'lab-c',
      ]);
      assert.equal(metadata.matrixConfig, 'local-three-node.json');
      assert.equal(Object.hasOwn(metadata, 'raftProvider'), false);
    });
});

describe('run raft provider', () => {
  it('resolveRunRaftProvider prefers config over environment', () => {
    const fromConfig = resolveRunRaftProvider(
      {raftProvider: 'raft_logic'},
      {RAFT_PROVIDER: 'liferaft'},
    );
    assert.equal(fromConfig, 'raft_logic');

    const fromEnv = resolveRunRaftProvider(
      {},
      {RAFT_PROVIDER: 'raft_logic'},
    );
    assert.equal(fromEnv, 'raft_logic');

    const fallback = resolveRunRaftProvider({}, {});
    assert.equal(fallback, 'liferaft');
  });
});
