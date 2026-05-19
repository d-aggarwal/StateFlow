import * as vscode from 'vscode';
import { SyncState } from './syncState';
import { getWorkspaceSnapshot, getErrorAtCursor, getActiveFileInfo } from './repoAnalyzer';
import { compilePrimer, compileIncremental, compileErrorContext } from './contextCompiler';
import { copyToClipboard } from './clipboardSink';

let syncState: SyncState;

export function activate(context: vscode.ExtensionContext) {
  syncState = new SyncState();

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

  const errorContextCmd = vscode.commands.registerCommand('stateflow.errorContext', async () => {
    try {
      const ctx = getErrorAtCursor();

      if (!ctx) {
        const activeFile = getActiveFileInfo(false);
        const fileName = activeFile ? `"${activeFile.relativePath}"` : 'the current file';
        vscode.window.showInformationMessage(
          `StateFlow: No errors or warnings found in ${fileName}. 🎉`
        );
        return;
      }

      const userQuestion = await vscode.window.showInputBox({
        title: 'StateFlow: What do you want to ask the browser LLM?',
        prompt: `Error found: "${ctx.error.message}" — what's your question?`,
        value: 'Why is this happening and how do I fix it?',
        ignoreFocusOut: true,
      });

      ctx.userQuestion = userQuestion;

      const output = compileErrorContext(ctx);
      await copyToClipboard(output);

      vscode.window.showInformationMessage(
        `StateFlow: Error context copied to clipboard (line ${ctx.errorLine}: ${ctx.error.severity}).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      vscode.window.showErrorMessage(`StateFlow: ${msg}`);
    }
  });

  context.subscriptions.push(syncRepoCmd, errorContextCmd);
}

export function deactivate() {
  // Nothing to clean up — all state is in-memory
}
