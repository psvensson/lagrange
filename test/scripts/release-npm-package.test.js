import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  RELEASE_OUTCOME,
  classifyRegistryState,
  describePublishMismatch,
  normalizeRepositoryUrl,
  releaseChannel,
} from '../../scripts/release-npm-package.js';

const VERSION = '0.1.0';
const INTEGRITY = 'sha512-candidate';
const GIT_HEAD = '0123456789012345678901234567890123456789';
const REPOSITORY_URL = 'https://github.com/psvensson/lagrange';

function createCandidate() {
  return {
    gitHead: GIT_HEAD,
    integrity: INTEGRITY,
    manifest: {
      name: 'lagrange-server',
      version: VERSION,
      repository: {url: `${REPOSITORY_URL}.git`},
    },
  };
}

function createRegistryMetadata(overrides = {}) {
  const version = {
    gitHead: GIT_HEAD,
    dist: {integrity: INTEGRITY},
    ...overrides.version,
  };
  return {
    repository: {url: `git+${REPOSITORY_URL}.git`},
    versions: {[VERSION]: version},
    ...overrides.metadata,
  };
}

describe('npm release registry decisions', () => {
  it('normalizes npm repository URL variants', () => {
    assert.equal(
      normalizeRepositoryUrl(`git+${REPOSITORY_URL}.git`),
      REPOSITORY_URL,
    );
  });

  it('allows an unclaimed name or an absent version', () => {
    const candidate = createCandidate();
    assert.equal(
      classifyRegistryState(candidate, null),
      RELEASE_OUTCOME.NAME_AVAILABLE,
    );
    assert.equal(
      classifyRegistryState(candidate, createRegistryMetadata({
        metadata: {versions: {}},
      })),
      RELEASE_OUTCOME.VERSION_ABSENT,
    );
  });

  it('rejects a package owned by another repository', () => {
    const metadata = createRegistryMetadata({
      metadata: {repository: {url: 'https://example.com/foreign/repo.git'}},
    });
    assert.equal(
      classifyRegistryState(createCandidate(), metadata),
      RELEASE_OUTCOME.OCCUPIED_FOREIGN,
    );
  });

  it('rejects immutable-version content and commit conflicts', () => {
    const candidate = createCandidate();
    assert.equal(
      classifyRegistryState(candidate, createRegistryMetadata({
        version: {dist: {integrity: 'sha512-other'}},
      })),
      RELEASE_OUTCOME.VERSION_CONTENT_CONFLICT,
    );
    assert.equal(
      classifyRegistryState(candidate, createRegistryMetadata({
        version: {gitHead: 'ffffffffffffffffffffffffffffffffffffffff'},
      })),
      RELEASE_OUTCOME.VERSION_COMMIT_CONFLICT,
    );
  });

  it('recognizes a safe rerun of the exact artifact and commit', () => {
    assert.equal(
      classifyRegistryState(createCandidate(), createRegistryMetadata()),
      RELEASE_OUTCOME.ALREADY_PUBLISHED_MATCH,
    );
  });
});

describe('release channel', () => {
  it('sends a prerelease to next and a release to latest, and refuses the rest', () => {
    assert.deepEqual(releaseChannel('0.2.4'),
      {channel: 'release', distTag: 'latest', prerelease: false});
    assert.deepEqual(releaseChannel('0.2.4-rc.0'),
      {channel: 'prerelease', distTag: 'next', prerelease: true});
    assert.deepEqual(releaseChannel('1.0.0-beta.12'),
      {channel: 'prerelease', distTag: 'next', prerelease: true});
    for (const bad of ['v0.2.4', '0.2', '0.2.4+build', '']) {
      assert.throws(() => releaseChannel(bad), /not a release or prerelease semver/u,
        `${JSON.stringify(bad)} must be refused, never defaulted to latest`);
    }
  });
});

describe('publish mismatch verdicts carry npm output', () => {
  it('types a clean exit that published nothing, and quotes npm', () => {
    const verdict = describePublishMismatch(RELEASE_OUTCOME.VERSION_ABSENT, {
      status: 0,
      stdout: '+ lagrange-server@0.2.4-rc.0\n',
      stderr: 'npm notice Publishing to https://registry.npmjs.org/ with tag next',
    });
    assert.equal(verdict.outcome, RELEASE_OUTCOME.PUBLISH_EXITED_WITHOUT_VERSION);
    assert.match(verdict.message, /VERSION_ABSENT/u);
    assert.match(verdict.message, /npm said: /u);
    assert.match(verdict.message, /with tag next/u,
      'npm\'s own words are the only explanation of a zero exit with no version');
  });

  it('types a publish npm says it is still processing as pending, not as absent', () => {
    // npm's own closing line for a provenance-signed publish; the registry
    // is working, and the release must not be called a non-publication.
    const pending = describePublishMismatch(RELEASE_OUTCOME.VERSION_ABSENT, {
      status: 0,
      stdout: '+ lagrange-server@0.2.4-rc.1\n',
      stderr: 'npm notice Your package is being processed and may take a few minutes to become available.',
    });
    assert.equal(pending.outcome, RELEASE_OUTCOME.PUBLISH_ACCEPTED_PENDING_AVAILABILITY);
    assert.match(pending.message, /being processed/u);
  });

  it('keeps the conflict outcome for any other mismatch and says when npm was silent', () => {
    const conflict = describePublishMismatch(
      RELEASE_OUTCOME.VERSION_CONTENT_CONFLICT, {status: 0, stdout: '', stderr: ''});
    assert.equal(conflict.outcome, RELEASE_OUTCOME.PARTIAL_RELEASE_CONFLICT);
    assert.match(conflict.message, /npm printed nothing/u);
    const absentAfterFailure = describePublishMismatch(
      RELEASE_OUTCOME.VERSION_ABSENT, {status: 1, stderr: 'npm ERR! 403'});
    assert.equal(absentAfterFailure.outcome, RELEASE_OUTCOME.PARTIAL_RELEASE_CONFLICT,
      'a non-zero exit is not the silent case');
  });
});

