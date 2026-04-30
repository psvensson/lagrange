import fs from 'fs';
import path from 'path';

const LOCAL_NUM_10 = 10;
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

/**
 * Resolve the directory of the calling module without relying on import.meta.
 * This keeps source execution working while allowing CommonJS SEA bundles.
 *
 * @param {Function} skipFn - Frame to exclude from the stack lookup.
 * @return {string} Directory containing the calling module.
 */
function resolveModuleDirectory(skipFn) {
  const originalPrepareStackTrace = Error.prepareStackTrace;
  const originalStackTraceLimit = Error.stackTraceLimit;
  try {
    Error.stackTraceLimit = LOCAL_NUM_10;
    Error.prepareStackTrace = (_error, stack) => stack;

    const holder = {};
    Error.captureStackTrace(holder, skipFn || resolveModuleDirectory);

    const stack = Array.isArray(holder.stack) ? holder.stack : [];
    for (const frame of stack) {
      const fileName = frame?.getFileName?.();
      if (typeof fileName === LOCAL_STR_STRING && fileName.length > LOCAL_NUM_ZERO) {
        return path.dirname(fileName);
      }
    }
  } finally {
    Error.prepareStackTrace = originalPrepareStackTrace;
    Error.stackTraceLimit = originalStackTraceLimit;
  }

  return process.cwd();
}

/**
 * Resolve a filesystem-backed runtime file for source, dist bundle, or SEA.
 *
 * Search order:
 *   1. Sibling of the SEA executable
 *   2. Sibling of the bundled dist file
 *   3. Source file beside the current module
 *
 * @param {Object} options
 * @param {string} options.moduleDir
 * @param {string} options.sourceFileName
 * @param {string} options.bundledFileName
 * @param {string} [options.execDir]
 * @param {Function} [options.exists]
 * @return {string}
 */
function resolvePackagedRuntimeFile(options) {
  const exists = options.exists || fs.existsSync;
  const execDir = options.execDir || path.dirname(process.execPath);
  const moduleDir = options.moduleDir || process.cwd();

  const candidates = [
    path.join(execDir, options.bundledFileName),
    path.join(moduleDir, options.bundledFileName),
    path.join(moduleDir, options.sourceFileName),
  ];

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  return candidates[candidates.length - LOCAL_NUM_ONE];
}

export {
  resolveModuleDirectory,
  resolvePackagedRuntimeFile,
};
