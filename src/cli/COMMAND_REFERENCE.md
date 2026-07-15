# Lagrange Admin CLI Command Reference

The command is `lagrange-admin` (the pre-rename `ddb-admin` alias was removed
before the first release).

Complete reference for all keyboard shortcuts, commands, configuration options, and command-line arguments.

## Table of Contents

1. [Keyboard Shortcuts](#keyboard-shortcuts)
2. [Command Palette Commands](#command-palette-commands)
3. [Configuration Options](#configuration-options)
4. [Environment Variables](#environment-variables)
5. [Command-Line Arguments](#command-line-arguments)
6. [Live Query Commands](#live-query-commands)

---

## Keyboard Shortcuts

### Navigation

| Key | Action | Context |
|-----|--------|---------|
| `↑` | Move selection up | All views |
| `↓` | Move selection down | All views |
| `Page Up` | Scroll up by page | All views |
| `Page Down` | Scroll down by page | All views |
| `Home` | Jump to first row | All views |
| `End` | Jump to last row | All views |
| `Enter` | Select / Drill down | All views |
| `Escape` | Go back / Cancel | All views |
| `Backspace` | Go back one level | All views |

### View Switching

| Key | View | Description |
|-----|------|-------------|
| `1` | Nodes | Cluster nodes overview |
| `2` | Services | Services across cluster |
| `3` | Tables | Database tables |
| `4` | Partitions | Table partitions |
| `5` | Message Groups | Message group status |
| `6` | SQL | SQL query interface |
| `7` | Logs | System logs |
| `8` | Config | Configuration settings |
| `9` | Contexts | Function contexts |

### Mode Switching

| Key | Action | Description |
|-----|--------|-------------|
| `/` | Filter mode | Enter filter pattern |
| `:` | Command mode | Enter command |
| `?` | Help overlay | Show all shortcuts |

### Actions

| Key | Action | Description |
|-----|--------|-------------|
| `d` | Toggle detail panel | Show/hide entity details |
| `r` | Refresh | Force cache refresh |
| `p` | Pause/Resume CDC | Toggle real-time updates |
| `s` | Sort | Cycle sort options |
| `q` | Quit | Exit application |
| `Ctrl+C` | Force quit | Immediate exit |

### Filter Mode

| Key | Action |
|-----|--------|
| `Enter` | Apply filter |
| `Escape` | Cancel filter |
| `Backspace` | Delete character |
| Any character | Add to filter |

### Command Mode

| Key | Action |
|-----|--------|
| `Enter` | Execute command |
| `Tab` | Autocomplete |
| `↑` | Previous command (history) |
| `↓` | Next command (history) |
| `Escape` | Cancel command |
| `Backspace` | Delete character |

### SQL Query View

| Key | Action |
|-----|--------|
| `Ctrl+Enter` | Execute query |
| `↑` | Previous query (history) |
| `↓` | Next query (history) |
| `Tab` | Autocomplete table name |
| `Escape` | Clear input |

### Live Query View

| Key | Action |
|-----|--------|
| `p` | Pause/Resume streaming |
| `Escape` | Cancel subscription |
| `↑` / `↓` | Scroll through events |

### Detail Panel

| Key | Action |
|-----|--------|
| `d` | Close panel |
| `Escape` | Close panel |
| `↑` / `↓` | Scroll content |
| `j` | Jump to related entity |

---

## Command Palette Commands

Access the command palette by pressing `:`.

### connect

Connect to a database node.

**Syntax:**
```
:connect <address>
```

**Aliases:** `c`

**Parameters:**
- `address` (required): Node address in format `host:port`

**Examples:**
```
:connect localhost:8081
:connect 192.168.1.100:8081
:c node1.example.com:8081
```

### refresh

Force refresh the local cache from the server.

**Syntax:**
```
:refresh
```

**Aliases:** `r`

**Examples:**
```
:refresh
:r
```

### filter

Apply a filter pattern to the current view.

**Syntax:**
```
:filter <pattern>
```

**Aliases:** `f`, `/`

**Parameters:**
- `pattern` (required): Text pattern to filter by

**Examples:**
```
:filter node-1
:filter active
:f error
```

### sort

Sort the current view by a column.

**Syntax:**
```
:sort <column> [direction]
```

**Aliases:** `s`

**Parameters:**
- `column` (required): Column name to sort by
- `direction` (optional): `asc` or `desc` (default: `asc`)

**Examples:**
```
:sort status
:sort name desc
:sort cpu% asc
:s memory desc
```

### goto

Switch to a specific view.

**Syntax:**
```
:goto <view>
```

**Aliases:** `g`

**Parameters:**
- `view` (required): View name

**Valid views:**
- `nodes`
- `services`
- `tables`
- `partitions`
- `message_groups`
- `sql`
- `logs`
- `config`
- `contexts`

**Examples:**
```
:goto tables
:goto sql
:g nodes
```

### sql

Open the SQL query view.

**Syntax:**
```
:sql
```

**Examples:**
```
:sql
```

### help

Show help information.

**Syntax:**
```
:help [command]
```

**Aliases:** `h`, `?`

**Parameters:**
- `command` (optional): Command name for specific help

**Examples:**
```
:help
:help connect
:h sort
:?
```

### quit

Exit the application.

**Syntax:**
```
:quit
```

**Aliases:** `q`, `exit`

**Examples:**
```
:quit
:q
:exit
```

---

## Configuration Options

Configuration file location: `~/.lagrange-admin/config.json`

### node_address

Default node address to connect to.

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | No |
| Default | None (prompts user) |

**Example:**
```json
{
  "node_address": "localhost:8081"
}
```

### refresh_interval

Polling interval in milliseconds.

| Property | Value |
|----------|-------|
| Type | `number` |
| Required | No |
| Default | `2000` |
| Min | `1000` |
| Max | `60000` |

**Example:**
```json
{
  "refresh_interval": 5000
}
```

### default_view

View to display on startup.

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | No |
| Default | `"nodes"` |
| Valid values | `nodes`, `services`, `tables`, `partitions`, `message_groups`, `sql`, `logs`, `config`, `contexts` |

**Example:**
```json
{
  "default_view": "tables"
}
```

### color_scheme

Color scheme for the interface.

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | No |
| Default | `"default"` |
| Valid values | `default`, `monochrome` |

**Example:**
```json
{
  "color_scheme": "monochrome"
}
```

### cache_persistence

Whether to persist cache to disk for faster startup.

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Required | No |
| Default | `true` |

**Example:**
```json
{
  "cache_persistence": false
}
```

### cache_path

Path to cache file.

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | No |
| Default | `~/.lagrange-admin/cache.json` |

**Example:**
```json
{
  "cache_path": "/tmp/ddb-cache.json"
}
```

### log_path

Path to error log file.

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | No |
| Default | `~/.lagrange-admin/error.log` |

**Example:**
```json
{
  "log_path": "/var/log/lagrange-admin.log"
}
```

### cdc_lag_threshold

CDC lag threshold in milliseconds before showing staleness warning.

| Property | Value |
|----------|-------|
| Type | `number` |
| Required | No |
| Default | `5000` |
| Min | `1000` |

**Example:**
```json
{
  "cdc_lag_threshold": 10000
}
```

### read_only_mode

Enable read-only mode (SELECT queries only).

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Required | No |
| Default | `false` |

**Example:**
```json
{
  "read_only_mode": true
}
```

### keybindings

Custom keybindings (advanced).

| Property | Value |
|----------|-------|
| Type | `object` |
| Required | No |
| Default | `{}` |

**Example:**
```json
{
  "keybindings": {
    "quit": "ctrl+q",
    "refresh": "ctrl+r"
  }
}
```

### Complete Configuration Example

```json
{
  "node_address": "localhost:8081",
  "refresh_interval": 3000,
  "default_view": "nodes",
  "color_scheme": "default",
  "cache_persistence": true,
  "cache_path": "~/.lagrange-admin/cache.json",
  "log_path": "~/.lagrange-admin/error.log",
  "cdc_lag_threshold": 5000,
  "read_only_mode": false,
  "keybindings": {}
}
```

---

## Environment Variables

Environment variables override configuration file settings.

### LAGRANGE_NODE_ADDRESS

Default node address to connect to.

| Property | Value |
|----------|-------|
| Type | String |
| Format | `host:port` |
| Overrides | `node_address` config |

**Example:**
```bash
export LAGRANGE_NODE_ADDRESS=localhost:8081
lagrange-admin
```

### LAGRANGE_REFRESH_INTERVAL

Refresh interval in milliseconds.

| Property | Value |
|----------|-------|
| Type | Number (string) |
| Range | 1000-60000 |
| Overrides | `refresh_interval` config |

**Example:**
```bash
export LAGRANGE_REFRESH_INTERVAL=5000
lagrange-admin
```

### Priority Order

Configuration is loaded in this order (later overrides earlier):

1. Default values
2. Configuration file (`~/.lagrange-admin/config.json`)
3. Environment variables
4. Command-line arguments

---

## Command-Line Arguments

### Usage

```
lagrange-admin [options] [node-address]
```

### Options

#### --help, -h

Show help message and exit.

```bash
lagrange-admin --help
lagrange-admin -h
```

#### --version, -v

Show version information and exit.

```bash
lagrange-admin --version
lagrange-admin -v
```

#### --read-only

Enable read-only mode. Only SELECT queries are allowed.

```bash
lagrange-admin --read-only localhost:8081
```

#### --monochrome

Use monochrome color scheme (no colors).

```bash
lagrange-admin --monochrome localhost:8081
```

#### --refresh <ms>

Set refresh interval in milliseconds.

```bash
lagrange-admin --refresh 5000 localhost:8081
```

#### --view <name>

Start with a specific view.

Valid values: `nodes`, `services`, `tables`, `partitions`, `message_groups`, `sql`, `logs`, `config`, `contexts`

```bash
lagrange-admin --view tables localhost:8081
```

### Positional Arguments

#### node-address

Node address to connect to (optional).

Format: `host:port`

```bash
lagrange-admin localhost:8081
lagrange-admin 192.168.1.100:8081
```

### Examples

```bash
# Basic connection
lagrange-admin localhost:8081

# Read-only mode
lagrange-admin --read-only localhost:8081

# Custom refresh interval
lagrange-admin --refresh 10000 localhost:8081

# Start with tables view
lagrange-admin --view tables localhost:8081

# Monochrome mode
lagrange-admin --monochrome localhost:8081

# Combined options
lagrange-admin --read-only --view sql --refresh 5000 localhost:8081

# Using environment variable
LAGRANGE_NODE_ADDRESS=localhost:8081 lagrange-admin --read-only
```

---

## Live Query Commands

Live queries stream real-time changes matching your query criteria.

### LIVE SELECT Syntax

```sql
LIVE SELECT <columns> FROM <table> [WHERE <conditions>];
```

**Examples:**
```sql
-- Stream all changes to orders table
LIVE SELECT * FROM orders;

-- Stream only pending orders
LIVE SELECT * FROM orders WHERE status = 'pending';

-- Stream specific columns
LIVE SELECT id, status, updated_at FROM orders WHERE status = 'processing';
```

### Live Query Keyboard Controls

| Key | Action | Description |
|-----|--------|-------------|
| `p` | Pause | Stop receiving events (buffered on server) |
| `p` | Resume | Continue receiving events |
| `Escape` | Cancel | End subscription |
| `↑` | Scroll up | View older events |
| `↓` | Scroll down | View newer events |

### Live Query Status Indicators

| Status | Description |
|--------|-------------|
| `pending` | Subscription request sent |
| `active` | Receiving events |
| `paused` | Events paused (press `p` to resume) |
| `expired` | Subscription expired (can renew) |
| `cancelled` | Subscription ended |
| `renewing` | Renewal in progress |

### Event Types

| Type | Color | Description |
|------|-------|-------------|
| INSERT | Green | New row inserted |
| UPDATE | Yellow | Existing row modified |
| DELETE | Red | Row deleted |

### Live Query Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Max subscriptions | 100 | Maximum concurrent live queries |
| Event buffer | 1000 | Events kept per subscription |
| Expiration | Varies | Server-defined subscription lifetime |

### Live Query Display

```
┌─ Live Query: orders ────────────────────────────────────────┐
│ Status: Active │ Events: 47 │ Rate: 3.2/s │ Partitions: 4   │
├─────────────────────────────────────────────────────────────┤
│ 10:23:45 INSERT │ {id: 1001, status: 'pending', total: 99}  │
│ 10:23:44 UPDATE │ {id: 998, status: 'shipped', total: 150}  │
│ 10:23:43 DELETE │ {id: 995}                                 │
│ 10:23:42 INSERT │ {id: 1000, status: 'pending', total: 75}  │
└─────────────────────────────────────────────────────────────┘
```

### Status Bar Information

- **Status**: Current subscription state
- **Events**: Total events received
- **Rate**: Events per second (rolling average)
- **Partitions**: Number of monitored partitions

### Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Maximum concurrent live queries reached" | 100 subscriptions active | Cancel unused subscriptions |
| "Subscription expired" | Server-side timeout | Press `r` to renew |
| "Connection lost" | WebSocket disconnected | Wait for reconnection |

---

## Quick Reference Card

### Essential Shortcuts

```
Navigation:     ↑↓ PgUp PgDn Home End Enter Esc
Views:          1-9
Modes:          / (filter)  : (command)  ? (help)
Actions:        d (detail)  r (refresh)  p (pause)  q (quit)
```

### Essential Commands

```
:connect <addr>     Connect to node
:goto <view>        Switch view
:filter <pattern>   Filter data
:sort <col> [dir]   Sort data
:refresh            Refresh cache
:help               Show help
:quit               Exit
```

### SQL Quick Reference

```sql
-- Regular query
SELECT * FROM table WHERE condition;

-- Live query
LIVE SELECT * FROM table WHERE condition;
```
