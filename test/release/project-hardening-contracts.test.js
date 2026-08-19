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
const GOLDEN_CAPABILITY_GATE_COMMAND_ID =
  'golden-capability-guard-scenarios';
const GOLDEN_CAPABILITY_GATE_RUNNER =
  'scripts/checks/run-golden-capability-guard-scenarios.js';
const ACCEPTANCE_MANIFEST_PATHS = [
  'test/manifests/project-hardening-proof-manifest.json',
  'test/manifests/project-hardening-proof-postpush-manifest.json',
];
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
  '.github/workflows/repository-health.yml',
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
    // test:fast now dispatches to one lane per resource class (ordinary runs
    // parallel, external-toolchain runs serially because a single toolchain
    // test can consume ~3.7 cores). The contract follows the delegation: every
    // lane must really invoke the harness, and no lane may use `xargs -r`,
    // which silently runs NOTHING when its input is empty and would turn a
    // broken lane selection into a green gate.
    const fastLanes = ['test:fast:ordinary', 'test:fast:toolchain'];
    for (const lane of fastLanes) {
      assert.match(packageJson.scripts['test:fast'], new RegExp(lane, 'u'));
      assert.match(packageJson.scripts[lane], /run-test-files\.js/u);
      assert.match(packageJson.scripts[lane], /plan-test-lane\.js/u);
      assert.doesNotMatch(packageJson.scripts[lane], /xargs[^|]*\s-r(?:\s|$)/u);
    }
    assert.match(
      packageJson.scripts['test:fast:toolchain'], /--jobs=1(?:\s|$)/u);
    assert.doesNotMatch(packageJson.scripts['test:deps'], /ignore-known/u);
    assert.equal(
      packageJson.scripts['test:gate'],
      packageJson.scripts['test:project-hardening'],
    );
    assert.match(
      packageJson.scripts['test:gate'],
      /run-project-hardening-acceptance\.js/u,
    );
    // Ordinary CI proves the CHANGE, not the corpus: the whole-system gate
    // moved to release and manual dispatch. `test:gate` must still exist and
    // still be the acceptance manifest - check:release depends on it - but it
    // is no longer what a pull request pays for.
    assert.match(ciText, /npm run check/u);
    assert.doesNotMatch(ciText, /npm run test:gate/u);
    assert.match(ciText, /postgresql-client/u);
    // RELEASE.md must document the CANONICAL whole-system command, not one of
    // the two commands that used to compete for the meaning of "complete".
    assert.match(releaseText, /npm run check:release/u);
  });

  it('runs the golden-capability guard-scenario tier in every push gate',
    async () => {
      const manifests = await Promise.all(
        ACCEPTANCE_MANIFEST_PATHS.map(async (manifestPath) =>
          JSON.parse(await readFile(manifestPath, UTF8))),
      );
      for (const manifest of manifests) {
        const command = manifest.commands.find(
          (entry) => entry.id === GOLDEN_CAPABILITY_GATE_COMMAND_ID,
        );
        assert.ok(command, `${manifest.id} must retain the guard tier`);
        assert.equal(command.executable, 'node');
        assert.deepEqual(command.argv, [GOLDEN_CAPABILITY_GATE_RUNNER]);
        assert.deepEqual(command.acceptableExitCodes, [0]);
        assert.equal(command.requiredArtifact.mode, 'captured-output');
      }
      await access(GOLDEN_CAPABILITY_GATE_RUNNER);
    });

  it('does not expose the retired Task 27 live-rerun gate', async () => {
    const packageJson = JSON.parse(await readFile('package.json', UTF8));
    assert.equal(packageJson.scripts['test:task27:distributed-stall-gate'], undefined);
    assert.equal(packageJson.scripts['test:task27:ci'], undefined);
    await assert.rejects(
      access('scripts/run-task27-distributed-stall-gate.sh'),
      {code: 'ENOENT'},
    );
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
    // Runner routing survives; the PATH CLASSIFIER does not. Deciding what a
    // change means belonged to two authorities - a YAML case statement here
    // and the source taxonomy in the repository - and two authorities on one
    // question eventually disagree. Routing is not that question: it is
    // identity and environment, which is the workflow's job.
    assert.equal(ci.jobs.changes, undefined,
      'CI must not carry a second authority on what a change means');
    const runsOn = ci.jobs.gate['runs-on'];
    assert.match(runsOn, /ubuntu-24\.04/u,
      'GitHub-hosted is the default runner');
    assert.match(runsOn, /\[ci:self-hosted\]/u,
      'a head-commit marker still routes a push to the local box');
    assert.doesNotMatch(runsOn, /\[ci:github\]/u,
      'there is no opt-in marker: hosted is the default, not a choice');
    assert.match(runsOn, /github\.event_name == 'push'/u,
      'pull requests can carry fork code and must never reach self-hosted');

    // The proof range is supplied by the workflow and consumed by repository
    // code through one variable, so the static layer and the change proof
    // cannot prove different ranges under a single `npm run check`.
    const rangeStep = ci.jobs.gate.steps.find(
      (step) => step.name === 'Resolve the proof range');
    assert.ok(rangeStep, 'CI must resolve the committed range it proves');
    assert.match(rangeStep.run, /LAGRANGE_CHECK_BASE=/u);
    assert.match(rangeStep.run, /PR_BASE_SHA/u,
      'a pull request proves base..head, not just its tip');
    assert.match(rangeStep.run, /PUSH_BEFORE_SHA/u,
      'a push proves the range the remote did not have');
    // ONE definition of complete. The repository used to carry two - the
    // nightly ran test:gate while releases ran test:ci - so "prove everything"
    // meant different things depending on who asked. check:release is now the
    // only answer, and both callers invoke it and nothing else.
    const packageJson = JSON.parse(await readFile('package.json', UTF8));
    const releaseProof = packageJson.scripts['check:release'];
    assert.match(releaseProof, /npm run test:ci/u);
    assert.match(releaseProof, /npm run test:gate/u,
      'check:release must contain BOTH prior notions of complete');

    const fullGateSteps = fullGate.jobs.gate.steps;
    const fullGateProof = fullGateSteps.filter(
      (step) => typeof step.run === 'string' &&
        /npm run (check|test):/u.test(step.run));
    assert.deepEqual(
      fullGateProof.map((step) => step.run.trim()), ['npm run check:release'],
      'the manual full gate proves via check:release and nothing else');

    const releaseProofSteps = release.jobs.release.steps.filter(
      (step) => typeof step.run === 'string' &&
        /npm run (check:release|test:ci|test:gate)/u.test(step.run));
    assert.deepEqual(
      releaseProofSteps.map((step) => step.run.trim()),
      ['npm run check:release'],
      'the tagged release proves via the same command as the full gate');

    // Manual only. A nightly whole-system proof is a standing veto: an
    // unrelated marginal test failing overnight made every unrelated change
    // unlandable, and an unchanged tree cannot grow new behavioural debt.
    assert.deepEqual(fullGate.on.workflow_dispatch, {});
    assert.equal(fullGate.on.schedule, undefined,
      'the whole-system proof must not run on a timer');

    // Repository health is a separate lane, never a change gate: structural
    // debt on main must not make unrelated development unlandable.
    const health = parse(await readFile(
      '.github/workflows/repository-health.yml', UTF8));
    assert.deepEqual(health.on.push.branches, ['main']);
    assert.equal(health.on.pull_request, undefined,
      'repository health must not gate pull requests');
    assert.equal(health.on.schedule, undefined);
    const healthRuns = health.jobs.health.steps
      .filter((step) => typeof step.run === 'string' &&
        /npm run /u.test(step.run))
      .map((step) => step.run.trim());
    assert.ok(healthRuns.includes('npm run test:owner-debt:prepare'),
      'inventory inputs are prepared before the analyses that read them');
    assert.ok(healthRuns.includes('npm run test:static'));
    assert.ok(healthRuns.includes('npm run model:contracts'));
    assert.ok(!healthRuns.some((run) => /test:sharded|test:fast|test:ci/u
      .test(run)),
    'repository health must not become a behavioural gate under another name');
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

    // Was `npm run test:ci`: the release pipeline used to carry its own notion
    // of a complete proof, different from the one the full gate used. It now
    // defers to check:release like every other caller.
    assert.match(releaseText, /npm run check:release/u);
    assert.doesNotMatch(releaseText, /npm run test:ci/u);
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
