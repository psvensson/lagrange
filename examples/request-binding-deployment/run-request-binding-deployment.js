#!/usr/bin/env node

import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  buildAccessPayload,
  buildBindingPayload,
  buildComponent,
  buildInstallPayload,
  buildManifest,
  EXAMPLE,
} from './request-binding-example-contract.js';
import {
  bootExampleNode,
  EXAMPLE_NODE,
} from './request-binding-example-node.js';

const EXAMPLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_SESSION = 'request-binding-example-session';
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 100;
const READINESS_INVOCATION_ID = 'request-binding-example-readiness';
const READINESS_ERROR_PREFIX = 'request Cell did not become ready: ';
const UNKNOWN_ERROR = 'unknown';
const RUNTIME_SERVICE_ID_PREFIX = 'binding-service';
const AUDIT_TABLE_DDL =
  'CREATE TABLE "global.request_binding_audit" ' +
  '(key INTEGER PRIMARY KEY, value INTEGER)';
const LOCAL_STR_STRING = 'string';
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_ACCEPTED = 202;
const COMPONENT_RESPONSE_HEADER = 'x-lagrange-cell';
const COMPONENT_RESPONSE_BODY = 'component wrote audit key 7';
const EXPECTED_AUDIT_ROW = Object.freeze({key: 7, value: 42});
const NODE_DATA_DIRECTORY = 'node-data';
const CONTENT_TYPE_HEADER = 'content-type';
const JSON_CONTENT_TYPE = 'application/json';
const REQUEST_ACCEPT = '*/*';
const BASIC_AUTHORIZATION = `Basic ${Buffer.from(
  `${EXAMPLE_NODE.USER}:${EXAMPLE_NODE.PASSWORD}`,
).toString('base64')}`;

function assertSqlSucceeded(result, operation) {
  assert.equal(
    result?.success,
    true,
    `${operation} failed: ${JSON.stringify(result)}`,
  );
  return result;
}

async function executeSql(node, statement, parameters = []) {
  return assertSqlSucceeded(
    await node.sqlAdapter.execute(
      SQL_SESSION,
      statement,
      parameters,
    ),
    statement,
  );
}

async function auditRows(node) {
  const result = await executeSql(
    node,
    'SELECT key, value FROM "global.request_binding_audit"',
  );
  return result.rows || [];
}

async function waitForReadyCell(node, definition = EXAMPLE) {
  const systemTableCache = node.bootstrapService.systemTableCache;
  const securityContext = Object.freeze({
    principal: EXAMPLE_NODE.USER,
    roles: Object.freeze(['application']),
    tenantId: EXAMPLE_NODE.DATABASE,
  });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return node.bootstrapApi.requestCellRoutingSurface.routeResolver.resolve({
        invocationId: READINESS_INVOCATION_ID,
        method: definition.METHOD,
        path: definition.PATH,
        securityContext,
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
  }
  const bindingRows =
    systemTableCache.getAll('service_bindings') || [];
  const definitionRows =
    systemTableCache.getAll('service_definitions') || [];
  const serviceRows =
    systemTableCache.getAll('services') || [];
  throw new Error(
    READINESS_ERROR_PREFIX +
      `${lastError?.message || UNKNOWN_ERROR} ` +
      `bindings=${JSON.stringify(bindingRows)} ` +
      `definitions=${JSON.stringify(definitionRows)} ` +
      `services=${JSON.stringify(serviceRows.filter((row) =>
        String(row.service_id).includes(RUNTIME_SERVICE_ID_PREFIX)))}`,
  );
}

async function request(node, pathName, body, options = {}) {
  const headers = {
    'accept': REQUEST_ACCEPT,
    'authorization': BASIC_AUTHORIZATION,
    'content-type': JSON_CONTENT_TYPE,
  };
  if (typeof options.idempotencyKey === LOCAL_STR_STRING) {
    headers['idempotency-key'] = options.idempotencyKey;
  }
  const response = await fetch(`${node.baseUrl}${pathName}`, {
    body: JSON.stringify(body),
    headers,
    method: options.method || EXAMPLE.METHOD,
  });
  const text = await response.text();
  const responseContentType =
    response.headers.get(CONTENT_TYPE_HEADER) || '';
  const parsedBody = responseContentType.includes(JSON_CONTENT_TYPE) ?
    JSON.parse(text) :
    text;
  return {
    body: parsedBody,
    headers: Object.fromEntries(response.headers.entries()),
    status: response.status,
  };
}

async function deploy(node, receipt) {
  await executeSql(
    node,
    AUDIT_TABLE_DDL,
  );
  const manifest = buildManifest(receipt);
  const installed = await executeSql(
    node,
    'INSTALL SERVICE $1',
    [JSON.stringify(buildInstallPayload(manifest, receipt))],
  );
  const packageId = installed.rows?.[0]?.package_id;
  assert.equal(typeof packageId, LOCAL_STR_STRING);
  const binding = buildBindingPayload(packageId, manifest);
  const created = await executeSql(
    node,
    'CREATE BINDING $1',
    [JSON.stringify(binding)],
  );
  const access = await executeSql(
    node,
    'CONFIGURE SERVICE ACCESS $1',
    [JSON.stringify(buildAccessPayload())],
  );
  return {
    access: access.rows[0],
    binding,
    bindingReceipt: created.rows[0],
    installReceipt: installed.rows[0],
    manifest,
  };
}

async function exerciseDeployment(node) {
  const route = await waitForReadyCell(node);
  const beforeUnmatched = await auditRows(node);
  const unmatched = await request(
    node,
    '/examples/request-binding-unmatched',
    'write',
  );
  const afterUnmatched = await auditRows(node);
  assert.equal(unmatched.status, HTTP_STATUS_NOT_FOUND);
  assert.equal(unmatched.body.invoked, false);
  assert.deepEqual(afterUnmatched, beforeUnmatched);
  const unmatchedInvocationCount = Number(unmatched.body.invoked);

  const matched = await request(node, EXAMPLE.PATH, 'write');
  assert.equal(matched.status, HTTP_STATUS_ACCEPTED, JSON.stringify(matched));
  assert.equal(
    matched.headers[COMPONENT_RESPONSE_HEADER],
    EXAMPLE.BINDING_NAME,
  );
  assert.equal(matched.body, COMPONENT_RESPONSE_BODY);
  const afterMatched = await auditRows(node);
  assert.deepEqual(
    afterMatched.map((row) => ({
      key: Number(row.key),
      value: Number(row.value),
    })),
    [EXPECTED_AUDIT_ROW],
  );

  const denied = await request(node, EXAMPLE.PATH, 'deny');
  assert.equal(denied.body.invoked, true);
  assert.match(denied.body.error, /table slot 1/u);
  assert.deepEqual(await auditRows(node), afterMatched);

  return {
    declaredTableRows: afterMatched,
    denied,
    matched,
    readyCell: route,
    unmatched,
    unmatchedInvocationCount,
  };
}

async function runRequestBindingDeploymentExample(options = {}) {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'lagrange-request-binding-example-'),
  );
  let node = null;
  try {
    const paths = {
      componentPath: path.join(temporaryRoot, EXAMPLE.COMPONENT_FILE),
      componentSourcePath: path.join(
        EXAMPLE_DIRECTORY,
        EXAMPLE.COMPONENT_SOURCE_FILE,
      ),
      ociOutputRoot: path.join(temporaryRoot, 'oci-layouts'),
    };
    const receipt = await buildComponent(paths);
    node = await bootExampleNode(
      path.join(temporaryRoot, NODE_DATA_DIRECTORY),
      {wsPort: options.wsPort},
    );
    const deployment = await deploy(node, receipt);
    const observations = await exerciseDeployment(node);
    const report = {
      artifact: {
        buildInputFingerprint: receipt.buildInputFingerprint,
        componentSource: path.relative(process.cwd(), paths.componentSourcePath),
        manifestDigest: deployment.binding.target.manifest_digest,
        ociManifestDigest: receipt.topManifestDescriptor.digest,
        packageId: deployment.binding.target.package_id,
      },
      binding: {
        exportName: deployment.binding.target.export_name,
        method: deployment.binding.source.method,
        name: deployment.binding.name,
        path: deployment.binding.source.path,
      },
      observations,
      passed: true,
    };
    if (options.print !== false) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  } finally {
    await node?.shutdown?.();
    await rm(temporaryRoot, {force: true, recursive: true});
  }
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  await runRequestBindingDeploymentExample();
}

export {
  REQUEST_ACCEPT,
  executeSql,
  request,
  runRequestBindingDeploymentExample,
  waitForReadyCell,
};
