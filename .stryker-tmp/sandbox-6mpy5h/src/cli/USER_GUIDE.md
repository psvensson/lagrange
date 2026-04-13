# DDB Admin CLI User Guide

This guide covers all features of the DDB Admin CLI, a terminal-based administration tool for the distributed database system.

## Table of Contents

1. [Connection Management](#connection-management)
2. [View Navigation](#view-navigation)
3. [Filtering and Sorting](#filtering-and-sorting)
4. [Detail Panels](#detail-panels)
5. [Command Palette](#command-palette)
6. [SQL Query View](#sql-query-view)
7. [Live Query Subscriptions](#live-query-subscriptions)
8. [Troubleshooting](#troubleshooting)

---

## Connection Management

### Connecting to a Node

The CLI connects to any node in the cluster via WebSocket. You can specify the address in several ways:

Note: the system admin WebSocket service listens on the fixed port `8081`.

**Command line:**
```bash
ddb-admin localhost:8081
ddb-admin 192.168.1.100:8081
```

**Environment variable:**
```bash
export DDB_NODE_ADDRESS=localhost:8081
ddb-admin
```

**Interactive prompt:**
```bash
ddb-admin
# Enter node address: localhost:8081
```

**Command palette:**
```
:connect localhost:8081
```

### Connection Status

The status bar at the bottom displays connection information:

```
┌─────────────────────────────────────────────────────────────┐
│ Connected: localhost:8081 │ CDC: Active │ Last: 2s ago     │
└─────────────────────────────────────────────────────────────┘
```

Status indicators:
- **Connected** - Active WebSocket connection
- **Disconnected** - No connection (attempting reconnect)
- **Reconnecting** - Automatic reconnection in progress
- **CDC: Active** - Real-time updates streaming
- **CDC: Paused** - Updates paused (press `p` to resume)

### Automatic Reconnection

If the connection is lost, the CLI automatically attempts to reconnect with exponential backoff:
- First retry: 1 second
- Subsequent retries: 2s, 4s, 8s, 16s (max 30s)
- Maximum 10 attempts before giving up

During reconnection, cached data remains available but may become stale.

---

## View Navigation

### Available Views

| Key | View | Description |
|-----|------|-------------|
| `1` | Nodes | Cluster nodes with CPU, memory, disk usage |
| `2` | Services | Services running across the cluster |
| `3` | Tables | Database tables with partition counts |
| `4` | Partitions | Table partitions with replica info |
| `5` | Message Groups | Communication infrastructure status |
| `6` | SQL | Interactive SQL query interface |
| `7` | Logs | System logs with filtering |
| `8` | Config | System configuration settings |
| `9` | Contexts | Function execution contexts |

### Nodes View

Displays all cluster nodes with resource metrics:

```
┌─ Nodes ─────────────────────────────────────────────────────┐
│ Node ID    │ Address        │ Status │ CPU% │ Mem% │ Disk% │
├────────────┼────────────────┼────────┼──────┼──────┼───────┤
│ node-1     │ 192.168.1.10   │ active │ 45%  │ 62%  │ 38%   │
│ node-2     │ 192.168.1.11   │ active │ 52%  │ 58%  │ 41%   │
│ node-3     │ 192.168.1.12   │ failed │ --   │ --   │ --    │
└─────────────────────────────────────────────────────────────┘
```

Color coding:
- **Green**: Healthy node
- **Yellow**: Warning (high resource usage > 80%)
- **Red**: Failed or unreachable

Press `Enter` on a node to drill down to its services.

### Services View

Shows services running on nodes:

```
┌─ Services ──────────────────────────────────────────────────┐
│ Service ID │ Type      │ Node    │ Status │ Address        │
├────────────┼───────────┼─────────┼────────┼────────────────┤
│ svc-001    │ partition │ node-1  │ leader │ 192.168.1.10   │
│ svc-002    │ partition │ node-2  │ follow │ 192.168.1.11   │
│ svc-003    │ msg_group │ node-1  │ active │ 192.168.1.10   │
└─────────────────────────────────────────────────────────────┘
```

Service types:
- **partition**: Manages table partitions
- **msg_group**: Message group service
- **node**: Node management service

### Tables View

Lists all database tables with metadata:

```
┌─ Tables ────────────────────────────────────────────────────┐
│ Table Name │ Partitions │ Replicas │ Size   │ Policy       │
├────────────┼────────────┼──────────┼────────┼──────────────┤
│ users      │ 8          │ 3        │ 1.2 GB │ Default      │
│ orders     │ 16         │ 3        │ 4.5 GB │ Placement... │
│ logs       │ 4          │ 2        │ 890 MB │ Default      │
└─────────────────────────────────────────────────────────────┘
```

Press `Enter` to view partitions for a table.

### Partitions View

Shows partition details for a table:

```
┌─ Partitions: users ─────────────────────────────────────────┐
│ Partition │ Key Range      │ Replicas │ Leader  │ Size     │
├───────────┼────────────────┼──────────┼─────────┼──────────┤
│ p-001     │ [0, 1000)      │ 3        │ node-1  │ 150 MB   │
│ p-002     │ [1000, 2000)   │ 3        │ node-2  │ 148 MB   │
│ p-003     │ [2000, 3000)   │ 2        │ node-1  │ 152 MB   │
└─────────────────────────────────────────────────────────────┘
```

Yellow highlighting indicates under-replicated partitions.

### Message Groups View

Displays message group distribution:

```
┌─ Message Groups ────────────────────────────────────────────┐
│ Group ID │ Replicas │ Nodes Covered │ Status               │
├──────────┼──────────┼───────────────┼──────────────────────┤
│ mg-001   │ 3        │ 3             │ healthy              │
│ mg-002   │ 3        │ 2             │ degraded             │
└─────────────────────────────────────────────────────────────┘
```

### Logs View

System logs with multi-criteria filtering:

```
┌─ Logs ──────────────────────────────────────────────────────┐
│ Timestamp           │ Level │ Node   │ Service │ Message   │
├─────────────────────┼───────┼────────┼─────────┼───────────┤
│ 2024-01-15 10:23:45 │ ERROR │ node-1 │ svc-001 │ Conn fail │
│ 2024-01-15 10:23:44 │ WARN  │ node-2 │ svc-002 │ High load │
│ 2024-01-15 10:23:43 │ INFO  │ node-1 │ svc-001 │ Started   │
└─────────────────────────────────────────────────────────────┘
```

Filtering options:
- By level: ERROR, WARN, INFO, DEBUG, TRACE
- By node ID
- By service ID
- By time range
- By message content (text search)

Color coding:
- **Red**: ERROR logs
- **Yellow**: WARN logs
- **White**: INFO and below

Press `Enter` on a log entry to view full details including structured metadata.

### Config View

System configuration settings:

```
┌─ Config ────────────────────────────────────────────────────┐
│ Key                  │ Value    │ Type   │ Restart │ Modified│
├──────────────────────┼──────────┼────────┼─────────┼─────────┤
│ max_connections      │ 1000     │ number │ Yes     │ 2h ago  │
│ log_level            │ INFO     │ string │ No      │ Default │
│ replication_factor   │ 3        │ number │ Yes     │ 1d ago  │
└─────────────────────────────────────────────────────────────┘
```

Entries that differ from defaults are highlighted. Press `Enter` to edit a configuration value.

### Contexts View

Function execution contexts:

```
┌─ Contexts ──────────────────────────────────────────────────┐
│ Context ID │ Type     │ Name        │ Created    │ Updated  │
├────────────┼──────────┼─────────────┼────────────┼──────────┤
│ ctx-001    │ function │ processOrder│ 10:00:00   │ 10:05:23 │
│ ctx-002    │ trigger  │ onInsert    │ 09:45:00   │ 10:02:15 │
└─────────────────────────────────────────────────────────────┘
```

Filter by type or name pattern. Recently updated contexts are highlighted.

### Navigation Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection up/down |
| `Page Up` / `Page Down` | Scroll by page |
| `Home` / `End` | Jump to first/last row |
| `Enter` | Drill down into selected item |
| `Escape` / `Backspace` | Go back one level |
| `1-9` | Switch to view by number |

### Breadcrumb Navigation

The breadcrumb shows your current navigation path:

```
Home > Nodes > node-1 > Services > svc-001
```

Press `Escape` or `Backspace` to navigate back through the hierarchy.

---

## Filtering and Sorting

### Filter Mode

Press `/` to enter filter mode. Type your filter pattern and press `Enter`:

```
Filter: node-1_
```

The filter applies to all visible columns. Press `Escape` to cancel.

Examples:
- `/active` - Show items containing "active"
- `/node-1` - Filter to node-1 related items
- `/error` - Show error entries

### Sorting

Press `s` to cycle through sort options, or use the command palette:

```
:sort status        # Sort by status ascending
:sort status desc   # Sort by status descending
:sort cpu%          # Sort by CPU usage
```

---

## Detail Panels

Press `d` on any selected item to open its detail panel:

```
┌─ Node Details: node-1 ──────────────────────────────────────┐
│ Node ID:     node-1                                         │
│ Address:     192.168.1.10:8080                              │
│ Status:      active                                         │
│                                                             │
│ Resources:                                                  │
│   CPU:       45% (8 cores)                                  │
│   Memory:    62% (16 GB / 26 GB)                            │
│   Disk:      38% (380 GB / 1 TB)                            │
│                                                             │
│ Services:    12 running                                     │
│ Partitions:  24 hosted                                      │
│                                                             │
│ [Press 'j' to jump to services]                             │
└─────────────────────────────────────────────────────────────┘
```

Detail panel features:
- Full entity attributes
- Related entity counts
- Quick navigation links
- Scrollable content for long details

Press `d` again or `Escape` to close the detail panel.

---

## Command Palette

Press `:` to open the command palette:

```
:_
```

### Available Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `connect <address>` | `c` | Connect to node |
| `refresh` | `r` | Force cache refresh |
| `filter <pattern>` | `f`, `/` | Filter current view |
| `sort <column> [direction]` | `s` | Sort by column |
| `goto <view>` | `g` | Switch to view |
| `sql` | | Open SQL view |
| `help [command]` | `h`, `?` | Show help |
| `quit` | `q`, `exit` | Exit application |

### Command Examples

```
:connect localhost:8081     # Connect to different node
:goto tables                # Switch to tables view
:filter status=active       # Apply filter
:sort name asc              # Sort by name ascending
:help connect               # Show help for connect command
:quit                       # Exit
```

### Autocomplete

Press `Tab` to autocomplete commands and parameters:

```
:con<Tab>     → :connect
:goto t<Tab>  → :goto tables
```

### Command History

Use `↑` and `↓` arrows to navigate through command history.

---

## SQL Query View

Press `6` or `:sql` to open the SQL Query View.

### Interface Layout

```
┌─ SQL Query ─────────────────────────────────────────────────┐
│ SELECT * FROM users                                         │
│ WHERE status = 'active'                                     │
│ LIMIT 10;_                                                  │
├─────────────────────────────────────────────────────────────┤
│ Results (10 rows, 45ms, partitions: p-001, p-002)           │
├─────────────────────────────────────────────────────────────┤
│ id   │ name      │ email              │ status              │
├──────┼───────────┼────────────────────┼─────────────────────┤
│ 1    │ Alice     │ alice@example.com  │ active              │
│ 2    │ Bob       │ bob@example.com    │ active              │
└─────────────────────────────────────────────────────────────┘
```

### Query Input

- Multi-line SQL statements supported
- Syntax highlighting for SQL keywords
- Table name autocomplete (press `Tab` after FROM/INTO/UPDATE)

### Executing Queries

| Key | Action |
|-----|--------|
| `Ctrl+Enter` | Execute query |
| `↑` / `↓` | Navigate query history |
| `Tab` | Autocomplete table names |
| `Escape` | Clear input |

### Query Results

Results display:
- Column headers
- Row data with scrolling
- Row count and execution time
- Partitions involved in query

For write operations (INSERT/UPDATE/DELETE):
- Affected row count
- Warning indicator for write operations

### Query History

- Last 100 queries stored
- Persisted across sessions
- Navigate with `↑` / `↓` in query input

### Safety Features

**Dangerous query detection:**
- DELETE without WHERE clause triggers confirmation
- UPDATE without WHERE clause triggers confirmation

**Read-only mode:**
```bash
ddb-admin --read-only localhost:8080
```
In read-only mode, only SELECT queries are allowed.

---

## Live Query Subscriptions

Live queries stream real-time changes matching your query criteria.

### Creating a Live Query

Use `LIVE SELECT` syntax:

```sql
LIVE SELECT * FROM orders WHERE status = 'pending';
```

### Live Stream Display

```
┌─ Live Query: orders ────────────────────────────────────────┐
│ Status: Active │ Events: 47 │ Rate: 3.2/s │ Partitions: 4   │
├─────────────────────────────────────────────────────────────┤
│ 10:23:45 INSERT │ {id: 1001, status: 'pending', ...}        │
│ 10:23:44 UPDATE │ {id: 998, status: 'pending', ...}         │
│ 10:23:43 DELETE │ {id: 995, ...}                            │
└─────────────────────────────────────────────────────────────┘
```

Event color coding:
- **Green**: INSERT events
- **Yellow**: UPDATE events
- **Red**: DELETE events

### Live Query Controls

| Key | Action |
|-----|--------|
| `p` | Pause/Resume streaming |
| `Escape` | Cancel subscription |
| `↑` / `↓` | Scroll through events |

### Status Information

- **Status**: Active, Paused, Expired, Cancelled
- **Events**: Total events received
- **Rate**: Events per second
- **Partitions**: Monitored partition count

### Subscription Limits

- Maximum 100 concurrent live queries
- Events buffer limited to 1000 per subscription
- Subscriptions may expire and require renewal

---

## Troubleshooting

### Connection Problems

**Cannot connect to node:**
1. Verify the node address is correct
2. Check that the node is running
3. Ensure port `8081` is accessible
4. Check firewall rules for WebSocket connections

**Frequent disconnections:**
1. Check network stability
2. Verify node health
3. Review node logs for errors

### Display Issues

**Colors not showing:**
- Use `--monochrome` flag
- Check terminal color support
- Try a different terminal emulator

**Layout broken:**
- Resize terminal to at least 80x24
- Check for minimum size warning
- Try maximizing terminal window

**Characters not displaying:**
- Ensure UTF-8 encoding
- Use a font with box-drawing characters

### Performance Issues

**Slow updates:**
1. Check CDC connection status
2. Increase refresh interval: `--refresh 5000`
3. Use filters to reduce data volume
4. Pause CDC when not needed

**High memory usage:**
1. Reduce query history size
2. Cancel unused live queries
3. Clear cache: `:refresh`

### Data Issues

**Stale data:**
1. Check CDC status in status bar
2. Force refresh: `:refresh` or `r`
3. Verify connection is active

**Missing data:**
- Check filter is not hiding data
- Verify permissions on connected node
- Check if data exists in cluster

### Error Messages

**"Maximum concurrent live queries reached":**
- Cancel unused live query subscriptions
- Default limit is 100 concurrent queries

**"Read-only mode: Only SELECT queries allowed":**
- Restart without `--read-only` flag
- Or use SELECT queries only

**"Invalid configuration":**
- Check `~/.ddb-admin/config.json` syntax
- Remove invalid entries
- CLI will use defaults for invalid values

### Getting Help

- Press `?` for keyboard shortcuts
- Use `:help <command>` for command help
- Check error log: `~/.ddb-admin/error.log`
