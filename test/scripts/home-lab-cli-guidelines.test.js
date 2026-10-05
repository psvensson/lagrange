import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  collectMagicLiteralViolationsWithBaseline,
} from '../../scripts/check-guideline-literals.js';
import {
  collectDecisionBoundaryViolationsWithBaseline,
} from '../../scripts/check-guideline-decision-boundaries.js';
import {
  buildHarnessRunnerArgs,
} from '../../scripts/lab/harness.js';

// The home-lab CLI (scripts/lab/*) landed on main past the guideline audits:
// 197 raw literals outside a named constant owner and one decision boundary
// assigned from independent ifs, which turned audit:guidelines - and with it
// the post-push repo-health run - red. These witnesses hold the CLI to the
// same rules as every other script, and keep its command surface intact.

const LAB_DIR = 'scripts/lab';
const LAB_CLI = 'scripts/lab.js';
const HELP = 'help';
const UNKNOWN_COMMAND = 'no-such-lab-command';
// The command surface, byte for byte: the CLI's own usage text.
const USAGE = [
  'Lagrange home lab\n\n',
  '  lab init\n',
  '  lab list\n',
  '  lab node add NAME --ssh USER@HOST [--ip IP] --os linux|macos|windows ',
  '--arch x64|arm64 --roles runner,harness,k3s ',
  '[--labels storage=nvme,gpu=nvidia]\n',
  '  lab node probe NAME\n',
  '  lab node remove NAME\n',
  '  lab doctor\n',
  '  lab runner labels NAME\n',
  '  lab runner configure NAME --repo OWNER/PRIVATE-LAB-REPO [--service]\n',
  '  lab harness doctor [--nodes a,b,c]\n',
  '  lab harness run [SCENARIO] [--base CONFIG] [--nodes a,b,c] ',
  '[--nodes-per-host N] [--certify SHA [--quest ID]] [--dry-run] [-- ...harness args]\n',
  '      (--certify SHA: a certification run - one node per distinct ',
  'machine, a clean checkout at SHA; with --dry-run its pre-flight; see ',
  'docs/development/home-lab.md)\n',
  '  lab harness keep-evidence RUN_DIR [--to DIR]\n',
  '  lab k3s init-server NAME [--version VERSION]\n',
  '  lab k3s join NAME --server SERVER\n',
  '  lab k3s status --server SERVER\n',
  '  lab k3s labels --server SERVER\n',
  '  lab k3s cordon|uncordon NAME --server SERVER\n',
  '  lab k3s drain NAME --server SERVER\n',
  '  lab test changed|smoke|gate|postpush|all\n',
  '  lab test changed|all --lane ordinary|cpu-heavy|external-toolchain|bootstrap|exclusive|all ',
  '[--on NAME] [--sha COMMIT] [--split]\n',
  '  lab test changed --lane LANE [--sha COMMIT] --base-sha COMMIT\n',
  '      (--base-sha: the commit the change cone is measured from; ',
  'default the merge base with origin/main)\n',
  '  lab fleet [--json]\n',
  '  lab provision [--output FILE] [--copy NAME]\n',
].join('');
// Commands a plain-object dispatch table would answer from its prototype.
const PROTOTYPE_NAMED_COMMANDS = ['constructor', 'toString', 'hasOwnProperty', '__proto__'];
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const UTF8 = 'utf8';
const HARNESS_CONFIG = 'test/distributed/config/local-three-node.json';
const HARNESS_SCENARIO = 'rolling-restart';
const HARNESS_FAST_LOCAL = '--fast-local';
const HARNESS_NO_FAST_LOCAL = '--no-fast-local';

function lab(...args) {
  return spawnSync(process.execPath, [LAB_CLI, ...args], {encoding: UTF8});
}

// Against an empty inventory of its own: a refusal must come before the
// inventory, the tree or any machine is looked at.
function labWithoutInventory(...args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-cli-'));
  try {
    return spawnSync(process.execPath, [LAB_CLI, ...args],
      {encoding: UTF8, env: {...process.env, LAGRANGE_LAB_HOME: home}, timeout: 60000});
  } finally {
    fs.rmSync(home, {recursive: true, force: true});
  }
}

test('the lab CLI carries no raw literal outside a named constant owner', async () => {
  const report = await collectMagicLiteralViolationsWithBaseline([LAB_DIR]);
  assert.equal(report.totalViolationCount, 0,
    `new literal-guideline violations: ${JSON.stringify(report.violations)}`);
});

test('the lab CLI decides each outcome at one boundary', async () => {
  const report = await collectDecisionBoundaryViolationsWithBaseline([LAB_DIR]);
  assert.equal(report.totalViolationCount, 0,
    `new decision-boundary violations: ${JSON.stringify(report.violations)}`);
});

test('the lab CLI still states its command surface and refuses an unknown command', () => {
  const help = lab(HELP);
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stdout, USAGE, 'the usage text is byte for byte the command surface');
  for (const command of [UNKNOWN_COMMAND, ...PROTOTYPE_NAMED_COMMANDS]) {
    const refused = lab(command);
    assert.equal(refused.status, EXIT_FAILURE, `${command} exits non-zero`);
    assert.ok(refused.stderr.includes(`Unknown lab command: ${command}`),
      `${command} is named as unknown: ${refused.stderr}`);
  }
});

test('a hand lab run refuses what it cannot run before it looks at anything', () => {
  for (const [args, refusal] of [
    [['test', 'gate', '--lane', 'exclusive'],
      'lab: the gate profile is an acceptance manifest, not a file plan: --lane takes changed|all'],
    [['test', 'all', '--lane', 'no-such-lane'],
      'lab: unknown lane no-such-lane: ordinary|cpu-heavy|external-toolchain|bootstrap|' +
        'exclusive|all'],
    [['test', 'all', '--on', 'somewhere'], 'lab: a lab test run names its lane with --lane'],
    [['test', 'all', '--lane', 'exclusive', '--split'],
      'lab: --split divides the whole corpus: it takes --lane all'],
    [['test', 'all', '--lane', 'all', '--split', '--on'], 'lab: --on needs a machine name'],
    [['test', 'changed', '--lane', 'all', '--base-sha'], 'lab: --base-sha needs a commit'],
    [['test', 'all', '--lane', 'all', '--base-sha', 'main'],
      'lab: --base-sha measures the change cone: it takes the changed profile'],
    [['test', 'changed', '--base-sha', 'main'], 'lab: a lab test run names its lane with --lane'],
    [['test', 'all', '--lane', 'all', '--split', '--on', 'tv-dator'], 'lab: --split spreads ' +
      'over every ready machine and --on names one: take one or the other'],
  ]) {
    const refused = labWithoutInventory(...args);
    assert.equal(refused.status, EXIT_FAILURE, `${args.join(' ')} exits non-zero`);
    assert.equal(refused.stderr, `${refusal}\n`, args.join(' '));
    assert.equal(refused.stdout, '', 'and runs nothing');
  }
});

test('a lab test or the thermal gate given a flag it does not take runs nothing', () => {
  for (const args of [['test', 'changed', '--lane', 'all', '--split', '--dry-run'],
    ['test', 'changed', '--help-me']]) {
    const refused = labWithoutInventory(...args);
    assert.equal(refused.status, EXIT_USAGE, `${args.join(' ')}: ${refused.stderr}`);
    assert.match(refused.stderr, /^lab: unknown flag --[\w-]+: lab test takes --lane, --on, --sha, --base-sha, --split\n$/u);
    assert.equal(refused.stdout, '', 'and runs nothing');
  }
  const thermal = spawnSync(process.execPath, ['scripts/checks/wait-for-thermal-headroom.js',
    '--help'], {encoding: UTF8, timeout: 10000});
  assert.equal(thermal.status, EXIT_USAGE, thermal.stderr);
  assert.equal(thermal.stdout, '', 'no reading, no wait');
  assert.match(thermal.stderr, /^unknown argument --help\nusage: node scripts\/checks\/wait-for-thermal-headroom\.js /u);
});

test('physical lab harness makes no-fast-local non-overridable', () => {
  const args = buildHarnessRunnerArgs({
    configPath: HARNESS_CONFIG,
    scenario: HARNESS_SCENARIO,
    extraArgs: [HARNESS_FAST_LOCAL],
  });
  assert.equal(args[args.length - 1], HARNESS_NO_FAST_LOCAL);
  assert.ok(args.indexOf(HARNESS_FAST_LOCAL) < args.indexOf(HARNESS_NO_FAST_LOCAL));
});
