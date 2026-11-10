// Project configuration is a projection. The profile and routed owners retain authority.
import fs from 'node:fs';
import path from 'node:path';
import {parse} from 'smol-toml';
import {sha256} from './profile.js';
import {createOwnedDirectory, ownedPath} from './paths.js';
import {INSTALLATION_STATUS, PROFILE_CHANGE_REFUSAL, TOOLING_ACTION,
  TOOLING_ENTRYPOINT, TOOLING_SERVER} from './host-protocol.js';

const INSTALLATION_SCHEMA = 'quest-tooling-installation/1';
const SERENA_OVERRIDE = '.serena/project.local.yml';
const MCP_SERVERS_FIELD = 'mcp_servers';
const KEY_SEPARATOR = ',';
const LINE_SEPARATOR = '\n';
const OPTIONAL_SERVER_SETTING = 'required = false';
const RETAINED_CACHE_NOTICE = 'retained, inactive; historical evidence unchanged';
const EXCLUSIVE_CREATE = 'wx';
const PRIVATE_FILE_MODE = 0o600;
const REFUSAL = Object.freeze({
  CONFIG_MARKERS_INVALID: 'tooling_config_markers_invalid',
  UNMANAGED_SERENA_OVERRIDE: 'tooling_unmanaged_serena_override',
  SETUP_INTERRUPTED: 'tooling_setup_interrupted: run recover',
  SERVER_COLLISION: 'tooling_server_collision',
  CONFIGURATION_COLLISION: 'tooling_configuration_collision',
  CONFIGURATION_DRIFT: 'tooling_configuration_drift',
  ACTION_INVALID: 'tooling_configuration_action_invalid',
  RESOURCE_PROJECTION_INVALID: 'tooling_resource_projection_invalid',
  RECOVERY_JOURNAL_INVALID: 'tooling_recovery_journal_invalid',
  RECOVERY_CONFLICT: 'tooling_recovery_conflict',
});


const CONFIG = '.codex/config.toml';
const STATE = '.codex/quest-tooling/installation.json';
const PENDING = '.codex/quest-tooling/pending.json';
const BEGIN = '\n# BEGIN LAGRANGE QUEST TOOLING\n';
const END = '# END LAGRANGE QUEST TOOLING\n';
const OWNED = ['.serena/project.yml', '.codex/quest-tooling/serena-home/serena_config.yml'];
const ENCODING = 'utf8';

function readOptional(root, relative) {
  const file = ownedPath(root, relative);
  if (!fs.existsSync(file)) return null;
  if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file) {
    throw new Error(`tooling_unsafe_configuration_path: ${relative}`);
  }
  return fs.readFileSync(file, ENCODING);
}

function atomicWrite(root, relative, bytes) {
  const file = ownedPath(root, relative);
  createOwnedDirectory(root, path.dirname(relative));
  const temp = `${file}.quest-tooling-${process.pid}`;
  fs.writeFileSync(temp, bytes, {flag: EXCLUSIVE_CREATE, mode: PRIVATE_FILE_MODE});
  try {
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function splitConfig(text) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 && end < 0) return {before: text, block: null, after: ''};
  if (start < 0 || end < start || text.indexOf(BEGIN, start + BEGIN.length) >= 0 ||
    text.indexOf(END, end + END.length) >= 0) throw new Error(REFUSAL.CONFIG_MARKERS_INVALID);
  return {before: text.slice(0, start), block: text.slice(start, end + END.length),
    after: text.slice(end + END.length)};
}

function renderBlock(root, profile) {
  const lines = [BEGIN.trimEnd()];
  for (const [name, server] of Object.entries(profile.servers)) {
    lines.push(`[mcp_servers.${name}]`, `command = ${JSON.stringify(process.execPath)}`,
      `args = ${JSON.stringify([path.join(root, TOOLING_ENTRYPOINT.CLI), TOOLING_ACTION.SERVE, name])}`,
      `cwd = ${JSON.stringify(root)}`, `enabled_tools = ${JSON.stringify(server.tools)}`,
      `startup_timeout_sec = ${server.startupTimeoutSeconds}`,
      `tool_timeout_sec = ${server.toolTimeoutSeconds}`, OPTIONAL_SERVER_SETTING, '');
  }
  lines.push(END.trimEnd(), '');
  return lines.join(LINE_SEPARATOR);
}

function inspectInstallation(root) {
  if (readOptional(root, SERENA_OVERRIDE) !== null) {
    throw new Error(REFUSAL.UNMANAGED_SERENA_OVERRIDE);
  }
  if (readOptional(root, PENDING) !== null) throw new Error(REFUSAL.SETUP_INTERRUPTED);
  const raw = readOptional(root, STATE);
  const state = raw === null ? null : JSON.parse(raw);
  const config = readOptional(root, CONFIG);
  const parts = splitConfig(config === null ? '' : config);
  const outside = parse(parts.before + parts.after);
  if (Object.hasOwn(outside, MCP_SERVERS_FIELD) &&
    [TOOLING_SERVER.SERENA, TOOLING_SERVER.CONTEXT7].some((name) =>
      Object.hasOwn(outside.mcp_servers, name))) throw new Error(REFUSAL.SERVER_COLLISION);
  if (state === null) {
    if (parts.block !== null || OWNED.some((file) => readOptional(root, file) !== null)) {
      throw new Error(REFUSAL.CONFIGURATION_COLLISION);
    }
    return {state, parts, config};
  }
  if (state.schema !== INSTALLATION_SCHEMA || state.root !== root ||
    parts.block === null || sha256(parts.block) !== state.blockDigest ||
    Object.keys(state.resources).sort().join(KEY_SEPARATOR) !== [...OWNED].sort().join(
      KEY_SEPARATOR)) {
    throw new Error(REFUSAL.CONFIGURATION_DRIFT);
  }
  for (const [file, digest] of Object.entries(state.resources)) {
    const bytes = readOptional(root, file);
    if (bytes === null || sha256(bytes) !== digest) throw new Error(`tooling_configuration_drift: ${file}`);
  }
  return {state, parts, config};
}

function transaction(root, writes, validate) {
  const journal = Object.entries(writes).map(([file, after]) => ({file,
    before: readOptional(root, file), after}));
  atomicWrite(root, PENDING, JSON.stringify(journal));
  for (const item of journal) {
    if (item.after === null) {
      if (fs.existsSync(path.join(root, item.file))) fs.unlinkSync(path.join(root, item.file));
    } else {
      atomicWrite(root, item.file, item.after);
    }
  }
  validate();
  fs.unlinkSync(path.join(root, PENDING));
}

function configurationTransition(snapshot) {
  switch (snapshot.action) {
  case TOOLING_ACTION.REMOVE:
    return snapshot.present ? INSTALLATION_STATUS.REMOVED : INSTALLATION_STATUS.ABSENT;
  case TOOLING_ACTION.SETUP:
    if (snapshot.present && !snapshot.profileMatches) return INSTALLATION_STATUS.PROFILE_CHANGED;
    break;
  case TOOLING_ACTION.UPGRADE:
    break;
  default:
    throw new Error(REFUSAL.ACTION_INVALID);
  }
  if (snapshot.present && snapshot.profileMatches && snapshot.blockMatches) {
    return INSTALLATION_STATUS.UNCHANGED;
  }
  return snapshot.present ? INSTALLATION_STATUS.UPGRADED : INSTALLATION_STATUS.INSTALLED;
}

function configure(root, profile, digest, action, resources, validate) {
  const {state, parts, config} = inspectInstallation(root);
  const block = action === TOOLING_ACTION.REMOVE ? null : renderBlock(root, profile);
  const transition = configurationTransition({action, present: state !== null,
    profileMatches: state !== null && state.profileDigest === digest,
    blockMatches: parts.block === block});
  switch (transition) {
  case INSTALLATION_STATUS.ABSENT:
    return {status: transition};
  case INSTALLATION_STATUS.REMOVED: {
    const outside = parts.before + parts.after;
    transaction(root, {...Object.fromEntries(OWNED.map((file) => [file, null])),
      [CONFIG]: outside.length === 0 && !state.configExisted ? null : outside,
      [STATE]: null}, () => {});
    return {status: transition, caches: RETAINED_CACHE_NOTICE};
  }
  case INSTALLATION_STATUS.PROFILE_CHANGED:
    throw new Error(PROFILE_CHANGE_REFUSAL);
  case INSTALLATION_STATUS.UNCHANGED:
    validate();
    return {status: transition, profileDigest: digest};
  case INSTALLATION_STATUS.INSTALLED:
  case INSTALLATION_STATUS.UPGRADED: {
    if (!resources ||
    Object.keys(resources).sort().join(KEY_SEPARATOR) !== [...OWNED].sort().join(KEY_SEPARATOR) ||
    !Object.values(resources).every((bytes) => typeof bytes === 'string')) {
      throw new Error(REFUSAL.RESOURCE_PROJECTION_INVALID);
    }
    const next = {schema: INSTALLATION_SCHEMA, root, profileDigest: digest,
      blockDigest: sha256(block),
      configExisted: state === null ? config !== null : state.configExisted,
      resources: Object.fromEntries(Object.entries(resources).map(([file, bytes]) =>
        [file, sha256(bytes)]))};
    transaction(root, {...resources, [CONFIG]: parts.before + block + parts.after,
      [STATE]: JSON.stringify(next, null, 2) + LINE_SEPARATOR}, validate);
    return {status: transition, profileDigest: digest};
  }
  }
}

function recover(root) {
  const raw = readOptional(root, PENDING);
  if (raw === null) return {status: INSTALLATION_STATUS.NO_INTERRUPTION};
  const journal = JSON.parse(raw);
  const allowed = new Set([...OWNED, CONFIG, STATE]);
  if (!Array.isArray(journal) || journal.some((item) => !allowed.has(item.file) ||
    ![item.before, item.after].every((value) => value === null || typeof value === 'string'))) {
    throw new Error(REFUSAL.RECOVERY_JOURNAL_INVALID);
  }
  for (const item of journal) {
    const current = readOptional(root, item.file);
    if (current !== item.before && current !== item.after) {
      throw new Error(REFUSAL.RECOVERY_CONFLICT);
    }
  }
  for (const item of journal) {
    if (item.before === null) {
      if (fs.existsSync(path.join(root, item.file))) fs.unlinkSync(path.join(root, item.file));
    } else atomicWrite(root, item.file, item.before);
  }
  fs.unlinkSync(path.join(root, PENDING));
  return {status: INSTALLATION_STATUS.RECOVERED};
}

export {configure, inspectInstallation, recover, renderBlock, splitConfig};
