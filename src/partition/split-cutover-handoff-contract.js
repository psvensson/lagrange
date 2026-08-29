const objectFreeze = Object.freeze;

const HANDOFF_HANDLER_ID = 'split-cutover-handoff';
const HANDOFF_SERVICE_SEGMENT = 'service';

const HANDOFF_MESSAGE_TYPE = objectFreeze({
  PREPARE: 'split_cutover_handoff_prepare',
  READY: 'split_cutover_handoff_ready',
});

const HANDOFF_RESPONSE_STATE = objectFreeze({
  READY: 'ready',
  WAITING: 'waiting',
  REFUSED: 'refused',
});

const HANDOFF_CLOSURE_PHASE = objectFreeze({
  CLOSING: 'closing',
  QUERY_PLANE_READY: 'query_plane_ready',
});

function buildSplitCutoverHandoffAddress(nodeId) {
  return `${nodeId}/${HANDOFF_SERVICE_SEGMENT}/${HANDOFF_HANDLER_ID}`;
}

export {
  HANDOFF_CLOSURE_PHASE,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_RESPONSE_STATE,
  buildSplitCutoverHandoffAddress,
};
