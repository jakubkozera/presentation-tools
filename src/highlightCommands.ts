import * as vscode from 'vscode';
import * as fs from 'fs';
import { Highlight, fileHighlights, clearHighlights, applyHighlight, createHighlightFromSelection, clearSingleHighlightFromEditor, isHighlightApplied, lastAppliedHighlight, setLastAppliedHighlight } from './highlightUtils';
import { showTemporaryMessage } from './utils';
import { HighlightGroup, HighlightProvider } from './highlightProvider';

export function registerHighlightCommands(
  context: vscode.ExtensionContext, 
  highlightProvider: HighlightProvider
): void {
  // Save highlight command
  const saveHighlightCmd = vscode.commands.registerCommand('presentationTools.saveHighlight', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    // Check if there's a text selection
    if (editor.selections.length === 0 || editor.selections.every(s => s.isEmpty)) {
      vscode.window.showErrorMessage('Please select text to highlight');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    
    // Get name from user
    const name = await vscode.window.showInputBox({
      prompt: 'Enter a name for this highlight',
      placeHolder: 'e.g. "Important method", "Key algorithm"'
    });
    
    if (name === undefined) {
      return; // User cancelled
    }

    // Get existing groups to offer as quick picks
    const existingGroups = new Set<string>();
    
    // Collect groups from all files, not just the current file
    for (const path in fileHighlights) {
      fileHighlights[path].forEach(highlight => {
        if (highlight.group) {
          existingGroups.add(highlight.group);
        }
      });
    }

    // Convert Set to array of quick pick items
    const groupQuickPicks = Array.from(existingGroups).map(group => ({
      label: group,
      description: 'Existing group'
    }));

    // Add options to create a new group or leave ungrouped
    const quickPickOptions = [
      { label: '$(plus) Create New Group', description: 'Add a new group name' },
      { label: '$(circle-slash) No Group', description: 'Leave highlight ungrouped' },
      ...groupQuickPicks
    ];

    // Show quick pick for groups
    const selectedOption = await vscode.window.showQuickPick(quickPickOptions, {
      placeHolder: 'Select a group for this highlight (optional)'
    });

    let group: string | undefined;
    
    if (selectedOption) {
      if (selectedOption.label === '$(plus) Create New Group') {
        // Ask for new group name
        group = await vscode.window.showInputBox({
          prompt: 'Enter a name for the new group',
          placeHolder: 'e.g. "UI Components", "Core Functions"'
        });
      } else if (selectedOption.label === '$(circle-slash) No Group') {
        group = undefined;
      } else {
        group = selectedOption.label;
      }
    }
    
    // Show color options
    const colorOptions = [
      { label: 'Yellow (Default)', value: 'rgba(255, 255, 0, 0.3)' },
      { label: 'Green', value: 'rgba(0, 255, 0, 0.3)' },
      { label: 'Blue', value: 'rgba(0, 191, 255, 0.3)' },
      { label: 'Red', value: 'rgba(255, 0, 0, 0.3)' },
      { label: 'Purple', value: 'rgba(180, 0, 255, 0.3)' },
      { label: 'Orange', value: 'rgba(255, 165, 0, 0.3)' }
    ];

    const colorPick = await vscode.window.showQuickPick(
      colorOptions.map(option => ({ label: option.label, description: option.value })),
      { placeHolder: 'Select highlight color (optional)' }
    );

    const color = colorPick ? colorOptions.find(c => c.label === colorPick.label)?.value : undefined;

    // Create highlight from selection
    const highlight = createHighlightFromSelection(name, group, color);
    
    if (!highlight) {
      vscode.window.showErrorMessage('Failed to create highlight from selection');
      return;
    }
    
    // Store highlight
    if (!fileHighlights[filePath]) {
      fileHighlights[filePath] = [];
    }
    fileHighlights[filePath].push(highlight);
    
    vscode.window.showInformationMessage(`Highlight "${name}" saved${group ? ` in group "${group}"` : ''}`);
    
    // Refresh view
    highlightProvider.refresh();
  });
  
  // Apply highlight command
  const applyHighlightCmd = vscode.commands.registerCommand('presentationTools.applyHighlight', (highlight: Highlight) => {
    applyHighlight(highlight).then(() => {
      // Refresh the tree view to update UI state after applying highlight
      highlightProvider.refresh();
    });
  });
  
  // Clear highlights command
  const clearHighlightsCmd = vscode.commands.registerCommand('presentationTools.clearHighlights', () => {
    clearHighlights();
    // Refresh the tree view to update UI state
    highlightProvider.refresh();
  });
  
  // Clear single highlight command
  const clearSingleHighlightCmd = vscode.commands.registerCommand('presentationTools.clearSingleHighlight', (highlight: Highlight) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    // Make sure we're in the right file
    if (editor.document.uri.fsPath !== highlight.filePath) {
      vscode.workspace.openTextDocument(highlight.filePath).then(document => {
        vscode.window.showTextDocument(document).then(editor => {
          clearSingleHighlightFromEditor(highlight, editor);
          // Refresh the tree view to update the UI state
          highlightProvider.refresh();
        });
      });
    } else {
      clearSingleHighlightFromEditor(highlight, editor);
      // Refresh the tree view to update the UI state
      highlightProvider.refresh();
    }
  });
  
  // Delete highlight command
  const deleteHighlightCmd = vscode.commands.registerCommand('presentationTools.deleteHighlight', (highlight: Highlight) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const filePath = editor.document.uri.fsPath;
    if (fileHighlights[filePath]) {
      fileHighlights[filePath] = fileHighlights[filePath].filter(h => h.id !== highlight.id);
      
      // Use temporary message for deletion notification
      showTemporaryMessage(`Deleted highlight: "${highlight.name}"`);
      highlightProvider.refresh();
    }
  });

  // Delete all highlights command
  const deleteAllHighlightsCmd = vscode.commands.registerCommand('presentationTools.deleteAllHighlights', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    // Count total highlights across all files
    let totalHighlightCount = 0;
    const totalFileCount = Object.keys(fileHighlights).length;
    
    for (const filePath in fileHighlights) {
      totalHighlightCount += fileHighlights[filePath].length;
    }
    
    if (totalHighlightCount === 0) {
      vscode.window.showInformationMessage('No highlights to delete');
      return;
    }
    
    // Show confirmation dialog with the number of highlights that will be deleted
    const confirmMessage = `Are you sure you want to delete all ${totalHighlightCount} highlights from all ${totalFileCount} files? This action cannot be undone.`;
    const confirmOptions = ['Delete All Highlights', 'Cancel'];
    
    const result = await vscode.window.showWarningMessage(confirmMessage, ...confirmOptions);
    
    if (result === confirmOptions[0]) {
      // User confirmed deletion
      // Clear all highlights from all files
      for (const filePath in fileHighlights) {
        fileHighlights[filePath] = [];
      }
      
      showTemporaryMessage(`Deleted all ${totalHighlightCount} highlights from ${totalFileCount} files`);
      highlightProvider.refresh();
      
      // Also clear active highlights from current editor
      clearHighlights(editor);
    }
  });

  // Export highlights command
  const exportHighlightsCmd = vscode.commands.registerCommand('presentationTools.exportHighlights', async () => {
    // Check if there are any highlights to export
    if (Object.keys(fileHighlights).length === 0) {
      vscode.window.showErrorMessage('No highlights to export');
      return;
    }
    
    const folderUri = await vscode.window.showSaveDialog({
      saveLabel: 'Export Highlights',
      filters: { 'JSON': ['json'] }
    });
    
    if (folderUri) {
      try {
        // Export all highlights from all files
        fs.writeFileSync(
          folderUri.fsPath,
          JSON.stringify(fileHighlights, null, 2)
        );
        
        // Count total highlights for the message
        let totalHighlights = 0;
        for (const filePath in fileHighlights) {
          totalHighlights += fileHighlights[filePath].length;
        }
        
        vscode.window.showInformationMessage(`Exported ${totalHighlights} highlights from ${Object.keys(fileHighlights).length} files to ${folderUri.fsPath}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export highlights: ${error}`);
      }
    }
  });
  
  // Import highlights command
  const importHighlightsCmd = vscode.commands.registerCommand('presentationTools.importHighlights', async () => {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'JSON': ['json'] }
    });
    
    if (fileUri && fileUri.length > 0) {
      try {
        const content = fs.readFileSync(fileUri[0].fsPath, 'utf8');
        const importedData = JSON.parse(content);
        
        // Check if the imported data is in the expected format (object with file paths as keys)
        if (typeof importedData !== 'object' || Array.isArray(importedData)) {
          vscode.window.showErrorMessage('Invalid highlights file format');
          return;
        }
        
        // Count how many highlights we're importing
        let totalImportedHighlights = 0;
        let totalFiles = 0;
        
        // Merge the imported highlights with existing ones
        for (const filePath in importedData) {
          if (Array.isArray(importedData[filePath])) {
            if (!fileHighlights[filePath]) {
              fileHighlights[filePath] = [];
            }
            
            // Add only highlights that don't already exist (based on id)
            const existingIds = new Set(fileHighlights[filePath].map(h => h.id));
            const newHighlights = importedData[filePath].filter(h => !existingIds.has(h.id));
            
            fileHighlights[filePath].push(...newHighlights);
            totalImportedHighlights += newHighlights.length;
            totalFiles++;
          }
        }
        
        if (totalImportedHighlights > 0) {
          vscode.window.showInformationMessage(`Imported ${totalImportedHighlights} highlights from ${totalFiles} files`);
        } else {
          vscode.window.showInformationMessage('No new highlights were imported');
        }
        
        highlightProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to import highlights: ${error}`);
      }
    }
  });

  // Change highlight group command
  const changeHighlightGroupCmd = vscode.commands.registerCommand('presentationTools.changeHighlightGroup', async (highlight: Highlight) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!fileHighlights[filePath]) {
      return;
    }

    // Get existing groups to offer as quick picks
    const existingGroups = new Set<string>();
    
    // Collect groups from all files, not just the current file
    for (const path in fileHighlights) {
      fileHighlights[path].forEach(h => {
        if (h.group) {
          existingGroups.add(h.group);
        }
      });
    }

    // Convert Set to array of quick pick items
    const groupQuickPicks = Array.from(existingGroups).map(group => ({
      label: group,
      description: highlight.group === group ? '(Current)' : 'Existing group'
    }));

    // Add options to create a new group or leave ungrouped
    const quickPickOptions = [
      { label: '$(plus) Create New Group', description: 'Add a new group name' },
      { label: '$(circle-slash) No Group', description: 'Leave highlight ungrouped' },
      ...groupQuickPicks
    ];

    // Show quick pick for groups
    const selectedOption = await vscode.window.showQuickPick(quickPickOptions, {
      placeHolder: `Change group for highlight "${highlight.name}"`
    });

    if (!selectedOption) {
      return; // User cancelled
    }

    let newGroup: string | undefined;
    
    if (selectedOption.label === '$(plus) Create New Group') {
      // Ask for new group name
      newGroup = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new group',
        placeHolder: 'e.g. "UI Components", "Core Functions"'
      });
      
      if (newGroup === undefined) {
        return; // User cancelled
      }
    } else if (selectedOption.label === '$(circle-slash) No Group') {
      newGroup = undefined;
    } else {
      newGroup = selectedOption.label;
    }

    // Find highlight in array and update its group
    const highlightIndex = fileHighlights[filePath].findIndex(h => h.id === highlight.id);
    if (highlightIndex !== -1) {
      if (newGroup) {
        fileHighlights[filePath][highlightIndex].group = newGroup;
        showTemporaryMessage(`Moved "${highlight.name}" to group "${newGroup}"`);
      } else {
        delete fileHighlights[filePath][highlightIndex].group;
        showTemporaryMessage(`Removed "${highlight.name}" from its group`);
      }
      
      highlightProvider.refresh();
    }
  });

  // Delete group command
  const deleteGroupCmd = vscode.commands.registerCommand('presentationTools.deleteHighlightGroup', async (group: HighlightGroup) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!fileHighlights[filePath]) {
      return;
    }

    // Show confirmation dialog
    const confirmMessage = `Delete group "${group.label}"? This will delete all ${group.highlights.length} highlights in this group.`;
    const confirmOptions = ['Delete Group', 'Keep Highlights but Remove Grouping', 'Cancel'];
    
    const result = await vscode.window.showWarningMessage(confirmMessage, ...confirmOptions);
    
    if (result === confirmOptions[0]) {
      // Delete highlights in group
      const idsToDelete = new Set(group.highlights.map(h => h.id));
      fileHighlights[filePath] = fileHighlights[filePath].filter(h => !idsToDelete.has(h.id));
      
      showTemporaryMessage(`Deleted group "${group.label}" and all its highlights`);
      highlightProvider.refresh();
    } else if (result === confirmOptions[1]) {
      // Keep highlights but remove them from the group
      fileHighlights[filePath].forEach(h => {
        if (h.group === group.label) {
          delete h.group;
        }
      });
      
      showTemporaryMessage(`Removed grouping for highlights in "${group.label}"`);
      highlightProvider.refresh();
    }
  });
  
  // Apply group highlights command
  const applyGroupHighlightsCmd = vscode.commands.registerCommand('presentationTools.applyGroupHighlights', async (group: HighlightGroup) => {
    if (!group.highlights || group.highlights.length === 0) {
      vscode.window.showErrorMessage(`No highlights found in group "${group.label}"`);
      return;
    }
    
    // Apply all highlights in the group without clearing other highlights
    for (const highlight of group.highlights) {
      await applyHighlight(highlight);
    }
    
    showTemporaryMessage(`Applied all highlights from group "${group.label}"`);
    
    // Refresh the tree view to update UI state
    highlightProvider.refresh();
  });

  // Clear group highlights command
  const clearGroupHighlightsCmd = vscode.commands.registerCommand('presentationTools.clearGroupHighlights', async (group: HighlightGroup) => {
    if (!group.highlights || group.highlights.length === 0) {
      vscode.window.showErrorMessage(`No highlights found in group "${group.label}"`);
      return;
    }
    
    // Get a list of unique file paths in this group
    const filePaths = new Set<string>();
    group.highlights.forEach(h => filePaths.add(h.filePath));
    
    // Get list of applied highlight IDs from this group
    const highlightIds = new Set(group.highlights.map(h => h.id));
    
    // Clear applied highlights from each file
    for (const filePath of filePaths) {
      try {
        // Open the file if it's not already open
        const document = await vscode.workspace.openTextDocument(filePath);
        const editor = await vscode.window.showTextDocument(document);
        
        // Only clear highlights that belong to this group
        const appliedSet = new Set<string>();
        fileHighlights[filePath]?.forEach(h => {
          // If highlight is in this file but not in this group, and it's currently applied,
          // we want to keep it applied after clearing the group highlights
          if (!highlightIds.has(h.id) && isHighlightApplied(h)) {
            appliedSet.add(h.id);
          }
        });
        
        // Clear all decorations
        clearHighlights(editor);
        
        // Re-apply highlights that should remain visible
        for (const h of fileHighlights[filePath] || []) {
          if (appliedSet.has(h.id)) {
            await applyHighlight(h, editor);
          }
        }
      } catch (error) {
        vscode.window.showWarningMessage(`Could not clear highlights in file ${filePath}: ${error}`);
      }
    }
    
    showTemporaryMessage(`Cleared all highlights from group "${group.label}"`);
    
    // Refresh the tree view to update UI state
    highlightProvider.refresh();
  });

  /**
   * Get all highlights from all files in a single sorted list
   * @returns Array of all highlights sorted by timestamp
   */
  function getAllHighlightsSorted(): Highlight[] {
    // Collect all highlights from all files
    const allHighlights: Highlight[] = [];
    
    for (const filePath in fileHighlights) {
      allHighlights.push(...fileHighlights[filePath]);
    }
    
    // Sort highlights by timestamp (oldest first)
    return allHighlights.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Load next highlight command
  const loadNextHighlightCmd = vscode.commands.registerCommand('presentationTools.loadNextHighlight', async () => {
    // Get all highlights from all files
    const allHighlights = getAllHighlightsSorted();
    
    if (allHighlights.length === 0) {
      vscode.window.showInformationMessage('No highlights available');
      return;
    }
    
    // Find the index of the last applied highlight
    let nextIndex = 0;
    
    if (lastAppliedHighlight) {
      const currentIndex = allHighlights.findIndex(h => 
        h.id === lastAppliedHighlight!.highlightId && 
        h.filePath === lastAppliedHighlight!.filePath
      );
      
      if (currentIndex !== -1) {
        // Move to the next highlight (wrap around if at the end)
        nextIndex = (currentIndex + 1) % allHighlights.length;
      }
    }
    
    // Apply the next highlight
    const nextHighlight = allHighlights[nextIndex];
    await applyHighlight(nextHighlight);
    
    // Refresh the tree view to update UI state
    highlightProvider.refresh();
  });

  // Register all commands
  context.subscriptions.push(
    saveHighlightCmd,
    applyHighlightCmd,
    clearHighlightsCmd,
    clearSingleHighlightCmd,
    deleteHighlightCmd,
    deleteAllHighlightsCmd,
    exportHighlightsCmd,
    importHighlightsCmd,
    changeHighlightGroupCmd,
    deleteGroupCmd,
    applyGroupHighlightsCmd,
    clearGroupHighlightsCmd,
    loadNextHighlightCmd
  );
}