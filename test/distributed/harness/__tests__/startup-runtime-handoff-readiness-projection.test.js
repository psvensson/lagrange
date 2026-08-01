import {test} from '../../../../src/test-helpers/tap.js';
import {CLUSTER_ACTIVE_WAIT_FORMATTING_LAYER} from
  '../cluster-active-wait-formatting-layer.js';

const {normalizeReadinessProbeResult} =
  CLUSTER_ACTIVE_WAIT_FORMATTING_LAYER;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectDefineProperty = Reflect.defineProperty;
const reflectDeleteProperty = Reflect.deleteProperty;

function polluteEnumerablePrototypeProperty(prototype, field, value) {
  const original = objectGetOwnPropertyDescriptor(prototype, field);
  reflectDefineProperty(prototype, field, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return () => original ?
    reflectDefineProperty(prototype, field, original) :
    reflectDeleteProperty(prototype, field);
}

function normalize(startupRuntimeHandoff) {
  return normalizeReadinessProbeResult({
    status: 503,
    body: {startupRuntimeHandoff},
  });
}

test('readiness normalization preserves an isolated runtime handoff witness',
  (t) => {
    const handoff = {
      infrastructureJoinComplete: true,
      canonicalAuthorityConsumed: true,
      transactionRecoveryReady: true,
      transactionRecoveryState: 'completed',
      transactionRecoveryOutcome: {
        kind: 'completed',
      },
    };

    const normalized = normalize(handoff);

    t.equal(normalized.status, 503, 'the readiness status remains unchanged');
    t.same(
      normalized.startupRuntimeHandoff,
      handoff,
      'the complete typed witness survives the generic readiness seam',
    );
    t.not(
      normalized.startupRuntimeHandoff,
      handoff,
      'the normalized witness does not alias the response object',
    );
    t.not(
      normalized.startupRuntimeHandoff.transactionRecoveryOutcome,
      handoff.transactionRecoveryOutcome,
      'nested witness state is also isolated',
    );

    handoff.transactionRecoveryReady = false;
    handoff.transactionRecoveryOutcome.kind = 'failed';
    t.equal(
      normalized.startupRuntimeHandoff.transactionRecoveryReady,
      true,
      'later response mutation cannot rewrite normalized readiness',
    );
    t.equal(
      normalized.startupRuntimeHandoff.transactionRecoveryOutcome.kind,
      'completed',
      'later nested mutation cannot rewrite normalized readiness',
    );
    t.end();
  });

test('readiness normalization rejects non-data runtime handoff evidence',
  (t) => {
    const inheritedBody = Object.create({
      startupRuntimeHandoff: {transactionRecoveryReady: true},
    });
    const inherited = normalizeReadinessProbeResult({
      status: 503,
      body: inheritedBody,
    });
    t.equal(
      inherited.startupRuntimeHandoff,
      null,
      'an inherited witness is not evidence',
    );

    let accessorReadCount = 0;
    const accessorBody = {};
    Object.defineProperty(accessorBody, 'startupRuntimeHandoff', {
      get() {
        accessorReadCount += 1;
        return {transactionRecoveryReady: true};
      },
    });
    const accessor = normalizeReadinessProbeResult({
      status: 503,
      body: accessorBody,
    });
    t.equal(
      accessor.startupRuntimeHandoff,
      null,
      'an accessor-backed witness is not evidence',
    );
    t.equal(accessorReadCount, 0, 'normalization never executes the accessor');
    t.end();
  });

test('readiness normalization rejects malformed runtime handoff evidence',
  (t) => {
    for (const value of [
      undefined,
      null,
      false,
      1,
      'ready',
      [],
      new Map(),
      new Set(),
      Object(Symbol('boxed')),
      {[Symbol('only-symbol')]: true},
    ]) {
      t.equal(
        normalize(value).startupRuntimeHandoff,
        null,
        'a non-plain-record witness remains fail-closed',
      );
    }

    const circular = {};
    circular.self = circular;
    t.equal(
      normalize(circular).startupRuntimeHandoff,
      null,
      'an unserializable witness remains fail-closed',
    );

    t.equal(
      normalize({transactionRecoveryReady: Object(true)})
        .startupRuntimeHandoff,
      null,
      'a boxed nested primitive remains fail-closed',
    );
    t.equal(
      normalize({retryAfterMs: Number.POSITIVE_INFINITY})
        .startupRuntimeHandoff,
      null,
      'a non-finite nested number remains fail-closed',
    );
    t.equal(
      normalize({retryAfterMs: -0}).startupRuntimeHandoff,
      null,
      'negative zero remains fail-closed',
    );
    t.equal(
      normalize({retryAfterMs: Number.MAX_SAFE_INTEGER + 1})
        .startupRuntimeHandoff,
      null,
      'an unsafe integer remains fail-closed',
    );
    t.end();
  });

test('readiness normalization never executes nested witness accessors',
  (t) => {
    let nestedReadCount = 0;
    const outcome = {};
    Object.defineProperty(outcome, 'kind', {
      enumerable: true,
      get() {
        nestedReadCount += 1;
        return 'completed';
      },
    });

    t.equal(
      normalize({transactionRecoveryOutcome: outcome})
        .startupRuntimeHandoff,
      null,
      'a nested accessor invalidates the complete witness',
    );
    t.equal(nestedReadCount, 0, 'the nested accessor is never executed');
    t.end();
  });

test('readiness normalization resists toJSON and prototype fabrication',
  (t) => {
    const restoreToJson = polluteEnumerablePrototypeProperty(
      Object.prototype,
      'toJSON',
      () => {
        return {
          infrastructureJoinComplete: true,
          canonicalAuthorityConsumed: true,
          transactionRecoveryReady: true,
        };
      },
    );
    const restoreTransactionRecoveryReady =
      polluteEnumerablePrototypeProperty(
        Object.prototype,
        'transactionRecoveryReady',
        true,
      );
    try {
      const normalized = normalize({
        infrastructureJoinComplete: false,
        canonicalAuthorityConsumed: false,
        transactionRecoveryReady: false,
      }).startupRuntimeHandoff;
      t.equal(
        normalized.infrastructureJoinComplete,
        false,
        'prototype hooks cannot fabricate infrastructure completion',
      );
      t.equal(
        normalized.canonicalAuthorityConsumed,
        false,
        'prototype hooks cannot fabricate authority consumption',
      );
      t.equal(
        normalized.transactionRecoveryReady,
        false,
        'prototype hooks cannot fabricate transaction recovery',
      );
      t.equal(
        Object.getPrototypeOf(normalized),
        null,
        'the normalized witness has no polluted prototype',
      );
    } finally {
      restoreTransactionRecoveryReady();
      restoreToJson();
    }

    t.equal(
      normalize({
        infrastructureJoinComplete: false,
        canonicalAuthorityConsumed: false,
        transactionRecoveryReady: false,
        toJSON() {
          return {
            infrastructureJoinComplete: true,
            canonicalAuthorityConsumed: true,
            transactionRecoveryReady: true,
          };
        },
      }).startupRuntimeHandoff,
      null,
      'an own toJSON hook invalidates the witness instead of executing',
    );
    t.end();
  });

test('readiness normalization uses captured validation intrinsics',
  (t) => {
    const originalArrayIsArray = Array.isArray;
    const originalArrayIterator = objectGetOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    );
    const originalJsonStringify = JSON.stringify;
    const originalGetOwnPropertyDescriptor =
      Object.getOwnPropertyDescriptor;
    const originalReflectOwnKeys = Reflect.ownKeys;
    Array.isArray = () => false;
    JSON.stringify = () => JSON.parse(
      '{"infrastructureJoinComplete":true,' +
      '"canonicalAuthorityConsumed":true,' +
      '"transactionRecoveryReady":true}',
    );
    Object.getOwnPropertyDescriptor = () => ({
      configurable: true,
      enumerable: true,
      value: {
        infrastructureJoinComplete: true,
        canonicalAuthorityConsumed: true,
        transactionRecoveryReady: true,
      },
      writable: true,
    });
    Reflect.ownKeys = () => [
      'infrastructureJoinComplete',
      'canonicalAuthorityConsumed',
      'transactionRecoveryReady',
    ];
    reflectDefineProperty(Array.prototype, Symbol.iterator, {
      configurable: true,
      value() {
        return {
          next() {
            return {done: true};
          },
        };
      },
      writable: true,
    });
    let arrayWitness;
    let recordWitness;
    try {
      arrayWitness = normalize([]).startupRuntimeHandoff;
      recordWitness = normalize({
        infrastructureJoinComplete: false,
        canonicalAuthorityConsumed: false,
        transactionRecoveryReady: false,
      }).startupRuntimeHandoff;
    } finally {
      Array.isArray = originalArrayIsArray;
      JSON.stringify = originalJsonStringify;
      Object.getOwnPropertyDescriptor = originalGetOwnPropertyDescriptor;
      Reflect.ownKeys = originalReflectOwnKeys;
      reflectDefineProperty(
        Array.prototype,
        Symbol.iterator,
        originalArrayIterator,
      );
    }
    t.equal(
      arrayWitness,
      null,
      'replacing Array.isArray cannot admit an array witness',
    );
    t.same(
      recordWitness,
      {
        infrastructureJoinComplete: false,
        canonicalAuthorityConsumed: false,
        transactionRecoveryReady: false,
      },
      'replaced reflection, iteration, and JSON intrinsics cannot fabricate ' +
        'or erase readiness',
    );
    t.end();
  });
