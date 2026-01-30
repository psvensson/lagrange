---
inclusion: always
---
<!------------------------------------------------------------------------------------
   Add rules to this file or a short description and have Kiro refine them for you.
   
   Learn about inclusion modes: https://kiro.dev/docs/steering/#inclusion-modes
-------------------------------------------------------------------------------------> 
All information in the system must be stored as tables.
The system topology and critical functions are stored in system tables
A table is implemented as partitions
A partition is implemented as a raft group (liferaft)
Changes to table partitions will be streamed to all nodes using CDC
All nodes will have a system cache updated by CDC messages from system tables so that any system infroamtion is eventually available, like which replicas to route a sql query to.
All nodes will have at least one replica of a message group (liferaft) which will aways be used for any communication (even local).
Most nodes in the system may not have partition replicas on them, but will still have a systems cache and be able to both read and write to and from system tables using the system cache lookup.
There must be no other caches of system information beside the system cache that is fed by CDC changes from table partitions
When the seed node boots, it must be able to bypass the rule of writing to partitions so it can create the first system cache entires, otherwise it will not know how to update tables. But after the seed node boots, this must be removed.
There must be only one way to write system information to a table (to the leader replica of the correct partition(s))
Reading system information must always try the local cache first, then fall back to read from any replica of the correct partition(s) of the table
Accessing system information must only use the in-build SQL angine, which whill use the system cache to find the address of the replicas of the partition needed to address the query to (unless the information was already in the system cache (for reading))

Do not use try/catch for conditionals or comunication
Try/catch errors MUST NOT be swalllowed, instead either re-thrown or clearly logged


