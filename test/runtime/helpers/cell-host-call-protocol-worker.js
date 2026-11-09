import {parentPort, workerData} from 'node:worker_threads';

const protocolPromise = import(workerData.protocolModuleUrl);
let client = null;

parentPort.on('message', (instruction) => {
  void protocolPromise.then((protocol) => {
    if (instruction.op === 'create-client') {
      client = protocol.createWorkerHostCallClient({
        deadlineMs: Date.now() + instruction.waitBudgetMs,
        descriptor: workerData.descriptor,
        maxCalls: instruction.maxCalls,
        postToParent: (request) => parentPort.postMessage(request),
      });
      parentPort.postMessage({kind: 'created'});
      return;
    }
    try {
      const ok = client.call(instruction.name, instruction.argumentsJson);
      parentPort.postMessage({kind: 'call-result', ok});
    } catch (error) {
      parentPort.postMessage({
        kind: 'call-result',
        payload: error.payload ?? {message: error.message},
      });
    }
  });
});

parentPort.postMessage({kind: 'online'});
