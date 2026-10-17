import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
  ReplicaCreateAdmissionOwner,
} from '../../src/node/replica-create-admission-owner.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const APPLIED = Object.freeze({success: true, outcome: 'applied'});
const NO_OP = Object.freeze({success: true, outcome: 'no_op'});

function matches(row, where) {
  return Object.entries(where).every(([field, value]) => row?.[field] === value);
}

function fixture(options = {}) {
  const row = {
    operation_id: 'op-1',
    type: OperationType.ADD,
    entity_type: 'partition',
    entity_id: 'partition-1',
    partition_id: 'partition-1',
    replica_id: 'replica-1',
    target_node_id: 'node-1',
    workflow_step: 'SENDING',
    updated_at: 11,
    completed_at: options.completedAt ?? null,
    create_admission_state: null,
    create_admission_token: null,
    create_admission_replica_created_at: null,
    create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null,
    create_admission_owner_incarnation: null,
  };
  let loseNextUpdateAnswer = false;
  let beforeNextUpdate = null;
  let bootIncarnation = options.bootIncarnation ?? 101;
  const gateway = {
    async readAuthoritativeRows(_table, sql, params) {
      if (sql.includes('FROM nodes')) {
        return {success: true, rows: [{
          node_id: params[0],
          boot_incarnation: bootIncarnation,
        }]};
      }
      if (sql.includes('WHERE operation_id = ?')) {
        return {success: true, rows: row.operation_id === params[0] ? [row] : []};
      }
      return {
        success: true,
        rows: row.replica_id === params[0] && row.target_node_id === params[1] ?
          [row] : [],
      };
    },
    async updateSystemTableRow(_table, where, data) {
      if (beforeNextUpdate) {
        const action = beforeNextUpdate;
        beforeNextUpdate = null;
        action(row);
      }
      if (!matches(row, where)) return NO_OP;
      Object.assign(row, data);
      if (loseNextUpdateAnswer) {
        loseNextUpdateAnswer = false;
        throw new Error('answer lost after apply');
      }
      return APPLIED;
    },
  };
  const request = {
    operationId: 'op-1',
    operationType: OperationType.ADD,
    entityType: 'partition',
    entityId: 'partition-1',
    partitionId: 'partition-1',
    replicaId: 'replica-1',
    admissionToken: 'admission-1',
    attemptToken: 'attempt-1',
    attemptSeq: 1,
    workflowUpdatedAt: 11,
  };
  return {
    gateway,
    request,
    row,
    loseNextUpdateAnswer() {
      loseNextUpdateAnswer = true;
    },
    beforeNextUpdate(action) {
      beforeNextUpdate = action;
    },
    setBootIncarnation(value) {
      bootIncarnation = value;
    },
  };
}

// The commit's boot reads: the claim revalidation's, then its own boot fence.
const COMMIT_FENCE_BOOT_READ = 2;

async function claimedInstall(f, {materialized = false} = {}) {
  const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
    nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
  const admitted = await owner.claim(f.request);
  const evidence = materialized ? await owner.markMaterialized(admitted) :
    admitted;
  const physicalClaim = await owner.claimPhysicalWorker(evidence);
  assert.ok(physicalClaim);
  return {owner, physicalClaim, evidence};
}

/** Boot 102 starts while the old boot's commit row read is in flight:
 * `act(newOwner)` runs before that read executes; result() answers it. */
function newBootDuringRowRead(f, oldOwner, act) {
  const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
    nodeId: 'node-1', ownerIncarnation: 102, now: () => 30});
  const originalRead = oldOwner.readOperation.bind(oldOwner);
  let started = false;
  let result;
  oldOwner.readOperation = async (operationId) => {
    if (!started) {
      started = true;
      f.setBootIncarnation(102);
      result = await act(owner);
    }
    return {...await originalRead(operationId)};
  };
  return {owner, result: () => result};
}

/** Records the commit's durable reads in order; each row read returns a copy
 * (a real read's snapshot), and onBoot(n) runs as the n-th boot read starts. */
function traceCommitReads(owner, onBoot = () => {}) {
  const trace = [];
  const originalRead = owner.readOperation.bind(owner);
  const originalRequire = owner.requireCurrentBootIncarnation.bind(owner);
  owner.readOperation = async (operationId) => {
    const row = {...await originalRead(operationId)};
    trace.push('row');
    return row;
  };
  owner.requireCurrentBootIncarnation = async () => {
    onBoot(trace.filter((read) => read === 'boot').length + 1);
    const current = await originalRequire();
    trace.push('boot');
    return current;
  };
  return trace;
}

describe('ReplicaCreateAdmissionOwner', () => {
  it('settles a rejected lane tail and admits the next same-operation work', async () => {
    const owner = new ReplicaCreateAdmissionOwner();
    await assert.rejects(
      owner.runExclusive('op-1', async () => {
        throw new Error('expected');
      }),
      /expected/,
    );
    assert.equal(await owner.runExclusive('op-1', async () => 'next'), 'next');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(owner.laneTailByOperationId.size, 0);
  });

  it('linearizes terminal-first before any CREATE admission', async () => {
    const f = fixture({completedAt: 12});
    const owner = new ReplicaCreateAdmissionOwner({
      gateway: f.gateway,
      nodeId: 'node-1',
      ownerIncarnation: 101,
      now: () => 20,
    });
    await assert.rejects(
      owner.claim(f.request),
      {code: CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL},
    );
    assert.equal(f.row.create_admission_state, null);
  });

  it('adopts an applied claim after its mutation answer is lost', async () => {
    const f = fixture();
    f.loseNextUpdateAnswer();
    const owner = new ReplicaCreateAdmissionOwner({
      gateway: f.gateway,
      nodeId: 'node-1',
      ownerIncarnation: 101,
      now: () => 20,
    });
    const evidence = await owner.claim(f.request);
    assert.equal(evidence.admissionState, CREATE_ADMISSION_STATE.ADMITTED);
    assert.equal(evidence.replicaCreatedAt, f.row.create_admission_replica_created_at);
  });

  it('withholds physical-work evidence when boot authority changes during claim',
    async () => {
      const f = fixture();
      f.beforeNextUpdate(() => f.setBootIncarnation(102));
      const staleBoot = new ReplicaCreateAdmissionOwner({
        gateway: f.gateway,
        nodeId: 'node-1',
        ownerIncarnation: 101,
        now: () => 20,
      });
      await assert.rejects(
        staleBoot.claim(f.request),
        {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED},
      );
      assert.equal(
        f.row.create_admission_state,
        CREATE_ADMISSION_STATE.ADMITTED,
        'the applied row remains durable for current-boot takeover',
      );
      assert.equal(staleBoot.activePhysicalWorkerOperationIds.size, 0);
    });

  it('shares one same-boot lane and grants one physical worker', async () => {
    const f = fixture();
    const first = ReplicaCreateAdmissionOwner.acquire({
      gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 101, now: () => 20,
    });
    const second = ReplicaCreateAdmissionOwner.acquire({
      gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 101, now: () => 21,
    });
    const firstEvidence = await first.claim(f.request);
    const secondEvidence = await second.claim(f.request);
    assert.equal(first, second);
    const firstClaim = await first.claimPhysicalWorker(firstEvidence);
    assert.ok(firstClaim);
    assert.equal(await second.claimPhysicalWorker(secondEvidence), false);
    const materialized = await first.markMaterialized(firstEvidence);
    assert.equal(materialized.admissionState, CREATE_ADMISSION_STATE.MATERIALIZED);
    first.releasePhysicalWorker(firstClaim);
    ReplicaCreateAdmissionOwner.release(first);
    ReplicaCreateAdmissionOwner.release(second);
  });

  it('keeps lifecycle cleanup outside an active exact physical worker',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
        nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
      const evidence = await owner.claim(f.request);
      const physicalClaim = await owner.claimPhysicalWorker(evidence);
      assert.ok(physicalClaim);
      assert.equal(await owner.closeForLifecycle({
        serviceId: evidence.replicaId,
        createdAt: evidence.replicaCreatedAt,
        createAttemptToken: evidence.attemptToken,
      }), false, 'cleanup cannot close the generation during physical work');
      assert.equal(f.row.create_admission_state,
        CREATE_ADMISSION_STATE.ADMITTED);
      owner.releasePhysicalWorker(physicalClaim);
      assert.equal(await owner.closeForLifecycle({
        serviceId: evidence.replicaId,
        createdAt: evidence.replicaCreatedAt,
        createAttemptToken: evidence.attemptToken,
      }), true, 'cleanup may close after the physical claim is released');
    });

  it('cannot commit after release wins during authoritative revalidation',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
        nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
      const evidence = await owner.claim(f.request);
      const physicalClaim = await owner.claimPhysicalWorker(evidence);
      assert.ok(physicalClaim);
      const originalRead = owner.readOperation.bind(owner);
      let releaseRead;
      const readStarted = new Promise((resolve) => {
        releaseRead = resolve;
      });
      let resumeRead;
      const readBarrier = new Promise((resolve) => {
        resumeRead = resolve;
      });
      owner.readOperation = async (operationId) => {
        const row = await originalRead(operationId);
        releaseRead();
        await readBarrier;
        return row;
      };
      let mutated = false;
      const committing = owner.commitSnapshotInstall(physicalClaim, () => {
        mutated = true;
        return true;
      });
      await readStarted;
      assert.equal(owner.releasePhysicalWorker(physicalClaim), true);
      resumeRead();
      assert.equal(await committing, false);
      assert.equal(mutated, false,
        'released physical authority reaches no filesystem mutation');
    });

  it('cannot substitute a reclaimed worker for a delayed commit claim',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
        nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
      const evidence = await owner.claim(f.request);
      const oldClaim = await owner.claimPhysicalWorker(evidence);
      assert.ok(oldClaim);
      const originalRead = owner.readOperation.bind(owner);
      let announceRead;
      const readStarted = new Promise((resolve) => {
        announceRead = resolve;
      });
      let resumeRead;
      const readBarrier = new Promise((resolve) => {
        resumeRead = resolve;
      });
      owner.readOperation = async (operationId) => {
        const row = await originalRead(operationId);
        announceRead();
        await readBarrier;
        return row;
      };
      let mutated = false;
      const committing = owner.commitSnapshotInstall(oldClaim, () => {
        mutated = true;
        return true;
      });
      await readStarted;
      assert.equal(owner.releasePhysicalWorker(oldClaim), true);
      owner.readOperation = originalRead;
      const replacementClaim = await owner.claimPhysicalWorker(evidence);
      assert.ok(replacementClaim);
      assert.notEqual(replacementClaim, oldClaim);
      resumeRead();
      assert.equal(await committing, false);
      assert.equal(mutated, false,
        'a new claim for the same operation cannot revive old work');
    });

  it('grants one claim when same-operation acquisitions overlap', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
      nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
    const evidence = await owner.claim(f.request);
    const [first, second] = await Promise.all([
      owner.claimPhysicalWorker(evidence),
      owner.claimPhysicalWorker(evidence),
    ]);
    assert.equal([first, second].filter(Boolean).length, 1);
  });

  it('refuses unsealed physical-worker evidence', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
      nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
    const evidence = await owner.claim(f.request);
    assert.equal(await owner.claimPhysicalWorker({...evidence}), false,
      'matching fields cannot forge the CREATE owner evidence capability');
    assert.equal(owner.activePhysicalWorkerOperationIds.size, 0);
  });

  it('rechecks current boot after the durable physical-claim read', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
      nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
    const evidence = await owner.claim(f.request);
    const originalRead = owner.readOperation.bind(owner);
    owner.readOperation = async (operationId) => {
      const row = await originalRead(operationId);
      f.setBootIncarnation(102);
      return row;
    };
    await assert.rejects(owner.claimPhysicalWorker(evidence),
      {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED});
    assert.equal(owner.activePhysicalWorkerOperationIds.size, 0,
      'a boot lost during the row read grants no physical claim');
  });

  it('holds exact physical ownership across the durable-row await', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
      nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
    const admitted = await owner.claim(f.request);
    const materialized = await owner.markMaterialized(admitted);
    const failed = await owner.markProgress(
      materialized, CREATE_ADMISSION_STATE.FAILED);
    const originalRead = owner.readOperation.bind(owner);
    let announceRead;
    const rowRead = new Promise((resolve) => {
      announceRead = resolve;
    });
    let resumeRead;
    const rowBarrier = new Promise((resolve) => {
      resumeRead = resolve;
    });
    let held = false;
    owner.readOperation = async (operationId) => {
      if (!held) {
        held = true;
        announceRead();
        await rowBarrier;
      }
      return originalRead(operationId);
    };
    const acquisition = owner.claimPhysicalWorker(failed);
    await rowRead;
    await assert.rejects(owner.beginFailedAttemptRotation(failed),
      {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED});
    resumeRead();
    const physicalClaim = await acquisition;
    assert.ok(physicalClaim,
      'the pending exact claim survives its authoritative row await');
    assert.equal(f.row.create_admission_attempt_token, failed.attemptToken,
      'attempt rotation cannot cross the durable-row await');
  });

  it('does not lend a rotated physical claim to stale attempt evidence',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
        nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
      const admitted = await owner.claim(f.request);
      const materialized = await owner.markMaterialized(admitted);
      const failed = await owner.markProgress(
        materialized, CREATE_ADMISSION_STATE.FAILED);
      const physicalClaim = await owner.claimPhysicalWorker(failed);
      assert.ok(physicalClaim);
      const rotating = await owner.beginFailedAttemptRotation(
        failed, physicalClaim);
      const restarted = await owner.finishFailedAttemptRotation(
        rotating, physicalClaim);
      assert.equal(restarted.attemptSeq, failed.attemptSeq + 1);
      assert.equal(await owner.revalidatePhysicalWorker(
        physicalClaim, failed), false,
      'the same opaque claim cannot authorize its superseded attempt');
      assert.equal(owner.snapshotInstallAuthority(physicalClaim, failed), false,
        'stale evidence cannot borrow the claim current attempt');
    });

  it('notices attempt rotation while physical revalidation awaits boot',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
        nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
      const admitted = await owner.claim(f.request);
      const materialized = await owner.markMaterialized(admitted);
      const failed = await owner.markProgress(
        materialized, CREATE_ADMISSION_STATE.FAILED);
      const physicalClaim = await owner.claimPhysicalWorker(failed);
      assert.ok(physicalClaim);
      const originalRequire = owner.requireCurrentBootIncarnation.bind(owner);
      let announceBootRead;
      const bootRead = new Promise((resolve) => {
        announceBootRead = resolve;
      });
      let resumeBootRead;
      const bootBarrier = new Promise((resolve) => {
        resumeBootRead = resolve;
      });
      let held = false;
      owner.requireCurrentBootIncarnation = async () => {
        if (!held) {
          held = true;
          announceBootRead();
          await bootBarrier;
        }
        return originalRequire();
      };
      const revalidation = owner.revalidatePhysicalWorker(
        physicalClaim, failed);
      await bootRead;
      const rotating = await owner.beginFailedAttemptRotation(
        failed, physicalClaim);
      resumeBootRead();
      assert.equal(await revalidation, false,
        'an await cannot convert old-attempt validation into new authority');
      assert.equal(rotating.attemptSeq, failed.attemptSeq + 1);
    });

  it('refuses an async install mutation before it can run', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
      nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
    const evidence = await owner.claim(f.request);
    const physicalClaim = await owner.claimPhysicalWorker(evidence);
    assert.ok(physicalClaim);
    let mutated = false;
    assert.equal(await owner.commitSnapshotInstall(physicalClaim, async () => {
      mutated = true;
      return true;
    }), false);
    assert.equal(mutated, false,
      'async callback shape is rejected before any filesystem effect');
  });

  it('holds the exact claim through the synchronous install effect',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
        nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
      const evidence = await owner.claim(f.request);
      const physicalClaim = await owner.claimPhysicalWorker(evidence);
      assert.ok(physicalClaim);
      assert.equal(await owner.commitSnapshotInstall(physicalClaim, () => {
        assert.equal(owner.releasePhysicalWorker(physicalClaim), false,
          'the executing effect retains its claim');
        return true;
      }), true);
      assert.equal(owner.releasePhysicalWorker(physicalClaim), true);
    });

  it('blocks failed-attempt rotation until physical ownership releases',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
        nodeId: 'node-1', ownerIncarnation: 101, now: () => 20});
      const admitted = await owner.claim(f.request);
      const physicalClaim = await owner.claimPhysicalWorker(admitted);
      const materialized = await owner.markMaterialized(admitted);
      const failed = await owner.markProgress(
        materialized, CREATE_ADMISSION_STATE.FAILED);
      await assert.rejects(owner.beginFailedAttemptRotation(failed),
        {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED});
      assert.equal(owner.releasePhysicalWorker(physicalClaim), true);
      const rotating = await owner.beginFailedAttemptRotation(failed);
      assert.equal(rotating.admissionState, CREATE_ADMISSION_STATE.ROTATING);
    });

  // The install commit reads its boot fence BEFORE the durable row, so that
  // row read is the last await before the effect (FreshMG CREATE B2, 2026-10-11;
  // it superseded the boot-after-row order): a boot replaced at the fence read
  // still refuses. A newer boot acts on the admission only after its takeover
  // rewrites the row's owner incarnation, which that row read requires; so a
  // takeover during it refuses, and a bare boot change leaves the old effect
  // the sole worker.
  it('cannot commit after boot ownership changes before durable reread',
    async () => {
      const f = fixture();
      const {owner, physicalClaim} = await claimedInstall(f);
      traceCommitReads(owner, (bootRead) => {
        if (bootRead === COMMIT_FENCE_BOOT_READ) f.setBootIncarnation(102);
      });
      let mutated = false;
      await assert.rejects(
        owner.commitSnapshotInstall(physicalClaim, () => {
          mutated = true;
          return true;
        }),
        {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED},
      );
      assert.equal(mutated, false,
        'old boot performs no filesystem effect after its boot fence');
    });

  it('reads the durable row last, after the boot fence, before the effect',
    async () => {
      const f = fixture();
      const {owner, physicalClaim} = await claimedInstall(f);
      const trace = traceCommitReads(owner);
      assert.equal(await owner.commitSnapshotInstall(physicalClaim, () => {
        trace.push('effect');
        return true;
      }), true);
      assert.deepEqual(trace.slice(-3), ['boot', 'row', 'effect'],
        'no await separates the authoritative row read from the effect');
    });

  it('sees an operation change recorded while its boot fence read is in flight',
    async () => {
      const f = fixture();
      const {owner, physicalClaim} = await claimedInstall(f);
      traceCommitReads(owner, (bootRead) => {
        if (bootRead === COMMIT_FENCE_BOOT_READ) {
          f.row.create_admission_token = 'admission-superseded';
        }
      });
      let mutated = false;
      assert.equal(await owner.commitSnapshotInstall(physicalClaim, () => {
        mutated = true;
        return true;
      }), false);
      assert.equal(mutated, false,
        'a change recorded before the last pre-effect read defeats the effect');
    });

  it('refuses the effect when a newer boot takes the admission over during ' +
    'the durable reread; the newer boot\'s worker is the sole one', async () => {
    const f = fixture();
    const {owner, physicalClaim} = await claimedInstall(f, {materialized: true});
    const newBoot = newBootDuringRowRead(f, owner, async (newOwner) => {
      const adopted = await newOwner.takeoverRetained({...f.row});
      assert.ok(adopted, 'the newer boot takes the retained admission over');
      return newOwner.claimPhysicalWorker(adopted);
    });
    let oldEffect = false;
    assert.equal(await owner.commitSnapshotInstall(physicalClaim, () => {
      oldEffect = true;
      return true;
    }), false, 'a takeover recorded during the durable reread refuses the old commit');
    assert.equal(oldEffect, false, 'the old boot performs no effect');
    assert.equal(f.row.create_admission_owner_incarnation, 102);
    assert.ok(newBoot.result(), 'the newer boot holds the worker');
    let newEffect = false;
    assert.equal(await newBoot.owner.commitSnapshotInstall(newBoot.result(), () => {
      newEffect = true;
      return true;
    }), true);
    assert.equal(newEffect, true, 'the newer boot\'s worker is the one that commits');
  });

  it('keeps the old effect the sole worker when the boot changes without a ' +
    'takeover during the durable reread', async () => {
    const f = fixture();
    const {owner, physicalClaim, evidence} =
      await claimedInstall(f, {materialized: true});
    const newBoot = newBootDuringRowRead(f, owner, (newOwner) =>
      newOwner.claimPhysicalWorker(evidence));
    let oldEffect = false;
    assert.equal(await owner.commitSnapshotInstall(physicalClaim, () => {
      oldEffect = true;
      return true;
    }), true, 'without a takeover the old boot still owns the admission');
    assert.equal(oldEffect, true);
    assert.equal(newBoot.result(), false,
      'a newer boot without the takeover gets no worker for it');
    assert.equal(f.row.create_admission_owner_incarnation, 101);
  });

  it('fences a claimed old boot before physical grant and durable progress',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({
        gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 101,
        now: () => 20,
      });
      const evidence = await owner.claim(f.request);
      let releaseHeldWork;
      const heldWork = new Promise((resolve) => {
        releaseHeldWork = resolve;
      }).then(() => owner.claimPhysicalWorker(evidence));
      f.setBootIncarnation(102);
      releaseHeldWork();
      await assert.rejects(
        heldWork,
        {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED},
      );
      await assert.rejects(
        owner.markMaterialized(evidence),
        {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED},
      );
      assert.equal(owner.activePhysicalWorkerOperationIds.size, 0);
      assert.equal(f.row.create_admission_state, CREATE_ADMISSION_STATE.ADMITTED);
    });

  it('revalidates boot after physical grant and fences the old worker',
    async () => {
      const f = fixture();
      const owner = new ReplicaCreateAdmissionOwner({
        gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 101,
        now: () => 20,
      });
      const evidence = await owner.claim(f.request);
      const physicalClaim = await owner.claimPhysicalWorker(evidence);
      assert.ok(physicalClaim);
      f.setBootIncarnation(102);
      await assert.rejects(
        owner.revalidatePhysicalWorker(physicalClaim),
        {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED},
      );
      await assert.rejects(
        owner.markMaterialized(evidence),
        {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED},
      );
      assert.equal(f.row.create_admission_state, CREATE_ADMISSION_STATE.ADMITTED);
    });

  it('recovers the operation-row half of attempt rotation from the old request', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({
      gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 101, now: () => 20,
    });
    const admitted = await owner.claim(f.request);
    const materialized = await owner.markMaterialized(admitted);
    const failed = await owner.markProgress(
      materialized,
      CREATE_ADMISSION_STATE.FAILED,
    );
    const rotating = await owner.beginFailedAttemptRotation(failed);
    assert.equal(rotating.admissionState, CREATE_ADMISSION_STATE.ROTATING);
    assert.equal(rotating.previousAttemptToken, f.request.attemptToken);
    assert.equal(rotating.attemptSeq, 2);
    await assert.rejects(
      owner.claim(f.request),
      {code: CREATE_ADMISSION_ERROR_CODE.STALE},
    );
  });

  it('cannot rotate after terminal wins between read and exact CAS', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({
      gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 101, now: () => 20,
    });
    const admitted = await owner.claim(f.request);
    const materialized = await owner.markMaterialized(admitted);
    const failed = await owner.markProgress(
      materialized,
      CREATE_ADMISSION_STATE.FAILED,
    );
    f.beforeNextUpdate((row) => {
      row.completed_at = 30;
    });
    await assert.rejects(
      owner.beginFailedAttemptRotation(failed),
      {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED},
    );
    assert.equal(f.row.create_admission_state, CREATE_ADMISSION_STATE.FAILED);
    assert.equal(f.row.create_admission_attempt_token, failed.attemptToken);
  });

  it('closes an exact materialized lifecycle before removal', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({
      gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 101, now: () => 20,
    });
    const admitted = await owner.claim(f.request);
    const materialized = await owner.markMaterialized(admitted);
    assert.equal(await owner.closeForLifecycle({
      replicaId: 'replica-1',
      createdAt: materialized.replicaCreatedAt,
      createAttemptToken: materialized.attemptToken,
    }), true);
    assert.equal(f.row.create_admission_state, CREATE_ADMISSION_STATE.CLOSED);
  });

  it('blocks removal across a same-incarnation attempt rotation', async () => {
    const f = fixture();
    const owner = new ReplicaCreateAdmissionOwner({
      gateway: f.gateway,
      nodeId: 'node-1',
      ownerIncarnation: 101,
      now: () => 20,
    });
    const admitted = await owner.claim(f.request);
    const materialized = await owner.markMaterialized(admitted);
    const failed = await owner.markProgress(
      materialized,
      CREATE_ADMISSION_STATE.FAILED,
    );
    const rotating = await owner.beginFailedAttemptRotation(failed);
    assert.equal(await owner.closeForLifecycle({
      replicaId: 'replica-1',
      createdAt: rotating.replicaCreatedAt,
      createAttemptToken: rotating.previousAttemptToken,
    }), false);
    assert.equal(f.row.create_admission_state, CREATE_ADMISSION_STATE.ROTATING);
  });

  it('lets only the authoritative newer boot take over retained work', async () => {
    const f = fixture();
    const oldBoot = new ReplicaCreateAdmissionOwner({
      gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 101, now: () => 20,
    });
    const oldEvidence = await oldBoot.claim(f.request);
    f.setBootIncarnation(102);
    const newBoot = new ReplicaCreateAdmissionOwner({
      gateway: f.gateway, nodeId: 'node-1', ownerIncarnation: 102, now: () => 30,
    });
    const takeover = await newBoot.takeoverRetained({...f.row});
    assert.equal(takeover.ownerIncarnation, 102);
    await assert.rejects(
      oldBoot.markMaterialized(oldEvidence),
      {code: CREATE_ADMISSION_ERROR_CODE.DEFERRED},
    );
    assert.equal(
      (await newBoot.markMaterialized(takeover)).admissionState,
      CREATE_ADMISSION_STATE.MATERIALIZED,
    );
    assert.equal(await oldBoot.takeoverRetained({...f.row}), null);
  });
});
