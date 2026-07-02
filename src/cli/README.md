# Lagrange Admin CLI

A terminal-based administration tool for Lagrange, inspired by K9s for
Kubernetes. It provides real-time visibility into cluster state through the
CDC-synchronized local cache.

The canonical command is `lagrange-admin`. The legacy `ddb-admin` command is
kept as a compatibility alias.

## System Requirements

- **Node.js**: v22.0.0 or higher
- **Terminal**: Any terminal emulator with ANSI color support
- **Operating System**: Linux, macOS, or Windows (with WSL recommended)
- **Network**: WebSocket connectivity to database nodes

## Installation

### From npm (recommended)

```bash
npm install -g lagrange
```

### From source

```bash
# Clone the repository
git clone <repository-url>
cd lagrange

# Install dependencies
npm install

# Link the CLI globally
npm link
```

## Quick Start

### Connect to a Node

```bash
# Connect to a specific node
lagrange-admin localhost:8080

# Start with address prompt
lagrange-admin

# Connect in read-only mode (SELECT queries only)
lagrange-admin --read-only localhost:8080
```

### Basic Navigation

Once connected, use these keys to navigate:

| Key | Action |
|-----|--------|
| `1-9` | Switch between views (Nodes, Services, Tables, etc.) |
| `↑/↓` | Navigate rows |
| `Enter` | Drill down into selected item |
| `Escape` | Go back / Cancel |
| `/` | Enter filter mode |
| `:` | Enter command mode |
| `?` | Show help |
| `q` | Quit |

### Views

| Key | View | Description |
|-----|------|-------------|
| `1` | Nodes | Cluster nodes with resource usage |
| `2` | Services | Running services across nodes |
| `3` | Tables | Database tables with metadata |
| `4` | Partitions | Table partitions and replicas |
| `5` | Message Groups | Communication infrastructure |
| `6` | SQL | Interactive SQL query interface |
| `7` | Logs | System logs with filtering |
| `8` | Config | System configuration |
| `9` | Contexts | Function execution contexts |

## Configuration

Configuration is loaded from `~/.ddb-admin/config.json`:

```json
{
  "refresh_interval": 2000,
  "default_view": "nodes",
  "color_scheme": "default",
  "read_only_mode": false
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DDB_NODE_ADDRESS` | Default node address to connect to |
| `DDB_REFRESH_INTERVAL` | Refresh interval in milliseconds |

### Command-Line Arguments

```bash
lagrange-admin [options] [node-address]

Options:
  -h, --help       Show help message
  -v, --version    Show version information
  --read-only      Enable read-only mode (SELECT queries only)
  --monochrome     Use monochrome color scheme
  --refresh <ms>   Set refresh interval
  --view <name>    Start with specific view
```

## Basic Usage Examples

### Filtering Data

Press `/` to enter filter mode, then type your filter pattern:

```
/node-1        # Filter to items containing "node-1"
/failed        # Show only failed items
```

### Using Commands

Press `:` to enter command mode:

```
:connect localhost:8081    # Connect to different node
:goto tables               # Switch to tables view
:filter error              # Apply filter
:sort status desc          # Sort by status descending
:refresh                   # Force cache refresh
:help                      # Show help
:quit                      # Exit application
```

### SQL Queries

In the SQL view (`6`), enter queries and press `Ctrl+Enter` to execute:

```sql
SELECT * FROM users WHERE status = 'active';
INSERT INTO logs (message) VALUES ('test');
```

### Live Queries

Use `LIVE SELECT` to stream real-time changes:

```sql
LIVE SELECT * FROM orders WHERE status = 'pending';
```

Live query controls:
- `p` - Pause/Resume streaming
- `Escape` - Cancel subscription

## Troubleshooting

### Connection Issues

1. Verify the node address is correct and accessible
2. Check that the node's admin API is running
3. Ensure WebSocket connections are not blocked by firewall

### Display Issues

- If colors don't display correctly, try `--monochrome` mode
- Ensure your terminal supports ANSI escape codes
- Resize terminal if layout appears broken

### Performance

- Use filters to reduce displayed data
- Pause CDC updates (`p`) when inspecting data
- Increase refresh interval for slower connections

## Documentation

- [User Guide](./USER_GUIDE.md) - Comprehensive feature documentation
- [Command Reference](./COMMAND_REFERENCE.md) - All commands and shortcuts

## License

AGPL v3
