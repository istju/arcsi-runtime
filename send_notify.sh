#!/data/data/com.termux/files/usr/bin/bash
# Arcsi Runtime - Notification Bridge Script (Tasker → Arcsi)
# Called by Tasker when a notification is intercepted
# Reads JSON from stdin and forwards to the Arcsi notification endpoint

body=$(cat)

# Parse title and message from JSON body
title=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('title','Arcsi'))" 2>/dev/null || echo "Arcsi")
text=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null || echo "")

json="{"app":"arcsi","title":"$title","text":"$text","sessionId":"agent_notify"}"

response=$(curl -s -X POST http://127.0.0.1:3000/agent/notify \
  -H "Content-Type: application/json" \
  -d "$json")

echo "$response"
