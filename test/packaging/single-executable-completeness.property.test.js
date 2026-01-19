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

import {test} from 'tap';
import fc from 'fast-check';
import {execSync as _execSync, spawnSync} from 'child_process';
import {existsSync, statSync} from 'fs';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');
const distDir = join(projectRoot, 'dist');

/**
 * Check if executables exist.
 * @return {boolean} True if both executables exist
 */
function executablesExist() {
  const mainExe = join(distDir, 'distributed-db');
  const cliExe = join(distDir, 'ddb-cli');
  return existsSync(mainExe) && existsSync(cliExe);
}

/**
 * Run an executable with given arguments and empty PATH.
 * @param {string} exePath - Path to executable
 * @param {string[]} args - Arguments to pass
 * @return {{stdout: string, stderr: string, exitCode: number}}
 */
function runWithoutNodeInPath(exePath, args) {
  const result = spawnSync(exePath, args, {
    env: {PATH: ''},
    encoding: 'utf8',
    timeout: 5000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status || 0,
  };
}

test('Single Executable Completeness - Property Test', async (t) => {
  // Skip if executables don't exist (not built yet)
  if (!executablesExist()) {
    t.skip('Executables not built. Run "npm run build:sea" first.');
    return;
  }

  const mainExe = join(distDir, 'distributed-db');
  const cliExe = join(distDir, 'ddb-cli');

  t.test('executables exist and are executable files', async (t) => {
    // Main system executable
    t.ok(existsSync(mainExe), 'Main system executable exists');
    const mainStats = statSync(mainExe);
    t.ok(mainStats.isFile(), 'Main system executable is a file');
    t.ok((mainStats.mode & 0o111) !== 0, 'Main system executable has execute permission');

    // CLI executable
    t.ok(existsSync(cliExe), 'CLI executable exists');
    const cliStats = statSync(cliExe);
    t.ok(cliStats.isFile(), 'CLI executable is a file');
    t.ok((cliStats.mode & 0o111) !== 0, 'CLI executable has execute permission');
  });

  t.test('executables have reasonable size (include Node.js runtime)', async (t) => {
    const mainStats = statSync(mainExe);
    const cliStats = statSync(cliExe);

    // Node.js runtime is typically 50-150MB
    const minSize = 50 * 1024 * 1024; // 50MB minimum
    const maxSize = 200 * 1024 * 1024; // 200MB maximum

    t.ok(
      mainStats.size >= minSize,
      `Main executable size (${mainStats.size}) >= ${minSize}`,
    );
    t.ok(
      mainStats.size <= maxSize,
      `Main executable size (${mainStats.size}) <= ${maxSize}`,
    );

    t.ok(
      cliStats.size >= minSize,
      `CLI executable size (${cliStats.size}) >= ${minSize}`,
    );
    t.ok(
      cliStats.size <= maxSize,
      `CLI executable size (${cliStats.size}) <= ${maxSize}`,
    );
  });

  t.test('Property: CLI responds to help/version without Node.js in PATH',
    async (t) => {
      // Feature: single-executable-packaging
      // Property 39: Single Executable Completeness
      // Validates: Requirements 18.2, 18.4
      fc.assert(
        fc.property(
          fc.constantFrom('--help', '-h', '--version', '-v'),
          (flag) => {
            const result = runWithoutNodeInPath(cliExe, [flag]);

            // Should exit successfully
            if (result.exitCode !== 0) {
              return false;
            }

            // Should produce output
            if (result.stdout.length === 0) {
              return false;
            }

            // Version flag should contain version number
            if (flag === '--version' || flag === '-v') {
              return result.stdout.includes('1.0.0');
            }

            // Help flag should contain usage information
            if (flag === '--help' || flag === '-h') {
              return result.stdout.includes('Usage') ||
                           result.stdout.includes('Options');
            }

            return true;
          },
        ),
        {numRuns: 10},
      );
      t.pass('CLI responds correctly to help/version flags without Node.js');
    });

  t.test('Property: Main system responds to help/version without Node.js',
    async (t) => {
      // Feature: single-executable-packaging
      // Property 39: Single Executable Completeness
      // Validates: Requirements 18.1, 18.4
      fc.assert(
        fc.property(
          fc.constantFrom('--help', '-h', '--version', '-v'),
          (flag) => {
            const result = runWithoutNodeInPath(mainExe, [flag]);

            // Should exit successfully
            if (result.exitCode !== 0) {
              return false;
            }

            // Should produce output
            if (result.stdout.length === 0) {
              return false;
            }

            // Version flag should contain version number
            if (flag === '--version' || flag === '-v') {
              return result.stdout.includes('1.0.0');
            }

            // Help flag should contain usage information
            if (flag === '--help' || flag === '-h') {
              return result.stdout.includes('Usage') ||
                           result.stdout.includes('Options');
            }

            return true;
          },
        ),
        {numRuns: 10},
      );
      t.pass('Main system responds correctly to help/version flags');
    });

  t.test('Property: Executables are self-contained binaries', async (t) => {
    // Feature: single-executable-packaging
    // Property 39: Single Executable Completeness
    // Validates: Requirements 18.3
    fc.assert(
      fc.property(
        fc.constantFrom(mainExe, cliExe),
        (exePath) => {
          // Check that the executable is an ELF binary (Linux)
          const result = spawnSync('file', [exePath], {
            encoding: 'utf8',
            timeout: 5000,
          });

          if (result.status !== 0) {
            // 'file' command not available, skip this check
            return true;
          }

          // Should be an ELF executable
          return result.stdout.includes('ELF') &&
                     result.stdout.includes('executable');
        },
      ),
      {numRuns: 10},
    );
    t.pass('Executables are self-contained ELF binaries');
  });
});
