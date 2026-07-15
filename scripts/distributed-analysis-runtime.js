import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const GZIP_LOG_SUFFIX = '.log.gz';
const NEWLINE = '\n';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * Discover the compressed node logs accepted by distributed-log analyzers.
 * A file target is accepted only when it has the canonical suffix; directory
 * targets are traversed recursively and returned in deterministic order.
 *
 * @param {string} target - Compressed log file or directory to inspect.
 * @return {Promise<string[]>} Canonically ordered compressed log paths.
 */
async function collectLogGzFiles(target) {
  const stat = await fs.stat(target);
  if (stat.isFile()) {
    return target.endsWith(GZIP_LOG_SUFFIX) ? [target] : [];
  }
  const found = [];
  async function visit(directory) {
    const dirents = await fs.readdir(directory, {withFileTypes: true});
    for (const dirent of dirents) {
      const child = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        await visit(child);
      } else if (
        dirent.isFile() &&
        dirent.name.endsWith(GZIP_LOG_SUFFIX)
      ) {
        found.push(child);
      }
    }
  }
  await visit(target);
  return found.sort();
}

/**
 * Run an analyzer's async result contract only when its module is the process
 * entrypoint. Analyzer modules retain ownership of argument parsing and result
 * rendering; this runtime owns their identical process I/O and exit behavior.
 *
 * @param {string} metaUrl - Calling module's import.meta.url.
 * @param {(argv: string[]) => Promise<{ok: boolean, output: string}>} runCli
 * Analyzer-owned command implementation.
 * @return {void}
 */
function runAnalyzerCliWhenDirect(metaUrl, runCli) {
  if (process.argv[1] !== fileURLToPath(metaUrl)) {
    return;
  }
  runCli(process.argv.slice(2))
    .then((result) => {
      (result.ok ? process.stdout : process.stderr).write(
        result.output + NEWLINE,
      );
      process.exitCode = result.ok ? EXIT_SUCCESS : EXIT_FAILURE;
    })
    .catch((error) => {
      process.stderr.write(String(error?.message ?? error) + NEWLINE);
      process.exitCode = EXIT_FAILURE;
    });
}

export {collectLogGzFiles, runAnalyzerCliWhenDirect};
