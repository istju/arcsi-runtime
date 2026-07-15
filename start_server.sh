#!/data/data/com.termux/files/usr/bin/bash

# Arcsi Runtime - Server Start Script (Termux)
# Place this in ~/.termux/tasker/ and call it from Tasker or manually

# --- Configuration ---
WORK_DIR="/data/data/com.termux/files/home/arcsi-runtime"
PID_FILE="$WORK_DIR/server.pid"
LOG_FILE="$WORK_DIR/server_startup.log"

# --- Wake lock: prevents Termux from being killed by Android ---
termux-wake-lock

# --- Check if server is already running ---
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "$(date): Server already running (PID: $OLD_PID) - exiting"
        termux-wake-unlock
        exit 0
    else
        echo "$(date): Stale PID file removed (PID: $OLD_PID)"
        rm -f "$PID_FILE"
    fi
fi

# --- Enter work directory ---
cd "$WORK_DIR" || {
    echo "$(date): Error - Could not enter directory: $WORK_DIR"
    termux-wake-unlock
    exit 1
}

echo "===========================================" >> "$LOG_FILE"
echo "$(date): New startup" >> "$LOG_FILE"
echo "===========================================" >> "$LOG_FILE"

# --- Start Python runtime daemon ---
nohup python3 -u -m runtime.server >> "$LOG_FILE" 2>&1 &
sleep 2

# --- Start Node.js server ---
nohup node ./serverem.js >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
echo "$(date): Server started (PID: $SERVER_PID)"

# --- Verify startup ---
sleep 2
if kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "$(date): Server running (PID: $SERVER_PID) - wake lock active"
else
    echo "$(date): Error - Server stopped after startup"
    termux-wake-unlock
    exit 1
fi

# Server runs in background, wake lock remains active
