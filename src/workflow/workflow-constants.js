const WORKFLOW_ERROR_MSG = Object.freeze({
  WORKFLOW_ID_REQUIRED: 'Workflow ID is required',
  OWNER_KEY_REQUIRED: 'Workflow owner key is required',
  PARTICIPANT_ID_REQUIRED: 'Workflow participant ID is required',
  workflowNotFound: (workflowId) => `Workflow ${workflowId} not found`,
  participantNotFound: (participantKey) =>
    `Workflow participant ${participantKey} not found`,
});

export {
  WORKFLOW_ERROR_MSG,
};
