import {TIDB_REFERENCE_DEFAULTS} from './tidb-reference-lifecycle.js';

const TYPE_FUNCTION = 'function';

function normalizeResourceLimits(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return Object.freeze({...value});
}

function createTiDbReferenceLifecycleResourceProvider(provider, options = {}) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('TiDB reference lifecycle resource policy requires provider');
  }
  if (typeof provider.createContainer !== TYPE_FUNCTION) {
    throw new Error(
      'TiDB reference lifecycle resource policy requires provider.createContainer',
    );
  }

  const tikvResourceLimits = normalizeResourceLimits(
    options.tikvResourceLimits,
    'tikvResourceLimits',
  );
  if (tikvResourceLimits === null) return provider;

  const tikvImage = options.tikvImage || TIDB_REFERENCE_DEFAULTS.tikvImage;
  const createContainer = provider.createContainer.bind(provider);

  return new Proxy(provider, {
    get(target, property) {
      if (property === 'createContainer') {
        return async (containerOptions) => {
          if (containerOptions?.image !== tikvImage) {
            return createContainer(containerOptions);
          }
          return createContainer({
            ...containerOptions,
            resourceLimits: {
              ...(containerOptions.resourceLimits || {}),
              ...tikvResourceLimits,
            },
          });
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === TYPE_FUNCTION ? value.bind(target) : value;
    },
  });
}

export {
  createTiDbReferenceLifecycleResourceProvider,
};
