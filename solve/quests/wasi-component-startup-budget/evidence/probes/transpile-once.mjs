import fs from 'node:fs'; import {parentPort, workerData} from 'node:worker_threads';
import {transpileBytes} from '@bytecodealliance/jco-transpile';
const b = new Uint8Array(fs.readFileSync(workerData)); const t = Date.now();
await transpileBytes(b,
  {emitTypescriptDeclarations: false,
    instantiation: 'async',
    name: 'request-cell'});
parentPort.postMessage(Date.now()-t);
