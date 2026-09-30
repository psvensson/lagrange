# Verifier falsifier (round 8): `r1-addr.mjs`

Reconstruction of verify/r1-addr.mjs.md (F-R1) plus the D4 seed-pin cases. Copy to test/verify-scratch/ to re-run. Result on 0996d7576: ALL GREEN (7/7); FAIL 3 under revert R6.

````js
// Verifier falsifier F-R1 (reconstructed from verify/r1-addr.mjs.md) + D4 seed pin
const {resolveNodeWebSocketAddressResult}=await import('../../src/transport/node-address-resolution.js');
const ep=(i,n='n')=>({endpoint_id:`ep-${n}-ws`,node_id:n,transport_type:'ws',status:'active',address:`ws://g${i}:8082`,priority:0,boot_incarnation:i});
const node=(i,n='n',status='READY')=>({node_id:n,boot_incarnation:i,status});
const mkCache=(nodes,eps)=>({get:(t,k)=>t==='nodes'?nodes.get(k)||null:null,getAll:(t)=>t==='node_endpoints'?eps:[...nodes.values()]});
const boot={seedNodeId:'seed',seedNodeWsAddress:'ws://seedpin:9',systemTableSnapshots:{nodes:[node(1),node(1,'seed')],node_endpoints:[ep(1),ep(1,'seed')]}};
const cases=[
 ['cache only (NODES=G2, ep G1)', {targetNodeId:'n',systemTableCache:mkCache(new Map([['n',node(2)]]),[ep(1)])}, 'unavailable'],
 ['cache NODES=G2 + bootstrap G1 (F-R1 original)', {targetNodeId:'n',systemTableCache:mkCache(new Map([['n',node(2)]]),[ep(1)]),bootstrapResponse:boot}, 'unavailable'],
 ['cache NODES=G2 terminal(STOPPED) + cache ep G2 + bootstrap G1 (cache decides; snapshot G1 never used; NODES status not consulted by the reader: observation N-R8)', {targetNodeId:'n',systemTableCache:mkCache(new Map([['n',node(2,'n','STOPPED')]]),[ep(2)]),bootstrapResponse:boot}, 'resolved ws://g2:8082'],
 ['no cache row + bootstrap G1 (circularity break)', {targetNodeId:'n',systemTableCache:mkCache(new Map(),[]),bootstrapResponse:boot}, 'resolved ws://g1:8082'],
 ['no cache row + seed pin (D4)', {targetNodeId:'seed',systemTableCache:mkCache(new Map(),[]),bootstrapResponse:boot}, 'resolved ws://seedpin:9'],
 ['cache NODES row for seed (G2, no ep) + seed pin (D4: cache decides)', {targetNodeId:'seed',systemTableCache:mkCache(new Map([['seed',node(2,'seed')]]),[]),bootstrapResponse:boot}, 'unavailable'],
 ['cache NODES G2 + cache ep G2 + bootstrap G1', {targetNodeId:'n',systemTableCache:mkCache(new Map([['n',node(2)]]),[ep(2)]),bootstrapResponse:boot}, 'resolved ws://g2:8082'],
];
let fail=0;
for (const [name,opts,exp] of cases){const r=resolveNodeWebSocketAddressResult(opts);const got=r.state==='resolved'?`resolved ${r.address}`:r.state;const ok=got===exp;if(!ok)fail++;console.log(ok?'ok':'NOT OK',name,'=>',JSON.stringify(r));}
console.log(fail?`FAIL ${fail}`:'ALL GREEN');
````
