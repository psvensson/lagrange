import {TIDB_REFERENCE_DEFAULTS} from './tidb-reference-lifecycle.js';

const TIKV_DATA_DIR = '/var/lib/tikv';
const DATA_DIR_PREFIX = '--data-dir=';
const SAFE_PATH_PATTERN = /^\/[A-Za-z0-9._/-]+$/u;

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySome = Function.call.bind(Array.prototype.some);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

function normalizePath(value, label) {
  const path = stringTrim(String(value || ''));
  if (!SAFE_PATH_PATTERN.test(path)) {
    throw new Error(`${label} must be an absolute safe path`);
  }
  return path;
}

function appendBind(hostConfigExtras, bind) {
  const current = Array.isArray(hostConfigExtras?.Binds) ?
    hostConfigExtras.Binds : [];
  if (arrayIncludes(current, bind)) return {...hostConfigExtras, Binds: [...current]};
  return {...hostConfigExtras, Binds: [...current, bind]};
}

function appendDataDir(command, containerPath) {
  const current = Array.isArray(command) ? [...command] : [];
  if (arraySome(current, (argument) => stringStartsWith(String(argument), DATA_DIR_PREFIX))) {
    throw new Error('TiKV persistent storage refuses an existing --data-dir');
  }
  current.push(`${DATA_DIR_PREFIX}${containerPath}`);
  return current;
}

function createTiKvPersistentStorageProvider(provider, options = {}) {
  if (!provider || typeof provider.createContainer !== 'function') {
    throw new Error('TiKV persistent storage requires provider.createContainer');
  }
  const hostPath = normalizePath(options.hostPath, 'TiKV persistent hostPath');
  const containerPath = normalizePath(
    options.containerPath || TIKV_DATA_DIR,
    'TiKV persistent containerPath',
  );
  const createContainer = provider.createContainer.bind(provider);

  return new Proxy(provider, {
    get(target, property) {
      if (property === 'createContainer') {
        return async (containerOptions = {}) => {
          if (containerOptions.image !== TIDB_REFERENCE_DEFAULTS.tikvImage) {
            return createContainer(containerOptions);
          }
          return createContainer({
            ...containerOptions,
            command: appendDataDir(containerOptions.command, containerPath),
            hostConfigExtras: appendBind(
              containerOptions.hostConfigExtras,
              `${hostPath}:${containerPath}`,
            ),
          });
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function tikvPersistentStorageEvidence(inspect, options = {}) {
  const hostPath = normalizePath(options.hostPath, 'TiKV persistent hostPath');
  const containerPath = normalizePath(
    options.containerPath || TIKV_DATA_DIR,
    'TiKV persistent containerPath',
  );
  const bind = `${hostPath}:${containerPath}`;
  const binds = Array.isArray(inspect?.HostConfig?.Binds) ?
    inspect.HostConfig.Binds : [];
  const command = Array.isArray(inspect?.Config?.Cmd) ? inspect.Config.Cmd : [];
  const dataDirArgument = `${DATA_DIR_PREFIX}${containerPath}`;
  return Object.freeze({
    hostPath,
    containerPath,
    bind,
    bindPresent: arrayIncludes(binds, bind),
    dataDirArgument,
    dataDirPresent: arrayIncludes(command, dataDirArgument),
    valid: arrayIncludes(binds, bind) && arrayIncludes(command, dataDirArgument),
  });
}

export {
  createTiKvPersistentStorageProvider,
  tikvPersistentStorageEvidence,
};
