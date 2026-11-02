import fs from 'node:fs';
import {WasiComponentCellRuntime} from '../src/runtime/wasi-component-cell-runtime.js';
const bytes = fs.readFileSync(process.env.COMPONENT_WASM);
const rt = new WasiComponentCellRuntime({workerPath: new URL('./worker.mjs',
  import.meta.url).pathname});
const budgets = {context_bytes: 1<<20,
  cpu_time_ms: 5000,
  input_bytes: 1<<20,
  memory_bytes: 64<<20,
  output_bytes: 1<<20,
  wall_time_ms: 10000};
for (let i = 0; i < Number(process.argv[2] || 2); i++) {
  const t = Date.now(); console.error('PHASE parent_start '+t);
  try {
    await rt.start({budgets,
      bytes,
      capabilities: [],
      exportName: 'handle-request',
      serviceId: 's'+i,
      world: 'request-cell'});
    console.error('START_OK ms='+(Date.now()-t));
  } catch (e) {
    console.error('START_ERR ms='+(Date.now()-t)+' '+e.name+' '+e.code+' '+e.message);
  }
  await rt.stop('s'+i);
}
await rt.shutdown();
