import { WorkspaceSnapshot } from './types';


export class SyncState {
  private lastSnapshot: WorkspaceSnapshot | null = null;
  private syncCount: number = 0;

  
  isFirstSync(): boolean {
    return this.syncCount === 0;
  }

  
  getLastSnapshot(): WorkspaceSnapshot | null {
    return this.lastSnapshot;
  }

  
  getSyncCount(): number {
    return this.syncCount;
  }


  recordSync(snapshot: WorkspaceSnapshot): void {
    this.lastSnapshot = snapshot;
    this.syncCount++;
  }

 
  reset(): void {
    this.lastSnapshot = null;
    this.syncCount = 0;
  }
}
