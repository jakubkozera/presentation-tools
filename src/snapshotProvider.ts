import * as vscode from 'vscode';
import { Snapshot, fileSnapshots, groupSnapshots } from './utils';

// Types to represent the tree structure
export type TreeItem = SnapshotGroup | Snapshot;

// Class to represent a group of snapshots in the tree view
export class SnapshotGroup {
  constructor(
    public readonly label: string,
    public readonly snapshots: Snapshot[]
  ) {}
}

// Tree view for snapshots
export class SnapshotProvider implements vscode.TreeDataProvider<TreeItem>, vscode.TreeDragAndDropController<TreeItem> {
  // Drag and drop capabilities
  readonly dropMimeTypes = ['application/vnd.code.tree.presentationSnapshotsView'];
  readonly dragMimeTypes = ['application/vnd.code.tree.presentationSnapshotsView'];
  
  // Event emitter for tree data changes
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined> = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined> = this._onDidChangeTreeData.event;
  
  constructor() {
    // Initialize by checking if there are snapshots
    this.updateSnapshotAvailability();
  }
  
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
    // Update the context variable when refreshed
    this.updateSnapshotAvailability();
  }
  
  private updateSnapshotAvailability(): void {
    // Check if there are any snapshots for the current file
    const editor = vscode.window.activeTextEditor;
    let hasSnapshots = false;
    
    if (editor) {
      const filePath = editor.document.uri.fsPath;
      hasSnapshots = !!fileSnapshots[filePath] && fileSnapshots[filePath].length > 0;
    }
    
    // Update the context variable that the when clause uses
    vscode.commands.executeCommand('setContext', 'presentationSnapshotsHasSnapshots', hasSnapshots);
  }
  
  getTreeItem(element: TreeItem): vscode.TreeItem {
    // If element is a Snapshot
    if ('content' in element) {
      const snapshot = element as Snapshot;
      const item = new vscode.TreeItem(snapshot.description);
      item.tooltip = new Date(snapshot.timestamp).toLocaleString();
      item.contextValue = 'snapshot';
      
      // Add a direct command to instantly load the snapshot when clicking on the tree item
      item.command = {
        command: 'presentationSnapshots.loadSnapshotInstantly',
        title: 'Load Snapshot Instantly',
        arguments: [snapshot]
      };
      
      return item;
    } 
    // If element is a SnapshotGroup
    else {
      const group = element as SnapshotGroup;
      const item = new vscode.TreeItem(
        group.label,
        group.snapshots.length > 0 
          ? vscode.TreeItemCollapsibleState.Expanded 
          : vscode.TreeItemCollapsibleState.None
      );
      
      item.contextValue = 'snapshotGroup';
      item.tooltip = `${group.snapshots.length} snapshot(s)`;
      item.iconPath = new vscode.ThemeIcon('folder');
      
      return item;
    }
  }
  
  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    // If getting children of a group, return its snapshots
    if (element && 'snapshots' in element) {
      return Promise.resolve(element.snapshots);
    }
    
    // If getting root elements, return groups
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return Promise.resolve([]);
    }
    
    const filePath = editor.document.uri.fsPath;
    const snapshots = fileSnapshots[filePath] || [];
    
    // Update context when getting children
    this.updateSnapshotAvailability();
    
    if (snapshots.length === 0) {
      return Promise.resolve([]);
    }
    
    // Group snapshots
    const groupedSnapshots = groupSnapshots(snapshots);
    
    // Convert to array of SnapshotGroup objects
    const groups: SnapshotGroup[] = [];
    groupedSnapshots.forEach((snapshots, groupName) => {
      groups.push(new SnapshotGroup(groupName, snapshots));
    });
    
    return Promise.resolve(groups);
  }

  // Get parent of an item in the tree
  getParent(element: TreeItem): vscode.ProviderResult<TreeItem> {
    // If element is a Snapshot, find its parent group
    if ('content' in element) {
      const snapshot = element as Snapshot;
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return null;
      }
      
      const filePath = editor.document.uri.fsPath;
      if (!fileSnapshots[filePath]) {
        return null;
      }
      
      // Find which group this snapshot belongs to
      const groupedSnapshots = groupSnapshots(fileSnapshots[filePath]);
      for (const [groupName, snapshots] of groupedSnapshots.entries()) {
        if (snapshots.some(s => s.id === snapshot.id)) {
          return new SnapshotGroup(groupName, snapshots);
        }
      }
    }
    
    // If element is a group or we couldn't find a parent, return null
    return null;
  }
  
  // Handle drag start
  handleDrag(source: readonly TreeItem[], dataTransfer: vscode.DataTransfer): void {
    // Only support dragging snapshots, not groups
    const snapshots = source.filter(item => 'content' in item) as Snapshot[];
    if (snapshots.length === 0) {
      return;
    }
    
    // Set the data for the drag operation
    dataTransfer.set('application/vnd.code.tree.presentationSnapshotsView', 
      new vscode.DataTransferItem(snapshots));
  }
  
  // Handle drop
  async handleDrop(target: TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (!fileSnapshots[filePath]) {
      return;
    }
    
    // Get the dragged snapshots
    const transferItem = dataTransfer.get('application/vnd.code.tree.presentationSnapshotsView');
    if (!transferItem) {
      return;
    }
    
    const draggedSnapshots = transferItem.value as Snapshot[];
    if (!draggedSnapshots || draggedSnapshots.length === 0) {
      return;
    }
    
    // Handle drop onto a group
    if (target && 'snapshots' in target) {
      const targetGroup = target as SnapshotGroup;
      
      // Move all dragged snapshots to this group
      draggedSnapshots.forEach(snapshot => {
        // Find the snapshot in the original array
        const index = fileSnapshots[filePath].findIndex(s => s.id === snapshot.id);
        if (index !== -1) {
          // Update its group
          fileSnapshots[filePath][index].group = targetGroup.label;
        }
      });
      
      this.refresh();
      return;
    }
    
    // Handle drop onto another snapshot
    if (target && 'content' in target) {
      const targetSnapshot = target as Snapshot;
      
      // Find the target snapshot's group
      const targetSnapshotGroup = targetSnapshot.group;
      
      // Find target snapshot's index in its group
      const targetIndex = fileSnapshots[filePath].findIndex(s => s.id === targetSnapshot.id);
      if (targetIndex === -1) {
        return;
      }
      
      // Move all dragged snapshots to the target snapshot's group and position
      draggedSnapshots.forEach(snapshot => {
        // First, remove the snapshot from its current position
        const sourceIndex = fileSnapshots[filePath].findIndex(s => s.id === snapshot.id);
        if (sourceIndex !== -1) {
          const [removedSnapshot] = fileSnapshots[filePath].splice(sourceIndex, 1);
          
          // Update its group if needed
          if (targetSnapshotGroup) {
            removedSnapshot.group = targetSnapshotGroup;
          } else if (removedSnapshot.group) {
            delete removedSnapshot.group;
          }
          
          // Calculate the new insert position (accounting for removed snapshot)
          let newIndex = targetIndex;
          if (sourceIndex < targetIndex) {
            newIndex--;
          }
          
          // Insert at the new position
          fileSnapshots[filePath].splice(newIndex + 1, 0, removedSnapshot);
        }
      });
      
      this.refresh();
      return;
    }
    
    // If dropped onto an empty area (and not a group), move to ungrouped
    if (!target) {
      draggedSnapshots.forEach(snapshot => {
        // Find the snapshot in the original array
        const index = fileSnapshots[filePath].findIndex(s => s.id === snapshot.id);
        if (index !== -1 && fileSnapshots[filePath][index].group) {
          // Remove from group
          delete fileSnapshots[filePath][index].group;
        }
      });
      
      this.refresh();
    }
  }
}