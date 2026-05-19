# StateFlow

**[Available on the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=drishti-aggarwal.stateflow)**

A deterministic VS Code extension that synchronizes local workspace context to browser-based LLMs via the system clipboard.

## The Problem
Browser-based LLMs (e.g., ChatGPT, Claude, Gemini) offer state-of-the-art reasoning, but they lack visibility into your local codebase. Conversely, IDE-integrated AI tools have workspace context but may be limited by model capabilities, API constraints, or opaque context selection. Manually copying and pasting code, file structures, and compiler diagnostics to bridge this gap is slow, unstructured, and error-prone.

## The Solution
StateFlow acts as a transparent context transport layer. It deterministically analyzes your workspace state, compiles it into structured Markdown, and copies it to your clipboard. 


**Targeted Context:** Sends structured specific code slices rather than massive, noisy codebase dumps.

## Commands

StateFlow provides two targeted commands via the Command Palette:

1. **StateFlow: Sync Repo → Chat**
   - **First Run:** Copies a "Project Primer" (workspace identity, file tree with TS/JS exports, active file contents, and current diagnostics).
   - **Subsequent Runs:** Copies an "Incremental Update" containing only file modifications since the last sync.

2. **StateFlow: Error Context → Chat**
   - Locates the active compiler error nearest your cursor.
   - Prompts for an optional question (default: *"Why is this happening and how do I fix it?"*).
   - Copies the specific error message, your question, and ±20 lines of surrounding code to your clipboard for highly focused debugging.

## Development

```bash
npm install
npm run compile
# Press F5 in VS Code to launch the Extension Development Host
```
