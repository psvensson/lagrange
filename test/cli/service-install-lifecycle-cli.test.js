import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {parse} from 'espree';

import {createServiceProject} from
  '../../src/cli/service-project-scaffold.js';
import {createServiceLifecycleSqlClient} from
  '../../src/cli/service-lifecycle-sql-client.js';
import {runEntrypoint} from '../../src/test-helpers/run-entrypoint.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const ENTRYPOINT = path.join(PROJECT_ROOT, 'src/sea-entry.js');
const ROUTER_PATH = path.join(
  PROJECT_ROOT,
  'src/cli/service-command-router.js',
);
const COMMAND_OWNER_PATH = path.join(
  PROJECT_ROOT,
  'src/cli/service-lifecycle-command.js',
);
const SQL_CLIENT_PATH = path.join(
  PROJECT_ROOT,
  'src/cli/service-lifecycle-sql-client.js',
);
const PROJECT_INPUT_PATH = path.join(
  PROJECT_ROOT,
  'src/cli/service-project-build-input.js',
);
const LIFECYCLE_OWNER_SPECIFIER = './service-lifecycle-command.js';
const LIFECYCLE_OWNER_LOADER = 'loadServiceLifecycleCommand';
const PIPELINE_OWNER_SPECIFIER = './service-pipeline-router.js';
const PIPELINE_OWNER_LOADER = 'loadServicePipelineCommand';
const PLATFORM = 'linux/amd64';
const IDEMPOTENCY_KEY = 'install-weather-service';
const INSTALL_SQL = 'INSTALL SERVICE $1';
const MANIFEST_TEMPLATE_NAME = 'lagrange-service.template.json';
const VALID_DIGEST = `sha256:${'a'.repeat(64)}`;
const OVERSIZED_INPUT_BYTES = (4 * 1024 * 1024) + 1;
const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const USAGE_EXIT_CODE = 2;

function statusRow(serviceName = 'weather-service') {
  return {
    desired_state: 'installed',
    installation_id: `installation-${serviceName}`,
    latest_failure_id: null,
    operation_id: `operation-${serviceName}`,
    revision_id: `revision-${serviceName}`,
    rollout_state: 'recorded_not_running',
    service_definition_id: `definition-${serviceName}`,
    service_name: serviceName,
    version: '1.0.0',
  };
}

function mutationRow(serviceName = 'weather-service') {
  return {
    action: 'install',
    desired_state: 'installed',
    installation_id: `installation-${serviceName}`,
    operation_id: `operation-${serviceName}`,
    operation_status: 'durable',
    package_id: `package-${serviceName}`,
    revision_id: `revision-${serviceName}`,
    rollout_state: 'recorded_not_running',
    service_definition_id: `definition-${serviceName}`,
    service_name: serviceName,
  };
}

function collectOwnedDynamicLoader(node, imports) {
  const loaderBody = node.init?.type === 'ArrowFunctionExpression' ?
    node.init.body : null;
  if (node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      loaderBody?.type === 'ImportExpression') {
    imports.ownedDynamic.push({
      name: node.id.name,
      specifier: loaderBody.source.value,
    });
  }
}

function collectImports(
  node,
  imports = {dynamic: [], ownedDynamic: [], static: []},
) {
  if (!node || typeof node !== 'object') return imports;
  collectOwnedDynamicLoader(node, imports);
  if (node.type === 'ImportDeclaration') {
    imports.static.push(node.source.value);
  }
  if (node.type === 'ImportExpression') {
    imports.dynamic.push(node.source.value);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) collectImports(child, imports);
    } else if (value && typeof value === 'object') {
      collectImports(value, imports);
    }
  }
  return imports;
}

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'lagrange-service-cli-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  return root;
}

async function loadLifecycleCommandOwner() {
  return import('../../src/cli/service-lifecycle-command.js');
}

describe('service lifecycle CLI contract', () => {
  it('advertises only the sealed service command grammar', async () => {
    const result = await runEntrypoint(ENTRYPOINT, {
      args: ['service', '--help'],
      timeoutMs: 15_000,
    });

    assert.equal(result.exitCode, SUCCESS_EXIT_CODE);
    assert.equal(result.stderr, '');
    for (const command of [
      'init <directory>',
      'install <manifest-file>',
      'list',
      'status <service-name>',
      'remove <service-name>',
    ]) {
      assert.match(result.stdout, new RegExp(command.replaceAll('<', '\\<')));
    }
    assert.doesNotMatch(result.stdout, /upgrade|registry|websocket/iu);
  });

  it('keeps lifecycle dependencies behind one literal dynamic import', async () => {
    const source = await readFile(ROUTER_PATH, 'utf8');
    const lifecycleSources = await Promise.all([
      COMMAND_OWNER_PATH,
      SQL_CLIENT_PATH,
      PROJECT_INPUT_PATH,
      ENTRYPOINT,
    ].map((sourcePath) => readFile(sourcePath, 'utf8')));
    const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
    const imports = collectImports(ast);

    assert.deepEqual(imports.static.sort(), [
      './service-wasm-scaffold.js',
    ]);
    assert.deepEqual(imports.dynamic.sort(), [
      LIFECYCLE_OWNER_SPECIFIER,
      PIPELINE_OWNER_SPECIFIER,
    ]);
    assert.deepEqual(imports.ownedDynamic, [{
      name: LIFECYCLE_OWNER_LOADER,
      specifier: LIFECYCLE_OWNER_SPECIFIER,
    }, {
      name: PIPELINE_OWNER_LOADER,
      specifier: PIPELINE_OWNER_SPECIFIER,
    }]);
    assert.doesNotMatch(
      source,
      /from\s+['"](?:pg|node:(?:child_process|net)|\.\.\/service\/service-local-oci-layout-builder\.js)['"]/u,
    );
    assert.doesNotMatch(
      [source, ...lifecycleSources].join('\n'),
      /websocket|lagrange-admin|catalog-owner|service-lifecycle-command-owner|reconciler|runtime-activation|direct-table|fallback|fetch\s*\(/iu,
    );
  });

  it('rejects malformed lifecycle argv before build or SQL creation', async () => {
    const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
    const dependencyCalls = [];
    const dependencies = {
      createLocalOciLayoutBuilder() {
        dependencyCalls.push('builder');
        throw new Error('builder must not be created for invalid argv');
      },
      createSqlClient() {
        dependencyCalls.push('sql');
        throw new Error('SQL must not be created for invalid argv');
      },
      writeOutput() {
        dependencyCalls.push('output');
      },
    };
    const attacks = [
      [],
      ['install'],
      ['install', 'manifest.json', '--idempotency-key'],
      ['install', 'manifest.json', '--idempotency-key', 'key', 'extra'],
      ['install', 'manifest.json', '--idempotency-key', 'one',
        '--idempotency-key', 'two'],
      ['install', 'manifest.json', '--idempotency-key', '   '],
      ['install', 'manifest.json', '--idempotency-key', 'x'.repeat(257)],
      ['dev-install', 'project', '--idempotency-key', 'key',
        '--platform', PLATFORM],
      ['dev-install', 'project', '--idempotency-key', 'key',
        '--platform', 'invalid', '--source-date-epoch', '1'],
      ['dev-install', 'project', '--idempotency-key', 'key',
        '--platform', PLATFORM, '--source-date-epoch', '-1'],
      ['list', 'extra'],
      ['status'],
      ['status', 'Bad_Name'],
      ['status', 'service', 'extra'],
      ['remove', 'service'],
      ['remove', 'bad/name', '--idempotency-key', 'key'],
      ['remove', 'service', '--idempotency-key', 'key', '--unknown'],
    ];

    for (const argv of attacks) {
      assert.equal(
        await runServiceLifecycleCommand(argv, dependencies),
        USAGE_EXIT_CODE,
        argv.join(' '),
      );
    }
    assert.deepEqual(dependencyCalls, []);
  });

  it('publishes output only after the SQL operation fully settles', async () => {
    const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
    const output = [];
    const row = statusRow();
    let finishExecute;
    const executeResult = new Promise((resolve) => {
      finishExecute = () => resolve({rows: [row]});
    });
    const command = runServiceLifecycleCommand(['list'], {
      createSqlClient: () => ({execute: () => executeResult}),
      writeOutput: (line) => output.push(line),
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(output, []);
    finishExecute();
    assert.equal(await command, SUCCESS_EXIT_CODE);
    assert.deepEqual(output, [JSON.stringify({rows: [row]})]);

    const rejectedOutput = [];
    assert.equal(await runServiceLifecycleCommand(['list'], {
      createSqlClient: () => ({
        async execute() {
          throw new Error('injected disconnect failure');
        },
      }),
      writeOutput: (line) => rejectedOutput.push(line),
    }), FAILURE_EXIT_CODE);
    assert.deepEqual(rejectedOutput, []);
  });

  it('rejects malformed result envelopes without retry or success output',
    async () => {
      const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
      const attacks = [
        {argv: ['list'], result: {rows: null}},
        {argv: ['status', 'weather-service'], result: {rows: []}},
        {
          argv: ['remove', 'weather-service', '--idempotency-key', 'remove-key'],
          result: {
            rows: [
              {service_name: 'weather-service'},
              {service_name: 'weather-service'},
            ],
          },
        },
        {
          argv: ['list'],
          result: {rows: [{fallback_transport: 'forbidden', service_name: 'x'}]},
        },
        {
          argv: ['list'],
          result: {rows: [{
            ...Object.fromEntries(
              Object.keys(statusRow()).map((field) => [field, null]),
            ),
            service_name: 'weather-service',
          }]},
        },
        {
          argv: ['remove', 'weather-service', '--idempotency-key', 'null-row'],
          result: {rows: [{
            ...Object.fromEntries(
              Object.keys(mutationRow()).map((field) => [field, null]),
            ),
            service_name: 'weather-service',
          }]},
        },
      ];
      for (const attack of attacks) {
        let executeCalls = 0;
        const output = [];
        assert.equal(await runServiceLifecycleCommand(attack.argv, {
          createSqlClient: () => ({
            async execute() {
              executeCalls += 1;
              return attack.result;
            },
          }),
          writeError: () => {},
          writeOutput: (line) => output.push(line),
        }), FAILURE_EXIT_CODE);
        assert.equal(executeCalls, 1);
        assert.deepEqual(output, []);
      }

      let ambiguousCalls = 0;
      assert.equal(await runServiceLifecycleCommand(['list'], {
        createSqlClient: () => ({
          async execute() {
            ambiguousCalls += 1;
            throw new Error('ambiguous query result');
          },
        }),
        writeError: () => {},
        writeOutput: () => assert.fail('ambiguous result must not print success'),
      }), FAILURE_EXIT_CODE);
      assert.equal(ambiguousCalls, 1);
    });

  it('owns one pg client lifecycle and treats disconnect as ambiguous',
    async () => {
      const calls = [];
      class SuccessfulClient {
        async connect() {
          calls.push('connect');
        }

        async query(request) {
          calls.push({query: request});
          return {rows: [{service_name: 'weather-service'}]};
        }

        async end() {
          calls.push('end');
        }
      }
      const client = createServiceLifecycleSqlClient({
        loadPg: async () => ({Client: SuccessfulClient}),
      });
      assert.deepEqual(await client.execute('SHOW SERVICES', []), {
        rows: [{service_name: 'weather-service'}],
      });
      assert.deepEqual(calls, [
        'connect',
        {query: {text: 'SHOW SERVICES', values: []}},
        'end',
      ]);

      let queryCalls = 0;
      let endCalls = 0;
      class DisconnectingClient {
        async connect() {}

        async query() {
          queryCalls += 1;
          return {rows: []};
        }

        async end() {
          endCalls += 1;
          throw new Error('connection close result unknown');
        }
      }
      const disconnecting = createServiceLifecycleSqlClient({
        loadPg: async () => ({Client: DisconnectingClient}),
      });
      await assert.rejects(
        disconnecting.execute('SHOW SERVICES', []),
        (error) => error.ambiguous === true && error.stage === 'disconnect',
      );
      assert.equal(queryCalls, 1);
      assert.equal(endCalls, 1);

      const secret = 'TOP_SECRET_PASSWORD';
      class LeakingConnectClient {
        async connect() {
          throw new Error(
            `connect postgresql://service:${secret}@db.example.test/service failed`,
          );
        }

        async end() {}
      }
      const sanitized = createServiceLifecycleSqlClient({
        loadPg: async () => ({Client: LeakingConnectClient}),
      });
      await assert.rejects(
        sanitized.execute('SHOW SERVICES', []),
        (error) => {
          assert.doesNotMatch(error.message, new RegExp(secret, 'u'));
          assert.doesNotMatch(error.message, /postgresql:\/\//u);
          assert.equal(error.message, 'PostgreSQL connection failed');
          return true;
        },
      );

      const configSecret = 'ARBITRARY_CONFIG_SECRET';
      class RejectingQueryClient {
        async connect() {}

        async query() {
          const error = new Error(
            `server rejected config {"api_key":"${configSecret}"}`,
          );
          error.code = 'P0001';
          throw error;
        }

        async end() {}
      }
      const rejecting = createServiceLifecycleSqlClient({
        loadPg: async () => ({Client: RejectingQueryClient}),
      });
      await assert.rejects(
        rejecting.execute('INSTALL SERVICE $1', ['{}']),
        (error) => {
          assert.equal(error.message, 'PostgreSQL lifecycle query rejected (P0001)');
          assert.doesNotMatch(error.message, new RegExp(configSecret, 'u'));
          return true;
        },
      );
    });

  it('rejects unreadable, linked, oversized, malformed, and non-object inputs',
    async (t) => {
      const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
      const root = await temporaryRoot(t);
      const projectPath = path.join(root, 'input-service');
      createServiceProject(projectPath);
      const template = JSON.parse(await readFile(
        path.join(projectPath, MANIFEST_TEMPLATE_NAME),
        'utf8',
      ));
      const validManifestPath = path.join(root, 'valid-manifest.json');
      await writeFile(validManifestPath, JSON.stringify({
        ...template,
        artifact: {...template.artifact, digest: VALID_DIGEST},
      }));
      const malformedPath = path.join(root, 'malformed.json');
      const oversizedPath = path.join(root, 'oversized.json');
      const linkedPath = path.join(root, 'linked.json');
      const arrayConfigPath = path.join(root, 'array-config.json');
      await Promise.all([
        writeFile(malformedPath, '{'),
        writeFile(oversizedPath, Buffer.alloc(OVERSIZED_INPUT_BYTES, 0x20)),
        symlink(validManifestPath, linkedPath),
        writeFile(arrayConfigPath, '[]\n'),
      ]);

      const attacks = [
        ['install', path.join(root, 'missing-manifest.json'),
          '--idempotency-key', 'unreadable'],
        ['install', malformedPath, '--idempotency-key', 'malformed'],
        ['install', oversizedPath, '--idempotency-key', 'oversized'],
        ['install', linkedPath, '--idempotency-key', 'linked'],
        ['install', validManifestPath, '--idempotency-key', 'config-array',
          '--config', arrayConfigPath],
      ];
      let sqlCreations = 0;
      for (const argv of attacks) {
        assert.equal(await runServiceLifecycleCommand(argv, {
          createSqlClient() {
            sqlCreations += 1;
            throw new Error('invalid local input must fail before SQL');
          },
          writeError: () => {},
          writeOutput: () => assert.fail('invalid input must not print success'),
        }), FAILURE_EXIT_CODE);
      }
      assert.equal(sqlCreations, 0);
    });

  it('rejects dev-install with usage error explaining it has been retired', async () => {
    const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
    const errors = [];
    const exitCode = await runServiceLifecycleCommand(
      ['dev-install', 'some-project'],
      {writeError: (line) => errors.push(line)},
    );
    assert.equal(exitCode, USAGE_EXIT_CODE);
    assert.match(
      errors.join('\n'),
      /dev-install has been retired; use lagrange service build, publish, and deploy instead/iu,
    );
  });

  it('composes install through external service manifest and stable identity-only INSTALL intent', async (t) => {
    const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
    const root = await temporaryRoot(t);
    const validManifest = {
      schema_version: 3,
      name: 'weather-service',
      version: '1.0.0',
      exports: [{name: 'serve', interface: 'request_v1'}],
      artifact: {
        type: 'oci',
        ref: `registry.example.test/weather-service@${VALID_DIGEST}`,
        digest: VALID_DIGEST,
        media_type: 'application/vnd.oci.image.manifest.v1+json',
      },
      runtime: {kind: 'oci_container'},
    };
    const manifestPath = path.join(root, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(validManifest));

    const config = {replicas: 3, timeout_ms: 5000};
    const configPath = path.join(root, 'config.json');
    await writeFile(configPath, JSON.stringify(config));

    const sqlCalls = [];
    const serverRow = Object.freeze({
      ...mutationRow(),
      operation_id: 'operation-install',
    });
    const serializedOutput = [];
    const dependencies = {
      createSqlClient: () => ({
        async execute(statement, parameters) {
          sqlCalls.push({parameters, statement});
          return {rows: [serverRow]};
        },
      }),
      writeOutput: (line) => serializedOutput.push(line),
    };

    const argv = [
      'install',
      manifestPath,
      '--idempotency-key',
      IDEMPOTENCY_KEY,
      '--config',
      configPath,
    ];

    assert.equal(
      await runServiceLifecycleCommand(argv, dependencies),
      SUCCESS_EXIT_CODE,
    );

    assert.equal(sqlCalls.length, 1);
    assert.equal(sqlCalls[0].statement, INSTALL_SQL);
    assert.equal(sqlCalls[0].parameters.length, 1);
    const payload = JSON.parse(sqlCalls[0].parameters[0]);
    assert.deepEqual(payload, {
      config,
      idempotency_key: IDEMPOTENCY_KEY,
      manifest: validManifest,
    });
    assert.equal(payload.artifact_source, undefined);

    assert.equal(serializedOutput.length, 1);
    const output = JSON.parse(serializedOutput[0]);
    assert.deepEqual(output.rows, [serverRow]);
  });
});
