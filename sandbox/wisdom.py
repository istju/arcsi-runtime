#!/usr/bin/env python3
"""
Wisdom Layer - Distillation Tool
Trace → Reflection → Distillation → Wisdom
"""

import json
import os
import datetime
import sys

PROJECTS_ROOT = '/data/data/com.termux/files/home/ai-chat-pro-v2/agent_work/work/projects/my_projects'

def get_wisdom_path(project_name):
    return os.path.join(PROJECTS_ROOT, project_name, 'wisdom.json')

def load_wisdom(project_name):
    path = get_wisdom_path(project_name)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)

def save_wisdom(project_name, wisdom):
    path = get_wisdom_path(project_name)
    with open(path, 'w') as f:
        json.dump(wisdom, f, indent=2, ensure_ascii=False)

def add_principle(project_name, category, principle, source_trace=None):
    """Add a distilled principle to the wisdom layer."""
    wisdom = load_wisdom(project_name)
    if not wisdom:
        print(f"❌ Wisdom fájl nem található: {project_name}")
        return

    entry = {
        "id": f"WP-{category.upper()[:3]}-{len(wisdom['principles'][category])+1:03d}",
        "principle": principle,
        "created_at": datetime.datetime.now().isoformat(),
        "last_referenced": None,
        "reuse_count": 0,
        "human_confirmed": True,
        "reinterpretation_count": 0,
        "source_trace": source_trace,
        "status": "active"
    }

    wisdom['principles'][category].append(entry)
    wisdom['age']['wisdom_principles'] += 1
    wisdom['retained_lessons'] += 1
    save_wisdom(project_name, wisdom)
    print(f"✅ Elv hozzáadva: [{entry['id']}] {principle[:60]}")

def distill_from_trace(project_name, trace_id, principle, category='research'):
    """Distill a principle from a specific trace entry."""
    # Load context
    ctx_path = os.path.join(PROJECTS_ROOT, project_name, 'context.json')
    with open(ctx_path) as f:
        ctx = json.load(f)

    trace_entry = None
    for t in ctx.get('research_trace', []):
        if t.get('knowledge_id') == trace_id:
            trace_entry = t
            break

    if not trace_entry:
        print(f"❌ Trace nem található: {trace_id}")
        return

    print(f"📖 Forrás trace: [{trace_id}] {trace_entry.get('content','')[:80]}...")
    add_principle(project_name, category, principle, source_trace=trace_id)

    # Update forgotten_events count
    wisdom = load_wisdom(project_name)
    wisdom['forgotten_events'] = len(ctx.get('research_trace', [])) - wisdom['retained_lessons']
    save_wisdom(project_name, wisdom)

def show_wisdom(project_name):
    """Display current wisdom state."""
    wisdom = load_wisdom(project_name)
    if not wisdom:
        print("❌ Nincs wisdom reteg")
        return

    print(f"\n📚 WISDOM LAYER — {project_name}")
    print(f"{'='*50}")

    status_icons = {
        'candidate': '🔵',
        'accepted': '🟢',
        'validated': '⭐',
        'core_principle': '💎',
        'obsolete': '⚫'
    }

    for category, principles in wisdom['principles'].items():
        if not principles:
            continue
        print(f"\n🔹 {category.upper()} PRINCIPLES:")
        for p in principles:
            icon = status_icons.get(p.get('status', ''), '⚪')
            conf = p.get('confidence', 0)
            print(f"  {icon} [{p['id']}] {p['principle']}")
            if p.get('source_trace'):
                print(f"         ← distilled from: {p['source_trace']}")
            print(f"         confidence: {conf:.2f} | status: {p.get('status','?')} | reuse: {p.get('reuse_count',0)}")
            if p.get('falsification_verdict'):
                print(f"         verdict: {p['falsification_verdict'][:80]}...")

    total = wisdom.get('forgotten_events', 0) + wisdom['retained_lessons']
    print(f"\n📊 WISDOM DENSITY:")
    print(f"  Research traces: {wisdom['retained_lessons']} retained / {total} total")
    if wisdom['retained_lessons'] > 0 and total > 0:
        density = wisdom['retained_lessons'] / total
        print(f"\n  📐 Wisdom Density: {density:.4f}")
        print(f"     {wisdom['retained_lessons']} principles / {total} total traces")
        print(f"     Avg: {total // max(1, wisdom['retained_lessons'])} traces per principle")

        all_principles = [p for cat in wisdom['principles'].values() for p in cat]
        if all_principles:
            import datetime
            now = datetime.datetime.now()
            scores = []
            for p in all_principles:
                score = 0
                try:
                    age_days = (now - datetime.datetime.fromisoformat(p.get('created_at', '2026-01-01'))).days
                    score += min(age_days / 30, 10)
                except: pass
                score += p.get('reuse_count', 0) * 2
                score += 5 if p.get('human_confirmed') else 0
                score += p.get('reinterpretation_count', 0) * 3
                scores.append(score)
            avg = sum(scores) / len(scores)
            label = '🌱 Early' if avg < 5 else ('🌿 Growing' if avg < 15 else '🌳 Mature')
            print(f"\n  🧭 Wisdom Maturity: {avg:.2f} — {label}")
            print(f"     (age + reuse + human_confirmed + reinterpretation)")


def change_status(project_name, principle_id, new_status):
    """Change the lifecycle status of a principle."""
    import datetime
    wisdom = load_wisdom(project_name)
    if not wisdom:
        print(f"❌ Wisdom fájl nem található: {project_name}")
        return

    for category, principles in wisdom['principles'].items():
        for p in principles:
            if p['id'] == principle_id:
                old_status = p.get('status', 'unknown')
                p['status'] = new_status
                if new_status == 'validated':
                    p['validated_at'] = datetime.datetime.now().isoformat()
                    p['confidence'] = min(1.0, p.get('confidence', 0.7) + 0.2)
                print(f"✅ [{principle_id}] {old_status} → {new_status}")
                if new_status == 'validated':
                    print(f"   confidence: {p['confidence']:.2f}")
                save_wisdom(project_name, wisdom)
                return

    print(f"❌ Elv nem található: {principle_id}")

def reflection_agent(project_name, last_n=10):
    """Reflection Agent - candidate principles javaslata trace alapján."""
    import subprocess

    ctx_path = os.path.join(PROJECTS_ROOT, project_name, 'context.json')
    with open(ctx_path) as f:
        ctx = json.load(f)

    traces = ctx.get('research_trace', [])
    if not traces:
        print("❌ Nincs trace bejegyzés.")
        return

    recent = traces[-last_n:]
    wisdom = load_wisdom(project_name)
    existing = [p['principle'] for cat in wisdom['principles'].values() for p in cat]

    print(f"\n🔍 REFLECTION AGENT — {project_name}")
    print(f"   Elemzett trace bejegyzések: {len(recent)}")
    print(f"   Meglévő elvek: {len(existing)}")
    print(f"{'='*50}")

    # Osszeallitjuk a trace tartalmat
    trace_summary = ""
    for t in recent:
        trace_summary += f"[{t.get('knowledge_id','?')}] {t.get('content','')[:150]}\n"

    # AI hivás candidate principle javaslathoz
    import urllib.request
    import urllib.error

    prompt = f"""You are a Wisdom Distillation Agent for the FIRSTT research project.

Analyze these recent research trace entries and suggest 2-3 candidate wisdom principles.
A principle must be:
- Universal (not specific to one experiment)
- Actionable (tells what to do or avoid)
- Distilled (removes all specific details)

Recent traces:
{trace_summary}

Existing principles (do not repeat):
{chr(10).join(existing) if existing else 'None yet'}

Respond with ONLY a JSON array:
[
  {{"principle": "...", "category": "research|runtime|collaboration|personal", "source_trace": "trace_id"}},
  ...
]"""

    try:
        import json as json2
        payload = json2.dumps({
            "model": "nemotron-3-ultra",
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }).encode()

        req = urllib.request.Request(
            'https://ollama.com/api/chat',
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {os.environ.get("OLLAMA_API_KEY", "")}'
            }
        )

        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json2.loads(resp.read())
            text = data.get('message', {}).get('content', '')

        # Parse JSON from response
        start = text.find('[')
        end = text.rfind(']') + 1
        if start != -1 and end > start:
            candidates = json2.loads(text[start:end])
            print(f"\n💡 CANDIDATE PRINCIPLES:")
            for i, c in enumerate(candidates):
                print(f"\n  [{i+1}] Category: {c.get('category','research')}")
                print(f"      Principle: {c.get('principle','')}")
                print(f"      Source: {c.get('source_trace','')}")

            print(f"\n{'='*50}")
            print("Approve a candidate? Enter number (1-3) or 'skip':")
            choice = input("> ").strip()

            if choice.isdigit() and 1 <= int(choice) <= len(candidates):
                selected = candidates[int(choice)-1]
                candidate_principle = selected.get('principle')

                # Try to falsify
                print(f"\n🔬 Falsification attempt: trying to find counter-examples...")
                falsify_prompt = f"""You are a scientific falsification agent.

Try to find counter-examples or contradictions to this principle from the research traces below.
Be critical and rigorous.

Principle to test: {candidate_principle}

Research traces:
{trace_summary}

Respond in JSON:
{{
  "falsified": true|false,
  "counter_examples": ["trace_id: reason", ...],
  "confidence": 0.0-1.0,
  "verdict": "short explanation"
}}"""

                try:
                    payload2_obj = {
                        "model": "nemotron-3-ultra",
                        "messages": [{"role": "user", "content": falsify_prompt}],
                        "stream": False
                    }
                    payload2 = json2.dumps(payload2_obj).encode()

                    req2_headers = {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + os.environ.get('OLLAMA_API_KEY', '')
                    }
                    req2 = urllib.request.Request(
                        'https://ollama.com/api/chat',
                        data=payload2,
                        headers=req2_headers
                    )

                    with urllib.request.urlopen(req2, timeout=120) as resp2:
                        data2 = json2.loads(resp2.read())
                        text2 = data2.get('message', {}).get('content', '')

                    start2 = text2.find('{')
                    end2 = text2.rfind('}') + 1
                    if start2 != -1 and end2 > start2:
                        falsify_result = json2.loads(text2[start2:end2])
                        falsified = falsify_result.get('falsified', False)
                        counter_examples = falsify_result.get('counter_examples', [])
                        confidence = falsify_result.get('confidence', 0)
                        verdict = falsify_result.get('verdict', '')

                        print(f"  Verdict: {verdict}")
                        print(f"  Confidence: {confidence:.2f}")
                        if counter_examples:
                            print(f"  Counter-examples found: {len(counter_examples)}")
                            for ce in counter_examples:
                                print(f"    - {ce}")

                        if falsified:
                            print(f"\n⚠️  Principle FALSIFIED — adding as candidate with counter-examples")
                            status = 'candidate'
                        else:
                            print(f"\n✅ No counter-examples found — principle survives falsification")
                            status = 'accepted'
                    else:
                        status = 'candidate'
                        counter_examples = []
                        falsified = False

                except Exception as e:
                    print(f"⚠️ Falsification error: {e}")
                    status = 'candidate'
                    counter_examples = []
                    falsified = False

                # Add principle with lifecycle status
                wisdom = load_wisdom(project_name)
                cat = selected.get('category', 'research')
                entry = {
                    "id": f"WP-{cat.upper()[:3]}-{len(wisdom['principles'].get(cat, []))+1:03d}",
                    "principle": candidate_principle,
                    "created_at": datetime.datetime.now().isoformat(),
                    "last_referenced": None,
                    "reuse_count": 0,
                    "human_confirmed": True,
                    "reinterpretation_count": 0,
                    "source_trace": selected.get('source_trace'),
                    "status": status,
                    "validated_at": None,
                    "counter_examples": counter_examples,
                    "conflicts": [],
                    "falsification_attempts": 1,
                    "falsification_failed": 0 if falsified else 1,
                    "confidence": falsify_result.get('confidence', 0.4) if 'falsify_result' in dir() else 0.4,
                    "falsification_verdict": falsify_result.get('verdict', None) if 'falsify_result' in dir() else None,
                    "evidence": []
                }

                if cat not in wisdom['principles']:
                    wisdom['principles'][cat] = []
                wisdom['principles'][cat].append(entry)
                wisdom['age']['wisdom_principles'] += 1
                wisdom['retained_lessons'] += 1
                save_wisdom(project_name, wisdom)
                print(f"\n✅ [{entry['id']}] Added with status: {status}")
            else:
                print("⏭️ Skipped.")
        else:
            print("❌ Nem sikerült JSON-t kinyerni a válaszból.")
            print(text[:200])

    except Exception as e:
        print(f"❌ Reflection Agent hiba: {e}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Használat:")
        print("  python3 wisdom.py show <projekt>")
        print("  python3 wisdom.py add <projekt> <kategória> <elv>")
        print("  python3 wisdom.py distill <projekt> <trace_id> <kategória> <elv>")
        print("  python3 wisdom.py reflect <projekt> [n=10]")
        print("  python3 wisdom.py validate <projekt> <principle_id>")
        print("  python3 wisdom.py obsolete <projekt> <principle_id>")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'show' and len(sys.argv) >= 3:
        show_wisdom(sys.argv[2])

    elif cmd == 'add' and len(sys.argv) >= 5:
        add_principle(sys.argv[2], sys.argv[3], sys.argv[4])

    elif cmd == 'distill' and len(sys.argv) >= 6:
        distill_from_trace(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])

    elif cmd == 'reflect' and len(sys.argv) >= 3:
        n = int(sys.argv[4]) if len(sys.argv) >= 5 else 10
        reflection_agent(sys.argv[2], last_n=n)

    elif cmd == 'validate' and len(sys.argv) >= 4:
        change_status(sys.argv[2], sys.argv[3], 'validated')

    elif cmd == 'obsolete' and len(sys.argv) >= 4:
        change_status(sys.argv[2], sys.argv[3], 'obsolete')

    else:
        print("❌ Ismeretlen parancs")
