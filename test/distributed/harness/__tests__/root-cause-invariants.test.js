import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {buildRootCauseBundle} from '../root-cause-bundle.js';
import {ROOT_CAUSE_CLASS, ROOT_CAUSE_CODE} from '../root-cause-constants.js';

const SNAPSHOT_SCHEMA_VERSION = 1;

function buildPartitionSummary(overrides = {}) {
  return {
    leaderKnown: true,
    leaderNodeId: 'seed-1',
    isLeaderLocal: true,
    lastErrorCode: null,
    ...overrides,
  };
}

function buildPreflightSnapshot(nodeId, overrides = {}) {
  const normalizedNodeId = String(nodeId || 'unknown');
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    capturedAtMs: Date.now(),
    nodeId: normalizedNodeId,
    address: '127.0.0.1',
    routerConnectivity: {
      connectedCount: 0,
      reconnectingCount: 0,
      disconnectedCount: 0,
    },
    controlPlanePartitions: {
      nodes: buildPartitionSummary(),
      services: buildPartitionSummary(),
      node_endpoints: buildPartitionSummary(),
      service_endpoints: buildPartitionSummary(),
    },
    cdcHealth: {
      bufferDepth: 0,
      retryCount: 0,
      lastErrorCode: null,
      lastForwardAttemptAtMs: null,
    },
    cacheFreshness: {
      lastAppliedAtMs: null,
      appliedSchemaVersion: null,
      stalenessMs: null,
    },
    rowCounts: {
      sysPostgresWireServiceCount: 1,
      nodeEndpointsCount: 1,
      serviceEndpointsCount: 1,
    },
    discovery: {
      selectedNodeIds: [normalizedNodeId],
      excludedByNodeId: {},
    },
    ...overrides,
  };
}

describe('root-cause invariant attribution', () => {
  it('derives rootCauseCode from dominant invariant rather than downstream strict reason',
    () => {
      const failureArtifact = {
        schemaVersion: 1,
        phase: 'pre_load_gate',
        strictMode: true,
        rootCauseClass: 'discovery',
        dominantReason: ROOT_CAUSE_CODE.SCHEMA_VERSION_UNKNOWN,
        reasonCounts: {
          [ROOT_CAUSE_CODE.SCHEMA_VERSION_UNKNOWN]: 1,
        },
      };
      const snapshotsByNodeId = {
        'seed-1': buildPreflightSnapshot('seed-1', {
          controlPlanePartitions: {
            nodes: buildPartitionSummary(),
            services: buildPartitionSummary({
              leaderKnown: false,
              leaderNodeId: null,
              isLeaderLocal: false,
              lastErrorCode: 'leader_service_missing',
            }),
            node_endpoints: buildPartitionSummary(),
            service_endpoints: buildPartitionSummary(),
          },
        }),
      };

      const bundle = buildRootCauseBundle({
        failureArtifact,
        snapshotsByNodeId,
      });

      assert.ok(
        Array.isArray(bundle.invariants),
        'rootCauseBundle should include invariants[] array',
      );
      assert.equal(
        bundle.dominantInvariant,
        ROOT_CAUSE_CODE.LEADERSHIP_UNKNOWN_CONTROL_PLANE_PARTITION,
        'dominant invariant should drive classification',
      );
      assert.equal(
        bundle.rootCauseClass,
        ROOT_CAUSE_CLASS.LEADERSHIP,
        'rootCauseClass should map to dominant invariant class',
      );
      assert.equal(
        bundle.rootCauseCode,
        ROOT_CAUSE_CODE.LEADERSHIP_UNKNOWN_CONTROL_PLANE_PARTITION,
        'rootCauseCode should map to dominant invariant code',
      );
    });

  it('selects dominant invariant deterministically by precedence when multiple invariants fail',
    () => {
      const failureArtifact = {
        schemaVersion: 1,
        phase: 'pre_load_gate',
        strictMode: true,
        rootCauseClass: 'discovery',
        dominantReason: ROOT_CAUSE_CODE.SCHEMA_VERSION_UNKNOWN,
        reasonCounts: {
          [ROOT_CAUSE_CODE.SCHEMA_VERSION_UNKNOWN]: 1,
        },
      };
      const snapshotsByNodeId = {
        'seed-1': buildPreflightSnapshot('seed-1', {
          controlPlanePartitions: {
            nodes: buildPartitionSummary(),
            services: buildPartitionSummary({
              leaderKnown: false,
              leaderNodeId: null,
              isLeaderLocal: false,
              lastErrorCode: 'leader_service_missing',
            }),
            node_endpoints: buildPartitionSummary(),
            service_endpoints: buildPartitionSummary(),
          },
          rowCounts: {
            sysPostgresWireServiceCount: 0,
            nodeEndpointsCount: 0,
            serviceEndpointsCount: 0,
          },
          discovery: {
            selectedNodeIds: [],
            excludedByNodeId: {
              'seed-1': ['routing_not_ready'],
            },
          },
        }),
      };

      const bundle = buildRootCauseBundle({
        failureArtifact,
        snapshotsByNodeId,
      });

      assert.equal(
        bundle.dominantInvariant,
        ROOT_CAUSE_CODE.LEADERSHIP_UNKNOWN_CONTROL_PLANE_PARTITION,
        'dominant invariant should select highest-precedence failure',
      );
      assert.equal(
        bundle.rootCauseCode,
        ROOT_CAUSE_CODE.LEADERSHIP_UNKNOWN_CONTROL_PLANE_PARTITION,
      );
    });
});

