import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  validateStickyTheoryLedger,
  validateLoopExhaustionEscalation,
  validateSprintJointCoupledInvariantProbe,
} from '../../scripts/work-tracker.js';

function setupConsecutiveBoundary(outcomeFor3 = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-ledger-'));
  const seq = [
    ['done-20260520-a.md', 'transition_gap', null],
    ['done-20260521-b.md', 'transition_gap', null],
    ['done-20260522-c.md', 'transition_gap', outcomeFor3],
  ];
  for (const [name, mech, outcome] of seq) {
    const meta = {
      schema: 'work-package-v1', status: 'done',
      opened: `2026-05-${name.slice(11, 13)}`,
      lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
      scenario: 'rolling-restart',
      artifact: `test/output/${name}.json`,
      mechanismCard: {failureMechanism: mech, expectedMovement: 'x', negativeResultMeans: 'y'},
    };
    if (outcome) meta.theoryLoop = {outcome};
    fs.writeFileSync(path.join(dir, name),
      `# t\n\n<!-- work-package\n${JSON.stringify(meta, null, 2)}\n-->\n`);
  }
  return dir;
}

function writeLedger(dir, slugs) {
  const ledger = slugs.map((s) => `## \`${s}\`\n\nbody\n`).join('\n');
  const ledgerPath = path.join(dir, 'theory-ledger.md');
  fs.writeFileSync(ledgerPath, ledger);
  return ledgerPath;
}

tap.test('sticky theory ledger (R4)', async (t) => {
  t.test('rejects empty theoryLedgerRefs on 3+ consecutive same boundary', (t) => {
    const dir = setupConsecutiveBoundary();
    const ledgerPath = writeLedger(dir, ['theory-20260520-foo']);
    const errors = validateStickyTheoryLedger(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary',
       theoryLedgerRefs: []},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.ok(errors.some((e) => e.includes('sticky-theory-ledger-empty')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('accepts when theoryLedgerRefs cites a real ledger slug', (t) => {
    const dir = setupConsecutiveBoundary();
    const ledgerPath = writeLedger(dir, ['theory-20260520-foo']);
    const errors = validateStickyTheoryLedger(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary',
       theoryLedgerRefs: ['theory-20260520-foo']},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('no-op when fewer than 3 consecutive packages on the boundary', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-noop-'));
    const ledgerPath = writeLedger(dir, ['theory-20260520-foo']);
    const errors = validateStickyTheoryLedger(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary', theoryLedgerRefs: []},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

tap.test('loop exhaustion escalation (R5)', async (t) => {
  t.test('blocks runtime package when last 3 outcomes are non-confirmed', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhaust-'));
    const seq = [
      ['done-20260520-a.md', 'transition_gap', 'migrated'],
      ['done-20260521-b.md', 'transition_gap', 'inconclusive'],
      ['done-20260522-c.md', 'transition_gap', 'theory-falsified'],
    ];
    for (const [name, mech, outcome] of seq) {
      fs.writeFileSync(path.join(dir, name),
        `# t\n\n<!-- work-package\n${JSON.stringify({
          schema: 'work-package-v1', status: 'done',
          opened: `2026-05-${name.slice(11, 13)}`,
          lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
          scenario: 'rolling-restart',
          artifact: `test/output/${name}.json`,
          mechanismCard: {failureMechanism: mech, expectedMovement: 'x', negativeResultMeans: 'y'},
          theoryLoop: {outcome},
        }, null, 2)}\n-->\n`);
    }
    const ledgerPath = writeLedger(dir, ['theory-20260520-foo']);
    const errors = validateLoopExhaustionEscalation(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.ok(errors.some((e) => e.includes('loop-exhausted-architecture-gap-required')));
    t.ok(errors.some((e) => e.includes('missing-architecture-ledger-entry')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('passes when at least one outcome is theory-confirmed', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhaust-ok-'));
    const seq = [
      ['done-20260520-a.md', 'transition_gap', 'migrated'],
      ['done-20260521-b.md', 'transition_gap', 'theory-confirmed'],
      ['done-20260522-c.md', 'transition_gap', 'theory-falsified'],
    ];
    for (const [name, mech, outcome] of seq) {
      fs.writeFileSync(path.join(dir, name),
        `# t\n\n<!-- work-package\n${JSON.stringify({
          schema: 'work-package-v1', status: 'done',
          opened: `2026-05-${name.slice(11, 13)}`,
          lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
          artifact: `test/output/${name}.json`,
          mechanismCard: {failureMechanism: mech, expectedMovement: 'x', negativeResultMeans: 'y'},
          theoryLoop: {outcome},
        }, null, 2)}\n-->\n`);
    }
    const ledgerPath = writeLedger(dir, ['theory-20260520-foo']);
    const errors = validateLoopExhaustionEscalation(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('closure enforces outcome enum on theory-loop packages', (t) => {
    const errors = validateLoopExhaustionEscalation(
      {status: 'done', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary',
       theoryLoop: {
         enforcement: 'source-code-package-required',
         sourceChangeRequired: true,
         outcome: 'bogus',
       }},
      'work/packages/done-foo.md',
      {phase: 'closure'},
    );
    t.ok(errors.some((e) => e.includes('theory-loop-outcome-invalid')));
    t.end();
  });

  t.test('closure requires outcome when missing', (t) => {
    const errors = validateLoopExhaustionEscalation(
      {status: 'done', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary',
       theoryLoop: {
         enforcement: 'source-code-package-required',
         sourceChangeRequired: true,
       }},
      'work/packages/done-foo.md',
      {phase: 'closure'},
    );
    t.ok(errors.some((e) => e.includes('theory-loop-outcome-missing')));
    t.end();
  });
});

tap.test('sprint joint coupled-invariant probe (R8)', async (t) => {
  t.test('rejects sprint missing section after rederive', (t) => {
    const sprint =
      `# foo\n\nStatus: active\nsystemTheoryRederivedAt: 2026-05-29\n\n## Goal\n\nx\n`;
    const errors = validateSprintJointCoupledInvariantProbe(
      sprint, 'work/sprints/active-foo.md',
    );
    t.ok(errors.some((e) => e.includes('sprint-joint-probe-section-missing')));
    t.end();
  });

  t.test('accepts complete probe section', (t) => {
    const sprint =
`# foo

Status: active
systemTheoryRederivedAt: 2026-05-29

## Goal

x

## Joint Coupled-Invariant Probe

- Command: npm test -- test/coupled/boundary_x-boundary_y.test.js
- Last run: 2026-05-29
- Last residual count: 3
- Residual trend: decreasing
- Boundaries covered: startup_active_gate_owner / snapshot_coverage, operation_workflow_owner / rebalancer_handoff
`;
    const errors = validateSprintJointCoupledInvariantProbe(
      sprint, 'work/sprints/active-foo.md',
    );
    t.equal(errors.length, 0);
    t.end();
  });

  t.test('rejects invalid Residual trend value', (t) => {
    const sprint =
`# foo

systemTheoryRederivedAt: 2026-05-29

## Joint Coupled-Invariant Probe

- Command: npm test -- test/coupled/x.test.js
- Last run: 2026-05-29
- Last residual count: 1
- Residual trend: wat
- Boundaries covered: a, b
`;
    const errors = validateSprintJointCoupledInvariantProbe(
      sprint, 'work/sprints/active-foo.md',
    );
    t.ok(errors.some((e) => e.includes('Residual trend')));
    t.end();
  });

  t.test('exempts sprint without systemTheoryRederivedAt', (t) => {
    const sprint = `# foo\n\nStatus: active\n\n## Goal\n\nx\n`;
    const errors = validateSprintJointCoupledInvariantProbe(
      sprint, 'work/sprints/active-foo.md',
    );
    t.equal(errors.length, 0);
    t.end();
  });
});
