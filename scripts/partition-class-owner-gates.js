import {spawnSync} from 'node:child_process';

const GATE_COMMANDS = Object.freeze([
  {label: 'lint', command: ['npm', 'run', 'lint', '--silent']},
  {
    label: 'decision-table-model',
    command: ['npm', 'run', 'model:decision-tables', '--silent'],
  },
  {
    label: 'targeted-suites',
    command: [
      'node',
      'scripts/run-test-files.js',
      'test/scripts/check-partition-class-owner.test.js',
      'test/bootstrap/system-partition-classification-owner.test.js',
      'test/bootstrap/traffic-readiness-utils.test.js',
      'test/rebalancer/system-partition-start-delay-preservation.property.test.js',
      'test/rebalancer/unified-rebalancer-triggers-system-partition-defer.test.js',
      'test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js',
    ],
  },
]);

function runGates(repoRoot) {
  return GATE_COMMANDS.map((gate) => {
    const [executable, ...args] = gate.command;
    const outcome = spawnSync(executable, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      label: gate.label,
      passed: outcome.status === 0,
      exitCode: outcome.status,
    };
  });
}

export {runGates};
