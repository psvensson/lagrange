import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from '../../src/test-helpers/tap.js';
import {
  OPPORTUNITY_CALCULATOR_EVIDENCE_CLASS,
  calculateComparativeOpportunity,
  validateOpportunityCalculatorInput,
} from '../../src/diagnostics/comparative-efficiency-opportunity-calculator.js';
import {
  serializeJsonData,
} from '../../src/diagnostics/comparative-efficiency-opportunity-input-integrity.js';

const FIXTURE_ROOT =
  'test/fixtures/comparative-efficiency-opportunity';
const testObjectDefineProperty = Object.defineProperty;
const testObjectGetOwnPropertyDescriptor =
  Object.getOwnPropertyDescriptor;
const FIXTURES = Object.freeze([
  'request-enrichment.json',
  'grouped-reduce.json',
  'invalidation.json',
  'alternative-favored.json',
]);

function fixture(name) {
  return JSON.parse(readFileSync(resolve(FIXTURE_ROOT, name), 'utf8'));
}

function replaceArrayPrototypeProperty(field, value) {
  return replacePrototypeProperty(Array.prototype, field, value);
}

function replacePrototypeProperty(prototype, field, value) {
  return replacePrototypeDescriptor(prototype, field, {
    configurable: true,
    writable: true,
    value,
  });
}

function replacePrototypeDescriptor(prototype, field, replacement) {
  const descriptor = testObjectGetOwnPropertyDescriptor(prototype, field);
  // Adversarial fixture: restored by the returned closure.
  testObjectDefineProperty(prototype, field, replacement);
  return () => {
    if (descriptor) {
      testObjectDefineProperty(prototype, field, descriptor);
    } else {
      delete prototype[field];
    }
  };
}

test('sealed fixture set emits deterministic analytical bounds', (t) => {
  for (const name of FIXTURES) {
    const input = fixture(name);
    const first = calculateComparativeOpportunity(input);
    const second = calculateComparativeOpportunity(input);
    t.same(second, first, name);
    t.equal(first.evidenceClass,
      OPPORTUNITY_CALCULATOR_EVIDENCE_CLASS);
    t.match(first.limitations.join(' '), /not measured throughput/u);
    t.equal(Object.isFrozen(first), true);
    for (const estimate of Object.values(first.estimates)) {
      t.type(estimate.unit, 'string');
      t.type(estimate.formula, 'string');
      t.ok(estimate.formula.length > 0);
      t.equal(estimate.sensitivity.unit, estimate.unit);
      t.ok(estimate.sensitivity.low <= estimate.value);
      t.ok(estimate.sensitivity.high >= estimate.value);
    }
  }
  t.end();
});

test('request enrichment separates locality and amplification formulas', (t) => {
  const output = calculateComparativeOpportunity(
    fixture('request-enrichment.json'),
  );
  const estimates = output.estimates;
  const accessedBytes = 800 + 1600 + 512 + 64;

  t.equal(
    estimates.localBytesPerCorrectOperation.value,
    accessedBytes * 0.8,
  );
  t.equal(
    estimates.remoteBytesPerCorrectOperation.value,
    accessedBytes * 0.2,
  );
  t.equal(estimates.replicationBytesPerCorrectOperation.value, 128);
  t.equal(estimates.fanoutBytesPerCorrectOperation.value, 2048);
  t.ok(
    Math.abs(
      estimates.materializationBytesPerCorrectOperation.value -
        (256 * 0.2 + 32),
    ) < 1e-9,
  );
  t.end();
});

test('lookup byte projection scales with declared lookup cardinality', (t) => {
  for (const lookupsPerOperation of [0, 0.5, 1, 5]) {
    const input = fixture('request-enrichment.json');
    input.quantities.lookupsPerOperation.value = lookupsPerOperation;
    const output = calculateComparativeOpportunity(input);
    const estimates = output.estimates;
    const nonLookupBytes =
      input.quantities.requestBytes.value +
      input.quantities.responseBytes.value +
      input.quantities.mutationBytes.value;
    const projectedAccessAndFanoutBytes =
      estimates.localBytesPerCorrectOperation.value +
      estimates.remoteBytesPerCorrectOperation.value +
      estimates.fanoutBytesPerCorrectOperation.value;

    t.equal(
      projectedAccessAndFanoutBytes - nonLookupBytes,
      input.quantities.lookupBytes.value * lookupsPerOperation,
      `${lookupsPerOperation} lookups per operation`,
    );
  }
  t.end();
});

test('minimum footprint and headroom affect provisioned quantities', (t) => {
  const output = calculateComparativeOpportunity(
    fixture('alternative-favored.json'),
  );
  const utilized =
    output.estimates.utilizedCpuSecondsPerCorrectOperation.value;
  const provisioned =
    output.estimates.provisionedCpuSecondsPerCorrectOperation.value;

  t.ok(provisioned > utilized);
  t.equal(provisioned, 6 / 50);
  t.equal(output.provisioning.minimumNodes.value, 3);
  t.equal(
    output.provisioning.provisionedMemoryBytes.value,
    12_000_000_000,
  );
  t.equal(
    output.provisioning.provisionedStorageBytes.value,
    150_000_000_000,
  );
  t.equal(output.provisioning.provisionedCpuCores.sensitivity.low, 6);
  t.equal(
    output.provisioning.provisionedMemoryBytes.sensitivity.low,
    12_000_000_000,
  );
  t.equal(
    output.provisioning.provisionedStorageBytes.sensitivity.low,
    150_000_000_000,
  );
  t.equal(
    output.estimates.provisionedCpuSecondsPerCorrectOperation
      .sensitivity.low,
    6 / 50,
  );
  t.end();
});

test('measured calibration retains prediction error without tuning', (t) => {
  const input = fixture('grouped-reduce.json');
  const output = calculateComparativeOpportunity(input);
  const error = output.predictionError;

  t.equal(error.state, 'measured');
  t.equal(error.artifactDigest, input.calibration.artifactDigest);
  t.equal(
    error.networkBytesPerOperation.measured,
    input.calibration.measuredNetworkBytesPerOperation.value,
  );
  t.ok(Number.isFinite(error.networkBytesPerOperation.relativeError));
  t.ok(Number.isFinite(error.cpuSecondsPerOperation.relativeError));
  for (const prediction of [
    error.networkBytesPerOperation,
    error.cpuSecondsPerOperation,
  ]) {
    t.same(prediction.assumptions, input.assumptions);
    t.equal(prediction.uncertainty, input.uncertainty);
    t.equal(prediction.sensitivity.unit, 'ratio');
    t.ok(prediction.sensitivity.low <= prediction.relativeError);
    t.ok(prediction.sensitivity.high >= prediction.relativeError);
  }
  t.end();
});

test('update-heavy fixture exposes invalidation and compaction independently',
  (t) => {
    const output = calculateComparativeOpportunity(
      fixture('invalidation.json'),
    );
    t.equal(
      output.estimates.materializationBytesPerCorrectOperation.value,
      16_384,
    );
    t.equal(
      output.estimates.compactionBytesPerCorrectOperation.value,
      12_288,
    );
    t.equal(
      output.estimates.replicationBytesPerCorrectOperation.value,
      8192,
    );
    t.end();
  });

test('dimensionally inconsistent and unsupported inputs fail closed', (t) => {
  const wrongUnit = fixture('request-enrichment.json');
  wrongUnit.quantities.requestBytes.unit = 'millisecond/operation';
  t.throws(
    () => calculateComparativeOpportunity(wrongUnit),
    /requestBytes:expected_unit:byte\/operation/u,
  );

  const badFraction = fixture('request-enrichment.json');
  badFraction.quantities.remoteFraction.value = 1.1;
  t.throws(
    () => calculateComparativeOpportunity(badFraction),
    /remoteFraction:fraction_required/u,
  );

  const unsupported = fixture('request-enrichment.json');
  unsupported.formulaVersion = 'future-formula';
  t.throws(
    () => calculateComparativeOpportunity(unsupported),
    /formulaVersion:unsupported/u,
  );

  const extraQuantityField = fixture('request-enrichment.json');
  extraQuantityField.quantities.requestBytes.note = 'silently ignored';
  t.throws(
    () => calculateComparativeOpportunity(extraQuantityField),
    /quantities\.requestBytes\.note:unsupported/u,
  );

  const extraCalibrationField = fixture('request-enrichment.json');
  extraCalibrationField.calibration.unknown = true;
  t.throws(
    () => calculateComparativeOpportunity(extraCalibrationField),
    /calibration\.unknown:unsupported/u,
  );
  t.end();
});

test('non-finite derived values fail before library or CLI projection', (t) => {
  const subnormalRate = fixture('request-enrichment.json');
  subnormalRate.quantities.operationRate.value = Number.MIN_VALUE;
  t.throws(
    () => calculateComparativeOpportunity(subnormalRate),
    /finite_required/u,
  );

  const result = spawnSync(
    process.execPath,
    [
      'scripts/comparative-efficiency-opportunity-calculator.js',
      '--input',
      '-',
    ],
    {
      encoding: 'utf8',
      input: JSON.stringify(subnormalRate),
    },
  );
  t.equal(result.status, 1);
  t.match(result.stderr, /finite_required/u);
  t.equal(result.stdout, '');
  t.end();
});

test('explicit variants reject null and invalid sensitivity bounds', (t) => {
  const nullableCalibration = fixture('request-enrichment.json');
  nullableCalibration.calibration.artifactDigest = null;
  t.throws(
    () => calculateComparativeOpportunity(nullableCalibration),
    /artifactDigest:forbidden_when_absent/u,
  );

  const reversed = fixture('request-enrichment.json');
  reversed.quantities.lowMultiplier.value = 1.1;
  reversed.quantities.highMultiplier.value = 0.9;
  const result = validateOpportunityCalculatorInput(reversed);
  t.equal(result.valid, false);
  t.ok(result.errors.includes(
    'quantities.lowMultiplier:must_not_exceed_one',
  ));
  t.ok(result.errors.includes(
    'quantities.highMultiplier:must_be_at_least_one',
  ));
  t.ok(result.errors.includes('quantities.sensitivity:reversed'));
  t.end();
});

test('calculator does not mutate input and canonical digest ignores key order',
  (t) => {
    const input = fixture('request-enrichment.json');
    const snapshot = structuredClone(input);
    const first = calculateComparativeOpportunity(input);
    const reversedQuantities = Object.fromEntries(
      Object.entries(input.quantities).reverse(),
    );
    const second = calculateComparativeOpportunity({
      ...input,
      quantities: reversedQuantities,
    });

    t.same(input, snapshot);
    t.equal(first.inputDigest, second.inputDigest);
    t.same(first.estimates, second.estimates);
    t.end();
  });

test('prototype-inherited quantities cannot alias a content digest', (t) => {
  const inherited = fixture('request-enrichment.json');
  inherited.quantities.requestBytes = Object.create(
    inherited.quantities.requestBytes,
  );

  const validation = validateOpportunityCalculatorInput(inherited);
  t.equal(validation.valid, false);
  t.ok(validation.errors.includes(
    'quantities.requestBytes:object_required',
  ));
  t.throws(
    () => calculateComparativeOpportunity(inherited),
    /quantities\.requestBytes:object_required/u,
  );
  t.end();
});

test('accessors and sparse assumption arrays fail before value reads', (t) => {
  const accessor = fixture('request-enrichment.json');
  let requestBytes = 100;
  Object.defineProperty(accessor.quantities.requestBytes, 'value', {
    enumerable: true,
    get() {
      requestBytes += 100;
      return requestBytes;
    },
  });
  t.throws(
    () => calculateComparativeOpportunity(accessor),
    /quantities\.requestBytes:object_required/u,
  );
  t.equal(requestBytes, 100, 'validation does not invoke the getter');

  const sparse = fixture('request-enrichment.json');
  sparse.assumptions = new Array(2);
  sparse.assumptions[1] = 'second assumption';
  t.throws(
    () => calculateComparativeOpportunity(sparse),
    /assumptions:non_empty_array_required/u,
  );
  t.end();
});

test('Object.prototype cannot supply a required quantity', (t) => {
  const polluted = fixture('request-enrichment.json');
  delete polluted.quantities.averageDistanceKm;
  const restore = replacePrototypeProperty(
    Object.prototype,
    'averageDistanceKm',
    {value: 50, unit: 'kilometer'},
  );
  try {
    const validation = validateOpportunityCalculatorInput(polluted);
    t.equal(validation.valid, false);
    t.ok(validation.errors.includes(
      'quantities.averageDistanceKm:object_required',
    ));
    t.throws(
      () => calculateComparativeOpportunity(polluted),
      /quantities\.averageDistanceKm:object_required/u,
    );
  } finally {
    restore();
  }
  t.end();
});

test('required root, quantity-value, and calibration fields must be own', (t) => {
  const cases = [
    {
      inheritedField: 'schemaVersion',
      prepare(input) {
        delete input.schemaVersion;
      },
      inheritedValue: 'comparative-opportunity-input-v1',
      error: /schemaVersion:unsupported/u,
    },
    {
      inheritedField: 'value',
      prepare(input) {
        delete input.quantities.requestBytes.value;
      },
      inheritedValue: 800,
      error: /requestBytes:non_negative_number_required/u,
    },
    {
      inheritedField: 'state',
      prepare(input) {
        delete input.calibration.state;
      },
      inheritedValue: 'absent',
      error: /calibration\.state:unsupported/u,
    },
  ];
  for (const attack of cases) {
    const input = fixture('request-enrichment.json');
    attack.prepare(input);
    const restore = replacePrototypeProperty(
      Object.prototype,
      attack.inheritedField,
      attack.inheritedValue,
    );
    try {
      t.throws(() => calculateComparativeOpportunity(input), attack.error);
    } finally {
      restore();
    }
  }
  t.end();
});

test('noncanonical zero and unsafe integer counts fail closed', (t) => {
  const negativeZero = fixture('request-enrichment.json');
  negativeZero.quantities.headroomFraction.value = -0;
  t.throws(
    () => calculateComparativeOpportunity(negativeZero),
    /headroomFraction:non_negative_number_required/u,
  );

  for (const field of [
    'correctOperations',
    'replicationFactor',
    'minimumNodes',
  ]) {
    const unsafe = fixture('request-enrichment.json');
    unsafe.quantities[field].value = Number.MAX_SAFE_INTEGER + 1;
    t.throws(
      () => calculateComparativeOpportunity(unsafe),
      new RegExp(`${field}:safe_integer_required`, 'u'),
    );
  }
  t.end();
});

test('all numeric inputs and derived outputs stay in the safe domain', (t) => {
  const quantityFields = Object.keys(
    fixture('request-enrichment.json').quantities,
  );
  for (const field of quantityFields) {
    const unsafe = fixture('request-enrichment.json');
    unsafe.quantities[field].value = Number.MAX_SAFE_INTEGER + 1;
    t.throws(
      () => calculateComparativeOpportunity(unsafe),
      new RegExp(`${field}:safe_number_required`, 'u'),
      field,
    );
  }

  for (const field of [
    'measuredNetworkBytesPerOperation',
    'measuredCpuSecondsPerOperation',
  ]) {
    const unsafe = fixture('grouped-reduce.json');
    unsafe.calibration[field].value = Number.MAX_SAFE_INTEGER + 1;
    t.throws(
      () => calculateComparativeOpportunity(unsafe),
      new RegExp(`${field}:safe_number_required`, 'u'),
      field,
    );
  }

  const derivedOverflow = fixture('request-enrichment.json');
  derivedOverflow.quantities.correctOperations.value =
    Number.MAX_SAFE_INTEGER;
  t.throws(
    () => calculateComparativeOpportunity(derivedOverflow),
    /output\..*:safe_number_required/u,
  );
  t.end();
});

test('artifact identity rejects boxed and custom-coercible values', (t) => {
  const digestText = `sha256:${'a'.repeat(64)}`;
  for (const artifactDigest of [
    Object(digestText),
    Object.assign(Object.create(null), {
      toString() {
        return digestText;
      },
    }),
  ]) {
    const input = fixture('grouped-reduce.json');
    input.calibration.artifactDigest = artifactDigest;
    t.throws(
      () => calculateComparativeOpportunity(input),
      /artifactDigest:sha256_required/u,
    );
  }
  t.end();
});

test('variant discriminants reject boxed and custom-coercible values', (t) => {
  const boxedUncertainty = fixture('grouped-reduce.json');
  boxedUncertainty.uncertainty = Object('medium');
  t.throws(
    () => calculateComparativeOpportunity(boxedUncertainty),
    /uncertainty:unsupported/u,
  );

  const customState = fixture('grouped-reduce.json');
  customState.calibration.state = Object.assign(Object.create(null), {
    toString() {
      return 'measured';
    },
  });
  t.throws(
    () => calculateComparativeOpportunity(customState),
    /calibration\.state:unsupported/u,
  );
  t.end();
});

test('captured mutable intrinsics cannot alter accepted data or projection',
  (t) => {
    const clean = calculateComparativeOpportunity(
      fixture('request-enrichment.json'),
    );
    const cleanSerialization = serializeJsonData(clean);
    const restorations = [
      replacePrototypeProperty(Number, 'isFinite', () => true),
      replacePrototypeProperty(Number, 'isInteger', () => true),
      replacePrototypeProperty(Number, 'isSafeInteger', () => true),
      replacePrototypeProperty(Array, 'isArray', () => false),
      replacePrototypeProperty(Object, 'defineProperty', () => ({})),
      replacePrototypeProperty(Object, 'freeze', (value) => value),
      replacePrototypeProperty(
        Object,
        'getOwnPropertyDescriptor',
        () => undefined,
      ),
      replacePrototypeProperty(Object, 'getPrototypeOf', () => null),
      replacePrototypeProperty(Object, 'hasOwn', () => true),
      replacePrototypeProperty(Object, 'is', () => false),
      replacePrototypeProperty(Object, 'isFrozen', () => true),
      replacePrototypeProperty(Object, 'keys', () => []),
      replacePrototypeProperty(Reflect, 'ownKeys', () => []),
      replacePrototypeProperty(JSON, 'stringify', () => '"polluted"'),
      replacePrototypeProperty(globalThis, 'structuredClone', () => ({
        fixtureId: 'polluted',
      })),
    ];
    let polluted = null;
    let pollutedSerialization = null;
    try {
      polluted = calculateComparativeOpportunity(
        fixture('request-enrichment.json'),
      );
      pollutedSerialization = serializeJsonData(polluted);
    } finally {
      for (let index = restorations.length - 1; index >= 0; index -= 1) {
        restorations[index]();
      }
    }

    t.same(polluted, clean);
    t.equal(pollutedSerialization, cleanSerialization);
    t.end();
  });

test('custom assumption array methods cannot bypass digest binding', (t) => {
  const input = fixture('request-enrichment.json');
  let methodInvocations = 0;
  const customPrototype = Object.create(Array.prototype);
  customPrototype.forEach = () => {
    methodInvocations += 1;
  };
  customPrototype[Symbol.iterator] = function* customIterator() {
    methodInvocations += 1;
    yield 'undigested assumption';
  };
  Object.setPrototypeOf(input.assumptions, customPrototype);

  t.throws(
    () => calculateComparativeOpportunity(input),
    /assumptions:non_empty_array_required/u,
  );
  t.equal(methodInvocations, 0, 'custom array methods are never invoked');
  t.end();
});

test('standard Array prototype pollution cannot alter validation or digest',
  (t) => {
    const clean = calculateComparativeOpportunity(
      fixture('request-enrichment.json'),
    );
    const accessor = fixture('request-enrichment.json');
    let accessorReads = 0;
    Object.defineProperty(accessor.assumptions, '0', {
      configurable: true,
      enumerable: true,
      get() {
        accessorReads += 1;
        return `assumption-read-${accessorReads}`;
      },
    });

    const restoreEvery = replaceArrayPrototypeProperty('every', () => true);
    const restoreMap = replaceArrayPrototypeProperty('map', () => []);
    const restoreIterator = replaceArrayPrototypeProperty(
      Symbol.iterator,
      function* pollutedIterator() {
        yield 'undigested assumption';
      },
    );
    let polluted = null;
    let accessorError = null;
    try {
      polluted = calculateComparativeOpportunity(
        fixture('request-enrichment.json'),
      );
      try {
        calculateComparativeOpportunity(accessor);
      } catch (error) {
        accessorError = error;
      }
    } finally {
      restoreIterator();
      restoreMap();
      restoreEvery();
    }

    t.same(polluted, clean);
    t.match(accessorError?.message, /assumptions:non_empty_array_required/u);
    t.equal(accessorReads, 0, 'rejected accessor is never read');
    t.end();
  });

test('numeric Array prototype accessors cannot intercept owned array writes',
  (t) => {
    const clean = calculateComparativeOpportunity(
      fixture('request-enrichment.json'),
    );
    const inheritedValue = '__inherited_numeric_value__';
    const restoreNumericZero = replacePrototypeDescriptor(
      Array.prototype,
      '0',
      {
        configurable: true,
        get() {
          return inheritedValue;
        },
        set() {},
      },
    );
    let polluted = null;
    let validationError = null;
    try {
      polluted = calculateComparativeOpportunity(
        fixture('request-enrichment.json'),
      );
      const invalid = fixture('request-enrichment.json');
      invalid.quantities.requestBytes.unit = 'wrong-unit';
      try {
        calculateComparativeOpportunity(invalid);
      } catch (error) {
        validationError = error;
      }
    } finally {
      restoreNumericZero();
    }

    t.same(polluted, clean);
    t.equal(polluted.inputDigest, clean.inputDigest);
    t.equal(Object.hasOwn(polluted.assumptions, '0'), true);
    t.notMatch(serializeJsonData(polluted), /__inherited_numeric_value__/u);
    t.match(validationError?.message, /requestBytes:expected_unit/u);
    t.end();
  });

test('Object prototype setters cannot intercept projected totals', (t) => {
  const clean = calculateComparativeOpportunity(
    fixture('request-enrichment.json'),
  );
  const totalKey = 'localBytesForCorrectOperations';
  const restoreTotal = replacePrototypeDescriptor(
    Object.prototype,
    totalKey,
    {
      configurable: true,
      get() {
        return '__inherited_total__';
      },
      set() {},
    },
  );
  let polluted = null;
  try {
    polluted = calculateComparativeOpportunity(
      fixture('request-enrichment.json'),
    );
  } finally {
    restoreTotal();
  }

  t.same(polluted, clean);
  t.equal(Object.hasOwn(polluted.totals, totalKey), true);
  t.end();
});

test('text and digest validation ignore mutable built-in prototypes', (t) => {
  const clean = calculateComparativeOpportunity(
    fixture('request-enrichment.json'),
  );
  const cleanSerialization = serializeJsonData(clean);
  const whitespaceIdentity = fixture('request-enrichment.json');
  whitespaceIdentity.fixtureId = ' \t\u2003';
  whitespaceIdentity.assumptions[0] = '\n\u3000';

  const invalidDigest = fixture('grouped-reduce.json');
  invalidDigest.calibration.artifactDigest = 'not-a-digest';

  const nonCanonicalArray = fixture('request-enrichment.json');
  Object.defineProperty(nonCanonicalArray.assumptions, '01', {
    configurable: true,
    enumerable: true,
    value: 'undigested assumption',
  });

  const restoreTrim = replacePrototypeProperty(
    String.prototype,
    'trim',
    () => 'admitted',
  );
  const restoreTest = replacePrototypeProperty(
    RegExp.prototype,
    'test',
    () => true,
  );
  const restoreReplace = replacePrototypeProperty(
    String.prototype,
    'replace',
    () => '__intrinsic_polluted__',
  );
  const restoreToJSON = replacePrototypeProperty(
    Array.prototype,
    'toJSON',
    () => ['collapsed'],
  );
  const errors = [];
  let pollutedProjection = null;
  let pollutedSerialization = null;
  try {
    pollutedProjection = calculateComparativeOpportunity(
      fixture('request-enrichment.json'),
    );
    pollutedSerialization = serializeJsonData(pollutedProjection);
    for (const input of [
      whitespaceIdentity,
      invalidDigest,
      nonCanonicalArray,
    ]) {
      try {
        calculateComparativeOpportunity(input);
      } catch (error) {
        errors[errors.length] = error;
      }
    }
  } finally {
    restoreToJSON();
    restoreReplace();
    restoreTest();
    restoreTrim();
  }

  t.same(pollutedProjection, clean);
  t.equal(pollutedProjection.inputDigest, clean.inputDigest);
  t.equal(pollutedSerialization, cleanSerialization);
  t.match(errors[0]?.message, /fixtureId:required/u);
  t.match(errors[0]?.message, /assumptions\.0:non_empty_text_required/u);
  t.match(errors[1]?.message, /artifactDigest:sha256_required/u);
  t.match(errors[2]?.message, /assumptions:non_empty_array_required/u);
  t.end();
});

test('CLI emits the same immutable analytical result as the library', (t) => {
  const fixturePath = resolve(FIXTURE_ROOT, 'request-enrichment.json');
  const result = spawnSync(
    process.execPath,
    [
      'scripts/comparative-efficiency-opportunity-calculator.js',
      '--input',
      fixturePath,
    ],
    {encoding: 'utf8'},
  );
  const library = calculateComparativeOpportunity(
    fixture('request-enrichment.json'),
  );

  t.equal(result.status, 0, result.stderr);
  t.same(JSON.parse(result.stdout), library);
  t.end();
});

test('CLI rejects an unsupported argument without emitting a result', (t) => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/comparative-efficiency-opportunity-calculator.js',
      '--measured',
    ],
    {encoding: 'utf8'},
  );
  t.equal(result.status, 1);
  t.match(result.stderr, /unsupported argument/u);
  t.equal(result.stdout, '');
  t.end();
});
