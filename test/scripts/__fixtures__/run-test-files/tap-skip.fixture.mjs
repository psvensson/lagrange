import t from 'tap';

const TEST_NAME = 'Tap skipped fixture';
const SKIP_REASON = 'runner must reject this skip';

t.test(TEST_NAME, {skip: SKIP_REASON}, async () => {});
