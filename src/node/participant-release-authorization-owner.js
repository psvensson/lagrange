import {randomUUID} from 'node:crypto';
import {readSeedStartupAuthorization} from
  '../bootstrap/seed-startup-session-store.js';
import {CREATE_ADMISSION_STATE} from './replica-create-admission-owner.js';

const AUTHORIZATION = new WeakMap();
const PARTICIPANT_RELEASE_AUTHORIZATION_KIND = Object.freeze({
  FRESH_CREATE: 'fresh_create',
  FRESH_SEED: 'fresh_seed',
  OPERATOR: 'operator',
});

function createParticipantReleaseAuthorizationOwner(handler) {
  function issue(kind, partitionId, targetBuildDigest, evidence = null,
    authorizationId = randomUUID()) {
    const token = Object.freeze(Object.create(null));
    AUTHORIZATION.set(token, Object.freeze({handler, kind, partitionId,
      targetBuildDigest, evidence, authorizationId}));
    return token;
  }

  return Object.freeze({
    authorizeFreshSeed({partitionId, targetBuildDigest, seedAuthorization,
      nodeId, bootIncarnation, deadlineAtMs}) {
      const proof = readSeedStartupAuthorization(seedAuthorization);
      return proof?.nodeId === nodeId &&
        proof.bootIncarnation === bootIncarnation &&
        proof.targetBuildDigest === targetBuildDigest &&
        proof.deadlineAtMs === deadlineAtMs ?
        issue(PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_SEED,
          partitionId, targetBuildDigest, proof) : null;
    },
    async authorizeFreshCreate({partitionId, targetBuildDigest,
      createAdmissionEvidence, createPhysicalWorkerClaim, identityExisted}) {
      if (identityExisted !== false ||
          createAdmissionEvidence?.partitionId !== partitionId) return null;
      const current = await handler.getReplicaCreateAdmissionOwner()
        .authorizeParticipantRelease(
          createAdmissionEvidence,
          createPhysicalWorkerClaim,
        );
      return current?.admissionState === CREATE_ADMISSION_STATE.MATERIALIZED ?
        issue(PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_CREATE,
          partitionId, targetBuildDigest, Object.freeze({
            admission: current,
            physicalClaim: createPhysicalWorkerClaim,
          })) : null;
    },
    authorizeOperator({partitionId, targetBuildDigest}) {
      return issue(PARTICIPANT_RELEASE_AUTHORIZATION_KIND.OPERATOR,
        partitionId, targetBuildDigest);
    },
    authorizeControlFrom(parent, partitionId, targetBuildDigest) {
      const proof = AUTHORIZATION.get(parent);
      return proof?.handler === handler &&
        [PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_SEED,
          PARTICIPANT_RELEASE_AUTHORIZATION_KIND.OPERATOR].includes(proof.kind) ?
        issue(proof.kind, partitionId, targetBuildDigest, proof.evidence,
          proof.authorizationId) : null;
    },
    reference(token) {
      const proof = AUTHORIZATION.get(token);
      return proof?.handler === handler ? Object.freeze({
        authorizationId: proof.authorizationId,
        authorityKind: proof.kind,
        partitionId: proof.partitionId,
        targetBuildDigest: proof.targetBuildDigest,
      }) : null;
    },
    async validates(token, {partitionId, targetBuildDigest}) {
      const proof = AUTHORIZATION.get(token);
      if (proof?.handler !== handler || proof.partitionId !== partitionId ||
          proof.targetBuildDigest !== targetBuildDigest) return false;
      if (proof.kind !== PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_CREATE) {
        return true;
      }
      const current = await handler.getReplicaCreateAdmissionOwner()
        .authorizeParticipantRelease(
          proof.evidence?.admission,
          proof.evidence?.physicalClaim,
        );
      return current === proof.evidence?.admission;
    },
  });
}

export {createParticipantReleaseAuthorizationOwner,
  PARTICIPANT_RELEASE_AUTHORIZATION_KIND};
