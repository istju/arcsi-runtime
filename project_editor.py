#!/usr/bin/env python3
"""
project_editor.py - Meglévő projekt context.json szerkesztése (v5)
- Projekt lista + aktív projekt kijelzése indításkor
- Menü: szerkesztés, új projekt, aktív projekt váltás, kilépés
- Szerkesztés után opcionális aktiválás
- Biztonsági mentés, séma verzió kezelés
"""

import os
import json
import datetime
import shutil
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "utils"))
from i18n_py import t
from pathlib import Path

# =========================
# CONFIG
# =========================

WORK_DIR = Path(__file__).resolve().parent
PROJECTS_ROOT = WORK_DIR / "projects"
MY_PROJECTS_DIR = PROJECTS_ROOT / "my_projects"
ACTIVE_PROJECT_FILE = PROJECTS_ROOT / "active_project.json"
SCHEMA_VERSION = 3


# =========================
# INPUT HELPERS
# =========================

def get_input(prompt, default=None, required=True):
    while True:
        full = prompt
        if default is not None:
            full += f" [{default}]"
        full += ": "
        v = input(full).strip()
        if not v and default is not None:
            return default
        if not v and required:
            print("❌ " + t("editor.required_field"))
            continue
        return v


def yes_no(prompt, default=False):
    d = "i" if default else "n"
    v = get_input(prompt + " (i/n)", default=d, required=False)
    return v.lower() == "i"


def safe_json_input(prompt, existing=None):
    print(prompt)
    if existing is not None:
        print(json.dumps(existing, indent=2, ensure_ascii=False))
    print(t("editor.json_or_enter"))
    v = input().strip()
    if not v:
        return existing
    for _ in range(3):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            print("❌ " + t("editor.invalid_json"))
            v = input().strip()
    print("⚠️ " + t("editor.json_rejected"))
    return existing


def get_multiline_input(prompt, existing=None):
    print(prompt)
    if existing:
        print(t("editor.current"))
        for l in existing:
            print(" -", l)
    print(t("editor.enter_to_finish"))
    out = []
    while True:
        l = input()
        if l == "":
            break
        out.append(l)
    return out if out else existing


# =========================
# PROJECT LIST & ACTIVE
# =========================

def list_projects():
    if not MY_PROJECTS_DIR.exists():
        return []
    return sorted([
        d.name for d in MY_PROJECTS_DIR.iterdir()
        if d.is_dir() and (d / "context.json").exists()
    ])


def get_active_project_name():
    if not ACTIVE_PROJECT_FILE.exists():
        return None
    try:
        with open(ACTIVE_PROJECT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("name")
    except:
        return None


def show_projects_and_active():
    projects = list_projects()
    active = get_active_project_name()
    print("\n" + "=" * 50)
    print("📁 " + t("editor.available_projects"))
    for p in projects:
        marker = t("editor.active_marker") if p == active else ""
        print(f"  - {p}{marker}")
    if active and active not in projects:
        print("  ⚠️ " + t("editor.active_not_found", name=active))
    print("=" * 50)


def set_active_project(project_name):
    """Beállítja az aktív projektet (csak fájlba ír, nem szerkeszt)."""
    if project_name not in list_projects():
        print("❌ " + t("editor.project_not_found", name=project_name))
        return False
    active_data = {
        "name": project_name,
        "path": f"projects/my_projects/{project_name}",
        "set_at": datetime.datetime.now().isoformat()
    }
    with open(ACTIVE_PROJECT_FILE, "w", encoding="utf-8") as f:
        json.dump(active_data, f, indent=2, ensure_ascii=False)
    pass  # üzenet a hívó helyen jelenik meg
    return True


# =========================
# CREATE BLANK PROJECT
# =========================

def create_blank_project(project_name):
    """Létrehoz egy üres projekt sémát."""
    project_name = project_name.replace(" ", "_").lower()
    path = MY_PROJECTS_DIR / project_name
    file = path / "context.json"
    if file.exists():
        print("⚠️ " + t("editor.project_exists", name=project_name))
        return project_name
    path.mkdir(parents=True, exist_ok=True)
    blank_ctx = {
        "name": project_name,
        "description": "",
        "system_prompt": "Te egy precíz és célorientált AI asszisztens vagy.",
        "rules": [],
        "schema_version": SCHEMA_VERSION,
        "created_at": datetime.datetime.now().isoformat(),
        "updated_at": datetime.datetime.now().isoformat()
    }
    with open(file, "w", encoding="utf-8") as f:
        json.dump(blank_ctx, f, indent=2, ensure_ascii=False)
    print("✨ " + t("editor.project_initialized", file=file))
    return project_name


# =========================
# RENAME SAFE
# =========================

def rename_project(old, new):
    if old == new:
        return new
    old_p = MY_PROJECTS_DIR / old
    new_p = MY_PROJECTS_DIR / new
    if new_p.exists():
        print("❌ Már létezik ilyen projekt")
        return old
    shutil.move(str(old_p), str(new_p))
    print(f"📁 Rename: {old} → {new}")
    if ACTIVE_PROJECT_FILE.exists():
        with open(ACTIVE_PROJECT_FILE, "r", encoding="utf-8") as f:
            active = json.load(f)
        if active.get("name") == old:
            active["name"] = new
            active["path"] = f"projects/my_projects/{new}"
            with open(ACTIVE_PROJECT_FILE, "w", encoding="utf-8") as f:
                json.dump(active, f, indent=2, ensure_ascii=False)
    return new


# =========================
# EDITOR CORE
# =========================

def make_backup(project_path, file_path):
    if not file_path.exists():
        return
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = project_path / f"context_{timestamp}.json.bak"
    shutil.copy2(str(file_path), str(backup_file))
    print("📦 " + t("editor.backup", file=backup_file.name))
    backups = sorted(project_path.glob("*.json.bak"))
    if len(backups) > 3:
        for old in backups[:-3]:
            old.unlink()


def edit_project(project_name, ask_activate=True):
    """Szerkeszt egy meglévő projektet, és ha ask_activate=True, megkérdezi a végén hogy aktiválja-e."""
    path = MY_PROJECTS_DIR / project_name
    file = path / "context.json"
    if not file.exists():
        print("❌ " + t("editor.project_not_found", name=project_name))
        return None

    with open(file, "r", encoding="utf-8") as f:
        ctx = json.load(f)

    make_backup(path, file)

    print("\n" + "=" * 60)
    print("✏️  " + t("editor.editing", name=project_name))
    print("=" * 60)

    # Név (átnevezés)
    new_name = get_input(t("editor.project_name"), default=ctx.get("name", ""), required=True)
    new_name = new_name.replace(" ", "_").lower()
    if new_name != project_name:
        project_name = rename_project(project_name, new_name)
        path = MY_PROJECTS_DIR / project_name
        file = path / "context.json"
    ctx["name"] = project_name

    # Core mezők
    ctx["description"] = get_input(t("editor.description"), ctx.get("description", ""), True)
    ctx["system_prompt"] = get_input(t("editor.system_prompt"), ctx.get("system_prompt", ""))
    ctx["rules"] = get_multiline_input(t("editor.rules"), ctx.get("rules", []))

    # Intent
    if yes_no(t("editor.edit_intent"), "intent" in ctx):
        intent = ctx.get("intent", {})
        intent["goal"] = get_input("Goal", intent.get("goal", ""))
        intent["success_criteria"] = get_multiline_input(
            t("editor.success_criteria"),
            intent.get("success_criteria", [])
        )
        ctx["intent"] = {k: v for k, v in intent.items() if v}
    else:
        ctx.pop("intent", None)

    # Hardware
    if yes_no(t("editor.edit_hardware"), "hardware" in ctx):
        hw = ctx.get("hardware", {})
        hw["board"] = get_input("Board", hw.get("board", ""))
        hw["ram"] = get_input("RAM", hw.get("ram", ""))
        hw["network"] = get_input("Network", hw.get("network", ""))
        hw["storage"] = safe_json_input("Storage JSON", hw.get("storage", []))
        ctx["hardware"] = {k: v for k, v in hw.items() if v}
    else:
        ctx.pop("hardware", None)

    # Software
    if yes_no(t("editor.edit_software"), "software" in ctx):
        ctx["software"] = safe_json_input("Software JSON", ctx.get("software", []))
    else:
        ctx.pop("software", None)

    # Extra
    extra = ctx.get("extra", {})
    if yes_no(t("editor.edit_extra"), bool(extra)):
        while True:
            print("\n(a add / b edit / c del / d done)")
            a = get_input("action", "d")
            if a == "a":
                k = get_input("key")
                v = safe_json_input("value")
                extra[k] = {"value": v, "type": type(v).__name__}
            elif a == "b":
                print(list(extra.keys()))
                k = get_input("key")
                if k in extra:
                    v = safe_json_input("new value", extra[k]["value"])
                    extra[k] = {"value": v, "type": type(v).__name__}
            elif a == "c":
                k = get_input("delete key")
                extra.pop(k, None)
            elif a == "d":
                break
    if extra:
        ctx["extra"] = extra
    else:
        ctx.pop("extra", None)

    # META
    if "created_at" not in ctx:
        ctx["created_at"] = datetime.datetime.now().isoformat()
    ctx["updated_at"] = datetime.datetime.now().isoformat()
    ctx["schema_version"] = SCHEMA_VERSION

    # Mentés
    with open(file, "w", encoding="utf-8") as f:
        json.dump(ctx, f, indent=2, ensure_ascii=False)
    print("\n✅ " + t("editor.saved", file=file))

    # Aktiválási kérdés (ha kell)
    if ask_activate and yes_no(t("editor.set_active_after_edit", name=project_name), default=True):
        set_active_project(project_name)

    return project_name


# =========================
# MAIN MENU
# =========================

def main():
    # Biztosítjuk a mappák létezését
    MY_PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)

    # Indításkor: lista és aktív projekt kijelzése
    show_projects_and_active()

    # Főmenü
    while True:
        print("\n🎯 " + t("editor.what_to_do"))
        print("1. " + t("editor.edit_project"))
        print("2. " + t("editor.new_project"))
        print("3. " + t("editor.switch_project"))
        print("0. " + t("editor.exit"))
        choice = get_input(t("editor.choose_prompt"), required=False).strip()

        if choice == "0":
            print(t("editor.goodbye"))
            sys.exit(0)

        elif choice == "1":
            # Szerkesztés – válassz projektet
            projects = list_projects()
            if not projects:
                print("❌ " + t("editor.no_projects_create"))
                continue
            print("\n" + t("editor.choose_project"))
            for i, p in enumerate(projects, 1):
                print(f"{i}. {p}")
            sel = get_input(t("editor.project_name_or_number"), required=True).strip()
            if sel.isdigit():
                idx = int(sel) - 1
                if 0 <= idx < len(projects):
                    proj = projects[idx]
                else:
                    print("❌ " + t("editor.invalid_number"))
                    continue
            else:
                if sel in projects:
                    proj = sel
                else:
                    print(f"❌ A(z) '{sel}' projekt nem létezik.")
                    continue
            # Szerkesztés (a végén kérdez aktiválásról)
            edit_project(proj, ask_activate=True)

        elif choice == "2":
            # Új projekt létrehozása (csak név bekérés, majd létrehozás, majd szerkesztés)
            new_name = get_input(t("editor.new_project_name"), required=True)
            new_name = new_name.replace(" ", "_").lower()
            if new_name in list_projects():
                print(f"❌ A(z) '{new_name}' már létezik. Szerkeszd az 1-es menüpontban.")
                continue
            created = create_blank_project(new_name)
            if created:
                # Szerkesztés azonnal, a végén aktiválási kérdéssel
                edit_project(created, ask_activate=True)

        elif choice == "3":
            # Csak aktiválás (nem megy szerkesztőbe)
            projects = list_projects()
            if not projects:
                print("❌ " + t("editor.no_projects_switch"))
                continue
            print("\n" + t("editor.which_project_active"))
            for i, p in enumerate(projects, 1):
                print(f"{i}. {p}")
            sel = get_input(t("editor.choose_number_or_name"), required=True).strip()
            if sel.isdigit():
                idx = int(sel) - 1
                if 0 <= idx < len(projects):
                    proj = projects[idx]
                else:
                    print("❌ " + t("editor.invalid_number"))
                    continue
            else:
                if sel in projects:
                    proj = sel
                else:
                    print(f"❌ A(z) '{sel}' projekt nem létezik.")
                    continue
            set_active_project(proj)
            print(t("editor.daemon_restarting"))
            import subprocess, os
            subprocess.run(['pkill', '-f', 'runtime.server'], stderr=subprocess.DEVNULL)
            import time
            time.sleep(1)
            subprocess.Popen(
                ['python3', '-m', 'runtime.server'],
                cwd=os.path.dirname(os.path.abspath(__file__)),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            time.sleep(2)
            print("✅ " + t("editor.done_exit"))
            sys.exit(0)

        else:
            print("❌ " + t("editor.invalid_choice"))


if __name__ == "__main__":
    main()
