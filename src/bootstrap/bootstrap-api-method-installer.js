function installBootstrapApiMethods(BootstrapAPI, methods) {
  const descriptors = {};
  for (const [name, value] of Object.entries(methods)) {
    descriptors[name] = {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    };
  }
  Object.defineProperties(BootstrapAPI.prototype, descriptors);
}

export {installBootstrapApiMethods};
