import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {validateTwoLevelTheoryContract} from '../../scripts/work-tracker.js';

function makeContractRecord(dir, fileName, withSystemTheory) {
  const contractsDir = path.join(dir, 'architecture', 'contracts');
  fs.mkdirSync(contractsDir, {recursive: true});
  const block = {
    schema: 'system-contract-v1',
    contractId: 'demo-contract',
    status: 'active',
  };
  if (withSystemTheory) {
    block.systemTheory = {
      problemStatement: 'A concrete whole-system problem statement.',
      phaseChain: ['phase one happens', 'phase two happens'],
      ownerBoundaryMap: ['owner_a / boundary_x owns the transition'],
      invariantRefs: ['some-invariant'],
    };
  }
  fs.writeFileSync(
    path.join(contractsDir, fileName),
    `# Demo\n\n<!-- system-contract\n${JSON.stringify(block, null, 2)}\n-->\n`,
  );
  return `architecture/contracts/${fileName}#demo-contract`;
}

function sliceTheoryFor(ref) {
  return {
    systemTheoryRef: ref,
    selectedSystemTheory: 'the demo system theory',
    selectedMechanism: 'contract_gap',
    sourceTestContract: 'test/x.test.js asserts the bounded transition',
    focusedFalsifier: 'npm test -- test/x.test.js',
    representativeMovement: 'reduce the active_gate frontier by one',
    killRule: 'redirect to an architecture experiment on no reduction',
    theoryFitScore: {
      evidenceFit: 'high — direct artifact match',
      ownerBoundaryFit: 'high — single owner',
      falsifiability: 'high — one command',
      representativeMovement: 'high — bound to residual',
      downstreamRisk: 'low — contained to one file',
    },
    wrongSliceTriggers: ['scope expands beyond one file'],
  };
}

function withCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}

tap.test('systemTheoryRef to a record with systemTheory waives inline systemTheory', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sysref-ok-'));
  const ref = makeContractRecord(dir, 'demo.md', true);
  const metadata = {status: 'active', sliceTheory: sliceTheoryFor(ref)};
  const errors = withCwd(dir, () =>
    validateTwoLevelTheoryContract(metadata, 'work/packages/active-x.md', {
      requiresLedger: true,
      status: 'active',
    }),
  );
  t.notOk(
    errors.some((e) => e.includes('systemTheory is required')),
    'no inline systemTheory required when ref resolves',
  );
  t.end();
});

tap.test('systemTheoryRef to a record WITHOUT systemTheory still requires inline', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sysref-bad-'));
  const ref = makeContractRecord(dir, 'demo.md', false);
  const metadata = {status: 'active', sliceTheory: sliceTheoryFor(ref)};
  const errors = withCwd(dir, () =>
    validateTwoLevelTheoryContract(metadata, 'work/packages/active-x.md', {
      requiresLedger: true,
      status: 'active',
    }),
  );
  t.ok(
    errors.some((e) => e.includes('systemTheory is required')),
    'inline systemTheory still required without a recorded block',
  );
  t.end();
});

tap.test('legacy inline systemTheory continues to pass the requirement', (t) => {
  const metadata = {
    status: 'active',
    systemTheory: {problemStatement: 'x'},
    sliceTheory: sliceTheoryFor('architecture/contracts/missing.md#x'),
  };
  const errors = validateTwoLevelTheoryContract(
    metadata, 'work/packages/active-x.md', {requiresLedger: true, status: 'active'},
  );
  t.notOk(
    errors.some((e) => e.includes('systemTheory is required')),
    'inline systemTheory satisfies the requirement',
  );
  t.end();
});
