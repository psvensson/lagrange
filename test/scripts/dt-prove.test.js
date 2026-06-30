import {test} from '../../src/test-helpers/tap.js';
import {classifyProof} from '../../scripts/dt-prove.js';

const GREEN = 0;
const RED = 1;

test('classifyProof: green-with-fix, red-on-revert, green-on-restore is PROVEN', (t) => {
  const result = classifyProof({fixRunExit: GREEN, srcChanged: true, revertRunExit: RED, restoreRunExit: GREEN});
  t.equal(result.verdict, 'red-on-revert-proven');
  t.equal(result.ok, true);
  t.end();
});

test('classifyProof: test that fails WITH the fix is fix-not-passing', (t) => {
  const result = classifyProof({fixRunExit: RED, srcChanged: true, revertRunExit: RED, restoreRunExit: GREEN});
  t.equal(result.verdict, 'fix-not-passing');
  t.equal(result.ok, false);
  t.end();
});

test('classifyProof: revert that changes no bytes is revert-noop (test does not exercise --src)', (t) => {
  const result = classifyProof({fixRunExit: GREEN, srcChanged: false, revertRunExit: RED, restoreRunExit: GREEN});
  t.equal(result.verdict, 'revert-noop');
  t.equal(result.ok, false);
  t.end();
});

test('classifyProof: test still green after revert is not-bound (does not bind the mechanism)', (t) => {
  const result = classifyProof({fixRunExit: GREEN, srcChanged: true, revertRunExit: GREEN, restoreRunExit: GREEN});
  t.equal(result.verdict, 'not-bound');
  t.equal(result.ok, false);
  t.end();
});

test('classifyProof: test that does not return to green after restore is restore-failed', (t) => {
  const result = classifyProof({fixRunExit: GREEN, srcChanged: true, revertRunExit: RED, restoreRunExit: RED});
  t.equal(result.verdict, 'restore-failed');
  t.equal(result.ok, false);
  t.end();
});

test('classifyProof: gate order — fix-not-passing wins even when other signals look proven', (t) => {
  const result = classifyProof({fixRunExit: RED, srcChanged: false, revertRunExit: GREEN, restoreRunExit: RED});
  t.equal(result.verdict, 'fix-not-passing', 'fix must pass before any other check is meaningful');
  t.end();
});
