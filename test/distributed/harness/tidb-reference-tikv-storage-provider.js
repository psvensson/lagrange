import {TIDB_REFERENCE_DEFAULTS} from './tidb-reference-lifecycle.js';

const TIKV_DATA_DIR = '/var/lib/tikv';
const DATA_DIR_PREFIX = '--data-dir=';
const SAFE_PATH_PATTERN = /^\/[A-Za-z0-9._/-]+$/u;

function normalizePath(value, label) {
  const path = String(value || '').trim();
  if (!SAFE_PATH_PATTERN.test(path)) {
    throw new Error(`${label} must be an absolute safe path`);
  }
  return path;
}

function appendBind(hostConfigExtras, bind) {
  const current = Array.isArray(hostConfigExtras?.Binds) ?
    hostConfigExtras.Binds : [];
  if (current.includes(bind)) return {...hostConfigExtras, Binds: [...current]};
  return {...hostConfigExtras, Binds: [...current, bind]};
}

function appendDataDir(command, containerPath) {
  const current = Array.isArray(command) ? [...command] : [];
  if (current.some((argument) => String(argument).startsWith(DATA_DIR_PREFIX))) {
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
    bindPresent: binds.includes(bind),
    dataDirArgument,
    dataDirPresent: command.includes(dataDirArgument),
    valid: binds.includes(bind) && command.includes(dataDirArgument),
  });
}

export {
  TIKV_DATA_DIR as TIDB_REFERENCE_TIKV_DATA_DIR,
  createTiKvPersistentStorageProvider,
  tikvPersistentStorageEvidence,
};
