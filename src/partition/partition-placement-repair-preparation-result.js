import {REPAIR_PREPARATION_STATE as PREPARATION, PLACEMENT_ADMISSION_ERROR} from
  './partition-placement-admission-constants.js';

function unavailableRepairPreparation(reason) {
  return Object.freeze({state: PREPARATION.UNAVAILABLE, reason});
}

function preparedRepairBody(body, owner) {
  return Object.freeze({state: PREPARATION.PREPARED, body, owner});
}

function unavailableRepairOwnerReply() {
  return Object.freeze({success: false, failureCode: PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE});
}

export {unavailableRepairPreparation, preparedRepairBody, unavailableRepairOwnerReply};
