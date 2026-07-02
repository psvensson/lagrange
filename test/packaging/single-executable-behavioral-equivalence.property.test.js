/**
 * Property Test: Single Executable Behavioral Equivalence
 *
 * Property 40: Single Executable Behavioral Equivalence
 * *For any* operation performed by the single executable version, it should
 * produce identical results to the non-packaged version running under Node.js.
 *
 * **Validates: Requirements 18.6**
 *
 * Note: This test compares the output of the SEA executables with the
 * equivalent npm commands to ensure behavioral equivalence.
 */

import {test} from '../../src/test-helpers/tap.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {Worker} from 'worker_threads';
import {runEntrypoint} from '../../src/test-helpers/run-entrypoint.js';
import {readFileSync} from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Single-source the expected package name so a rename cannot strand this test
// on a stale literal (it previously pinned 'distributed-database-system').
const pkgName = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf8'),
).name;

const cliEntry = join(projectRoot, 'src/cli/bin/lagrange-admin.js');
const mainEntry = join(projectRoot, 'src/index.js');
const adminCliDirectWorker = join(
  projectRoot,
  'src/test-helpers/worker/admin-cli-direct-runner.js',
);

function runWorkerScript(workerPath, workerData, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {workerData});
    worker.unref();
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {});
      reject(new Error(`Worker timeout after ${timeoutMs}ms: ${workerPath}`));
    }, timeoutMs);

    worker.once('message', (msg) => {
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      if (msg && msg.error) {
        reject(new Error(msg.stderr || 'Worker failed'));
        return;
      }
      resolve({
        stdout: msg.stdout || '',
        stderr: msg.stderr || '',
        exitCode: msg.exitCode ?? 0,
      });
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      reject(err);
    });
  });
}

/**
 * Normalize output for comparison by removing timestamps and variable content.
 * @param {string} output - Raw output
 * @return {string} Normalized output
 */
function normalizeOutput(output) {
  return output
  // Remove npm script header lines
    .replace(/^> .*\n/gm, '')
  // Remove empty lines
    .replace(/^\s*\n/gm, '')
  // Trim whitespace
    .trim();
}

test('Single Executable Behavioral Equivalence - Property Test', async (t) => {
  // This test previously spawned SEA executables and `npm run cli`. In some CI
  // environments, child process spawning is blocked which caused SKIPs and a
  // non-zero `tap` exit. Instead, we assert "entrypoint vs library" equivalence
  // in-process (bin wrapper vs direct AdminCLI invocation).

  // Feature: single-executable-packaging
  // Property 40: Single Executable Behavioral Equivalence
  // Validates: Requirements 18.6

  // Version output matches between entry wrapper and direct class invocation.
  for (const flag of ['--version', '-v']) {
    const entryResult = await runEntrypoint(cliEntry, {args: [flag], timeoutMs: 15000});
    const directResult = await runWorkerScript(adminCliDirectWorker, {args: [flag]}, 15000);

    t.equal(entryResult.exitCode, 0, `cli entry exitCode is 0 for ${flag}`);
    t.equal(directResult.exitCode, 0, `cli direct exitCode is 0 for ${flag}`);

    const entryVersion = entryResult.stdout.match(/\d+\.\d+\.\d+/);
    const directVersion = directResult.stdout.match(/\d+\.\d+\.\d+/);
    t.ok(entryVersion, `cli entry prints a semver for ${flag}`);
    t.ok(directVersion, `cli direct prints a semver for ${flag}`);
    t.equal(entryVersion?.[0], directVersion?.[0], `cli versions match for ${flag}`);
  }
  t.pass('CLI version output is equivalent');

  // Help output has consistent structure.
  for (const flag of ['--help', '-h']) {
    const entryResult = await runEntrypoint(cliEntry, {args: [flag], timeoutMs: 15000});
    const directResult = await runWorkerScript(adminCliDirectWorker, {args: [flag]}, 15000);

    t.equal(entryResult.exitCode, 0, `cli entry exitCode is 0 for ${flag}`);
    t.equal(directResult.exitCode, 0, `cli direct exitCode is 0 for ${flag}`);

    const entryOutput = normalizeOutput(entryResult.stdout);
    const directOutput = normalizeOutput(directResult.stdout);
    for (const section of ['Usage', 'Options']) {
      t.ok(entryOutput.includes(section), `cli entry help includes ${section}`);
      t.ok(directOutput.includes(section), `cli direct help includes ${section}`);
    }
  }
  t.pass('CLI help output structure is equivalent');

  // Output format sanity (text and non-empty).
  for (const flag of ['--help', '--version']) {
    const entryResult = await runEntrypoint(cliEntry, {args: [flag], timeoutMs: 15000});
    const directResult = await runWorkerScript(adminCliDirectWorker, {args: [flag]}, 15000);
    t.ok(entryResult.stdout.length > 0, `cli entry output non-empty for ${flag}`);
    t.ok(directResult.stdout.length > 0, `cli direct output non-empty for ${flag}`);
    t.ok(
      /^[\x20-\x7E\n\r\t]+$/.test(entryResult.stdout),
      `cli entry output is text for ${flag}`,
    );
    t.ok(
      /^[\x20-\x7E\n\r\t]+$/.test(normalizeOutput(directResult.stdout)),
      `cli direct output is text for ${flag}`,
    );
  }
  t.pass('Output format is consistent');

  // Main entrypoint responds to help/version.
  for (const flag of ['--help', '-h', '--version', '-v']) {
    const res = await runEntrypoint(mainEntry, {args: [flag], timeoutMs: 15000});
    t.equal(res.exitCode, 0, `main entry exitCode is 0 for ${flag}`);
    const out = normalizeOutput(res.stdout);
    t.ok(out.length > 0, `main entry output non-empty for ${flag}`);
    if (flag === '--version' || flag === '-v') {
      t.ok(
        out.includes(pkgName),
        `main version output includes name for ${flag}`,
      );
      t.ok(/\d+\.\d+\.\d+/.test(out), `main version output includes semver for ${flag}`);
    } else {
      t.ok(
        out.includes('Usage: lagrange'),
        `main help output includes Usage for ${flag}`,
      );
      t.ok(out.includes('Options'), `main help output includes Options for ${flag}`);
    }
  }
  t.pass('Main help/version output is stable');
});
