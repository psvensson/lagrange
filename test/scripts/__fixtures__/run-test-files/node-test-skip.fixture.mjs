import {test} from 'node:test';

const TEST_NAME = 'node:test skipped fixture';
const SKIP_REASON = 'runner must reject this skip';

test(TEST_NAME, {skip: SKIP_REASON}, () => {});
