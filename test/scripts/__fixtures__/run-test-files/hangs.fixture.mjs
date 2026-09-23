import {test} from 'node:test';

// Outlives any per-file budget a witness gives it, and still ends by itself
// should the runner's kill ever miss it.
const HANG_MS = 30000;
const TEST_NAME = 'hangs past the per-file budget';

test(TEST_NAME, () => new Promise((resolve) => {
  setTimeout(resolve, HANG_MS);
}));
