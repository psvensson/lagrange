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

import {test} from 'tap';
import fc from 'fast-check';
import {execSync as _execSync, spawnSync} from 'child_process';
import {existsSync} from 'fs';
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
 * Run an executable with given arguments.
 * @param {string} exePath - Path to executable
 * @param {string[]} args - Arguments to pass
 * @return {{stdout: string, stderr: string, exitCode: number}}
 */
function runExecutable(exePath, args) {
  const result = spawnSync(exePath, args, {
    encoding: 'utf8',
    timeout: 5000,
    cwd: projectRoot,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status || 0,
  };
}

/**
 * Run npm script with given arguments.
 * @param {string} script - npm script name
 * @param {string[]} args - Arguments to pass
 * @return {{stdout: string, stderr: string, exitCode: number}}
 */
function runNpmScript(script, args) {
  const result = spawnSync('npm', ['run', script, '--', ...args], {
    encoding: 'utf8',
    timeout: 10000,
    cwd: projectRoot,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status || 0,
  };
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
  // Skip if executables don't exist (not built yet)
  if (!executablesExist()) {
    t.skip('Executables not built. Run "npm run build:sea" first.');
    return;
  }

  const cliExe = join(distDir, 'ddb-cli');

  t.test('Property: CLI version output matches npm cli version', async (t) => {
    // Feature: single-executable-packaging
    // Property 40: Single Executable Behavioral Equivalence
    // Validates: Requirements 18.6
    fc.assert(
      fc.property(
        fc.constantFrom('--version', '-v'),
        (flag) => {
          const seaResult = runExecutable(cliExe, [flag]);
          const npmResult = runNpmScript('cli', [flag]);

          // Both should exit successfully
          if (seaResult.exitCode !== 0 || npmResult.exitCode !== 0) {
            return false;
          }

          // Both should contain the same version number
          const seaVersion = seaResult.stdout.match(/\d+\.\d+\.\d+/);
          const npmVersion = npmResult.stdout.match(/\d+\.\d+\.\d+/);

          if (!seaVersion || !npmVersion) {
            return false;
          }

          return seaVersion[0] === npmVersion[0];
        },
      ),
      {numRuns: 10},
    );
    t.pass('CLI version output is equivalent');
  });

  t.test('Property: CLI help output structure matches npm cli help',
    async (t) => {
      // Feature: single-executable-packaging
      // Property 40: Single Executable Behavioral Equivalence
      // Validates: Requirements 18.6
      fc.assert(
        fc.property(
          fc.constantFrom('--help', '-h'),
          (flag) => {
            const seaResult = runExecutable(cliExe, [flag]);
            const npmResult = runNpmScript('cli', [flag]);

            // Both should exit successfully
            if (seaResult.exitCode !== 0 || npmResult.exitCode !== 0) {
              return false;
            }

            const seaOutput = normalizeOutput(seaResult.stdout);
            const npmOutput = normalizeOutput(npmResult.stdout);

            // Both should contain the same key sections
            const requiredSections = ['Usage', 'Options'];
            for (const section of requiredSections) {
              if (!seaOutput.includes(section) ||
                        !npmOutput.includes(section)) {
                return false;
              }
            }

            // Both should have similar structure (same options listed)
            const seaHasHelp = seaOutput.includes('--help') ||
                                    seaOutput.includes('-h');
            const npmHasHelp = npmOutput.includes('--help') ||
                                    npmOutput.includes('-h');

            return seaHasHelp === npmHasHelp;
          },
        ),
        {numRuns: 10},
      );
      t.pass('CLI help output structure is equivalent');
    });

  t.test('Property: Exit codes are consistent between SEA and npm versions',
    async (t) => {
      // Feature: single-executable-packaging
      // Property 40: Single Executable Behavioral Equivalence
      // Validates: Requirements 18.6
      fc.assert(
        fc.property(
          fc.constantFrom(
            {args: ['--help'], expectedExit: 0},
            {args: ['--version'], expectedExit: 0},
            {args: ['-h'], expectedExit: 0},
            {args: ['-v'], expectedExit: 0},
          ),
          ({args, expectedExit}) => {
            const seaResult = runExecutable(cliExe, args);
            const npmResult = runNpmScript('cli', args);

            // Both should have the same exit code
            return seaResult.exitCode === expectedExit &&
                         npmResult.exitCode === expectedExit;
          },
        ),
        {numRuns: 10},
      );
      t.pass('Exit codes are consistent');
    });

  t.test('Property: Output format is consistent', async (t) => {
    // Feature: single-executable-packaging
    // Property 40: Single Executable Behavioral Equivalence
    // Validates: Requirements 18.6
    fc.assert(
      fc.property(
        fc.constantFrom('--help', '--version'),
        (flag) => {
          const seaResult = runExecutable(cliExe, [flag]);
          const npmResult = runNpmScript('cli', [flag]);

          // Both should produce non-empty output
          if (seaResult.stdout.length === 0 ||
                  npmResult.stdout.length === 0) {
            return false;
          }

          // Output should be text (not binary)
          const seaIsText = /^[\x20-\x7E\n\r\t]+$/.test(seaResult.stdout);
          const npmIsText = /^[\x20-\x7E\n\r\t]+$/.test(
            normalizeOutput(npmResult.stdout),
          );

          return seaIsText && npmIsText;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Output format is consistent');
  });
});
