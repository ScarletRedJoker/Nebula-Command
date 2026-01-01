#!/bin/bash
# Install the Homelab Monitoring Agent on a remote server
# Usage: curl -sSL https://your-dashboard/agent/install.sh | bash -s -- --url https://dashboard.example.com --key YOUR_API_KEY

set -e

INSTALL_DIR="/opt/homelab/monitoring-agent"
SERVICE_NAME="homelab-monitoring-agent"
PYTHON_MIN_VERSION="3.8"

# Parse arguments
DASHBOARD_URL=""
API_KEY=""
INTERVAL=60

while [[ $# -gt 0 ]]; do
    case $1 in
        --url)
            DASHBOARD_URL="$2"
            shift 2
            ;;
        --key)
            API_KEY="$2"
            shift 2
            ;;
        --interval)
            INTERVAL="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=== Homelab Monitoring Agent Installer ==="

# Check for root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

# Check Python version
PYTHON_CMD=""
for cmd in python3 python; do
    if command -v $cmd &> /dev/null; then
        version=$($cmd -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        if [ "$(printf '%s\n' "$PYTHON_MIN_VERSION" "$version" | sort -V | head -n1)" = "$PYTHON_MIN_VERSION" ]; then
            PYTHON_CMD=$cmd
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "Python $PYTHON_MIN_VERSION+ is required but not found."
    echo "Install with: apt install python3 python3-pip"
    exit 1
fi

echo "Using Python: $PYTHON_CMD"

# Install dependencies
echo "Installing dependencies..."
$PYTHON_CMD -m pip install --quiet psutil requests 2>/dev/null || {
    apt-get update -qq && apt-get install -y -qq python3-pip python3-psutil python3-requests
}

# Create install directory
echo "Creating installation directory..."
mkdir -p "$INSTALL_DIR"

# Download agent script
echo "Downloading agent..."
if [ -n "$DASHBOARD_URL" ]; then
    curl -sSL "$DASHBOARD_URL/api/monitoring/agent/script" -o "$INSTALL_DIR/agent.py" 2>/dev/null || {
        # Fallback: copy from local if available
        if [ -f "/opt/homelab/HomeLabHub/deploy/scripts/monitoring-agent.py" ]; then
            cp /opt/homelab/HomeLabHub/deploy/scripts/monitoring-agent.py "$INSTALL_DIR/agent.py"
        else
            echo "Failed to download agent. Please provide the agent script manually."
            exit 1
        fi
    }
else
    # Local install
    if [ -f "/opt/homelab/HomeLabHub/deploy/scripts/monitoring-agent.py" ]; then
        cp /opt/homelab/HomeLabHub/deploy/scripts/monitoring-agent.py "$INSTALL_DIR/agent.py"
    else
        echo "Agent script not found. Please provide DASHBOARD_URL."
        exit 1
    fi
fi

chmod +x "$INSTALL_DIR/agent.py"

# Create environment file
cat > "$INSTALL_DIR/.env" << EOF
DASHBOARD_URL=${DASHBOARD_URL:-http://localhost:5000}
MONITORING_API_KEY=${API_KEY}
REPORT_INTERVAL=${INTERVAL}
EOF

# Create systemd service
echo "Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Homelab Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$PYTHON_CMD $INSTALL_DIR/agent.py --url \${DASHBOARD_URL} --key \${MONITORING_API_KEY} --interval \${REPORT_INTERVAL}
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
echo "Starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo ""
echo "=== Installation Complete ==="
echo "Agent installed to: $INSTALL_DIR"
echo "Service: $SERVICE_NAME"
echo ""
echo "Commands:"
echo "  Check status:  systemctl status $SERVICE_NAME"
echo "  View logs:     journalctl -u $SERVICE_NAME -f"
echo "  Test once:     $PYTHON_CMD $INSTALL_DIR/agent.py --once"
echo ""

# Show current metrics
echo "Current metrics:"
$PYTHON_CMD "$INSTALL_DIR/agent.py" --once
