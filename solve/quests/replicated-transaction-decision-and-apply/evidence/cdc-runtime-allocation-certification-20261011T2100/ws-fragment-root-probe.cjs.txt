'use strict';

const Receiver = require('/app/node_modules/ws/lib/receiver.js');

if (typeof global.gc !== 'function') throw new Error('run with --expose-gc');

function frame(fin, opcode, bytes, fill) {
  const wire = Buffer.allocUnsafeSlow(4 + bytes);
  wire[0] = (fin ? 0x80 : 0) | opcode;
  wire[1] = 126;
  wire.writeUInt16BE(bytes, 2);
  wire.fill(fill, 4);
  return wire;
}

function collect() {
  for (let i = 0; i < 8; i++) {
    // Allocate between collections so V8 performs full weak processing rather
    // than retaining an otherwise idle young generation.
    Buffer.allocUnsafe(1024 * 1024);
    global.gc();
  }
}

const receiver = new Receiver({
  allowSynchronousEvents: false,
  binaryType: 'nodebuffer',
  extensions: {},
  isServer: false,
  maxPayload: 1024 * 1024,
  skipUTF8Validation: false,
});

let emittedData;
let emittedBacking;
let eventCount = 0;
receiver.on('message', (data) => {
  eventCount++;
  emittedData = data;
  emittedBacking = new WeakRef(data.buffer);
});

let firstBacking;
let lastBacking;
let firstWriteCallback = false;
let lastWriteCallback = false;
const deferredCallbacks = [];
const realSetImmediate = global.setImmediate;
global.setImmediate = (callback) => {
  deferredCallbacks.push(callback);
  return {diagnosticDeferredCallback: true};
};

(function enqueueMessage() {
  let first = frame(false, 2, 32768, 0x31);
  let last = frame(true, 0, 32768, 0x32);
  firstBacking = new WeakRef(first.buffer);
  lastBacking = new WeakRef(last.buffer);
  receiver.write(first, () => {
    firstWriteCallback = true;
  });
  receiver.write(last, () => {
    lastWriteCallback = true;
  });
  first = null;
  last = null;
})();
global.setImmediate = realSetImmediate;

setTimeout(() => {
  collect();
  const beforeDeferredEmit = {
    receiverState: receiver._state,
    receiverFragments: receiver._fragments.length,
    receiverBufferedBytes: receiver._bufferedBytes,
    firstWriteCallback,
    lastWriteCallback,
    eventCount,
    deferredCallbacks: deferredCallbacks.length,
    firstFragmentBackingLive: firstBacking.deref() !== undefined,
    lastFragmentBackingLive: lastBacking.deref() !== undefined,
  };
  deferredCallbacks.shift()();
  realSetImmediate(() => {
    // Run after ws's deferred message closure and Writable callback unwind.
    realSetImmediate(() => {
      collect();
      const afterDeferredEmitAndWriteUnwind = {
        receiverState: receiver._state,
        receiverFragments: receiver._fragments.length,
        receiverBufferedBytes: receiver._bufferedBytes,
        firstWriteCallback,
        lastWriteCallback,
        eventCount,
        firstFragmentBackingLive: firstBacking.deref() !== undefined,
        lastFragmentBackingLive: lastBacking.deref() !== undefined,
        contiguousPayloadBackingLive: emittedBacking?.deref() !== undefined,
        contiguousPayloadBytes: emittedData?.length ?? null,
      };
      const output = {
        schema: 'cdc-ws-fragment-root-probe/1',
        node: process.version,
        v8: process.versions.v8,
        beforeDeferredEmit,
        afterDeferredEmitAndWriteUnwind,
      };
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      if (beforeDeferredEmit.firstFragmentBackingLive ||
          beforeDeferredEmit.lastFragmentBackingLive ||
          beforeDeferredEmit.eventCount !== 0 ||
          beforeDeferredEmit.deferredCallbacks !== 1 ||
          afterDeferredEmitAndWriteUnwind.lastFragmentBackingLive ||
          !afterDeferredEmitAndWriteUnwind.contiguousPayloadBackingLive ||
          afterDeferredEmitAndWriteUnwind.eventCount !== 1) {
        process.exitCode = 1;
      }
    });
  });
}, 0);
