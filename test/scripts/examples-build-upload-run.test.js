import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  packageExample,
  validateExampleOutput,
  runExamplesCatalog,
} from '../../scripts/examples/build-upload-run.js';

const TMP_PREFIX = 'examples-runner-';

async function writeExample(rootDir, options = {}) {
  const dirName = options.dirName || '01-sample';
  const exampleDir = join(rootDir, dirName);
  await mkdir(exampleDir, {recursive: true});

  const manifest = {
    id: options.id || dirName,
    title: options.title || 'sample',
    level: options.level || 'basic',
    version: options.version || '1.0.0',
    entry: 'index.js',
    runtimeKind: options.runtimeKind || 'native_js',
    callbackExport: 'run',
    select: options.select || 'SELECT 1',
    params: [],
    required: options.required !== false,
    expectedFile: 'expected.json',
  };

  const expected = options.expected || {
    shape: 'array',
    minRows: 1,
  };

  const source = options.source || [
    '\'use strict\';',
    '',
    'module.exports.run = async function run(_ctx, batch) {',
    '  return batch.rows || [];',
    '};',
    '',
  ].join('\n');

  await writeFile(
    join(exampleDir, 'example.manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  await writeFile(join(exampleDir, 'expected.json'), JSON.stringify(expected, null, 2), 'utf8');
  await writeFile(join(exampleDir, 'index.js'), source, 'utf8');

  return {exampleDir, manifest, expected};
}

test('examples runner - packageExample computes deterministic identity and digest', async (t) => {
  const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  try {
    const {exampleDir} = await writeExample(root, {
      dirName: '01-basic',
      id: '01-basic',
    });
    const packaged = await packageExample(exampleDir);

    t.equal(packaged.id, '01-basic');
    t.equal(packaged.functionId, 'example-01-basic-v1_0_0');
    t.equal(packaged.callbackExport, 'run');
    t.ok(String(packaged.digest).startsWith('sha256:'));
    t.equal(packaged.expected.minRows, 1);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('examples runner - packageExample builds wasm_component artifact blobs',
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
    try {
      const {exampleDir} = await writeExample(root, {
        dirName: '06-wasm',
        id: '06-wasm',
        runtimeKind: 'wasm_component',
      });
      const packaged = await packageExample(exampleDir);

      t.equal(packaged.runtimeKind, 'wasm_component');
      t.equal(packaged.executorType, 'wasm_service');
      const parsedBlob = JSON.parse(packaged.codeBlob);
      t.equal(parsedBlob.format, 'js_wasm_component_v1');
      t.equal(typeof parsedBlob.wasmBytesBase64, 'string');
      t.equal(parsedBlob.runExport, 'run');
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });

test('examples runner - validateExampleOutput enforces first-row contracts', async (t) => {
  const example = {
    id: 'sample',
    expected: {
      shape: 'array',
      minRows: 1,
      firstRow: {
        ok: true,
        errorIncludes: 'unbounded',
      },
    },
  };

  const passing = validateExampleOutput(example, {
    hostResult: {
      partitionResults: [{rows: [{ok: true, error: 'unbounded nested call rejected'}]}],
    },
  });
  t.equal(passing.passed, true);

  const failing = validateExampleOutput(example, {
    hostResult: {
      partitionResults: [{rows: [{ok: false, error: 'different'}]}],
    },
  });
  t.equal(failing.passed, false);
  t.match(failing.error, /First-row contract/);
});

test('examples runner - runExamplesCatalog writes artifact and tracks required failures',
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
    const outputPath = join(root, 'artifact.json');

    try {
      await writeExample(root, {
        dirName: '01-required-pass',
        id: '01-required-pass',
        required: true,
        expected: {
          shape: 'array',
          minRows: 1,
          firstRow: {ok: true},
        },
      });
      await writeExample(root, {
        dirName: '02-optional-fail',
        id: '02-optional-fail',
        required: false,
        expected: {
          shape: 'array',
          minRows: 1,
          firstRow: {ok: true},
        },
      });

      const mockClient = {
        async query(_sql, _params) {
          return {ok: true};
        },
        async partitionCallback(payload) {
          if (payload.callbackModuleRef.includes('01-required-pass')) {
            return {
              hostResult: {
                partitionResults: [{rows: [{ok: true}]}],
              },
            };
          }
          return {
            hostResult: {
              partitionResults: [{rows: [{ok: false}]}],
            },
          };
        },
      };

      const artifact = await runExamplesCatalog({
        client: mockClient,
        examplesDir: root,
        outputPath,
        failOnRequired: true,
      });

      t.equal(artifact.summary.total, 2);
      t.equal(artifact.summary.passed, 1);
      t.equal(artifact.summary.failed, 1);
      t.equal(artifact.summary.requiredFailed, 0);

      const rawArtifact = JSON.parse(await readFile(outputPath, 'utf8'));
      t.equal(rawArtifact.summary.total, 2);
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });

test('examples runner - runExamplesCatalog throws when required example fails', async (t) => {
  const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  const outputPath = join(root, 'artifact-required-fail.json');

  try {
    await writeExample(root, {
      dirName: '01-required-fail',
      id: '01-required-fail',
      required: true,
      expected: {
        shape: 'array',
        minRows: 1,
        firstRow: {ok: true},
      },
    });

    const mockClient = {
      async query(_sql, _params) {
        return {ok: true};
      },
      async partitionCallback(_payload) {
        return {
          hostResult: {
            partitionResults: [{rows: [{ok: false}]}],
          },
        };
      },
    };

    await t.rejects(
      runExamplesCatalog({
        client: mockClient,
        examplesDir: root,
        outputPath,
        failOnRequired: true,
      }),
      /Required examples failed/,
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
