import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { diffChars, diffLines } from 'diff';

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
    const differences = diffChars(currentContent, targetContent);
    console.log('currentContent', currentContent);
    console.log('targetContent', targetContent);
    console.log('differences', differences);
    
    // Calculate delay in ms based on typing speed (characters per second)
    const delayMs = 1000 / typingSpeed;
    
    // Track position changes as we make edits
    let currentOffset = 0;
    
    // Process each change sequentially
    for (const diff of differences) {
      // Skip if the content is unchanged
      if (diff.added === undefined && diff.removed === undefined) {
        currentOffset += diff.value.length;
        continue;
      }
      
      // Handle removals first (delete characters)
      if (diff.removed) {
        // Remove characters one by one, from last to first
        for (let i = diff.value.length - 1; i >= 0; i--) {
          const startPos = editor.document.positionAt(currentOffset + i);
          const endPos = editor.document.positionAt(currentOffset + i + 1);
          const deleteRange = new vscode.Range(startPos, endPos);
          
          // Create and apply edit to remove a single character
          const edit = new vscode.WorkspaceEdit();
          edit.delete(editor.document.uri, deleteRange);
          await vscode.workspace.applyEdit(edit);
          
          // Add delay between character deletions for typing effect
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        // No need to update offset as we've deleted all characters
      }
      // Handle additions (typing new characters)
      else if (diff.added) {
        // Type each character with a delay for realistic effect
        for (let i = 0; i < diff.value.length; i++) {
          // Get current position for each character (it may change after each edit)
          const insertPosition = editor.document.positionAt(currentOffset);
          const char = diff.value[i];
          
          // Create and apply edit to insert single character
          const edit = new vscode.WorkspaceEdit();
          edit.insert(editor.document.uri, insertPosition, char);
          await vscode.workspace.applyEdit(edit);
          
          // Update offset after adding a character
          currentOffset += 1;
          
          // Add delay between characters for typing effect
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    // Ensure editor shows the final position
    if (editor.document.lineCount > 0) {
      editor.revealRange(
        new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        )
      );
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
          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
          );
          edit.replace(editor.document.uri, fullRange, snapshot.content);
          await vscode.workspace.applyEdit(edit);
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