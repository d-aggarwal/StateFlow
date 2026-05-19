import * as vscode from 'vscode';
import { SyncState } from './syncState';
import { getWorkspaceSnapshot, getActiveFileInfo } from './repoAnalyzer';
import { compilePrimer, compileIncremental, compileDeepSync } from './contextCompiler';
import { copyToClipboard } from './clipboardSink';

/**
 * Extension entry point.
 *
 * Registers two commands:
 *   1. stateflow.syncRepo    — Project primer (first) or incremental update (subsequent)
 *   2. stateflow.deepSync    — Full content of the active file (or selection)
 *
 * All state is in-memory via SyncState. No persistence, no background work.
 */

let syncState: SyncState;

export function activate(context: vscode.ExtensionContext) {
  syncState = new SyncState();

  // ── Command 1: Sync Repo → Chat ──────────────────────────────────────────
  const syncRepoCmd = vscode.commands.registerCommand('stateflow.syncRepo', async () => {
    try {
      const snapshot = await getWorkspaceSnapshot();
      let output: string;

      if (syncState.isFirstSync()) {
        output = compilePrimer(snapshot);
        await copyToClipboard(output);
        vscode.window.showInformationMessage(
          `StateFlow: Project primer copied to clipboard (${snapshot.files.length} files).`
        );
      } else {
        const previous = syncState.getLastSnapshot()!;
        output = compileIncremental(snapshot, previous);
        await copyToClipboard(output);
        vscode.window.showInformationMessage(
          `StateFlow: Incremental update copied to clipboard (sync #${syncState.getSyncCount() + 1}).`
        );
      }

      syncState.recordSync(snapshot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      vscode.window.showErrorMessage(`StateFlow: ${msg}`);
    }
  });

  // ── Command 2: Deep Sync Current File → Chat ────────────────────────────
  // Sends full file content, or just the selected text if user has a selection.
  const deepSyncCmd = vscode.commands.registerCommand('stateflow.deepSync', async () => {
    try {
      const fileInfo = getActiveFileInfo(true);

      if (!fileInfo) {
        vscode.window.showWarningMessage('StateFlow: No active file to deep sync.');
        return;
      }

      if (!fileInfo.content) {
        vscode.window.showWarningMessage('StateFlow: Could not read file content.');
        return;
      }

      const output = compileDeepSync(
        fileInfo.relativePath,
        fileInfo.languageId,
        fileInfo.lineCount,
        fileInfo.content,
        fileInfo.selectedText  // undefined if no selection → sends full file
      );

      await copyToClipboard(output);

      const what = fileInfo.selectedText ? 'selection' : `${fileInfo.lineCount} lines`;
      vscode.window.showInformationMessage(
        `StateFlow: Deep sync of "${fileInfo.relativePath}" copied to clipboard (${what}).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      vscode.window.showErrorMessage(`StateFlow: ${msg}`);
    }
  });

  context.subscriptions.push(syncRepoCmd, deepSyncCmd);
}

export function deactivate() {
  // Nothing to clean up — all state is in-memory
}
