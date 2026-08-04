import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {parse} from 'espree';

import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {createServiceProject} from
  '../../src/cli/service-project-scaffold.js';
import {createServiceLifecycleSqlClient} from
  '../../src/cli/service-lifecycle-sql-client.js';
import {
  validateExternalServiceManifest,
} from '../../src/service/external-service-manifest.js';
import {
  OCI_CONTAINER_LAYER_MEDIA_TYPES,
  OCI_IMAGE_CONFIG_MEDIA_TYPE,
  OCI_IMAGE_LAYOUT_VERSION,
  OCI_IMAGE_MANIFEST_MEDIA_TYPE,
  OCI_IMAGE_SCHEMA_VERSION,
  canonicalOciJsonBytes,
} from '../../src/service/oci-image-layout-contract.js';
import {ServiceLocalOciLayoutBuilder} from
  '../../src/service/service-local-oci-layout-builder.js';
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
const SOURCE_DATE_EPOCH = 1_700_000_000;
const IDEMPOTENCY_KEY = 'dev-install-weather-service';
const INSTALL_SQL = 'INSTALL SERVICE $1';
const FINAL_MANIFEST_NAME = 'lagrange-service.json';
const MANIFEST_TEMPLATE_NAME = 'lagrange-service.template.json';
const OCI_LAYOUT_NAME = 'oci-layout';
const OCI_INDEX_NAME = 'index.json';
const OCI_LAYER_MEDIA_TYPE = OCI_CONTAINER_LAYER_MEDIA_TYPES[0];
const SHA256_PREFIX_LENGTH = 'sha256:'.length;
const VALID_DIGEST = `sha256:${'a'.repeat(64)}`;
const OVERSIZED_INPUT_BYTES = (4 * 1024 * 1024) + 1;
const IGNORED_SPARSE_BYTES = 65 * 1024 * 1024;
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

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function descriptor(bytes, mediaType) {
  return {digest: sha256(bytes), mediaType, size: bytes.length};
}

async function writeBlob(layoutPath, bytes) {
  const digest = sha256(bytes);
  const blobDirectory = path.join(layoutPath, 'blobs', 'sha256');
  await mkdir(blobDirectory, {recursive: true});
  await writeFile(
    path.join(blobDirectory, digest.slice(SHA256_PREFIX_LENGTH)),
    bytes,
  );
}

async function writeContainerLayout(layoutPath, platform) {
  const [os, architecture] = platform.split('/');
  const configBytes = canonicalOciJsonBytes({architecture, os});
  const layerBytes = Buffer.from('service-cli-deterministic-layer');
  const config = descriptor(configBytes, OCI_IMAGE_CONFIG_MEDIA_TYPE);
  const layer = descriptor(layerBytes, OCI_LAYER_MEDIA_TYPE);
  const manifestBytes = canonicalOciJsonBytes({
    config,
    layers: [layer],
    mediaType: OCI_IMAGE_MANIFEST_MEDIA_TYPE,
    schemaVersion: OCI_IMAGE_SCHEMA_VERSION,
  });
  const top = descriptor(manifestBytes, OCI_IMAGE_MANIFEST_MEDIA_TYPE);

  await Promise.all([
    writeBlob(layoutPath, configBytes),
    writeBlob(layoutPath, layerBytes),
    writeBlob(layoutPath, manifestBytes),
  ]);
  await writeFile(
    path.join(layoutPath, OCI_LAYOUT_NAME),
    canonicalOciJsonBytes({imageLayoutVersion: OCI_IMAGE_LAYOUT_VERSION}),
  );
  await writeFile(
    path.join(layoutPath, OCI_INDEX_NAME),
    canonicalOciJsonBytes({
      manifests: [{...top, platform: {architecture, os}}],
      schemaVersion: OCI_IMAGE_SCHEMA_VERSION,
    }),
  );
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
      'dev-install <project-directory>',
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
      './service-project-scaffold.js',
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

      let builderCreations = 0;
      assert.equal(await runServiceLifecycleCommand([
        'dev-install',
        projectPath,
        '--idempotency-key',
        'project-output-root',
        '--platform',
        PLATFORM,
        '--source-date-epoch',
        String(SOURCE_DATE_EPOCH),
        '--output-root',
        projectPath,
      ], {
        createLocalOciLayoutBuilder() {
          builderCreations += 1;
          throw new Error('invalid output root must fail before build');
        },
        createSqlClient() {
          sqlCreations += 1;
          throw new Error('invalid output root must fail before SQL');
        },
        writeError: () => {},
        writeOutput: () => assert.fail('invalid output root must not print'),
      }), FAILURE_EXIT_CODE);
      assert.equal(builderCreations, 0);
      assert.equal(sqlCreations, 0);

      await symlink(
        validManifestPath,
        path.join(projectPath, 'linked-source.json'),
      );
      assert.equal(await runServiceLifecycleCommand([
        'dev-install',
        projectPath,
        '--idempotency-key',
        'linked-source',
        '--platform',
        PLATFORM,
        '--source-date-epoch',
        String(SOURCE_DATE_EPOCH),
        '--output-root',
        path.join(root, 'linked-source-output'),
      ], {
        createLocalOciLayoutBuilder() {
          builderCreations += 1;
          throw new Error('linked source must fail before build');
        },
        createSqlClient() {
          sqlCreations += 1;
          throw new Error('linked source must fail before SQL');
        },
        writeError: () => {},
        writeOutput: () => assert.fail('linked source must not print success'),
      }), FAILURE_EXIT_CODE);
      assert.equal(builderCreations, 0);
      assert.equal(sqlCreations, 0);
    });

  it('fails builder and post-build local-write errors before SQL or output',
    async (t) => {
      const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
      const root = await temporaryRoot(t);
      const projectPath = path.join(root, 'failure-service');
      const finalManifestPath = path.join(projectPath, FINAL_MANIFEST_NAME);
      createServiceProject(projectPath);
      const baseArgv = [
        'dev-install',
        projectPath,
        '--platform',
        PLATFORM,
        '--source-date-epoch',
        String(SOURCE_DATE_EPOCH),
        '--output-root',
        path.join(root, 'failure-output'),
      ];
      let buildCalls = 0;
      let sqlCreations = 0;
      let outputCalls = 0;
      const errors = [];
      const dependencies = (build) => ({
        createLocalOciLayoutBuilder: () => ({build}),
        createSqlClient() {
          sqlCreations += 1;
          throw new Error('local failure must occur before SQL');
        },
        writeError: (line) => errors.push(line),
        writeOutput() {
          outputCalls += 1;
        },
      });

      assert.equal(await runServiceLifecycleCommand([
        ...baseArgv.slice(0, 2),
        '--idempotency-key',
        'builder-failure',
        ...baseArgv.slice(2),
      ], dependencies(async () => {
        buildCalls += 1;
        throw new Error('injected builder failure');
      })), FAILURE_EXIT_CODE);
      await assert.rejects(lstat(finalManifestPath), {code: 'ENOENT'});

      assert.equal(await runServiceLifecycleCommand([
        ...baseArgv.slice(0, 2),
        '--idempotency-key',
        'local-write-failure',
        ...baseArgv.slice(2),
      ], dependencies(async () => {
        buildCalls += 1;
        await mkdir(finalManifestPath);
        return {
          layoutPath: path.join(root, 'failure-output', 'layout'),
          topManifestDescriptor: {digest: VALID_DIGEST},
        };
      })), FAILURE_EXIT_CODE);

      assert.equal(buildCalls, 2);
      assert.equal(sqlCreations, 0);
      assert.equal(outputCalls, 0);
      assert.match(errors.join('\n'), /builder failure/iu);
      assert.match(errors.join('\n'), /ordinary bounded file/iu);
    });

  it('pins the project directory across build and final-manifest publication',
    async (t) => {
      const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
      const root = await temporaryRoot(t);
      const projectPath = path.join(root, 'race-service');
      const movedProjectPath = path.join(root, 'moved-race-service');
      const victimPath = path.join(root, 'victim');
      createServiceProject(projectPath);
      await mkdir(victimPath);

      let buildCalls = 0;
      let sqlCreations = 0;
      const errors = [];
      const exitCode = await runServiceLifecycleCommand([
        'dev-install',
        projectPath,
        '--idempotency-key',
        'project-parent-swap',
        '--platform',
        PLATFORM,
        '--source-date-epoch',
        String(SOURCE_DATE_EPOCH),
        '--output-root',
        path.join(root, 'race-output'),
      ], {
        createLocalOciLayoutBuilder: () => ({
          async build() {
            buildCalls += 1;
            await rename(projectPath, movedProjectPath);
            await symlink(victimPath, projectPath);
            return {
              layoutPath: path.join(root, 'race-output', 'layout'),
              topManifestDescriptor: {digest: VALID_DIGEST},
            };
          },
        }),
        createSqlClient() {
          sqlCreations += 1;
          throw new Error('project identity race must fail before SQL');
        },
        writeError: (line) => errors.push(line),
        writeOutput: () => assert.fail('project identity race must not print'),
      });

      assert.equal(exitCode, FAILURE_EXIT_CODE);
      assert.equal(buildCalls, 1);
      assert.equal(sqlCreations, 0);
      assert.match(errors.join('\n'), /project identity changed/iu);
      await assert.rejects(
        lstat(path.join(victimPath, FINAL_MANIFEST_NAME)),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        lstat(path.join(movedProjectPath, FINAL_MANIFEST_NAME)),
        {code: 'ENOENT'},
      );
    });

  it('composes dev-install through the S5b builder and stable INSTALL intent',
    async (t) => {
      const {runServiceLifecycleCommand} = await loadLifecycleCommandOwner();
      const root = await temporaryRoot(t);
      const projectPath = path.join(root, 'weather-service');
      const outputRoot = path.join(root, 'oci-output');
      const finalManifestPath = path.join(projectPath, FINAL_MANIFEST_NAME);
      createServiceProject(projectPath);
      const ignoredDependencyDirectory = path.join(projectPath, 'node_modules');
      const ignoredDependencyPath = path.join(
        ignoredDependencyDirectory,
        'ignored.bin',
      );
      await mkdir(ignoredDependencyDirectory);
      await writeFile(ignoredDependencyPath, '');
      await truncate(ignoredDependencyPath, IGNORED_SPARSE_BYTES);

      const exporterCalls = [];
      const exporter = {
        async exportLayout(request) {
          exporterCalls.push(request);
          assert.notEqual(request.contextPath, projectPath);
          assert.equal(
            request.dockerfilePath,
            path.join(request.contextPath, 'Dockerfile'),
          );
          const snapshotDockerfile = await lstat(request.dockerfilePath);
          assert.equal(snapshotDockerfile.isFile(), true);
          assert.equal(snapshotDockerfile.isSymbolicLink(), false);

          const relativeServerPath = path.join('src', 'server.js');
          const projectServerPath = path.join(projectPath, relativeServerPath);
          const snapshotServerPath = path.join(
            request.contextPath,
            relativeServerPath,
          );
          const originalSource = await readFile(projectServerPath);
          await writeFile(projectServerPath, 'concurrent source mutation\n');
          try {
            assert.deepEqual(
              await readFile(snapshotServerPath),
              originalSource,
            );
            await writeContainerLayout(request.outputPath, request.platform);
          } finally {
            await writeFile(projectServerPath, originalSource);
          }
        },
      };
      const buildRequests = [];
      const builder = new ServiceLocalOciLayoutBuilder({
        containerExporter: exporter,
      });
      const originalBuild = builder.build.bind(builder);
      builder.build = async (request) => {
        buildRequests.push(request);
        return originalBuild(request);
      };
      const sqlCalls = [];
      const serverRow = Object.freeze({
        ...mutationRow(),
        operation_id: 'operation-dev-install',
      });
      const serializedOutput = [];
      const dependencies = {
        createLocalOciLayoutBuilder: () => builder,
        createSqlClient: () => ({
          async execute(statement, parameters) {
            sqlCalls.push({parameters, statement});
            return {rows: [serverRow]};
          },
        }),
        writeOutput: (line) => serializedOutput.push(line),
      };
      const argv = [
        'dev-install',
        projectPath,
        '--idempotency-key',
        IDEMPOTENCY_KEY,
        '--platform',
        PLATFORM,
        '--source-date-epoch',
        String(SOURCE_DATE_EPOCH),
        '--output-root',
        outputRoot,
      ];

      assert.equal(
        await runServiceLifecycleCommand(argv, dependencies),
        SUCCESS_EXIT_CODE,
      );
      const firstFinalManifestBytes = await readFile(finalManifestPath);
      assert.equal(
        await runServiceLifecycleCommand(argv, dependencies),
        SUCCESS_EXIT_CODE,
      );
      assert.deepEqual(
        await readFile(finalManifestPath),
        firstFinalManifestBytes,
      );

      assert.equal(buildRequests.length, 2);
      for (const request of buildRequests) {
        assert.equal(request.runtimeKind, RUNTIME_KIND.OCI_CONTAINER);
        assert.equal(request.outputRoot, outputRoot);
        assert.equal(request.platform, PLATFORM);
        assert.equal(request.sourceDateEpoch, SOURCE_DATE_EPOCH);
        assert.notEqual(request.container.contextPath, projectPath);
        assert.equal(
          request.container.dockerfilePath,
          path.join(request.container.contextPath, 'Dockerfile'),
        );
        assert.match(
          request.container.sourceFingerprint,
          /^sha256:[0-9a-f]{64}$/u,
        );
      }
      assert.equal(
        buildRequests[1].container.sourceFingerprint,
        buildRequests[0].container.sourceFingerprint,
      );
      assert.equal(exporterCalls.length, 2);

      const finalManifest = JSON.parse(await readFile(finalManifestPath, 'utf8'));
      const templateManifest = JSON.parse(await readFile(
        path.join(projectPath, MANIFEST_TEMPLATE_NAME),
        'utf8',
      ));
      assert.equal(validateExternalServiceManifest(finalManifest).valid, true);
      assert.equal(Object.hasOwn(templateManifest.artifact, 'digest'), false);
      assert.equal(
        finalManifest.artifact.digest,
        JSON.parse(serializedOutput[0]).buildReceipt
          .topManifestDescriptor.digest,
      );

      assert.equal(sqlCalls.length, 2);
      assert.deepEqual(sqlCalls[1], sqlCalls[0]);
      assert.equal(sqlCalls[0].statement, INSTALL_SQL);
      assert.equal(sqlCalls[0].parameters.length, 1);
      const payload = JSON.parse(sqlCalls[0].parameters[0]);
      assert.deepEqual(payload, {
        artifact_source: {
          kind: 'local_oci_layout',
          location: JSON.parse(serializedOutput[0]).buildReceipt.layoutPath,
        },
        idempotency_key: IDEMPOTENCY_KEY,
        manifest: finalManifest,
      });

      assert.equal(serializedOutput.length, 2);
      assert.equal(serializedOutput[1], serializedOutput[0]);
      const output = JSON.parse(serializedOutput[0]);
      assert.deepEqual(output.rows, [serverRow]);
      assert.equal(output.finalManifestPath, finalManifestPath);
      assert.equal(output.buildReceipt.platform, PLATFORM);
      assert.equal(output.buildReceipt.sourceDateEpoch, SOURCE_DATE_EPOCH);

      const ignoredReadmePath = path.join(projectPath, 'README.md');
      await writeFile(ignoredReadmePath, 'ignored documentation change\n');
      const ignoredArgv = argv.map((value) =>
        value === IDEMPOTENCY_KEY ? `${IDEMPOTENCY_KEY}-ignored` : value);
      assert.equal(
        await runServiceLifecycleCommand(ignoredArgv, dependencies),
        SUCCESS_EXIT_CODE,
      );
      assert.equal(
        buildRequests[2].container.sourceFingerprint,
        buildRequests[0].container.sourceFingerprint,
      );

      const originalServerSource = await readFile(
        path.join(projectPath, 'src', 'server.js'),
      );
      await writeFile(
        path.join(projectPath, 'src', 'server.js'),
        Buffer.concat([originalServerSource, Buffer.from('\n// changed\n')]),
      );
      const changedArgv = argv.map((value) =>
        value === IDEMPOTENCY_KEY ? `${IDEMPOTENCY_KEY}-changed` : value);
      assert.equal(
        await runServiceLifecycleCommand(changedArgv, dependencies),
        SUCCESS_EXIT_CODE,
      );
      assert.notEqual(
        buildRequests[3].container.sourceFingerprint,
        buildRequests[0].container.sourceFingerprint,
      );

      const callsBeforeExistingOutputAttacks = {
        build: buildRequests.length,
        output: serializedOutput.length,
        sql: sqlCalls.length,
      };
      const externalManifestTarget = path.join(root, 'external-manifest.json');
      const hardLinkedManifestTarget = path.join(
        root,
        'hard-linked-manifest.json',
      );
      await writeFile(externalManifestTarget, '{}\n');
      await writeFile(hardLinkedManifestTarget, firstFinalManifestBytes);
      const existingOutputAttacks = [
        async () => writeFile(finalManifestPath, '{"different":true}\n'),
        async () => symlink(externalManifestTarget, finalManifestPath),
        async () => link(hardLinkedManifestTarget, finalManifestPath),
        async () => mkdir(finalManifestPath),
      ];
      for (const prepareAttack of existingOutputAttacks) {
        await rm(finalManifestPath, {recursive: true, force: true});
        await prepareAttack();
        assert.equal(
          await runServiceLifecycleCommand(argv, dependencies),
          FAILURE_EXIT_CODE,
        );
        assert.equal(buildRequests.length, callsBeforeExistingOutputAttacks.build);
        assert.equal(sqlCalls.length, callsBeforeExistingOutputAttacks.sql);
        assert.equal(
          serializedOutput.length,
          callsBeforeExistingOutputAttacks.output,
        );
      }
    });
});
