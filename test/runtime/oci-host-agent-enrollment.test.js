import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  OCI_HOST_AGENT_DURABLE_ERROR,
} from '../../src/runtime/oci-host-agent-receipt-ledger.js';
import {
  OCI_HOST_AGENT_ENROLLMENT_POINT,
  initializeOciHostAgentEnrollment,
  retireOciHostAgentEnrollment,
  verifyOciHostAgentEnrollment,
} from '../../src/runtime/oci-host-agent-enrollment.js';
import {
  openOciHostAgentReceiptLedger,
} from '../../src/runtime/oci-host-agent-receipt-ledger.js';

const IDS = Object.freeze({
  hostId: 'host-1',
  clusterIncarnation: 'cluster-1',
  engineDataRootId: '1'.repeat(64),
  ledgerRootId: '2'.repeat(64),
  enrollmentId: '3'.repeat(64),
});

class TestTpmCounter {
  #value;

  constructor(value = 0) {
    this.#value = value;
  }

  read() {
    return this.#value;
  }

  increment() {
    this.#value += 1;
    return this.#value;
  }
}

function temporaryRoots() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oci-agent-enrollment-'));
  const engineDataRoot = path.join(root, 'engine');
  fs.mkdirSync(engineDataRoot, {mode: 0o700});
  return {
    root,
    authorityRoot: path.join(root, 'authority'),
    ledgerRoot: path.join(root, 'ledger'),
    engineDataRoot,
  };
}

function options(roots, tpm, overrides = {}) {
  return {
    authorityRoot: roots.authorityRoot,
    ledgerRoot: roots.ledgerRoot,
    engineDataRoot: roots.engineDataRoot,
    tpm,
    ...IDS,
    maximumReceipts: 8,
    maximumNoncesPerKey: 8,
    predecessorCounter: 0,
    ...overrides,
  };
}

function exactRetirementProof() {
  return {
    engineStopped: true,
    runtimeStopped: true,
    helpersStopped: true,
    resourcesRemoved: true,
    dataRootDiscarded: true,
  };
}

describe('OCI host-agent TPM-monotonic enrollment', () => {
  it('performs socketless authorized-initializing-consumed fresh enrollment', () => {
    const roots = temporaryRoots();
    const tpm = new TestTpmCounter();
    const consumed = initializeOciHostAgentEnrollment(options(roots, tpm));
    assert.equal(consumed.state, 'consumed');
    assert.equal(consumed.tpmCounter, 3);
    assert.match(consumed.headerDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.deepEqual(
      verifyOciHostAgentEnrollment(options(roots, tpm)),
      consumed,
    );
    fs.rmSync(roots.root, {recursive: true, force: true});
  });

  it('resumes only an exact initializing tail and empty ledger header', () => {
    const roots = temporaryRoots();
    const tpm = new TestTpmCounter();
    assert.throws(
      () => initializeOciHostAgentEnrollment(options(roots, tpm, {
        fault: (point) => {
          if (point === OCI_HOST_AGENT_ENROLLMENT_POINT.AFTER_LEDGER_INITIALIZE) {
            throw new Error('crash-after-ledger-initialize');
          }
        },
      })),
      /crash-after-ledger-initialize/u,
    );

    const consumed = initializeOciHostAgentEnrollment(options(roots, tpm));
    assert.equal(consumed.state, 'consumed');
    assert.equal(consumed.tpmCounter, 3);
    fs.rmSync(roots.root, {recursive: true, force: true});
  });

  it('accepts a non-empty intact receipt ledger after enrollment is consumed', () => {
    const roots = temporaryRoots();
    const tpm = new TestTpmCounter();
    initializeOciHostAgentEnrollment(options(roots, tpm));
    const ledger = openOciHostAgentReceiptLedger({
      root: roots.ledgerRoot,
      clusterIncarnation: IDS.clusterIncarnation,
      ledgerRootId: IDS.ledgerRootId,
      enrollmentId: IDS.enrollmentId,
      maximumReceipts: 8,
      maximumNoncesPerKey: 8,
    });
    ledger.admitNonce({
      keyId: 'node-key-1',
      nonce: Buffer.alloc(32, 1).toString('base64'),
      expiresAtMs: 10_000,
      nowMs: 1_000,
    });
    ledger.close();
    assert.equal(
      verifyOciHostAgentEnrollment(options(roots, tpm)).state,
      'consumed',
    );
    fs.rmSync(roots.root, {recursive: true, force: true});
  });

  it('fails closed when TPM advances without its matching append', () => {
    const roots = temporaryRoots();
    const tpm = new TestTpmCounter();
    assert.throws(
      () => initializeOciHostAgentEnrollment(options(roots, tpm, {
        fault: (point) => {
          if (point === OCI_HOST_AGENT_ENROLLMENT_POINT.AFTER_TPM_INCREMENT) {
            throw new Error('crash-after-tpm-increment');
          }
        },
      })),
      /crash-after-tpm-increment/u,
    );
    assert.throws(
      () => initializeOciHostAgentEnrollment(options(roots, tpm)),
      (error) => error.code ===
        OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
    );
    fs.rmSync(roots.root, {recursive: true, force: true});
  });

  it('rejects absent TPM authority and every rollback or root mismatch', () => {
    {
      const roots = temporaryRoots();
      assert.throws(
        () => initializeOciHostAgentEnrollment(options(roots, undefined)),
        (error) => error.code ===
          OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
      );
      assert.equal(fs.existsSync(roots.ledgerRoot), false);
      fs.rmSync(roots.root, {recursive: true, force: true});
    }
    {
      const roots = temporaryRoots();
      const tpm = new TestTpmCounter();
      initializeOciHostAgentEnrollment(options(roots, tpm));
      const log = path.join(roots.authorityRoot, 'enrollment.log');
      const records = fs.readFileSync(log, 'utf8').trim().split('\n');
      fs.writeFileSync(log, `${records.slice(0, -1).join('\n')}\n`);
      assert.throws(
        () => verifyOciHostAgentEnrollment(options(roots, tpm)),
        (error) => error.code ===
          OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
      );
      fs.rmSync(roots.root, {recursive: true, force: true});
    }
    {
      const roots = temporaryRoots();
      const tpm = new TestTpmCounter();
      initializeOciHostAgentEnrollment(options(roots, tpm));
      assert.throws(
        () => verifyOciHostAgentEnrollment(options(roots, tpm, {
          engineDataRootId: '9'.repeat(64),
        })),
        (error) => error.code ===
          OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
      );
      fs.rmSync(roots.root, {recursive: true, force: true});
    }
  });

  it('requires exact retirement proof and distinct replacement roots', () => {
    const roots = temporaryRoots();
    const tpm = new TestTpmCounter();
    initializeOciHostAgentEnrollment(options(roots, tpm));
    assert.throws(
      () => retireOciHostAgentEnrollment(options(roots, tpm, {
        retirementProof: {...exactRetirementProof(), resourcesRemoved: false},
      })),
      (error) => error.code ===
        OCI_HOST_AGENT_DURABLE_ERROR.RETIREMENT_REQUIRED,
    );
    assert.throws(
      () => retireOciHostAgentEnrollment(options(roots, tpm, {
        retirementProof: exactRetirementProof(),
      })),
      (error) => error.code ===
        OCI_HOST_AGENT_DURABLE_ERROR.RETIREMENT_REQUIRED,
    );
    fs.rmSync(roots.engineDataRoot, {recursive: true, force: true});
    const retired = retireOciHostAgentEnrollment(options(roots, tpm, {
      retirementProof: exactRetirementProof(),
    }));
    assert.equal(retired.state, 'retired');

    const replacementRoots = {
      ...roots,
      ledgerRoot: path.join(roots.root, 'replacement-ledger'),
      engineDataRoot: path.join(roots.root, 'replacement-engine'),
    };
    fs.mkdirSync(replacementRoots.engineDataRoot, {mode: 0o700});
    const replacement = {
      clusterIncarnation: 'cluster-2',
      engineDataRootId: '4'.repeat(64),
      ledgerRootId: '5'.repeat(64),
      enrollmentId: '6'.repeat(64),
      predecessorCounter: retired.tpmCounter,
    };
    assert.throws(
      () => initializeOciHostAgentEnrollment(options(
        replacementRoots,
        tpm,
        {...replacement, engineDataRootId: IDS.engineDataRootId},
      )),
      (error) => error.code ===
        OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
    );
    const consumed = initializeOciHostAgentEnrollment(options(
      replacementRoots,
      tpm,
      replacement,
    ));
    assert.equal(consumed.state, 'consumed');
    assert.equal(consumed.predecessorCounter, retired.tpmCounter + 2);
    fs.rmSync(roots.root, {recursive: true, force: true});
  });

  it('requires a distinct empty provisioned Engine data root before enrollment', () => {
    {
      const roots = temporaryRoots();
      const tpm = new TestTpmCounter();
      fs.writeFileSync(path.join(roots.engineDataRoot, 'engine-state'), 'used');
      assert.throws(
        () => initializeOciHostAgentEnrollment(options(roots, tpm)),
        (error) => error.code ===
          OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
      );
      assert.equal(tpm.read(), 0);
      fs.rmSync(roots.root, {recursive: true, force: true});
    }
    {
      const roots = temporaryRoots();
      const tpm = new TestTpmCounter();
      assert.throws(
        () => initializeOciHostAgentEnrollment(options(roots, tpm, {
          engineDataRoot: roots.ledgerRoot,
        })),
        (error) => error.code ===
          OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE,
      );
      fs.rmSync(roots.root, {recursive: true, force: true});
    }
  });
});
