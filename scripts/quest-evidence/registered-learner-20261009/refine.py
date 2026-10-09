from pathlib import Path
p=Path('test/integration/message-group-learner-recipient.integration.test.js')
s=p.read_text()
edits=[
 ("const request = {...payload(fx.f, fx.replicaId), delivery: {nodeId: SUCCESSOR, isCurrent: true}};", "const request = {...payload(fx.f, fx.replicaId),\n      delivery: {nodeId: SUCCESSOR, isCurrent: true}};",1),
 ("const fx = await receiverFixture(t); const held = await heldNativeRead(fx); t.after(held.release);", "const fx = await receiverFixture(t);\n    const held = await heldNativeRead(fx);\n    t.after(held.release);",2),
 ("operationId: fx.f.request.operationId, entityId: GROUP, entityType: SERVICE_TYPE.MESSAGE_GROUP});", "operationId: fx.f.request.operationId, entityId: GROUP,\n      entityType: SERVICE_TYPE.MESSAGE_GROUP});",1),
]
for before,after,count in edits:
 assert s.count(before)==count,('format anchor drift',before)
 s=s.replace(before,after)
p.write_text(s)
