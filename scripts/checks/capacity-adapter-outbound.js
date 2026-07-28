const jsonStringify = JSON.stringify;

export function createCapacityAdapterOutbound(runtime = process) {
  let outbound = Promise.resolve();

  function write(message) {
    return new Promise((resolve, reject) => {
      const complete = (error) =>
        error === null || error === undefined ? resolve() : reject(error);
      try {
        if (typeof runtime.send === 'function') {
          runtime.send(message, complete);
          return;
        }
        runtime.stdout.write(`${jsonStringify(message)}\n`, complete);
      } catch (error) {
        reject(error);
      }
    });
  }

  return function sendCapacityAdapterMessage(message) {
    const next = () => write(message);
    outbound = outbound.then(next, next);
    return outbound;
  };
}
