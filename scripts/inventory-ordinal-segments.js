#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_THREE = 3;
const SOURCE_ROOT = 'src';
const OUTPUT_JSON = '_legacy_work/inventory/ordinal-segments.json';
const OUTPUT_MARKDOWN = '_legacy_work/inventory/ordinal-segments.md';
const SCHEMA_VERSION = 'ordinal-segment-inventory-v1';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const PATH_SEPARATOR = '/';
const FILE_EXTENSION_PATTERN = /\.[^.]+$/u;
const ORDINAL_TOKEN_PATTERN = /\b(segment|stage|part)-([0-9]+)(?=$|-)/gu;
const ORDINAL_MARKER_PATTERN = /-(?:segment|stage|part)-[0-9]+/gu;
const SHARED_MARKER_PATTERN = /-(?:segment|stage|part)-shared/gu;
const DUPLICATE_DASH_PATTERN = /-{2,}/gu;
const EDGE_DASH_PATTERN = /^-|-$/gu;
const NON_SLUG_PATTERN = /[^a-z0-9]+/gu;
const DEFAULT_PROPOSED_SUFFIX = '-semantic-owner.js';
const HELP_TEXT = [
  'Usage:',
  '  node scripts/inventory-ordinal-segments.js',
  '',
  'Scans src/ for numbered segment, stage, and part files, then writes',
  `${OUTPUT_JSON} and ${OUTPUT_MARKDOWN}.`,
].join(NEWLINE);

const KIND_ORDER = Object.freeze(['segment', 'stage', 'part']);

const CLASSIFICATION_RULES = Object.freeze([
  {
    prefix: 'src/admin/admin-control-snapshot',
    owner: 'admin_control_snapshot_owner',
    boundary: 'admin_control_snapshot_projection',
    concern: 'admin control snapshot projection',
    proposedModule: 'admin-control-snapshot-projection.js',
  },
  {
    prefix: 'src/admin/admin-websocket-api',
    owner: 'admin_websocket_api_owner',
    boundary: 'admin_websocket_routing',
    concern: 'admin websocket routing and response shaping',
    proposedModule: 'admin-websocket-routing.js',
  },
  {
    prefix: 'src/bootstrap/owners/bootstrap-readiness-owner',
    owner: 'bootstrap_readiness_owner',
    boundary: 'bootstrap_readiness_projection',
    concern: 'bootstrap readiness projection',
    proposedModule: 'bootstrap-readiness-projection.js',
  },
  {
    prefix: 'src/bootstrap/node-joining-service',
    owner: 'node_joining_service_owner',
    boundary: 'node_joining_workflow',
    concern: 'node joining workflow',
    proposedModule: 'node-joining-workflow.js',
  },
  {
    prefix: 'src/cdc/cdc-integration-service',
    owner: 'cdc_integration_owner',
    boundary: 'cdc_integration_workflow',
    concern: 'CDC integration workflow',
    proposedModule: 'cdc-integration-workflow.js',
  },
  {
    prefix: 'src/control-plane/control-plane-readiness-service',
    owner: 'control_plane_readiness_owner',
    boundary: 'control_plane_readiness_workflow',
    concern: 'control-plane readiness workflow',
    proposedModule: 'control-plane-readiness-workflow.js',
  },
  {
    prefix: 'src/control-plane/control-plane-system-table-gateway',
    owner: 'system_table_gateway_owner',
    boundary: 'control_plane_system_table_gateway',
    concern: 'system-table gateway routing',
    proposedModule: 'control-plane-system-table-gateway.js',
  },
  {
    prefix: 'src/control-plane/membership-publication-coordinator',
    owner: 'membership_publication_owner',
    boundary: 'membership_publication_coordination',
    concern: 'membership publication coordination',
    proposedModule: 'membership-publication-coordination.js',
  },
  {
    prefix: 'src/control-plane/priority-recovery-observation-snapshot',
    owner: 'priority_recovery_owner',
    boundary: 'priority_recovery_observation_snapshot',
    concern: 'priority recovery observation snapshot',
    proposedModule: 'priority-recovery-observation-snapshot.js',
  },
  {
    prefix: 'src/control-plane/priority-recovery-snapshot',
    owner: 'priority_recovery_owner',
    boundary: 'priority_recovery_snapshot_projection',
    concern: 'priority recovery snapshot projection',
    proposedModule: 'priority-recovery-snapshot-projection.js',
  },
  {
    prefix: 'src/control-plane/replica-dispatch-service',
    owner: 'replica_dispatch_owner',
    boundary: 'replica_dispatch_workflow',
    concern: 'replica dispatch workflow',
    proposedModule: 'replica-dispatch-workflow.js',
  },
  {
    prefix: 'src/message-group/message-group-service-runtime-methods',
    owner: 'message_group_service_owner',
    boundary: 'message_group_runtime_methods',
    concern: 'message group runtime methods',
    proposedModule: 'message-group-runtime-methods.js',
  },
  {
    prefix: 'src/message-group/message-group-service',
    owner: 'message_group_service_owner',
    boundary: 'message_group_service_workflow',
    concern: 'message group service workflow',
    proposedModule: 'message-group-service-workflow.js',
  },
  {
    prefix: 'src/node/replica-handler',
    owner: 'replica_handler_owner',
    boundary: 'replica_handler_workflow',
    concern: 'replica handler workflow',
    proposedModule: 'replica-handler-workflow.js',
  },
  {
    prefix: 'src/partition/partition-service',
    owner: 'partition_service_owner',
    boundary: 'partition_service_workflow',
    concern: 'partition service workflow',
    proposedModule: 'partition-service-workflow.js',
  },
  {
    prefix: 'src/query/query-executor',
    owner: 'query_executor_owner',
    boundary: 'query_execution_workflow',
    concern: 'query execution workflow',
    proposedModule: 'query-execution-workflow.js',
  },
  {
    prefix: 'src/query/sql-query-engine',
    owner: 'sql_query_engine_owner',
    boundary: 'sql_query_planning_execution',
    concern: 'SQL planning and execution',
    proposedModule: 'sql-query-planning-execution.js',
  },
  {
    prefix: 'src/query/table-creation-service',
    owner: 'table_creation_service_owner',
    boundary: 'table_creation_workflow',
    concern: 'table creation workflow',
    proposedModule: 'table-creation-workflow.js',
  },
  {
    prefix: 'src/rebalancer/operation-workflow-owner',
    owner: 'operation_workflow_owner',
    boundary: 'operation_workflow_progression',
    concern: 'durable operation workflow progression',
    proposedModule: 'operation-workflow-progression.js',
  },
  {
    prefix: 'src/rebalancer/rebalance-coordinator',
    owner: 'rebalancer_coordinator_owner',
    boundary: 'replica_operation_coordination',
    concern: 'replica operation coordination',
    proposedModule: 'replica-operation-coordination.js',
  },
  {
    prefix: 'src/rebalancer/unified-rebalancer',
    owner: 'rebalancer_planning_owner',
    boundary: 'placement_rebalance_planning',
    concern: 'placement rebalance planning',
    proposedModule: 'placement-rebalance-planning.js',
  },
  {
    prefix: 'src/transport/message-router-shared',
    owner: 'message_router_owner',
    boundary: 'message_router_shared_transport',
    concern: 'shared transport routing',
    proposedModule: 'message-router-shared-transport.js',
  },
  {
    prefix: 'src/transport/message-router',
    owner: 'message_router_owner',
    boundary: 'message_router_workflow',
    concern: 'message router workflow',
    proposedModule: 'message-router-workflow.js',
  },
]);

function normalizePath(filePath) {
  return filePath.split(path.sep).join(PATH_SEPARATOR);
}

function removeExtension(fileName) {
  return fileName.replace(FILE_EXTENSION_PATTERN, EMPTY_TEXT);
}

function toSlug(value) {
  return String(value || EMPTY_TEXT)
    .toLowerCase()
    .replace(NON_SLUG_PATTERN, '-')
    .replace(EDGE_DASH_PATTERN, EMPTY_TEXT);
}

function toSnake(value) {
  return toSlug(value).replaceAll('-', '_');
}

function extractOrdinalTokens(fileName) {
  const stem = removeExtension(path.basename(fileName));
  return Array.from(stem.matchAll(ORDINAL_TOKEN_PATTERN)).map((match) => ({
    kind: match[NUM_ONE],
    ordinal: Number.parseInt(match[NUM_TWO], 10),
  }));
}

function buildClusterKey(filePath) {
  return removeExtension(path.basename(filePath))
    .replace(ORDINAL_MARKER_PATTERN, EMPTY_TEXT)
    .replace(SHARED_MARKER_PATTERN, EMPTY_TEXT)
    .replace(DUPLICATE_DASH_PATTERN, '-')
    .replace(EDGE_DASH_PATTERN, EMPTY_TEXT);
}

function classifyPath(filePath, clusterKey = buildClusterKey(filePath)) {
  const matchedRule = CLASSIFICATION_RULES.find((rule) =>
    filePath.startsWith(rule.prefix));
  if (matchedRule) {
    return {
      owner: matchedRule.owner,
      boundary: matchedRule.boundary,
      concern: matchedRule.concern,
      proposedModule: matchedRule.proposedModule,
      successorPackage: `runtime-modularization-${toSlug(matchedRule.boundary)}`,
    };
  }
  const topLevel = filePath.split(PATH_SEPARATOR)[NUM_ONE] || 'runtime';
  const clusterSlug = toSlug(clusterKey);
  return {
    owner: `${toSnake(topLevel)}_owner`,
    boundary: `${toSnake(clusterKey)}_semantic_split`,
    concern: `${clusterKey.replaceAll('-', ' ')} semantic split`,
    proposedModule: `${clusterSlug}${DEFAULT_PROPOSED_SUFFIX}`,
    successorPackage: `runtime-modularization-${clusterSlug}`,
  };
}

function buildEntry(filePath) {
  const normalizedPath = normalizePath(filePath);
  const tokens = extractOrdinalTokens(normalizedPath);
  if (tokens.length === NUM_ZERO) {
    return null;
  }
  const clusterKey = buildClusterKey(normalizedPath);
  const classification = classifyPath(normalizedPath, clusterKey);
  const primaryToken = tokens[NUM_ZERO];
  return {
    path: normalizedPath,
    directory: normalizePath(path.dirname(normalizedPath)),
    basename: path.basename(normalizedPath),
    cluster: clusterKey,
    primaryKind: primaryToken.kind,
    primaryOrdinal: primaryToken.ordinal,
    tokens,
    ...classification,
  };
}

function compareEntries(left, right) {
  return left.path.localeCompare(right.path);
}

function countByKind(entries) {
  const counts = Object.fromEntries(KIND_ORDER.map((kind) => [kind, NUM_ZERO]));
  for (const entry of entries) {
    counts[entry.primaryKind] += NUM_ONE;
  }
  return counts;
}

function buildCluster(entries) {
  const firstEntry = entries[NUM_ZERO];
  const kindCounts = countByKind(entries);
  return {
    cluster: firstEntry.cluster,
    fileCount: entries.length,
    owner: firstEntry.owner,
    boundary: firstEntry.boundary,
    concern: firstEntry.concern,
    proposedModule: firstEntry.proposedModule,
    successorPackage: firstEntry.successorPackage,
    primaryKinds: kindCounts,
    samplePaths: entries.slice(NUM_ZERO, NUM_THREE).map((entry) => entry.path),
  };
}

function buildClusters(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const group = grouped.get(entry.cluster) || [];
    group.push(entry);
    grouped.set(entry.cluster, group);
  }
  return Array.from(grouped.values())
    .map((groupEntries) => buildCluster(groupEntries.sort(compareEntries)))
    .sort((left, right) => left.cluster.localeCompare(right.cluster));
}

function buildInventoryFromPaths(filePaths) {
  const entries = filePaths
    .map(buildEntry)
    .filter((entry) => entry !== null)
    .sort(compareEntries);
  const clusters = buildClusters(entries);
  return {
    schema: SCHEMA_VERSION,
    root: SOURCE_ROOT,
    summary: {
      totalFiles: entries.length,
      clusterCount: clusters.length,
      byPrimaryKind: countByKind(entries),
    },
    migrationPlan: {
      rule: 'Replace numbered segment, stage, and part filenames with semantic owner-boundary modules in successor packages; do not refactor runtime modules in the inventory package.',
      successorPackageField: 'successorPackage',
    },
    clusters,
    entries,
  };
}

async function collectSourceFiles(root = SOURCE_ROOT) {
  const entries = [];
  async function visit(directory) {
    const dirents = await fs.readdir(directory, {withFileTypes: true});
    const sortedDirents = dirents.sort((left, right) =>
      left.name.localeCompare(right.name));
    for (const dirent of sortedDirents) {
      const childPath = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        await visit(childPath);
        continue;
      }
      if (dirent.isFile()) {
        entries.push(normalizePath(childPath));
      }
    }
  }
  await visit(root);
  return entries;
}

function renderInlineJson(value) {
  return JSON.stringify(value);
}

function renderObjectArrayLine(objectValue, trailingComma) {
  const suffix = trailingComma ? ',' : EMPTY_TEXT;
  return `    ${renderInlineJson(objectValue)}${suffix}`;
}

function renderInventoryJson(inventory) {
  const lines = [
    '{',
    `  "schema": ${renderInlineJson(inventory.schema)},`,
    `  "root": ${renderInlineJson(inventory.root)},`,
    `  "summary": ${renderInlineJson(inventory.summary)},`,
    `  "migrationPlan": ${renderInlineJson(inventory.migrationPlan)},`,
    '  "clusters": [',
  ];
  inventory.clusters.forEach((cluster, index) => {
    lines.push(
      renderObjectArrayLine(cluster, index < inventory.clusters.length - NUM_ONE),
    );
  });
  lines.push('  ],', '  "entries": [');
  inventory.entries.forEach((entry, index) => {
    lines.push(
      renderObjectArrayLine(entry, index < inventory.entries.length - NUM_ONE),
    );
  });
  lines.push('  ]', '}');
  return `${lines.join(NEWLINE)}${NEWLINE}`;
}

function renderSamplePaths(samplePaths) {
  return samplePaths.map((samplePath) => `\`${samplePath}\``).join(', ');
}

function renderInventoryMarkdown(inventory) {
  const lines = [
    '# Ordinal Segment Inventory',
    EMPTY_TEXT,
    `- Schema: \`${inventory.schema}\``,
    `- Source root: \`${inventory.root}\``,
    `- Ordinal files: \`${inventory.summary.totalFiles}\``,
    `- Semantic clusters: \`${inventory.summary.clusterCount}\``,
    `- Primary kind counts: \`${renderInlineJson(inventory.summary.byPrimaryKind)}\``,
    EMPTY_TEXT,
    '## Migration Plan',
    EMPTY_TEXT,
    'Replace numbered `segment`, `stage`, and `part` modules with semantic owner-boundary modules in successor packages. This inventory is diagnostic only; it must not rename or refactor runtime modules.',
    EMPTY_TEXT,
    '## Clusters',
    EMPTY_TEXT,
  ];
  for (const cluster of inventory.clusters) {
    lines.push(
      `- \`${cluster.cluster}\` (${cluster.fileCount} files): ` +
      `\`${cluster.owner} / ${cluster.boundary}\`; ` +
      `proposed module \`${cluster.proposedModule}\`; ` +
      `successor \`${cluster.successorPackage}\`; ` +
      `samples ${renderSamplePaths(cluster.samplePaths)}.`,
    );
  }
  lines.push(
    EMPTY_TEXT,
    '## Rules For Successors',
    EMPTY_TEXT,
    '- Use semantic owner-boundary names; do not introduce new numbered segment, stage, or part files.',
    '- Keep runtime behavior unchanged unless the successor package is a runtime owner-boundary package with focused proof.',
    '- Use the JSON `entries` list for exact file membership when opening successor packages.',
  );
  return `${lines.join(NEWLINE)}${NEWLINE}`;
}

async function writeInventory(inventory) {
  await fs.mkdir(path.dirname(OUTPUT_JSON), {recursive: true});
  await fs.writeFile(OUTPUT_JSON, renderInventoryJson(inventory));
  await fs.writeFile(OUTPUT_MARKDOWN, renderInventoryMarkdown(inventory));
}

async function buildInventory() {
  return buildInventoryFromPaths(await collectSourceFiles());
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  if (args.includes('--help')) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const inventory = await buildInventory();
  await writeInventory(inventory);
  return [
    `Wrote ${OUTPUT_JSON}`,
    `Wrote ${OUTPUT_MARKDOWN}`,
    `Ordinal files: ${inventory.summary.totalFiles}`,
    `Semantic clusters: ${inventory.summary.clusterCount}`,
    EMPTY_TEXT,
  ].join(NEWLINE);
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((output) => {
      process.stdout.write(output);
      process.exitCode = EXIT_SUCCESS;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  buildClusterKey,
  buildInventoryFromPaths,
  classifyPath,
  collectSourceFiles,
  extractOrdinalTokens,
  renderInventoryJson,
  renderInventoryMarkdown,
  runCli,
  SOURCE_ROOT,
};
