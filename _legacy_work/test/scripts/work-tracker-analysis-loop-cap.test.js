import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  validateAnalysisLoopExhaustionCap,
} from '../../scripts/work-tracker.js';

// Closed analysis package on owner_a/boundary_x. The `architecture-gap-analysis`
// slug + lane make metadataIsAnalysisLoopPackage true; residualCount is the
// representative residual that the cap watches for movement.
function closedAnalysis(dir, name, day, residualCount) {
  fs.writeFileSync(
    path.join(dir, name),
    `# t\n\n<!-- work-package\n${JSON.stringify({
      schema: 'work-package-v1',
      status: 'done',
      opened: `2026-06-${day}`,
      lane: 'architecture-gap-analysis',
      owner: 'owner_a',
      boundary: 'boundary_x',
      artifact: `test/output/${name}.json`,
      architectureGapAnalysis: true,
      mechanismCard: {
        failureMechanism: 'observation_gap',
        expectedMovement: 'x',
        negativeResultMeans: 'y',
      },
      representativeResidual: {residualCount},
    }, null, 2)}\n-->\n`,
  );
}

function closedRuntime(dir, name, day, residualCount) {
  fs.writeFileSync(
    path.join(dir, name),
    `# t\n\n<!-- work-package\n${JSON.stringify({
      schema: 'work-package-v1',
      status: 'done',
      opened: `2026-06-${day}`,
      lane: 'runtime-owner-boundary',
      owner: 'owner_a',
      boundary: 'boundary_x',
      artifact: `test/output/${name}.json`,
      mechanismCard: {
        failureMechanism: 'observation_gap',
        expectedMovement: 'x',
        negativeResultMeans: 'y',
      },
      representativeResidual: {residualCount},
    }, null, 2)}\n-->\n`,
  );
}

function analysisMeta(extra = {}) {
  return {
    status: 'active',
    owner: 'owner_a',
    boundary: 'boundary_x',
    lane: 'architecture-gap-analysis',
    architectureGapAnalysis: true,
    ...extra,
  };
}

tap.test('analysis-loop exhaustion cap (R19)', async (t) => {
  t.test('blocks a 3rd analysis when residual is flat', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cap-'));
    closedAnalysis(dir, 'done-20260601-a.md', '01', 1);
    closedAnalysis(dir, 'done-20260602-b.md', '02', 1);
    const errors = validateAnalysisLoopExhaustionCap(
      analysisMeta(),
      'work/packages/active-gap.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(
      errors.some((e) => e.includes('analysis-loop-exhaustion')),
      'flat analysis loop blocked',
    );
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('passes below the threshold', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cap-few-'));
    closedAnalysis(dir, 'done-20260601-a.md', '01', 1);
    const errors = validateAnalysisLoopExhaustionCap(
      analysisMeta(),
      'work/packages/active-gap.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'one prior analysis is allowed');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('resets when residual shrinks across the run', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cap-ok-'));
    closedAnalysis(dir, 'done-20260601-a.md', '01', 5);
    closedAnalysis(dir, 'done-20260602-b.md', '02', 3);
    const errors = validateAnalysisLoopExhaustionCap(
      analysisMeta(),
      'work/packages/active-gap.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'genuine residual progress resets the cap');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('a runtime slice between analyses breaks the run', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cap-break-'));
    closedAnalysis(dir, 'done-20260601-a.md', '01', 1);
    closedRuntime(dir, 'done-20260603-c.md', '03', 1);
    const errors = validateAnalysisLoopExhaustionCap(
      analysisMeta(),
      'work/packages/active-gap.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'non-analysis package resets consecutive run');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('human-escalation route is exempt', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cap-esc-'));
    closedAnalysis(dir, 'done-20260601-a.md', '01', 1);
    closedAnalysis(dir, 'done-20260602-b.md', '02', 1);
    const errors = validateAnalysisLoopExhaustionCap(
      analysisMeta({
        architectureDecisionGate: {
          status: 'selected',
          selectedChoice: 'esc',
          choices: [{id: 'esc', route: 'human-escalation'}],
        },
      }),
      'work/packages/active-gap.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'recorded human-escalation route bypasses cap');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('owner-boundary migration is exempt', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cap-mig-'));
    closedAnalysis(dir, 'done-20260601-a.md', '01', 1);
    closedAnalysis(dir, 'done-20260602-b.md', '02', 1);
    const errors = validateAnalysisLoopExhaustionCap(
      analysisMeta({ownerBoundaryMigration: true}),
      'work/packages/active-gap.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'migration bypasses cap');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('a non-analysis (runtime) package is not capped', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cap-runtime-'));
    closedAnalysis(dir, 'done-20260601-a.md', '01', 1);
    closedAnalysis(dir, 'done-20260602-b.md', '02', 1);
    const errors = validateAnalysisLoopExhaustionCap(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary',
      },
      'work/packages/active-runtime.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'runtime package is governed by R17, not R19');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('only fires at pre-impl', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-cap-phase-'));
    closedAnalysis(dir, 'done-20260601-a.md', '01', 1);
    closedAnalysis(dir, 'done-20260602-b.md', '02', 1);
    const errors = validateAnalysisLoopExhaustionCap(
      analysisMeta(),
      'work/packages/active-gap.md',
      {phase: 'closure', packageDir: dir},
    );
    t.equal(errors.length, 0, 'closure phase does not run the cap');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
