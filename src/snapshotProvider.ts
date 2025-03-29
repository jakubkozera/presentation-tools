import * as vscode from 'vscode';
import { Snapshot, fileSnapshots } from './utils';

// Tree view for snapshots
export class SnapshotProvider implements vscode.TreeDataProvider<Snapshot> {
  private _onDidChangeTreeData: vscode.EventEmitter<Snapshot | undefined> = new vscode.EventEmitter<Snapshot | undefined>();
  readonly onDidChangeTreeData: vscode.Event<Snapshot | undefined> = this._onDidChangeTreeData.event;
  
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
  
  getTreeItem(element: Snapshot): vscode.TreeItem {
    const item = new vscode.TreeItem(element.description);
    item.tooltip = new Date(element.timestamp).toLocaleString();
    item.contextValue = 'snapshot';
    
    // Add a direct command to instantly load the snapshot when clicking on the tree item
    item.command = {
      command: 'presentationSnapshots.loadSnapshotInstantly',
      title: 'Load Snapshot Instantly',
      arguments: [element]
    };
    
    return item;
  }
  
  getChildren(element?: Snapshot): Thenable<Snapshot[]> {
    if (element) {
      return Promise.resolve([]);
    }
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return Promise.resolve([]);
    }
    
    const filePath = editor.document.uri.fsPath;
    const snapshots = fileSnapshots[filePath] || [];
    
    // Update context when getting children
    this.updateSnapshotAvailability();
    
    return Promise.resolve(snapshots);
  }
}