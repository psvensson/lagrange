#!/bin/bash
#
# Start the admin CLI tool and connect to the seed node
#
# Usage: ./scripts/start-admin-cli.sh [node-address]
#
# Examples:
#   ./scripts/start-admin-cli.sh                    # Connect to localhost:8081
#   ./scripts/start-admin-cli.sh localhost:8083    # Connect to second node
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULTS=$(node "$SCRIPT_DIR/entrypoint-defaults.js")
DEFAULT_ADMIN_PORT=$(node -e "console.log(JSON.parse('$DEFAULTS').adminPort)")
DEFAULT_HOST=$(node -e "console.log(JSON.parse('$DEFAULTS').localhost)")

NODE_ADDRESS="${1:-$DEFAULT_HOST:$DEFAULT_ADMIN_PORT}"

echo "Starting Admin CLI..."
echo "  Connecting to: $NODE_ADDRESS"
echo ""

# Run the admin CLI tool
node "$PROJECT_ROOT/src/cli/bin/lagrange-admin.js" "$NODE_ADDRESS"
