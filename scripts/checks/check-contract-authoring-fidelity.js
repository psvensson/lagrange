#!/usr/bin/env node
/**
 * Typecheck checker for contract-first authoring and producer fidelity.
 *
 * Uses the TypeScript compiler API (ts.createProgram) with allowJs, checkJs,
 * and strictNullChecks to verify that the producer and consumer boundaries
 * adhere strictly to the PartitionLocalServiceStatusRecord contract.
 */

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const objectFreeze = Object.freeze;
const objectEntries = Object.entries;
const objectKeys = Object.keys;

const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);

const NUM_ZERO = 0;
const NUM_ONE = 1;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NEWLINE = '\n';
const MSG_PASSED = 'Contract boundary typecheck passed: 0 diagnostics.\n';

const DEFAULT_TARGET_PRODUCER =
  'src/partition/partition-local-service-status-contract.js';
const DEFAULT_TARGET_CONSUMER =
  'src/bootstrap/owners/partition-quorum-authority.js';

const DEFAULT_ROOT_FILES = objectFreeze([
  DEFAULT_TARGET_PRODUCER,
  DEFAULT_TARGET_CONSUMER,
]);

const COMPILER_OPTIONS = objectFreeze({
  allowJs: true,
  checkJs: true,
  noEmit: true,
  strictNullChecks: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  maxNodeModuleJsDepth: NUM_ZERO,
  skipLibCheck: true,
});

function matchesOverridePath(filePath, overridePath) {
  const normalizedFile = path.resolve(filePath);
  const normalizedOverride = path.resolve(overridePath);
  return normalizedFile === normalizedOverride ||
    stringEndsWith(filePath, overridePath) ||
    stringEndsWith(overridePath, filePath);
}

function findMatchingOverride(filePath, sourceOverrides) {
  const entries = objectEntries(sourceOverrides);
  for (let i = NUM_ZERO; i < entries.length; i += NUM_ONE) {
    const [overridePath, content] = entries[i];
    if (matchesOverridePath(filePath, overridePath)) {
      return content;
    }
  }
  return null;
}

function createOverriddenHost(sourceOverrides, options) {
  const defaultHost = ts.createCompilerHost(options);
  return {
    ...defaultHost,
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
      const overrideContent = findMatchingOverride(fileName, sourceOverrides);
      if (overrideContent !== null) {
        return ts.createSourceFile(fileName, overrideContent, languageVersion);
      }
      return defaultHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
    },
    readFile(fileName) {
      const overrideContent = findMatchingOverride(fileName, sourceOverrides);
      if (overrideContent !== null) {
        return overrideContent;
      }
      return defaultHost.readFile(fileName);
    },
    fileExists(fileName) {
      if (findMatchingOverride(fileName, sourceOverrides) !== null) {
        return true;
      }
      return defaultHost.fileExists(fileName);
    },
  };
}

function resolveEffectiveTargetFiles(targetFiles, sourceOverrides) {
  if (Array.isArray(targetFiles) && targetFiles.length > NUM_ZERO) {
    return targetFiles;
  }
  const overrideKeys = objectKeys(sourceOverrides);
  if (overrideKeys.length > NUM_ZERO) {
    return [...DEFAULT_ROOT_FILES, ...overrideKeys];
  }
  return DEFAULT_ROOT_FILES;
}

function formatDiagnosticItem(diagnostic) {
  const line = diagnostic.file && diagnostic.start !== undefined ?
    diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + NUM_ONE :
    null;
  return {
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, NEWLINE),
    file: diagnostic.file?.fileName ?? null,
    line,
  };
}

/**
 * Programmatically verify TypeScript checkJs on contract boundary files.
 *
 * @param {Object} [options]
 * @param {Record<string, string>} [options.sourceOverrides]
 * @param {string[]} [options.targetFiles]
 * @param {string[]} [options.rootFiles]
 * @return {{passed: boolean, diagnostics: Array<{code: number, message: string, file: string|null, line: number|null}>}}
 */
function verifyContractBoundaryTypecheck(options = {}) {
  const sourceOverrides = options.sourceOverrides ?? {};
  const effectiveTargets = resolveEffectiveTargetFiles(
    options.targetFiles,
    sourceOverrides,
  );
  const rootFiles = options.rootFiles ?? DEFAULT_ROOT_FILES;
  const host = createOverriddenHost(sourceOverrides, COMPILER_OPTIONS);
  const program = ts.createProgram(rootFiles, COMPILER_OPTIONS, host);
  const allDiagnostics = ts.getPreEmitDiagnostics(program);

  const filteredDiagnostics = arrayFilter(allDiagnostics, (diagnostic) => {
    const fileName = diagnostic.file?.fileName;
    if (!fileName) {
      return false;
    }
    return arraySome(effectiveTargets, (target) => matchesOverridePath(fileName, target));
  });

  const formattedDiagnostics = arrayMap(filteredDiagnostics, formatDiagnosticItem);
  return {
    passed: formattedDiagnostics.length === NUM_ZERO,
    diagnostics: formattedDiagnostics,
  };
}

function main() {
  const result = verifyContractBoundaryTypecheck();
  if (result.passed) {
    process.stdout.write(MSG_PASSED);
    process.exit(EXIT_SUCCESS);
  }
  for (let i = NUM_ZERO; i < result.diagnostics.length; i += NUM_ONE) {
    const diag = result.diagnostics[i];
    process.stderr.write(
      `${diag.file}:${diag.line} error TS${diag.code}: ${diag.message}\n`,
    );
  }
  process.exit(EXIT_FAILURE);
}

const currentScriptPath = fileURLToPath(import.meta.url);
if (process.argv[NUM_ONE] && path.resolve(process.argv[NUM_ONE]) === currentScriptPath) {
  main();
}

export {
  verifyContractBoundaryTypecheck,
  DEFAULT_ROOT_FILES,
};
