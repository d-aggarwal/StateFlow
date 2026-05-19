import { WorkspaceSnapshot, FileEntry, DiagnosticEntry, KeyFile } from './types';

/**
 * ContextNormalizer: Compiles workspace data into human-readable text blocks
 * suitable for pasting into any chat-based LLM.
 *
 * Output format is plain text with markdown-style headers.
 * Designed to be readable by both humans and LLMs.
 */

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compiles a full project primer (used on first sync).
 * Gives the receiving LLM a high-level understanding of the project.
 *
 * Includes: key file contents, file tree with exports, active file content,
 * and full diagnostic messages.
 */
export function compilePrimer(snapshot: WorkspaceSnapshot): string {
  const s: string[] = [];

  s.push(`=== StateFlow: Project Primer ===`);
  s.push(`Workspace: ${snapshot.workspaceName}`);
  s.push(`Synced at: ${snapshot.timestamp}`);
  s.push('');

  // Key files (package.json, README) — project identity
  if (snapshot.keyFiles.length > 0) {
    s.push('## Project Identity');
    for (const kf of snapshot.keyFiles) {
      s.push(`### ${kf.relativePath}`);
      s.push(kf.content);
      s.push('');
    }
  }

  // File tree with export signatures
  s.push('## Project Structure');
  s.push(formatFileListWithExports(snapshot.files));
  s.push('');

  s.push('## Language Summary');
  s.push(formatLanguageSummary(snapshot.files));
  s.push('');

  // Active file with full content
  if (snapshot.activeFile) {
    s.push('## Active File');
    s.push(`Path: ${snapshot.activeFile.relativePath}`);
    s.push(`Language: ${snapshot.activeFile.languageId}`);
    s.push(`Lines: ${snapshot.activeFile.lineCount}`);
    if (snapshot.activeFile.content) {
      s.push('');
      s.push('--- Content ---');
      s.push(snapshot.activeFile.content);
      s.push('--- End Content ---');
    }
    s.push('');
  }

  // Full diagnostic messages
  if (snapshot.diagnostics.length > 0) {
    s.push('## Diagnostics');
    s.push(formatDiagnosticsWithMessages(snapshot.diagnostics));
    s.push('');
  }

  s.push(`Total files: ${snapshot.files.length}`);
  s.push(`=== End StateFlow Sync ===`);

  return s.join('\n');
}

/**
 * Compiles an incremental update (used on subsequent syncs).
 * Shows what changed since the last sync: added, removed, and modified files.
 * Includes active file content and full diagnostic messages.
 */
export function compileIncremental(
  current: WorkspaceSnapshot,
  previous: WorkspaceSnapshot
): string {
  const s: string[] = [];

  s.push(`=== StateFlow: Incremental Update ===`);
  s.push(`Workspace: ${current.workspaceName}`);
  s.push(`Synced at: ${current.timestamp}`);
  s.push(`Previous sync: ${previous.timestamp}`);
  s.push('');

  // Diff file lists: added, removed, and modified
  const prevFileMap = new Map(previous.files.map(f => [f.relativePath, f]));
  const currPaths = new Set(current.files.map(f => f.relativePath));

  const added = current.files.filter(f => !prevFileMap.has(f.relativePath));
  const removed = previous.files.filter(f => !currPaths.has(f.relativePath));
  const modified = current.files.filter(f => {
    const prev = prevFileMap.get(f.relativePath);
    if (!prev) return false; // new file, not modified
    // Detect modification by comparing mtime or size
    return f.lastModified !== prev.lastModified || f.sizeBytes !== prev.sizeBytes;
  });

  s.push('## File Changes');
  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    s.push('No file changes detected.');
  } else {
    if (added.length > 0) {
      s.push('Added:');
      for (const f of added) {
        s.push(`  + ${f.relativePath} (${f.languageId})`);
      }
    }
    if (removed.length > 0) {
      s.push('Removed:');
      for (const f of removed) {
        s.push(`  - ${f.relativePath} (${f.languageId})`);
      }
    }
    if (modified.length > 0) {
      s.push('Modified:');
      for (const f of modified) {
        const prev = prevFileMap.get(f.relativePath)!;
        const sizeChange = f.sizeBytes !== prev.sizeBytes
          ? ` (${formatSize(prev.sizeBytes)} → ${formatSize(f.sizeBytes)})`
          : '';
        s.push(`  ~ ${f.relativePath}${sizeChange}`);
      }
    }
  }
  s.push('');

  // Active file with full content
  if (current.activeFile) {
    s.push('## Active File');
    s.push(`Path: ${current.activeFile.relativePath}`);
    s.push(`Language: ${current.activeFile.languageId}`);
    s.push(`Lines: ${current.activeFile.lineCount}`);
    if (previous.activeFile && previous.activeFile.relativePath !== current.activeFile.relativePath) {
      s.push(`(Changed from: ${previous.activeFile.relativePath})`);
    }
    if (current.activeFile.content) {
      s.push('');
      s.push('--- Content ---');
      s.push(current.activeFile.content);
      s.push('--- End Content ---');
    }
    s.push('');
  }

  // Full diagnostic messages
  if (current.diagnostics.length > 0) {
    s.push('## Current Diagnostics');
    s.push(formatDiagnosticsWithMessages(current.diagnostics));
    s.push('');
  }

  s.push(`Total files: ${current.files.length}`);
  s.push(`=== End StateFlow Sync ===`);

  return s.join('\n');
}

/**
 * Compiles a deep sync — full content of a single file,
 * or just the selected text if the user has a selection.
 */
export function compileDeepSync(
  relativePath: string,
  languageId: string,
  lineCount: number,
  content: string,
  selectedText?: string
): string {
  const s: string[] = [];

  s.push(`=== StateFlow: Deep Sync ===`);
  s.push(`File: ${relativePath}`);
  s.push(`Language: ${languageId}`);
  s.push(`Lines: ${lineCount}`);
  s.push(`Synced at: ${new Date().toISOString()}`);

  if (selectedText) {
    // Selection mode: send only what the user highlighted
    s.push(`Mode: selection`);
    s.push('');
    s.push('--- Selected Content ---');
    s.push(selectedText);
    s.push('--- End Selected Content ---');
    s.push('');
    s.push('(Full file content was not sent. Only the selected portion above.)');
  } else {
    // Full file mode
    s.push('');
    s.push('--- File Content ---');
    s.push(content);
    s.push('--- End File Content ---');
  }

  s.push('');
  s.push(`=== End StateFlow Sync ===`);

  return s.join('\n');
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

/**
 * Formats file list with export signatures shown beneath each file.
 */
function formatFileListWithExports(files: FileEntry[]): string {
  const lines: string[] = [];
  for (const f of files) {
    lines.push(`  ${f.relativePath} (${f.languageId}, ${formatSize(f.sizeBytes)})`);
    // Show export signatures if available
    if (f.exports && f.exports.length > 0) {
      for (const exp of f.exports) {
        lines.push(`    → ${exp}`);
      }
    }
  }
  return lines.join('\n');
}

function formatLanguageSummary(files: FileEntry[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    counts.set(f.languageId, (counts.get(f.languageId) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang, n]) => `  ${lang}: ${n} file${n > 1 ? 's' : ''}`)
    .join('\n');
}

/**
 * Formats diagnostics with actual error/warning messages and line numbers.
 * Example:
 *   src/utils.ts:
 *     Line 23 [error]: Property 'pool' does not exist on type 'Connection'
 *     Line 45 [warning]: 'result' is declared but never used
 */
function formatDiagnosticsWithMessages(diagnostics: DiagnosticEntry[]): string {
  return diagnostics
    .map(d => {
      const header = `  ${d.relativePath}: ${d.errors} error${d.errors !== 1 ? 's' : ''}, ${d.warnings} warning${d.warnings !== 1 ? 's' : ''}`;
      const details = d.details
        .map(det => `    Line ${det.line} [${det.severity}]: ${det.message}`)
        .join('\n');
      return `${header}\n${details}`;
    })
    .join('\n');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
