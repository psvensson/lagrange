#!/usr/bin/env node

import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  buildBindingPayload,
  buildInstallPayload,
  buildManifest,
} from '../request-binding-deployment/request-binding-example-contract.js';
import {
  bootExampleNode,
} from '../request-binding-deployment/request-binding-example-node.js';
import {
  executeSql,
  request,
  waitForReadyCell,
} from '../request-binding-deployment/run-request-binding-deployment.js';
import {
  JS_EXAMPLE,
  buildJsAccessPayload,
  buildJsComponent,
} from './js-request-binding-example-contract.js';

const EXAMPLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_TABLE_DDL =
  'CREATE TABLE "global.js_request_binding_ledger" ' +
  '(key INTEGER PRIMARY KEY, value INTEGER)';
const LEDGER_SELECT =
  'SELECT key, value FROM "global.js_request_binding_ledger" ORDER BY key';
const LOCAL_STR_STRING = 'string';
const HTTP_STATUS_ACCEPTED = 202;
const COMPONENT_RESPONSE_HEADER = 'x-lagrange-cell';
const FIRST_ENTRY = Object.freeze({amount: 10, key: 1});
const SECOND_ENTRY = Object.freeze({amount: 5, key: 2});
const DENY_COMMAND = 'deny';
const NODE_DATA_DIRECTORY = 'node-data';
const TEMPORARY_PREFIX = 'lagrange-js-request-binding-example-';
const EXAMPLE_WS_PORT = 18_682;

async function ledgerRows(node) {
  const result = await executeSql(node, LEDGER_SELECT);
  return (result.rows || []).map((row) => ({
    key: Number(row.key),
    value: Number(row.value),
  }));
}

async function deploy(node, receipt) {
  await executeSql(node, LEDGER_TABLE_DDL);
  const manifest = buildManifest(receipt, JS_EXAMPLE);
  const installed = await executeSql(
    node,
    'INSTALL SERVICE $1',
    [JSON.stringify(buildInstallPayload(manifest, receipt, JS_EXAMPLE))],
  );
  const packageId = installed.rows?.[0]?.package_id;
  assert.equal(typeof packageId, LOCAL_STR_STRING);
  const binding = buildBindingPayload(packageId, manifest, JS_EXAMPLE);
  const created = await executeSql(
    node,
    'CREATE BINDING $1',
    [JSON.stringify(binding)],
  );
  const access = await executeSql(
    node,
    'CONFIGURE SERVICE ACCESS $1',
    [JSON.stringify(buildJsAccessPayload())],
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
  const route = await waitForReadyCell(node, JS_EXAMPLE);

  const first = await request(node, JS_EXAMPLE.PATH, FIRST_ENTRY);
  assert.equal(first.status, HTTP_STATUS_ACCEPTED, JSON.stringify(first));
  assert.equal(
    first.headers[COMPONENT_RESPONSE_HEADER],
    JS_EXAMPLE.BINDING_NAME,
  );
  assert.equal(first.body, 'stored 10 at key 1');
  assert.deepEqual(await ledgerRows(node), [{key: 1, value: 10}]);

  const second = await request(node, JS_EXAMPLE.PATH, SECOND_ENTRY);
  assert.equal(second.status, HTTP_STATUS_ACCEPTED, JSON.stringify(second));
  assert.equal(second.body, 'stored 15 at key 2');
  const afterSecond = await ledgerRows(node);
  assert.deepEqual(afterSecond, [
    {key: 1, value: 10},
    {key: 2, value: 15},
  ]);

  const denied = await request(node, JS_EXAMPLE.PATH, DENY_COMMAND);
  assert.equal(denied.body.invoked, true, JSON.stringify(denied));
  assert.match(denied.body.error, /table slot 1/u);
  assert.deepEqual(await ledgerRows(node), afterSecond);

  return {
    denied,
    first,
    ledgerRows: afterSecond,
    readyCell: route,
    second,
  };
}

async function runJsRequestBindingDeploymentExample(options = {}) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), TEMPORARY_PREFIX));
  let node = null;
  try {
    const paths = {
      componentPath: path.join(temporaryRoot, JS_EXAMPLE.COMPONENT_FILE),
      componentSourcePath: path.join(
        EXAMPLE_DIRECTORY,
        JS_EXAMPLE.COMPONENT_SOURCE_FILE,
      ),
      ociOutputRoot: path.join(temporaryRoot, 'oci-layouts'),
    };
    const receipt = await buildJsComponent(paths);
    node = await bootExampleNode(
      path.join(temporaryRoot, NODE_DATA_DIRECTORY),
      {wsPort: EXAMPLE_WS_PORT},
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
  await runJsRequestBindingDeploymentExample();
}

export {
  runJsRequestBindingDeploymentExample,
};
