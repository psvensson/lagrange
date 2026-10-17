import t from 'tap';

// A root budget declared on tap itself, above what the file's one top-level
// test declares. tap honours the call as its root timer; the runner's exported
// budget must never fall below it.
const FILE_TIMEOUT_MS = 100000;
const DECLARED_TIMEOUT_MS = 40000;

t.setTimeout(FILE_TIMEOUT_MS);

t.test('the one top-level test', {timeout: DECLARED_TIMEOUT_MS}, async (tt) => {
  tt.pass('done');
});
