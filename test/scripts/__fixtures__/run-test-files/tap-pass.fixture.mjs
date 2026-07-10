import t from 'tap';
import {plugin as MockPlugin} from '@tapjs/mock';

const TEST_NAME = 'tap fixture loads configured plugins';
const FUNCTION_TYPE = 'function';

t.test(TEST_NAME, async (t) => {
  t.ok(t.pluginLoaded(MockPlugin));
  t.type(t.mockImport, FUNCTION_TYPE);
});
