#!/bin/bash
#
# Start a second node that connects to the seed node
#
# Usage: ./scripts/start-second-node.sh
#

set -e

SEED_NODE_ADDRESS="${SEED_NODE_ADDRESS:-localhost:8080}"

echo "Starting second node..."
echo "  REST API Port: 8082"
echo "  Admin WebSocket Port: 8083"
echo "  Data Directory: ./data2"
echo "  Seed Node: $SEED_NODE_ADDRESS"
echo ""

# Set environment variables for the second node
# Using a fixed UUID for reproducible testing (node-2)
export NODE_ID="550e8400-e29b-41d4-a716-446655440002"
export NODE_ADDRESS="localhost:8082"
export REST_API_PORT=8082
export ADMIN_WEBSOCKET_PORT=8083
export DATA_DIR="./data2"
export SEED_NODE_ADDRESS="$SEED_NODE_ADDRESS"
export LOG_LEVEL="info"
export LOG_PRETTY_PRINT="true"

# Run the distributed database system with seed node address
node src/index.js --data-dir ./data2 --seed "$SEED_NODE_ADDRESS"
