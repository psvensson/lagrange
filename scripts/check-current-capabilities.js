#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {BOOTSTRAP_API_ROUTE} from
  '../src/bootstrap/bootstrap-api-constants.js';
import {DEFAULT_CONFIG} from '../src/config/config-definitions.js';
import {
  LISTENER_PORT_DEFAULT,
  LISTENER_PORT_ENV,
} from '../src/config/listener-port-model.js';
import {POLICY_DEFAULT} from '../src/policy/policy-constants.js';
import {
  ALLOWED_AUTH_MODES,
  ALLOWED_TLS_MODES,
} from '../src/runtime/pgwire-descriptor.js';
import {
  SERVICE_LIFECYCLE_SQL_CLASSIFICATION,
  classifyServiceLifecycleSql,
} from '../src/query/service-lifecycle-sql-contract.js';
import {
  CAPABILITIES_PATH,
  OUTPUT_PATH,
  generate,
} from './generate-current-capabilities-doc.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_ENCODING = 'utf8';
const EXPECTED_SCHEMA_VERSION = 1;
const CHART_VALUES_PATH = 'charts/lagrange-node/values.yaml';
const PARTITIONING_ARCHITECTURE_PATH = 'architecture/process-partitioning.md';
const REPLICATION_ARCHITECTURE_PATH = 'architecture/process-replication.md';
const TRANSPORT_SERVER_PATH = 'src/transport/router-server-manager.js';
const HTTP_AUTHENTICATOR_PATH =
  'src/service/request-cell-http-authenticator.js';

const EXPECTED_STATUS = Object.freeze({
  SECONDARY_INDEXES: 'unsupported',
  SQLITE_SNAPSHOT: 'active_sqlite_partition_path',
  MESSAGE_GROUP_COMPACTION: 'unsupported',
  LEARNER_PROMOTION: 'time_based_not_progress_based',
  NODE_TRANSPORT: 'plain_websocket_trusted_network_only',
  HTTP_AUTHENTICATION: 'basic_against_configured_pgwire_credentials',
  BACKUP_RESTORE_PITR: 'unsupported',
  ROLLING_UPGRADE: 'unsupported_on_0x',
});

const AUDIT_MARKER = Object.freeze({
  SECONDARY_INDEX_ID: 'secondary-indexes',
  SECONDARY_INDEX_CONTRADICTION:
    'secondary-index capability contradicts the active architecture',
  SQLITE_BOUNDED: 'SQLite partition logs are bounded',
  MESSAGE_GROUP_UNBOUNDED: 'message-group logs still grow without bound',
  LEARNER_TIME_BASED: 'time-based, not progress-based',
  REPLICATION_CONTRADICTION:
    'replication capability fields contradict the active snapshot path',
  WEBSOCKET_SERVER: 'new WebSocketServer(serverOptions)',
  HTTPS_SERVER: 'https.createServer',
  TRANSPORT_MISMATCH:
    'node transport security status no longer matches the server composition',
  BASIC_PREFIX_SOURCE: 'const BASIC_PREFIX = \'Basic \'',
  HTTP_AUTH_MISMATCH:
    'request HTTP authentication status no longer matches its owner',
  OPERATIONS_OVERCLAIM:
    'operations status must not imply backup or upgrade guarantees',
  CALL_BOUNDS_POSITIVE: 'call execution bounds must be positive',
});

function readText(relativePath, root = REPO_ROOT) {
  return fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING);
}

function readJson(relativePath, root = REPO_ROOT) {
  return JSON.parse(readText(relativePath, root));
}

function sameValues(actual, expected) {
  return JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort());
}

function addProblem(problems, condition, message) {
  if (!condition) problems.push(message);
}

function limitationById(capabilities, id) {
  return capabilities.limitations.find((limitation) => limitation.id === id) ||
    null;
}

function checkCurrentCapabilities(root = REPO_ROOT) {
  const capabilities = readJson(CAPABILITIES_PATH, root);
  const problems = [];

  addProblem(
    problems,
    capabilities.schemaVersion === EXPECTED_SCHEMA_VERSION,
    `current capabilities schemaVersion must be ${EXPECTED_SCHEMA_VERSION}`,
  );

  const listeners = capabilities.listeners;
  addProblem(problems,
    listeners.rest.defaultPort === LISTENER_PORT_DEFAULT.REST_API,
    'REST default does not match listener-port owner');
  addProblem(problems,
    listeners.adminWebSocket.defaultPort ===
      LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET,
    'admin WebSocket default does not match listener-port owner');
  addProblem(problems,
    listeners.transportWebSocket.defaultPort ===
      LISTENER_PORT_DEFAULT.TRANSPORT_WEBSOCKET,
    'transport WebSocket default does not match listener-port owner');
  addProblem(problems,
    listeners.rest.environmentVariable === LISTENER_PORT_ENV.REST_API &&
      listeners.adminWebSocket.environmentVariable ===
        LISTENER_PORT_ENV.ADMIN_WEBSOCKET &&
      listeners.transportWebSocket.environmentVariable ===
        LISTENER_PORT_ENV.TRANSPORT_WEBSOCKET,
    'listener environment variables do not match listener-port owner');

  const probes = capabilities.probes;
  addProblem(problems,
    probes.liveness === BOOTSTRAP_API_ROUTE.LIVEZ &&
      probes.startup === BOOTSTRAP_API_ROUTE.STARTUPZ &&
      probes.readiness === BOOTSTRAP_API_ROUTE.READYZ &&
      probes.compatibility === BOOTSTRAP_API_ROUTE.HEALTH,
    'probe endpoints do not match bootstrap API route owner');

  addProblem(problems,
    capabilities.operations.storageAdmissionDefault ===
      DEFAULT_CONFIG.rebalancer.storageAdmissionMode,
    'storage admission default does not match configuration owner');
  addProblem(problems,
    capabilities.dataAndQueries.defaultReplicaCount ===
      POLICY_DEFAULT.REPLICA_COUNT,
    'default replica count does not match table-policy owner');

  addProblem(problems,
    sameValues(
      capabilities.postgresWire.authenticationModes,
      ALLOWED_AUTH_MODES,
    ),
    'PostgreSQL authentication modes do not match descriptor owner');
  addProblem(problems,
    sameValues(capabilities.postgresWire.tlsModes, ALLOWED_TLS_MODES),
    'PostgreSQL TLS modes do not match descriptor owner');

  for (const statement of capabilities.deployment.lifecycleSql) {
    const classification = classifyServiceLifecycleSql(statement);
    addProblem(
      problems,
      classification.kind === SERVICE_LIFECYCLE_SQL_CLASSIFICATION.LIFECYCLE,
      `lifecycle statement is not recognized by the SQL owner: ${statement}`,
    );
  }

  const chartValues = readText(CHART_VALUES_PATH, root);
  addProblem(problems,
    chartValues.includes(`path: ${probes.liveness}`) &&
      chartValues.includes(`path: ${probes.readiness}`),
    'Helm probe defaults do not match the canonical capability contract');

  const partitioning = readText(PARTITIONING_ARCHITECTURE_PATH, root);
  addProblem(problems,
    partitioning.includes('column named `id`') &&
      partitioning.includes('no secondary index support'),
    'partition-routing limitations lost their current architecture evidence');
  addProblem(problems,
    capabilities.dataAndQueries.secondaryIndexes ===
      EXPECTED_STATUS.SECONDARY_INDEXES &&
      limitationById(capabilities, AUDIT_MARKER.SECONDARY_INDEX_ID) !== null,
    AUDIT_MARKER.SECONDARY_INDEX_CONTRADICTION);

  const replication = readText(REPLICATION_ARCHITECTURE_PATH, root);
  addProblem(problems,
    replication.includes(AUDIT_MARKER.SQLITE_BOUNDED) &&
      replication.includes(AUDIT_MARKER.MESSAGE_GROUP_UNBOUNDED) &&
      replication.includes(AUDIT_MARKER.LEARNER_TIME_BASED),
    'replication limitations lost their current architecture evidence');
  addProblem(problems,
    capabilities.replication.snapshotCheckpointCreation ===
      EXPECTED_STATUS.SQLITE_SNAPSHOT &&
      capabilities.replication.snapshotTransferInstall ===
        EXPECTED_STATUS.SQLITE_SNAPSHOT &&
      capabilities.replication.physicalLogCompaction ===
        EXPECTED_STATUS.SQLITE_SNAPSHOT &&
      capabilities.replication.messageGroupLogCompaction ===
        EXPECTED_STATUS.MESSAGE_GROUP_COMPACTION &&
      capabilities.replication.learnerPromotion ===
        EXPECTED_STATUS.LEARNER_PROMOTION,
    AUDIT_MARKER.REPLICATION_CONTRADICTION);

  const transportServer = readText(TRANSPORT_SERVER_PATH, root);
  addProblem(problems,
    transportServer.includes(AUDIT_MARKER.WEBSOCKET_SERVER) &&
      !transportServer.includes(AUDIT_MARKER.HTTPS_SERVER) &&
      capabilities.security.nodeTransport === EXPECTED_STATUS.NODE_TRANSPORT,
    AUDIT_MARKER.TRANSPORT_MISMATCH);

  const httpAuthenticator = readText(HTTP_AUTHENTICATOR_PATH, root);
  addProblem(problems,
    httpAuthenticator.includes(AUDIT_MARKER.BASIC_PREFIX_SOURCE) &&
      capabilities.security.requestHttpAuthentication ===
        EXPECTED_STATUS.HTTP_AUTHENTICATION,
    AUDIT_MARKER.HTTP_AUTH_MISMATCH);

  addProblem(problems,
    capabilities.operations.backupRestorePitr ===
      EXPECTED_STATUS.BACKUP_RESTORE_PITR &&
      capabilities.operations.rollingUpgradeContract ===
        EXPECTED_STATUS.ROLLING_UPGRADE,
    AUDIT_MARKER.OPERATIONS_OVERCLAIM);

  addProblem(problems,
    capabilities.callExecution.defaultShardRowBound > 0 &&
      capabilities.callExecution.defaultEmitBound > 0 &&
      capabilities.callExecution.defaultPartialEntryBound > 0 &&
      capabilities.callExecution.defaultConcurrentShardRuns > 0,
    AUDIT_MARKER.CALL_BOUNDS_POSITIVE);

  const expectedDocument = generate(root);
  const currentDocument = readText(OUTPUT_PATH, root);
  addProblem(problems, currentDocument === expectedDocument,
    `${OUTPUT_PATH} is stale`);

  return {valid: problems.length === 0, problems};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkCurrentCapabilities();
  if (!result.valid) {
    for (const problem of result.problems) {
      process.stderr.write(`current capability violation: ${problem}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write('current capabilities: valid\n');
  }
}

export {checkCurrentCapabilities};
