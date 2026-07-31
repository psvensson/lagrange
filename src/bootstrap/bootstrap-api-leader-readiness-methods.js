import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
} from './rejoin-hints-constants.js';
import {buildMembershipOwnerOutcome} from
  '../control-plane/membership-lifecycle-controller.js';

const BOOTSTRAP_LEADER_READINESS_OPTION_FIELD = Object.freeze({
  MEMBERSHIP_OWNER_OUTCOME: 'membershipOwnerOutcome',
  STARTUP_MODE: 'startupMode',
  TIMEOUT_BUDGET: 'timeoutBudget',
});
const LOCAL_STR_VALUE = 'value';

function resolveTimeoutBudgetValue(descriptor, suppliedOptions, snapshot) {
  if (descriptor?.enumerable === true) {
    return snapshot[BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.TIMEOUT_BUDGET];
  }
  if (Object.hasOwn(descriptor || {}, LOCAL_STR_VALUE)) {
    return descriptor.value;
  }
  if (typeof descriptor?.get === 'function') {
    return Reflect.apply(descriptor.get, suppliedOptions, []);
  }
  return undefined;
}

function normalizeBootstrapLeaderReadinessOptions(options = {}) {
  const suppliedOptions =
    options && typeof options === 'object' && !Array.isArray(options) ?
      options :
      {};
  const timeoutBudgetDescriptor = Object.getOwnPropertyDescriptor(
    suppliedOptions,
    BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.TIMEOUT_BUDGET,
  );
  // Snapshot caller-owned options once so accessor-backed fields cannot change
  // between membership normalization and timeout-budget propagation. The
  // request owner intentionally attaches its budget as a non-enumerable field,
  // so preserve that field from its descriptor instead of relying on spread.
  const normalizedOptions = {...suppliedOptions};
  const timeoutBudget = resolveTimeoutBudgetValue(
    timeoutBudgetDescriptor,
    suppliedOptions,
    normalizedOptions,
  );
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
  const result = {
    ...normalizedOptions,
    [BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.MEMBERSHIP_OWNER_OUTCOME]:
      membershipOwnerOutcome,
    [BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.STARTUP_MODE]:
      membershipOwnerOutcome.startupMode,
  };
  if (
    timeoutBudgetDescriptor &&
    timeoutBudget &&
    typeof timeoutBudget === 'object'
  ) {
    Object.defineProperty(
      result,
      BOOTSTRAP_LEADER_READINESS_OPTION_FIELD.TIMEOUT_BUDGET,
      {
        value: timeoutBudget,
        enumerable: false,
        configurable: true,
        writable: false,
      },
    );
  }
  return result;
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
