import tap from 'tap';
import {validateTwoLevelTheoryContract} from '../../scripts/work-tracker.js';

const VALID_SLICE = {
  systemTheoryRef: 'work/sprints/active-foo.md',
  selectedSystemTheory: 'Foo theory',
  selectedMechanism: 'transition_gap',
  sourceTestContract: 'test/foo.test.js exercises owner contract',
  falsifier: 'npm run test -- test/foo.test.js',
  representativeExpectedMovement: 'reduce frontier count by one',
  killRule: 'stop on unchanged evidence and escalate',
  theoryFitScore: {
    evidenceFit: 'high: artifact directly supports',
    ownerBoundaryFit: 'high: owner is unambiguous',
    falsifiability: 'high: single command fails on regression',
    representativeMovement: 'medium: incremental reduction expected',
    downstreamRiskContainment: 'high: bounded scope',
  },
  wrongSliceTriggers: ['frontier stays at same value', 'owner re-emits same reason'],
};

const VALID_SYSTEM_BASE = {
  problemStatement: 'Foo problem is X',
  phaseChain: ['phase a', 'phase b'],
  ownerBoundaryMap: ['owner_a / boundary_x'],
  stableFacts: ['fact one'],
  changedFacts: ['fact two'],
  competingTheories: ['theory 1', 'theory 2'],
  eliminatedTheories: ['theory 3'],
  downstreamSymptoms: ['symptom one'],
  transitionTable: [{
    inputSignal: 'signal a',
    owner: 'owner_a',
    missingTransition: 'transition x',
    expectedEvidence: 'evidence y',
    falsifier: 'npm run test -- test/foo.test.js',
    migrationTrigger: 'when ownership ambiguous',
  }],
  ownershipMigrationTriggers: ['owner ambiguous'],
  architectureGapTriggers: ['repeated same frontier'],
};

tap.test('two-level theory contract: multi-invariant + modelTheory', async (t) => {
  t.test('legacy scalar wholeSystemInvariant still accepted', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {...VALID_SYSTEM_BASE, wholeSystemInvariant: 'invariant text'},
      sliceTheory: VALID_SLICE,
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.notOk(
      errors.some((e) => e.includes('wholeSystemInvariant')),
      'no error on legacy scalar',
    );
    t.end();
  });

  t.test('missing both scalar and list fails', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {...VALID_SYSTEM_BASE},
      sliceTheory: VALID_SLICE,
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.ok(
      errors.some((e) => e.includes('wholeSystemInvariant')),
      'error names the missing field',
    );
    t.end();
  });

  t.test('single-entry wholeSystemInvariants list accepted', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {
        ...VALID_SYSTEM_BASE,
        wholeSystemInvariants: [{
          invariant: 'inv one text describing system-wide constraint',
          coupledWith: [],
          couplingNote: 'standalone invariant with no peer coupling on this boundary',
        }],
      },
      sliceTheory: VALID_SLICE,
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.notOk(
      errors.some((e) => e.includes('wholeSystemInvariant')),
      'single entry list accepted',
    );
    t.end();
  });

  t.test('multi-entry list without any coupling rejected', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {
        ...VALID_SYSTEM_BASE,
        wholeSystemInvariants: [
          {invariant: 'inv one describing constraint A', coupledWith: [], couplingNote: 'standalone invariant on this boundary'},
          {invariant: 'inv two describing constraint B', coupledWith: [], couplingNote: 'standalone invariant on this boundary'},
        ],
      },
      sliceTheory: VALID_SLICE,
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.ok(
      errors.some((e) => e.includes('coupled-invariants-undeclared')),
      'demands coupling note',
    );
    t.end();
  });

  t.test('multi-entry list with explicit coupling accepted', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {
        ...VALID_SYSTEM_BASE,
        wholeSystemInvariants: [
          {invariant: 'inv one describing constraint A', coupledWith: ['inv two'], couplingNote: 'inv one rises when inv two falls due to shared scheduler budget'},
          {invariant: 'inv two describing constraint B', coupledWith: [], couplingNote: 'paired with inv one via shared scheduler budget'},
        ],
      },
      sliceTheory: VALID_SLICE,
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.notOk(
      errors.some((e) => e.includes('coupled-invariants-undeclared')),
      'coupled list accepted',
    );
    t.end();
  });

  t.test('modelTheory absent: no errors', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {...VALID_SYSTEM_BASE, wholeSystemInvariant: 'inv'},
      sliceTheory: VALID_SLICE,
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.notOk(errors.some((e) => e.includes('modelTheory')));
    t.end();
  });

  t.test('modelTheory present and complete: no errors', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {...VALID_SYSTEM_BASE, wholeSystemInvariant: 'inv'},
      sliceTheory: VALID_SLICE,
      modelTheory: {
        modelKind: 'property-test',
        executableArtifact: 'test/specs/foo-property.test.js',
        propertiesProven: ['property A', 'property B'],
        assumptions: ['assumption one'],
        counterExampleHandling: 'falsifier exits non-zero and prints shrunk trace',
        linkedSystemTheoryRef: 'work/sprints/active-foo.md systemTheory',
      },
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.notOk(
      errors.some((e) => e.includes('modelTheory')),
      'complete modelTheory passes',
    );
    t.end();
  });

  t.test('modelTheory with invalid modelKind rejected', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {...VALID_SYSTEM_BASE, wholeSystemInvariant: 'inv'},
      sliceTheory: VALID_SLICE,
      modelTheory: {
        modelKind: 'something-else',
        executableArtifact: 'test/specs/foo.test.js',
        propertiesProven: ['p'],
        assumptions: ['a'],
        counterExampleHandling: 'exit non-zero',
        linkedSystemTheoryRef: 'ref',
      },
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.ok(
      errors.some((e) => e.includes('modelKind')),
      'invalid modelKind rejected',
    );
    t.end();
  });

  t.test('modelTheory with disallowed artifact path rejected', (t) => {
    const errors = validateTwoLevelTheoryContract({
      systemTheory: {...VALID_SYSTEM_BASE, wholeSystemInvariant: 'inv'},
      sliceTheory: VALID_SLICE,
      modelTheory: {
        modelKind: 'property-test',
        executableArtifact: 'src/runtime/foo.js',
        propertiesProven: ['p'],
        assumptions: ['a'],
        counterExampleHandling: 'exit non-zero',
        linkedSystemTheoryRef: 'ref',
      },
    }, 'pkg.md', {phase: 'pre-impl', status: 'active'});
    t.ok(
      errors.some((e) => e.includes('executableArtifact')),
      'artifact must be under test/, scripts/, or docs/specs/',
    );
    t.end();
  });
});
