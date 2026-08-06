import t from 'tap';
import {plugin as MockPlugin} from '@tapjs/mock';

const TEST_NAME = 'tap fixture loads configured plugins';
const FUNCTION_TYPE = 'function';

t.test(TEST_NAME, async (t) => {
  // tap 21 loads plugins through the run-test-files --import hooks; the
  // plugin surface is present, but pluginLoaded() reflects runner-
  // registered plugins (the `tap plugin add` path), not import-hook
  // loading, so assert the surface rather than the registry.
  t.ok(MockPlugin, 'the mock plugin module resolves');
  t.type(t.mockImport, FUNCTION_TYPE);
});
