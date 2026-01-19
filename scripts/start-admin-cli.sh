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

NODE_ADDRESS="${1:-localhost:8081}"

echo "Starting Admin CLI..."
echo "  Connecting to: $NODE_ADDRESS"
echo ""

# Run the admin CLI tool
node src/cli/bin/ddb-admin.js "$NODE_ADDRESS"
