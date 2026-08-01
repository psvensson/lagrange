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

test('readiness normalization rejects proxies before reflection', (t) => {
  let descriptorReadCount = 0;
  let reflectionTrapCount = 0;
  const target = {
    infrastructureJoinComplete: false,
    canonicalAuthorityConsumed: false,
    transactionRecoveryReady: false,
  };
  const proxy = new Proxy(target, {
    getOwnPropertyDescriptor(record, key) {
      descriptorReadCount += 1;
      reflectionTrapCount += 1;
      const descriptor = Reflect.getOwnPropertyDescriptor(record, key);
      return descriptorReadCount > 3 ?
        {...descriptor, value: true} :
        descriptor;
    },
    getPrototypeOf(record) {
      reflectionTrapCount += 1;
      return Reflect.getPrototypeOf(record);
    },
    ownKeys(record) {
      reflectionTrapCount += 1;
      return Reflect.ownKeys(record);
    },
  });

  t.equal(
    normalize(proxy).startupRuntimeHandoff,
    null,
    'a stateful root proxy cannot change values between admission and copy',
  );
  t.equal(
    reflectionTrapCount,
    0,
    'root proxies are rejected without invoking reflection traps',
  );
  t.equal(
    normalize({transactionRecoveryOutcome: proxy})
      .startupRuntimeHandoff,
    null,
    'a nested proxy invalidates the complete witness',
  );
  t.equal(
    reflectionTrapCount,
    0,
    'nested proxies are rejected without invoking reflection traps',
  );
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  t.equal(
    normalize(revoked.proxy).startupRuntimeHandoff,
    null,
    'a revoked proxy remains fail-closed without reflection',
  );
  t.end();
});

test('readiness normalization rejects hostile envelopes before field reads',
  (t) => {
    let envelopeTrapCount = 0;
    const fabricatedBody = {
      startupRuntimeHandoff: {
        infrastructureJoinComplete: true,
        canonicalAuthorityConsumed: true,
        transactionRecoveryReady: true,
      },
    };
    const envelopeProxy = new Proxy({status: 503, body: fabricatedBody}, {
      get(record, key) {
        envelopeTrapCount += 1;
        return Reflect.get(record, key);
      },
      getOwnPropertyDescriptor(record, key) {
        envelopeTrapCount += 1;
        return Reflect.getOwnPropertyDescriptor(record, key);
      },
    });
    t.equal(
      normalizeReadinessProbeResult(envelopeProxy).startupRuntimeHandoff,
      null,
      'a proxied response envelope cannot supply recovery evidence',
    );
    t.equal(
      envelopeTrapCount,
      0,
      'the response proxy is rejected before any trap executes',
    );

    let bodyTrapCount = 0;
    const bodyProxy = new Proxy(fabricatedBody, {
      get(record, key) {
        bodyTrapCount += 1;
        return Reflect.get(record, key);
      },
      getOwnPropertyDescriptor(record, key) {
        bodyTrapCount += 1;
        return Reflect.getOwnPropertyDescriptor(record, key);
      },
    });
    t.equal(
      normalizeReadinessProbeResult({status: 503, body: bodyProxy})
        .startupRuntimeHandoff,
      null,
      'a proxied readiness body cannot supply recovery evidence',
    );
    t.equal(
      bodyTrapCount,
      0,
      'the body proxy is rejected before any trap executes',
    );
    t.end();
  });

test('readiness normalization rejects envelope and body accessors', (t) => {
  let envelopeAccessorReadCount = 0;
  const bodyAccessorEnvelope = {status: 503};
  Object.defineProperty(bodyAccessorEnvelope, 'body', {
    enumerable: true,
    get() {
      envelopeAccessorReadCount += 1;
      return {
        startupRuntimeHandoff: {
          infrastructureJoinComplete: true,
          canonicalAuthorityConsumed: true,
          transactionRecoveryReady: true,
        },
      };
    },
  });
  t.equal(
    normalizeReadinessProbeResult(bodyAccessorEnvelope)
      .startupRuntimeHandoff,
    null,
    'a body accessor cannot fabricate recovery evidence',
  );

  const statusAccessorEnvelope = {
    body: {
      startupRuntimeHandoff: {
        infrastructureJoinComplete: true,
        canonicalAuthorityConsumed: true,
        transactionRecoveryReady: true,
      },
    },
  };
  Object.defineProperty(statusAccessorEnvelope, 'status', {
    enumerable: true,
    get() {
      envelopeAccessorReadCount += 1;
      return 200;
    },
  });
  t.equal(
    normalizeReadinessProbeResult(statusAccessorEnvelope)
      .startupRuntimeHandoff,
    null,
    'a status accessor cannot mutate or authenticate recovery evidence',
  );
  t.equal(
    envelopeAccessorReadCount,
    0,
    'response accessors are inspected but never executed',
  );

  let phaseAccessorReadCount = 0;
  const accessorBody = {
    startupRuntimeHandoff: {
      infrastructureJoinComplete: false,
      canonicalAuthorityConsumed: false,
      transactionRecoveryReady: false,
    },
  };
  Object.defineProperty(accessorBody, 'phase', {
    enumerable: true,
    get() {
      phaseAccessorReadCount += 1;
      accessorBody.startupRuntimeHandoff = {
        infrastructureJoinComplete: true,
        canonicalAuthorityConsumed: true,
        transactionRecoveryReady: true,
      };
      return 'READY';
    },
  });
  t.equal(
    normalizeReadinessProbeResult({status: 503, body: accessorBody})
      .startupRuntimeHandoff,
    null,
    'an unrelated body accessor cannot rewrite the handoff before copying',
  );
  t.equal(
    phaseAccessorReadCount,
    0,
    'unrelated body accessors are never executed',
  );
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
    const originalMathFloor = Math.floor;
    const originalMathMax = Math.max;
    const originalNumberIsFinite = Number.isFinite;
    const originalGetOwnPropertyDescriptor =
      Object.getOwnPropertyDescriptor;
    const originalReflectOwnKeys = Reflect.ownKeys;
    const intrinsicBody = {
      startupRuntimeHandoff: {
        infrastructureJoinComplete: false,
        canonicalAuthorityConsumed: false,
        transactionRecoveryReady: false,
      },
    };
    let hostileMathCallCount = 0;
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
    Math.floor = (value) => {
      hostileMathCallCount += 1;
      intrinsicBody.startupRuntimeHandoff = {
        infrastructureJoinComplete: true,
        canonicalAuthorityConsumed: true,
        transactionRecoveryReady: true,
      };
      return value;
    };
    Math.max = () => Number.MAX_SAFE_INTEGER;
    Number.isFinite = () => true;
    let arrayWitness;
    let recordWitness;
    try {
      arrayWitness = normalize([]).startupRuntimeHandoff;
      recordWitness = normalizeReadinessProbeResult({
        status: 503,
        body: intrinsicBody,
      }).startupRuntimeHandoff;
    } finally {
      Array.isArray = originalArrayIsArray;
      JSON.stringify = originalJsonStringify;
      Object.getOwnPropertyDescriptor = originalGetOwnPropertyDescriptor;
      Reflect.ownKeys = originalReflectOwnKeys;
      Math.floor = originalMathFloor;
      Math.max = originalMathMax;
      Number.isFinite = originalNumberIsFinite;
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
    t.equal(
      hostileMathCallCount,
      0,
      'replaced numeric intrinsics are never executed',
    );
    t.end();
  });
