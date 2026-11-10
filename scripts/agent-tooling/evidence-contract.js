// Wire vocabulary shared by the actual observation producer and its consumers.
const OBSERVATION_SCHEMA = 'quest-agent-tooling-observation/1';
const LIFECYCLE_SCHEMA = 'quest-tooling-lifecycle-observation/1';
const MAX_RECEIPT_BYTES = 256 * 1024;
const VERIFIER_PREFIX = 'subagent:';
const VERIFIED_LESSON_PREFIX = 'Verified lesson:';
const OBSERVATION_PHASE = Object.freeze({
  BASELINE: 'baseline', CANDIDATE: 'candidate', CONTROL: 'control',
  AUTHORING: 'authoring', LANDING: 'landing',
});
const OBSERVATION_KIND = Object.freeze({COMMAND: 'command', CODEX: 'codex'});
const CODEX_EVENT = Object.freeze({
  THREAD_STARTED: 'thread.started', TURN_COMPLETED: 'turn.completed', ITEM_COMPLETED: 'item.completed',
});
const CODEX_ITEM = Object.freeze({MCP: 'mcp_tool_call', COMMAND: 'command_execution'});
const TOOL_STATUS = Object.freeze({COMPLETED: 'completed'});
const TOOLING_QUEST = Object.freeze({
  PROFILE: 'quest-tooling-owner-and-profile', NAVIGATION: 'quest-tooling-serena-navigation',
  INVESTIGATION: 'quest-tooling-systematic-investigation', REVIEW: 'quest-tooling-review-and-evidence',
  LEARNING: 'quest-tooling-verified-learning', DOCUMENTATION: 'quest-tooling-versioned-documentation',
  LIFECYCLE: 'quest-tooling-lifecycle-and-upgrades', PILOT: 'quest-tooling-real-pilot-acceptance',
});

export {CODEX_EVENT, CODEX_ITEM, LIFECYCLE_SCHEMA, MAX_RECEIPT_BYTES, OBSERVATION_KIND,
  OBSERVATION_PHASE, OBSERVATION_SCHEMA, TOOL_STATUS, TOOLING_QUEST, VERIFIER_PREFIX,
  VERIFIED_LESSON_PREFIX};
