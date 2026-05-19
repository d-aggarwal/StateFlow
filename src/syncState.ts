import { WorkspaceSnapshot } from './types';

/**
 * In-memory state tracker for sync operations.
 *
 * Tracks whether this is a first sync (→ primer) or subsequent (→ incremental),
 * and stores the last snapshot for computing deltas.
 *
 * This state is intentionally ephemeral — it resets when VS Code restarts.
 * No persistent storage, no databases.
 */
export class SyncState {
  private lastSnapshot: WorkspaceSnapshot | null = null;
  private syncCount: number = 0;

  /** Returns true if no sync has been performed yet this session. */
  isFirstSync(): boolean {
    return this.syncCount === 0;
  }

  /** Returns the snapshot from the most recent sync, or null. */
  getLastSnapshot(): WorkspaceSnapshot | null {
    return this.lastSnapshot;
  }

  /** Returns how many syncs have been performed this session. */
  getSyncCount(): number {
    return this.syncCount;
  }

  /** Records a completed sync and stores the snapshot for future diffing. */
  recordSync(snapshot: WorkspaceSnapshot): void {
    this.lastSnapshot = snapshot;
    this.syncCount++;
  }

  /** Resets all state — next sync will produce a primer again. */
  reset(): void {
    this.lastSnapshot = null;
    this.syncCount = 0;
  }
}
