import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {parse} from 'yaml';
import {ADMIN_DEFAULT} from '../../src/admin/admin-constants.js';
import {
  DEFAULT_CONFIG,
  ENV_MAPPINGS,
} from '../../src/config/config-constants.js';
import {
  PGWIRE_AUTH_MODE,
  PGWIRE_TLS_MODE,
  validatePgwireRuntimeConfig,
} from '../../src/runtime/pgwire-descriptor.js';
import {PGWIRE_DEFAULT} from '../../src/runtime/pgwire-runtime-module.js';

const UTF8 = 'utf8';
const PINNED_ACTION_PATTERN = /^[^@\s]+@[a-f0-9]{40}$/u;
const ACTION_REFERENCE_PATTERN = /^\s*uses:\s*(\S+)/gmu;
const RETIRED_RELEASE_PATHS = [
  '.forgejo/workflows/ci.yml',
  '.forgejo/workflows/full-gate.yml',
  '.forgejo/workflows/release.yml',
  'ci/forgejo-runner/README.md',
  'ci/forgejo-runner/.gitignore',
  'ci/forgejo-runner/config-template.yml',
  'ci/forgejo-runner/docker-compose.yml',
  'ci/forgejo-runner/job-log.sh',
  'ci/forgejo-runner/setup.sh',
];
const ACTIVE_RELEASE_SURFACES = [
  '.github/workflows/ci.yml',
  '.github/workflows/full-gate.yml',
  '.github/workflows/release.yml',
  'CHANGELOG.md',
  'Dockerfile',
  'README.md',
  'RELEASE.md',
  'package.json',
  'charts/lagrange-node/Chart.yaml',
  'charts/lagrange-node/README.md',
  'charts/lagrange-node/values.yaml',
  'docs/dockerhub-overview.md',
  'scripts/release-notes.js',
];

describe('project hardening contracts', () => {
  it('keeps network defaults local and mutation enforcement active', () => {
    assert.equal(ADMIN_DEFAULT.HOST, '127.0.0.1');
    assert.equal(ADMIN_DEFAULT.ENFORCEMENT_MODE, 'enforce');
    assert.equal(PGWIRE_DEFAULT.HOST, '127.0.0.1');
    assert.equal(DEFAULT_CONFIG.admin.websocketHost, '127.0.0.1');
    assert.equal(DEFAULT_CONFIG.admin.allowInsecureExternalBind, false);
    assert.equal(
      ENV_MAPPINGS.ADMIN_WS_HOST,
      'admin.websocketHost',
    );

    const externalTrust = validatePgwireRuntimeConfig(JSON.stringify({
      host: '0.0.0.0',
      authMode: PGWIRE_AUTH_MODE.TRUST,
      tlsMode: PGWIRE_TLS_MODE.DISABLE,
    }));
    assert.equal(externalTrust.valid, false);
  });

  it('runs tests and strict dependency checks on every push', async () => {
    const [packageText, ciText, releaseText] = await Promise.all([
      readFile('package.json', UTF8),
      readFile('.github/workflows/ci.yml', UTF8),
      readFile('RELEASE.md', UTF8),
    ]);
    const packageJson = JSON.parse(packageText);

    assert.equal(packageJson.main, 'src/public-api.js');
    assert.match(packageJson.scripts['test:fast'], /run-test-files\.js/u);
    assert.doesNotMatch(packageJson.scripts['test:fast'], /xargs[^|]*\s-r(?:\s|$)/u);
    assert.doesNotMatch(packageJson.scripts['test:deps'], /ignore-known/u);
    assert.equal(
      packageJson.scripts['test:gate'],
      packageJson.scripts['test:project-hardening'],
    );
    assert.match(
      packageJson.scripts['test:gate'],
      /run-project-hardening-acceptance\.js/u,
    );
    assert.match(ciText, /npm run test:gate/u);
    assert.match(ciText, /postgresql-client/u);
    assert.match(releaseText, /npm run test:gate/u);
  });

  it('owns CI and release publication through GitHub Actions only', async () => {
    const [ciText, fullGateText, releaseText, ...surfaceTexts] =
      await Promise.all([
        readFile('.github/workflows/ci.yml', UTF8),
        readFile('.github/workflows/full-gate.yml', UTF8),
        readFile('.github/workflows/release.yml', UTF8),
        ...ACTIVE_RELEASE_SURFACES.slice(3).map((file) => readFile(file, UTF8)),
      ]);
    const ci = parse(ciText);
    const fullGate = parse(fullGateText);
    const release = parse(releaseText);

    assert.deepEqual(ci.on.push.branches, ['main']);
    assert.deepEqual(ci.on.pull_request.branches, ['main']);
    assert.deepEqual(fullGate.on.workflow_dispatch, {});
    assert.deepEqual(release.on.push.tags, ['v*']);
    assert.equal(release.permissions.contents, 'read');
    assert.equal(release.jobs.release.permissions.contents, 'write');
    assert.equal(release.concurrency.group, 'release-publish');
    assert.equal(release.concurrency['cancel-in-progress'], false);

    for (const workflowText of [ciText, fullGateText, releaseText]) {
      for (const match of workflowText.matchAll(ACTION_REFERENCE_PATTERN)) {
        assert.match(match[1], PINNED_ACTION_PATTERN);
      }
    }

    assert.match(releaseText, /npm run test:ci/u);
    assert.match(releaseText, /git cat-file -t/u);
    assert.match(releaseText, /git merge-base --is-ancestor/u);
    assert.match(releaseText, /refs\/remotes\/origin\/main/u);
    assert.match(releaseText, /npm run build:all/u);
    assert.match(releaseText, /helm package charts\/lagrange-node/u);
    assert.match(releaseText, /SHA256SUMS/u);
    assert.match(
      releaseText,
      /ASSETS=\(lagrange lagrange-cli "lagrange-node-\$\{VERSION\}\.tgz"\)/u,
    );
    assert.match(releaseText, /dist\/lagrange-node-\$\{VERSION\}\.tgz/u);
    assert.match(releaseText, /docker\/build-push-action@[a-f0-9]{40}/u);
    assert.match(
      releaseText,
      /docker run --rm "\$DOCKERHUB_IMAGE:\$VERSION" src\/index\.js --version/u,
    );
    assert.match(releaseText, /lagrange v\$VERSION/u);
    assert.match(releaseText, /docker push "\$DOCKERHUB_IMAGE:\$VERSION"/u);
    assert.match(releaseText, /docker push "\$DOCKERHUB_IMAGE:latest"/u);
    assert.match(releaseText, /matching-refs\/tags\/v/u);
    assert.match(releaseText, /vars\.DOCKERHUB_USERNAME/u);
    assert.match(releaseText, /secrets\.DOCKERHUB_TOKEN/u);
    assert.match(releaseText, /gh release create/u);
    assert.match(releaseText, /gh release upload/u);
    assert.match(releaseText, /--verify-tag/u);
    assert.match(releaseText, /--draft=false/u);

    for (const retiredPath of RETIRED_RELEASE_PATHS) {
      await assert.rejects(access(retiredPath), {code: 'ENOENT'});
    }
    assert.doesNotMatch(
      [ciText, fullGateText, releaseText, ...surfaceTexts].join('\n'),
      /codeberg|forgejo|\.forgejo/iu,
    );
  });
});
