#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {configure, inspectInstallation, recover} from './configuration.js';
import {loadProfile, projectRoot} from './profile.js';
import {refuseProbe, requireSuccess, run, service} from './process.js';
import {createOwnedDirectory, ownedPath} from './paths.js';
import {assertNoServices, withLifecycleLock} from './lifecycle-lock.js';
import {backendIdentity, readRuntime, recordRuntime, runtimeDirectory} from './runtime.js';
import {readLog} from '../solve/store.js';
import {materializeEvidence} from '../solve/evidence-store.js';
import {readPublishReceipt} from '../publish-head.js';
import {ID_PATTERN} from '../solve/schema.js';
import {INSTALLATION_STATUS, PROFILE_CHANGE_REFUSAL, TOOLING_ACTION, TOOLING_ENTRYPOINT,
  TOOLING_EXECUTABLE, TOOLING_SERVER} from './host-protocol.js';

const HOST_FLAG = Object.freeze({
  AGENT_INTERFACE: '--agent-interface',
  CONTEXT: '--context',
  GUI: '--enable-gui-log-window',
  DASHBOARD: '--enable-web-dashboard',
  FROM: '--from',
  BACKEND: '--language-backend',
  MODE: '--mode',
  OPEN_DASHBOARD: '--open-web-dashboard',
  PROJECT: '--project',
  TRANSPORT: '--transport',
});
const SERENA_OPTION = Object.freeze({
  CONTEXT: 'codex',
  BACKEND: 'LSP',
  DISABLED: 'false',
  MODE: 'planning',
  INTERFACE: 'tools',
  EXECUTABLE: 'serena',
  START: 'start-mcp-server',
});
const UV_COMMAND = Object.freeze({
  TOOL: 'tool',
  RUN: 'run',
});
const RUNTIME_SUFFIX = Object.freeze({
  MODULES: '/node_modules',
  LOCK: '/package-lock.json',
  MANIFEST: '/package.json',
  RECEIPT: '/runtime.json',
});
const CLI_RESULT = Object.freeze({
  VERIFIED_RUNTIME: 'verified-existing-runtime',
  INSTALLED_RUNTIME: 'installed-runtime',
  MATERIALIZED: 'materialized-and-hash-verified',
});
const HOST_TRANSPORT = Object.freeze({
  STDIO: 'stdio',
  EMPTY_ENVIRONMENT: '[]',
});
const RECORD_KIND = Object.freeze({
  FINDING: 'finding',
  EVIDENCE: 'evidence',
});
const TEXT_ENCODING = 'utf8';
const EVIDENCE_PREFIX = 'sha256:';
const STATUS_EVIDENCE_LIMIT = 'configuration state only; live support requires retained client evidence';
const USAGE = 'usage: agent-tooling/cli.js setup|status|upgrade|remove|recover|serve|materialize|publication [name]';
const REFUSAL = Object.freeze({
  NODE_OR_PLATFORM_MISMATCH: 'tooling_node_or_platform_mismatch',
  HOST_VERSION_MISMATCH: 'tooling_host_version_mismatch: review and explicitly update the profile',
  RUNTIME_UNVERIFIED: 'tooling_runtime_unverified: preserve and inspect the incomplete installation',
  CONTEXT7_MANIFEST_DRIFT: 'tooling_context7_manifest_drift: remove the reviewed old runtime before upgrading',
  PROFILE_NOT_ACTIVE: 'tooling_profile_not_active',
  CONTEXT7_RUNTIME_MISSING: 'tooling_context7_runtime_missing',
  QUEST_ID_INVALID: 'tooling_quest_id_invalid',
});


function versions(root, profile) {
  if (process.version !== `v${profile.runtime.node}` || process.platform !== profile.runtime.platform) {
    throw new Error(REFUSAL.NODE_OR_PLATFORM_MISMATCH);
  }
  const observations = [run(root, TOOLING_EXECUTABLE.CODEX, ['--version']), run(root, TOOLING_EXECUTABLE.UV, ['--version'])];
  if (requireSuccess(observations[0]) !== `codex-cli ${profile.host.version}` ||
    requireSuccess(observations[1]) !== `uv ${profile.runtime.uv}`) {
    throw new Error(REFUSAL.HOST_VERSION_MISMATCH);
  }
  return observations;
}

function installContext7(root, profile) {
  const dependency = profile.upstreams.context7;
  const relative = runtimeDirectory(profile);
  const dir = ownedPath(root, relative);
  if (fs.existsSync(ownedPath(root, `${relative}/runtime.json`))) {
    return {status: CLI_RESULT.VERIFIED_RUNTIME, ...readRuntime(root, profile)};
  }
  const packageFile = ownedPath(root, `${relative}/package.json`);
  ownedPath(root, `${relative}/package-lock.json`);
  ownedPath(root, `${relative}/node_modules`);
  if (fs.existsSync(ownedPath(root, `${relative}/node_modules`))) {
    throw new Error(REFUSAL.RUNTIME_UNVERIFIED);
  }
  createOwnedDirectory(root, relative);
  const manifest = JSON.stringify({name: 'lagrange-quest-context7', private: true,
    dependencies: {[dependency.package]: dependency.version}}, null, 2) + '\n';
  if (fs.existsSync(packageFile) && fs.readFileSync(packageFile, TEXT_ENCODING) !== manifest) {
    throw new Error(REFUSAL.CONTEXT7_MANIFEST_DRIFT);
  }
  fs.writeFileSync(packageFile, manifest);
  const install = run(dir, TOOLING_EXECUTABLE.NPM, ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  requireSuccess(install);
  return {status: CLI_RESULT.INSTALLED_RUNTIME, observation: install, ...recordRuntime(root,
    profile)};
}

function validateHostConfiguration(root, profile) {
  const observations = [];
  for (const name of Object.keys(profile.servers)) {
    const observation = run(root, TOOLING_EXECUTABLE.CODEX, ['--no-daemon', '-C', root,
      'mcp', 'get', name, '--json']);
    const actual = JSON.parse(requireSuccess(observation));
    const args = [path.join(root, TOOLING_ENTRYPOINT.CLI), TOOLING_ACTION.SERVE, name];
    if (actual.name !== name || actual.enabled !== true ||
      actual.transport.type !== HOST_TRANSPORT.STDIO ||
      actual.transport.command !== process.execPath ||
      JSON.stringify(actual.transport.args) !== JSON.stringify(args) ||
      actual.transport.cwd !== root ||
      actual.transport.env !== null || JSON.stringify(
      actual.transport.env_vars) !== HOST_TRANSPORT.EMPTY_ENVIRONMENT ||
      actual.disabled_tools !== null ||
      actual.startup_timeout_sec !== profile.servers[name].startupTimeoutSeconds ||
      actual.tool_timeout_sec !== profile.servers[name].toolTimeoutSeconds ||
      JSON.stringify(actual.enabled_tools) !== JSON.stringify(profile.servers[name].tools)) {
      throw new Error(`tooling_host_configuration_mismatch: ${name}`);
    }
    observations.push(observation);
  }
  return observations;
}

function resourcesFromSerena(root, profile) {
  const source = `git+${profile.upstreams.serena.repository}@${profile.upstreams.serena.revision}`;
  const result = run(root, TOOLING_EXECUTABLE.UV, [UV_COMMAND.TOOL, UV_COMMAND.RUN,
    HOST_FLAG.FROM, source, TOOLING_EXECUTABLE.PYTHON,
    TOOLING_ENTRYPOINT.SERENA_CONFIG, root, JSON.stringify(profile.servers.quest_serena.tools)]);
  // The generated private configuration includes a service-local secret. Never
  // include those bytes in command receipts or console output.
  if (result.exitCode !== 0 || result.error !== null) {
    throw new Error(`tooling_serena_configuration_unavailable: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function launch(root, profile, digest, name) {
  const {state} = inspectInstallation(root);
  if (state === null || state.profileDigest !== digest) throw new Error(REFUSAL.PROFILE_NOT_ACTIVE);
  if (!Object.hasOwn(profile.servers, name)) throw new Error(`tooling_unknown_server: ${name}`);
  versions(root, profile);
  if (name === TOOLING_SERVER.SERENA) {
    backendIdentity(root, profile);
    const source = `git+${profile.upstreams.serena.repository}@${profile.upstreams.serena.revision}`;
    return service(root, name, TOOLING_EXECUTABLE.UV, [UV_COMMAND.TOOL, UV_COMMAND.RUN,
      HOST_FLAG.FROM, source, SERENA_OPTION.EXECUTABLE,
      SERENA_OPTION.START, HOST_FLAG.PROJECT, root, HOST_FLAG.CONTEXT, SERENA_OPTION.CONTEXT,
      HOST_FLAG.MODE, SERENA_OPTION.MODE, HOST_FLAG.AGENT_INTERFACE, SERENA_OPTION.INTERFACE,
      HOST_FLAG.BACKEND, SERENA_OPTION.BACKEND, HOST_FLAG.TRANSPORT, HOST_TRANSPORT.STDIO,
      HOST_FLAG.DASHBOARD, SERENA_OPTION.DISABLED, HOST_FLAG.GUI, SERENA_OPTION.DISABLED,
      HOST_FLAG.OPEN_DASHBOARD, SERENA_OPTION.DISABLED], {...process.env,
      SERENA_HOME: path.join(root, TOOLING_ENTRYPOINT.SERENA_HOME)});
  }
  readRuntime(root, profile);
  const entry = ownedPath(root, `${runtimeDirectory(profile)}/` +
    'node_modules/@upstash/context7-mcp/dist/index.js');
  if (!fs.existsSync(entry)) throw new Error(REFUSAL.CONTEXT7_RUNTIME_MISSING);
  return service(root, name, process.execPath, [entry], process.env);
}

async function main() {
  const [action, name] = process.argv.slice(2);
  const root = projectRoot(process.cwd());
  const {profile, digest} = loadProfile(root);
  switch (action) {
  case TOOLING_ACTION.STATUS: {
    const {state} = inspectInstallation(root);
    return {status: state === null ? INSTALLATION_STATUS.ABSENT : state.profileDigest === digest ?
      INSTALLATION_STATUS.CONFIGURED : INSTALLATION_STATUS.PROFILE_CHANGED, root, profileDigest: digest,
    execution: STATUS_EVIDENCE_LIMIT};
  }
  case TOOLING_ACTION.PUBLICATION:
    return readPublishReceipt(root, name);
  case TOOLING_ACTION.MATERIALIZE: {
    refuseProbe();
    if (!ID_PATTERN.test(name)) throw new Error(REFUSAL.QUEST_ID_INVALID);
    const materialized = [];
    for (const entry of readLog(root, name)) {
      if (entry.type === RECORD_KIND.FINDING && entry.kind === RECORD_KIND.EVIDENCE &&
        typeof entry.evidence === 'string' && entry.evidence.startsWith(EVIDENCE_PREFIX) &&
        typeof entry.asset === 'string') {
        materialized.push(materializeEvidence({root, record: {
          sha256: entry.evidence.slice(EVIDENCE_PREFIX.length), bytes: entry.bytes,
          asset: entry.asset, url: entry.url,
        }}));
      }
    }
    return {status: CLI_RESULT.MATERIALIZED, materialized};
  }
  case TOOLING_ACTION.SERVE: {
    refuseProbe();
    const result = await withLifecycleLock(root, action, () => launch(root, profile, digest, name));
    process.exitCode = result.exitCode === 0 ? 0 : 1;
    return null;
  }
  case TOOLING_ACTION.RECOVER:
    refuseProbe();
    return withLifecycleLock(root, action, () => {
      assertNoServices(root, profile);
      return recover(root);
    });
  case TOOLING_ACTION.SETUP:
  case TOOLING_ACTION.UPGRADE:
  case TOOLING_ACTION.REMOVE: {
    refuseProbe();
    // Ownership, local overrides and containment are checked before installs.
    inspectInstallation(root);
    for (const suffix of ['', RUNTIME_SUFFIX.MANIFEST, RUNTIME_SUFFIX.LOCK, RUNTIME_SUFFIX.MODULES, RUNTIME_SUFFIX.RECEIPT]) {
      ownedPath(root, runtimeDirectory(profile) + suffix);
    }
    return withLifecycleLock(root, action, () => {
      assertNoServices(root, profile);
      const {state} = inspectInstallation(root);
      if (action === TOOLING_ACTION.REMOVE) return configure(root, profile, digest, action);
      if (state !== null && state.profileDigest !== digest && action !== TOOLING_ACTION.UPGRADE) {
        throw new Error(PROFILE_CHANGE_REFUSAL);
      }
      const host = versions(root, profile);
      const dependency = installContext7(root, profile);
      const resources = resourcesFromSerena(root, profile);
      let hostConfiguration;
      const result = configure(root, profile, digest, action, resources, () => {
        hostConfiguration = validateHostConfiguration(root, profile);
      });
      return {...result, host, dependency, hostConfiguration};
    });
  }
  default:
    throw new Error(USAGE);
  }
}

try {
  const result = await main();
  if (result !== null) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`tooling_unavailable: ${error.message}`);
  process.exitCode = 1;
}
