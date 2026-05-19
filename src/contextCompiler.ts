import { WorkspaceSnapshot, FileEntry, DiagnosticEntry } from './types';

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
 */
export function compilePrimer(snapshot: WorkspaceSnapshot): string {
  const s: string[] = [];

  s.push(`=== StateFlow: Project Primer ===`);
  s.push(`Workspace: ${snapshot.workspaceName}`);
  s.push(`Synced at: ${snapshot.timestamp}`);
  s.push('');

  s.push('## Project Structure');
  s.push(formatFileList(snapshot.files));
  s.push('');

  s.push('## Language Summary');
  s.push(formatLanguageSummary(snapshot.files));
  s.push('');

  if (snapshot.activeFile) {
    s.push('## Active File');
    s.push(`Path: ${snapshot.activeFile.relativePath}`);
    s.push(`Language: ${snapshot.activeFile.languageId}`);
    s.push(`Lines: ${snapshot.activeFile.lineCount}`);
    s.push('');
  }

  if (snapshot.diagnostics.length > 0) {
    s.push('## Diagnostics');
    s.push(formatDiagnostics(snapshot.diagnostics));
    s.push('');
  }

  s.push(`Total files: ${snapshot.files.length}`);
  s.push(`=== End StateFlow Sync ===`);

  return s.join('\n');
}

/**
 * Compiles an incremental update (used on subsequent syncs).
 * Shows only what changed since the last sync.
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

  // Diff file lists
  const prevPaths = new Set(previous.files.map(f => f.relativePath));
  const currPaths = new Set(current.files.map(f => f.relativePath));

  const added = current.files.filter(f => !prevPaths.has(f.relativePath));
  const removed = previous.files.filter(f => !currPaths.has(f.relativePath));

  s.push('## File Changes');
  if (added.length === 0 && removed.length === 0) {
    s.push('No files added or removed.');
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
  }
  s.push('');

  if (current.activeFile) {
    s.push('## Active File');
    s.push(`Path: ${current.activeFile.relativePath}`);
    s.push(`Language: ${current.activeFile.languageId}`);
    s.push(`Lines: ${current.activeFile.lineCount}`);
    if (previous.activeFile && previous.activeFile.relativePath !== current.activeFile.relativePath) {
      s.push(`(Changed from: ${previous.activeFile.relativePath})`);
    }
    s.push('');
  }

  if (current.diagnostics.length > 0) {
    s.push('## Current Diagnostics');
    s.push(formatDiagnostics(current.diagnostics));
    s.push('');
  }

  s.push(`Total files: ${current.files.length}`);
  s.push(`=== End StateFlow Sync ===`);

  return s.join('\n');
}

/**
 * Compiles a deep sync — full content of a single file.
 */
export function compileDeepSync(
  relativePath: string,
  languageId: string,
  lineCount: number,
  content: string
): string {
  const s: string[] = [];

  s.push(`=== StateFlow: Deep Sync ===`);
  s.push(`File: ${relativePath}`);
  s.push(`Language: ${languageId}`);
  s.push(`Lines: ${lineCount}`);
  s.push(`Synced at: ${new Date().toISOString()}`);
  s.push('');
  s.push('--- File Content ---');
  s.push(content);
  s.push('--- End File Content ---');
  s.push('');
  s.push(`=== End StateFlow Sync ===`);

  return s.join('\n');
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

function formatFileList(files: FileEntry[]): string {
  return files
    .map(f => `  ${f.relativePath} (${f.languageId}, ${formatSize(f.sizeBytes)})`)
    .join('\n');
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

function formatDiagnostics(diagnostics: DiagnosticEntry[]): string {
  return diagnostics
    .map(d => {
      const parts: string[] = [];
      if (d.errors > 0) parts.push(`${d.errors} error${d.errors > 1 ? 's' : ''}`);
      if (d.warnings > 0) parts.push(`${d.warnings} warning${d.warnings > 1 ? 's' : ''}`);
      return `  ${d.relativePath}: ${parts.join(', ')}`;
    })
    .join('\n');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
