#!/usr/bin/env node

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTokenCheckGuard} from
  './q2-call-selector-typed-parameter-narrowing-guard.js';

const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIR_PATH = path.dirname(CURRENT_FILE_PATH);
const ROOT_DIR_PATH = path.resolve(CURRENT_DIR_PATH, '../..');

const HTTP_ADAPTER_REL_PATH = 'src/service/request-cell-http-adapter.js';
const ROUTING_CONTRACT_REL_PATH =
  'src/service/request-cell-routing-contract.js';
const REQUEST_HANDLER_REL_PATH =
  'src/node/runtime-service-request-cell-handler.js';
const ENTRY_GENERATOR_REL_PATH = 'src/service/service-entry-generator.js';
const HOST_CALL_PROTOCOL_REL_PATH = 'src/runtime/cell-host-call-protocol.js';
const CALL_BRIDGE_REL_PATH = 'src/service/request-cell-call-bridge.js';
const CELL_WORKER_REL_PATH = 'src/runtime/wasi-component-cell-worker.js';
const H3_TEST_REL_PATH =
  'test/service/h3-fetch-ingress-and-scoped-client.test.js';

const HTTP_ADAPTER_TOKENS = Object.freeze([
  'normalizeFetchHttpRequest',
  'HOP_BY_HOP_REQUEST_HEADERS',
  'CONSUMED_INGRESS_CREDENTIAL_HEADERS',
  'BODY_FORBIDDEN_STATUSES',
]);

const ROUTING_CONTRACT_TOKENS = Object.freeze([
  'BODY_FORBIDDEN_STATUSES',
  'bodyBase64',
  'BUDGET_EXHAUSTED',
]);

const REQUEST_HANDLER_TOKENS = Object.freeze([
  'buildGuestRequestEnvelope',
  'admittedUrl',
]);

const ENTRY_GENERATOR_TOKENS = Object.freeze([
  'request_client_closed',
  'unsupported_concurrency',
  'unfinished_child_work',
  'closeClient',
]);

const HOST_CALL_PROTOCOL_TOKENS = Object.freeze([
  'UNSUPPORTED_CONCURRENCY',
  'UNFINISHED_CHILD_WORK',
  'REQUEST_CLIENT_CLOSED',
  'DEFAULT_REQUEST_HOST_CALL_BUDGET',
]);

const CALL_BRIDGE_TOKENS = Object.freeze([
  'UNSUPPORTED_CONCURRENCY',
  'UNFINISHED_CHILD_WORK',
  'completeInvocation',
]);

const CELL_WORKER_TOKENS = Object.freeze([
  'DEFAULT_REQUEST_HOST_CALL_BUDGET',
]);

const H3_TEST_TOKENS = Object.freeze([
  'fetch-http-semantics',
  'request-call-lifecycle',
  'unsupported_concurrency',
  'request_client_closed',
  'unfinished_child_work',
]);

const ISSUE_HTTP_ADAPTER =
  'request-cell-http-adapter-missing-fetch-envelope-fidelity';
const ISSUE_ROUTING_CONTRACT =
  'request-cell-routing-contract-missing-binary-or-status-rules';
const ISSUE_REQUEST_HANDLER =
  'runtime-service-request-cell-handler-missing-guest-envelope-identity';
const ISSUE_ENTRY_GENERATOR =
  'service-entry-generator-missing-scoped-client-lifecycle-guards';
const ISSUE_HOST_CALL_PROTOCOL =
  'cell-host-call-protocol-missing-concurrency-or-fanout-codes';
const ISSUE_CALL_BRIDGE =
  'request-cell-call-bridge-missing-sequential-fanout-or-concurrency-fence';
const ISSUE_CELL_WORKER =
  'wasi-component-cell-worker-missing-request-host-call-budget';
const ISSUE_H3_TEST =
  'h3-fetch-ingress-and-scoped-client-test-missing-or-incomplete';

const FILE_TOKEN_CHECKS = Object.freeze([
  [HTTP_ADAPTER_REL_PATH, HTTP_ADAPTER_TOKENS, ISSUE_HTTP_ADAPTER],
  [ROUTING_CONTRACT_REL_PATH, ROUTING_CONTRACT_TOKENS, ISSUE_ROUTING_CONTRACT],
  [REQUEST_HANDLER_REL_PATH, REQUEST_HANDLER_TOKENS, ISSUE_REQUEST_HANDLER],
  [ENTRY_GENERATOR_REL_PATH, ENTRY_GENERATOR_TOKENS, ISSUE_ENTRY_GENERATOR],
  [
    HOST_CALL_PROTOCOL_REL_PATH,
    HOST_CALL_PROTOCOL_TOKENS,
    ISSUE_HOST_CALL_PROTOCOL,
  ],
  [CALL_BRIDGE_REL_PATH, CALL_BRIDGE_TOKENS, ISSUE_CALL_BRIDGE],
  [CELL_WORKER_REL_PATH, CELL_WORKER_TOKENS, ISSUE_CELL_WORKER],
  [H3_TEST_REL_PATH, H3_TEST_TOKENS, ISSUE_H3_TEST],
]);

runTokenCheckGuard(ROOT_DIR_PATH, FILE_TOKEN_CHECKS);
