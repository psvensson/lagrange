import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';

import pg from 'pg';

import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
} from '../../src/constants/wasm-meta.js';
import {withExecutedStatementType} from
  '../../src/query/application-database-result.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {SERVICE_LIFECYCLE_COMMAND} from
  '../../src/service/service-lifecycle-command-contract.js';
import {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_COMMAND_PATH,
  SERVICE_LIFECYCLE_COMMAND_STAGE,
  ServiceLifecycleCommandError,
  failureResult,
} from '../../src/service/service-lifecycle-command-failure.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRYPOINT = path.join(PROJECT_ROOT, 'src/sea-entry.js');
const HOST = '127.0.0.1';
const DATABASE = 'service_cli';
const USER = 'service_cli';
const PASSWORD = 'service-cli-password';
const WRONG_PASSWORD = 'wrong-service-cli-password';
const SERVICE_NAME = 'analytics-worker';
const IDEMPOTENCY_KEY = 'install-analytics-worker';
const REMOVE_IDEMPOTENCY_KEY = 'remove-analytics-worker';
const INSTALL_SQL = 'INSTALL SERVICE $1';
const REMOVE_SQL = 'REMOVE SERVICE $1';
const STATUS_SQL = 'SHOW SERVICE $1';
const LIST_SQL = 'SHOW SERVICES';
const REJECTED_SERVICE_NAME = 'rejected-service';
const REJECTION_MESSAGE = 'typed service lifecycle rejection';
// The wire's SQLSTATE for a lifecycle failure result: it carries none, so
// the wire answers XX000 (a named SQLSTATE for lifecycle rejections is an
// owner decision not taken here).
const LIFECYCLE_REJECTION_SQLSTATE = 'XX000';
const CHILD_TIMEOUT_MS = 15_000;
const SUCCESS_EXIT_CODE = 0;
const CONTAINER_MEDIA_TYPE =
  'application/vnd.oci.image.manifest.v1+json';
const DIGEST = `sha256:${'a'.repeat(64)}`;

const INSTALL_ROW = Object.freeze({
  action: 'install',
  desired_state: 'installed',
  installation_id: 'installation-install',
  operation_id: 'operation-install',
  operation_status: 'durable',
  package_id: 'package-install',
  revision_id: 'revision-install',
  rollout_state: 'recorded_not_running',
  service_definition_id: 'definition-install',
  service_name: SERVICE_NAME,
});
const STATUS_ROW = Object.freeze({
  desired_state: 'installed',
  installation_id: 'installation-status',
  latest_failure_id: null,
  operation_id: 'operation-status',
  revision_id: 'revision-status',
  rollout_state: 'recorded_not_running',
  service_definition_id: 'definition-status',
  service_name: SERVICE_NAME,
  version: '1.0.0',
});
const REMOVE_ROW = Object.freeze({
  action: 'remove',
  desired_state: 'removed',
  installation_id: 'installation-remove',
  operation_id: 'operation-remove',
  operation_status: 'durable',
  package_id: 'package-remove',
  revision_id: 'revision-remove',
  rollout_state: 'recorded_not_running',
  service_definition_id: 'definition-remove',
  service_name: SERVICE_NAME,
});
const LIST_ROWS = Object.freeze([
  Object.freeze({...STATUS_ROW, service_name: 'zeta-service'}),
  Object.freeze({
    ...STATUS_ROW,
    desired_state: 'removed',
    service_name: 'alpha-service',
  }),
]);
const LARGE_LIST_ROW_COUNT = 20_000;
let listResponseRows = LIST_ROWS;

function definition() {
  return {
    runtimeConfig: JSON.stringify({
      authMode: 'password',
      host: HOST,
      tlsMode: 'disable',
    }),
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
  };
}

function manifest() {
  return {
    schema_version: 3,
    name: SERVICE_NAME,
    version: '1.0.0',
    exports: [{name: 'serve', interface: 'request_v1'}],
    artifact: {
      type: 'oci',
      ref: `registry.example.test/${SERVICE_NAME}@${DIGEST}`,
      digest: DIGEST,
      media_type: CONTAINER_MEDIA_TYPE,
    },
    runtime: {kind: RUNTIME_KIND.OCI_CONTAINER},
  };
}

// The lifecycle command owner's answer for each statement; the SQL engine
// stamps the executed command on it (withExecutedStatementType), exactly as
// sql-query-engine-service-lifecycle-execution does for the real owner.
function ownerAnswerFor(request) {
  if (request.statement === INSTALL_SQL) {
    return {columns: Object.keys(INSTALL_ROW), rows: [INSTALL_ROW], success: true};
  }
  if (request.statement === REMOVE_SQL) {
    return {columns: Object.keys(REMOVE_ROW), rows: [REMOVE_ROW], success: true};
  }
  if (request.statement === LIST_SQL) {
    return {
      columns: Object.keys(listResponseRows[0]),
      rows: listResponseRows,
      success: true,
    };
  }
  const payload = JSON.parse(request.parameters[0]);
  if (payload.service_name === 'missing-service') {
    return {columns: Object.keys(STATUS_ROW), rows: [], success: true};
  }
  if (payload.service_name === REJECTED_SERVICE_NAME) {
    return failureResult(new ServiceLifecycleCommandError(
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.SERVICE_NOT_FOUND,
      SERVICE_LIFECYCLE_COMMAND_STAGE.CATALOG,
      SERVICE_LIFECYCLE_COMMAND_PATH.SERVICE_NAME,
      REJECTION_MESSAGE,
    ), SERVICE_LIFECYCLE_COMMAND.SHOW_ONE);
  }
  return {columns: Object.keys(STATUS_ROW), rows: [STATUS_ROW], success: true};
}

const LIFECYCLE_COMMAND_BY_SQL = new Map([
  [INSTALL_SQL, SERVICE_LIFECYCLE_COMMAND.INSTALL],
  [REMOVE_SQL, SERVICE_LIFECYCLE_COMMAND.REMOVE],
  [LIST_SQL, SERVICE_LIFECYCLE_COMMAND.SHOW_ALL],
  [STATUS_SQL, SERVICE_LIFECYCLE_COMMAND.SHOW_ONE],
]);

function responseFor(request) {
  const command = LIFECYCLE_COMMAND_BY_SQL.get(request.statement);
  if (command === undefined) {
    return {error: 'unexpected SQL statement', success: false};
  }
  return withExecutedStatementType(ownerAnswerFor(request), command);
}

function runCli(port, args, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRYPOINT, 'service', ...args], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: '2',
        PGDATABASE: DATABASE,
        PGHOST: HOST,
        PGPASSWORD: PASSWORD,
        PGPORT: String(port),
        PGSSLMODE: 'disable',
        PGUSER: USER,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let spawnError;
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => {
      spawnError = error;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, CHILD_TIMEOUT_MS);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (spawnError) {
        reject(spawnError);
        return;
      }
      if (signal) {
        reject(new Error(`service CLI terminated by ${signal}`));
        return;
      }
      resolve({exitCode: code, stderr, stdout});
    });
  });
}

function parsedOutput(result) {
  assert.equal(result.exitCode, SUCCESS_EXIT_CODE, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.endsWith('\n'), true);
  return JSON.parse(result.stdout);
}

describe('shipped service lifecycle CLI over production PG-wire', () => {
  const requests = [];
  const runtimeDefinition = definition();
  const wiring = createRuntimeStartupWiring({
    pgwireCredentialEnv: {
      PGWIRE_AUTH_DATABASE: DATABASE,
      PGWIRE_AUTH_PASSWORD: PASSWORD,
      PGWIRE_AUTH_USER: USER,
    },
  });
  const runtime = wiring.serviceRuntimeLifecycle;
  let port;
  let root;
  let manifestPath;
  let configPath;

  before(async () => {
    runtime.setQueryExecutorFactory(() => ({
      async executeRequest(request) {
        assert.equal(isSqlRequest(request), true);
        requests.push(request);
        return responseFor(request);
      },
    }));
    assert.equal(
      (await runtime.prepare(runtimeDefinition, {nodeId: 'service-cli-node'}))
        .status,
      'ready',
    );
    const started = await runtime.start({
      ...runtimeDefinition,
      host: HOST,
      port: 0,
    });
    assert.equal(started.status, 'running');
    port = started.endpointIntent.port;
    root = await mkdtemp(path.join(tmpdir(), 'lagrange-service-cli-pgwire-'));
    manifestPath = path.join(root, 'lagrange-service.json');
    configPath = path.join(root, 'config.json');
    await Promise.all([
      writeFile(manifestPath, `${JSON.stringify(manifest())}\n`),
      writeFile(configPath, '{"replicas":2}\n'),
    ]);
  });

  after(async () => {
    if (port !== undefined) {
      await runtime.stop({...runtimeDefinition, host: HOST, port});
    }
    if (root !== undefined) {
      await rm(root, {recursive: true, force: true});
    }
  });

  it('submits exact lifecycle SQL envelopes and prints server rows', async () => {
    const install = parsedOutput(await runCli(port, [
      'install',
      manifestPath,
      '--idempotency-key',
      IDEMPOTENCY_KEY,
      '--config',
      configPath,
    ]));
    const list = parsedOutput(await runCli(port, ['list']));
    const status = parsedOutput(await runCli(port, ['status', SERVICE_NAME]));
    const remove = parsedOutput(await runCli(port, [
      'remove',
      SERVICE_NAME,
      '--idempotency-key',
      REMOVE_IDEMPOTENCY_KEY,
    ]));

    assert.deepEqual(install, {rows: [INSTALL_ROW]});
    assert.deepEqual(list, {rows: LIST_ROWS});
    assert.deepEqual(status, {rows: [STATUS_ROW]});
    assert.deepEqual(remove, {rows: [REMOVE_ROW]});
    assert.equal(requests.length, 4);

    const installPayload = {
      config: {replicas: 2},
      idempotency_key: IDEMPOTENCY_KEY,
      manifest: manifest(),
    };
    assert.equal(requests[0].statement, INSTALL_SQL);
    assert.deepEqual(requests[0].parameters, [JSON.stringify(installPayload)]);
    assert.equal(requests[1].statement, LIST_SQL);
    assert.deepEqual(requests[1].parameters, []);
    assert.equal(requests[2].statement, STATUS_SQL);
    assert.deepEqual(requests[2].parameters, [JSON.stringify({
      service_name: SERVICE_NAME,
    })]);
    assert.equal(requests[3].statement, REMOVE_SQL);
    assert.deepEqual(requests[3].parameters, [JSON.stringify({
      idempotency_key: REMOVE_IDEMPOTENCY_KEY,
      service_name: SERVICE_NAME,
    })]);
    for (const request of requests) {
      assert.equal(request.tenantId, DATABASE);
      assert.equal(request.securityContext.principal, USER);
    }
  });

  it('fails empty status and typed server rejection without invented output',
    async () => {
      const empty = await runCli(port, ['status', 'missing-service']);
      assert.notEqual(empty.exitCode, SUCCESS_EXIT_CODE);
      assert.equal(empty.stdout, '');
      assert.match(
        empty.stderr,
        /^lagrange service status failed: status returned no service\n$/u,
      );

      const rejected = await runCli(port, ['status', REJECTED_SERVICE_NAME]);
      assert.notEqual(rejected.exitCode, SUCCESS_EXIT_CODE);
      assert.equal(rejected.stdout, '');
      assert.equal(
        rejected.stderr,
        'lagrange service status failed: PostgreSQL lifecycle query ' +
          `rejected (${LIFECYCLE_REJECTION_SQLSTATE})\n`,
      );

      // The CLI prints only the SQLSTATE; the wire carries the owner's
      // typed message.
      const client = new pg.Client({
        database: DATABASE,
        host: HOST,
        password: PASSWORD,
        port,
        ssl: false,
        user: USER,
      });
      await client.connect();
      try {
        await assert.rejects(
          client.query({
            text: STATUS_SQL,
            values: [JSON.stringify({service_name: REJECTED_SERVICE_NAME})],
          }),
          {code: LIFECYCLE_REJECTION_SQLSTATE, message: REJECTION_MESSAGE},
        );
      } finally {
        await client.end();
      }
    });

  it('flushes a large authenticated list response before exiting', async () => {
    const largeRows = Array.from({length: LARGE_LIST_ROW_COUNT}, (_, index) => ({
      ...STATUS_ROW,
      service_name: `service-${String(index).padStart(5, '0')}`,
    }));
    listResponseRows = largeRows;
    try {
      const result = await runCli(port, ['list']);
      const output = parsedOutput(result);
      assert.equal(output.rows.length, LARGE_LIST_ROW_COUNT);
      assert.deepEqual(output.rows[0], largeRows[0]);
      assert.deepEqual(output.rows.at(-1), largeRows.at(-1));
    } finally {
      listResponseRows = LIST_ROWS;
    }
  });

  it('rejects bad credentials before creating a SQL request', async () => {
    const requestsBefore = requests.length;
    const result = await runCli(port, ['list'], {PGPASSWORD: WRONG_PASSWORD});

    assert.notEqual(result.exitCode, SUCCESS_EXIT_CODE);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /authentication failed/iu);
    assert.doesNotMatch(result.stderr, new RegExp(WRONG_PASSWORD, 'u'));
    assert.equal(requests.length, requestsBefore);
  });
});
