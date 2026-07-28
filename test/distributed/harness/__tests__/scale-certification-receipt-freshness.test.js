import {test} from '../../../../src/test-helpers/tap.js';
import {
  SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
  SCALE_CERTIFICATION_RECEIPT_DECISION_STATE,
  SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
  SCALE_CLAIM_REASON,
  computeScaleCertificationReceiptDigest,
  validateScaleCertificationReceipt,
} from '../scale-evidence-contract.js';

const PROFILE_IDENTITY = `sha256:${'a'.repeat(64)}`;
const EVIDENCE_IDENTITY = `sha256:${'b'.repeat(64)}`;
const QUEST_ID = 'scale-topology-churn-certification';
const ISSUED_AT = '2026-07-26T10:10:01.000Z';
const VALID_UNTIL = '2026-08-26T10:10:01.000Z';
const CURRENT_TIME = '2026-07-27T10:10:01.000Z';
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

function receipt(overrides = {}) {
  return {
    contractId: SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
    schemaVersion: SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
    questId: QUEST_ID,
    profileIdentity: PROFILE_IDENTITY,
    evidenceIdentity: EVIDENCE_IDENTITY,
    issuedAt: ISSUED_AT,
    validUntil: VALID_UNTIL,
    ...overrides,
  };
}

function expectations(value, overrides = {}) {
  return {
    terminalReceiptDigest: computeScaleCertificationReceiptDigest(value),
    questId: QUEST_ID,
    profileIdentity: PROFILE_IDENTITY,
    evidenceIdentity: EVIDENCE_IDENTITY,
    evaluatedAt: CURRENT_TIME,
    ...overrides,
  };
}

function replaceProperty(owner, key, value) {
  const descriptor = objectGetOwnPropertyDescriptor(owner, key);
  objectDefineProperty(owner, key, {
    configurable: true,
    writable: true,
    value,
  });
  return () => objectDefineProperty(owner, key, descriptor);
}

test('canonical receipt digest and exact tuple produce a current decision',
  (t) => {
    const value = receipt();
    const reordered = {
      validUntil: value.validUntil,
      issuedAt: value.issuedAt,
      evidenceIdentity: value.evidenceIdentity,
      profileIdentity: value.profileIdentity,
      questId: value.questId,
      schemaVersion: value.schemaVersion,
      contractId: value.contractId,
    };
    const decision = validateScaleCertificationReceipt(
      reordered,
      expectations(value),
    );

    t.equal(
      computeScaleCertificationReceiptDigest(reordered),
      computeScaleCertificationReceiptDigest(value),
    );
    t.equal(
      decision.state,
      SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.CURRENT,
    );
    t.same(decision.reasonCodes, []);
    t.same(decision.errors, []);
    t.end();
  });

test('schema, digest, and tuple mismatches fail closed with typed reasons',
  (t) => {
    const source = receipt();
    const sourceExpectations = expectations(source);
    const attacks = [
      {
        value: {...source, extra: 'self-asserted'},
        expectedError: 'receipt:exact_schema_required',
      },
      {
        value: {...source, schemaVersion: 'future-untrusted-schema'},
        expectedError: 'receipt.schemaVersion:unsupported',
      },
      {
        value: {...source, validUntil: '2026-08-26T10:10:01Z'},
        expectedError:
          'receipt.validUntil:canonical_utc_timestamp_required',
      },
      {
        value: {...source, validUntil: ISSUED_AT},
        expectedError: 'receipt.validUntil:must_follow_issuedAt',
      },
      {
        value: {...source, issuedAt: '2026-07-26T10:10:01.000+00:00'},
        expectedError:
          'receipt.issuedAt:canonical_utc_timestamp_required',
      },
      {
        value: {...source, validUntil: '2026-08-26T10:10:02.000Z'},
        expectedError: 'receipt.digest:mismatch',
      },
    ];

    for (const attack of attacks) {
      const decision = validateScaleCertificationReceipt(
        attack.value,
        sourceExpectations,
      );
      t.equal(
        decision.state,
        SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.INVALID,
        attack.expectedError,
      );
      t.match(decision.reasonCodes, [
        SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
      ]);
      t.ok(decision.errors.includes(attack.expectedError));
    }

    for (const [field, replacement] of [
      ['questId', 'different-certification-quest'],
      ['profileIdentity', `sha256:${'c'.repeat(64)}`],
      ['evidenceIdentity', `sha256:${'d'.repeat(64)}`],
    ]) {
      const decision = validateScaleCertificationReceipt(source, {
        ...sourceExpectations,
        [field]: replacement,
      });
      t.equal(
        decision.state,
        SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.INVALID,
        field,
      );
      t.ok(decision.errors.includes(`receipt.${field}:mismatch`));
    }
    t.end();
  });

test('non-enumerable, symbol, and boxed receipt fields fail exact schema',
  (t) => {
    const clean = receipt();
    const expected = expectations(clean);
    const nonEnumerable = receipt();
    objectDefineProperty(nonEnumerable, 'hidden', {
      configurable: true,
      enumerable: false,
      value: 'unbound',
    });
    const symbolField = receipt();
    symbolField[Symbol('unbound')] = 'unbound';
    const boxedIdentity = receipt({
      profileIdentity: Object(PROFILE_IDENTITY),
    });

    for (const value of [nonEnumerable, symbolField, boxedIdentity]) {
      const decision = validateScaleCertificationReceipt(value, expected);
      t.equal(
        decision.state,
        SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.INVALID,
      );
      t.match(decision.reasonCodes, [
        SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
      ]);
    }
    t.end();
  });

test('explicit UTC evaluation uses a closed-open validity interval', (t) => {
  const value = receipt();
  const expected = expectations(value);
  const cases = [
    {
      evaluatedAt: '',
      state:
        SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.EVALUATION_TIME_REQUIRED,
      reason:
        SCALE_CLAIM_REASON
          .TERMINAL_CERTIFICATION_EVALUATION_TIME_REQUIRED,
    },
    {
      evaluatedAt: '2026-07-26T10:10:00.999Z',
      state: SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.NOT_YET_VALID,
      reason: SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_NOT_YET_VALID,
    },
    {
      evaluatedAt: ISSUED_AT,
      state: SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.CURRENT,
      reason: '',
    },
    {
      evaluatedAt: '2026-08-26T10:10:00.999Z',
      state: SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.CURRENT,
      reason: '',
    },
    {
      evaluatedAt: VALID_UNTIL,
      state: SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.EXPIRED,
      reason: SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_EXPIRED,
    },
  ];

  for (const item of cases) {
    const decision = validateScaleCertificationReceipt(value, {
      ...expected,
      evaluatedAt: item.evaluatedAt,
    });
    t.equal(decision.state, item.state, item.evaluatedAt || 'missing');
    if (item.reason) {
      t.match(decision.reasonCodes, [item.reason]);
    } else {
      t.same(decision.reasonCodes, []);
    }
  }

  const offsetTime = validateScaleCertificationReceipt(value, {
    ...expected,
    evaluatedAt: '2026-07-27T10:10:01.000+00:00',
  });
  t.equal(
    offsetTime.state,
    SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.EVALUATION_TIME_REQUIRED,
  );
  t.end();
});

test('non-plain and unreadable receipt values fail closed', (t) => {
  const nullPrototype = Object.assign(Object.create(null), receipt());
  const accessor = receipt();
  let accessorReads = 0;
  objectDefineProperty(accessor, 'validUntil', {
    configurable: true,
    enumerable: true,
    get() {
      accessorReads += 1;
      return VALID_UNTIL;
    },
  });
  let proxyTrapCalls = 0;
  const unreadable = new Proxy(receipt(), {
    getPrototypeOf() {
      proxyTrapCalls += 1;
      throw new TypeError('hostile receipt');
    },
  });

  for (const value of [nullPrototype, accessor, unreadable]) {
    const decision = validateScaleCertificationReceipt(
      value,
      expectations(receipt()),
    );
    t.equal(
      decision.state,
      SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.INVALID,
    );
    t.match(decision.reasonCodes, [
      SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
    ]);
  }
  t.equal(accessorReads, 0, 'receipt accessors are never executed');
  t.equal(proxyTrapCalls, 0, 'receipt proxies are rejected before traps');
  t.end();
});

test('expectation accessors and proxies fail closed without execution', (t) => {
  const value = receipt();
  const accessorExpectations = expectations(value);
  let accessorReads = 0;
  objectDefineProperty(accessorExpectations, 'questId', {
    configurable: true,
    enumerable: true,
    get() {
      accessorReads += 1;
      return QUEST_ID;
    },
  });
  let proxyTrapCalls = 0;
  const proxyExpectations = new Proxy(expectations(value), {
    getOwnPropertyDescriptor() {
      proxyTrapCalls += 1;
      throw new TypeError('hostile expectations');
    },
  });

  for (const expected of [accessorExpectations, proxyExpectations]) {
    const decision = validateScaleCertificationReceipt(value, expected);
    t.equal(
      decision.state,
      SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.INVALID,
    );
    t.match(decision.reasonCodes, [
      SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
    ]);
  }
  t.equal(accessorReads, 0, 'expectation accessors are never executed');
  t.equal(proxyTrapCalls, 0, 'expectation proxies are rejected before traps');
  t.end();
});

test('captured intrinsics preserve receipt validation and digest binding',
  (t) => {
    const value = receipt();
    const expected = expectations(value);
    const cleanDigest = computeScaleCertificationReceiptDigest(value);
    const restorations = [
      replaceProperty(Array, 'isArray', () => false),
      replaceProperty(Date, 'parse', () => Number.NaN),
      replaceProperty(Date.prototype, 'toISOString', () => 'polluted'),
      replaceProperty(JSON, 'stringify', () => '"polluted"'),
      replaceProperty(Number, 'isFinite', () => false),
      replaceProperty(Object, 'create', () => ({})),
      replaceProperty(Object, 'defineProperty', () => ({})),
      replaceProperty(Object, 'getOwnPropertyDescriptor', () => ({
        configurable: true,
        enumerable: true,
        get() {
          return 'polluted';
        },
      })),
      replaceProperty(Object, 'getPrototypeOf', () => null),
      replaceProperty(Object, 'hasOwn', () => false),
      replaceProperty(Reflect, 'ownKeys', () => []),
      replaceProperty(RegExp.prototype, 'exec', () => ['forged']),
      replaceProperty(RegExp.prototype, 'test', () => false),
      replaceProperty(String.prototype, 'trim', () => ''),
    ];
    let pollutedDigest = '';
    let pollutedDecision;
    try {
      pollutedDigest = computeScaleCertificationReceiptDigest(value);
      pollutedDecision = validateScaleCertificationReceipt(value, expected);
    } finally {
      for (let index = restorations.length - 1; index >= 0; index -= 1) {
        restorations[index]();
      }
    }

    t.equal(pollutedDigest, cleanDigest);
    t.equal(
      pollutedDecision.state,
      SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.CURRENT,
    );
    t.same(pollutedDecision.reasonCodes, []);
    t.end();
  });

test('polluted RegExp exec cannot admit malformed digest fields', (t) => {
  const malformed = receipt({
    profileIdentity: 'not-a-profile-digest',
    evidenceIdentity: 'not-an-evidence-digest',
  });
  const restoreExec = replaceProperty(
    RegExp.prototype,
    'exec',
    () => ['forged-match'],
  );
  let admitted = false;
  try {
    const terminalReceiptDigest =
      computeScaleCertificationReceiptDigest(malformed);
    admitted = validateScaleCertificationReceipt(malformed, {
      terminalReceiptDigest,
      questId: malformed.questId,
      profileIdentity: malformed.profileIdentity,
      evidenceIdentity: malformed.evidenceIdentity,
      evaluatedAt: CURRENT_TIME,
    }).state === SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.CURRENT;
  } catch {
    admitted = false;
  } finally {
    restoreExec();
  }

  t.equal(admitted, false);
  t.end();
});
