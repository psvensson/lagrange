from pathlib import Path
p=Path('test/integration/message-group-learner-recipient.integration.test.js')
s=p.read_text()
def replace(before,after,count=1):
 global s
 assert s.count(before)==count,('refinement anchor drift',before)
 s=s.replace(before,after)
replace("const request = {...payload(fx.f, fx.replicaId), delivery: {nodeId: SUCCESSOR, isCurrent: true}};", "const request = {...payload(fx.f, fx.replicaId),\n      delivery: {nodeId: SUCCESSOR, isCurrent: true}};")
replace("const fx = await receiverFixture(t); const held = await heldNativeRead(fx); t.after(held.release);", "const fx = await receiverFixture(t);\n    const held = await heldNativeRead(fx);\n    t.after(held.release);",2)
replace("operationId: fx.f.request.operationId, entityId: GROUP, entityType: SERVICE_TYPE.MESSAGE_GROUP});", "operationId: fx.f.request.operationId, entityId: GROUP,\n      entityType: SERVICE_TYPE.MESSAGE_GROUP});")
replace("import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';\n",'')
replace("import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';", "import {MEMBERSHIP_PHASE as PHASE} from\n  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';")
a=s.index('async function connectRouters(');b=s.index('function learnerQuery(',a)
s=s[:a]+'''async function connectRouters(t) {
  // Existing in-process server/dial owners perform both IDENTIFY directions.
  // No connection rows, primary socket or boot watermark is preinstalled.
  const source = new MessageRouter({nodeId: NODE, bootIncarnation: 1,
    inProcess: true, wsPort: 24271, nodeAddress: 'ws://127.0.0.1:24271'});
  const recipient = new MessageRouter({nodeId: SUCCESSOR, bootIncarnation: 1,
    inProcess: true, wsPort: 24272, nodeAddress: 'ws://127.0.0.1:24272'});
  t.after(async () => { await source.shutdown(); await recipient.shutdown(); });
  await source.initialize({startServer: true});
  await recipient.initialize({startServer: true});
  await source.connectToNode(SUCCESSOR, 'ws://127.0.0.1:24272');
  for (let tick = 0; tick < 20 &&
    source.getCurrentPrimaryConnectionBootIncarnation(SUCCESSOR) !== 1;
  tick += 1) await immediate();
  assert.equal(source.getCurrentPrimaryConnectionBootIncarnation(SUCCESSOR), 1,
    'the actual outbound router must receive its peer identity');
  assert.equal(recipient.getCurrentPrimaryConnectionBootIncarnation(NODE), 1,
    'the actual incoming router must identify and adopt the dialed socket');
  return {source, recipient};
}
'''+s[b:]
replace("  const recipient = new MessageRouter({nodeId: SUCCESSOR, bootIncarnation: 1});\n  await recipient.initialize({startServer: false});\n  t.after(() => recipient.shutdown());\n  const pair = await connectRouters(t, f.transport.router, recipient);", "  const {source, recipient} = await connectRouters(t);")
replace('messageRouter: f.transport.router, logger: noLog', 'messageRouter: source, logger: noLog')
replace('const deliver = (request) => f.transport.router.deliver(address, request,','const deliver = (request) => source.deliver(address, request,')
replace('return {f, recipient, pair, replicaId, native, service, handler, owner, deliver,','return {f, source, recipient, replicaId, native, service, handler, owner, deliver,')
replace('const deliver = f.transport.router.deliver.bind(f.transport.router);','const deliver = fx.source.deliver.bind(fx.source);')
replace('f.transport.router.deliver = (...args) =>','fx.source.deliver = (...args) =>')
replace("assert.equal(fx.f.row().message_group_membership_phase, 'learner_in_flight');",'assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_IN_FLIGHT);')
p.write_text(s)
