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
      partitioning.includes('no global secondary index'),
    'partition-routing limitations lost their current architecture evidence');

  const replication = readText(REPLICATION_ARCHITECTURE_PATH, root);
  addProblem(problems,
    /not yet invoked by any\s+production path/u.test(replication) &&
      replication.includes('transfer/install do not exist') &&
      replication.includes('time-based, not progress-based'),
    'replication limitations lost their current architecture evidence');

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
