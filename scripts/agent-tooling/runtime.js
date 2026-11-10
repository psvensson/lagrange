// Bind the installed executable and resolved dependencies, not just its label.
import fs from 'node:fs';
import path from 'node:path';
import {ownedPath} from './paths.js';
import {sha256} from './profile.js';
import {INSTALLATION_STATUS} from './host-protocol.js';

const DEPENDENCY_PATH = Object.freeze({
  PACKAGE: 'package.json',
  LOCK: 'package-lock.json',
  MODULES: 'node_modules',
  DISTRIBUTION: 'dist',
  COMPILER_ENTRY: 'lib/tsserver.js',
});
const BACKEND_STATUS = Object.freeze({
  NOT_INSTALLED: 'backend-not-installed',
});
const PARSER_PACKAGE = 'smol-toml';
const MODULE_TYPE = 'module';
const JAVASCRIPT_EXTENSION = '.js';
const RUNTIME_SCHEMA = 'quest-tooling-runtime/1';
const TEXT_ENCODING = 'utf8';
const EXCLUSIVE_CREATE = 'wx';
const PRIVATE_FILE_MODE = 0o600;
const REFUSAL = Object.freeze({
  CONFIGURATION_PARSER_DECLARATION_MISMATCH: 'tooling_configuration_parser_declaration_mismatch',
  CONFIGURATION_PARSER_PATH_INVALID: 'tooling_configuration_parser_path_invalid',
  WORKSPACE_COMPILER_VERSION_MISMATCH: 'tooling_workspace_compiler_version_mismatch',
  LANGUAGE_SERVER_VERSION_MISMATCH: 'tooling_language_server_version_mismatch',
  RUNTIME_SYMLINK_ESCAPE: 'tooling_runtime_symlink_escape',
  RUNTIME_FILE_UNSUPPORTED: 'tooling_runtime_file_unsupported',
  RUNTIME_UNVERIFIED: 'tooling_runtime_unverified',
  RUNTIME_DRIFT: 'tooling_runtime_drift',
  CONTEXT7_INTEGRITY_MISMATCH: 'tooling_context7_integrity_mismatch',
});


function runtimeDirectory(profile) {
  return `.codex/quest-tooling/context7/${profile.upstreams.context7.version}`;
}

function parserIdentity(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, DEPENDENCY_PATH.PACKAGE)));
  const lock = JSON.parse(fs.readFileSync(path.join(root, DEPENDENCY_PATH.LOCK)));
  const declared = manifest.devDependencies[PARSER_PACKAGE];
  const pinned = lock.packages['node_modules/smol-toml'];
  const directory = fs.realpathSync(path.join(root, 'node_modules/smol-toml'));
  const packageBytes = fs.readFileSync(path.join(directory, DEPENDENCY_PATH.PACKAGE));
  const installed = JSON.parse(packageBytes);
  if (manifest.type !== MODULE_TYPE || declared !== installed.version ||
    lock.packages[''].devDependencies[PARSER_PACKAGE] !== declared || pinned.version !== declared ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(pinned.integrity)) {
    throw new Error(REFUSAL.CONFIGURATION_PARSER_DECLARATION_MISMATCH);
  }
  const files = {'package.json': sha256(packageBytes)};
  for (const name of fs.readdirSync(path.join(directory, DEPENDENCY_PATH.DISTRIBUTION)).sort()) {
    if (name.endsWith(JAVASCRIPT_EXTENSION)) {
      const file = path.join(directory, DEPENDENCY_PATH.DISTRIBUTION, name);
      if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file) {
        throw new Error(REFUSAL.CONFIGURATION_PARSER_PATH_INVALID);
      }
      files[`dist/${name}`] = sha256(fs.readFileSync(file));
    }
  }
  return {package: PARSER_PACKAGE, version: installed.version, integrity: pinned.integrity,
    rootType: manifest.type, contentDigest: sha256(JSON.stringify(files))};
}

function backendIdentity(root, profile) {
  // Serena reports using the workspace compiler. Its installed identity is
  // checked directly; a package label in the profile is not a runtime result.
  const workspace = path.join(root, 'node_modules/typescript');
  const compilerBytes = fs.readFileSync(path.join(workspace, DEPENDENCY_PATH.PACKAGE));
  const compiler = JSON.parse(compilerBytes);
  if (compiler.version !== profile.backend.compilerVersion) {
    throw new Error(REFUSAL.WORKSPACE_COMPILER_VERSION_MISMATCH);
  }
  const home = '.codex/quest-tooling/serena-home/language_servers/static/' +
    'TypeScriptLanguageServer/ts-lsp/node_modules/typescript-language-server';
  const packagePath = ownedPath(root, `${home}/package.json`);
  if (!fs.existsSync(packagePath)) {
    return {status: BACKEND_STATUS.NOT_INSTALLED,
      compilerVersion: compiler.version, compilerDigest: sha256(compilerBytes)};
  }
  const serverBytes = fs.readFileSync(packagePath);
  const server = JSON.parse(serverBytes);
  if (server.version !== profile.backend.serverVersion) {
    throw new Error(REFUSAL.LANGUAGE_SERVER_VERSION_MISMATCH);
  }
  return {status: INSTALLATION_STATUS.INSTALLED, compilerVersion: compiler.version,
    compilerDigest: sha256(compilerBytes),
    compilerEntryDigest: sha256(fs.readFileSync(path.join(workspace,
      DEPENDENCY_PATH.COMPILER_ENTRY))),
    serverVersion: server.version, serverDigest: sha256(serverBytes),
    serverEntryDigest: sha256(fs.readFileSync(ownedPath(root, `${home}/lib/cli.mjs`)))};
}

function runtimeFiles(root, profile) {
  const relative = runtimeDirectory(profile);
  const directory = ownedPath(root, relative);
  const files = {};
  const visit = (file) => {
    const absolute = path.join(directory, file);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      const target = fs.realpathSync(absolute);
      if (!target.startsWith(`${directory}${path.sep}`)) {
        throw new Error(REFUSAL.RUNTIME_SYMLINK_ESCAPE);
      }
      files[file] = `link:${fs.readlinkSync(absolute)}`;
    } else if (stat.isDirectory()) {
      for (const child of fs.readdirSync(absolute).sort()) visit(`${file}/${child}`);
    } else if (stat.isFile()) {
      files[file] = sha256(fs.readFileSync(absolute));
    } else throw new Error(REFUSAL.RUNTIME_FILE_UNSUPPORTED);
  };
  for (const file of [DEPENDENCY_PATH.PACKAGE, DEPENDENCY_PATH.LOCK,
    DEPENDENCY_PATH.MODULES]) visit(file);
  return files;
}

function readRuntime(root, profile) {
  const directory = runtimeDirectory(profile);
  const file = ownedPath(root, `${directory}/runtime.json`);
  if (!fs.existsSync(file)) throw new Error(REFUSAL.RUNTIME_UNVERIFIED);
  const bytes = fs.readFileSync(file);
  const record = JSON.parse(bytes);
  const dependency = profile.upstreams.context7;
  if (record.schema !== RUNTIME_SCHEMA || record.package !== dependency.package ||
    record.version !== dependency.version || record.integrity !== dependency.integrity ||
    JSON.stringify(record.files) !== JSON.stringify(runtimeFiles(root, profile))) {
    throw new Error(REFUSAL.RUNTIME_DRIFT);
  }
  return {manifestDigest: sha256(bytes), version: record.version,
    fileCount: Object.keys(record.files).length};
}

function recordRuntime(root, profile) {
  const dependency = profile.upstreams.context7;
  const directory = runtimeDirectory(profile);
  const lock = JSON.parse(fs.readFileSync(ownedPath(root, `${directory}/package-lock.json`), TEXT_ENCODING));
  const entry = lock.packages[`node_modules/${dependency.package}`];
  const installed = JSON.parse(fs.readFileSync(ownedPath(root,
    `${directory}/node_modules/${dependency.package}/package.json`), TEXT_ENCODING));
  if (entry.version !== dependency.version || entry.integrity !== dependency.integrity ||
    installed.version !== dependency.version || installed.name !== dependency.package) {
    throw new Error(REFUSAL.CONTEXT7_INTEGRITY_MISMATCH);
  }
  const record = {schema: RUNTIME_SCHEMA, package: dependency.package,
    version: dependency.version, integrity: dependency.integrity,
    files: runtimeFiles(root, profile)};
  fs.writeFileSync(ownedPath(root, `${directory}/runtime.json`), JSON.stringify(record),
    {flag: EXCLUSIVE_CREATE, mode: PRIVATE_FILE_MODE});
  return readRuntime(root, profile);
}

export {backendIdentity, parserIdentity, readRuntime, recordRuntime, runtimeDirectory};
