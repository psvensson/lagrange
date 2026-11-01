// D10/J11: a recovery claim interrupts the NAMED component and observes that
// component's own recovery plus a user operation against it; anything else is
// a typed not-measured with its reason - never a fixed timing.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  arrayMap,
} from '../real-product-captured-intrinsics.js';

const COMPONENT = Object.freeze({role: 'tikv', host: '10.0.0.2', containerId: 'f'.repeat(64)});

function recoveryInput(sshRun, overrides = {}) {
  let clock = 1000;
  return {component: COMPONENT, sshRun, opts: {}, sleep: async () => {},
    now: () => (clock += 5), attempts: 3,
    observeComponentReady: async () => ({ready: true, evidence: 'store Up'}),
    userOperation: async () => ({ok: true, evidence: 'SELECT 1 -> 1'}),
    ...overrides};
}

function assertNotMeasured(result, reason) {
  assert.equal(result.status, 'not-measured');
  assert.equal(result.reason, reason);
  for (const key of ['measuredRecoveryMs', 'measuredBackfillMs', 'recoveryMs']) {
    assert.equal(result[key], undefined, `${key} is never filled for an unobserved recovery`);
  }
}

test('D10/J11: a failed interruption is not-measured, never a fixed timing', async () => {
  const {sshRun} = createScriptedSsh([[/docker/u, new Error('ssh: connection refused')]]);
  assertNotMeasured(await deployers.measureComponentRecovery(recoveryInput(sshRun)),
    'interrupt-failed');
});

test('J11: a component that never recovers is not-measured', async () => {
  const {sshRun} = createScriptedSsh();
  assertNotMeasured(await deployers.measureComponentRecovery(recoveryInput(sshRun, {
    observeComponentReady: async () => ({ready: false, evidence: 'store Disconnected'}),
  })), 'component-not-recovered');
});

test('J11: a failed user operation after recovery is not-measured', async () => {
  const {sshRun} = createScriptedSsh();
  assertNotMeasured(await deployers.measureComponentRecovery(recoveryInput(sshRun, {
    userOperation: async () => ({ok: false, evidence: 'ERROR 9005 region unavailable'}),
  })), 'user-operation-failed');
});

test('J11: an interruption restarts exactly the named container and observes it',
  async () => {
    const {sshRun, calls} = createScriptedSsh();
    const result = await deployers.measureComponentRecovery(recoveryInput(sshRun));
    assert.equal(result.status, 'observed');
    assert.deepEqual(arrayMap(calls, (call) => [call.host, call.command]),
      [[COMPONENT.host, `docker restart -t 1 ${COMPONENT.containerId}`]]);
    assert.equal(result.component.containerId, COMPONENT.containerId);
    assert.ok(result.recoveryMs > 0);
    assert.equal(result.userOperation.ok, true);
  });

test('D10: the backfill measurement no longer exists', () => {
  assert.equal(deployers.measureRealBackfillAndRecovery, undefined);
});
