#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  hasConcreteText,
  isObjectRecord,
  listFiles,
  mainResultToExitCode,
  readTextFile,
  relativeToCwd,
  renderValidationResult,
  requireConcreteArray,
  requireConcreteField,
} from './system-contract-utils.js';
import {
  loadInvariantRegistry,
} from './check-invariants.js';

const DEFAULT_ALLOY_MODEL_DIRS = Object.freeze([
  'architecture/models/alloy',
]);
const ALLOY_MODEL_MARKER = 'alloy-model';
const ALLOY_MODEL_SCHEMA = 'alloy-model-v1';
const ALLOY_VERSION = '6.2.0';
const ALLOY_LINUX_ARCHIVE_URL =
  'https://github.com/AlloyTools/org.alloytools.alloy/releases/download/' +
  `v${ALLOY_VERSION}/alloy-${ALLOY_VERSION}-linux-amd64.tar.gz`;
const ALLOY_LINUX_ARCHIVE_SHA256 =
  '5a5494a4bac6e243e471590bb44a91e25a35794a5af1ae1f332be30b9c54a9e7';
const ALLOY_LINUX_BIN_SHA256 =
  '6ca682d64b7d00d351483843ca4c58f3d2d2865ad351fdce8d56c183f7a72c69';
const DEFAULT_ALLOY_BIN = path.resolve(
  'tools',
  `alloy-${ALLOY_VERSION}`,
  'bin',
  'alloy',
);
const DEFAULT_ALLOY_ARCHIVE = path.resolve(
  'tools',
  `alloy-${ALLOY_VERSION}-linux-amd64.tar.gz`,
);
const REPORTS_DIR = path.resolve('test-output', 'reports');
const ALLOY_OUTPUT_DIR = path.resolve('test-output', 'alloy');
const COMMAND_KIND_RUN = 'run';
const COMMAND_KIND_CHECK = 'check';
const ALLOY_RESULT_SAT = 'SAT';
const ALLOY_RESULT_UNSAT = 'UNSAT';
const HELP_TEXT = [
  'Usage: npm run model:alloy -- [--json] [model.als ...]',
  '',
  'Validates and executes architecture-owned Alloy models. The checker validates',
  'each metadata block, declared assertions, check commands, run predicates, and',
  'run commands, then executes Alloy and requires runPredicates=SAT,',
  'forbiddenPredicates=UNSAT, and assertion checks=UNSAT.',
  'Default scan root: architecture/models/alloy.',
  '',
  'Options:',
  '  --structural-only   Validate source/metadata without executing Alloy.',
  '  --no-download       Do not download the bundled Alloy binary if missing.',
].join('\n');

function parseArgs(args) {
  const files = [];
  let json = false;
  let help = false;
  let structuralOnly = false;
  let download = true;
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--structural-only') {
      structuralOnly = true;
    } else if (arg === '--no-download') {
      download = false;
    } else {
      files.push(arg);
    }
  }
  return {download, files, help, json, structuralOnly};
}

function alloyFilesFromArgs(files) {
  if (files.length > 0) {
    return files.map((filePath) => path.resolve(filePath));
  }
  return DEFAULT_ALLOY_MODEL_DIRS.flatMap((dirPath) =>
    listFiles(dirPath, {suffix: '.als', recursive: true}));
}

function parseAlloyMetadata(content) {
  const pattern = new RegExp(
    String.raw`\/\*\s*${ALLOY_MODEL_MARKER}\s*\n([\s\S]*?)\n\s*\*\/`,
    'iu',
  );
  const match = content.match(pattern);
  if (!match) {
    return null;
  }
  return JSON.parse(match[1].trim());
}

function declarationPattern(keyword, name) {
  return new RegExp(`\\b${keyword}\\s+${name}\\b`, 'u');
}

function commandPattern(keyword, name) {
  return new RegExp(`\\b${keyword}\\s+${name}\\b`, 'u');
}

function validateInvariantRefs(errors, filePath, metadata, content) {
  requireConcreteArray(
    errors,
    filePath,
    'invariantRefs',
    metadata.invariantRefs,
    {allowObjects: true},
  );
  if (!Array.isArray(metadata.invariantRefs)) {
    return;
  }
  const seenIds = new Set();
  for (const [index, ref] of metadata.invariantRefs.entries()) {
    const refPath = `invariantRefs[${index}]`;
    if (!isObjectRecord(ref)) {
      errors.push(`${filePath}: ${refPath} must be an object.`);
      continue;
    }
    requireConcreteField(errors, filePath, `${refPath}.id`, ref.id);
    requireConcreteField(
      errors,
      filePath,
      `${refPath}.assertion`,
      ref.assertion,
    );
    if (hasConcreteText(ref.id)) {
      if (seenIds.has(ref.id)) {
        errors.push(`${filePath}: duplicate invariant ref ${ref.id}.`);
      }
      seenIds.add(ref.id);
      if (
        metadata.knownInvariantIds instanceof Set &&
        !metadata.knownInvariantIds.has(ref.id)
      ) {
        errors.push(
          `${filePath}: ${refPath}.id is not registered in ` +
          `architecture/contracts/invariants.json: ${ref.id}.`,
        );
      }
    }
    if (
      hasConcreteText(ref.assertion) &&
      !declarationPattern('assert', ref.assertion).test(content)
    ) {
      errors.push(
        `${filePath}: assertion is not declared: ${ref.assertion}.`,
      );
    }
    if (
      hasConcreteText(ref.assertion) &&
      !commandPattern('check', ref.assertion).test(content)
    ) {
      errors.push(
        `${filePath}: assertion is not checked: ${ref.assertion}.`,
      );
    }
  }
}

function validatePredicateCommands(errors, filePath, metadata, content, fieldPath) {
  const runPredicates = metadata[fieldPath] || [];
  requireConcreteArray(
    errors,
    filePath,
    fieldPath,
    runPredicates,
  );
  if (!Array.isArray(runPredicates)) {
    return;
  }
  for (const predicate of runPredicates) {
    if (!hasConcreteText(predicate)) {
      continue;
    }
    if (!declarationPattern('pred', predicate).test(content)) {
      errors.push(`${filePath}: ${fieldPath} predicate is not declared: ${predicate}.`);
    }
    if (!commandPattern('run', predicate).test(content)) {
      errors.push(`${filePath}: ${fieldPath} predicate is not run: ${predicate}.`);
    }
  }
}

function validateAlloyModel(filePath, options = {}) {
  const relativeFilePath = relativeToCwd(filePath);
  const errors = [];
  let content = '';
  let metadata = null;
  try {
    content = readTextFile(filePath);
    metadata = parseAlloyMetadata(content);
  } catch (error) {
    errors.push(`${relativeFilePath}: cannot read or parse model: ${error.message}`);
    return {metadata: null, errors};
  }

  if (!isObjectRecord(metadata)) {
    errors.push(
      `${relativeFilePath}: missing /* ${ALLOY_MODEL_MARKER} ... */ JSON block.`,
    );
    return {metadata: null, errors};
  }

  requireConcreteField(errors, relativeFilePath, 'schema', metadata.schema);
  if (metadata.schema !== ALLOY_MODEL_SCHEMA) {
    errors.push(`${relativeFilePath}: schema must be ${ALLOY_MODEL_SCHEMA}.`);
  }
  for (const field of ['modelId', 'owner', 'boundary']) {
    requireConcreteField(errors, relativeFilePath, field, metadata[field]);
  }
  if (options.knownInvariantIds instanceof Set) {
    metadata.knownInvariantIds = options.knownInvariantIds;
  }
  if (!/\bmodule\s+[A-Za-z0-9_/.]+\b/u.test(content)) {
    errors.push(`${relativeFilePath}: Alloy module declaration is required.`);
  }
  validateInvariantRefs(errors, relativeFilePath, metadata, content);
  validatePredicateCommands(
    errors,
    relativeFilePath,
    metadata,
    content,
    'runPredicates',
  );
  validatePredicateCommands(
    errors,
    relativeFilePath,
    metadata,
    content,
    'forbiddenPredicates',
  );
  delete metadata.knownInvariantIds;
  return {content, metadata, errors};
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (target, redirects) => {
      if (redirects > 5) {
        reject(new Error('too many redirects fetching Alloy archive'));
        return;
      }
      https.get(target, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          request(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`unexpected status ${res.statusCode} fetching Alloy`));
          return;
        }
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    request(url, 0);
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function verifyAlloyArchive(filePath) {
  const actual = sha256File(filePath);
  if (actual !== ALLOY_LINUX_ARCHIVE_SHA256) {
    throw new Error(
      `Alloy archive checksum mismatch for ${relativeToCwd(filePath)}: ` +
      `expected ${ALLOY_LINUX_ARCHIVE_SHA256}, got ${actual}.`,
    );
  }
  return actual;
}

function verifyAlloyBinary(filePath) {
  const actual = sha256File(filePath);
  if (actual !== ALLOY_LINUX_BIN_SHA256) {
    throw new Error(
      `Alloy binary checksum mismatch for ${relativeToCwd(filePath)}: ` +
      `expected ${ALLOY_LINUX_BIN_SHA256}, got ${actual}.`,
    );
  }
  return actual;
}

async function ensureAlloyBinary({downloadEnabled = true} = {}) {
  if (hasConcreteText(process.env.ALLOY_BIN)) {
    return path.resolve(process.env.ALLOY_BIN);
  }
  if (fs.existsSync(DEFAULT_ALLOY_BIN)) {
    if (process.platform === 'linux' && process.arch === 'x64') {
      verifyAlloyBinary(DEFAULT_ALLOY_BIN);
    }
    return DEFAULT_ALLOY_BIN;
  }
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error(
      'Alloy binary is missing. Set ALLOY_BIN to an Alloy 6 executable path.',
    );
  }
  if (!downloadEnabled) {
    throw new Error(
      `Alloy binary is missing: ${DEFAULT_ALLOY_BIN}. Re-run without ` +
      '--no-download or set ALLOY_BIN.',
    );
  }
  if (!fs.existsSync(DEFAULT_ALLOY_ARCHIVE)) {
    await download(ALLOY_LINUX_ARCHIVE_URL, DEFAULT_ALLOY_ARCHIVE);
  }
  verifyAlloyArchive(DEFAULT_ALLOY_ARCHIVE);
  const extract = spawnSync(
    'tar',
    ['-xzf', DEFAULT_ALLOY_ARCHIVE, '-C', path.resolve('tools')],
    {encoding: 'utf8'},
  );
  if (extract.status !== 0) {
    throw new Error(
      `failed to extract Alloy archive: ${extract.stderr || extract.stdout}`,
    );
  }
  if (!fs.existsSync(DEFAULT_ALLOY_BIN)) {
    throw new Error(`Alloy binary not found after extraction: ${DEFAULT_ALLOY_BIN}`);
  }
  verifyAlloyBinary(DEFAULT_ALLOY_BIN);
  return DEFAULT_ALLOY_BIN;
}

function reportNameForModel(metadata, filePath) {
  const modelId = hasConcreteText(metadata?.modelId) ?
    metadata.modelId :
    path.basename(filePath, path.extname(filePath));
  return `${modelId}-alloy.model.report.json`;
}

function sanitizeAlloyOutput(output) {
  // The Alloy tool emits literal backspace (U+0008) control chars; stripping them is the
  // intent, so the control-char-in-regex match below is deliberate.
  return String(output || '')
    // eslint-disable-next-line no-control-regex
    .replace(/\u0008/gu, '')
    .replace(/\r/gu, '');
}

function parseAlloyExecutionOutput(output) {
  const results = [];
  const cleaned = sanitizeAlloyOutput(output);
  for (const line of cleaned.split('\n')) {
    const match = /^\s*\d+\.\s+(run|check)\s+([A-Za-z0-9_.$/]+).*?\b(SAT|UNSAT)\b/u
      .exec(line);
    if (!match) {
      continue;
    }
    results.push({
      kind: match[1],
      name: match[2],
      result: match[3],
      line: line.trim().replace(/\s+/gu, ' '),
    });
  }
  return results;
}

function parseAlloyReceipt(outputDir) {
  const receiptPath = path.join(outputDir, 'receipt.json');
  if (!fs.existsSync(receiptPath)) {
    return [];
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (!isObjectRecord(receipt?.commands)) {
    return [];
  }
  return Object.values(receipt.commands)
    .filter(isObjectRecord)
    .map((command) => ({
      kind: command.type,
      name: command.name,
      result: Array.isArray(command.solution) && command.solution.length > 0 ?
        ALLOY_RESULT_SAT :
        ALLOY_RESULT_UNSAT,
      line: `${command.type} ${command.name} from receipt.json`,
    }))
    .filter((command) =>
      command.kind === COMMAND_KIND_RUN || command.kind === COMMAND_KIND_CHECK);
}

function expectedCommandResults(metadata) {
  const expected = [];
  for (const predicate of metadata.runPredicates || []) {
    if (hasConcreteText(predicate)) {
      expected.push({
        kind: COMMAND_KIND_RUN,
        name: predicate,
        expectedResult: ALLOY_RESULT_SAT,
      });
    }
  }
  for (const predicate of metadata.forbiddenPredicates || []) {
    if (hasConcreteText(predicate)) {
      expected.push({
        kind: COMMAND_KIND_RUN,
        name: predicate,
        expectedResult: ALLOY_RESULT_UNSAT,
      });
    }
  }
  for (const ref of metadata.invariantRefs || []) {
    if (isObjectRecord(ref) && hasConcreteText(ref.assertion)) {
      expected.push({
        kind: COMMAND_KIND_CHECK,
        name: ref.assertion,
        expectedResult: ALLOY_RESULT_UNSAT,
      });
    }
  }
  return expected;
}

function analyzeExecution(metadata, parsedResults) {
  const errors = [];
  const expected = expectedCommandResults(metadata);
  for (const command of expected) {
    const actual = parsedResults.find((result) =>
      result.kind === command.kind && result.name === command.name);
    if (!actual) {
      errors.push(
        `${command.kind} ${command.name} did not produce an Alloy result.`,
      );
      continue;
    }
    if (actual.result !== command.expectedResult) {
      errors.push(
        `${command.kind} ${command.name} returned ${actual.result}; expected ` +
        `${command.expectedResult}.`,
      );
    }
  }
  return {errors, expected};
}

function writeAlloyReport(filePath, metadata, execution) {
  fs.mkdirSync(REPORTS_DIR, {recursive: true});
  const reportPath = path.join(REPORTS_DIR, reportNameForModel(metadata, filePath));
  const report = {
    schemaVersion: 'alloy-model-report-v1',
    modelReport: true,
    source: 'alloy',
    modelId: metadata.modelId,
    owner: metadata.owner,
    boundary: metadata.boundary,
    artifact: relativeToCwd(filePath),
    passed: execution.errors.length === 0,
    commandCount: execution.results.length,
    expectedCommands: execution.expected,
    results: execution.results,
    errors: execution.errors,
    outputTail: sanitizeAlloyOutput(execution.output).trim().split('\n').slice(-20),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function executeAlloyModel(filePath, metadata, alloyBin) {
  fs.mkdirSync(ALLOY_OUTPUT_DIR, {recursive: true});
  const outputDir = path.join(
    ALLOY_OUTPUT_DIR,
    metadata.modelId || path.basename(filePath, path.extname(filePath)),
  );
  const run = spawnSync(alloyBin, [
    'exec',
    '--force',
    '--type',
    'json',
    '--output',
    outputDir,
    filePath,
  ], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  const receiptResults = parseAlloyReceipt(outputDir);
  const results = receiptResults.length > 0 ?
    receiptResults :
    parseAlloyExecutionOutput(output);
  const analysis = analyzeExecution(metadata, results);
  const errors = [...analysis.errors];
  if (run.status !== 0) {
    errors.push(
      `Alloy exited with ${run.status}: ` +
      sanitizeAlloyOutput(output).trim().split('\n').slice(-5).join(' '),
    );
  }
  const reportPath = writeAlloyReport(filePath, metadata, {
    errors,
    expected: analysis.expected,
    output,
    results,
  });
  return {errors, reportPath, results};
}

async function validateAlloyModels(files, options = {}) {
  const checkedFiles = [];
  const errors = [];
  const reports = [];
  let knownInvariantIds = null;
  const loadedRegistry = loadInvariantRegistry(null, options.rootDir || process.cwd());
  if (loadedRegistry.error && loadedRegistry.error !== 'registry-not-found') {
    errors.push(
      `alloy-invariant-registry: cannot load registry: ${loadedRegistry.error}`,
    );
  } else if (Array.isArray(loadedRegistry.registry?.invariants)) {
    knownInvariantIds = new Set(
      loadedRegistry.registry.invariants
        .filter(isObjectRecord)
        .map((entry) => entry.id)
        .filter(hasConcreteText),
    );
  }
  let alloyBin = null;
  if (options.structuralOnly !== true) {
    try {
      alloyBin = await ensureAlloyBinary({
        downloadEnabled: options.download !== false,
      });
    } catch (error) {
      errors.push(`alloy-runtime: ${error.message}`);
      alloyBin = null;
    }
  }
  for (const filePath of files) {
    checkedFiles.push(relativeToCwd(filePath));
    const validation = validateAlloyModel(filePath, {knownInvariantIds});
    errors.push(...validation.errors);
    if (
      validation.errors.length === 0 &&
      options.structuralOnly !== true &&
      alloyBin
    ) {
      const execution = executeAlloyModel(
        filePath,
        validation.metadata,
        alloyBin,
      );
      reports.push(relativeToCwd(execution.reportPath));
      for (const error of execution.errors) {
        errors.push(`${relativeToCwd(filePath)}: ${error}`);
      }
    }
  }
  return {
    label: 'model-alloy',
    checkedFiles,
    errors,
    json: options.json === true,
    reports,
  };
}

async function main(argv) {
  const args = parseArgs(argv.slice(2));
  if (args.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return 0;
  }
  const files = alloyFilesFromArgs(args.files);
  const result = await validateAlloyModels(files, {
    download: args.download,
    json: args.json,
    structuralOnly: args.structuralOnly,
  });
  process.stdout.write(renderValidationResult(result));
  return mainResultToExitCode(result);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv)
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 1;
    });
}

export {
  ALLOY_MODEL_SCHEMA,
  analyzeExecution,
  parseAlloyExecutionOutput,
  parseAlloyReceipt,
  validateAlloyModel,
  validateAlloyModels,
  verifyAlloyArchive,
  verifyAlloyBinary,
};
