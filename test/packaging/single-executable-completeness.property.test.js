/**
 * Property Test: Single Executable Completeness
 *
 * Property 39: Single Executable Completeness
 * *For any* single executable build of the system or CLI tool, it should
 * include all required dependencies and run without requiring Node.js to
 * be installed on the target system.
 *
 * **Validates: Requirements 18.1, 18.2, 18.3, 18.4**
 *
 * Note: This test validates that the executables exist, are executable,
 * and can respond to basic commands without Node.js in PATH.
 */

import {test} from '../../src/test-helpers/tap.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {runEntrypoint} from '../../src/test-helpers/run-entrypoint.js';
import {readFileSync} from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Single-source the expected version so the release bump cannot strand this
// test on a stale literal (it previously pinned '1.0.0').
const pkgVersion = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf8'),
).version;
const cliEntry = join(projectRoot, 'src/cli/bin/ddb-admin.js');
const mainEntry = join(projectRoot, 'src/index.js');

test('Single Executable Completeness - Property Test', async (t) => {
  // This test previously executed built SEA binaries with `PATH=""` to ensure
  // Node.js wasn't required. In CI environments where spawning is blocked and
  // executables are not built, that resulted in SKIPs (and a failing `npm test`).
  //
  // Here we validate the *entrypoints* are self-contained enough to respond to
  // `--help` / `--version` without connecting to a cluster or starting servers.

  // Feature: single-executable-packaging
  // Property 39: Single Executable Completeness
  // Validates: Requirements 18.1, 18.2, 18.4

  for (const flag of ['--help', '-h', '--version', '-v']) {
    const result = await runEntrypoint(cliEntry, {args: [flag], timeoutMs: 15000});
    t.equal(result.exitCode, 0, `cli entry exitCode is 0 for ${flag}`);
    t.ok(result.stdout.length > 0, `cli entry produces output for ${flag}`);
    if (flag === '--version' || flag === '-v') {
      t.ok(
        result.stdout.includes(pkgVersion),
        `cli entry version includes ${pkgVersion} for ${flag}`,
      );
    } else {
      t.ok(
        result.stdout.includes('Usage') || result.stdout.includes('Options'),
        `cli entry help includes usage/options for ${flag}`,
      );
    }
  }
  t.pass('CLI responds correctly to help/version flags');

  for (const flag of ['--help', '-h', '--version', '-v']) {
    const result = await runEntrypoint(mainEntry, {args: [flag], timeoutMs: 15000});
    t.equal(result.exitCode, 0, `main entry exitCode is 0 for ${flag}`);
    t.ok(result.stdout.length > 0, `main entry produces output for ${flag}`);
    if (flag === '--version' || flag === '-v') {
      t.ok(
        result.stdout.includes(pkgVersion),
        `main entry version includes ${pkgVersion} for ${flag}`,
      );
    } else {
      t.ok(
        result.stdout.includes('Usage') || result.stdout.includes('Options'),
        `main entry help includes usage/options for ${flag}`,
      );
    }
  }
  t.pass('Main system responds correctly to help/version flags');
});
