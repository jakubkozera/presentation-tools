import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { diffLines } from 'diff';

// Store snapshots in memory
interface Snapshot {
  id: string;
  content: string;
  description: string;
  timestamp: number;
}

interface FileSnapshots {
  [filePath: string]: Snapshot[];
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Presentation Snapshots extension is now active');
  
  // In-memory storage for snapshots
  const fileSnapshots: FileSnapshots = {};
  
  // Register commands
  const saveSnapshotCmd = vscode.commands.registerCommand('presentationSnapshots.saveSnapshot', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    const content = editor.document.getText();
    
    // Get description from user
    const description = await vscode.window.showInputBox({
      prompt: 'Enter a description for this snapshot',
      placeHolder: 'e.g. "Step 1: Basic structure", "Final solution"'
    });
    
    if (description === undefined) {
      return; // User cancelled
    }
    
    // Create snapshot
    const snapshot: Snapshot = {
      id: Date.now().toString(),
      content,
      description,
      timestamp: Date.now()
    };
    
    // Store snapshot
    if (!fileSnapshots[filePath]) {
      fileSnapshots[filePath] = [];
    }
    fileSnapshots[filePath].push(snapshot);
    
    vscode.window.showInformationMessage(`Snapshot "${description}" saved`);
    
    // Refresh view
    snapshotProvider.refresh();
  });
  
  // Function to type only the differences between current content and target content
  async function applyDiffWithTyping(editor: vscode.TextEditor, currentContent: string, targetContent: string, typingSpeed: number) {
    const differences = diffLines(currentContent, targetContent);
    
    // First, collect all removals to perform them first
    const removals: {startPos: vscode.Position; endPos: vscode.Position}[] = [];
    let removalOffset = 0;

    for (const part of differences) {
      if (part.removed) {
        const startPos = editor.document.positionAt(removalOffset);
        const endPos = editor.document.positionAt(removalOffset + part.value.length);
        removals.push({ startPos, endPos });
      } 
      
      if (!part.added) {
        // Move offset for unchanged or removed parts
        removalOffset += part.value.length;
      }
    }
    
    // First perform all removals
    for (const removal of removals.reverse()) { // Remove from end to start to maintain position validity
      await editor.edit(editBuilder => {
        editBuilder.delete(new vscode.Range(removal.startPos, removal.endPos));
      });
      // Small pause between deletions for visual effect
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Then process additions
    let offset = 0;
    
    for (const part of differences) {
      if (part.added) {
        // This is new text to add
        const insertPosition = editor.document.positionAt(offset);
        
        // Type each character of the added text
        for (let i = 0; i < part.value.length; i++) {
          await editor.edit(editBuilder => {
            editBuilder.insert(
              editor.document.positionAt(offset + i), 
              part.value[i]
            );
          });
          
          // Pause based on typing speed
          await new Promise(resolve => setTimeout(resolve, 1000 / typingSpeed));
        }
        
        offset += part.value.length;
      } 
      else if (!part.removed) {
        // This is unchanged text
        offset += part.value.length;
      }
    }
  }
  
  const loadSnapshotCmd = vscode.commands.registerCommand('presentationSnapshots.loadSnapshot', async (snapshot: Snapshot) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const config = vscode.workspace.getConfiguration('presentationSnapshots');
    const useTypingMode = config.get('useTypingMode', false);
    const typingSpeed = config.get('typingSpeed', 10); // Characters per second
    
    if (useTypingMode) {
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Loading snapshot: "${snapshot.description}"`,
        cancellable: true
      }, async (progress, token) => {
        token.onCancellationRequested(() => {
          vscode.window.showInformationMessage('Snapshot loading cancelled');
        });
        
        try {
          const currentContent = editor.document.getText();
          await applyDiffWithTyping(editor, currentContent, snapshot.content, typingSpeed);
          vscode.window.showInformationMessage(`Loaded snapshot: "${snapshot.description}"`);
        } catch (err) {
          vscode.window.showErrorMessage(`Error loading snapshot: ${err}`);
        }
      });
    } else {
      // Regular instant replace
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length)
      );
      edit.replace(editor.document.uri, fullRange, snapshot.content);
      await vscode.workspace.applyEdit(edit);
      
      vscode.window.showInformationMessage(`Loaded snapshot: "${snapshot.description}"`);
    }
  });
  
  const toggleTypingModeCmd = vscode.commands.registerCommand('presentationSnapshots.toggleTypingMode', async () => {
    const config = vscode.workspace.getConfiguration('presentationSnapshots');
    const currentValue = config.get('useTypingMode', false);
    
    await config.update('useTypingMode', !currentValue, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Typing mode ${!currentValue ? 'enabled' : 'disabled'}`);
  });
  
  const adjustTypingSpeedCmd = vscode.commands.registerCommand('presentationSnapshots.adjustTypingSpeed', async () => {
    const config = vscode.workspace.getConfiguration('presentationSnapshots');
    const currentSpeed = config.get('typingSpeed', 10);
    
    const result = await vscode.window.showInputBox({
      prompt: 'Enter typing speed (characters per second)',
      value: currentSpeed.toString(),
      validateInput: (value) => {
        const num = parseInt(value);
        return (isNaN(num) || num <= 0) ? 'Please enter a positive number' : null;
      }
    });
    
    if (result) {
      const speed = parseInt(result);
      await config.update('typingSpeed', speed, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Typing speed set to ${speed} characters per second`);
    }
  });
  
  const deleteSnapshotCmd = vscode.commands.registerCommand('presentationSnapshots.deleteSnapshot', (snapshot: Snapshot) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (fileSnapshots[filePath]) {
      fileSnapshots[filePath] = fileSnapshots[filePath].filter(s => s.id !== snapshot.id);
      vscode.window.showInformationMessage(`Deleted snapshot: "${snapshot.description}"`);
      snapshotProvider.refresh();
    }
  });
  
  const exportSnapshotsCmd = vscode.commands.registerCommand('presentationSnapshots.exportSnapshots', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (!fileSnapshots[filePath] || fileSnapshots[filePath].length === 0) {
      vscode.window.showErrorMessage('No snapshots to export');
      return;
    }
    
    const folderUri = await vscode.window.showSaveDialog({
      saveLabel: 'Export Snapshots',
      filters: { 'JSON': ['json'] }
    });
    
    if (folderUri) {
      try {
        fs.writeFileSync(
          folderUri.fsPath,
          JSON.stringify(fileSnapshots[filePath], null, 2)
        );
        vscode.window.showInformationMessage(`Snapshots exported to ${folderUri.fsPath}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export snapshots: ${error}`);
      }
    }
  });
  
  const importSnapshotsCmd = vscode.commands.registerCommand('presentationSnapshots.importSnapshots', async () => {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'JSON': ['json'] }
    });
    
    if (fileUri && fileUri.length > 0) {
      try {
        const content = fs.readFileSync(fileUri[0].fsPath, 'utf8');
        const importedSnapshots = JSON.parse(content) as Snapshot[];
        
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active editor found');
          return;
        }
        
        const filePath = editor.document.uri.fsPath;
        if (!fileSnapshots[filePath]) {
          fileSnapshots[filePath] = [];
        }
        
        fileSnapshots[filePath] = [...fileSnapshots[filePath], ...importedSnapshots];
        vscode.window.showInformationMessage(`Imported ${importedSnapshots.length} snapshots`);
        snapshotProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to import snapshots: ${error}`);
      }
    }
  });
  
  // Tree view for snapshots
  class SnapshotProvider implements vscode.TreeDataProvider<Snapshot> {
    private _onDidChangeTreeData: vscode.EventEmitter<Snapshot | undefined> = new vscode.EventEmitter<Snapshot | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Snapshot | undefined> = this._onDidChangeTreeData.event;
    
    refresh(): void {
      this._onDidChangeTreeData.fire(undefined);
    }
    
    getTreeItem(element: Snapshot): vscode.TreeItem {
      const item = new vscode.TreeItem(element.description);
      item.tooltip = new Date(element.timestamp).toLocaleString();
      item.command = {
        command: 'presentationSnapshots.loadSnapshot',
        title: 'Load Snapshot',
        arguments: [element]
      };
      item.contextValue = 'snapshot';
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
      return Promise.resolve(fileSnapshots[filePath] || []);
    }
  }
  
  const snapshotProvider = new SnapshotProvider();
  const treeView = vscode.window.createTreeView('presentationSnapshotsView', {
    treeDataProvider: snapshotProvider
  });
  
  // Status bar item for typing mode
  const typingModeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  typingModeStatusBarItem.command = 'presentationSnapshots.toggleTypingMode';
  
  // Update status bar based on current typing mode
  function updateStatusBar() {
    const config = vscode.workspace.getConfiguration('presentationSnapshots');
    const useTypingMode = config.get('useTypingMode', false);
    const typingSpeed = config.get('typingSpeed', 10);
    
    typingModeStatusBarItem.text = useTypingMode ? `$(keyboard) Typing: ${typingSpeed} cps` : `$(keyboard) Typing: Off`;
    typingModeStatusBarItem.tooltip = useTypingMode ? 
      `Typing mode enabled (${typingSpeed} characters per second). Click to disable.` : 
      'Typing mode disabled. Click to enable.';
    typingModeStatusBarItem.show();
  }
  
  // Listen for configuration changes
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('presentationSnapshots')) {
      updateStatusBar();
    }
  });
  
  // Initial status bar update
  updateStatusBar();
  
  // Register all commands and views
  context.subscriptions.push(
    saveSnapshotCmd,
    loadSnapshotCmd,
    toggleTypingModeCmd,
    adjustTypingSpeedCmd,
    deleteSnapshotCmd,
    exportSnapshotsCmd,
    importSnapshotsCmd,
    treeView,
    typingModeStatusBarItem
  );
}

export function deactivate() {}