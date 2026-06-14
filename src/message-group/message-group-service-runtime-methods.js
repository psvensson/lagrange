import {createMessageGroupServiceRuntimeMethodsClass} from './message-group-service-runtime-methods-class.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function createMessageGroupServiceRuntimeMethods(deps = {}) {
  const MessageGroupServiceRuntimeMethods =
    createMessageGroupServiceRuntimeMethodsClass(deps);

  const methodNames = [];
  const seenMethodNames = new Set();
  let prototype = MessageGroupServiceRuntimeMethods.prototype;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === LOCAL_STR_CONSTRUCTOR || seenMethodNames.has(name)) {
        continue;
      }
      seenMethodNames.add(name);
      methodNames.push(name);
    }
    prototype = Object.getPrototypeOf(prototype);
  }

  return methodNames
    .reduce((accumulator, name) => {
      accumulator[name] = MessageGroupServiceRuntimeMethods.prototype[name];
      return accumulator;
    }, {});
}

export {createMessageGroupServiceRuntimeMethods};
