import tap from 'tap';

import {
  digest,
  isDenseDataArray,
  isRecord,
  serializeJsonData,
} from '../../src/utils/canonical-json-data.js';
import * as diagnosticsSurface
  from '../../src/diagnostics/comparative-efficiency-opportunity-input-integrity.js';
import * as sharedSurface from '../../src/utils/canonical-json-data.js';
import {
  pollutePrototypeProperty,
  polluteWithAccessor,
  replacePrototypeProperty,
  withHostileIntrinsics,
} from '../helpers/hostile-intrinsics.js';

const SAMPLE = Object.freeze({
  values: Object.freeze([1, 2, 3]),
  label: 'canonical sample',
});

tap.test('the diagnostics surface re-exports the shared owner', (t) => {
  for (const [name, exported] of Object.entries(sharedSurface)) {
    t.equal(diagnosticsSurface[name], exported,
      `${name} is the same function on both surfaces`);
  }
  t.end();
});

tap.test('digest and serialization ignore prototype pollution', (t) => {
  const clean = digest({...SAMPLE, values: [...SAMPLE.values]});
  const cleanSerialized = serializeJsonData(
    {...SAMPLE, values: [...SAMPLE.values]}, {sortKeys: true});
  withHostileIntrinsics([
    pollutePrototypeProperty(Object.prototype, 'injected', 'evil'),
    pollutePrototypeProperty(Array.prototype, 'toJSON', () => 'collapsed'),
    replacePrototypeProperty(Array.prototype, 'join', () => 'collapsed'),
    replacePrototypeProperty(String.prototype, 'trim', function trim() {
      return '';
    }),
  ], () => {
    t.equal(digest({...SAMPLE, values: [...SAMPLE.values]}), clean,
      'digest is stable under pollution');
    t.equal(
      serializeJsonData({...SAMPLE, values: [...SAMPLE.values]},
        {sortKeys: true}),
      cleanSerialized,
      'owned serialization never consults inherited hooks');
  });
  t.equal(digest({...SAMPLE, values: [...SAMPLE.values]}), clean,
    'restore leaves clean intrinsics behind');
  t.end();
});

tap.test('admission predicates refuse non-canonical data', (t) => {
  t.equal(isRecord({plain: true}), true);
  t.equal(isRecord(Object.create(null)), true, 'null prototype is canonical');
  t.equal(isRecord(new (class Boxed {})()), false, 'class instances are refused');
  const accessor = {};
  Object.defineProperty(accessor, 'sneaky', {
    enumerable: true,
    get: () => 'computed',
  });
  t.equal(isRecord(accessor), false, 'own accessors are refused');
  t.equal(isDenseDataArray([1, 2, 3]), true);
  const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
  t.equal(isDenseDataArray(sparse), false, 'holes are refused');
  withHostileIntrinsics([
    polluteWithAccessor(Array.prototype, 1, {
      get: () => 'intercepted',
      set: () => {},
    }),
  ], () => {
    t.equal(isDenseDataArray([4, 5, 6]), true,
      'a dense own-data array stays admissible under an inherited index accessor');
    const inherited = [7];
    inherited.length = 2;
    t.equal(isDenseDataArray(inherited), false,
      'an index reaching the polluted prototype is refused');
  });
  t.end();
});
