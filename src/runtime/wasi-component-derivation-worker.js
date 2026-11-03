/**
 * Derivation worker: transpiles one admitted WASI component with the
 * pinned jco toolchain and posts the derived files (glue JS plus core
 * modules) to its owner, WasiComponentDerivationOwner. It runs off the
 * parent event loop because the transpile is several seconds of
 * synchronous wasm. Its lifetime and CPU ceiling belong to the owner.
 *
 * @module runtime/wasi-component-derivation-worker
 */
import {parentPort, workerData} from 'node:worker_threads';

import {transpileBytes} from '@bytecodealliance/jco-transpile';

const DERIVATION_WORKER_MESSAGE = Object.freeze({
  DERIVED: 'derived',
  FAILED: 'derivation_failed',
});

async function derive() {
  try {
    const transpiled = await transpileBytes(new Uint8Array(workerData.bytes), {
      emitTypescriptDeclarations: false,
      instantiation: workerData.instantiation,
      name: workerData.name,
    });
    parentPort.postMessage({
      files: transpiled.files,
      type: DERIVATION_WORKER_MESSAGE.DERIVED,
    });
  } catch (error) {
    parentPort.postMessage({
      message: error.message,
      type: DERIVATION_WORKER_MESSAGE.FAILED,
    });
  }
}

void derive();
