import {test} from '../../../../src/test-helpers/tap.js';
import {
  SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
  SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
  SCALE_CERTIFICATION_RECEIPT_STATE,
  SCALE_CLAIM_REASON,
  SCALE_EVIDENCE_CONTRACT_ID,
  SCALE_EVIDENCE_FIDELITY,
  SCALE_EVIDENCE_SCHEMA_VERSION,
  SCALE_GATE_STATUS,
  SCALE_PROFILE_ID,
  computeScaleCertificationEvidenceIdentity,
  computeScaleCertificationReceiptDigest,
  computeScaleEvidenceDigest,
  computeScaleProfileIdentity,
  computeScaleReportIdentity,
  computeScaleRunIdentity,
  createScaleEvidenceReport,
  evaluateScaleClaimEligibility,
  isNonNegativeInteger,
  isNonNegativeNumber,
  isPositiveInteger,
  validateScaleEvidenceReport,
} from '../scale-evidence-contract.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const RECEIPT_ISSUED_AT = '2026-07-26T10:10:01.000Z';
const RECEIPT_VALID_UNTIL = '2026-08-26T10:10:01.000Z';
const RECEIPT_EVALUATED_AT = '2026-07-27T10:10:01.000Z';
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectDefineProperty = Reflect.defineProperty;
const ARTIFACTS = Object.freeze([{
  kind: 'raw_samples',
  path: 'test-output/reports/p0/samples.ndjson',
  digest: DIGEST_A,
}]);
const ARTIFACT_MANIFEST_DIGEST = computeScaleEvidenceDigest(ARTIFACTS);

function passingGates() {
  return {
    feasibility: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST_A,
      reasonCodes: [],
    },
    safety: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST_A,
      violationCount: 0,
    },
    performance: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST_A,
      baselineId: 'p0-seven-node-baseline-v1',
      offeredOperations: 1000,
      correctOperations: 997,
      p95LatencyMs: 8,
      p99LatencyMs: 12,
      errorRate: 0.003,
    },
    resources: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST_A,
      maxHeapBytes: 32_000_000,
      maxRssBytes: 64_000_000,
      maxFileDescriptors: 128,
      maxEventLoopLagMs: 4,
      maxQueueDepth: 10,
      maxInFlight: 8,
      retryRate: 0.01,
      diskAmplification: 3,
      retainedRaftBytes: 4_000_000,
    },
    convergence: {
      status: SCALE_GATE_STATUS.PASS,
      evidenceArtifactDigest: DIGEST_A,
      sampleCount: 20,
      passRate: 0.95,
      confidenceInterval: {lower: 0.76, upper: 0.99},
      p50Ms: 1200,
      p95Ms: 2400,
    },
  };
}

function evidenceInput(overrides = {}) {
  const base = {
    profile: {id: SCALE_PROFILE_ID.DEVELOPMENT, version: 1},
    run: {
      id: 'p0-run-001',
      startedAt: '2026-07-26T10:00:00.000Z',
      completedAt: '2026-07-26T10:10:00.000Z',
      fidelity: SCALE_EVIDENCE_FIDELITY.DETERMINISTIC_GUARD,
    },
    software: {
      revision: '02503b7f645123f4589fd61be93092383acb4abb',
      runtime: 'node-v22.12.0',
      packageVersion: '0.1.0',
    },
    hardware: {
      provider: 'local',
      region: 'local',
      instanceClass: 'development-host',
      cpuCount: 8,
      memoryBytes: 16_000_000_000,
      storageClass: 'local-ssd',
    },
    topology: {
      nodeCount: 7,
      failureDomainCount: 1,
      tableCount: 4,
      partitionCount: 16,
      replicaCount: 48,
      manifestDigest: DIGEST_A,
    },
    data: {
      logicalBytes: 1_000_000,
      physicalBytes: 3_200_000,
      manifestDigest: DIGEST_B,
      shape: 'uniform-fixture',
    },
    workload: {
      id: 'mixed-read-write-v1',
      manifestDigest: DIGEST_C,
      duration: {warmupMs: 10_000, measuredMs: 60_000},
    },
    gates: passingGates(),
    provenance: {
      producer: 'scale-certification-evidence-contract-test',
      invocation: 'node scripts/checks/run-scale-certification-evidence-contract-scenarios.js',
      environmentDigest: DIGEST_B,
      artifactManifestDigest: ARTIFACT_MANIFEST_DIGEST,
    },
    artifacts: structuredClone(ARTIFACTS),
    certification: {
      receiptState: SCALE_CERTIFICATION_RECEIPT_STATE.ABSENT,
    },
    extensions: {},
  };
  return {...base, ...overrides};
}

function attachReceipt(baseInput, {
  questId = 'scale-topology-churn-certification',
} = {}) {
  const envelope = {
    ...structuredClone(baseInput),
    contractId: SCALE_EVIDENCE_CONTRACT_ID,
    schemaVersion: SCALE_EVIDENCE_SCHEMA_VERSION,
  };
  const profileIdentity = computeScaleProfileIdentity(envelope);
  const evidenceIdentity = computeScaleCertificationEvidenceIdentity({
    ...envelope,
    profileIdentity,
  });
  const terminalReceiptDigest = computeScaleCertificationReceiptDigest({
    contractId: SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
    schemaVersion: SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
    questId,
    profileIdentity,
    evidenceIdentity,
    issuedAt: RECEIPT_ISSUED_AT,
    validUntil: RECEIPT_VALID_UNTIL,
  });
  return {
    ...baseInput,
    certification: {
      receiptState: SCALE_CERTIFICATION_RECEIPT_STATE.ATTACHED,
      questId,
      terminalReceiptDigest,
      profileIdentity,
      evidenceIdentity,
    },
  };
}

function trustReceipt(input) {
  const receipt = input.certification;
  const resolvedReceipt = {
    contractId: SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID,
    schemaVersion: SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION,
    questId: receipt.questId,
    profileIdentity: receipt.profileIdentity,
    evidenceIdentity: receipt.evidenceIdentity,
    issuedAt: RECEIPT_ISSUED_AT,
    validUntil: RECEIPT_VALID_UNTIL,
  };
  return {
    verifiedTerminalReceipts: new Map([[
      receipt.terminalReceiptDigest,
      resolvedReceipt,
    ]]),
    evaluatedAt: RECEIPT_EVALUATED_AT,
  };
}

function replaceProperty(owner, key, value) {
  const descriptor = objectGetOwnPropertyDescriptor(owner, key);
  reflectDefineProperty(owner, key, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) {
      reflectDefineProperty(owner, key, descriptor);
    } else {
      Reflect.deleteProperty(owner, key);
    }
  };
}

function canonicalizeForIntrinsicAttack(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeForIntrinsicAttack);
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeForIntrinsicAttack(value[key])]),
  );
}

function certificationEvidencePayload(report) {
  return {
    contractId: report.contractId,
    schemaVersion: report.schemaVersion,
    profileIdentity: report.profileIdentity,
    run: report.run,
    provenance: report.provenance,
    gates: report.gates,
    artifacts: report.artifacts,
    extensions: report.extensions,
  };
}

test('P0 report round-trips but cannot become scale certification', (t) => {
  const report = createScaleEvidenceReport(evidenceInput());
  const validation = validateScaleEvidenceReport(report);

  t.equal(validation.valid, true);
  t.equal(report.claimEligibility.profileEvidence, true);
  t.equal(report.claimEligibility.scaleCertification, false);
  t.match(report.claimEligibility.reasonCodes, [
    SCALE_CLAIM_REASON.DEVELOPMENT_PROFILE,
  ]);
  t.equal(report.profileIdentity, computeScaleProfileIdentity(report));
  t.equal(report.runIdentity, computeScaleRunIdentity(report));
  t.equal(report.reportIdentity, computeScaleReportIdentity(report));
  t.end();
});

test('profile identity is stable across extension and object-key order', (t) => {
  const first = createScaleEvidenceReport(evidenceInput());
  const reorderedHardware = {
    storageClass: first.hardware.storageClass,
    memoryBytes: first.hardware.memoryBytes,
    cpuCount: first.hardware.cpuCount,
    instanceClass: first.hardware.instanceClass,
    region: first.hardware.region,
    provider: first.hardware.provider,
  };
  const comparativeConsumer = createScaleEvidenceReport(evidenceInput({
    hardware: reorderedHardware,
    extensions: {
      comparativeEfficiency: {
        pairId: 'pair-001',
        alternative: 'postgres',
      },
    },
  }));

  t.equal(comparativeConsumer.profileIdentity, first.profileIdentity);
  t.not(comparativeConsumer.reportIdentity, first.reportIdentity);
  t.equal(validateScaleEvidenceReport(comparativeConsumer).valid, true);
  t.end();
});

test('verified live P1 terminal receipt is certification-eligible', (t) => {
  const baseInput = evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      id: 'p1-run-001',
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  });
  const input = attachReceipt(baseInput);
  const trust = trustReceipt(input);
  const report = createScaleEvidenceReport(input, trust);

  t.equal(report.claimEligibility.scaleCertification, true);
  t.same(report.claimEligibility.reasonCodes, []);
  t.equal(validateScaleEvidenceReport(report, trust).valid, true);
  t.equal(validateScaleEvidenceReport(report).valid, false);
  t.end();
});

test('scale owner withdraws eligibility at the receipt expiry boundary', (t) => {
  const input = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      id: 'p1-expiry-boundary',
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  }));
  const trust = trustReceipt(input);
  const report = createScaleEvidenceReport(input, trust);
  const expired = evaluateScaleClaimEligibility(report, {
    ...trust,
    evaluatedAt: RECEIPT_VALID_UNTIL,
  });

  t.equal(expired.scaleCertification, false);
  t.match(expired.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_EXPIRED,
  ]);
  t.equal(validateScaleEvidenceReport(report, {
    ...trust,
    evaluatedAt: RECEIPT_VALID_UNTIL,
  }).valid, false);
  t.end();
});

test('hostile Array methods cannot erase scale ineligibility reasons', (t) => {
  const p0 = createScaleEvidenceReport(evidenceInput());
  const attachedP0Input = attachReceipt(evidenceInput());
  const unverifiedInput = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  }));
  const unverified = createScaleEvidenceReport(unverifiedInput);
  const failingGates = passingGates();
  failingGates.safety.status = SCALE_GATE_STATUS.FAIL;
  const failingInput = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
    gates: failingGates,
  }));
  const failingTrust = trustReceipt(failingInput);
  const failing = createScaleEvidenceReport(failingInput, failingTrust);

  const restorations = [
    replaceProperty(Array.prototype, 'push', function noPush() {
      return this.length;
    }),
    replaceProperty(Array.prototype, 'every', () => true),
    replaceProperty(Array.prototype, Symbol.iterator, function empty() {
      return {next: () => ({done: true})};
    }),
  ];
  let p0Decision;
  let unverifiedDecision;
  let failingDecision;
  let p0CreationError = null;
  try {
    p0Decision = evaluateScaleClaimEligibility(p0);
    unverifiedDecision = evaluateScaleClaimEligibility(unverified);
    failingDecision = evaluateScaleClaimEligibility(failing, failingTrust);
    try {
      createScaleEvidenceReport(attachedP0Input);
    } catch (error) {
      p0CreationError = error;
    }
  } finally {
    for (
      let restoreIndex = restorations.length - 1;
      restoreIndex >= 0;
      restoreIndex -= 1
    ) {
      restorations[restoreIndex]();
    }
  }

  t.equal(p0Decision.scaleCertification, false);
  t.match(p0Decision.reasonCodes, [
    SCALE_CLAIM_REASON.DEVELOPMENT_PROFILE,
    SCALE_CLAIM_REASON.NON_LIVE_FIDELITY,
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_ABSENT,
  ]);
  t.equal(unverifiedDecision.scaleCertification, false);
  t.match(unverifiedDecision.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED,
  ]);
  t.equal(failingDecision.scaleCertification, false);
  t.match(failingDecision.reasonCodes, [
    SCALE_CLAIM_REASON.REQUIRED_GATE_NOT_PASSING,
  ]);
  t.match(
    p0CreationError?.message,
    /certification\.receiptState:p0_cannot_attach/u,
  );
  t.end();
});

test('hostile JSON and Object keys cannot replay changed evidence', (t) => {
  const input = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  }));
  const trust = trustReceipt(input);
  const source = createScaleEvidenceReport(input, trust);
  const sourceBytes = JSON.stringify(canonicalizeForIntrinsicAttack(
    certificationEvidencePayload(source),
  ));
  const changed = structuredClone(source);
  changed.provenance.unboundTamper = 'different-evidence';
  const objectKeys = Object.keys;

  const clean = evaluateScaleClaimEligibility(changed, trust);
  const restoreStringify = replaceProperty(
    JSON,
    'stringify',
    () => sourceBytes,
  );
  let jsonPolluted;
  try {
    jsonPolluted = evaluateScaleClaimEligibility(changed, trust);
  } finally {
    restoreStringify();
  }
  const restoreKeys = replaceProperty(Object, 'keys', (value) => {
    const keys = objectKeys(value);
    if (value !== changed.provenance) return keys;
    return keys.filter((key) => key !== 'unboundTamper');
  });
  let objectPolluted;
  try {
    objectPolluted = evaluateScaleClaimEligibility(changed, trust);
  } finally {
    restoreKeys();
  }

  for (const decision of [clean, jsonPolluted, objectPolluted]) {
    t.equal(decision.scaleCertification, false);
    t.match(decision.reasonCodes, [
      SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
    ]);
  }
  t.end();
});

test('captured collection methods and clean prototypes preserve currentness',
  (t) => {
    const input = attachReceipt(evidenceInput({
      profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
      run: {
        ...evidenceInput().run,
        fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
      },
    }));
    const trust = trustReceipt(input);
    const report = createScaleEvidenceReport(input, trust);
    const restorations = [
      replaceProperty(Array.prototype, 'map', () => []),
      replaceProperty(Array.prototype, 'sort', () => []),
      replaceProperty(Array.prototype, 'toJSON', () => 'polluted'),
      replaceProperty(Map.prototype, 'has', () => false),
      replaceProperty(Map.prototype, 'get', () => ({forged: true})),
      replaceProperty(Set.prototype, 'add', () => new Set()),
      replaceProperty(Set.prototype, 'has', () => false),
      replaceProperty(Object.prototype, 'toJSON', () => 'polluted'),
    ];
    let decision;
    let validation;
    try {
      decision = evaluateScaleClaimEligibility(report, trust);
      validation = validateScaleEvidenceReport(report, trust);
    } finally {
      for (
        let restoreIndex = restorations.length - 1;
        restoreIndex >= 0;
        restoreIndex -= 1
      ) {
        restorations[restoreIndex]();
      }
    }

    t.equal(decision.scaleCertification, true);
    t.same(decision.reasonCodes, []);
    t.equal(validation.valid, true);
    t.end();
  });

test('claim evaluation rejects accessors, proxies, and inherited fields',
  (t) => {
    const input = attachReceipt(evidenceInput({
      profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
      run: {
        ...evidenceInput().run,
        fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
      },
    }));
    const trust = trustReceipt(input);
    const source = createScaleEvidenceReport(input, trust);

    const provenanceAccessor = structuredClone(source);
    let provenanceAccessorReads = 0;
    reflectDefineProperty(provenanceAccessor.provenance, 'producer', {
      configurable: true,
      enumerable: true,
      get() {
        provenanceAccessorReads += 1;
        return source.provenance.producer;
      },
    });
    const gateAccessor = structuredClone(source);
    let gateAccessorReads = 0;
    reflectDefineProperty(gateAccessor.gates.safety, 'status', {
      configurable: true,
      enumerable: true,
      get() {
        gateAccessorReads += 1;
        return SCALE_GATE_STATUS.PASS;
      },
    });
    const inheritedProfile = structuredClone(source);
    inheritedProfile.profile = Object.create({
      id: SCALE_PROFILE_ID.INTEGRATION,
      version: 1,
    });
    let reportProxyTrapCalls = 0;
    const reportProxy = new Proxy(source, {
      getPrototypeOf() {
        reportProxyTrapCalls += 1;
        throw new TypeError('hostile report');
      },
    });
    const nestedProxy = structuredClone(source);
    let nestedProxyTrapCalls = 0;
    nestedProxy.gates = new Proxy(nestedProxy.gates, {
      getPrototypeOf() {
        nestedProxyTrapCalls += 1;
        throw new TypeError('hostile gates');
      },
    });

    const decisions = [
      evaluateScaleClaimEligibility(provenanceAccessor, trust),
      evaluateScaleClaimEligibility(gateAccessor, trust),
      evaluateScaleClaimEligibility(inheritedProfile, trust),
      evaluateScaleClaimEligibility(reportProxy, trust),
      evaluateScaleClaimEligibility(nestedProxy, trust),
    ];
    for (const decision of decisions) {
      t.equal(decision.scaleCertification, false);
      t.match(decision.reasonCodes, [
        SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
      ]);
    }
    t.equal(provenanceAccessorReads, 0);
    t.equal(gateAccessorReads, 0);
    t.equal(reportProxyTrapCalls, 0);
    t.equal(nestedProxyTrapCalls, 0);
    t.end();
  });

test('report validation and eligibility reject unbound hostile data', (t) => {
  const input = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      id: 'p1-hostile-report-boundary',
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  }));
  const trust = trustReceipt(input);
  const source = createScaleEvidenceReport(input, trust);

  const inheritedProvenance = structuredClone(source);
  inheritedProvenance.provenance =
    Object.create(structuredClone(source.provenance));
  const inheritedDecision =
    evaluateScaleClaimEligibility(inheritedProvenance, trust);
  const inheritedValidation =
    validateScaleEvidenceReport(inheritedProvenance, trust);

  const staleProfileIdentity = structuredClone(source);
  staleProfileIdentity.hardware.instanceClass = 'tampered-instance-class';
  const staleDecision =
    evaluateScaleClaimEligibility(staleProfileIdentity, trust);

  const accessorReport = structuredClone(source);
  let accessorReads = 0;
  reflectDefineProperty(accessorReport.provenance, 'producer', {
    configurable: true,
    enumerable: true,
    get() {
      accessorReads += 1;
      return source.provenance.producer;
    },
  });
  const accessorValidation =
    validateScaleEvidenceReport(accessorReport, trust);

  let proxyTrapCalls = 0;
  const proxyReport = new Proxy(source, {
    get() {
      proxyTrapCalls += 1;
      throw new TypeError('hostile report getter');
    },
  });
  let proxyValidation;
  t.doesNotThrow(() => {
    proxyValidation = validateScaleEvidenceReport(proxyReport, trust);
  });

  t.equal(inheritedDecision.scaleCertification, false);
  t.equal(inheritedValidation.valid, false);
  t.equal(staleDecision.scaleCertification, false);
  t.equal(accessorValidation.valid, false);
  t.equal(proxyValidation.valid, false);
  t.equal(accessorReads, 0, 'validation never executes nested accessors');
  t.equal(proxyTrapCalls, 0, 'validation rejects proxies before get traps');
  t.end();
});

test('numeric predicates and digests reject ambiguous edge values', (t) => {
  const unsafeInteger = Number.MAX_SAFE_INTEGER + 1;
  t.equal(isNonNegativeNumber(-0), false);
  t.equal(isNonNegativeInteger(-0), false);
  t.equal(isNonNegativeInteger(unsafeInteger), false);
  t.equal(isPositiveInteger(unsafeInteger), false);
  t.throws(
    () => computeScaleEvidenceDigest({value: -0}),
    /canonicalization:number_not_canonical/u,
  );
  t.throws(
    () => computeScaleEvidenceDigest({value: unsafeInteger}),
    /canonicalization:number_not_canonical/u,
  );
  t.end();
});

test('receipt resolution ignores Map subclass and prototype overrides', (t) => {
  const input = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      id: 'p1-hostile-map-resolution',
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  }));
  const trust = trustReceipt(input);
  const report = createScaleEvidenceReport(input, trust);
  class HostileReceiptMap extends Map {
    has() {
      return true;
    }

    get() {
      return {forged: true};
    }
  }
  const populatedSubclass = new HostileReceiptMap(
    trust.verifiedTerminalReceipts,
  );
  const emptySubclass = new HostileReceiptMap();
  const accessorOptions = {...trust};
  let accessorReads = 0;
  reflectDefineProperty(accessorOptions, 'verifiedTerminalReceipts', {
    configurable: true,
    enumerable: true,
    get() {
      accessorReads += 1;
      return trust.verifiedTerminalReceipts;
    },
  });
  const evaluationAccessorOptions = {...trust};
  let evaluationAccessorReads = 0;
  reflectDefineProperty(evaluationAccessorOptions, 'evaluatedAt', {
    configurable: true,
    enumerable: true,
    get() {
      evaluationAccessorReads += 1;
      return RECEIPT_EVALUATED_AT;
    },
  });
  let proxyTrapCalls = 0;
  const proxyOptions = new Proxy(trust, {
    getOwnPropertyDescriptor() {
      proxyTrapCalls += 1;
      throw new TypeError('hostile receipt options');
    },
  });
  const originalHas =
    objectGetOwnPropertyDescriptor(Map.prototype, 'has');
  const originalGet =
    objectGetOwnPropertyDescriptor(Map.prototype, 'get');
  let populated;
  let empty;
  let accessor;
  let evaluationAccessor;
  let proxy;
  try {
    reflectDefineProperty(Map.prototype, 'has', {
      configurable: true,
      writable: true,
      value: () => false,
    });
    reflectDefineProperty(Map.prototype, 'get', {
      configurable: true,
      writable: true,
      value: () => ({forged: true}),
    });
    populated = evaluateScaleClaimEligibility(report, {
      ...trust,
      verifiedTerminalReceipts: populatedSubclass,
    });
    empty = evaluateScaleClaimEligibility(report, {
      ...trust,
      verifiedTerminalReceipts: emptySubclass,
    });
    accessor = evaluateScaleClaimEligibility(report, accessorOptions);
    evaluationAccessor = evaluateScaleClaimEligibility(
      report,
      evaluationAccessorOptions,
    );
    proxy = evaluateScaleClaimEligibility(report, proxyOptions);
  } finally {
    reflectDefineProperty(Map.prototype, 'get', originalGet);
    reflectDefineProperty(Map.prototype, 'has', originalHas);
  }

  t.equal(populated.scaleCertification, true);
  t.same(populated.reasonCodes, []);
  t.equal(empty.scaleCertification, false);
  t.match(empty.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED,
  ]);
  t.equal(accessor.scaleCertification, false);
  t.match(accessor.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED,
  ]);
  t.equal(evaluationAccessor.scaleCertification, false);
  t.match(evaluationAccessor.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_EVALUATION_TIME_REQUIRED,
  ]);
  t.equal(proxy.scaleCertification, false);
  t.match(proxy.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED,
  ]);
  t.equal(accessorReads, 0, 'option accessors are never executed');
  t.equal(
    evaluationAccessorReads,
    0,
    'evaluation-time accessors are never executed',
  );
  t.equal(proxyTrapCalls, 0, 'option proxies are rejected before traps');
  t.end();
});

test('attached but unverified P1 receipt cannot promote a claim', (t) => {
  const baseInput = evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      id: 'p1-candidate-001',
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  });
  const report = createScaleEvidenceReport(attachReceipt(baseInput, {
    questId: 'forged-terminal',
  }));

  t.equal(report.claimEligibility.scaleCertification, false);
  t.match(report.claimEligibility.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED,
  ]);
  t.equal(validateScaleEvidenceReport(report).valid, true);
  t.end();
});

test('trusted receipt cannot replay across a different profile', (t) => {
  const sourceBase = evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      id: 'p1-trusted-source',
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  });
  const firstInput = attachReceipt(sourceBase);
  const trust = trustReceipt(firstInput);
  const first = createScaleEvidenceReport(firstInput, trust);

  const replayInput = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      id: 'p1-replay-target',
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
    hardware: {
      ...evidenceInput().hardware,
      instanceClass: 'different-hardware-class',
    },
  }));
  const replay = createScaleEvidenceReport(replayInput, trust);
  const questReplay = createScaleEvidenceReport(attachReceipt(sourceBase, {
    questId: 'different-certification-quest',
  }), trust);

  t.equal(first.claimEligibility.scaleCertification, true);
  t.equal(replay.claimEligibility.scaleCertification, false);
  t.match(replay.claimEligibility.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED,
  ]);
  t.equal(questReplay.claimEligibility.scaleCertification, false);
  t.match(questReplay.claimEligibility.reasonCodes, [
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED,
  ]);
  t.end();
});

test('trusted receipt cannot replay after a gate-status change', (t) => {
  const sourceInput = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
  }));
  const trust = trustReceipt(sourceInput);
  const changedGates = passingGates();
  changedGates.performance.status = SCALE_GATE_STATUS.NOT_MEASURED;
  const changedInput = attachReceipt(evidenceInput({
    profile: {id: SCALE_PROFILE_ID.INTEGRATION, version: 1},
    run: {
      ...evidenceInput().run,
      fidelity: SCALE_EVIDENCE_FIDELITY.LIVE,
    },
    gates: changedGates,
  }));
  const changed = createScaleEvidenceReport(changedInput, trust);

  t.equal(changed.claimEligibility.scaleCertification, false);
  t.match(changed.claimEligibility.reasonCodes, [
    SCALE_CLAIM_REASON.REQUIRED_GATE_NOT_PASSING,
    SCALE_CLAIM_REASON.TERMINAL_CERTIFICATION_UNVERIFIED,
  ]);
  t.end();
});

test('missing hardware identity is rejected before report creation', (t) => {
  const input = evidenceInput();
  delete input.hardware.region;
  t.throws(
    () => createScaleEvidenceReport(input),
    /hardware\.region:required/u,
  );
  t.end();
});

test('missing artifact provenance is rejected before report creation', (t) => {
  const input = evidenceInput();
  delete input.provenance.artifactManifestDigest;
  t.throws(
    () => createScaleEvidenceReport(input),
    /provenance\.artifactManifestDigest:sha256_required/u,
  );
  t.end();
});

test('absent receipt variant rejects nullable receipt fields', (t) => {
  const input = evidenceInput({
    certification: {
      receiptState: SCALE_CERTIFICATION_RECEIPT_STATE.ABSENT,
      questId: null,
      terminalReceiptDigest: null,
    },
  });
  t.throws(
    () => createScaleEvidenceReport(input),
    /certification\.questId:forbidden_when_absent/u,
  );
  t.end();
});

test('tampered identities and claim promotion are rejected', (t) => {
  const report = createScaleEvidenceReport(evidenceInput());
  const identityTamper = structuredClone(report);
  identityTamper.hardware.cpuCount += 1;
  t.match(validateScaleEvidenceReport(identityTamper).errors, [
    'profileIdentity:mismatch',
  ]);

  const claimTamper = structuredClone(report);
  claimTamper.claimEligibility = {
    profileEvidence: true,
    scaleCertification: true,
    reasonCodes: [],
  };
  t.match(validateScaleEvidenceReport(claimTamper).errors, [
    'claimEligibility:mismatch',
  ]);

  const gateTamper = structuredClone(report);
  gateTamper.gates.performance.p99LatencyMs += 1;
  t.match(validateScaleEvidenceReport(gateTamper).errors, [
    'reportIdentity:mismatch',
  ]);
  t.end();
});

test('bad artifact digest and incomplete convergence fields are rejected', (t) => {
  const report = createScaleEvidenceReport(evidenceInput());
  report.artifacts[0].digest = 'sha256:not-a-digest';
  delete report.gates.convergence.confidenceInterval;

  const result = validateScaleEvidenceReport(report);
  t.equal(result.valid, false);
  t.match(result.errors, [
    'gates.convergence.confidenceInterval:object_required',
    'artifacts.0.digest:sha256_required',
  ]);
  t.end();
});

test('gate evidence must resolve to a declared artifact', (t) => {
  const input = evidenceInput();
  input.gates.performance.evidenceArtifactDigest = DIGEST_C;
  t.throws(
    () => createScaleEvidenceReport(input),
    /gates\.performance\.evidenceArtifactDigest:artifact_not_found/u,
  );
  t.end();
});

test('passing feasibility and safety gates reject contradictory payloads',
  (t) => {
    const infeasible = evidenceInput();
    infeasible.gates.feasibility.reasonCodes = ['insufficient_capacity'];
    t.throws(
      () => createScaleEvidenceReport(infeasible),
      /gates\.feasibility\.reasonCodes:pass_requires_empty/u,
    );

    const unsafe = evidenceInput();
    unsafe.gates.safety.violationCount = 1;
    t.throws(
      () => createScaleEvidenceReport(unsafe),
      /gates\.safety\.violationCount:pass_requires_zero/u,
    );
    t.end();
  });

test('run completion cannot precede run start', (t) => {
  const input = evidenceInput({
    run: {
      ...evidenceInput().run,
      completedAt: '2026-07-26T09:59:59.000Z',
    },
  });
  t.throws(
    () => createScaleEvidenceReport(input),
    /run\.completedAt:precedes_startedAt/u,
  );
  t.end();
});

test('P0 cannot self-declare a certified state', (t) => {
  const input = evidenceInput({
    certification: {
      receiptState: SCALE_CERTIFICATION_RECEIPT_STATE.ATTACHED,
      questId: 'not-authorized',
      terminalReceiptDigest: DIGEST_A,
      profileIdentity: DIGEST_B,
      evidenceIdentity: DIGEST_C,
    },
  });
  t.throws(
    () => createScaleEvidenceReport(input),
    /certification\.receiptState:p0_cannot_attach/u,
  );
  t.end();
});
