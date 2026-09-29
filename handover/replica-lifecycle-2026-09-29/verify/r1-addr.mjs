const L='/tmp/claude-1000/-mnt-data-peter-projects-lagrange/42eae958-6576-4059-b7e8-44f638e8d993/scratchpad/freeze/labwt/src';
const {resolveNodeWebSocketAddressResult}=await import(L+'/transport/node-address-resolution.js').then(m=>({resolveNodeWebSocketAddressResult:m.resolveNodeWebSocketAddressResult||m.resolveNodeWebSocketAddress}));
const ep=(i)=>({endpoint_id:'ep-n-ws',node_id:'n',transport_type:'ws',status:'active',address:`ws://g${i}:8082`,priority:0,boot_incarnation:i});
const node=(i)=>({node_id:'n',boot_incarnation:i});
const rows={nodes:new Map([['n',node(2)]]),node_endpoints:[ep(1)]};
const cache={get:(t,k)=>t==='nodes'?rows.nodes.get(k):null,getAll:(t)=>t==='node_endpoints'?rows.node_endpoints:[...rows.nodes.values()]};
const boot={systemTableSnapshots:{nodes:[node(1)],node_endpoints:[ep(1)]}};
console.log('cache only:',JSON.stringify(resolveNodeWebSocketAddressResult({targetNodeId:'n',systemTableCache:cache})));
console.log('cache NODES=G2 + bootstrap G1:',JSON.stringify(resolveNodeWebSocketAddressResult({targetNodeId:'n',systemTableCache:cache,bootstrapResponse:boot})));
