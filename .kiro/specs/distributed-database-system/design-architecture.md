# Architecture

```mermaid
graph TB
    subgraph "Node 1 (Seed)"
        NS1[Node Service]
        MG1A[Message Group Replica A]
        MG1B[Message Group Replica B] 
        MG1C[Message Group Replica C]
        PR1A[Partition Replica A]
        PR1B[Partition Replica B]
        PR1C[Partition Replica C]
    end
    
    subgraph "Node 2"
        NS2[Node Service]
        MG2[Message Group Replica]
        PR2[Partition Replica]
    end
    
    subgraph "Node 3"
        NS3[Node Service]
        MG3[Message Group Replica]
        PR3[Partition Replica]
    end
    
    subgraph "System Tables"
        ST1[tables]
        ST2[partitions]
        ST3[indices]
        ST4[message-groups]
        ST5[nodes]
    end
    
    Client[SQL Client] --> NS1
    Client --> NS2
    Client --> NS3
    
    MG1A -.CDC.-> ST1
    MG1A -.CDC.-> ST2
    MG1A -.CDC.-> ST3
    MG1A -.CDC.-> ST4
    MG1A -.CDC.-> ST5
```

## Core Principles

1. **Universal Partition Architecture**: ALL tables (system tables and user tables) are implemented as partitions with odd-numbered Raft replicas (minimum 3)
2. **Fully Autonomous Management**: The system makes ALL replica placement and count decisions - no manual operator control
3. **Self-Describing**: All system metadata is stored within the database itself using the same infrastructure as user data
4. **Consensus-Based**: Both data storage and messaging use Raft for consistency
5. **Horizontally Scalable**: Add nodes to increase capacity and fault tolerance
6. **Policy-Driven**: Configurable policies control partition behavior and replica placement decisions
7. **One Way**: Each functionality has exactly one implementation - no fallbacks, no alternatives
8. **Best-of-Breed Libraries**: Leverage proven, mature libraries rather than building custom solutions
9. **Unified Rebalancing**: Same rebalancing logic for partitions and message groups, driven by policies
