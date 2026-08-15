import {test} from '../../src/test-helpers/tap.js';
import {
  snapshotEmbeddedConfiguration,
  snapshotEmbeddedEnvironment,
  snapshotEmbeddedFactoryConfiguration,
} from '../../src/embedded-lagrange-input.js';
import {ApplicationDatabaseError} from
  '../../src/query/application-database-error.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';

function captureThrown(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

test('embedded configuration snapshot is immutable and detached', (t) => {
  const source = {nested: {port: 1900}};
  const snapshot = snapshotEmbeddedConfiguration(source);
  source.nested.port = 2000;

  t.equal(snapshot.nested.port, 1900);
  t.equal(Object.isFrozen(snapshot.nested), true);
  t.end();
});

test('embedded array snapshots ignore inherited numeric setters', (t) => {
  const sourceArray = ['safe'];
  const original = Object.getOwnPropertyDescriptor(Array.prototype, 0);
  let setterCalls = 0;
  let snapshot;

  // eslint-disable-next-line no-extend-native -- adversarial fixture
  Object.defineProperty(Array.prototype, 0, {
    configurable: true,
    enumerable: true,
    get() {
      return 'polluted';
    },
    set(value) {
      setterCalls++;
      Object.defineProperty(this, 0, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    },
  });
  try {
    snapshot = snapshotEmbeddedConfiguration({items: sourceArray});
  } finally {
    // eslint-disable-next-line no-extend-native -- restore adversarial fixture
    if (original) Object.defineProperty(Array.prototype, 0, original);
    else Reflect.deleteProperty(Array.prototype, 0);
  }

  t.equal(setterCalls, 0);
  t.equal(Object.hasOwn(snapshot.items, 0), true);
  t.equal(snapshot.items[0], 'safe');
  t.end();
});

test('embedded configuration rejects accessors cycles and dangerous keys',
  (t) => {
    const accessor = {};
    Object.defineProperty(accessor, 'value', {
      get() {
        return 1;
      },
    });
    const cycle = {};
    cycle.self = cycle;
    const dangerous = Object.create(null);
    dangerous.__proto__ = {polluted: true};

    const errors = [accessor, cycle, dangerous]
      .map((value) => captureThrown(() => snapshotEmbeddedConfiguration(value)));
    t.ok(errors.every((error) => error instanceof ApplicationDatabaseError));
    t.ok(errors.every((error) => error.code === 'INVALID_ARGUMENT'));
    t.equal({}.polluted, undefined);
    t.end();
  });

test('embedded environment is snapshotted by own string value', (t) => {
  const environment = {NODE_ID: 'before'};
  const snapshot = snapshotEmbeddedEnvironment(environment);
  environment.NODE_ID = 'after';

  t.equal(snapshot.NODE_ID, 'before');
  t.end();
});

test('embedded factory options reject configuration accessors', (t) => {
  let getterCalls = 0;
  const options = {};
  Object.defineProperty(options, 'configuration', {
    enumerable: true,
    get() {
      getterCalls++;
      return {};
    },
  });

  const error = captureThrown(() =>
    snapshotEmbeddedFactoryConfiguration(options));
  t.equal(error instanceof ApplicationDatabaseError, true);
  t.equal(error.code, 'INVALID_ARGUMENT');
  t.equal(getterCalls, 0);
  t.end();
});

test('embedded validation is independent of mutable host intrinsics', (t) => {
  const originalFinite = Number.isFinite;
  const originalSafeInteger = Number.isSafeInteger;
  const originalSetHas = Set.prototype.has;
  Number.isFinite = () => true;
  Number.isSafeInteger = () => true;
  // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
  Set.prototype.has = () => false;
  let numericError;
  let keyError;
  try {
    numericError = captureThrown(() =>
      snapshotEmbeddedConfiguration({value: Number.NaN}));
    const dangerous = Object.create(null);
    Object.defineProperty(dangerous, '__proto__', {
      enumerable: true,
      value: {polluted: true},
    });
    keyError = captureThrown(() =>
      snapshotEmbeddedConfiguration(dangerous));
  } finally {
    Number.isFinite = originalFinite;
    Number.isSafeInteger = originalSafeInteger;
    // eslint-disable-next-line no-extend-native -- restore adversarial fixture
    Set.prototype.has = originalSetHas;
  }
  t.equal(numericError.code, 'INVALID_ARGUMENT');
  t.equal(keyError.code, 'INVALID_ARGUMENT');
  t.equal({}.polluted, undefined);
  t.end();
});

test('configuration merge defense captures adjacent mutable intrinsics', (t) => {
  const manager = new ConfigurationManager();
  const source = Object.create(null);
  Object.defineProperty(source, '__proto__', {
    enumerable: true,
    value: {polluted: true},
  });
  const originals = {
    arrayIsArray: Array.isArray,
    getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
    hasOwn: Object.hasOwn,
    keys: Object.keys,
  };
  let error;
  try {
    Array.isArray = () => true;
    Object.getOwnPropertyDescriptor = () => ({value: null});
    Object.hasOwn = () => true;
    Object.keys = () => [];
    error = captureThrown(() => manager.deepMerge({}, source));
  } finally {
    Array.isArray = originals.arrayIsArray;
    Object.getOwnPropertyDescriptor = originals.getOwnPropertyDescriptor;
    Object.hasOwn = originals.hasOwn;
    Object.keys = originals.keys;
  }
  t.match(error.message, /Unsafe configuration key/u);
  t.equal({}.polluted, undefined);
  t.end();
});
