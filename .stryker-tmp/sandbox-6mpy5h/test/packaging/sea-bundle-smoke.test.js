// @ts-nocheck
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';
import {test} from '../../src/test-helpers/tap.js';
import {runEntrypoint} from '../../src/test-helpers/run-entrypoint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

const buildEntrypoint = join(projectRoot, 'scripts/build-sea.js');
const mainBundle = join(projectRoot, 'dist/index.bundle.cjs');
const cliBundle = join(projectRoot, 'dist/admin-cli.bundle.cjs');
const mainEntrypoint = join(projectRoot, 'src/index.js');

test('SEA bundle smoke test', async (t) => {
  const build = await runEntrypoint(buildEntrypoint, {timeoutMs: 30000});
  t.equal(build.exitCode, 0, 'build script exits cleanly');
  t.equal(fs.existsSync(mainBundle), true, 'main bundle exists after build');
  t.equal(fs.existsSync(cliBundle), true, 'CLI bundle exists after build');

  const cliHelp = await runEntrypoint(cliBundle, {
    args: ['--help'],
    timeoutMs: 15000,
  });
  t.equal(cliHelp.exitCode, 0, 'CLI bundle help exits cleanly');

  const sourceDryRun = await runEntrypoint(mainEntrypoint, {
    args: ['--dry-run'],
    env: {LOG_LEVEL: 'error'},
    timeoutMs: 15000,
  });
  t.equal(sourceDryRun.exitCode, 0, 'source entrypoint dry-run exits cleanly');
  t.notMatch(
      sourceDryRun.stdout,
      /Bootstrap API started/,
      'source dry-run does not start services',
  );

  const bundleDryRun = await runEntrypoint(mainBundle, {
    args: ['--dry-run'],
    env: {LOG_LEVEL: 'error'},
    timeoutMs: 15000,
  });
  t.equal(bundleDryRun.exitCode, 0, 'bundle dry-run exits cleanly');
  t.notMatch(
      bundleDryRun.stdout,
      /Bootstrap API started/,
      'bundle dry-run does not start services',
  );
});
