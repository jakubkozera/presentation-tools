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
export class SnapshotProvider implements vscode.TreeDataProvider<TreeItem> {
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
}