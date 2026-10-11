import t from 'tap';

// One top-level test whose subtests declare budgets of their own. Subtests
// run inside their parent's budget, so only the parent's declaration counts
// towards the file's root budget.
const DECLARED_TIMEOUT_MS = 40000;

t.test('parent', {timeout: DECLARED_TIMEOUT_MS}, async (parent) => {
  await parent.test('first nested', {timeout: DECLARED_TIMEOUT_MS}, async (tt) => {
    tt.pass('first nested done');
  });
  await parent.test('second nested', {timeout: DECLARED_TIMEOUT_MS}, async (tt) => {
    tt.pass('second nested done');
  });
});
