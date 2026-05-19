# StateFlow

Deterministic context synchronization between IDE-based LLMs and browser-based LLMs.

**No AI. No API calls. No background syncing. Just clipboard.**

## What It Does

StateFlow reads your workspace state in VS Code and copies a structured context summary to your clipboard. You then paste it into any browser-based LLM (ChatGPT, Claude, Gemini).

- **First sync** → Project primer (file tree, languages, diagnostics)
- **Subsequent syncs** → Incremental updates (only what changed)
- **Deep sync** → Full content of one file

## Commands

| Command | What it does |
|---------|-------------|
| `StateFlow: Sync Repo → Chat` | Copies project primer or incremental update |
| `StateFlow: Deep Sync Current File → Chat` | Copies full content of the active file |

## Architecture

```
ContextSource (repoAnalyzer) → ContextNormalizer (contextCompiler) → ContextSink (clipboard)
```

## Development

```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```
