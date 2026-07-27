# Changelog

## [v1.3.0] - 2026-07-27

### Added
- Wisdom Layer — distillation pipeline (Trace → Reflection → Distillation → Wisdom)
- `sandbox/wisdom.py` — distillation tool with show/add/distill/reflect/validate/obsolete commands
- Reflection Agent — AI-proposed candidate principles from trace analysis
- Falsification Agent — Popper-style counter-example search before human approval
- Principle lifecycle: candidate → accepted → validated → core_principle → obsolete
- Confidence score, falsification verdict, and evidence metadata per principle
- Wisdom Density (compression ratio) and Wisdom Maturity (weighted score) metrics
- Wisdom Layer feedback loop — principles injected into SYSTEM_PROMPT

### Changed
- VISION.md content integrated into README.md
- README expanded with Runtime Passport evolution and Wisdom Layer documentation

---

## [v1.2.0] - 2026-07-23

### Added
- Runtime Passport V4 (`/capabilities` endpoint)
- `identity.specialization` with emergent traits, confidence, and history
- `identity.world` as structured object (name, type, active, knowledge_base)
- `authority` block (trust_level, boundaries, contract_limits)
- `reasoning` block (trace_based, policy_layer, working_worlds, supports_research)
- `communication` block (channels, preferred_channel, latency_class)
- `contracts` block (supported, pipeline, version)
- `/execute` endpoint for MCP Gateway integration
- `mcp-gateway.js` — MCP server exposing Runtime Passport tools via stdio
- Ollama API key rotation on 429 rate limit (OLLAMA_API_KEY_2, OLLAMA_API_KEY_3)
- GitHub Actions CI workflow (syntax check on push)
- Proxmox Runtime Passport V4 (core-runtime, debian-lxc)

### Changed
- Role auto-detection from environment (android → edge-runtime, HA/MQTT → core-runtime)
- `derived_from` array documents the role derivation chain
- `manifest_version` updated to 4

---

## [v1.1.0] - 2026-07-17

### Added
- Full internationalization (i18n) support
- `utils/i18n.js` and `utils/i18n_py.py` language modules
- `locales/en.json` and `locales/hu.json` locale files
- Language selection via `ARCSI_LANG` environment variable (default: `en`)
- GitHub clone-based installation test workflow (`github_test/`)

### Changed
- All server log messages translated to English
- System prompts translated to English
- WebUI buttons and status messages translated
- `project_editor.py` CLI fully translated
- `toolRegistry.js` tool messages translated
- Language follows user input language

### Fixed
- `forEach` variable conflict with i18n `t()` function
- Missing i18n import in `providerUtils.js`
- Remaining Hungarian strings in chat system prompt

## [v1.0.0] - 2026-07-15

### Initial Release
- Modular AI agent runtime
- Node.js + Python architecture
- Android (Termux) edge instance
- Multi-project context (Working Worlds)
- Tool system with sandbox
- Trace-based reasoning and policy layer
