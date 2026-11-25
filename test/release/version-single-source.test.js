import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {CLI_VERSION} from '../../src/cli/cli-constants.js';
import {
  ENTRYPOINT_APP,
  ENTRYPOINT_VERSION,
} from '../../src/constants/entrypoint.js';

function listProductionSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'test-helpers') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listProductionSourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

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

  it('every production src/ module using import.meta.url guards it with SEA_BUILD', () => {
    const srcRoot = join(import.meta.dirname, '..', '..', 'src');
    for (const filePath of listProductionSourceFiles(srcRoot)) {
      const source = readFileSync(filePath, 'utf8');
      if (!source.includes('import.meta.url')) continue;
      assert.equal(
        source.includes('process.env.SEA_BUILD'),
        true,
        `${filePath} uses import.meta.url without a process.env.SEA_BUILD guard for CJS SEA bundling`,
      );
      assert.doesNotMatch(
        source,
        /^const\s+\w+\s*=\s*fileURLToPath\([^)]*import\.meta\.url/mu,
        `${filePath} evaluates fileURLToPath(import.meta.url) eagerly at top-level module scope`,
      );
    }
  });
});
