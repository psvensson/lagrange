import assert from 'node:assert/strict';
import {test} from 'node:test';
import fc from 'fast-check';

import {
  CONTROL_PLANE_WRITE_RETRY_DECISION_TABLE,
  evaluateControlPlaneWriteRetryDecision,
} from '../../src/query/query-executor-write-retry-routing.js';
import {
  PUBLICATION_RECOVERY_MACHINE_ACTION,
  PUBLICATION_RECOVERY_MACHINE_CONTEXT,
  PUBLICATION_RECOVERY_REASON,
  PUBLICATION_RECOVERY_TRANSITION_ID,
  evaluatePublicationRecoveryMachine,
  resolvePublicationRecoveryTransition,
} from '../../src/control-plane/publication-recovery-state-machine.js';
import {
  CREATE_TABLE_ACTION,
  decideCreateTableAction,
} from '../../src/query/table-creation-service-create-table.js';
import {
  decodePartitionMetadataRecord,
  decodeTableMetadataRecord,
} from '../../src/query/table-creation-service-metadata-lookup.js';
import {TableCreationService} from '../../src/query/table-creation-service-class.js';
import {IndexService} from '../../src/index-management/index-service.js';
import {GLOBAL_INDEX_ERROR_CODE} from '../../src/index-management/index-constants.js';
import {
  assertScanCompleteness,
  collectScanCompleteness,
  evaluateIdentitySeverityRatchet,
} from '../../scripts/metric-check-helpers.js';

const PROPERTY_RUNS = 100;

test('evaluateControlPlaneWriteRetryDecision is total, deterministic, and satisfies priority/deferral invariants across all fact combinations', () => {
  const factArb = fc.record({
    isSystemTableWrite: fc.boolean(),
    isPriorityControlPlaneWrite: fc.boolean(),
    isRetryable: fc.boolean(),
    isDeferredFailure: fc.boolean(),
    isRemovalFencedFailure: fc.boolean(),
  });

  fc.assert(
    fc.property(factArb, (facts) => {
      const first = evaluateControlPlaneWriteRetryDecision(facts);
      const second = evaluateControlPlaneWriteRetryDecision({...facts});
      assert.deepEqual(first, second);
      assert.equal(typeof first.state, 'string');
      assert.ok(first.state.length > 0);

      const allowedStates = new Set(
        CONTROL_PLANE_WRITE_RETRY_DECISION_TABLE.map((rule) => rule.state),
      );
      assert.equal(allowedStates.has(first.state), true);

      if (
        facts.isSystemTableWrite &&
        facts.isPriorityControlPlaneWrite &&
        facts.isRetryable &&
        facts.isDeferredFailure &&
        !facts.isRemovalFencedFailure
      ) {
        assert.equal(first.state, 'widen_to_recovery_candidate');
      } else if (
        facts.isSystemTableWrite &&
        facts.isDeferredFailure &&
        !facts.isRemovalFencedFailure
      ) {
        assert.equal(first.state, 'defer_partition_retry');
      } else if (!facts.isRetryable) {
        assert.equal(first.state, 'none');
      } else {
        assert.equal(first.state, 'widen_to_recovery_candidate');
      }
    }),
    {numRuns: PROPERTY_RUNS},
  );
});

test('evaluatePublicationRecoveryMachine is total across reachable evidence combinations and fails closed on unroutable flag sets', () => {
  const contextArb = fc.constantFrom(
    PUBLICATION_RECOVERY_MACHINE_CONTEXT.ACK_WRITE,
    PUBLICATION_RECOVERY_MACHINE_CONTEXT.METADATA_REFRESH,
    PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
  );
  const statusArb = fc.constantFrom(
    'ack_pending',
    'published',
    'abandoned',
    'superseded',
    'unknown_status',
  );
  const nodeIdsArb = fc.uniqueArray(
    fc.constantFrom('node-a', 'node-b', 'node-c'),
    {maxLength: 3},
  );

  fc.assert(
    fc.property(
      contextArb,
      fc.boolean(),
      statusArb,
      nodeIdsArb,
      nodeIdsArb,
      nodeIdsArb,
      fc.boolean(),
      (
        context,
        available,
        status,
        requiredAckNodeIds,
        acknowledgedNodeIds,
        missingPublishedNodeIds,
        acknowledgementChanged,
      ) => {
        const result = evaluatePublicationRecoveryMachine({
          context,
          available,
          status,
          requiredAckNodeIds,
          acknowledgedNodeIds,
          missingPublishedNodeIds,
          acknowledgementChanged,
        });
        assert.equal(result.context, context);
        assert.equal(typeof result.transitionId, 'string');
        assert.equal(typeof result.action, 'string');

        if (!available) {
          assert.equal(
            result.action,
            PUBLICATION_RECOVERY_MACHINE_ACTION.REPORT_UNAVAILABLE,
          );
          assert.equal(
            result.reasonCode,
            PUBLICATION_RECOVERY_REASON.PUBLICATION_UNAVAILABLE,
          );
          if (context === PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT) {
            assert.equal(
              result.transitionId,
              PUBLICATION_RECOVERY_TRANSITION_ID.PREFLIGHT_UNAVAILABLE,
            );
          } else {
            assert.equal(
              result.transitionId,
              PUBLICATION_RECOVERY_TRANSITION_ID.REPORT_UNAVAILABLE,
            );
          }
        }
      },
    ),
    {numRuns: PROPERTY_RUNS},
  );

  assert.throws(
    () =>
      resolvePublicationRecoveryTransition(
        PUBLICATION_RECOVERY_MACHINE_CONTEXT.PREFLIGHT,
        [],
      ),
    /Unmatched publication recovery transition/u,
  );
});

test('decideCreateTableAction and metadata decoders enforce single-interpretation contracts under property generation', () => {
  const decisionArb = fc.record({
    ifNotExists: fc.boolean(),
    hasSchemaJobId: fc.boolean(),
    hasExistingTable: fc.boolean(),
    hasPersistenceAuthority: fc.boolean(),
  });

  fc.assert(
    fc.property(decisionArb, (input) => {
      const ast = {
        tableName: 'orders',
        ifNotExists: input.ifNotExists,
      };
      const options = input.hasSchemaJobId ? {schemaJobId: 'job-1'} : {};
      const existingTable = input.hasExistingTable ?
        {table_id: 'orders', table_name: 'orders'} :
        null;

      const decision = decideCreateTableAction({
        ast,
        options,
        existingTable,
        hasPersistenceAuthority: input.hasPersistenceAuthority,
      });

      if (input.hasExistingTable) {
        if (input.ifNotExists || input.hasSchemaJobId) {
          assert.equal(decision.action, CREATE_TABLE_ACTION.RECONCILE_EXISTING);
        } else {
          assert.equal(decision.action, CREATE_TABLE_ACTION.THROW_TABLE_EXISTS);
        }
      } else {
        assert.equal(decision.action, CREATE_TABLE_ACTION.CREATE_PERSISTED);
        assert.equal(CREATE_TABLE_ACTION.CREATE_EPHEMERAL, undefined);
      }
    }),
    {numRuns: PROPERTY_RUNS},
  );

  fc.assert(
    fc.property(
      fc.string({minLength: 1, maxLength: 24}),
      fc.string({minLength: 1, maxLength: 24}),
      fc.integer({min: 1, max: 64}),
      (tableId, tableName, partitionCount) => {
        const decodedTable = decodeTableMetadataRecord({
          table_id: tableId,
          table_name: tableName,
          partition_count: partitionCount,
        });
        assert.equal(decodedTable.table_id, tableId);
        assert.equal(decodedTable.table_name, tableName);
        assert.equal(decodedTable.partition_count, partitionCount);

        // Non-canonical camelCase-only record without snake_case table_id/table_name
        // never populates canonical table_id/table_name from camelCase aliases.
        const camelOnlyTable = decodeTableMetadataRecord({
          tableId,
          tableName,
        });
        assert.equal(camelOnlyTable.table_id, null);
        assert.equal(camelOnlyTable.table_name, null);
        assert.equal(decodeTableMetadataRecord(null), null);

        const decodedPartition = decodePartitionMetadataRecord({
          partition_id: `${tableName}-p0`,
          table_id: tableId,
          table_name: tableName,
        });
        assert.equal(decodedPartition.partition_id, `${tableName}-p0`);
        assert.equal(decodedPartition.table_id, tableId);
        const camelOnlyPartition = decodePartitionMetadataRecord({
          partitionId: `${tableName}-p0`,
        });
        assert.equal(camelOnlyPartition.partition_id, null);
        assert.equal(decodePartitionMetadataRecord(null), null);
      },
    ),
    {numRuns: PROPERTY_RUNS},
  );
});

test('authority unavailability model never converts gateway read failures or missing write authority into silent null or success', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({minLength: 1, maxLength: 32}),
      fc.string({minLength: 1, maxLength: 48}),
      async (tableName, errorMessage) => {
        const failingGateway = {
          readRows: async () => {
            throw new Error(errorMessage);
          },
          submitMutation: async () => {
            throw new Error(errorMessage);
          },
        };
        const service = new TableCreationService({
          nodeId: 'node-1',
          systemCache: {
            find: () => null,
          },
          controlPlaneSystemTableGateway: failingGateway,
        });

        await assert.rejects(
          () => service.findExistingTableRecord(tableName),
          (err) => err instanceof Error && err.message === errorMessage,
        );

        const indexServiceWithFailingGateway = new IndexService({
          systemTableCache: {
            get: () => null,
          },
          controlPlaneSystemTableGateway: failingGateway,
        });
        await assert.rejects(
          () => indexServiceWithFailingGateway.getTableIdForTableName(tableName),
          (err) => err instanceof Error && err.message === errorMessage,
        );

        const indexServiceWithoutWriteAuthority = new IndexService({
          systemTableCache: {
            get: () => null,
          },
        });
        await assert.rejects(
          () =>
            indexServiceWithoutWriteAuthority.persistIndexMetadata({
              indexId: 'idx-1',
              tableId: tableName,
              tableName,
              indexName: 'idx_model_col',
              columnNames: ['col_a'],
              indexType: 'BTREE',
              unique: false,
              createdAt: 1,
            }),
          (err) => err?.code === GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
        );
      },
    ),
    {numRuns: 40},
  );
});

test('evaluateIdentitySeverityRatchet model rejects any added identity or worsened severity even when total violation count decreases', () => {
  const entryArb = fc.uniqueArray(
    fc.record({
      id: fc.stringMatching(/^[a-z]{3,8}$/u),
      severity: fc.integer({min: 13, max: 30}),
    }),
    {
      minLength: 2,
      maxLength: 12,
      selector: (item) => item.id,
    },
  );

  fc.assert(
    fc.property(
      entryArb,
      fc.integer({min: 1, max: 10}),
      (entries, delta) => {
        const baselineEntries = Object.fromEntries(
          entries.map((item) => [
            `src/${item.id}.js::Function '${item.id}'#1`,
            item.severity,
          ]),
        );

        // Identical or strictly improved subset passes.
        const improvedViolations = entries.slice(1).map((item) => ({
          filePath: `src/${item.id}.js`,
          subject: `Function '${item.id}'`,
          severity: Math.max(13, item.severity - 1),
        }));
        const passingEval = evaluateIdentitySeverityRatchet({
          violations: improvedViolations,
          baselineEntries,
        });
        assert.equal(passingEval.ok, true);
        assert.equal(passingEval.newViolations.length, 0);
        assert.equal(passingEval.worsenedViolations.length, 0);

        // Removing two baseline violations and adding one brand-new violation
        // decreases the total count by 1, but must fail the identity ratchet.
        const swappedViolations = [
          ...entries.slice(2).map((item) => ({
            filePath: `src/${item.id}.js`,
            subject: `Function '${item.id}'`,
            severity: item.severity,
          })),
          {
            filePath: 'src/brand_new_module.js',
            subject: 'Function \'brandNewOffender\'',
            severity: 13,
          },
        ];
        const swappedEval = evaluateIdentitySeverityRatchet({
          violations: swappedViolations,
          baselineEntries,
        });
        assert.equal(swappedEval.ok, false);
        assert.equal(swappedEval.newViolations.length, 1);

        // Removing one violation and worsening one remaining violation by +delta
        // also fails the severity ratchet.
        const worsenedViolations = entries.slice(1).map((item, index) => ({
          filePath: `src/${item.id}.js`,
          subject: `Function '${item.id}'`,
          severity: index === 0 ? item.severity + delta : item.severity,
        }));
        const worsenedEval = evaluateIdentitySeverityRatchet({
          violations: worsenedViolations,
          baselineEntries,
        });
        assert.equal(worsenedEval.ok, false);
        assert.equal(worsenedEval.worsenedViolations.length, 1);
      },
    ),
    {numRuns: PROPERTY_RUNS},
  );

  const partialFatalScan = collectScanCompleteness(
    [
      {
        filePath: '/repo/src/ok.js',
        messages: [],
      },
      {
        filePath: '/repo/src/fatal.js',
        messages: [
          {
            ruleId: null,
            fatal: true,
            line: 1,
            column: 1,
            message: 'Parsing error: Unexpected token',
          },
        ],
      },
    ],
    {
      ruleId: 'complexity',
      targets: ['src/'],
    },
  );
  assert.equal(partialFatalScan.complete, false);
  assert.throws(
    () => assertScanCompleteness(partialFatalScan, 'complexity'),
    /Scan completeness check FAILED/u,
  );
});
