#!/data/data/com.termux/files/usr/bin/bash
# ============================================
# Node szerver biztonságos újraindítása
# ============================================

WORK_DIR="/data/data/com.termux/files/home/ai-chat-pro-v2/agent_work/work"
PID_FILE="$WORK_DIR/server.pid"

echo "🔍 Node szerver leállítása..."

# 1. PID fájl alapú leállítás (a boot script ezt használja)
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        kill -9 "$OLD_PID"
        echo "✅ Leállítva PID fájlból: $OLD_PID"
    fi
    rm -f "$PID_FILE"
fi

# 2. Biztonsági ráadás: minden serverem.js process leállítása
PIDS=$(pgrep -f "node.*serverem.js")
if [ -n "$PIDS" ]; then
    echo "⚠️  Egyéb futó szerver process(ek) találva, leállítás: $PIDS"
    kill -9 $PIDS
fi

sleep 1

# 3. Ellenőrzés
REMAINING=$(pgrep -f "node.*serverem.js")
if [ -n "$REMAINING" ]; then
    echo "❌ Még fut valami: $REMAINING"
else
    echo "✅ Minden szerver process leállítva"
fi

echo ""
echo "🐍 Python runtime daemon ellenőrzése..."
if pgrep -f "python3.*runtime.server" > /dev/null; then
    echo "✅ Python runtime daemon már fut"
else
    echo "⚠️  Python runtime daemon nem fut - indítás..."
    cd "$WORK_DIR" || exit 1
    nohup python3 -u -m runtime.server > chat_logs/runtime.log 2>&1 &
    sleep 2
    if pgrep -f "python3.*runtime.server" > /dev/null; then
        echo "✅ Python runtime daemon elindítva"
    else
        echo "❌ Python runtime daemon indítása sikertelen - ellenőrizd a chat_logs/runtime.log fájlt"
    fi
fi

echo ""
echo "🚀 Indítás előtérben (Ctrl+C-vel állítható meg)..."
cd "$WORK_DIR" || exit 1
node serverem.js
