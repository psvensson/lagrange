#!/bin/bash
#
# Start a seed node on default port (8080) and default data directory (./data)
#
# Usage: ./scripts/start-seed-node.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULTS=$(node "$SCRIPT_DIR/entrypoint-defaults.js")
DEFAULT_REST_PORT=$(node -e "console.log(JSON.parse('$DEFAULTS').restApiPort)")
DEFAULT_ADMIN_PORT=$(node -e "console.log(JSON.parse('$DEFAULTS').adminPort)")
DEFAULT_HOST=$(node -e "console.log(JSON.parse('$DEFAULTS').localhost)")

DATA_DIR="${DATA_DIR:-./data}"

echo "Starting seed node..."
echo "  REST API Port: $DEFAULT_REST_PORT"
echo "  Admin WebSocket Port: $DEFAULT_ADMIN_PORT"
echo "  Data Directory: $DATA_DIR"
echo ""

# Set environment variables for the seed node
# Using a fixed UUID for reproducible testing (seed-node-1)
export NODE_ID="550e8400-e29b-41d4-a716-446655440001"
export NODE_ADDRESS="$DEFAULT_HOST:$DEFAULT_REST_PORT"
export REST_API_PORT="$DEFAULT_REST_PORT"
export DATA_DIR="$DATA_DIR"
export LOG_LEVEL="info"
export LOG_PRETTY_PRINT="true"

# Run the distributed database system
node "$PROJECT_ROOT/src/index.js" --data-dir "$DATA_DIR"
