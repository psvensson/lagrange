import {TYPEOF} from '../constants/index.js';
import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
} from './rejoin-hints-constants.js';
import {buildMembershipOwnerOutcome} from
  '../control-plane/membership-lifecycle-controller.js';

const BOOTSTRAP_LEADER_READINESS_OPTION_FIELD = Object.freeze({
  MEMBERSHIP_OWNER_OUTCOME: 'membershipOwnerOutcome',
  STARTUP_MODE: 'startupMode',
});

function normalizeBootstrapLeaderReadinessOptions(options = {}) {
  const normalizedOptions =
    options && typeof options === TYPEOF.OBJECT && !Array.isArray(options) ?
      options :
      {};
  const membershipOwnerOutcome = buildMembershipOwnerOutcome({
    membershipOwnerOutcome:
      normalizedOptions[
        BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.MEMBERSHIP_OWNER_OUTCOME
      ],
    startupMode:
      normalizedOptions[
        BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.STARTUP_MODE
      ],
  });
  return {
    ...normalizedOptions,
    [BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.MEMBERSHIP_OWNER_OUTCOME]:
      membershipOwnerOutcome,
    [BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.STARTUP_MODE]:
      membershipOwnerOutcome.startupMode,
  };
}

function isBootstrapLeaderReadinessBlockedOwnerOutcome(
  membershipOwnerOutcome = null,
) {
  return membershipOwnerOutcome?.outcomeType ===
    MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP;
}

function installBootstrapApiLeaderReadinessMethods(BootstrapAPI) {
  BootstrapAPI.prototype.waitForServiceLeaders = async function(options = {}) {
    const normalizedOptions =
      normalizeBootstrapLeaderReadinessOptions(options);
    const leaderStatus =
      await this.serviceLeaderReadinessOwner.waitForServiceLeaders(
        normalizedOptions,
      );
    if (
      isBootstrapLeaderReadinessBlockedOwnerOutcome(
        normalizedOptions[
          BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.MEMBERSHIP_OWNER_OUTCOME
        ],
      ) &&
      leaderStatus?.ready === true
    ) {
      return {
        ...leaderStatus,
        ready: false,
      };
    }
    return leaderStatus;
  };
}

export {installBootstrapApiLeaderReadinessMethods};
