#!/usr/bin/env node

import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

import Database from 'better-sqlite3';

import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
} from '../../src/constants/wasm-meta.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';

const execFileAsync = promisify(execFile);
const EXAMPLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(EXAMPLE_DIRECTORY, '../..');
const DEFAULT_REPORT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  'test-output/reports/dockerized-pg-client-compatibility-example/live',
);
const POSTGRES_IMAGE =
  'postgres@sha256:fceb6f86328c36f2438fae3b851b0cc57c4a7e69a58c866d9ce24281f2cf0c9c';
const POSTGRES_NETWORK_ALIAS = 'postgres';
const APPLICATION_PORT = 3000;
const DATABASE = 'portable_app';
const USER = 'portable_app';
const PASSWORD = 'portable-password';
const WRONG_PASSWORD = 'wrong-portable-password';
const MINIMUM_SCORE = 70;
const EXPECTED_RESPONSE = Object.freeze({
  rankings: Object.freeze([
    Object.freeze({id: 2, name: 'Grace', score: 97}),
    Object.freeze({id: 1, name: 'Ada', score: 91}),
    Object.freeze({id: 4, name: 'Margaret', score: 91}),
  ]),
});
const SQL_PARAMETER_PATTERN = /\$\d+/gu;
const SQL_SELECT_PATTERN = /^\s*(SELECT|WITH|PRAGMA)\b/iu;
const WAIT_TIMEOUT_MS = 30000;
const WAIT_INTERVAL_MS = 200;
const DOCKER_MAX_BUFFER = 8 * 1024 * 1024;
const DOCKER_EXECUTABLE = 'docker';
const TEXT_ENCODING = 'utf8';
const APPLICATION_PROCESS = Object.freeze({
  ENTRYPOINT: 'node',
  COMMAND: 'server.js',
});
const HTTP_EXPECTATION = Object.freeze({
  OK: 200,
  SERVICE_UNAVAILABLE: 503,
});
const LAGRANGE_RUNTIME = Object.freeze({
  HOST: '0.0.0.0',
  AUTH_MODE: 'password',
  TLS_MODE: 'require',
  PREPARED_STATUS: 'ready',
  STARTED_STATUS: 'running',
});
const DOCKER_ARGUMENT = Object.freeze({
  BUILD: 'build',
  CREATE: 'create',
  DATABASE: '--dbname',
  ENVIRONMENT: '--env',
  EXECUTE: 'exec',
  FILE: '--file',
  FORCE: '--force',
  FORMAT: '--format',
  IMAGE: 'image',
  IMAGE_ID_FILE: '--iidfile',
  INSPECT: 'inspect',
  NAME: '--name',
  NETWORK_COMMAND: 'network',
  NETWORK_OPTION: '--network',
  NETWORK_ALIAS: '--network-alias',
  PORT: 'port',
  POSTGRES_READY: 'pg_isready',
  PUBLISH: '--publish',
  REMOVE: 'rm',
  START: 'start',
  TAG: '--tag',
  USERNAME: '--username',
  VERSION: 'version',
});
const DOCKER_FORMAT = Object.freeze({
  APPLICATION_INSPECTION:
    '{{.Image}}|{{json .Config.Entrypoint}}|{{json .Config.Cmd}}',
  NETWORK_GATEWAY: '{{(index .IPAM.Config 0).Gateway}}',
  SERVER_VERSION: '{{.Server.Version}}',
});
const DOCKER_PATH = Object.freeze({
  BUILD_CONTEXT: 'examples/service-portability',
  DOCKERFILE: 'examples/service-portability/app/Dockerfile',
});
const RUN_STAGE = Object.freeze({
  DOCKER_PREFLIGHT: 'docker-preflight',
  IMAGE_BUILD: 'image-build',
  POSTGRES_START: 'postgres-start',
  POSTGRES_APPLICATION: 'postgres-application',
  LAGRANGE_START: 'lagrange-start',
  LAGRANGE_APPLICATION: 'lagrange-application',
  WRONG_PASSWORD_ATTACK: 'wrong-password-attack',
  WRONG_CA_ATTACK: 'wrong-ca-attack',
  FAILURE_SAFE_TEARDOWN_PROBE: 'failure-safe-teardown-probe',
});
const RUN_OUTCOME_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
});
const RUN_TEXT = Object.freeze({
  INSPECTION_SEPARATOR: '|',
  CLEANUP_SEPARATOR: ' ',
  PORT_REQUIRED: 'application container must publish its HTTP port',
  POSTGRES_READINESS: 'PostgreSQL readiness',
  DATABASE_REQUEST_FAILED: 'database request failed',
  LAGRANGE_LISTENER: 'lagrange listener',
  CLEANUP_FAILED: 'database portability example cleanup failed',
  INJECTED_CONTAINER_FAILURE: 'injected post-create container failure',
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runDocker(argumentsList) {
  return execFileAsync(DOCKER_EXECUTABLE, argumentsList, {
    cwd: REPOSITORY_ROOT,
    maxBuffer: DOCKER_MAX_BUFFER,
  });
}

async function waitUntil(check, description) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(WAIT_INTERVAL_MS);
  }
  throw new Error(`timed out waiting for ${description}`);
}

function createSqlRequestExecutor(database, observedRequests) {
  return async (request) => {
    assert.equal(isSqlRequest(request), true);
    observedRequests.push(request);
    const statement = request.statement.replace(SQL_PARAMETER_PATTERN, '?');
    const prepared = database.prepare(statement);
    if (SQL_SELECT_PATTERN.test(statement)) {
      return {
        success: true,
        rows: prepared.all(...request.parameters),
        columns: prepared.columns().map((column) => column.name),
      };
    }
    const result = prepared.run(...request.parameters);
    return {
      success: true,
      rows: [],
      changes: result.changes,
      rowCount: result.changes,
    };
  };
}

function createLagrangeDefinition() {
  return {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    runtimeKind: RUNTIME_KIND.NATIVE_JS,
    runtimeRef: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
    runtimeConfig: JSON.stringify({
      host: LAGRANGE_RUNTIME.HOST,
      authMode: LAGRANGE_RUNTIME.AUTH_MODE,
      tlsMode: LAGRANGE_RUNTIME.TLS_MODE,
    }),
  };
}

async function startLagrangeListener(observedRequests) {
  const database = new Database(':memory:');
  const definition = createLagrangeDefinition();
  const wiring = createRuntimeStartupWiring({
    pgwireCredentialEnv: {
      PGWIRE_AUTH_USER: USER,
      PGWIRE_AUTH_PASSWORD: PASSWORD,
      PGWIRE_AUTH_DATABASE: DATABASE,
    },
    pgwireTlsEnv: {
      PGWIRE_TLS_KEY_PATH: path.join(
        EXAMPLE_DIRECTORY,
        'certs/server-key.pem',
      ),
      PGWIRE_TLS_CERT_PATH: path.join(
        EXAMPLE_DIRECTORY,
        'certs/server-cert.pem',
      ),
    },
  });
  const runtime = wiring.serviceRuntimeLifecycle;
  runtime.setQueryExecutorFactory(() => ({
    executeRequest: createSqlRequestExecutor(database, observedRequests),
  }));
  const prepared = await runtime.prepare(definition, {nodeId: 'example-node'});
  assert.equal(prepared.status, LAGRANGE_RUNTIME.PREPARED_STATUS);
  const started = await runtime.start({
    ...definition,
    host: LAGRANGE_RUNTIME.HOST,
    port: 0,
  });
  assert.equal(started.status, LAGRANGE_RUNTIME.STARTED_STATUS);
  return {
    port: started.endpointIntent.port,
    async stop() {
      await runtime.stop({...definition, host: LAGRANGE_RUNTIME.HOST});
      database.close();
    },
  };
}

function buildApplicationEnvironment(overrides) {
  return {
    PORT: String(APPLICATION_PORT),
    DB_HOST: overrides.host,
    DB_PORT: String(overrides.port),
    DB_NAME: DATABASE,
    DB_USER: USER,
    DB_PASSWORD: overrides.password || PASSWORD,
    DB_TLS_MODE: overrides.tlsMode,
    ...(overrides.caFile ? {DB_TLS_CA_FILE: overrides.caFile} : {}),
    ...(overrides.servername ? {
      DB_TLS_SERVERNAME: overrides.servername,
    } : {}),
  };
}

function environmentArguments(environment) {
  return Object.entries(environment).flatMap(([name, value]) => [
    DOCKER_ARGUMENT.ENVIRONMENT,
    `${name}=${value}`,
  ]);
}

async function inspectApplicationContainer(containerName) {
  const {stdout} = await runDocker([
    DOCKER_ARGUMENT.INSPECT,
    DOCKER_ARGUMENT.FORMAT,
    DOCKER_FORMAT.APPLICATION_INSPECTION,
    containerName,
  ]);
  const [imageId, entrypoint, command] = stdout.trim().split(
    RUN_TEXT.INSPECTION_SEPARATOR,
  );
  return {
    imageId,
    entrypoint: JSON.parse(entrypoint),
    command: JSON.parse(command),
  };
}

async function inspectPublishedPort(containerName) {
  const {stdout} = await runDocker([
    DOCKER_ARGUMENT.PORT,
    containerName,
    `${APPLICATION_PORT}/tcp`,
  ]);
  const match = stdout.trim().match(/:(\d+)$/u);
  assert.ok(match, RUN_TEXT.PORT_REQUIRED);
  return Number.parseInt(match[1], 10);
}

async function launchApplication(options) {
  await runDocker([
    DOCKER_ARGUMENT.CREATE,
    DOCKER_ARGUMENT.NAME, options.containerName,
    DOCKER_ARGUMENT.NETWORK_OPTION, options.networkName,
    DOCKER_ARGUMENT.PUBLISH, `127.0.0.1::${APPLICATION_PORT}`,
    ...environmentArguments(options.environment),
    options.imageTag,
  ]);
  options.createdContainers.add(options.containerName);
  if (options.failAfterCreate === true) {
    throw new Error(RUN_TEXT.INJECTED_CONTAINER_FAILURE);
  }
  await runDocker([DOCKER_ARGUMENT.START, options.containerName]);
  const inspection = await inspectApplicationContainer(options.containerName);
  const hostPort = await inspectPublishedPort(options.containerName);
  await waitUntil(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${hostPort}/health`)).ok;
    } catch (_error) {
      return false;
    }
  }, `${options.containerName} HTTP listener`);
  return {hostPort, inspection};
}

async function requestRankings(hostPort) {
  const response = await fetch(`http://127.0.0.1:${hostPort}/rankings`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({minimumScore: MINIMUM_SCORE}),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function runApplicationStage(options) {
  const launched = await launchApplication(options);
  return {
    ...(await requestRankings(launched.hostPort)),
    container: launched.inspection,
  };
}

async function waitForPostgres(containerName) {
  await waitUntil(async () => {
    try {
      await runDocker([
        DOCKER_ARGUMENT.EXECUTE,
        containerName,
        DOCKER_ARGUMENT.POSTGRES_READY,
        DOCKER_ARGUMENT.USERNAME, USER,
        DOCKER_ARGUMENT.DATABASE, DATABASE,
      ]);
      return true;
    } catch (_error) {
      return false;
    }
  }, RUN_TEXT.POSTGRES_READINESS);
}

async function inspectNetworkGateway(networkName) {
  const {stdout} = await runDocker([
    DOCKER_ARGUMENT.NETWORK_COMMAND,
    DOCKER_ARGUMENT.INSPECT,
    DOCKER_ARGUMENT.FORMAT,
    DOCKER_FORMAT.NETWORK_GATEWAY,
    networkName,
  ]);
  return stdout.trim();
}

async function buildApplicationImage(imageTag, temporaryDirectory) {
  const imageIdFile = path.join(temporaryDirectory, 'application-image.id');
  await runDocker([
    DOCKER_ARGUMENT.BUILD,
    DOCKER_ARGUMENT.FILE, DOCKER_PATH.DOCKERFILE,
    DOCKER_ARGUMENT.IMAGE_ID_FILE, imageIdFile,
    DOCKER_ARGUMENT.TAG, imageTag,
    DOCKER_PATH.BUILD_CONTEXT,
  ]);
  return (await readFile(imageIdFile, TEXT_ENCODING)).trim();
}

async function startPostgres(containerName, networkName, createdContainers) {
  await runDocker([
    DOCKER_ARGUMENT.CREATE,
    DOCKER_ARGUMENT.NAME, containerName,
    DOCKER_ARGUMENT.NETWORK_OPTION, networkName,
    DOCKER_ARGUMENT.NETWORK_ALIAS, POSTGRES_NETWORK_ALIAS,
    DOCKER_ARGUMENT.ENVIRONMENT, `POSTGRES_DB=${DATABASE}`,
    DOCKER_ARGUMENT.ENVIRONMENT, `POSTGRES_USER=${USER}`,
    DOCKER_ARGUMENT.ENVIRONMENT, `POSTGRES_PASSWORD=${PASSWORD}`,
    POSTGRES_IMAGE,
  ]);
  createdContainers.add(containerName);
  await runDocker([DOCKER_ARGUMENT.START, containerName]);
  await waitForPostgres(containerName);
}

async function removeDockerResource(argumentsList, cleanupErrors) {
  try {
    await runDocker(argumentsList);
  } catch (_error) {
    cleanupErrors.push(argumentsList.join(RUN_TEXT.CLEANUP_SEPARATOR));
  }
}

async function writeLiveReport(reportDirectory, report) {
  await mkdir(reportDirectory, {recursive: true});
  const fileStamp = report.timestamp.replace(/[:.]/gu, '-');
  const reportPath = path.join(
    reportDirectory,
    `database-portability-${fileStamp}.report.json`,
  );
  await writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    TEXT_ENCODING,
  );
  return reportPath;
}

async function runDatabasePortabilityExample(options = {}) {
  const runId = randomUUID();
  const suffix = runId.slice(0, 8);
  const imageTag = `lagrange-portable-pg-app:${suffix}`;
  const networkName = `lagrange-portability-${suffix}`;
  const postgresContainer = `portable-postgres-${suffix}`;
  const temporaryDirectory = path.join(tmpdir(), `lagrange-portability-${runId}`);
  const cleanupErrors = [];
  const createdContainers = new Set();
  const observedRequests = [];
  let lagrangeListener = null;
  let runOutcome = {status: RUN_OUTCOME_STATUS.PENDING};
  let stage = RUN_STAGE.DOCKER_PREFLIGHT;
  await mkdir(temporaryDirectory, {recursive: true});
  try {
    await runDocker([
      DOCKER_ARGUMENT.VERSION,
      DOCKER_ARGUMENT.FORMAT,
      DOCKER_FORMAT.SERVER_VERSION,
    ]);
    stage = RUN_STAGE.IMAGE_BUILD;
    const imageId = await buildApplicationImage(imageTag, temporaryDirectory);
    await runDocker([
      DOCKER_ARGUMENT.NETWORK_COMMAND,
      DOCKER_ARGUMENT.CREATE,
      networkName,
    ]);
    const networkGateway = await inspectNetworkGateway(networkName);
    stage = RUN_STAGE.POSTGRES_START;
    await startPostgres(
      postgresContainer,
      networkName,
      createdContainers,
    );

    stage = options.failAfterFirstApplicationCreate === true ?
      RUN_STAGE.FAILURE_SAFE_TEARDOWN_PROBE :
      RUN_STAGE.POSTGRES_APPLICATION;
    const postgresEnvironment = buildApplicationEnvironment({
      host: 'postgres',
      port: 5432,
      tlsMode: 'disable',
    });
    const postgres = await runApplicationStage({
      containerName: `portable-app-postgres-${suffix}`,
      networkName,
      imageTag,
      environment: postgresEnvironment,
      createdContainers,
      failAfterCreate: options.failAfterFirstApplicationCreate,
    });
    assert.equal(postgres.status, HTTP_EXPECTATION.OK);
    assert.deepEqual(postgres.body, EXPECTED_RESPONSE);

    stage = RUN_STAGE.LAGRANGE_START;
    lagrangeListener = await startLagrangeListener(observedRequests);
    const lagrangeEnvironment = buildApplicationEnvironment({
      host: networkGateway,
      port: lagrangeListener.port,
      tlsMode: 'verify-full',
      caFile: '/app/certs/lagrange-ca.pem',
      servername: 'localhost',
    });
    stage = RUN_STAGE.LAGRANGE_APPLICATION;
    const lagrange = await runApplicationStage({
      containerName: `portable-app-lagrange-${suffix}`,
      networkName,
      imageTag,
      environment: lagrangeEnvironment,
      createdContainers,
    });
    assert.equal(lagrange.status, HTTP_EXPECTATION.OK);
    assert.deepEqual(lagrange.body, EXPECTED_RESPONSE);
    assert.deepEqual(lagrange.body, postgres.body);

    const requestsBeforeAttacks = observedRequests.length;
    assert.ok(requestsBeforeAttacks > 0);
    stage = RUN_STAGE.WRONG_PASSWORD_ATTACK;
    const wrongPassword = await runApplicationStage({
      containerName: `portable-app-wrong-password-${suffix}`,
      networkName,
      imageTag,
      environment: {
        ...lagrangeEnvironment,
        DB_PASSWORD: WRONG_PASSWORD,
      },
      createdContainers,
    });
    assert.equal(wrongPassword.status, HTTP_EXPECTATION.SERVICE_UNAVAILABLE);
    assert.deepEqual(wrongPassword.body, {
      error: RUN_TEXT.DATABASE_REQUEST_FAILED,
    });
    assert.equal(observedRequests.length, requestsBeforeAttacks);

    stage = RUN_STAGE.WRONG_CA_ATTACK;
    const wrongCa = await runApplicationStage({
      containerName: `portable-app-wrong-ca-${suffix}`,
      networkName,
      imageTag,
      environment: {
        ...lagrangeEnvironment,
        DB_TLS_CA_FILE: '/app/certs/wrong-ca.pem',
      },
      createdContainers,
    });
    assert.equal(wrongCa.status, HTTP_EXPECTATION.SERVICE_UNAVAILABLE);
    assert.deepEqual(wrongCa.body, {error: RUN_TEXT.DATABASE_REQUEST_FAILED});
    assert.equal(observedRequests.length, requestsBeforeAttacks);

    const inspections = [
      postgres.container,
      lagrange.container,
      wrongPassword.container,
      wrongCa.container,
    ];
    for (const inspection of inspections) {
      assert.equal(inspection.imageId, imageId);
      assert.deepEqual(inspection.entrypoint, [APPLICATION_PROCESS.ENTRYPOINT]);
      assert.deepEqual(inspection.command, [APPLICATION_PROCESS.COMMAND]);
    }

    const report = {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      runId,
      producer: 'service-portability-database-example',
      fidelity: 'live-integration',
      image: {
        id: imageId,
        buildCount: 1,
        entrypoint: [APPLICATION_PROCESS.ENTRYPOINT],
        command: [APPLICATION_PROCESS.COMMAND],
        allContainerImageIdsMatch: true,
      },
      configuration: {
        postgres: Object.keys(postgresEnvironment).sort(),
        lagrange: Object.keys(lagrangeEnvironment).sort(),
        allowedDifferenceClasses: [
          'connection',
          'credential',
          'tls',
          'lagrange_service_metadata',
        ],
      },
      stages: {
        postgres: {status: 'PASS', response: postgres.body},
        lagrange: {
          status: 'PASS',
          response: lagrange.body,
          productionWiring: true,
          passwordAuthentication: true,
          verifiedTls: true,
          sqlRequests: requestsBeforeAttacks,
        },
      },
      attacks: {
        wrongPassword: 'rejected_before_sql',
        wrongCertificateAuthority: 'rejected_before_sql',
      },
      parity: {
        status: 'PASS',
        expected: EXPECTED_RESPONSE,
      },
      supportedSlice: [
        'pg Pool',
        'parameterized extended queries',
        'BEGIN/COMMIT transaction',
        'DROP/CREATE TABLE',
        'multi-row INSERT',
        'filtered SELECT with deterministic ORDER BY',
      ],
    };
    const reportPath = await writeLiveReport(
      options.reportDirectory || DEFAULT_REPORT_DIRECTORY,
      report,
    );
    runOutcome = {
      status: RUN_OUTCOME_STATUS.SUCCEEDED,
      value: {report, reportPath},
    };
  } catch (_error) {
    runOutcome = {
      status: RUN_OUTCOME_STATUS.FAILED,
      error: new Error(`database portability example failed during ${stage}`),
    };
  } finally {
    for (const containerName of [...createdContainers].reverse()) {
      await removeDockerResource([
        DOCKER_ARGUMENT.REMOVE,
        DOCKER_ARGUMENT.FORCE,
        containerName,
      ], cleanupErrors);
    }
    if (lagrangeListener) {
      try {
        await lagrangeListener.stop();
      } catch (_error) {
        cleanupErrors.push(RUN_TEXT.LAGRANGE_LISTENER);
      }
    }
    await removeDockerResource([
      DOCKER_ARGUMENT.NETWORK_COMMAND,
      DOCKER_ARGUMENT.REMOVE,
      networkName,
    ], cleanupErrors);
    await removeDockerResource([
      DOCKER_ARGUMENT.IMAGE,
      DOCKER_ARGUMENT.REMOVE,
      DOCKER_ARGUMENT.FORCE,
      imageTag,
    ], cleanupErrors);
    await rm(temporaryDirectory, {recursive: true, force: true});
  }
  if (cleanupErrors.length > 0 && options.failOnCleanupError) {
    throw new Error(RUN_TEXT.CLEANUP_FAILED);
  }
  if (runOutcome.status === RUN_OUTCOME_STATUS.FAILED) {
    throw runOutcome.error;
  }
  assert.equal(runOutcome.status, RUN_OUTCOME_STATUS.SUCCEEDED);
  return runOutcome.value;
}

async function runCli() {
  const {report, reportPath} = await runDatabasePortabilityExample({
    failOnCleanupError: true,
  });
  process.stdout.write(
    `service-portability database comparison: ${report.parity.status}\n` +
    `image: ${report.image.id}\n` +
    `report: ${path.relative(REPOSITORY_ROOT, reportPath)}\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  EXPECTED_RESPONSE,
  runDatabasePortabilityExample,
};
