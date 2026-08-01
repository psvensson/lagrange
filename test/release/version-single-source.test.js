import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {CLI_VERSION} from '../../src/cli/cli-constants.js';
import {
  ENTRYPOINT_APP,
  ENTRYPOINT_VERSION,
} from '../../src/constants/entrypoint.js';

// The release version lives in three places that must never drift: package.json
// (the single source of truth) and the two user-facing `--version` string
// literals. They are literals rather than a runtime package.json read because
// the SEA single-executable build has no package.json on disk. This guard keeps
// them honest without that runtime coupling.
describe('release version single-source', () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'),
  );

  it('package.json version is a valid semver-ish string', () => {
    assert.match(pkg.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });

  it('CLI --version literal matches package.json', () => {
    assert.equal(
      CLI_VERSION,
      pkg.version,
      `CLI_VERSION (${CLI_VERSION}) must equal package.json version (${pkg.version})`,
    );
  });

  it('entrypoint --version literal matches package.json', () => {
    assert.equal(
      ENTRYPOINT_VERSION,
      pkg.version,
      `ENTRYPOINT_VERSION (${ENTRYPOINT_VERSION}) must equal package.json version (${pkg.version})`,
    );
  });

  it('npm identity is separate from the executable product identity', () => {
    assert.equal(pkg.name, 'lagrange-server');
    assert.equal(ENTRYPOINT_APP.PACKAGE_NAME, 'lagrange');
  });
});
