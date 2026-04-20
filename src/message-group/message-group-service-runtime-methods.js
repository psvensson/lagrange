import { createMessageGroupServiceRuntimeMethodsClassPart2 } from './message-group-service-runtime-methods-class-part-2.js';

function createMessageGroupServiceRuntimeMethods(deps = {}) {
  const MessageGroupServiceRuntimeMethods =
    createMessageGroupServiceRuntimeMethodsClassPart2(deps);

  const methodNames = [];
  const seenMethodNames = new Set();
  let prototype = MessageGroupServiceRuntimeMethods.prototype;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === "constructor" || seenMethodNames.has(name)) {
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

export { createMessageGroupServiceRuntimeMethods };
