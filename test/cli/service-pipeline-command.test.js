/**
 * Guard test for `lagrange service generate|build|deploy`
 * (service-cli-generate-build-deploy).
 *
 * Deterministic seams: generate and deploy run end-to-end through the
 * real owners (IR normalizer, entry emitter, deployment-record
 * generator, manifest/binding/policy validators, the pgwire grammar's
 * exact statement shapes) against a temp project; the SQL client is a
 * recording fake at the CLI's existing dependency seam, and build's
 * componentize step is proven against the real toolchain with a
 * componentize-js-shaped entry — the generated entry's own toolchained
 * proof lives in the Q4 parity test, and the emitted bytes here are
 * pinned to the example's proven generated entry modulo the import
 * specifiers.
 */
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {runServicePipelineCommand} from
  '../../src/cli/service-pipeline-router.js';
import {normalizeServiceSource} from
  '../../src/service/service-source-contract.js';

const EXAMPLE_DIRECTORY = new URL(
  '../../examples/call-binding-account-summary/', import.meta.url);
const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const USAGE_EXIT_CODE = 2;
const GENERATED_ENTRY_MODULE_SPECIFIER = './lagrange.service.js';
const EXAMPLE_AUTHORING_SPECIFIER_PATTERN =
  /import \{AUTHORING_DESCRIPTOR_KIND\} from '[^']+'/u;
const EXAMPLE_SERVICE_SPECIFIER_PATTERN =
  /import service from '[^']+'/u;

// The temp project's lagrange.service.js is the proven example service
// with its repo-relative authoring imports rewritten to a local
// `authoring/` copy — exactly the shape a scaffolded project carries.
// The package.json module marker keeps the tap loader's require(esm)
// instrumentation from rejecting the test process's dynamic import of
// the module (ERR_REQUIRE_CYCLE_MODULE), and the in-project relative
// imports are what ComponentizeJS's sandbox can resolve (absolute
// file-URL imports outside the project fail inside the wizer
// initialization sandbox).
async function createProject(root) {
  const exampleService = await readFile(
    new URL('lagrange.service.js', EXAMPLE_DIRECTORY), 'utf8');
  const authoringSource = await readFile(
    new URL('../../src/authoring/index.js', EXAMPLE_DIRECTORY), 'utf8')
    .catch(() => null);
  assert.equal(authoringSource, null,
    'the authoring library must not grow an index barrel unnoticed');
  const rewritten = exampleService
    .replaceAll('../../src/authoring/', './authoring/');
  await mkdir(path.join(root, 'authoring'), {recursive: true});
  for (const file of [
    'define-service.js',
    'distributed-operation.js',
    'request-handler.js',
    'sql-template.js',
  ]) {
    const source = await readFile(
      new URL(`../../src/authoring/${file}`, import.meta.url), 'utf8');
    await writeFile(path.join(root, 'authoring', file), source);
  }
  await writeFile(path.join(root, 'lagrange.service.js'), rewritten);
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({type: 'module'})}\n`);
  return root;
}

async function withProject(fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'lagrange-pipeline-test-'));
  try {
    return await fn(await createProject(root));
  } finally {
    await rm(root, {force: true, recursive: true});
  }
}

function recordingDependencies() {
  const calls = [];
  const output = [];
  const errors = [];
  return {
    calls,
    dependencies: {
      createLocalOciLayoutBuilder() {
        calls.push('builder');
        throw new Error('builder must not be created by this command');
      },
      createSqlClient() {
        return {
          async execute(statement, parameters) {
            calls.push({statement, payload: JSON.parse(parameters[0])});
            if (statement.startsWith('INSTALL SERVICE')) {
              return {rows: [{package_id: 'service-package-'.padEnd(80, 'ab')}]};
            }
            return {rows: [{action: 'ok'}]};
          },
        };
      },
      writeError: (line) => errors.push(line),
      writeOutput: (line) => output.push(line),
    },
    errors,
    output,
  };
}

test('generate compiles lagrange.service.js into the entry and the ' +
  'deterministic .lagrange tree through the real validators',
async () => withProject(async (project) => {
  const {dependencies, output, errors} = recordingDependencies();
  const exit = await runServicePipelineCommand(
    ['generate', project], dependencies);
  assert.equal(exit, SUCCESS_EXIT_CODE, errors.join('\n'));
  assert.equal(errors.length, 0);

  const summary = JSON.parse(output.at(-1));
  assert.equal(summary.service, 'account-summary');
  assert.deepEqual(summary.handlers.sort(), ['accountHealth', 'accountSummary']);
  assert.deepEqual(summary.operations, ['summarizeAccountActivity']);
  assert.deepEqual(summary.bindings.sort(), [
    'account-summary--call--summarize-account-activity',
    'account-summary--request--account-health',
    'account-summary--request--account-summary',
  ]);

  // The emitted entry matches the example's proven generated entry on
  // every executable line (comments and the two import specifiers are
  // the only sanctioned differences — the proven entry's body is the
  // toolchained shape the parity test builds).
  const emitted = await readFile(
    path.join(project, 'generated-entry.js'), 'utf8');
  const proven = await readFile(
    new URL('generated-entry.js', EXAMPLE_DIRECTORY), 'utf8');
  const executableLines = (source) => source
    .replace(EXAMPLE_AUTHORING_SPECIFIER_PATTERN,
      'import {AUTHORING_DESCRIPTOR_KIND} from AUTHORING;')
    // The emitted entry inlines the two kind discriminators the proven
    // entry imports; normalize both forms to one marker for the
    // executable-line comparison.
    .replace(
      /const AUTHORING_DESCRIPTOR_KIND = Object\.freeze\(\{\n[^}]+\}\);/u,
      'AUTHORING_DESCRIPTOR_KIND_DECL;')
    .replace(
      'import {AUTHORING_DESCRIPTOR_KIND} from AUTHORING;',
      'AUTHORING_DESCRIPTOR_KIND_DECL')
    .replace(EXAMPLE_SERVICE_SPECIFIER_PATTERN,
      'import service from SERVICE')
    .replace(`from "${GENERATED_ENTRY_MODULE_SPECIFIER}"`, 'from SERVICE')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 &&
        !trimmed.startsWith('*') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('*/');
    })
    // Order-insensitive: the emitted entry orders its imports and the
    // inlined kind declaration differently from the proven entry; the
    // comparison binds the executable CONTENT, not the layout.
    .sort()
    .join('\n');
  assert.equal(executableLines(emitted), executableLines(proven),
    'emitted entry matches the toolchained proven entry on every ' +
    'executable line');
  assert.ok(
    emitted.includes('DISTRIBUTED_OPERATION: \'distributed_operation\''),
    'the emitted entry inlines the authoring kind discriminators');
  // The inlined discriminators are sealed ABI surface, pinned to the
  // authoring source of truth.
  const authoringSource = await readFile(
    new URL('../../src/authoring/define-service.js', import.meta.url),
    'utf8');
  for (const literal of [
    'DISTRIBUTED_OPERATION: \'distributed_operation\'',
    'REQUEST_HANDLER: \'request_handler\'',
  ]) {
    assert.ok(authoringSource.includes(literal),
      `authoring source keeps ${literal}`);
  }
  assert.ok(
    emitted.includes(`from "${GENERATED_ENTRY_MODULE_SPECIFIER}"`),
    'the emitted entry statically imports the developer module');

  // The tree holds the four deployment records and regenerating is
  // byte-identical (determinism).
  const firstTree = {};
  for (const file of [
    'manifest.json', 'bindings.json', 'access-policy.json',
    'deployment-plan.json',
  ]) {
    firstTree[file] = await readFile(
      path.join(project, '.lagrange', 'deployment', file), 'utf8');
  }
  const rerun = await runServicePipelineCommand(
    ['generate', project], recordingDependencies().dependencies);
  assert.equal(rerun, SUCCESS_EXIT_CODE);
  for (const [file, bytes] of Object.entries(firstTree)) {
    assert.equal(
      await readFile(
        path.join(project, '.lagrange', 'deployment', file), 'utf8'),
      bytes,
      `${file} regenerates byte-identically`,
    );
  }

  const manifest = JSON.parse(firstTree['manifest.json']);
  assert.equal(manifest.name, 'account-summary');
  const bindings = JSON.parse(firstTree['bindings.json']);
  assert.equal(bindings.length, 3);
  const plan = JSON.parse(firstTree['deployment-plan.json']);
  assert.equal(
    plan.operations.summarizeAccountActivity.binding,
    'account-summary--call--summarize-account-activity');
}));

test('generate fails closed on an invalid service module',
  async () => withProject(async (project) => {
    await writeFile(
      path.join(project, 'lagrange.service.js'),
      'export default {kind: "service_definition"};\n');
    const {dependencies, output, errors} = recordingDependencies();
    const exit = await runServicePipelineCommand(
      ['generate', project], dependencies);
    assert.equal(exit, FAILURE_EXIT_CODE);
    assert.equal(output.length, 0,
      'a rejected service emits no success output');
    assert.match(errors.at(-1), /rejected/u);
  }));

test('deploy replays the generated records over the exact pgwire ' +
  'lifecycle grammar with the real package id substituted',
async () => withProject(async (project) => {
  assert.equal(await runServicePipelineCommand(
    ['generate', project], recordingDependencies().dependencies),
  SUCCESS_EXIT_CODE);

  const {calls, dependencies, output, errors} = recordingDependencies();
  const exit = await runServicePipelineCommand(
    ['deploy', project, '--layout', '/tmp/fake-layout',
      '--idempotency-key', 'deploy-test-1'],
    dependencies);
  assert.equal(exit, SUCCESS_EXIT_CODE, errors.join('\n'));

  // Grammar shapes: exactly the parameterized statements the SQL
  // ingress contract admits — no other control surface.
  const statements = calls.map((call) => call.statement);
  assert.equal(statements[0], 'INSTALL SERVICE $1');
  const bindingStatements = statements.slice(1, 4);
  assert.deepEqual(bindingStatements, [
    'CREATE BINDING $1', 'CREATE BINDING $1', 'CREATE BINDING $1',
  ]);
  const policyStatements = statements.slice(4);
  assert.ok(policyStatements.every(
    (statement) => statement === 'CONFIGURE SERVICE ACCESS $1'),
  `policies ride the access grammar: ${policyStatements}`);

  // INSTALL carries the generated manifest with the local layout source.
  const install = calls[0].payload;
  assert.equal(install.manifest.name, 'account-summary');
  assert.deepEqual(install.artifact_source, {
    kind: 'local_oci_layout', location: '/tmp/fake-layout',
  });
  assert.equal(install.idempotency_key, 'deploy-test-1');

  // Every CREATE BINDING payload substitutes the INSTALL-returned
  // package id for the placeholder and carries no other drift.
  const packageId = calls[0].payload && 'service-package-'.padEnd(80, 'ab');
  for (const call of calls.slice(1, 4)) {
    assert.equal(call.payload.target.package_id, packageId,
      `${call.payload.name} binds the real package id`);
    assert.notEqual(
      call.payload.target.package_id.includes('0000'), true,
      'no placeholder digits survive substitution');
  }
  const boundNames = calls.slice(1, 4).map((call) => call.payload.name).sort();
  assert.deepEqual(boundNames, [
    'account-summary--call--summarize-account-activity',
    'account-summary--request--account-health',
    'account-summary--request--account-summary',
  ]);

  // Policy coverage: the compiler's calls-policy plus the empty
  // completion policy for the call-free health route.
  const policies = calls.slice(4).map((call) => call.payload);
  const byBinding = new Map(policies.map((p) => [p.binding_name, p]));
  assert.equal(
    byBinding.get('account-summary--request--account-summary').calls.length,
    1,
    'the summary route keeps its generated calls policy');
  assert.deepEqual(
    byBinding.get('account-summary--request--account-health').calls, [],
    'the health route gets an empty completion policy');
  assert.equal(byBinding.has('account-summary--call--summarize-account-activity'),
    false, 'call bindings carry no access policy');

  const summary = JSON.parse(output.at(-1));
  assert.equal(summary.service, 'account-summary');
  assert.equal(summary.packageId, packageId);
}));

test('deploy fails closed when the lifecycle grammar rejects and emits ' +
  'no success output',
async () => withProject(async (project) => {
  assert.equal(await runServicePipelineCommand(
    ['generate', project], recordingDependencies().dependencies),
  SUCCESS_EXIT_CODE);
  const output = [];
  const errors = [];
  const exit = await runServicePipelineCommand(
    ['deploy', project, '--layout', '/tmp/fake-layout',
      '--idempotency-key', 'deploy-test-2'],
    {
      createSqlClient: () => ({
        async execute(statement) {
          if (statement.startsWith('CREATE BINDING')) {
            const error = new Error('duplicate binding name');
            error.code = '23505';
            throw error;
          }
          return {rows: [{package_id: 'service-package-x'}]};
        },
      }),
      writeError: (line) => errors.push(line),
      writeOutput: (line) => output.push(line),
    });
  assert.equal(exit, FAILURE_EXIT_CODE);
  assert.equal(output.length, 0);
  assert.match(errors.at(-1), /CREATE BINDING rejected/u);
}));

test('malformed pipeline argv exits with usage before touching ' +
  'dependencies',
async () => {
  const dependencyCalls = [];
  const dependencies = {
    createLocalOciLayoutBuilder() {
      dependencyCalls.push('builder');
    },
    createSqlClient() {
      dependencyCalls.push('sql');
    },
    writeOutput() {
      dependencyCalls.push('output');
    },
    writeError() {},
  };
  const attacks = [
    ['generate'],
    ['generate', '--help-me'],
    ['build'],
    ['deploy', 'project'],
    ['deploy', 'project', '--layout', '/tmp/x'],
    ['deploy', 'project', '--idempotency-key', 'k'],
    ['deploy', 'project', '--layout', '/tmp/x', '--idempotency-key', '  '],
    ['deploy', 'project', '--layout', '/tmp/x', '--idempotency-key', 'k',
      '--unknown'],
    ['generate', 'project', 'extra'],
  ];
  for (const argv of attacks) {
    assert.equal(
      await runServicePipelineCommand(argv, dependencies),
      USAGE_EXIT_CODE,
      argv.join(' '),
    );
  }
  assert.deepEqual(dependencyCalls, []);
});

test('build requires a generated entry and reports the componentize ' +
  'stage on failure',
async () => withProject(async (project) => {
  const {dependencies, output, errors} = recordingDependencies();
  const exit = await runServicePipelineCommand(
    ['build', project], dependencies);
  assert.equal(exit, FAILURE_EXIT_CODE);
  assert.equal(output.length, 0);
  assert.match(errors.at(-1), /componentize failed|generate/u);
}));

// The real-toolchain build proof: the emitted entry must componentize
// under the shared owner — this is the property the virtual authoring
// specifier would have silently broken. The OCI-layout leg stays behind
// a fake builder (its real path is covered by the lifecycle CLI tests);
// what this test binds is generated entry -> component.wasm -> stamped
// manifest.
test('build componentizes the generated entry through the real ' +
  'toolchain and stamps the artifact descriptor',
{timeout: 120000},
async () => withProject(async (project) => {
  assert.equal(await runServicePipelineCommand(
    ['generate', project], recordingDependencies().dependencies),
  SUCCESS_EXIT_CODE);

  const builtLayout = path.join(project, 'fake-oci-layout');
  const output = [];
  const errors = [];
  const exit = await runServicePipelineCommand(
    ['build', project],
    {
      createLocalOciLayoutBuilder: () => ({
        async build(request) {
          const {createHash} = await import('node:crypto');
          const payload = await readFile(request.wasm.payloadPath);
          assert.ok(payload.length > 1000,
            'the payload is the real componentized component');
          const digest = 'sha256:' + createHash('sha256')
            .update(payload).digest('hex');
          return {
            buildInputFingerprint: 'fake-fingerprint',
            layoutPath: builtLayout,
            topManifestDescriptor: {
              digest,
              sizeBytes: payload.length,
            },
          };
        },
      }),
      writeError: (line) => errors.push(line),
      writeOutput: (line) => output.push(line),
    });
  assert.equal(exit, SUCCESS_EXIT_CODE, errors.join('\n'));

  const summary = JSON.parse(output.at(-1));
  const componentBytes = await readFile(summary.component);
  assert.ok(componentBytes.length > 1000,
    'component.wasm holds the real componentized bytes');
  assert.equal(
    summary.digest,
    'sha256:' + (await import('node:crypto')).createHash('sha256')
      .update(componentBytes).digest('hex'),
    'the reported digest binds the exact component bytes');

  // The stamped manifest revalidates through the external-service
  // manifest contract and now carries the real descriptor.
  const manifest = JSON.parse(await readFile(
    path.join(project, '.lagrange', 'deployment', 'manifest.json'),
    'utf8'));
  assert.equal(manifest.artifact.digest, summary.digest);
  assert.equal(manifest.artifact.size_bytes, componentBytes.length);
  // The placeholder is the exact all-zero digest minted at generate time
  // (src/cli/service-pipeline-command.js PLACEHOLDER_DIGEST). Asserting on the
  // SUBSTRING '0000' also rejects a genuinely computed hash that happens to
  // contain four zeros — roughly one run in a thousand — which is how the 0.2
  // test:ci release receipt failed while the two assertions above (digest ===
  // summary.digest, size_bytes === real component byte length) both passed and
  // proved the digest was real. Compare against the placeholder itself.
  assert.notEqual(manifest.artifact.digest, `sha256:${'0'.repeat(64)}`,
    'no placeholder digest survives the stamp');

  // Every generated binding pins package_id + manifest_digest as its
  // artifact identity, and the install catalog stores the digest of the
  // STAMPED normalized manifest — so after build, the bindings file must
  // carry exactly that digest, not the generate-time placeholder-era
  // digest, or CREATE BINDING rejects every genuinely built component.
  const {validateExternalServiceManifest} = await import(
    '../../src/service/index.js');
  const {canonicalJson} = await import(
    '../../src/control-plane/owners/deployment-binding-contract.js');
  const stampedValidation = validateExternalServiceManifest(manifest);
  assert.equal(stampedValidation.valid, true);
  const stampedDigest = 'sha256:' +
    (await import('node:crypto')).createHash('sha256')
      .update(canonicalJson(stampedValidation.manifest)).digest('hex');
  const stampedBindings = JSON.parse(await readFile(
    path.join(project, '.lagrange', 'deployment', 'bindings.json'),
    'utf8'));
  assert.ok(stampedBindings.length > 0, 'bindings survive the restamp');
  for (const binding of stampedBindings) {
    assert.equal(binding.target.manifest_digest, stampedDigest,
      `${binding.name} pins the stamped manifest digest`);
  }

  // The component is a valid WASM component the runtime path can parse:
  // the service-cell world's three exports surface through jco.
  const {transpileBytes} = await import('@bytecodealliance/jco-transpile');
  const transpiled = await transpileBytes(new Uint8Array(componentBytes), {
    emitTypescriptDeclarations: false,
    instantiation: 'async',
    name: 'pipeline-build-proof',
  });
  const moduleBytes = transpiled.files['pipeline-build-proof.js'];
  const moduleUrl = `data:text/javascript;base64,${
    Buffer.from(moduleBytes).toString('base64')}`;
  const generated = await import(moduleUrl);
  const exports = await generated.instantiate(
    async (file) => globalThis.WebAssembly.compile(transpiled.files[file]),
    {
      'lagrange:cell/call-context': {
        callBounded() {
          throw new Error('denied');
        },
        emit() {},
      },
      'lagrange:cell/context': {
        callBinding(name, args) {
          return JSON.stringify({echo: [name, args]});
        },
        capability() {
          return 0;
        },
        read() {
          return 0;
        },
        write() {},
      },
    });
  assert.equal(typeof exports.handleRequest, 'function');
  const health = JSON.parse(exports.handleRequest(JSON.stringify({
    method: 'GET',
    path: '/accounts/health',
  })));
  assert.equal(health.status, 200,
    'the built component serves the generated health route');
}));

test('the normalized IR for the temp project matches the example ' +
  'service (rewrite seam honesty)',
async () => withProject(async (project) => {
  const normalized = await normalizeServiceSource(
    path.join(project, 'lagrange.service.js'));
  assert.equal(normalized.status, 'accepted',
    JSON.stringify(normalized.errors));
  assert.equal(normalized.ir.name, 'account-summary');
  assert.equal(normalized.ir.handlers.length, 2);
  assert.equal(normalized.ir.operations.length, 1);
  assert.equal(normalized.ir.operations[0].id, 'summarizeAccountActivity');
  assert.ok(
    normalized.ir.operations[0].statement.text
      .includes('account_activity'),
    'the distributed statement survives the project rewrite');
}));
