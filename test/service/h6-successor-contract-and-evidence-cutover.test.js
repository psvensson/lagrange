import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {checkCurrentCapabilities} from
  '../../scripts/check-current-capabilities.js';
import {checkServicePortabilityClaimsContract} from
  '../../scripts/checks/service-portability-claims-contract.js';
import {runServiceCommand} from '../../src/cli/service-command-router.js';
import {runGenerate} from '../../src/cli/service-pipeline-command.js';
import {
  STANDARD_HTTP_ACCEPTANCE_ERROR_CODE,
  STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID,
  STANDARD_HTTP_RECEIPT_ID,
  STANDARD_HTTP_REQUIRED_RECEIPT_IDS,
  validateStandardHttpAcceptanceReport,
} from '../../src/service/index.js';
import {
  assertSuccessorServiceArtifact,
} from '../../src/service/service-deployment-record-generator.js';

const TEMP_DIR_PREFIX = 'lagrange-h6-cutover-';
const HONO_SERVICE_NAME = 'hono-cutover-svc';
const HONO_FLAG = '--framework';
const HONO_VALUE = 'hono';
const INIT_SUBCOMMAND = 'init';
const TYPINGS_FILE = 'runtime-types.d.ts';
const NODE_MODULES_DIR = 'node_modules';
const SYMLINK_TYPE_DIR = 'dir';
const REFERENCE_DOC_PATH = 'docs/reference/javascript-service-reference.md';
const UTF8_ENCODING = 'utf8';
const SUCCESS_EXIT_CODE = 0;
const LEGACY_REFUSAL_CODE = 'legacy_artifact_rebuild_required';
const LEGACY_ABI_UNSUPPORTED_CODE = 'legacy_artifact_abi_unsupported';
const SAMPLE_COMMIT = 'ea48edd65e5bcf1892b72e84413184f6466a4488';
const SAMPLE_DIGEST = `sha256:${'a'.repeat(64)}`;

function createValidReceipt(extraObservations = {}) {
  return {
    artifactDigest: SAMPLE_DIGEST,
    completeReduction: true,
    droppedContributions: 0,
    executionRuntime: 'wasm_component',
    failureRecords: [{code: 'expected_refusal_verified'}],
    loadedFromArtifactPayloadStore: true,
    observations: {
      capabilityCheckerValid: true,
      legacyArtifactRefused: true,
      legacyRefusalCode: LEGACY_REFUSAL_CODE,
      scaffoldTypingsConsistent: true,
      ...extraObservations,
    },
    oracle: {matched: true},
    sourceCommit: SAMPLE_COMMIT,
    wasmComponentExecuted: true,
  };
}

function createValidAcceptanceReport() {
  const receipts = {};
  for (const receiptId of STANDARD_HTTP_REQUIRED_RECEIPT_IDS) {
    receipts[receiptId] = createValidReceipt();
  }
  return {
    performance: {status: 'unmeasured'},
    receipts,
    scenario: STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID,
  };
}

describe('H6 successor contract and evidence cutover (Section 7.2)', () => {
  it('scaffolds a Hono Fetch service via CLI init --framework hono, reproduces typings byte-identically, and refuses legacy artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), TEMP_DIR_PREFIX));
    try {
      const projectDir = path.join(root, HONO_SERVICE_NAME);
      const exitCode = await runServiceCommand([
        INIT_SUBCOMMAND,
        projectDir,
        HONO_FLAG,
        HONO_VALUE,
      ]);
      assert.equal(exitCode, SUCCESS_EXIT_CODE);

      await symlink(
        path.join(process.cwd(), NODE_MODULES_DIR),
        path.join(projectDir, NODE_MODULES_DIR),
        SYMLINK_TYPE_DIR,
      );

      const scaffoldedTypings = await readFile(
        path.join(projectDir, TYPINGS_FILE),
        UTF8_ENCODING,
      );
      assert.ok(scaffoldedTypings.includes('LagrangeRequestClient'));
      assert.ok(scaffoldedTypings.includes('LagrangeEnv'));

      const generated = await runGenerate({projectDirectory: projectDir});
      const regeneratedTypings = await readFile(
        path.join(projectDir, TYPINGS_FILE),
        UTF8_ENCODING,
      );
      assert.equal(regeneratedTypings, scaffoldedTypings);

      assert.equal(
        assertSuccessorServiceArtifact({
          bindings: generated.records.bindings,
          manifest: generated.records.manifest,
        }),
        true,
      );

      assert.throws(
        () => assertSuccessorServiceArtifact({
          bindings: [{
            name: 'legacy--request--route',
            source: {kind: 'request', method: 'POST', path: '/legacy'},
            target: {export: 'handle-request'},
          }],
          manifest: {
            exports: [{interface: 'lagrange:service-cell/handle-request@0.1.0'}],
            name: 'legacy',
          },
        }),
        (err) => err?.code === LEGACY_ABI_UNSUPPORTED_CODE,
      );
    } finally {
      await rm(root, {force: true, recursive: true});
    }
  });

  it('verifies capability producer/checker, portability claims, and reference documentation consistency', async () => {
    const capabilitiesVerdict = checkCurrentCapabilities();
    assert.equal(
      capabilitiesVerdict.valid,
      true,
      capabilitiesVerdict.problems.join('\n'),
    );

    const portabilityVerdict = checkServicePortabilityClaimsContract();
    assert.equal(
      portabilityVerdict.valid,
      true,
      portabilityVerdict.problems.join('\n'),
    );

    const referenceDoc = await readFile(
      path.join(process.cwd(), REFERENCE_DOC_PATH),
      UTF8_ENCODING,
    );
    assert.ok(referenceDoc.includes('lagrange-server/authoring'));
    assert.ok(referenceDoc.includes('c.env.lagrange.call'));
    assert.ok(referenceDoc.includes(LEGACY_REFUSAL_CODE));
  });

  it('validates the 6 required standard-http-service-api-acceptance receipt families and fails closed on synthetic or incomplete evidence', () => {
    const validReport = createValidAcceptanceReport();
    const accepted = validateStandardHttpAcceptanceReport(validReport);
    assert.equal(accepted.valid, true);
    assert.equal(accepted.violations.length, 0);

    // 1. Missing receipt family
    const missingFamilyReport = createValidAcceptanceReport();
    delete missingFamilyReport.receipts[
      STANDARD_HTTP_RECEIPT_ID.FETCH_HTTP_SEMANTICS
    ];
    const missingRes = validateStandardHttpAcceptanceReport(missingFamilyReport);
    assert.equal(missingRes.valid, false);
    assert.ok(missingRes.violations.some((v) =>
      v.code === STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.MISSING_RECEIPT_FAMILY));

    // 2. Handwritten summary without provenance
    const handwrittenReport = createValidAcceptanceReport();
    handwrittenReport.receipts[
      STANDARD_HTTP_RECEIPT_ID.PINNED_TOOLCHAIN_HONO_COMPONENT
    ] = {
      artifactDigest: '',
      executionRuntime: 'wasm_component',
      failureRecords: [],
      observations: {},
      oracle: null,
      passed: true,
      sourceCommit: '',
      wasmComponentExecuted: true,
    };
    const handwrittenRes =
      validateStandardHttpAcceptanceReport(handwrittenReport);
    assert.equal(handwrittenRes.valid, false);
    assert.ok(handwrittenRes.violations.some((v) =>
      v.code === STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.HANDWRITTEN_SUMMARY_REJECTED));

    // 3. Node guest substituted for compiled WASM component
    const nodeGuestReport = createValidAcceptanceReport();
    nodeGuestReport.receipts[
      STANDARD_HTTP_RECEIPT_ID.COMPILED_PUBLIC_HONO_JOURNEY
    ].executionRuntime = 'node';
    const nodeGuestRes = validateStandardHttpAcceptanceReport(nodeGuestReport);
    assert.equal(nodeGuestRes.valid, false);
    assert.ok(nodeGuestRes.violations.some((v) =>
      v.code ===
        STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.NODE_GUEST_SUBSTITUTION_REJECTED));

    // 4. Dropped contributions
    const droppedReport = createValidAcceptanceReport();
    droppedReport.receipts[
      STANDARD_HTTP_RECEIPT_ID.COMPILED_PUBLIC_HONO_JOURNEY
    ].droppedContributions = 2;
    const droppedRes = validateStandardHttpAcceptanceReport(droppedReport);
    assert.equal(droppedRes.valid, false);
    assert.ok(droppedRes.violations.some((v) =>
      v.code ===
        STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.DROPPED_CONTRIBUTIONS_REJECTED));

    // 5. Bypassed ArtifactPayloadStore
    const bypassedStoreReport = createValidAcceptanceReport();
    bypassedStoreReport.receipts[
      STANDARD_HTTP_RECEIPT_ID.COMPILED_PUBLIC_HONO_JOURNEY
    ].loadedFromArtifactPayloadStore = false;
    const bypassedRes =
      validateStandardHttpAcceptanceReport(bypassedStoreReport);
    assert.equal(bypassedRes.valid, false);
    assert.ok(bypassedRes.violations.some((v) =>
      v.code ===
        STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.BYPASSED_ARTIFACT_STORAGE_REJECTED));

    // 6. Legacy artifact not refused in successor-contract-cutover
    const unrefusedLegacyReport = createValidAcceptanceReport();
    unrefusedLegacyReport.receipts[
      STANDARD_HTTP_RECEIPT_ID.SUCCESSOR_CONTRACT_CUTOVER
    ].observations.legacyArtifactRefused = false;
    const unrefusedRes =
      validateStandardHttpAcceptanceReport(unrefusedLegacyReport);
    assert.equal(unrefusedRes.valid, false);
    assert.ok(unrefusedRes.violations.some((v) =>
      v.code ===
        STANDARD_HTTP_ACCEPTANCE_ERROR_CODE.LEGACY_ARTIFACT_NOT_REFUSED));

    // 7. Unmeasured numeric performance claim without lab/GCP comparator receipt
    const fakePerfReport = createValidAcceptanceReport();
    fakePerfReport.performance = {
      coldStartMs: 1.5,
      status: 'unmeasured',
    };
    const fakePerfRes = validateStandardHttpAcceptanceReport(fakePerfReport);
    assert.equal(fakePerfRes.valid, false);
    assert.ok(fakePerfRes.violations.some((v) =>
      v.code ===
        STANDARD_HTTP_ACCEPTANCE_ERROR_CODE
          .UNMEASURED_PERFORMANCE_CLAIM_REJECTED));
  });
});
