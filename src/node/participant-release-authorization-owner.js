import {isFreshSeedMembershipOutcome} from '../bootstrap/rejoin-hints-constants.js';
import {CREATE_ADMISSION_ERROR_CODE, CREATE_ADMISSION_STATE} from
  './replica-create-admission-owner.js';
import {releaseAnswer} from '../partition/partition-participant-release-contract.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT} from
  '../partition/partition-participant-transaction-cutover-constants.js';

const AUTHORIZATION = new WeakMap();
// A fresh CREATE authorization whose create-admission authority read was
// unavailable when it was issued. It grants nothing: every release attempt
// that carries it re-reads the authority (confirmFreshCreate) until the
// committed operation row confirms the admission or refuses it.
// Token-identity seam: a token is an object identity of this process. The
// confirmation runs on the issuing node, on the attempt's first (local) ask,
// before its NOT_LEADER answer; the client's forwarded re-ask to a leader on
// another node carries the token serialized, which that leader cannot
// recognize (for a no-origin partition it answers OPERATOR_REQUIRED). Moving
// the authority to a committed fact any leader reads is quest
// fresh-create-release-authority-from-committed-operation.
const PENDING_FRESH_CREATE = new WeakMap();
const PARTICIPANT_RELEASE_AUTHORIZATION_KIND = Object.freeze({
  FRESH_CREATE: 'fresh_create',
  FRESH_SEED: 'fresh_seed',
  OPERATOR: 'operator',
});
const CREATE_ADMISSION_REFUSAL = Object.freeze({
  NOT_MATERIALIZED: 'create_admission_not_materialized',
});

function isAuthorizationToken(value) {
  return value !== null && typeof value === 'object';
}

function createParticipantReleaseAuthorizationOwner(handler) {
  function issue(kind, partitionId, targetBuildDigest, evidence = null) {
    const token = Object.freeze(Object.create(null));
    AUTHORIZATION.set(token, Object.freeze({handler, kind, partitionId,
      targetBuildDigest, evidence}));
    return token;
  }

  function pendingFreshCreateOf(token) {
    if (!isAuthorizationToken(token)) return null;
    const pending = PENDING_FRESH_CREATE.get(token);
    return pending?.handler === handler ? pending : null;
  }

  async function readFreshCreateAdmission(createAdmissionEvidence) {
    try {
      return {current: await handler.getReplicaCreateAdmissionOwner()
        .authorizeParticipantRelease(createAdmissionEvidence)};
    } catch (error) {
      if (error?.code !== CREATE_ADMISSION_ERROR_CODE.DEFERRED) throw error;
      return {deferred: error};
    }
  }

  return Object.freeze({
    authorizeFreshSeed({partitionId, targetBuildDigest, membershipOwnerOutcome}) {
      return isFreshSeedMembershipOutcome(membershipOwnerOutcome) ?
        issue(PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_SEED,
          partitionId, targetBuildDigest, membershipOwnerOutcome) : null;
    },
    async authorizeFreshCreate({partitionId, targetBuildDigest,
      createAdmissionEvidence, identityExisted}) {
      if (identityExisted !== false ||
          createAdmissionEvidence?.partitionId !== partitionId) return null;
      const {current, deferred} = await readFreshCreateAdmission(createAdmissionEvidence);
      if (deferred !== undefined) {
        // An unavailable authority is not a refusal of the admission: the
        // one authorization identity stays pending and is confirmed by the
        // authority on a later attempt of the same bounded completion.
        const token = issue(PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_CREATE,
          partitionId, targetBuildDigest, null);
        PENDING_FRESH_CREATE.set(token, Object.freeze({handler, createAdmissionEvidence}));
        return token;
      }
      return current?.admissionState === CREATE_ADMISSION_STATE.MATERIALIZED ?
        issue(PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_CREATE,
          partitionId, targetBuildDigest, current) : null;
    },
    /**
     * Confirm a pending fresh CREATE authorization from the authority before
     * a release attempt uses it.
     * @param {Object} request - The release request carrying the token.
     * @return {Promise<Object|null>} null when nothing is pending or the
     *   authority confirmed the admission; otherwise the typed answer of this
     *   attempt: UNAVAILABLE with retryAfterMs while the authority read is
     *   unavailable, INVALID when the committed row refuses the admission.
     */
    async confirmFreshCreate(request) {
      const token = request?.authorization;
      const pending = pendingFreshCreateOf(token);
      if (pending === null) return null;
      let read;
      try {
        read = await readFreshCreateAdmission(pending.createAdmissionEvidence);
      } catch (error) {
        return releaseAnswer(OUTCOME.INVALID, request,
          {missingFact: MISSING_FACT.CREATE_ADMISSION_AUTHORITY,
            reason: String(error?.message ?? error)});
      }
      if (read.deferred !== undefined) {
        return releaseAnswer(OUTCOME.UNAVAILABLE, request,
          {missingFact: MISSING_FACT.CREATE_ADMISSION_AUTHORITY,
            retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS,
            authorityOutcome: read.deferred.authorityOutcome ?? null,
            authorityError: read.deferred.authorityError ?? null});
      }
      if (read.current?.admissionState !== CREATE_ADMISSION_STATE.MATERIALIZED) {
        return releaseAnswer(OUTCOME.INVALID, request,
          {missingFact: MISSING_FACT.CREATE_ADMISSION_AUTHORITY,
            reason: CREATE_ADMISSION_REFUSAL.NOT_MATERIALIZED});
      }
      const proof = AUTHORIZATION.get(token);
      AUTHORIZATION.set(token, Object.freeze({...proof, evidence: read.current}));
      PENDING_FRESH_CREATE.delete(token);
      return null;
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
        issue(proof.kind, partitionId, targetBuildDigest, proof.evidence) : null;
    },
    validates(token, {partitionId, targetBuildDigest}) {
      const proof = AUTHORIZATION.get(token);
      return proof?.handler === handler && proof.partitionId === partitionId &&
        proof.targetBuildDigest === targetBuildDigest &&
        pendingFreshCreateOf(token) === null;
    },
  });
}

export {createParticipantReleaseAuthorizationOwner};
