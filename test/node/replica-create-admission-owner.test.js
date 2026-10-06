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
    assert.equal(first.claimPhysicalWorker(firstEvidence), true);
    assert.equal(second.claimPhysicalWorker(secondEvidence), false);
    const materialized = await first.markMaterialized(firstEvidence);
    assert.equal(materialized.admissionState, CREATE_ADMISSION_STATE.MATERIALIZED);
    first.releasePhysicalWorker(firstEvidence.operationId);
    ReplicaCreateAdmissionOwner.release(first);
    ReplicaCreateAdmissionOwner.release(second);
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
    assert.equal(await oldBoot.markMaterialized(oldEvidence), null);
    assert.equal(
      (await newBoot.markMaterialized(takeover)).admissionState,
      CREATE_ADMISSION_STATE.MATERIALIZED,
    );
    assert.equal(await oldBoot.takeoverRetained({...f.row}), null);
  });
});
