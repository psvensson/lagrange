import fs from 'node:fs';
import {transpileBytes} from '@bytecodealliance/jco-transpile';
import {WasiComponentCellRuntime} from '../src/runtime/wasi-component-cell-runtime.js';
const bytes = fs.readFileSync(process.env.COMPONENT_WASM);
const transpiled = await transpileBytes(new Uint8Array(bytes),
  {emitTypescriptDeclarations: false,
    instantiation: 'async',
    name: 'request-cell'});
class Pre extends WasiComponentCellRuntime {
  workerDataForCell(c) {
    return {...super.workerDataForCell(c), transpiled};
  }
}
const rt = new Pre({workerPath: new URL('./worker.mjs', import.meta.url).pathname});
const budgets = {context_bytes: 1<<20,
  cpu_time_ms: 5000,
  input_bytes: 1<<20,
  memory_bytes: 64<<20,
  output_bytes: 1<<20,
  wall_time_ms: 10000};
const n = Number(process.argv[2]||1);
const t = Date.now();
await Promise.all(Array.from({length: n},
  (_,
    i)=>rt.start({budgets,
    bytes,
    capabilities: [],
    exportName: 'handle-request',
    serviceId: 's'+i,
    world: 'request-cell'}).then(()=>console.log('s'+i+' START_OK ms='+(Date.now()-t)),
    (e)=>console.log('s'+i+' ERR '+e.message))));
await rt.shutdown();
