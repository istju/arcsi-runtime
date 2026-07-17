# Changelog

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
