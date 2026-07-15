import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  OCI_HOST_AGENT_DURABILITY_POINT,
  OCI_HOST_AGENT_DURABLE_ERROR,
  initializeOciHostAgentReceiptLedger,
  openOciHostAgentReceiptLedger,
} from '../../src/runtime/oci-host-agent-receipt-ledger.js';
import {OciHostAgentDurableStateError} from
  '../../src/runtime/oci-host-agent-durable-errors.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`;
const LEDGER_ROOT_ID = '1'.repeat(64);
const ENROLLMENT_ID = '2'.repeat(64);
const INVALID_LOCK_TOKEN = 'invalid-lock-token';
const LOCK_RELEASE_FAILURE_KIND = 'lock_release_failed';
const IDENTITY = Object.freeze({
  clusterIncarnation: 'cluster-1',
  nodeId: 'node-1',
  serviceId: 'service-1',
  revisionId: 'revision-1',
  instanceId: 'instance-1',
});

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oci-agent-ledger-'));
}

function configuration(root, overrides = {}) {
  return {
    root,
    clusterIncarnation: IDENTITY.clusterIncarnation,
    ledgerRootId: LEDGER_ROOT_ID,
    enrollmentId: ENROLLMENT_ID,
    maximumReceipts: 2,
    maximumNoncesPerKey: 2,
    ...overrides,
  };
}

function acceptedOperation(overrides = {}) {
  return {
    operationId: `oci-v1:${'3'.repeat(64)}`,
    intentDigest: DIGEST,
    operation: 'create',
    identity: IDENTITY,
    ...overrides,
  };
}

function rejectedResult() {
  return {
    status: 'rejected',
    operation: 'create',
    intentDigest: DIGEST,
    identity: IDENTITY,
    cleanup: {state: 'not_required', residualResources: []},
    errorCode: 'policy_denied',
  };
}

function initialize(root, overrides = {}) {
  return initializeOciHostAgentReceiptLedger(configuration(root, overrides));
}

describe('OCI host-agent durable receipt ledger', () => {
  it('holds one exclusive volume lock and validates the configured roots', () => {
    const root = temporaryRoot();
    initialize(root);
    const ledger = openOciHostAgentReceiptLedger(configuration(root));
    assert.throws(
      () => openOciHostAgentReceiptLedger(configuration(root)),
      (error) => error.code === OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE,
    );
    ledger.close();

    assert.throws(
      () => openOciHostAgentReceiptLedger(configuration(root, {
        ledgerRootId: '9'.repeat(64),
      })),
      (error) => error.code === OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    fs.rmSync(root, {recursive: true, force: true});

    const missing = path.join(temporaryRoot(), 'missing-ledger');
    assert.throws(
      () => openOciHostAgentReceiptLedger(configuration(missing)),
      (error) => error.code ===
        OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
    );
    fs.rmSync(path.dirname(missing), {recursive: true, force: true});
  });

  it('durably rejects replay and permanently latches a saturated key', () => {
    const root = temporaryRoot();
    initialize(root);
    let ledger = openOciHostAgentReceiptLedger(configuration(root));
    assert.equal(ledger.admitNonce({
      keyId: 'node-key-1',
      nonce: Buffer.alloc(32, 1).toString('base64'),
      expiresAtMs: 10_000,
      nowMs: 1_000,
    }).status, 'accepted');
    assert.equal(ledger.admitNonce({
      keyId: 'node-key-1',
      nonce: Buffer.alloc(32, 1).toString('base64'),
      expiresAtMs: 10_000,
      nowMs: 1_001,
    }).status, 'replayed');
    assert.equal(ledger.admitNonce({
      keyId: 'node-key-1',
      nonce: Buffer.alloc(32, 2).toString('base64'),
      expiresAtMs: 10_000,
      nowMs: 1_002,
    }).status, 'accepted');
    assert.equal(ledger.admitNonce({
      keyId: 'node-key-1',
      nonce: Buffer.alloc(32, 3).toString('base64'),
      expiresAtMs: 10_000,
      nowMs: 1_003,
    }).status, 'saturated');
    ledger.close();

    ledger = openOciHostAgentReceiptLedger(configuration(root));
    assert.equal(ledger.admitNonce({
      keyId: 'node-key-1',
      nonce: Buffer.alloc(32, 4).toString('base64'),
      expiresAtMs: 20_000,
      nowMs: 11_000,
    }).status, 'saturated');
    ledger.close();
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('binds receipts to exact intent and retains unresolved mutation fences', () => {
    const root = temporaryRoot();
    initialize(root);
    let ledger = openOciHostAgentReceiptLedger(configuration(root));
    const accepted = ledger.acceptOperation(acceptedOperation());
    assert.equal(accepted.status, 'accepted');
    assert.equal(
      ledger.acceptOperation(acceptedOperation()).status,
      'existing',
    );
    assert.throws(
      () => ledger.acceptOperation(acceptedOperation({intentDigest: OTHER_DIGEST})),
      (error) => error.code === OCI_HOST_AGENT_DURABLE_ERROR.INTENT_CONFLICT,
    );

    const mutation = ledger.beginMutation({
      operationId: accepted.receipt.operationId,
      expectedGeneration: accepted.receipt.generation,
    });
    assert.equal(mutation.receipt.state, 'mutation_unresolved');
    assert.equal(mutation.fence.identity.instanceId, IDENTITY.instanceId);
    ledger.close();

    ledger = openOciHostAgentReceiptLedger(configuration(root));
    assert.equal(
      ledger.readOperation(accepted.receipt.operationId).state,
      'mutation_unresolved',
    );
    assert.throws(
      () => ledger.beginMutation({
        operationId: accepted.receipt.operationId,
        expectedGeneration: mutation.receipt.generation,
      }),
      (error) => error.code === OCI_HOST_AGENT_DURABLE_ERROR.RESOURCE_FENCED,
    );
    assert.throws(
      () => ledger.completeOperation({
        operationId: accepted.receipt.operationId,
        expectedGeneration: mutation.receipt.generation,
        fenceToken: mutation.fence.token,
        result: rejectedResult(),
      }),
      (error) => error.code === OCI_HOST_AGENT_DURABLE_ERROR.RESOURCE_FENCED,
      'restart cannot reuse the persisted token as same-process settlement authority',
    );
    ledger.close();
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('atomically records a terminal result and removes only its held fence', () => {
    const root = temporaryRoot();
    initialize(root);
    let ledger = openOciHostAgentReceiptLedger(configuration(root));
    const accepted = ledger.acceptOperation(acceptedOperation()).receipt;
    const mutation = ledger.beginMutation({
      operationId: accepted.operationId,
      expectedGeneration: accepted.generation,
    });
    const completed = ledger.completeOperation({
      operationId: accepted.operationId,
      expectedGeneration: mutation.receipt.generation,
      fenceToken: mutation.fence.token,
      result: rejectedResult(),
    });
    assert.equal(completed.state, 'terminal');
    assert.deepEqual(completed.result, rejectedResult());
    ledger.close();

    ledger = openOciHostAgentReceiptLedger(configuration(root));
    assert.deepEqual(
      ledger.readOperation(accepted.operationId).result,
      rejectedResult(),
    );
    assert.equal(ledger.readFence(IDENTITY), undefined);
    ledger.close();
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('fsyncs a non-dispatch terminal branch without installing a fence', () => {
    const root = temporaryRoot();
    initialize(root);
    const ledger = openOciHostAgentReceiptLedger(configuration(root));
    const accepted = ledger.acceptOperation(acceptedOperation()).receipt;
    const completed = ledger.completeWithoutMutation({
      operationId: accepted.operationId,
      expectedGeneration: accepted.generation,
      result: rejectedResult(),
    });
    assert.equal(completed.state, 'terminal');
    assert.equal(ledger.readFence(IDENTITY), undefined);
    ledger.close();
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('fails closed at every generation and manifest durability boundary', () => {
    for (const point of Object.values(OCI_HOST_AGENT_DURABILITY_POINT)) {
      const root = temporaryRoot();
      initialize(root);
      const ledger = openOciHostAgentReceiptLedger(configuration(root, {
        fault: (current) => {
          if (current === point) throw new Error(`crash:${point}`);
        },
      }));
      assert.throws(() => ledger.acceptOperation(acceptedOperation()),
        new RegExp(`crash:${point}`, 'u'));
      ledger.close();

      try {
        const recovered = openOciHostAgentReceiptLedger(configuration(root));
        const receipt = recovered.readOperation(acceptedOperation().operationId);
        assert.ok(receipt === undefined || receipt.state === 'accepted');
        recovered.close();
      } catch (error) {
        assert.equal(
          error.code,
          OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
          `fault ${point} must recover exactly or quarantine`,
        );
      }
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('quarantines checksum, sequence, manifest, and incarnation-index damage', () => {
    const corruptions = [
      (root) => fs.appendFileSync(
        path.join(root, 'generations', '000000000001.json'),
        'tamper',
      ),
      (root) => fs.writeFileSync(path.join(root, 'manifest.json'), '{}\n'),
      (root) => fs.rmSync(path.join(root, 'incarnation.json')),
      (root) => fs.chmodSync(path.join(root, 'header.json'), 0o644),
    ];
    for (const corrupt of corruptions) {
      const root = temporaryRoot();
      initialize(root);
      const ledger = openOciHostAgentReceiptLedger(configuration(root));
      ledger.acceptOperation(acceptedOperation());
      ledger.close();
      corrupt(root);
      assert.throws(
        () => openOciHostAgentReceiptLedger(configuration(root)),
        (error) => error.code ===
          OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
      );
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('keeps recovery authoritative and exposes a failed lock release', () => {
    const root = temporaryRoot();
    try {
      initialize(root);
      fs.writeFileSync(path.join(root, 'manifest.json'), '{}\n');

      let observedError;
      try {
        openOciHostAgentReceiptLedger(configuration(root, {
          lockOptions: {token: INVALID_LOCK_TOKEN},
        }));
      } catch (error) {
        observedError = error;
      }

      assert.equal(observedError instanceof OciHostAgentDurableStateError, true);
      assert.equal(
        observedError.code,
        OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
        'the ledger recovery failure remains authoritative',
      );
      assert.equal(
        observedError.message,
        OCI_HOST_AGENT_DURABLE_ERROR.RECEIPT_UNAVAILABLE,
      );
      assert.equal(
        observedError.cleanupFailure.kind,
        LOCK_RELEASE_FAILURE_KIND,
      );
      assert.equal(
        observedError.cleanupFailure.error instanceof
        OciHostAgentDurableStateError,
        true,
      );
      assert.equal(
        observedError.cleanupFailure.error.code,
        OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE,
      );
      assert.equal(Object.isFrozen(observedError.cleanupFailure), true);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});
