// The bootstrap readers of the control-plane readiness service answer from
// its synchronous reads alone. The service's async readers always answer a
// promise, so a reader that called one only to discard the promise never had
// an answer to use; it must not call it (an unobserved promise is also an
// unobserved rejection).
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  installBootstrapApiReadinessMethods,
} from '../../src/bootstrap/bootstrap-api-readiness-methods.js';
import {
  assignBootstrapStartupAuthorityEvidenceMethods,
} from '../../src/bootstrap/owners/bootstrap-startup-authority-evidence.js';
import {
  applyBootstrapReadinessProbeDetailMethods,
} from '../../src/bootstrap/owners/bootstrap-readiness-owner-probe-details.js';

const SEED_NODE_ID = 'seed-node';
const OBSERVED_AT = 1000;

function asyncOnlyService(calls) {
  return {
    async getStartupAuthoritySnapshot() {
      calls.push('getStartupAuthoritySnapshot');
      return {state: 'ready'};
    },
    async getControlPlanePublicationStory() {
      calls.push('getControlPlanePublicationStory');
      return {membershipPublication: {published: true}};
    },
    async getMembershipPublicationDiagnostics() {
      calls.push('getMembershipPublicationDiagnostics');
      return {published: true};
    },
  };
}

function readinessOwnerOver(service) {
  class Owner {
    getControlPlaneReadinessService() {
      return service;
    }
    getSeedNodeId() {
      return SEED_NODE_ID;
    }
    getBootstrapService() {
      return null;
    }
  }
  assignBootstrapStartupAuthorityEvidenceMethods(Owner);
  applyBootstrapReadinessProbeDetailMethods(Owner);
  return new Owner();
}

test('the bootstrap API startup-authority read never calls the async reader',
  () => {
    const calls = [];
    class Api {}
    installBootstrapApiReadinessMethods(Api);
    const api = new Api();
    api.seedNodeId = SEED_NODE_ID;
    api.controlPlaneReadinessService = asyncOnlyService(calls);
    assert.equal(
      api.getStartupAuthoritySnapshotForBootstrapResponse(OBSERVED_AT), null);
    assert.deepEqual(calls, []);
  });

test('the readiness owner startup-authority read never calls the async reader',
  () => {
    const calls = [];
    const owner = readinessOwnerOver(asyncOnlyService(calls));
    assert.equal(owner.getStartupAuthoritySnapshot(OBSERVED_AT), null);
    assert.deepEqual(calls, []);
  });

test('the publication story and diagnostics reads never call the async readers',
  () => {
    const calls = [];
    const owner = readinessOwnerOver(asyncOnlyService(calls));
    assert.equal(owner.getControlPlanePublicationStory(OBSERVED_AT), null);
    assert.equal(owner.getMembershipPublicationDiagnostics(OBSERVED_AT), null);
    assert.deepEqual(calls, []);
  });

test('the synchronous readers answer the bootstrap reads', () => {
  const story = {membershipPublication: {published: true}};
  const authority = {state: 'ready'};
  const service = {
    getStartupAuthoritySnapshotSync: (nodeId, observedAt) =>
      nodeId === SEED_NODE_ID && observedAt === OBSERVED_AT ? authority : null,
    getControlPlanePublicationStorySync: () => story,
    getMembershipPublicationDiagnosticsSync: () => ({published: false}),
  };
  const owner = readinessOwnerOver(service);
  assert.equal(owner.getControlPlanePublicationStory(OBSERVED_AT), story);
  assert.equal(owner.getMembershipPublicationDiagnostics(OBSERVED_AT),
    story.membershipPublication);
  class Api {}
  installBootstrapApiReadinessMethods(Api);
  const api = new Api();
  api.seedNodeId = SEED_NODE_ID;
  api.controlPlaneReadinessService = service;
  assert.equal(
    api.getStartupAuthoritySnapshotForBootstrapResponse(OBSERVED_AT), authority);
});
