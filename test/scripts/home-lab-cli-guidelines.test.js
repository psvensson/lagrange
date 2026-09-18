import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

import {
  collectMagicLiteralViolationsWithBaseline,
} from '../../scripts/check-guideline-literals.js';
import {
  collectDecisionBoundaryViolationsWithBaseline,
} from '../../scripts/check-guideline-decision-boundaries.js';

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
  '[--nodes-per-host N] [--dry-run] [-- ...harness args]\n',
  '  lab k3s init-server NAME [--version VERSION]\n',
  '  lab k3s join NAME --server SERVER\n',
  '  lab k3s status --server SERVER\n',
  '  lab k3s labels --server SERVER\n',
  '  lab k3s cordon|uncordon NAME --server SERVER\n',
  '  lab k3s drain NAME --server SERVER\n',
  '  lab test changed|smoke|gate|postpush|all\n',
  '  lab fleet [--json]\n',
].join('');
// Commands a plain-object dispatch table would answer from its prototype.
const PROTOTYPE_NAMED_COMMANDS = ['constructor', 'toString', 'hasOwnProperty', '__proto__'];
const EXIT_FAILURE = 1;
const UTF8 = 'utf8';

function lab(...args) {
  return spawnSync(process.execPath, [LAB_CLI, ...args], {encoding: UTF8});
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
