import {test} from '../../../../src/test-helpers/tap.js';
import {
  SCALE_CERTIFICATION_RECEIPT_STATE,
  SCALE_CLAIM_REASON,
  SCALE_EVIDENCE_CONTRACT_ID,
  SCALE_EVIDENCE_FIDELITY,
  SCALE_EVIDENCE_SCHEMA_VERSION,
  SCALE_GATE_STATUS,
  SCALE_PROFILE_ID,
  computeScaleCertificationEvidenceIdentity,
  computeScaleEvidenceDigest,
  computeScaleProfileIdentity,
  computeScaleReportIdentity,
  computeScaleRunIdentity,
  createScaleEvidenceReport,
  validateScaleEvidenceReport,
} from '../scale-evidence-contract.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
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
  terminalReceiptDigest = DIGEST_B,
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
  return {
    verifiedTerminalReceipts: new Map([[
      receipt.terminalReceiptDigest,
      {
        questId: receipt.questId,
        profileIdentity: receipt.profileIdentity,
        evidenceIdentity: receipt.evidenceIdentity,
      },
    ]]),
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
