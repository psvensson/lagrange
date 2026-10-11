import {createHash} from 'node:crypto';
import {PARTICIPANT_RELEASE_VERSION} from
  './partition-participant-transaction-cutover-constants.js';

const DIGEST = 'sha256';
const ENCODING = 'hex';
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const ordinal = (value) => Number.isSafeInteger(value) && value >= 0 &&
  !Object.is(value, -0);

function releaseIdentityOf({partitionId, targetBuildDigest, configurationKey,
  membershipGenerationIndex}) {
  if (!nonempty(partitionId) || !DIGEST_PATTERN.test(targetBuildDigest) ||
      !nonempty(configurationKey) || !ordinal(membershipGenerationIndex)) return null;
  const identity = {partitionId, protocolVersion: PARTICIPANT_RELEASE_VERSION,
    targetBuildDigest, configurationKey, membershipGenerationIndex};
  const releaseId = createHash(DIGEST).update(JSON.stringify(identity)).digest(ENCODING);
  return Object.freeze({...identity, releaseId});
}

function releaseIdentityValid(release) {
  const canonical = release && releaseIdentityOf(release);
  return canonical !== null && release.protocolVersion === canonical.protocolVersion &&
    release.releaseId === canonical.releaseId;
}

export {releaseIdentityOf, releaseIdentityValid};
