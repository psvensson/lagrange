import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {buildRootCauseBundle} from '../root-cause-bundle.js';
import {ROOT_CAUSE_CLASS, ROOT_CAUSE_CODE} from '../root-cause-constants.js';
import {
  INVARIANT_ID,
  INVARIANT_SEVERITY,
} from '../../../../src/invariants/invariant-catalog.js';

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
      const leadershipInvariant = bundle.invariants.find((invariant) =>
        invariant.code === ROOT_CAUSE_CODE.LEADERSHIP_UNKNOWN_CONTROL_PLANE_PARTITION,
      );
      assert.equal(
        leadershipInvariant?.invariantId,
        INVARIANT_ID.CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE,
        'catalog-backed invariant ID should be present',
      );
      assert.equal(
        leadershipInvariant?.severity,
        INVARIANT_SEVERITY.CRITICAL,
        'catalog-backed severity should be present',
      );
      assert.equal(
        leadershipInvariant?.owningSubsystem,
        'control-plane',
        'catalog-backed owning subsystem should be present',
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

  it('keeps failure-artifact classification when control snapshots are captured outside preflight',
    () => {
      const failureArtifact = {
        schemaVersion: 1,
        phase: 'verify',
        strictMode: true,
        rootCauseClass: ROOT_CAUSE_CLASS.LOAD,
        dominantReason: 'load run completed with operation errors',
        reasonCounts: {
          'load run completed with operation errors': 1,
        },
      };
      const snapshotsByNodeId = {
        'seed-1': {
          schemaVersion: 1,
          nodeId: 'seed-1',
          capturedAt: 1000,
          nodes: ['seed-1'],
          partitions: ['p1'],
          leaders: {p1: 'seed-1'},
          replicaOperations: {
            inFlightCount: 0,
            statusHistogram: {},
          },
          controlPlaneDiagnostics: {
            schemaVersion: 1,
            publicationMode: {
              currentMode: 'grouped',
              reasonCode: null,
            },
          },
        },
      };

      const bundle = buildRootCauseBundle({
        failureArtifact,
        snapshotsByNodeId,
        snapshotKind: 'control_snapshot',
        evaluateInvariants: false,
      });

      assert.equal(bundle.snapshotKind, 'control_snapshot');
      assert.equal(
        bundle.rootCauseClass,
        ROOT_CAUSE_CLASS.LOAD,
        'control-snapshot capture should not force preflight invariant classification',
      );
      assert.equal(
        bundle.rootCauseCode,
        ROOT_CAUSE_CODE.UNKNOWN,
        'control-snapshot capture should not inject preflight invariant reason codes',
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(bundle, 'invariants'),
        false,
        'invariants should not be attached when invariant evaluation is disabled',
      );
      assert.deepEqual(
        bundle.controlPlaneLedgerSnapshotsByNodeId,
        {
          'seed-1': {
            nodeId: 'seed-1',
            capturedAt: null,
            capturedAtMs: 1000,
            controlPlaneDiagnostics: {
              schemaVersion: 1,
              publicationMode: {
                currentMode: 'grouped',
                reasonCode: null,
              },
            },
          },
        },
        'rootCauseBundle should retain direct control-plane ledger snapshots',
      );
    });
});
