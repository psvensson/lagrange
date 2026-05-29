import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  validateRederiveCoupledInvariants,
  validateRederiveJointFalsifier,
  validateRederiveStructuralArtifact,
} from '../../scripts/work-tracker.js';

function packageFile(dir, fileName, body) {
  fs.writeFileSync(path.join(dir, fileName), body);
}

function setupAlternatingPair(extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rederive-r2-'));
  const seq = [
    ['done-20260520-a.md', 'owner_a', 'boundary_x', 'transition_gap'],
    ['done-20260521-b.md', 'owner_b', 'boundary_y', 'scheduling_gap'],
    ['done-20260522-c.md', 'owner_a', 'boundary_x', 'transition_gap'],
    ['done-20260523-d.md', 'owner_b', 'boundary_y', 'scheduling_gap'],
    ['done-20260524-e.md', 'owner_a', 'boundary_x', 'transition_gap'],
  ];
  for (const [name, owner, boundary, mech] of seq) {
    packageFile(dir, name,
      `# t\n\n<!-- work-package\n${JSON.stringify({
        schema: 'work-package-v1', status: 'done',
        opened: `2026-05-${name.slice(11, 13)}`,
        lane: 'runtime-owner-boundary', owner, boundary,
        scenario: 'rolling-restart',
        artifact: `test/output/${name}.json`,
        mechanismCard: {failureMechanism: mech, expectedMovement: 'x', negativeResultMeans: 'y'},
      }, null, 2)}\n-->\n`);
  }
  for (const [name, body] of extra) packageFile(dir, name, body);
  return dir;
}

function rederiveMeta(opts = {}) {
  return Object.assign({
    schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
    lane: 'system-theory-rederive', systemTheoryRevision: true,
    owner: 'owner_a', boundary: 'boundary_x',
    writeScope: ['work/sprints/active-foo.md', 'work/theory-ledger.md'],
    commitScope: ['work/sprints/active-foo.md', 'work/theory-ledger.md'],
    systemTheory: {
      problemStatement: 'p', phaseChain: ['p1'], ownerBoundaryMap: ['x'],
      stableFacts: ['s'], changedFacts: ['c'], competingTheories: ['t1'],
      eliminatedTheories: ['t2'], downstreamSymptoms: ['d'],
      transitionTable: [{
        inputSignal: 'sig', owner: 'o', missingTransition: 'mt',
        expectedEvidence: 'ee', falsifier: 'cmd', migrationTrigger: 'trg',
      }],
      ownershipMigrationTriggers: ['omt'], architectureGapTriggers: ['agt'],
      wholeSystemInvariants: [
        {invariant: 'inv-a on boundary_x', coupledWith: ['inv-b'],
         couplingNote: 'inv-a couples to inv-b across boundary_x and boundary_y'},
        {invariant: 'inv-b on boundary_y', coupledWith: ['inv-a'],
         couplingNote: 'inv-b couples to inv-a across boundary_y and boundary_x'},
      ],
    },
    theoryLoop: {
      enforcement: 'source-code-package-required',
      jointFalsifierCommand:
        'npm test -- test/coupled/boundary_x-boundary_y-coupling.test.js',
    },
    proof: [
      'falsifier: npm test -- test/coupled/boundary_x-boundary_y-coupling.test.js # coupled-invariant',
      'regression: npm test',
    ],
  }, opts);
}

tap.test('rederive coupled-invariants required (R2)', async (t) => {
  t.test('valid rederive with coupled invariants passes', (t) => {
    const dir = setupAlternatingPair();
    const errors = validateRederiveCoupledInvariants(
      rederiveMeta(),
      'work/packages/active-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.filter((e) => e.includes('rederive-coupled-invariants-missing')).length, 0,
      'no error');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('rederive without coupledWith is rejected', (t) => {
    const dir = setupAlternatingPair();
    const meta = rederiveMeta();
    meta.systemTheory.wholeSystemInvariants = [
      {invariant: 'inv-a on boundary_x', coupledWith: [], couplingNote: 'none'},
      {invariant: 'inv-b on boundary_y', coupledWith: [], couplingNote: 'none'},
    ];
    const errors = validateRederiveCoupledInvariants(
      meta, 'work/packages/active-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) => e.includes('rederive-coupled-invariants-missing')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('rederive missing one of the pair boundaries in invariants is rejected', (t) => {
    const dir = setupAlternatingPair();
    const meta = rederiveMeta();
    meta.systemTheory.wholeSystemInvariants = [
      {invariant: 'inv-a on boundary_x only', coupledWith: ['inv-b'],
       couplingNote: 'coupled around boundary_x'},
      {invariant: 'inv-b also only mentioning boundary_x', coupledWith: ['inv-a'],
       couplingNote: 'coupled around boundary_x'},
    ];
    const errors = validateRederiveCoupledInvariants(
      meta, 'work/packages/active-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) =>
      e.includes('rederive-coupled-invariants-missing') &&
      e.includes('boundary_y')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('non-rederive package is exempt', (t) => {
    const dir = setupAlternatingPair();
    const errors = validateRederiveCoupledInvariants(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary'},
      'work/packages/active-runtime.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

tap.test('rederive joint falsifier required (R3)', async (t) => {
  t.test('valid jointFalsifierCommand passes (no sprint required)', (t) => {
    const dir = setupAlternatingPair();
    const meta = rederiveMeta();
    // Drop sprint from scope so sprint check is skipped.
    meta.writeScope = ['work/theory-ledger.md'];
    meta.commitScope = ['work/theory-ledger.md'];
    const errors = validateRederiveJointFalsifier(
      meta, 'work/packages/active-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.filter((e) => e.includes('rederive-joint-falsifier')).length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('missing joint falsifier is rejected', (t) => {
    const dir = setupAlternatingPair();
    const meta = rederiveMeta();
    meta.theoryLoop = {enforcement: 'source-code-package-required'};
    meta.proof = ['falsifier: npm test', 'regression: npm test'];
    const errors = validateRederiveJointFalsifier(
      meta, 'work/packages/active-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) => e.includes('rederive-joint-falsifier-missing')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('chained joint falsifier is rejected as not replayable', (t) => {
    const dir = setupAlternatingPair();
    const meta = rederiveMeta();
    meta.writeScope = ['work/theory-ledger.md'];
    meta.commitScope = ['work/theory-ledger.md'];
    meta.theoryLoop.jointFalsifierCommand =
      'npm test -- test/boundary_x.test.js && npm test -- test/boundary_y.test.js';
    meta.proof = ['regression: npm test'];
    const errors = validateRederiveJointFalsifier(
      meta, 'work/packages/active-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) => e.includes('rederive-joint-falsifier-not-replayable')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('joint falsifier missing one boundary name is rejected', (t) => {
    const dir = setupAlternatingPair();
    const meta = rederiveMeta();
    meta.writeScope = ['work/theory-ledger.md'];
    meta.commitScope = ['work/theory-ledger.md'];
    meta.theoryLoop.jointFalsifierCommand =
      'npm test -- test/coupled/only-boundary_x.test.js';
    meta.proof = ['regression: npm test'];
    const errors = validateRederiveJointFalsifier(
      meta, 'work/packages/active-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) => e.includes('boundaries-missing')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

tap.test('rederive structural artifact (R6)', async (t) => {
  t.test('writeScope with only the package itself is rejected', (t) => {
    const errors = validateRederiveStructuralArtifact(
      {schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
       lane: 'system-theory-rederive', systemTheoryRevision: true,
       owner: 'owner_a', boundary: 'boundary_x',
       writeScope: ['work/packages/active-rederive.md'],
       commitScope: ['work/packages/active-rederive.md']},
      'work/packages/active-rederive.md',
      {phase: 'pre-impl'},
    );
    t.ok(errors.some((e) => e.includes('rederive-no-structural-artifact')));
    t.end();
  });

  t.test('writeScope including the active sprint passes', (t) => {
    const errors = validateRederiveStructuralArtifact(
      {schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
       lane: 'system-theory-rederive', systemTheoryRevision: true,
       owner: 'owner_a', boundary: 'boundary_x',
       writeScope: ['work/sprints/active-foo.md', 'work/packages/active-rederive.md'],
       commitScope: ['work/sprints/active-foo.md', 'work/packages/active-rederive.md']},
      'work/packages/active-rederive.md',
      {phase: 'pre-impl'},
    );
    t.equal(errors.length, 0);
    t.end();
  });

  t.test('non-rederive package is exempt', (t) => {
    const errors = validateRederiveStructuralArtifact(
      {schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
       lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
       writeScope: ['work/packages/active-runtime.md']},
      'work/packages/active-runtime.md',
      {phase: 'pre-impl'},
    );
    t.equal(errors.length, 0);
    t.end();
  });
});
