#!/bin/bash
# Test script: scoring engine end-to-end
# Run with: bash test-scoring.sh
# Requires dev server running on localhost:4321

BASE="http://localhost:4321"
ADMIN_PIN="242526"
COOKIE_A="/tmp/copa-test-a.txt"
COOKIE_B="/tmp/copa-test-b.txt"

echo "=== Copa Liga Scoring Test ==="
echo ""

# 1. Register two teams
echo "1. Registering Team A (Palmers XI)..."
RES=$(curl -s -X POST "$BASE/api/fantasy/register" \
  -H 'Content-Type: application/json' \
  -d '{"teamName":"Palmers XI","pin":"1111"}' \
  -c "$COOKIE_A")
echo "   $RES"

echo "   Registering Team B (Sesko FC)..."
RES=$(curl -s -X POST "$BASE/api/fantasy/register" \
  -H 'Content-Type: application/json' \
  -d '{"teamName":"Sesko FC","pin":"2222"}' \
  -c "$COOKIE_B")
echo "   $RES"

sleep 1

# 2. Save team lineups
# Team A: 4-4-2 with Cole Palmer as captain
# Good PL players within ~50M budget
echo ""
echo "2. Saving Team A lineup (captain: Cole Palmer)..."
RES=$(curl -s -X POST "$BASE/api/fantasy/team/save" \
  -H 'Content-Type: application/json' \
  -b "$COOKIE_A" \
  -d '{
    "formationId": 156,
    "players": [
      {"playerId": 243253, "slotIndex": 0, "isCaptain": false},
      {"playerId": 248104, "slotIndex": 1, "isCaptain": false},
      {"playerId": 243230, "slotIndex": 2, "isCaptain": false},
      {"playerId": 242801, "slotIndex": 3, "isCaptain": false},
      {"playerId": 242807, "slotIndex": 4, "isCaptain": false},
      {"playerId": 242947, "slotIndex": 5, "isCaptain": true},
      {"playerId": 243129, "slotIndex": 6, "isCaptain": false},
      {"playerId": 247312, "slotIndex": 7, "isCaptain": false},
      {"playerId": 242940, "slotIndex": 8, "isCaptain": false},
      {"playerId": 243031, "slotIndex": 9, "isCaptain": false},
      {"playerId": 242921, "slotIndex": 10, "isCaptain": false}
    ]
  }')
echo "   $RES"

echo "   Saving Team B lineup (captain: Benjamin Sesko)..."
RES=$(curl -s -X POST "$BASE/api/fantasy/team/save" \
  -H 'Content-Type: application/json' \
  -b "$COOKIE_B" \
  -d '{
    "formationId": 156,
    "players": [
      {"playerId": 242829, "slotIndex": 0, "isCaptain": false},
      {"playerId": 242867, "slotIndex": 1, "isCaptain": false},
      {"playerId": 243069, "slotIndex": 2, "isCaptain": false},
      {"playerId": 243125, "slotIndex": 3, "isCaptain": false},
      {"playerId": 243233, "slotIndex": 4, "isCaptain": false},
      {"playerId": 242972, "slotIndex": 5, "isCaptain": false},
      {"playerId": 242759, "slotIndex": 6, "isCaptain": false},
      {"playerId": 242938, "slotIndex": 7, "isCaptain": false},
      {"playerId": 242940, "slotIndex": 8, "isCaptain": false},
      {"playerId": 245292, "slotIndex": 9, "isCaptain": true},
      {"playerId": 243241, "slotIndex": 10, "isCaptain": false}
    ]
  }')
echo "   $RES"

sleep 1

# 3. Calculate scores for all completed rounds
echo ""
echo "3. Calculating scores for all completed rounds..."
RES=$(curl -s -X POST "$BASE/api/fantasy/league/calculate" \
  -H 'Content-Type: application/json' \
  -d "{\"pin\":\"$ADMIN_PIN\"}")
echo "$RES" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'error' in d:
    print('ERROR:', d['error'])
    sys.exit(1)
print('Rounds calculated:', [r.get('round') for r in d.get('roundsCalculated',[])])
print()
for t in d.get('standings',[]):
    print(f\"#{t['position']} {t['teamName']:15s} total={t['totalGrowth']/1e6:.3f}M\")
    for r in t.get('rounds',[]):
        pg = r['playerGrowth']/1e6
        cb = r['captainBonus']/1e6
        bi = r['bankInterest']/1e6
        tot = r['total']/1e6
        print(f\"   Round {r['round']:2d}: players={pg:+.3f}M  captain={cb:+.3f}M  bank={bi:+.3f}M  = {tot:+.3f}M\")
"

# 4. Check standings
echo ""
echo "4. Public standings:"
curl -s "$BASE/api/fantasy/league/standings" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for t in d.get('standings',[]):
    print(f\"  #{t['position']} {t['teamName']:15s} {t['totalGrowth']/1e6:.3f}M  ({t['playerCount']} spelare, {len(t.get('rounds',[]))} omgångar)\")
"

# 5. Cleanup
echo ""
echo "5. Cleanup? (teams will remain for further testing)"
echo "   To delete: vercel blob del teams/palmers-xi.json teams/sesko-fc.json league/scores.json"
echo ""
echo "=== Test complete ==="
