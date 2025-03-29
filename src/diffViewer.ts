import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Snapshot, showTemporaryMessage } from './utils';
import { applyDiffWithTyping } from './typingEffect';

/**
 * Show a diff view comparing current file content with a snapshot
 * @param snapshot The snapshot to compare with current content
 */
export async function showSnapshotDiff(snapshot: Snapshot): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const currentContent = editor.document.getText();
  const filePath = editor.document.uri.fsPath;
  
  // Create temp files in the OS temp directory to avoid permission issues
  const tempDir = path.join(os.tmpdir(), 'vscode-presentation-snapshots-diff');
  const fileName = path.basename(filePath);
  
  try {
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate unique filenames to avoid conflicts
    const timestamp = Date.now();
    const currentTempFile = path.join(tempDir, `current-${timestamp}-${fileName}`);
    const snapshotTempFile = path.join(tempDir, `snapshot-${timestamp}-${fileName}`);
    
    // Write the contents to the temp files
    fs.writeFileSync(currentTempFile, currentContent, 'utf8');
    fs.writeFileSync(snapshotTempFile, snapshot.content, 'utf8');
    
    // Ensure the files exist before opening the diff view
    if (!fs.existsSync(currentTempFile) || !fs.existsSync(snapshotTempFile)) {
      throw new Error('Failed to create temporary files for diff view');
    }
    
    // Open diff editor with the temp files - swapped order to put current on left
    const currentUri = vscode.Uri.file(currentTempFile);
    const snapshotUri = vscode.Uri.file(snapshotTempFile);
    
    await vscode.commands.executeCommand('vscode.diff',
      currentUri,  // Left side (current)
      snapshotUri, // Right side (snapshot)
      `Current ↔ Snapshot: ${snapshot.description}`
    );

    // Show option to load this snapshot after viewing diff
    const loadOption = 'Load this snapshot';
    const loadWithTypingOption = 'Load with typing effect';
    
    // Get the typing mode configuration
    const config = vscode.workspace.getConfiguration('presentationSnapshots');
    const useTypingMode = config.get('useTypingMode', false);
    const typingSpeed = config.get('typingSpeed', 10); // Characters per second
    
    // Show appropriate options based on the current typing mode setting
    let options = [loadOption];
    if (useTypingMode) {
      options = [loadWithTypingOption, loadOption];
    } else {
      options = [loadOption, loadWithTypingOption];
    }
    
    const result = await vscode.window.showInformationMessage(
      `You're viewing the differences for snapshot: "${snapshot.description}"`,
      ...options
    );
    
    // If user chooses to load the snapshot
    if (result === loadOption || result === loadWithTypingOption) {
      // Find and close diff editor tab before loading
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      
      // Clean up temp files immediately
      try {
        if (fs.existsSync(currentTempFile)) { fs.unlinkSync(currentTempFile); }
        if (fs.existsSync(snapshotTempFile)) { fs.unlinkSync(snapshotTempFile); }
      } catch (error) {
        console.error('Error cleaning up temp diff files:', error);
      }
      
      // Apply the snapshot with or without typing effect based on user's choice
      if (result === loadWithTypingOption) {
        // Apply with typing effect
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Loading snapshot: "${snapshot.description}" with typing effect`,
          cancellable: true
        }, async (progress, token) => {
          token.onCancellationRequested(() => {
            vscode.window.showInformationMessage('Snapshot loading cancelled');
          });
          
          try {
            const currentContent = editor.document.getText();
            await applyDiffWithTyping(editor, currentContent, snapshot.content, typingSpeed);
            
            // Use temporary message for loading notification
            showTemporaryMessage(`Loaded snapshot: "${snapshot.description}" with typing effect`);
          } catch (err) {
            vscode.window.showErrorMessage(`Error loading snapshot: ${err}`);
          }
        });
      } else {
        // Apply without typing effect (instant load)
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        edit.replace(editor.document.uri, fullRange, snapshot.content);
        await vscode.workspace.applyEdit(edit);
        
        // Use temporary message for loading notification
        showTemporaryMessage(`Loaded snapshot: "${snapshot.description}"`);
      }
    } else {
      // Clean up temp files after a delay if user doesn't load the snapshot
      setTimeout(() => {
        try {
          if (fs.existsSync(currentTempFile)) { fs.unlinkSync(currentTempFile); }
          if (fs.existsSync(snapshotTempFile)) { fs.unlinkSync(snapshotTempFile); }
          
          // Try to remove temp directory if it's empty
          try {
            const files = fs.readdirSync(tempDir);
            if (files.length === 0) {
              fs.rmdirSync(tempDir);
            }
          } catch (e) {
            console.log('Could not remove temp directory:', e);
          }
        } catch (error) {
          console.error('Error cleaning up temp diff files:', error);
        }
      }, 30000); // Clean up after 30 seconds to give more time
    }
    
  } catch (error) {
    vscode.window.showErrorMessage(`Error showing diff: ${error}`);
  }
}

export function registerDiffViewerCommands(context: vscode.ExtensionContext): void {
  // Register the showSnapshotDiff command
  const showSnapshotDiffCmd = vscode.commands.registerCommand(
    'presentationSnapshots.showSnapshotDiff', 
    showSnapshotDiff
  );
  
  context.subscriptions.push(showSnapshotDiffCmd);
}