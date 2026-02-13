/**
 * Constants for GroupSelectionService.
 */

const GROUP_SELECTION_SUBSYSTEM = 'group-selection';

const GROUP_SELECTION_EVENT = Object.freeze({
  LEADERSHIP_CHANGED: 'groupLeadershipChanged',
});

const GROUP_SELECTION_LOG_MSG = Object.freeze({
  LEADERSHIP_UNCHANGED: 'Latency group leadership unchanged',
  LEADERSHIP_CHANGED: 'Latency group leadership updated',
});

const GROUP_SELECTION_ERROR_MSG = Object.freeze({
  MISSING_GROUP_ID: 'Group selection requires group_id',
  MEMBERS_MUST_BE_ARRAY: 'Group selection requires memberRows array',
  MISSING_CDC: 'Group selection requires cdcIntegrationService',
});

const GROUP_SELECTION_DEFAULT = Object.freeze({
  EMPTY_MEMBER_COUNT: 0,
});

export {
  GROUP_SELECTION_DEFAULT,
  GROUP_SELECTION_ERROR_MSG,
  GROUP_SELECTION_EVENT,
  GROUP_SELECTION_LOG_MSG,
  GROUP_SELECTION_SUBSYSTEM,
};
