import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const DEFAULT_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const DEFAULT_EXAMPLES_DIR = 'examples/distributed-sql';
const DEFAULT_OUTPUT_DIR = 'test-output/examples';
const DEFAULT_TIMEOUT_MS = 30000;
const WS_OPEN_STATE = 1;

const CLI_ARG = Object.freeze({
  TARGET: '--target',
  INCLUDE: '--include',
  EXCLUDE: '--exclude',
  OUT: '--out',
  EXAMPLES_DIR: '--examplesDir',
});

const MESSAGE_TYPE = Object.freeze({
  QUERY: 'query',
  PARTITION_CALLBACK: 'partition_callback',
  QUERY_RESULT: 'query_result',
});

const CODE_EXECUTOR_TYPE = 'native_js';
const CODE_PERMISSIONS_EMPTY = '[]';
const MODULE_NAMESPACE = 'examples';
const MODULE_DEPENDENCIES_EMPTY = '[]';
const MODULE_CAPABILITIES_EMPTY = '[]';
const MODULE_EXPORTS_SINGLE = (exportName) => JSON.stringify([exportName]);
const CODE_SIGNATURE = (exportName) => JSON.stringify({
  runExport: exportName,
  exports: [exportName],
});

const EXAMPLE_DIR_NAME_PREFIX = /^\d{2}-/;
const VERSION_SANITIZE_REGEX = /[^a-zA-Z0-9]/g;
const HEX_DIGEST_PREFIX = 'sha256:';
const MODULE_EXPORTS_ARG = 'exports';
const MODULE_OBJECT_ARG = 'module';
const MODULE_RETURN_LINE = 'return module.exports;';

const INSERT_CODE_SQL =
  'INSERT OR REPLACE INTO code ' +
  '(function_id, function_name, version, executor_type, code_blob, signature, permissions, ' +
  'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

const INSERT_MODULE_MANIFEST_SQL =
  'INSERT OR REPLACE INTO module_manifests ' +
  '(namespace, name, version, digest, run_export, exports, dependencies, capabilities, ' +
  'source_reference, artifact_pointer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

function splitCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => Boolean(entry));
}

function parseArgs(argv) {
  const args = {
    target: DEFAULT_TARGET,
    examplesDir: DEFAULT_EXAMPLES_DIR,
    include: [],
    exclude: [],
    outputPath: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === CLI_ARG.TARGET && i + 1 < argv.length) {
      args.target = argv[++i];
    } else if (arg === CLI_ARG.EXAMPLES_DIR && i + 1 < argv.length) {
      args.examplesDir = argv[++i];
    } else if (arg === CLI_ARG.INCLUDE && i + 1 < argv.length) {
      args.include = splitCsv(argv[++i]);
    } else if (arg === CLI_ARG.EXCLUDE && i + 1 < argv.length) {
      args.exclude = splitCsv(argv[++i]);
    } else if (arg === CLI_ARG.OUT && i + 1 < argv.length) {
      args.outputPath = argv[++i];
    }
  }

  return args;
}

function normalizeVersion(version) {
  return String(version || '1.0.0').replace(VERSION_SANITIZE_REGEX, '_');
}

function buildFunctionId(manifest) {
  return `example-${manifest.id}-v${normalizeVersion(manifest.version)}`;
}

function buildFunctionName(manifest) {
  return `examples.${manifest.id}`;
}

function computeDigest(content) {
  const hash = createHash('sha256');
  hash.update(content);
  return HEX_DIGEST_PREFIX + hash.digest('hex');
}

function compileModuleSource(source, callbackExport, sourcePath) {
  const module = {exports: {}};
  const moduleFactory = new Function(
    MODULE_EXPORTS_ARG,
    MODULE_OBJECT_ARG,
    `${source}\n${MODULE_RETURN_LINE}`,
  );
  const evaluated = moduleFactory(module.exports, module);
  const exportsObject = evaluated && typeof evaluated === 'object' ?
    evaluated :
    module.exports;
  const handler = exportsObject ? exportsObject[callbackExport] : null;
  if (typeof handler !== 'function') {
    throw new Error(
      `Example module missing exported callback "${callbackExport}": ${sourcePath}`,
    );
  }
}

async function discoverExampleDirectories(examplesDir) {
  const absoluteDir = resolve(examplesDir);
  const entries = await readdir(absoluteDir, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isDirectory() && EXAMPLE_DIR_NAME_PREFIX.test(entry.name))
    .map((entry) => join(absoluteDir, entry.name))
    .sort((a, b) => basename(a).localeCompare(basename(b)));
}

async function packageExample(exampleDir) {
  const manifestPath = join(exampleDir, 'example.manifest.json');
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  if (!manifest.id || !manifest.entry || !manifest.callbackExport) {
    throw new Error(`Invalid example manifest: ${manifestPath}`);
  }

  const entryPath = join(exampleDir, manifest.entry);
  const source = await readFile(entryPath, 'utf8');
  compileModuleSource(source, manifest.callbackExport, entryPath);

  const expectedPath = join(
    exampleDir,
    manifest.expectedFile || 'expected.json',
  );
  const expectedRaw = await readFile(expectedPath, 'utf8');
  const expected = JSON.parse(expectedRaw);

  return {
    id: manifest.id,
    title: manifest.title || manifest.id,
    level: manifest.level || 'basic',
    required: manifest.required !== false,
    runtimeKind: manifest.runtimeKind || 'native_js',
    callbackExport: manifest.callbackExport,
    select: manifest.select,
    params: Array.isArray(manifest.params) ? manifest.params : [],
    version: String(manifest.version || '1.0.0'),
    expected,
    source,
    sourcePath: entryPath,
    expectedPath,
    functionId: buildFunctionId(manifest),
    functionName: buildFunctionName(manifest),
    digest: computeDigest(source),
    moduleName: manifest.id,
  };
}

function shouldIncludeExample(exampleId, includeSet, excludeSet) {
  if (includeSet && includeSet.size > 0 && !includeSet.has(exampleId)) {
    return false;
  }
  if (excludeSet && excludeSet.size > 0 && excludeSet.has(exampleId)) {
    return false;
  }
  return true;
}

async function packageExamples(options = {}) {
  const examplesDir = options.examplesDir || DEFAULT_EXAMPLES_DIR;
  const includeSet = new Set(options.include || []);
  const excludeSet = new Set(options.exclude || []);
  const directories = await discoverExampleDirectories(examplesDir);
  const packaged = [];

  for (const exampleDir of directories) {
    const example = await packageExample(exampleDir);
    if (!shouldIncludeExample(example.id, includeSet, excludeSet)) {
      continue;
    }
    packaged.push(example);
  }

  return packaged;
}

function flattenRows(executionResult) {
  const rows = [];
  if (Array.isArray(executionResult?.results)) {
    rows.push(...executionResult.results);
  }

  const partitionResults = executionResult?.hostResult?.partitionResults;
  if (Array.isArray(partitionResults)) {
    for (const partitionResult of partitionResults) {
      if (Array.isArray(partitionResult.rows)) {
        rows.push(...partitionResult.rows);
      }
    }
  }

  return rows;
}

function matchesFirstRow(firstRow, expectedFirstRow) {
  if (!expectedFirstRow || typeof expectedFirstRow !== 'object') {
    return true;
  }
  for (const [key, expectedValue] of Object.entries(expectedFirstRow)) {
    if (key === 'errorIncludes') {
      const actualValue = String(firstRow?.error || '');
      if (!actualValue.toLowerCase().includes(String(expectedValue).toLowerCase())) {
        return false;
      }
      continue;
    }
    if (firstRow?.[key] !== expectedValue) {
      return false;
    }
  }
  return true;
}

function validateExampleOutput(example, executionResult) {
  const expected = example.expected || {};
  const rows = flattenRows(executionResult);

  if (expected.shape === 'array' && !Array.isArray(rows)) {
    return {
      passed: false,
      error: `Expected array output for ${example.id}`,
      rows,
    };
  }

  const minRows = Number(expected.minRows || 0);
  if (rows.length < minRows) {
    return {
      passed: false,
      error: `Expected at least ${minRows} rows for ${example.id}, got ${rows.length}`,
      rows,
    };
  }

  if (rows.length > 0 && expected.firstRow) {
    if (!matchesFirstRow(rows[0], expected.firstRow)) {
      return {
        passed: false,
        error: `First-row contract failed for ${example.id}`,
        rows,
      };
    }
  }

  return {
    passed: true,
    error: null,
    rows,
  };
}

class AdminWsClient {
  constructor(options = {}) {
    this.target = options.target || DEFAULT_TARGET;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.socket = null;
    this.socketReady = null;
    this.pending = new Map();
  }

  async connect() {
    if (this.socket && this.socket.readyState === WS_OPEN_STATE) {
      return this.socket;
    }
    if (this.socketReady) {
      return this.socketReady;
    }

    this.socketReady = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.target);

      const onOpen = () => {
        socket.off('error', onOpenError);
        this._bindSocket(socket);
        this.socket = socket;
        resolve(socket);
      };

      const onOpenError = (error) => {
        socket.off('open', onOpen);
        this._resetSocket();
        reject(error);
      };

      socket.once('open', onOpen);
      socket.once('error', onOpenError);
    });

    return this.socketReady;
  }

  async close() {
    this._rejectPending('Admin examples socket closed');
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Best effort.
      }
    }
    this._resetSocket();
  }

  async query(sql, params = []) {
    return this._sendRequest({
      type: MESSAGE_TYPE.QUERY,
      sql,
      params,
    });
  }

  async partitionCallback(payload) {
    return this._sendRequest({
      type: MESSAGE_TYPE.PARTITION_CALLBACK,
      statement: payload.statement,
      parameters: payload.parameters || [],
      callbackModuleRef: payload.callbackModuleRef,
      callbackExport: payload.callbackExport,
      runtimeKind: payload.runtimeKind,
    });
  }

  async _sendRequest(payload) {
    const socket = await this.connect();
    const queryId = `examples-${Date.now()}-${randomUUID()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(queryId);
        reject(new Error(`Timed out waiting for admin response: ${queryId}`));
      }, this.timeoutMs);

      this.pending.set(queryId, {resolve, reject, timeout});

      try {
        socket.send(JSON.stringify({...payload, queryId}));
      } catch (error) {
        this.pending.delete(queryId);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  _bindSocket(socket) {
    socket.on('message', (data) => {
      let parsed = null;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      this._handleMessage(parsed);
    });

    socket.on('error', (error) => {
      this._rejectPending(`Admin examples socket error: ${error.message}`);
      this._resetSocket();
    });

    socket.on('close', () => {
      this._rejectPending('Admin examples socket closed');
      this._resetSocket();
    });
  }

  _handleMessage(message) {
    if (!message || message.type !== MESSAGE_TYPE.QUERY_RESULT) {
      return;
    }
    const pending = this.pending.get(message.queryId);
    if (!pending) {
      return;
    }

    this.pending.delete(message.queryId);
    clearTimeout(pending.timeout);

    if (message.error) {
      pending.reject(new Error(message.error));
      return;
    }

    pending.resolve(message);
  }

  _rejectPending(message) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  _resetSocket() {
    this.socket = null;
    this.socketReady = null;
  }
}

async function uploadExample(client, example, nowMs) {
  const createdAtMs = nowMs;
  const updatedAtMs = nowMs;

  await client.query(INSERT_CODE_SQL, [
    example.functionId,
    example.functionName,
    1,
    CODE_EXECUTOR_TYPE,
    example.source,
    CODE_SIGNATURE(example.callbackExport),
    CODE_PERMISSIONS_EMPTY,
    createdAtMs,
    updatedAtMs,
  ]);

  await client.query(INSERT_MODULE_MANIFEST_SQL, [
    MODULE_NAMESPACE,
    example.moduleName,
    example.version,
    example.digest,
    example.callbackExport,
    MODULE_EXPORTS_SINGLE(example.callbackExport),
    MODULE_DEPENDENCIES_EMPTY,
    MODULE_CAPABILITIES_EMPTY,
    example.sourcePath,
    example.functionId,
    createdAtMs,
  ]);
}

async function executeExample(client, example) {
  const callbackResult = await client.partitionCallback({
    statement: example.select,
    parameters: example.params,
    callbackModuleRef: example.functionId,
    callbackExport: example.callbackExport,
    runtimeKind: example.runtimeKind,
  });

  return callbackResult;
}

function summarizeExamples(results) {
  let passed = 0;
  let failed = 0;
  let requiredFailed = 0;

  for (const result of results) {
    if (result.passed) {
      passed += 1;
      continue;
    }
    failed += 1;
    if (result.required) {
      requiredFailed += 1;
    }
  }

  return {
    total: results.length,
    passed,
    failed,
    requiredFailed,
  };
}

function buildDefaultOutputPath(runId) {
  return join(DEFAULT_OUTPUT_DIR, `${runId}.json`);
}

async function writeArtifact(outputPath, artifact) {
  const absolutePath = resolve(outputPath);
  await mkdir(resolve(absolutePath, '..'), {recursive: true});
  await writeFile(absolutePath, JSON.stringify(artifact, null, 2), 'utf8');
  return absolutePath;
}

async function runExamplesCatalog(options = {}) {
  const startedAt = new Date();
  const runId = options.runId ||
    `examples-${startedAt.toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;

  const packagedExamples = await packageExamples({
    examplesDir: options.examplesDir || DEFAULT_EXAMPLES_DIR,
    include: options.include || [],
    exclude: options.exclude || [],
  });

  const ownClient = !options.client;
  const client = options.client || new AdminWsClient({
    target: options.target || DEFAULT_TARGET,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
  });

  const results = [];
  try {
    if (ownClient && typeof client.connect === 'function') {
      await client.connect();
    }

    for (const example of packagedExamples) {
      const startedMs = Date.now();
      let passed = false;
      let validationError = null;
      let executionResult = null;
      let rows = [];

      try {
        await uploadExample(client, example, Date.now());
        executionResult = await executeExample(client, example);
        const validation = validateExampleOutput(example, executionResult);
        passed = validation.passed;
        validationError = validation.error;
        rows = validation.rows;
      } catch (error) {
        passed = false;
        validationError = error.message;
      }

      results.push({
        id: example.id,
        title: example.title,
        level: example.level,
        required: example.required,
        passed,
        durationMs: Date.now() - startedMs,
        error: validationError,
        rowCount: rows.length,
        callbackModuleRef: example.functionId,
        callbackExport: example.callbackExport,
        runtimeKind: example.runtimeKind,
        digest: example.digest,
        hostResult: executionResult?.hostResult || null,
      });
    }
  } finally {
    if (ownClient && typeof client.close === 'function') {
      await client.close();
    }
  }

  const endedAt = new Date();
  const summary = summarizeExamples(results);
  const artifact = {
    runId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    summary: {
      ...summary,
      durationMs: endedAt.getTime() - startedAt.getTime(),
    },
    examples: results,
  };

  const outputPath = options.outputPath || buildDefaultOutputPath(runId);
  const absoluteOutputPath = await writeArtifact(outputPath, artifact);
  const withPath = {
    ...artifact,
    artifactPath: absoluteOutputPath,
  };

  if (options.failOnRequired !== false && summary.requiredFailed > 0) {
    throw new Error(
      `Required examples failed: ${summary.requiredFailed} (artifact: ${absoluteOutputPath})`,
    );
  }

  return withPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifact = await runExamplesCatalog({
    target: args.target,
    examplesDir: args.examplesDir,
    include: args.include,
    exclude: args.exclude,
    outputPath: args.outputPath,
    failOnRequired: true,
  });
  process.stdout.write(
    `Examples complete: ${artifact.summary.passed}/${artifact.summary.total} passed\n`,
  );
  process.stdout.write(`Artifact: ${artifact.artifactPath}\n`);
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] || '') === __filename;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`Examples failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  AdminWsClient,
  parseArgs,
  discoverExampleDirectories,
  packageExample,
  packageExamples,
  uploadExample,
  executeExample,
  validateExampleOutput,
  summarizeExamples,
  runExamplesCatalog,
};
