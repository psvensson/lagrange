// The project host integration's public commands, installation outcomes and MCP
// identities. Profile validation, projection, launch and evidence consume these.
const TOOLING_ACTION = Object.freeze({
  SETUP: 'setup', STATUS: 'status', UPGRADE: 'upgrade', REMOVE: 'remove',
  RECOVER: 'recover', SERVE: 'serve', MATERIALIZE: 'materialize', PUBLICATION: 'publication',
});
const INSTALLATION_STATUS = Object.freeze({
  ABSENT: 'absent', CONFIGURED: 'configured', PROFILE_CHANGED: 'profile-changed',
  INSTALLED: 'installed', UNCHANGED: 'unchanged', UPGRADED: 'upgraded', REMOVED: 'removed',
  NO_INTERRUPTION: 'no-interrupted-setup', RECOVERED: 'recovered-original-configuration',
});
const TOOLING_SERVER = Object.freeze({SERENA: 'quest_serena', CONTEXT7: 'quest_context7'});
const TOOLING_EXECUTABLE = Object.freeze({
  CODEX: 'codex', UV: 'uv', NODE: 'node', NPM: 'npm', PYTHON: 'python', GIT: 'git',
});
const TOOLING_ENTRYPOINT = Object.freeze({
  CLI: 'scripts/agent-tooling/cli.js', SERENA_CONFIG: 'scripts/agent-tooling/serena-config.py',
  SERENA_HOME: '.codex/quest-tooling/serena-home',
});
const MCP_TOOL = Object.freeze({
  INSTRUCTIONS: 'initial_instructions', OVERVIEW: 'get_symbols_overview',
  SYMBOL: 'find_symbol', REFERENCES: 'find_referencing_symbols',
  SEARCH: 'search_for_pattern', RESTART: 'restart_language_server',
  LIBRARY: 'resolve-library-id', DOCUMENTATION: 'query-docs',
});
const PROFILE_CHANGE_REFUSAL = 'tooling_profile_changed: review pins, then use upgrade';

export {INSTALLATION_STATUS, MCP_TOOL, PROFILE_CHANGE_REFUSAL, TOOLING_ACTION, TOOLING_ENTRYPOINT,
  TOOLING_EXECUTABLE, TOOLING_SERVER};
