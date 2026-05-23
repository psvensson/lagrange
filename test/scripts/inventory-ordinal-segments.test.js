import {test} from '../../src/test-helpers/tap.js';
import {
  buildClusterKey,
  buildInventoryFromPaths,
  classifyPath,
  extractOrdinalTokens,
  renderInventoryJson,
  renderInventoryMarkdown,
} from '../../scripts/inventory-ordinal-segments.js';

const OPERATION_STAGE_PATH =
  'src/rebalancer/operation-workflow-owner-segment-5-stage-3.js';
const OPERATION_SHARED_PATH =
  'src/rebalancer/operation-workflow-owner-segment-5-stage-shared.js';
const QUERY_PART_PATH = 'src/query/query-executor-segment-2-part-1.js';
const ADMIN_PART_PATH = 'src/admin/admin-control-snapshot-class-part-1.js';
const NON_ORDINAL_PATH = 'src/query/partition-resolver.js';
const EXPECTED_SCHEMA = 'ordinal-segment-inventory-v1';

test('extractOrdinalTokens finds numbered segment, stage, and part tokens',
  (t) => {
    t.same(
      extractOrdinalTokens(OPERATION_STAGE_PATH),
      [
        {kind: 'segment', ordinal: 5},
        {kind: 'stage', ordinal: 3},
      ],
    );
    t.same(
      extractOrdinalTokens(QUERY_PART_PATH),
      [
        {kind: 'segment', ordinal: 2},
        {kind: 'part', ordinal: 1},
      ],
    );
    t.same(extractOrdinalTokens(NON_ORDINAL_PATH), []);
    t.end();
  },
);

test('buildClusterKey removes ordinal markers and shared stage suffixes',
  (t) => {
    t.equal(
      buildClusterKey(OPERATION_STAGE_PATH),
      'operation-workflow-owner',
    );
    t.equal(
      buildClusterKey(OPERATION_SHARED_PATH),
      'operation-workflow-owner',
    );
    t.equal(
      buildClusterKey(ADMIN_PART_PATH),
      'admin-control-snapshot-class',
    );
    t.end();
  },
);

test('classifyPath maps known ordinal files to semantic owner boundaries',
  (t) => {
    t.same(
      classifyPath(OPERATION_STAGE_PATH, 'operation-workflow-owner'),
      {
        owner: 'operation_workflow_owner',
        boundary: 'operation_workflow_progression',
        concern: 'durable operation workflow progression',
        proposedModule: 'operation-workflow-progression.js',
        successorPackage: 'runtime-modularization-operation-workflow-progression',
      },
    );
    t.same(
      classifyPath(QUERY_PART_PATH, 'query-executor'),
      {
        owner: 'query_executor_owner',
        boundary: 'query_execution_workflow',
        concern: 'query execution workflow',
        proposedModule: 'query-execution-workflow.js',
        successorPackage: 'runtime-modularization-query-execution-workflow',
      },
    );
    t.end();
  },
);

test('buildInventoryFromPaths groups ordinal files into migration clusters',
  (t) => {
    const inventory = buildInventoryFromPaths([
      OPERATION_STAGE_PATH,
      OPERATION_SHARED_PATH,
      QUERY_PART_PATH,
      NON_ORDINAL_PATH,
    ]);

    t.equal(inventory.schema, EXPECTED_SCHEMA);
    t.equal(inventory.summary.totalFiles, 3);
    t.equal(inventory.summary.clusterCount, 2);
    t.same(inventory.summary.byPrimaryKind, {
      segment: 3,
      stage: 0,
      part: 0,
    });
    t.same(
      inventory.clusters.map((cluster) => cluster.cluster),
      ['operation-workflow-owner', 'query-executor'],
    );
    const operationEntry = inventory.entries.find((entry) =>
      entry.path === OPERATION_STAGE_PATH);
    t.ok(operationEntry);
    t.equal(operationEntry?.owner, 'operation_workflow_owner');
    t.end();
  },
);

test('rendered inventory artifacts are parseable and package-ready', (t) => {
  const inventory = buildInventoryFromPaths([
    OPERATION_STAGE_PATH,
    QUERY_PART_PATH,
  ]);
  const json = renderInventoryJson(inventory);
  const markdown = renderInventoryMarkdown(inventory);

  t.same(JSON.parse(json).summary, inventory.summary);
  t.match(markdown, /# Ordinal Segment Inventory/u);
  t.match(markdown, /runtime-modularization-operation-workflow-progression/u);
  t.match(markdown, /must not rename or refactor runtime modules/u);
  t.end();
});
