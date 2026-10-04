import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {access, readFile, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {parse} from 'yaml';
import {registeredActions} from '../../scripts/action-authority.js';
import {parsePublishArgs} from '../../scripts/publish-head.js';
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
import {RAFT_RS_BINDING_LAYOUT} from '../../src/raft/raft-rs-core-constants.js';

const UTF8 = 'utf8';
const RUNTIME_IMAGE_STAGE = /^FROM \S+ AS runtime$/mu;
const CONTEXT_COPY = /^COPY (?!--from)\S+ \S+$/gmu;
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

// Lab hosts are shared by agents across projects (owner directive
// 2026-09-23): heavy work reaches one only through the placement wrapper,
// `lab test` and `lab harness run`, each under the machine-wide lock, or
// through the documented recipe in another project - never a raw ssh runner.
const LAB_SHARING_ROOTS = ['scripts', '.github'];
const LAB_SHARING_TEXT = /\.(?:js|mjs|cjs|sh|ya?ml)$/u;
const SSH_WORD = /\bssh\b/u;
// The classified runner or the distributed harness, as a shell command.
const REMOTE_RUNNER_COMMAND =
  /\bnode\s+(?:\.\/)?(?:scripts\/run-classified-test-files\.js|test\/distributed\/run\.js)\b/gu;
const LAB_SHARING_SECTION = /^## Sharing the lab between agents and projects\n([\s\S]*?)(?=^## )/mu;
const LAB_RECIPE_BLOCK = /```sh\n([\s\S]*?)```/u;
const LAB_RECIPE_COMMANDS = [
  /^mkdir -p "\$\{LAB_LOCK_DIR:=\$HOME\/\.lab\}" && exec 9>"\$LAB_LOCK_DIR\/machine\.lock"$/mu,
  /^flock -w \d+ 9 \|\| exit 98$/mu,
  /^printf '\{"project":[\s\S]*?> "\$LAB_LOCK_DIR\/machine\.holder\.json"$/mu,
  /^trap 'rm -f "\$LAB_LOCK_DIR\/machine\.holder\.json"' EXIT$/mu,
];

// Every shell-command invocation of the runner or the harness in a file that
// also speaks ssh, as `file: command`.
async function remoteRunnerInvocations() {
  const found = [];
  for (const root of LAB_SHARING_ROOTS) {
    const entries = await readdir(root, {recursive: true, withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isFile() || !LAB_SHARING_TEXT.test(entry.name)) continue;
      const file = `${entry.parentPath}/${entry.name}`;
      const text = await readFile(file, UTF8);
      if (!SSH_WORD.test(text)) continue;
      for (const match of text.matchAll(REMOTE_RUNNER_COMMAND)) found.push(`${file}: ${match[0]}`);
    }
  }
  return found.sort();
}

describe('project hardening contracts', () => {
  it('runs heavy lab work only under the machine-wide lock', async () => {
    assert.deepEqual(await remoteRunnerInvocations(),
      ['scripts/lab/probe.js: node scripts/run-classified-test-files.js'],
      'the placement wrapper is the one remote invocation of the runner or the harness');
    const [probe, harness, homeLab, runbook] = await Promise.all([
      readFile('scripts/lab/probe.js', UTF8), readFile('scripts/lab/harness.js', UTF8),
      readFile('docs/development/home-lab.md', UTF8),
      readFile('docs/development/solver-runbook.md', UTF8)]);
    assert.ok(/\$\{LAB_LOCK_DIR:-\$HOME\/\.lab\}/u.test(probe),
      'and it takes the convention\'s machine-wide lock');
    assert.ok(!/flock -n 9 \|\|/u.test(probe), 'never a per-checkout lock alone, unwaited');
    assert.ok(/^import \{[^}]*\bholdLabMachine\b[^}]*\} from '\.\/probe\.js';$/mu.test(harness),
      'a formation holds its nodes through the same owner');
    const section = LAB_SHARING_SECTION.exec(homeLab)?.[1] ?? '';
    const recipe = LAB_RECIPE_BLOCK.exec(section)?.[1] ?? '';
    for (const command of LAB_RECIPE_COMMANDS) {
      assert.match(recipe, command, 'another project needs only the four-line recipe');
    }
    for (const text of [section, runbook]) {
      assert.match(text, /never a raw ssh\s+runner\s+invocation/u,
        'heavy lab work goes through lab test, placement or lab harness run');
    }
  });

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
    // Selection and scheduling are separate owners: plan-test-lane chooses the
    // exact corpus, then the classified runner applies the one resource policy
    // used by widened, fast, and release proofs.
    assert.match(
      packageJson.scripts['test:fast'], /run-classified-test-files\.js/u);
    assert.match(
      packageJson.scripts['test:fast'], /--primary unit,packaging,integration/u);
    assert.equal(packageJson.scripts['test:fast:ordinary'], undefined);
    assert.equal(packageJson.scripts['test:fast:toolchain'], undefined);
    assert.match(
      packageJson.scripts['test:all'],
      /run-classified-test-files\.js/u,
    );
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

  // Thermal headroom is gated by the runner on every host it runs on, lab
  // hosts included (owner directive 2026-09-23): the one classified runner
  // imports the one thermal owner and asks it before every lane batch, so no
  // placed, local or corpus run can start a batch on a hot machine.
  it('gates thermal headroom in the classified runner before every batch', async () => {
    const runner = await readFile('scripts/run-classified-test-files.js', UTF8);
    assert.match(runner,
      /^import \{[^}]*\bwaitForThermalHeadroom\b[^}]*\} from '\.\/checks\/wait-for-thermal-headroom\.js';$/mu,
      'the runner consumes the thermal owner, never a copy of its thresholds');
    assert.doesNotMatch(runner, /wait-for-thermal-headroom\.js'\]|spawn[^\n]*wait-for-thermal/u,
      'it calls the owner, never spawns its script');
    const batchLoop = /for \(let batchIndex = 0;[\s\S]*?\n {4}\}\n/u.exec(runner)?.[0] ?? '';
    const gateAt = batchLoop.search(/\bgate\(\)/u);
    const spawnAt = batchLoop.search(/\bspawn\(process\.execPath/u);
    assert.ok(gateAt >= 0 && spawnAt > gateAt,
      'inside the batch loop, the gate is asked before the batch is spawned');
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


  // Extracted so the contract above stays one readable list of claims rather
  // than one function the complexity ratchet refuses.
  function assertRepositoryHealthLane(ci) {
    // A separate LANE, never a change gate: structural debt on main must not
    // make unrelated development unlandable. Since gate-work-consolidation it
    // is a step of the gate job rather than a second workflow over the same
    // sha, so the lane is kept by continue-on-error and by the red-main guard
    // reading only this workflow's conclusion, which the step never decides.
    const health = ci.jobs.gate.steps.find(
      (step) => step.name === 'Whole-repository structural analysis');
    assert.ok(health, 'the structural analysis still runs');
    assert.equal(health['continue-on-error'], true,
      'structural debt must never decide whether a change is proved');
    assert.equal(health.if, 'github.ref == \'refs/heads/main\'',
      'repository health belongs to main, not to a pull request or a branch');
    assert.ok(Number.isFinite(health['timeout-minutes']),
      'the analysis carries its own bound: continue-on-error absorbs a ' +
      'failing step, never a job timeout, so an overrun would fail the ' +
      'required run and block every later push');
    assert.equal(ci.on.schedule, undefined);
    const healthRuns = health.run;
    for (const analysis of ['npm run test:owner-debt:prepare',
      'npm run test:static', 'npm run model:contracts']) {
      assert.ok(healthRuns.includes(analysis), `${analysis} still runs`);
    }
    assert.ok(
      healthRuns.indexOf('npm run test:owner-debt:prepare') <
        healthRuns.indexOf('npm run test:static'),
      'inventory inputs are prepared before the analyses that read them');
    assert.ok(!/test:sharded|test:fast|test:ci/u.test(healthRuns),
      'repository health must not become a behavioural gate under another name');
  }

  function assertCanaryRunsOnlyByHand(canary) {
    // The owner's rule (2026-09-18): the corpus never runs on a hosted runner
    // while a local alternative exists, releases included. The publisher
    // proves the rest of the corpus locally after every cone publish
    // (scripts/publish-head.js, the local corpus); this workflow is the
    // fallback, dispatched by hand - no gate run, push, pull request or
    // schedule wakes it.
    assert.deepEqual(Object.keys(canary.on), ['workflow_dispatch'],
      'the hosted canary runs only when dispatched by hand');
    assert.equal(canary.jobs.corpus.needs, 'decide');
    // The corpus runs when the decision leaves it something to prove, and an
    // ABSENT answer counts as owed: a decide job that fails or times out must
    // not silently skip the corpus, while a cancelled run must not launch a
    // 300-minute job on a superseded head (canary-proof-reuse, verifier
    // rounds 1-2). The decision itself lives in
    // scripts/checks/canary-corpus-needed.js.
    const corpusCondition = String(canary.jobs.corpus.if);
    assert.match(corpusCondition, /needs\.decide\.outputs\.needed != 'false'/u,
      'only an explicit false leaves the corpus unproved-but-skipped');
    assert.match(corpusCondition, /!cancelled\(\)/u,
      'a failed decision still reaches the corpus; a cancelled one does not');
    assert.match(corpusCondition, /needs\.decide\.result != 'skipped'/u,
      'a skipped decision never starts the corpus');
    assert.ok(!JSON.stringify(canary.jobs.decide.if).includes('conclusion'),
      'a red gate can be an unrelated intermittent: the corpus still runs');
    const canaryCheckout = canary.jobs.corpus.steps.find(
      (step) => step.name === 'Checkout');
    assert.match(String(canaryCheckout?.with?.ref),
      /github\.sha/u,
      'the corpus proves the sha it was dispatched for');
    assert.equal(canary.concurrency['cancel-in-progress'], true,
      'only the newest head is worth proving');
  }

  // preserved-branches-run-their-cone (owner, 2026-10-04): a quest/, land/ or
  // review/ branch push proves its cone on a GitHub-hosted runner, against its
  // merge-base with main; wip/ and every other prefix run nothing; no event
  // reaches any other runner; main and pull requests behave as before.
  const CI_WORKFLOW = '.github/workflows/ci.yml';
  const readCi = async () => {
    const text = await readFile(CI_WORKFLOW, UTF8);
    return {text, ci: parse(text)};
  };
  const BRANCH_PUSH = 'branch push';
  const MAIN_PUSH = 'main push';
  const PULL_REQUEST = 'pull request';
  // Every condition a gate step may carry, and whether it holds for each
  // event (on a successful run). An unlisted condition fails the witness, so
  // a new one is classified here before any event's step set can change.
  const STEP_CONDITIONS = Object.freeze({
    'runner.environment == \'github-hosted\'':
      {[MAIN_PUSH]: true, [PULL_REQUEST]: true, [BRANCH_PUSH]: true},
    'always()': {[MAIN_PUSH]: true, [PULL_REQUEST]: true, [BRANCH_PUSH]: true},
    'failure()': {[MAIN_PUSH]: false, [PULL_REQUEST]: false, [BRANCH_PUSH]: false},
    'github.ref == \'refs/heads/main\'':
      {[MAIN_PUSH]: true, [PULL_REQUEST]: false, [BRANCH_PUSH]: false},
    'always() && github.ref == \'refs/heads/main\'':
      {[MAIN_PUSH]: true, [PULL_REQUEST]: false, [BRANCH_PUSH]: false},
  });
  const stepsFor = (ci, event) => ci.jobs.gate.steps.filter((step) => {
    if (step.if === undefined) return true;
    assert.ok(Object.hasOwn(STEP_CONDITIONS, step.if),
      `classify the step condition ${step.if}`);
    return STEP_CONDITIONS[step.if][event];
  }).map((step) => step.name);
  const PROOF_STEPS = Object.freeze(['Checkout', 'Resolve the proof range',
    'Set up Node 22', 'Install gate CLI tools', 'Install dependencies',
    'Fetch MovieLens dataset (digest-pinned)',
    'Prepare generated test metadata', 'Ordinary proof',
    'Upload the proof scope']);

  it('runs the change gate on main, pull requests into main and the preserved prefixes only', async () => {
    const {ci} = await readCi();
    assert.deepEqual(Object.keys(ci.on).sort(),
      ['pull_request', 'push', 'workflow_dispatch'],
      'no pull_request_target, workflow_run or other trigger');
    assert.deepEqual(ci.on.push, {branches: ['main', 'quest/**', 'land/**', 'review/**']},
      'pushes to main and the owner\'s three prefixes; wip/** and the rest run nothing');
    assert.deepEqual(ci.on.pull_request, {branches: ['main']});
    assert.equal(ci.permissions.contents, 'read');
    assert.deepEqual(Object.keys(ci.permissions), ['contents'], 'least privilege');
    assert.deepEqual(Object.keys(ci.jobs), ['gate']);
  });

  it('runs every ci.yml job on a GitHub-hosted runner, whatever the event', async () => {
    const {text, ci} = await readCi();
    for (const [name, job] of Object.entries(ci.jobs)) {
      assert.match(String(job['runs-on']), /^ubuntu-\d+\.\d+$/u,
        `${name}: a literal hosted label, never an expression that could route`);
    }
    assert.doesNotMatch(text, /self-hosted/iu,
      'no label, expression or marker can select another runner');
    const plan = JSON.parse(await readFile('test/manifests/ci-resource-plan.json', UTF8));
    assert.equal(plan.jobs['ci.yml/gate'].runsOn, ci.jobs.gate['runs-on']);
  });

  it('proves a branch push by its cone only, and main and pull requests as before', async () => {
    const {ci} = await readCi();
    // The step set each event runs. Main and pull requests are unchanged; a
    // branch push runs exactly what a pull request runs: the proof, and none
    // of main's structural analysis (formation-health --bot-commits included).
    const mainOnly = ['Whole-repository structural analysis', 'Upload health evidence'];
    assert.deepEqual(stepsFor(ci, MAIN_PUSH),
      [...PROOF_STEPS, ...mainOnly]);
    assert.deepEqual(stepsFor(ci, PULL_REQUEST), PROOF_STEPS);
    assert.deepEqual(stepsFor(ci, BRANCH_PUSH), PROOF_STEPS);
    // The proof is `npm run check` - the change selector, which refuses
    // rather than widening and never runs the whole corpus - and nothing a
    // branch push reaches names a corpus entry point.
    const reached = ci.jobs.gate.steps
      .filter((step) => stepsFor(ci, BRANCH_PUSH).includes(step.name))
      .map((step) => String(step.run ?? '')).join('\n');
    assert.deepEqual([...reached.matchAll(/^\s*npm run (?:-s )?(\S+)/gmu)]
      .map((match) => match[1]), ['test:metadata:refresh', 'check']);
    assert.doesNotMatch(reached,
      /test:all|test:gate|check:release|push-gate-change-proof|run-release-proof/u);
    const proof = ci.jobs.gate.steps.find((step) => step.name === 'Ordinary proof');
    assert.equal(proof['continue-on-error'], undefined, 'a refused cone fails the run');
    const scripts = JSON.parse(await readFile('package.json', UTF8)).scripts;
    assert.equal(scripts.check, 'node scripts/check-fast-static.js && npm test');
    assert.equal(scripts.test, 'node scripts/select-change-tests.js');
  });

  it('cancels a superseded branch or pull-request run and never a main run', async () => {
    const {ci} = await readCi();
    assert.deepEqual(ci.concurrency, {'group': 'ci-${{ github.ref }}',
      'cancel-in-progress': '${{ github.ref != \'refs/heads/main\' }}'});
  });

  it('retires the commit-message runner route everywhere', () => {
    const marker = ['[ci:', 'self-hosted]'].join('');
    const found = spawnSync('git', ['grep', '-l', '-F', '-e', marker, '--', '.',
      ':(exclude)solve/quests'], {encoding: UTF8});
    assert.equal(found.status, 1, 'no tracked file outside quest history names ' +
      `the route: ${found.stdout}${found.stderr}`);
    assert.ok(!registeredActions().includes('route-self-hosted-runner'),
      'the authority no longer registers the routing action');
    // The publisher's option is refused by name, never silently accepted.
    for (const argv of [['--runner', 'self-hosted'], ['--runner', 'github'], ['--runner']]) {
      assert.throws(() => parsePublishArgs(argv),
        /^Error: publish: --runner is retired: ci\.yml runs every event on a GitHub-hosted runner/u,
        argv.join(' '));
    }
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

    assert.deepEqual(ci.on.pull_request.branches, ['main']);
    // The PATH CLASSIFIER is gone. Deciding what a change means belonged to
    // two authorities - a YAML case statement here and the source taxonomy in
    // the repository - and two authorities on one question eventually
    // disagree.
    assert.equal(ci.jobs.changes, undefined,
      'CI must not carry a second authority on what a change means');

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

    // Manual only. A nightly whole-system proof is a standing veto: an
    // unrelated marginal test failing overnight made every unrelated change
    // unlandable, and an unchanged tree cannot grow new behavioural debt.
    assert.deepEqual(fullGate.on.workflow_dispatch, {});
    assert.equal(fullGate.on.schedule, undefined,
      'the whole-system proof must not run on a timer');

    assertRepositoryHealthLane(ci);

    // The full-corpus canary: the whole behavioural corpus on main AFTER the
    // push, since the pre-push gate proves the change rather than the corpus
    // (lean-push-gate, 2026-09-12). Not a gate - not required, not read by
    // the red-main guard - and not on a timer.
    const canaryText = await readFile(
      '.github/workflows/full-corpus-canary.yml', UTF8);
    const canary = parse(canaryText);
    assertCanaryRunsOnlyByHand(canary);
    const canaryRuns = canary.jobs.corpus.steps
      .filter((step) => typeof step.run === 'string' &&
        /npm run /u.test(step.run))
      .map((step) => step.run.trim());
    // The whole corpus means every lane. Keep-going is the classified
    // runner's one policy; a canary that opted into --fail-fast would leave
    // the exclusive lane, every integration and bootstrap file, unproved
    // behind one red unit test (2026-09-13).
    assert.ok(canaryRuns.includes('npm run test:all'),
      'the canary runs the whole corpus, every lane, not a selection');
    assert.ok(canaryRuns.every((run) => !run.includes('--fail-fast')),
      'and never opts out of keep-going');
    assert.deepEqual(release.on.push.tags, ['v*']);
    assert.equal(release.permissions.contents, 'read');
    assert.equal(release.jobs.release.permissions.contents, 'write');
    // Same-SHA preflight/tag runs are ordered per release, while actual
    // publication is globally serialized across SHAs by the job-level group.
    assert.equal(release.concurrency.group, 'release-${{ github.sha }}');
    assert.equal(release.concurrency['cancel-in-progress'], false);
    assert.equal(release.jobs.release.concurrency.group, 'release-publish');
    assert.equal(release.jobs.release.concurrency['cancel-in-progress'], false);

    // Every network-facing install step must fail in minutes. On 2026-08-19 a
    // step that normally takes 115s hung for 62 minutes on a hosted runner:
    // `curl -fsSLO` has no default timeout and the step had none either, so
    // only the job's 120-minute backstop would have stopped it. This bounds
    // the failure, not the normal duration.
    for (const workflowText of
      [ciText, fullGateText, releaseText, canaryText]) {
      const workflow = parse(workflowText);
      for (const job of Object.values(workflow.jobs)) {
        for (const step of job.steps) {
          if (!/^Install .*CLI tools$/u.test(step.name || '')) continue;
          assert.ok(Number.isFinite(step['timeout-minutes']),
            `${step.name} must bound how long a hung install may run`);
          for (const line of step.run.split('\n')) {
            // An INVOCATION, not the apt package named curl in the install
            // list - matching the bare word flagged that as a download.
            if (!/^\s*curl\s/u.test(line)) continue;
            assert.match(line, /--max-time \d+/u,
              'a download must not wait forever for a stalled connection');
            assert.match(line, /--connect-timeout \d+/u);
          }
        }
      }
    }

    for (const workflowText of
      [ciText, fullGateText, releaseText, canaryText]) {
      for (const match of workflowText.matchAll(ACTION_REFERENCE_PATTERN)) {
        assert.match(match[1], PINNED_ACTION_PATTERN);
      }
    }

    // The release pipeline never reruns the proof corpus: it consumes the
    // durable exact-SHA receipt. Reuse semantics are owned by
    // release-pipeline-proof-reuse.test.js.
    assert.doesNotMatch(releaseText, /npm run (check:release|test:ci)/u);
    assert.match(releaseText, /git cat-file -t/u);
    assert.match(releaseText, /git merge-base --is-ancestor/u);
    assert.match(releaseText, /refs\/remotes\/origin\/main/u);
    assert.match(releaseText, /npm run build:all/u);
    assert.match(releaseText, /helm package charts\/lagrange-node/u);
    assert.match(releaseText, /SHA256SUMS/u);
    assert.match(
      releaseText,
      /ASSETS=\(lagrange lagrange-cli "lagrange-node-\$\{VERSION\}\.tgz" "npm\/lagrange-server-\$\{VERSION\}\.tgz"\)/u,
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

  it('ships the vendored raft-rs binding in the runtime image beside src/',
    async () => {
      const [dockerfile, dockerignore] = await Promise.all([
        readFile('Dockerfile', UTF8),
        readFile('.dockerignore', UTF8),
      ]);
      // The runtime owner resolves the binding at the layout root the
      // constants name, relative to the directory that holds src/; the image
      // must carry it there or the rs-raft backend cannot load in it.
      const bindingRoot = `${RAFT_RS_BINDING_LAYOUT.ROOT.join('/')}/`;
      const runtimeStage = dockerfile.slice(
        dockerfile.search(RUNTIME_IMAGE_STAGE));
      const contextCopies = runtimeStage.match(CONTEXT_COPY) || [];
      assert.ok(contextCopies.includes('COPY src/ ./src/'),
        'the runtime stage copies src/ from the build context');
      assert.ok(contextCopies.includes(`COPY ${bindingRoot} ./${bindingRoot}`),
        'the runtime stage copies the binding layout root beside src/');
      const admitted = dockerignore.split('\n').map((line) => line.trim());
      assert.ok(admitted.includes(`!${bindingRoot}`) &&
        admitted.includes(`!${bindingRoot}**`),
      'the build context admits the binding layout root');
    });
});

// One contract, not four flags: a prerelease semver tag (0.2.4-rc.0) must
// leave every "latest" pointer where it is. The dry run of the release
// pipeline is a real prerelease tag on the production path, so a pipeline
// that cannot tell a prerelease from a release has no throwaway run.
describe('prerelease publication contract', () => {
  const load = async () => {
    const releaseText = await readFile('.github/workflows/release.yml', UTF8);
    return {releaseText, release: parse(releaseText)};
  };
  const step = (release, name) =>
    release.jobs.release.steps.find((candidate) => candidate.name === name);

  it('decides the channel once, from the version, through the npm owner', async () => {
    const {release} = await load();
    const identity = step(release, 'Resolve release identity and consume durable exact-SHA proof');
    assert.ok(identity, 'the identity step is where the channel is decided');
    assert.match(identity.run, /release-npm-package\.js channel/u,
      'the channel is asked of the owner that publishes, not re-derived in YAML');
    assert.match(identity.run, /prerelease=/u, 'the decision is a named output');
    assert.match(identity.run, /dist_tag=/u);
  });

  it('ranks a release candidate below its release when guarding latest', async () => {
    const {release} = await load();
    const identity = step(release, 'Resolve release identity and consume durable exact-SHA proof');
    // git's default version sort ranks v0.2.4-rc.2 above v0.2.4, so the
    // backward-latest guard refused the first release after a candidate
    // (v0.2.4, never published). The suffix rule restores semver order.
    assert.match(identity.run,
      /git -c versionsort\.suffix=- tag --list 'v\[0-9\]\*' --sort=-version:refname/u,
      'the latest tag is derived with prereleases ranked below releases');
    assert.match(identity.run, /Refusing to move latest backward/u,
      'the guard itself stays');
  });

  it('publishes a prerelease under next and never moves latest', async () => {
    const {release, releaseText} = await load();
    const build = step(release, 'Build and smoke-test Docker image');
    assert.doesNotMatch(build.with.tags, /:latest/u,
      'the image is built under the version tag only; latest is a push-time decision');
    const push = step(release, 'Push Docker images');
    assert.match(push.run, /prerelease/u,
      'latest moves only for a release, and the step says so');
    assert.match(push.run, /docker push "\$DOCKERHUB_IMAGE:\$VERSION"/u);
    const gh = step(release, 'Publish GitHub Release');
    assert.match(gh.run, /--prerelease/u,
      'a prerelease is marked as one on GitHub');
    assert.match(gh.run, /prerelease/u);
    assert.match(releaseText, /dist-tag|dist_tag/u,
      'npm receives the channel as a dist-tag, never the latest default');
  });

  it('writes a publication receipt from what the registries report', async () => {
    const {release} = await load();
    const steps = release.jobs.release.steps.map((candidate) => candidate.name);
    const receipt = step(release, 'Write publication receipt from what the registries report');
    assert.ok(receipt, 'the workflow records what it published, per tag');
    assert.ok(steps.indexOf(receipt.name) > steps.indexOf('Publish GitHub Release'),
      'the receipt is written after the last publication, so it can observe all of them');
    // Observed, never intended: every published fact is re-read from the
    // registry that holds it, the same rule as re-hashing evidence.
    assert.match(receipt.run, /npm view lagrange-server dist-tags/u);
    assert.match(receipt.run, /docker manifest inspect/u);
    assert.match(receipt.run, /gh release view .*isPrerelease/u);
    assert.match(receipt.run, /data\/releases\/\$\{?GITHUB_REF_NAME\}?\.json/u);
    for (const artifact of ['npm', 'docker', 'helm', 'github']) {
      assert.match(receipt.run, new RegExp(`"${artifact}"`, 'u'),
        `the receipt names ${artifact}`);
    }
    assert.match(receipt.run, /gh release upload .*release-receipt\.json/u,
      'the receipt travels with the release so the quest can commit it verbatim');
    // The receipt is written by a child node process (rc.2, 2026-09-12): a
    // value the shell observed but did not export never reaches env.NAME
    // there, and the step fails one command after every publication has
    // already happened. Every name the heredoc reads must be provided by the
    // runner, the job/step env: block, an export, or an inline assignment.
    const readNames = new Set([...receipt.run.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/gu)]
      .map(([, name]) => name));
    const exported = new Set([...receipt.run.matchAll(/^\s*export\s+([^\n]+)$/gmu)]
      .flatMap(([, names]) => names.trim().split(/\s+/u)));
    const provided = new Set([
      ...Object.keys(receipt.env || {}),
      ...Object.keys(release.env || {}),
      ...Object.keys(release.jobs.release.env || {}),
      ...exported,
    ]);
    for (const name of readNames) {
      const inline = new RegExp(`^\\s*${name}="[^\n]*"\\s+\\S*node\\b`, 'mu');
      assert.ok(provided.has(name) || name.startsWith('GITHUB_') || inline.test(receipt.run),
        `the receipt's node process reads env.${name}, which nothing provides`);
    }
    // The receipt is committed evidence, so its path must be the one thing
    // under the ignored data/ tree that git will take.
    const ignore = await readFile('.gitignore', UTF8);
    assert.match(ignore, /^!\/data\/releases\/\*\.json$/mu,
      'data/releases/*.json must be un-ignored, or the receipt can never land');
    assert.match(ignore, /^!\/data\/formation-health\/trend\.ndjson$/mu,
      'the formation-health trend is committed evidence in the same shape');
    assert.match(ignore, /^data$/mu,
      'every nested data/ directory stays ignored by the bare pattern');
  });
});
