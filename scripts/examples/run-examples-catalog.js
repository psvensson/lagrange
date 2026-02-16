import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {AdminWsClient} from './admin-ws-client.js';
import {executeExample, uploadExample} from './example-execution.js';
import {
  DEFAULT_EXAMPLES_DIR,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TARGET,
  DEFAULT_TIMEOUT_MS,
  JSON_SPACES,
  RUN_ID_RANDOM_SLICE_LENGTH,
  RUN_ID_TIMESTAMP_SANITIZE_REGEX,
  TEXT_ENCODING_UTF8,
} from './examples-runner-constants.js';
import {packageExamples} from './package-examples.js';
import {validateExampleOutput} from './validate-output.js';

/**
 * Summarize example pass/fail counters.
 *
 * @param {Object[]} results
 * @return {{total: number, passed: number, failed: number, requiredFailed: number}}
 */
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

/**
 * Build default path for run artifact output.
 *
 * @param {string} runId
 * @return {string}
 */
function buildDefaultOutputPath(runId) {
  return join(DEFAULT_OUTPUT_DIR, `${runId}.json`);
}

/**
 * Persist run artifact JSON to disk.
 *
 * @param {string} outputPath
 * @param {Object} artifact
 * @return {Promise<string>}
 */
async function writeArtifact(outputPath, artifact) {
  const absolutePath = resolve(outputPath);
  await mkdir(resolve(absolutePath, '..'), {recursive: true});
  await writeFile(
    absolutePath,
    JSON.stringify(artifact, null, JSON_SPACES),
    TEXT_ENCODING_UTF8,
  );
  return absolutePath;
}

/**
 * Create a stable examples run identifier.
 *
 * @param {Date} startedAt
 * @return {string}
 */
function buildRunId(startedAt) {
  return `examples-${startedAt.toISOString().replace(
    RUN_ID_TIMESTAMP_SANITIZE_REGEX,
    '',
  )}-${randomUUID().slice(0, RUN_ID_RANDOM_SLICE_LENGTH)}`;
}

/**
 * Execute all selected examples and write a result artifact.
 *
 * @param {{
 *   runId?: string,
 *   target?: string,
 *   timeoutMs?: number,
 *   examplesDir?: string,
 *   include?: string[],
 *   exclude?: string[],
 *   outputPath?: string,
 *   failOnRequired?: boolean,
 *   client?: Object
 * }} options
 * @return {Promise<Object>}
 */
async function runExamplesCatalog(options = {}) {
  const startedAt = new Date();
  const runId = options.runId || buildRunId(startedAt);

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
        executorType: example.executorType,
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

export {
  runExamplesCatalog,
  summarizeExamples,
};
