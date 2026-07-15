#!/data/data/com.termux/files/usr/bin/bash
# ============================================
# Housekeeping - régi/redundáns fájlok törlése
# ============================================

WORK_DIR="/data/data/com.termux/files/home/ai-chat-pro-v2/agent_work/work"
LOG_DIR="$WORK_DIR/chat_logs"

echo "🧹 Housekeeping indítása..."
echo ""

# 1. Régi agent_*.json fájlok (7 napnál régebbi)
echo "📁 Régi agent_*.json fájlok keresése (7 napnál régebbi)..."
OLD_AGENT_FILES=$(find "$LOG_DIR" -maxdepth 1 -name "agent_*.json" -mtime +7 2>/dev/null)
OLD_COUNT=$(echo "$OLD_AGENT_FILES" | grep -c . 2>/dev/null || echo 0)
if [ -n "$OLD_AGENT_FILES" ]; then
    echo "$OLD_AGENT_FILES" | xargs rm -f
    echo "✅ $OLD_COUNT régi agent log törölve"
else
    echo "✅ Nincs törlendő régi agent log"
fi

# 2. Kísérleti/teszt fájlok
echo ""
echo "🗑️  Kísérleti fájlok törlése..."
FILES_TO_DELETE=(
    "$WORK_DIR/test_kw.js"
    "$WORK_DIR/test_kw.jsn"
    "$WORK_DIR/test_kw.js.bak"
    "$WORK_DIR/serverem1.js"
    "$WORK_DIR/serverem2.js"
    "$WORK_DIR/serverem2.js.bak"
    "$WORK_DIR/het_elemzese.txt"
    "$WORK_DIR/folyamatos_naplo.txt"
    "$WORK_DIR/javaslatok_serverem.txt"
    "$WORK_DIR/mappa_struktura.txt"
    "$WORK_DIR/log_analyzer.py"
    "$WORK_DIR/log_analyzer.py.bak"
)

for f in "${FILES_TO_DELETE[@]}"; do
    if [ -f "$f" ]; then
        rm -f "$f"
        echo "✅ Törölve: $(basename "$f")"
    fi
done

# 3. Régi notify_log fájlok (30 napnál régebbi)
echo ""
echo "📁 Régi notify_log fájlok keresése (30 napnál régebbi)..."
OLD_NOTIFY=$(find "$LOG_DIR" -maxdepth 1 -name "notify_log_*.txt" -mtime +30 2>/dev/null)
OLD_NOTIFY_COUNT=$(echo "$OLD_NOTIFY" | grep -c . 2>/dev/null || echo 0)
if [ -n "$OLD_NOTIFY" ]; then
    echo "$OLD_NOTIFY" | xargs rm -f
    echo "✅ $OLD_NOTIFY_COUNT régi notify log törölve"
else
    echo "✅ Nincs törlendő régi notify log"
fi

echo ""
echo "🎉 Housekeeping befejezve!"
