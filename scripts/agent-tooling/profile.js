import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {MCP_TOOL} from './host-protocol.js';

const EXPECTED_PROFILE = Object.freeze({
  ID: 'lagrange-quest-tools',
  HOST: 'codex-cli',
  PLATFORM: 'linux',
  LANGUAGE: 'typescript',
  PACKAGE: '@upstash/context7-mcp',
  SERVERS: 'quest_context7,quest_serena',
  SKILLS: 'quest-navigate,quest-investigate,quest-review,quest-learn,quest-library-docs',
});
const UPSTREAM = Object.freeze({
  SUPERPOWERS: 'superpowers',
  COMPOUND: 'compoundEngineering',
  SERENA: 'serena',
});
const STEERING_FILE = Object.freeze({
  ENTRYPOINT: 'AGENTS.md',
  RULES: 'docs/steering/rules.md',
  ROUTER: 'docs/steering/router.md',
});
const LIST_SEPARATOR = ',';
const REFUSAL = Object.freeze({
  PROFILE_INVALID: 'tooling_profile_invalid',
  UNPINNED_UPSTREAM: 'tooling_unpinned_upstream: context7',
  CAPABILITY_CONTRACT_CHANGED: 'tooling_capability_contract_changed: review the profile owner',
  SERVER_CONTRACT_INVALID: 'tooling_server_contract_invalid',
});


const PROFILE_PATH = 'scripts/agent-tooling/profile.json';
const PROFILE_SCHEMA = 'quest-agent-tooling-profile/1';
const REVISION = /^[0-9a-f]{40}$/u;
const VERSION = /^\d+\.\d+\.\d+$/u;
const DIGEST = 'sha256';
const HEX = 'hex';
const TOOLS = Object.freeze({
  quest_serena: [MCP_TOOL.INSTRUCTIONS, MCP_TOOL.OVERVIEW, MCP_TOOL.SYMBOL,
    MCP_TOOL.REFERENCES, MCP_TOOL.SEARCH, MCP_TOOL.RESTART],
  quest_context7: [MCP_TOOL.LIBRARY, MCP_TOOL.DOCUMENTATION],
});

function sha256(bytes) {
  return createHash(DIGEST).update(bytes).digest(HEX);
}

function loadProfile(root) {
  const bytes = fs.readFileSync(path.join(root, PROFILE_PATH));
  const profile = JSON.parse(bytes);
  if (profile.schema !== PROFILE_SCHEMA || profile.id !== EXPECTED_PROFILE.ID ||
    profile.host?.name !== EXPECTED_PROFILE.HOST || !VERSION.test(profile.host.version) ||
    !VERSION.test(profile.runtime?.uv) || !VERSION.test(profile.runtime.node) ||
    profile.runtime.platform !== EXPECTED_PROFILE.PLATFORM ||
      profile.backend?.language !== EXPECTED_PROFILE.LANGUAGE ||
    !VERSION.test(profile.backend.compilerVersion) ||
    !VERSION.test(profile.backend.serverVersion)) {
    throw new Error(REFUSAL.PROFILE_INVALID);
  }
  for (const name of [UPSTREAM.SUPERPOWERS, UPSTREAM.COMPOUND, UPSTREAM.SERENA]) {
    if (!REVISION.test(profile.upstreams[name]?.revision)) {
      throw new Error(`tooling_unpinned_upstream: ${name}`);
    }
  }
  const dependency = profile.upstreams.context7;
  if (dependency?.package !== EXPECTED_PROFILE.PACKAGE || !VERSION.test(dependency.version) ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(dependency.integrity) ||
    !REVISION.test(dependency.documentationRevision)) {
    throw new Error(REFUSAL.UNPINNED_UPSTREAM);
  }
  const serverNames = Object.keys(profile.servers).sort();
  if (serverNames.join(LIST_SEPARATOR) !== EXPECTED_PROFILE.SERVERS ||
    profile.languages.join(LIST_SEPARATOR) !== EXPECTED_PROFILE.LANGUAGE ||
    profile.skills.join(LIST_SEPARATOR) !==
      EXPECTED_PROFILE.SKILLS) {
    throw new Error(REFUSAL.CAPABILITY_CONTRACT_CHANGED);
  }
  for (const [name, server] of Object.entries(profile.servers)) {
    if (JSON.stringify(server.tools) !== JSON.stringify(TOOLS[name]) ||
      !Number.isInteger(server.startupTimeoutSeconds) || server.startupTimeoutSeconds <= 0 ||
      !Number.isInteger(server.toolTimeoutSeconds) || server.toolTimeoutSeconds <= 0) {
      throw new Error(REFUSAL.SERVER_CONTRACT_INVALID);
    }
  }
  return {profile, digest: sha256(bytes)};
}

function projectRoot(candidate) {
  const root = fs.realpathSync(candidate);
  for (const file of [STEERING_FILE.ENTRYPOINT, STEERING_FILE.RULES, STEERING_FILE.ROUTER]) {
    if (!fs.statSync(path.join(root, file)).isFile()) throw new Error(`tooling_owner_missing: ${file}`);
  }
  return root;
}

export {PROFILE_PATH, loadProfile, projectRoot, sha256};
