import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {types as nodeUtilTypes} from 'node:util';

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_MUTATION_OUTCOME,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  classifyControlPlaneMutationResult,
} from '../../src/control-plane/control-plane-mutation-outcome-classifier.js';
import {
  resolveControlPlaneMutationOutcomeSnapshot,
  resolveMutationCompletionState,
} from '../../src/control-plane/control-plane-system-table-gateway-mutation-contracts.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
  PRESSURE_GOVERNOR_ACTION,
} from '../../src/control-plane/pressure-governor.js';

const EXPECTED_EFFECT_BY_OUTCOME = Object.freeze({
  [CONTROL_PLANE_MUTATION_OUTCOME.APPLIED]: Object.freeze({
    applied: true, accepted: true, deferred: false,
    retryable: false, terminal: false,
  }),
  [CONTROL_PLANE_MUTATION_OUTCOME.NO_OP]: Object.freeze({
    applied: false, accepted: true, deferred: false,
    retryable: true, terminal: false,
  }),
  [CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY]: Object.freeze({
    applied: true, accepted: true, deferred: true,
    retryable: true, terminal: false,
  }),
  [CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED]: Object.freeze({
    applied: false, accepted: true, deferred: true,
    retryable: true, terminal: false,
  }),
  [CONTROL_PLANE_MUTATION_OUTCOME.REJECTED]: Object.freeze({
    applied: false, accepted: false, deferred: false,
    retryable: false, terminal: true,
  }),
  [CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY]: Object.freeze({
    applied: false, accepted: true, deferred: true,
    retryable: true, terminal: false,
  }),
  [CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED]: Object.freeze({
    applied: false, accepted: true, deferred: false,
    retryable: true, terminal: false,
  }),
});
const CLASSIFIER_MODULE_URL = pathToFileURL(resolve(
  'src/control-plane/control-plane-mutation-outcome-classifier.js',
)).href;

test('control-plane mutation classification exhaustively owns every gateway outcome',
  (t) => {
    const outcomes = Object.values(CONTROL_PLANE_MUTATION_OUTCOME).sort();
    t.same(
      Object.keys(EXPECTED_EFFECT_BY_OUTCOME).sort(),
      outcomes,
      'the apply-effect oracle must cover every gateway outcome',
    );

    for (const outcome of outcomes) {
      const classification = classifyControlPlaneMutationResult({outcome});
      t.equal(classification.known, true, `${outcome} should be recognized`);
      t.equal(Object.isFrozen(classification), true,
        `${outcome} classification should be immutable`);
      t.same(
        {
          applied: classification.applied,
          accepted: classification.accepted,
          deferred: classification.deferred,
          retryable: classification.retryable,
          terminal: classification.terminal,
        },
        EXPECTED_EFFECT_BY_OUTCOME[outcome],
        `${outcome} should have one canonical effect tuple`,
      );
    }
    t.end();
  });

test('control-plane mutation apply classification rejects non-apply envelopes ' +
  'without relying on success:false', (t) => {
  t.equal(
    classifyControlPlaneMutationResult({
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
    }).applied,
    false,
    'no_op is not a durable apply when success is absent',
  );
  t.equal(
    classifyControlPlaneMutationResult({
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
    }).applied,
    false,
    'deferred is not a durable apply when success is absent',
  );
  t.equal(
    classifyControlPlaneMutationResult({success: true, affectedRows: 0})
      .applied,
    false,
    'legacy zero-row envelopes remain non-applies',
  );
  t.equal(
    classifyControlPlaneMutationResult({success: true}).applied,
    true,
    'legacy successful envelopes without typed outcomes remain compatible',
  );
  t.end();
});

test('control-plane mutation classification rejects inherited and unknown outcomes',
  (t) => {
    const inherited = Object.create({outcome: 'applied'});
    t.equal(classifyControlPlaneMutationResult(inherited).applied, false);
    t.equal(classifyControlPlaneMutationResult({outcome: '__proto__'}).applied,
      false);
    t.equal(classifyControlPlaneMutationResult({outcome: 'toString'}).applied,
      false);
    t.equal(
      classifyControlPlaneMutationResult({outcome: Object('applied')})
        .applied,
      false,
    );
    t.equal(
      classifyControlPlaneMutationResult({
        outcome: 'future_outcome',
        success: true,
        affectedRows: 1,
      }).applied,
      false,
    );
    t.equal(
      classifyControlPlaneMutationResult(Object.create({success: true}))
        .applied,
      false,
    );
    t.equal(
      classifyControlPlaneMutationResult(Object.create({affectedRows: 1}))
        .applied,
      false,
    );
    t.equal(
      classifyControlPlaneMutationResult({
        partitionResult: Object.create({affectedRows: 1}),
      }).applied,
      false,
    );
    t.end();
  });

test('control-plane mutation classification rejects proxies without running traps',
  (t) => {
    let trapCalls = 0;
    const fabricated = new Proxy({}, {
      getOwnPropertyDescriptor(_target, property) {
        trapCalls += 1;
        return {
          configurable: true,
          enumerable: true,
          value: property === 'affectedRows' ? 1 :
            property === 'success' ? true : 'applied',
          writable: true,
        };
      },
    });
    const nested = new Proxy({}, {
      getOwnPropertyDescriptor() {
        trapCalls += 1;
        return {configurable: true, value: 1};
      },
    });

    t.equal(classifyControlPlaneMutationResult(fabricated).valid, false);
    t.equal(
      classifyControlPlaneMutationResult({partitionResult: nested}).valid,
      false,
    );
    const revokedOuter = Proxy.revocable({}, {});
    revokedOuter.revoke();
    const revokedNested = Proxy.revocable({}, {});
    revokedNested.revoke();
    t.equal(
      classifyControlPlaneMutationResult(revokedOuter.proxy).valid,
      false,
    );
    t.equal(
      classifyControlPlaneMutationResult({
        partitionResult: revokedNested.proxy,
      }).valid,
      false,
    );
    t.equal(trapCalls, 0, 'proxy rejection precedes property inspection');
    t.end();
  });

test('control-plane mutation view reads every gateway field without accessors',
  (t) => {
    const gatewayFields = [
      'outcome',
      'success',
      'partitionResult',
      'affectedRows',
      'completionState',
      'visibilityState',
      'pressureAction',
    ];
    for (const field of gatewayFields) {
      let accessorCalls = 0;
      const envelope = {success: true, affectedRows: 1};
      Object.defineProperty(envelope, field, {
        configurable: true,
        get() {
          accessorCalls += 1;
          return field === 'success' ? true : 'applied';
        },
      });
      const classification = classifyControlPlaneMutationResult(envelope);
      t.equal(classification.valid, false, `${field} accessor must invalidate`);
      t.same(
        resolveControlPlaneMutationOutcomeSnapshot(envelope),
        {
          outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
          completionState: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
        },
        `${field} accessor must fail closed at the gateway`,
      );
      t.equal(accessorCalls, 0, `${field} accessor must never execute`);
    }

    let nestedAccessorCalls = 0;
    const partitionResult = {};
    Object.defineProperty(partitionResult, 'affectedRows', {
      get() {
        nestedAccessorCalls += 1;
        return 1;
      },
    });
    t.equal(
      classifyControlPlaneMutationResult({partitionResult}).valid,
      false,
    );
    t.equal(nestedAccessorCalls, 0,
      'nested affectedRows accessor must never execute');
    t.end();
  });

test('nullish partition containers preserve top-level row-count compatibility',
  (t) => {
    for (const partitionResult of [null, undefined]) {
      for (const affectedRows of [0, 1]) {
        const envelope = {
          success: true,
          partitionResult,
          affectedRows,
        };
        const classification = classifyControlPlaneMutationResult(envelope);
        t.equal(classification.valid, true,
          'nullish partition container remains a valid legacy shape');
        t.equal(classification.applied, affectedRows === 1);
        t.equal(
          resolveMutationCompletionState(envelope),
          affectedRows === 0 ?
            CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED :
            CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
        );
      }
    }

    t.equal(
      classifyControlPlaneMutationResult({
        partitionResult: {},
        affectedRows: 1,
      }).applied,
      true,
      'an empty plain partition result falls back to the top-level count',
    );
    t.equal(
      classifyControlPlaneMutationResult({
        partitionResult: {affectedRows: 0},
        affectedRows: 1,
      }).zeroAffectedRows,
      true,
      'a present nested count retains precedence',
    );
    t.end();
  });

test('ordinary legacy envelopes ignore Object.prototype pollution', (t) => {
  const pollutedFields = {
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
    success: false,
    partitionResult: {affectedRows: 0},
    affectedRows: 0,
    completionState: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
    visibilityState:
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY,
    pressureAction: PRESSURE_GOVERNOR_ACTION.REJECT,
  };
  const savedDescriptors = {};
  try {
    for (const [field, value] of Object.entries(pollutedFields)) {
      savedDescriptors[field] = Object.getOwnPropertyDescriptor(
        Object.prototype,
        field,
      );
      Reflect.defineProperty(Object.prototype, field, {
        configurable: true,
        value,
      });
    }
    const classification = classifyControlPlaneMutationResult({success: true});
    t.equal(classification.valid, true);
    t.equal(classification.applied, true);
    t.same(
      resolveControlPlaneMutationOutcomeSnapshot({success: true}),
      {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
        completionState: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      },
    );
    t.equal(
      classifyControlPlaneMutationResult(
        Object.create({success: true}),
      ).valid,
      false,
      'custom-prototype envelopes remain invalid',
    );
  } finally {
    for (const field of Object.keys(pollutedFields)) {
      const descriptor = savedDescriptors[field];
      if (descriptor) {
        Reflect.defineProperty(Object.prototype, field, descriptor);
      } else {
        Reflect.deleteProperty(Object.prototype, field);
      }
    }
  }
  t.end();
});

test('effect table construction resists pre-import prototype pollution', (t) => {
  const source = `
    const fields = ['applied', 'accepted', 'deferred', 'retryable', 'terminal'];
    const savedDescriptors = Object.create(null);
    try {
      for (const field of fields) {
        savedDescriptors[field] = Object.getOwnPropertyDescriptor(
          Object.prototype,
          field,
        );
        Reflect.defineProperty(Object.prototype, field, {
          configurable: true,
          enumerable: true,
          value: true,
        });
      }
      const {classifyControlPlaneMutationResult} =
        await import(${JSON.stringify(
    `${CLASSIFIER_MODULE_URL}?preimport-pollution`,
  )});
      const result = classifyControlPlaneMutationResult({outcome: 'no_op'});
      if (!result.valid || result.applied || !result.accepted ||
          result.deferred || !result.retryable || result.terminal) {
        throw new Error('pre-import pollution changed the NO_OP effect tuple');
      }
      process.stdout.write('pre-import-pollution-safe');
    } finally {
      for (const field of fields) {
        const descriptor = savedDescriptors[field];
        if (descriptor) {
          Reflect.defineProperty(Object.prototype, field, descriptor);
        } else {
          Reflect.deleteProperty(Object.prototype, field);
        }
      }
    }
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', source],
    {cwd: process.cwd(), encoding: 'utf8'},
  );
  t.equal(child.status, 0, child.stderr || 'fresh module import should pass');
  t.equal(child.stdout, 'pre-import-pollution-safe');
  t.end();
});

test('mutation view reads each gateway data field exactly once', (t) => {
  const source = `
    const nested = {affectedRows: 1};
    const target = {
      outcome: 'applied', success: true, partitionResult: nested,
      affectedRows: 9, completionState: 'durable',
      visibilityState: 'visible', pressureAction: 'allow',
    };
    const original = Object.getOwnPropertyDescriptor;
    const counts = Object.create(null);
    Object.getOwnPropertyDescriptor = (object, field) => {
      const owner = object === target ? 'root' : object === nested ? 'nested' : '';
      if (owner) {
        const key = owner + ':' + String(field);
        counts[key] = (counts[key] || 0) + 1;
      }
      return original(object, field);
    };
    try {
      const {classifyControlPlaneMutationResult} = await import(
        ${JSON.stringify(`${CLASSIFIER_MODULE_URL}?descriptor-census`)}
      );
      classifyControlPlaneMutationResult(target);
    } finally {
      Object.getOwnPropertyDescriptor = original;
    }
    process.stdout.write(JSON.stringify(counts));
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', source],
    {cwd: process.cwd(), encoding: 'utf8'},
  );
  t.equal(child.status, 0, child.stderr || 'descriptor census should pass');
  t.same(JSON.parse(child.stdout), {
    'root:outcome': 1,
    'root:success': 1,
    'root:partitionResult': 1,
    'root:completionState': 1,
    'root:visibilityState': 1,
    'root:pressureAction': 1,
    'nested:affectedRows': 1,
    'root:affectedRows': 1,
  });
  t.end();
});

test('mutation view accepts null prototypes and ignores inherited accessors',
  (t) => {
    const partitionResult = Object.assign(Object.create(null), {
      affectedRows: 1,
    });
    const nullPrototypeResult = Object.assign(Object.create(null), {
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      success: true,
      partitionResult,
    });
    t.equal(
      classifyControlPlaneMutationResult(nullPrototypeResult).applied,
      true,
      'null-prototype root and partition records are valid data records',
    );

    const fields = [
      'outcome',
      'success',
      'partitionResult',
      'affectedRows',
      'completionState',
      'visibilityState',
      'pressureAction',
    ];
    const savedDescriptors = new Map();
    let inheritedAccessorCalls = 0;
    let inheritedResult;
    try {
      for (const field of fields) {
        savedDescriptors.set(
          field,
          Object.getOwnPropertyDescriptor(Object.prototype, field),
        );
        Reflect.defineProperty(Object.prototype, field, {
          configurable: true,
          get() {
            inheritedAccessorCalls += 1;
            throw new Error(`inherited ${field} accessor executed`);
          },
        });
      }
      inheritedResult = classifyControlPlaneMutationResult({});
    } finally {
      for (const field of fields) {
        const descriptor = savedDescriptors.get(field);
        if (descriptor) {
          Reflect.defineProperty(Object.prototype, field, descriptor);
        } else {
          Reflect.deleteProperty(Object.prototype, field);
        }
      }
    }
    t.equal(inheritedAccessorCalls, 0, 'inherited accessors never execute');
    t.equal(inheritedResult.valid, true);
    t.equal(inheritedResult.applied, true);
    t.end();
  });

test('mutation view rejects hostile scalar values without executing hooks',
  (t) => {
    let hostileCalls = 0;
    const coercive = {
      valueOf() {
        hostileCalls += 1;
        return 1;
      },
      toString() {
        hostileCalls += 1;
        return 'applied';
      },
      [Symbol.toPrimitive]() {
        hostileCalls += 1;
        return 'applied';
      },
    };
    const proxy = new Proxy({}, {
      get() {
        hostileCalls += 1;
        throw new Error('scalar proxy get trap executed');
      },
      getOwnPropertyDescriptor() {
        hostileCalls += 1;
        throw new Error('scalar proxy descriptor trap executed');
      },
      getPrototypeOf() {
        hostileCalls += 1;
        throw new Error('scalar proxy prototype trap executed');
      },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const hostileValues = [
      Object('applied'),
      coercive,
      proxy,
      revoked.proxy,
      Symbol('applied'),
      1n,
    ];
    const scalarFields = [
      'outcome',
      'success',
      'affectedRows',
      'completionState',
      'visibilityState',
      'pressureAction',
    ];
    for (const field of scalarFields) {
      for (const value of hostileValues) {
        const result = {success: true, affectedRows: 1, [field]: value};
        t.equal(
          classifyControlPlaneMutationResult(result).valid,
          false,
          `${field} rejects one hostile scalar`,
        );
      }
    }
    t.equal(hostileCalls, 0, 'hostile scalar hooks and traps never execute');
    t.end();
  });

test('mutation view uses captured reflection and numeric intrinsics', (t) => {
  const originals = {
    create: Object.create,
    freeze: Object.freeze,
    getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
    getPrototypeOf: Object.getPrototypeOf,
    hasOwn: Object.hasOwn,
    is: Object.is,
    isSafeInteger: Number.isSafeInteger,
    isProxy: nodeUtilTypes.isProxy,
  };
  let classification;
  try {
    Object.create = () => {
      throw new Error('mutable Object.create executed');
    };
    Object.freeze = () => {
      throw new Error('mutable Object.freeze executed');
    };
    Object.getOwnPropertyDescriptor = () => {
      throw new Error('mutable descriptor intrinsic executed');
    };
    Object.getPrototypeOf = () => {
      throw new Error('mutable prototype intrinsic executed');
    };
    Object.hasOwn = () => false;
    Object.is = () => true;
    Number.isSafeInteger = () => false;
    nodeUtilTypes.isProxy = () => true;
    classification = classifyControlPlaneMutationResult({
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      success: true,
      affectedRows: 1,
      completionState: 'durable',
      visibilityState: CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
      pressureAction: PRESSURE_GOVERNOR_ACTION.ALLOW,
    });
  } finally {
    Object.create = originals.create;
    Object.freeze = originals.freeze;
    Object.getOwnPropertyDescriptor = originals.getOwnPropertyDescriptor;
    Object.getPrototypeOf = originals.getPrototypeOf;
    Object.hasOwn = originals.hasOwn;
    Object.is = originals.is;
    Number.isSafeInteger = originals.isSafeInteger;
    nodeUtilTypes.isProxy = originals.isProxy;
  }
  t.equal(classification.valid, true);
  t.equal(classification.applied, true);
  t.equal(Object.isFrozen(classification), true);
  t.equal(Object.getPrototypeOf(classification), null);
  t.end();
});

test('normalized mutation view is detached from later source mutation', (t) => {
  const partitionResult = {affectedRows: 1};
  const source = {
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    success: true,
    partitionResult,
    affectedRows: 9,
    completionState: 'durable',
    visibilityState: CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
    pressureAction: PRESSURE_GOVERNOR_ACTION.ALLOW,
  };
  const view = classifyControlPlaneMutationResult(source);
  const outcomeSnapshot = resolveControlPlaneMutationOutcomeSnapshot(view);

  source.outcome = CONTROL_PLANE_MUTATION_OUTCOME.REJECTED;
  source.success = false;
  source.completionState = 'changed';
  source.visibilityState =
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE;
  source.pressureAction = PRESSURE_GOVERNOR_ACTION.REJECT;
  source.affectedRows = 0;
  partitionResult.affectedRows = 0;

  t.match(view, {
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    valid: true,
    applied: true,
    affectedRows: 1,
    completionState: 'durable',
    visibilityState: CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
    pressureAction: PRESSURE_GOVERNOR_ACTION.ALLOW,
  });
  t.same(outcomeSnapshot, {
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    completionState: 'durable',
  });
  t.throws(
    () => Object.defineProperty(view, 'applied', {value: false}),
    TypeError,
    'the normalized view cannot be mutated',
  );
  t.throws(
    () => Object.defineProperty(outcomeSnapshot, 'outcome', {
      value: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
    }),
    TypeError,
    'the derived outcome snapshot cannot be mutated',
  );
  t.end();
});

test('control-plane mutation classification rejects coercive row counts', (t) => {
  let coercionCalls = 0;
  const hostileCount = {
    [Symbol.toPrimitive]() {
      coercionCalls += 1;
      return 1;
    },
  };
  const invalidCounts = [
    true,
    '1',
    null,
    undefined,
    Object(1),
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    -1,
    -0,
    hostileCount,
  ];
  for (const affectedRows of invalidCounts) {
    t.equal(
      classifyControlPlaneMutationResult({success: true, affectedRows})
        .applied,
      false,
      'invalid present row counts fail closed',
    );
  }
  t.equal(coercionCalls, 0, 'row-count classification never coerces objects');

  let accessorCalls = 0;
  const accessorEnvelope = {};
  Object.defineProperty(accessorEnvelope, 'outcome', {
    get() {
      accessorCalls += 1;
      return 'applied';
    },
  });
  t.equal(classifyControlPlaneMutationResult(accessorEnvelope).applied, false);
  t.equal(accessorCalls, 0, 'classification never invokes outcome accessors');

  const originalIsSafeInteger = Number.isSafeInteger;
  Number.isSafeInteger = () => false;
  try {
    t.equal(
      classifyControlPlaneMutationResult({success: true, affectedRows: 1})
        .applied,
      true,
      'captured safe-integer validation preserves a valid count when the ' +
        'mutable intrinsic gives the opposite answer',
    );
    Number.isSafeInteger = () => true;
    t.equal(
      classifyControlPlaneMutationResult({success: true, affectedRows: 1.5})
        .valid,
      false,
      'captured safe-integer validation still rejects a fractional count ' +
        'when the mutable intrinsic admits it',
    );
  } finally {
    Number.isSafeInteger = originalIsSafeInteger;
  }
  t.end();
});

test('gateway normalization consumes the validated classifier effect', (t) => {
  t.same(
    resolveControlPlaneMutationOutcomeSnapshot({
      success: true,
      affectedRows: '0',
    }),
    {
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
      completionState: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
    },
    'invalid present row counts fail closed at the production seam',
  );

  const originalIsFinite = Number.isFinite;
  Number.isFinite = () => false;
  try {
    t.same(
      resolveControlPlaneMutationOutcomeSnapshot({
        success: true,
        affectedRows: 0,
      }),
      {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
        completionState:
          CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
      },
      'zero-row behavior does not depend on the mutable global intrinsic',
    );
  } finally {
    Number.isFinite = originalIsFinite;
  }
  t.equal(
    Object.isFrozen(resolveControlPlaneMutationOutcomeSnapshot({success: true})),
    true,
    'the gateway outcome snapshot is immutable',
  );
  t.end();
});

test('gateway completion and outcome consume one normalized precedence view',
  (t) => {
    const explicitCompletion = 'durable_custom_completion';
    t.same(
      resolveControlPlaneMutationOutcomeSnapshot({
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
        success: false,
        completionState: explicitCompletion,
        visibilityState:
          CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY,
        pressureAction: PRESSURE_GOVERNOR_ACTION.REJECT,
        affectedRows: 0,
      }),
      {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
        completionState: explicitCompletion,
      },
      'known outcome and explicit completion retain independent precedence',
    );
    t.same(
      resolveControlPlaneMutationOutcomeSnapshot({
        success: false,
        visibilityState:
          CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE,
        pressureAction: PRESSURE_GOVERNOR_ACTION.REJECT,
      }),
      {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
        completionState: CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
      },
      'visibility owns completion while pressure owns an untyped failed outcome',
    );
    t.same(
      resolveControlPlaneMutationOutcomeSnapshot({
        success: false,
        pressureAction: PRESSURE_GOVERNOR_ACTION.DEFER,
      }),
      {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
        completionState: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
      },
    );
    t.end();
  });
