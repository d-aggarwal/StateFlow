/**
 * Shared type definitions for StateFlow.
 * These types flow through the pipeline: Source → Normalizer → Sink.
 */

/** A single file entry discovered in the workspace. */
export interface FileEntry {
  /** Path relative to workspace root */
  relativePath: string;
  /** Language identifier (e.g., "typescript", "json") */
  languageId: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last modification time (epoch ms) — used to detect modifications between syncs */
  lastModified: number;
  /** Export signatures extracted from code files (TS/JS only for now) */
  exports?: string[];
}

/** Information about the currently active editor file. */
export interface ActiveFileInfo {
  relativePath: string;
  languageId: string;
  lineCount: number;
  /** Full file content — populated for deep sync and primer/incremental */
  content?: string;
  /** Text the user has selected — only populated if a selection exists */
  selectedText?: string;
}

/** A single diagnostic message (error or warning) with its actual text. */
export interface DiagnosticDetail {
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

/** Diagnostic summary for a single file, now with actual messages. */
export interface DiagnosticEntry {
  relativePath: string;
  errors: number;
  warnings: number;
  /** The actual diagnostic messages — not just counts */
  details: DiagnosticDetail[];
}

/** Content of a key project file (package.json, README.md, etc.) */
export interface KeyFile {
  relativePath: string;
  content: string;
}

/** A complete point-in-time snapshot of the workspace. */
export interface WorkspaceSnapshot {
  workspaceName: string;
  files: FileEntry[];
  activeFile: ActiveFileInfo | null;
  diagnostics: DiagnosticEntry[];
  /** Content of key project files (package.json, README, etc.) */
  keyFiles: KeyFile[];
  timestamp: string;
}
