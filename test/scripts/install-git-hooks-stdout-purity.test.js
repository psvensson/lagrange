import {test} from '../../src/test-helpers/tap.js';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The hooks installer runs as npm's `prepare` lifecycle, so `npm pack --json`
// captures whatever it writes to stdout. A single diagnostic line there makes
// the pack output unparseable and fails the release packaging receipt, which
// is how the 0.2 package-npm receipt failed on a clean checkout. Diagnostics
// belong on stderr; stdout stays machine-readable.
const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..',
);
const INSTALLER = path.join(REPO_ROOT, 'scripts', 'install-git-hooks.js');

test('install-git-hooks writes no diagnostics to stdout', async (t) => {
  const run = spawnSync(process.execPath, [INSTALLER], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  t.equal(run.stdout, '',
    'stdout is empty so npm pack --json output stays parseable');
  t.ok(run.stderr.includes('[hooks]'),
    'the diagnostic is still emitted, on stderr');
});
