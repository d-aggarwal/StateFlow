import * as vscode from 'vscode';
import { FileEntry, ActiveFileInfo, DiagnosticEntry, WorkspaceSnapshot } from './types';

/**
 * ContextSource: Reads workspace state using VS Code APIs.
 *
 * This module is the only place that touches VS Code workspace/editor APIs
 * for data gathering. Everything it produces is a plain data object (no VS Code types leak out).
 */

/** Files/folders excluded from workspace scanning. */
const EXCLUDE_PATTERN = '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/.next/**,**/build/**,**/.vscode/**,**/*.map}';

/** Cap on files to prevent performance issues in large repos. */
const MAX_FILES = 500;

/**
 * Scans the workspace and produces a complete snapshot.
 *
 * Uses vscode.workspace.findFiles() which respects the user's files.exclude setting
 * and our additional EXCLUDE_PATTERN.
 */
export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('No workspace folder is open.');
  }

  const workspaceName = workspaceFolders[0].name;

  // findFiles(include, exclude, maxResults) — returns matching file URIs
  const fileUris = await vscode.workspace.findFiles('**/*', EXCLUDE_PATTERN, MAX_FILES);

  const files: FileEntry[] = [];
  for (const uri of fileUris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      files.push({
        relativePath,
        languageId: guessLanguage(relativePath),
        sizeBytes: stat.size,
      });
    } catch {
      // Skip files we can't stat (permissions, symlink issues, etc.)
    }
  }

  // Alphabetical sort for deterministic output
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return {
    workspaceName,
    files,
    activeFile: getActiveFileInfo(false),
    diagnostics: getDiagnosticsSummary(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Gets information about the currently active editor.
 * @param includeContent If true, includes full file text (for deep sync).
 */
export function getActiveFileInfo(includeContent: boolean): ActiveFileInfo | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const doc = editor.document;
  const info: ActiveFileInfo = {
    relativePath: vscode.workspace.asRelativePath(doc.uri, false),
    languageId: doc.languageId,
    lineCount: doc.lineCount,
  };

  if (includeContent) {
    info.content = doc.getText();
  }

  return info;
}

/**
 * Summarizes all workspace diagnostics (errors + warnings) per file.
 *
 * vscode.languages.getDiagnostics() returns Array<[Uri, Diagnostic[]]>.
 * We reduce each file's diagnostics to simple counts.
 */
export function getDiagnosticsSummary(): DiagnosticEntry[] {
  const allDiagnostics = vscode.languages.getDiagnostics();
  const entries: DiagnosticEntry[] = [];

  for (const [uri, diagnostics] of allDiagnostics) {
    if (diagnostics.length === 0) continue;

    let errors = 0;
    let warnings = 0;
    for (const d of diagnostics) {
      if (d.severity === vscode.DiagnosticSeverity.Error) errors++;
      else if (d.severity === vscode.DiagnosticSeverity.Warning) warnings++;
    }

    if (errors > 0 || warnings > 0) {
      entries.push({
        relativePath: vscode.workspace.asRelativePath(uri, false),
        errors,
        warnings,
      });
    }
  }

  // Worst files first
  entries.sort((a, b) => b.errors - a.errors || b.warnings - a.warnings);
  return entries;
}

/**
 * Maps file extension → language identifier.
 * Intentionally simple — covers common cases, falls back to the extension itself.
 */
function guessLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', rb: 'ruby',
    php: 'php', cs: 'csharp', cpp: 'cpp',
    c: 'c', h: 'c', swift: 'swift', dart: 'dart',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', xml: 'xml', html: 'html',
    css: 'css', scss: 'scss', md: 'markdown',
    sh: 'shellscript', sql: 'sql', vue: 'vue',
    svelte: 'svelte', dockerfile: 'dockerfile',
  };
  return map[ext] || ext;
}
