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

const NON_DATA_ARRAYS = [
  {name: 'own index accessor', create(calls) {
    const value = [];
    Object.defineProperty(value, 0, {enumerable: true, get() {calls.count += 1; return 1;}});
    return value;
  }},
  {name: 'own iterator getter', create(calls) {
    const value = [1];
    Object.defineProperty(value, Symbol.iterator, {get() {calls.count += 1; return null;}});
    return value;
  }},
  {name: 'own serialization hook', create(calls) {
    const value = [1];
    value.toJSON = () => {calls.count += 1; return [];};
    return value;
  }},
  {name: 'extra own data field', create() {const value = [1]; value.extra = true; return value;}},
  {name: 'proxy', create(calls) {
    return new Proxy([1], {get(target, key, receiver) {
      calls.count += 1;
      return Reflect.get(target, key, receiver);
    }});
  }},
];

for (const carrier of NON_DATA_ARRAYS) {
  tap.test(`canonical serialization refuses a nested array with ${carrier.name}`, (t) => {
    const calls = {count: 0};
    const nested = {rows: [{detail: carrier.create(calls)}]};
    let failure;
    try {serializeJsonData(nested);} catch (error) {failure = error;}
    t.equal(calls.count, 0, 'canonical serialization never invokes data-carrier callbacks');
    t.type(failure, TypeError);
    t.equal(failure?.message, 'canonical JSON data required');
    t.end();
  });
}

tap.test('canonical serialization refuses a nested hole before an inherited index getter', (t) => {
  const detail = [1];
  detail.length = 2;
  let invoked = 0;
  let failure;
  withHostileIntrinsics([
    polluteWithAccessor(Array.prototype, 1, {get() {invoked += 1; return 2;}}),
  ], () => {
    try {serializeJsonData({detail});} catch (error) {failure = error;}
  });
  t.equal(invoked, 0);
  t.type(failure, TypeError);
  t.equal(failure?.message, 'canonical JSON data required');
  t.end();
});

for (const kind of ['record', 'array']) {
  tap.test(`canonical serialization refuses a cyclic ${kind} as non-data`, (t) => {
    const value = kind === 'record' ? {} : [];
    if (kind === 'record') value.self = value;
    else value[0] = value;
    let failure;
    try {serializeJsonData({nested: value});} catch (error) {failure = error;}
    t.type(failure, TypeError);
    t.equal(failure?.message, 'canonical JSON data required');
    t.end();
  });
}

tap.test('canonical serialization retains dense nested data and repeated shared subtrees', (t) => {
  const shared = {values: [1, null, true, 'data']};
  const nullPrototype = Object.assign(Object.create(null), {left: shared, right: shared});
  t.equal(serializeJsonData(nullPrototype),
    '{"left":{"values":[1,null,true,"data"]},"right":{"values":[1,null,true,"data"]}}');
  t.end();
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

tap.test('strict own-data record copies use the null-prototype write owner',
  async (t) => {
    const originalDefineProperty = Object.defineProperty;
    let measuredDefinitions = 0;
    let measureDefinitions = false;
    Object.defineProperty = (...args) => {
      if (measureDefinitions) {
        measuredDefinitions += 1;
      }
      return originalDefineProperty(...args);
    };

    let copyStrictOwnDataRecord;
    try {
      ({copyStrictOwnDataRecord} = await import(
        '../../src/utils/strict-own-data.js?record-copy-work-count'
      ));
    } finally {
      Object.defineProperty = originalDefineProperty;
    }

    const source = Object.freeze(Object.fromEntries(
      Array.from({length: 128}, (_unused, index) => [
        `field_${index}`,
        index,
      ]),
    ));
    measureDefinitions = true;
    const copied = copyStrictOwnDataRecord(source);
    measureDefinitions = false;

    t.equal(
      measuredDefinitions,
      0,
      'record fields use the null-prototype data-write path',
    );
    t.equal(Object.getPrototypeOf(copied), null);
    t.same({...copied}, source, 'the copied record preserves every value');
    t.match(
      Object.getOwnPropertyDescriptor(copied, 'field_0'),
      {
        value: 0,
        enumerable: true,
        configurable: true,
        writable: true,
      },
      'the data descriptor contract is unchanged',
    );
  });
