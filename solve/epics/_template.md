---
id: <kebab-case-id>
status: open
proof: deterministic | simulation | certification
doneWhen:
  probe: script
  args:
    command: node scripts/checks/<check>.js --metric
quests:
  - <quest-id>
authorizes:
  - <path or glob a quest under this epic may change>
---

# <title>

<Why now, in one paragraph. What the probe measures and why zero means done.>
