import * as vscode from 'vscode';
import { Highlight, fileHighlights, groupHighlights } from './highlightUtils';

// Types to represent the tree structure
export type HighlightTreeItem = HighlightGroup | Highlight;

// Class to represent a group of highlights in the tree view
export class HighlightGroup {
  constructor(
    public readonly label: string,
    public readonly highlights: Highlight[]
  ) {}
}

// Tree view for highlights
export class HighlightProvider implements vscode.TreeDataProvider<HighlightTreeItem>, vscode.TreeDragAndDropController<HighlightTreeItem> {
  // Drag and drop capabilities
  readonly dropMimeTypes = ['application/vnd.code.tree.presentationToolsHighlightsView'];
  readonly dragMimeTypes = ['application/vnd.code.tree.presentationToolsHighlightsView'];
  
  // Event emitter for tree data changes
  private _onDidChangeTreeData: vscode.EventEmitter<HighlightTreeItem | undefined> = new vscode.EventEmitter<HighlightTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<HighlightTreeItem | undefined> = this._onDidChangeTreeData.event;
  
  constructor() {
    // Initialize by checking if there are highlights
    this.updateHighlightAvailability();
  }
  
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
    // Update the context variable when refreshed
    this.updateHighlightAvailability();
  }
  
  private updateHighlightAvailability(): void {
    // Check if there are any highlights in any file
    let hasHighlights = Object.values(fileHighlights).some(highlights => highlights.length > 0);
    
    // Update the context variable that the when clause uses
    vscode.commands.executeCommand('setContext', 'presentationToolsHasHighlights', hasHighlights);
  }
  
  getTreeItem(element: HighlightTreeItem): vscode.TreeItem {
    // If element is a Highlight
    if ('ranges' in element) {
      const highlight = element as Highlight;
      const item = new vscode.TreeItem(highlight.name);
      
      // Add file info to the description if the highlight is from a different file than the active editor
      const activeEditor = vscode.window.activeTextEditor;
      const isCurrentFile = activeEditor && activeEditor.document.uri.fsPath === highlight.filePath;
      
      // Show file name in the description when not in the current file
      item.description = isCurrentFile ? 
        `${highlight.ranges.length} region(s)` : 
        `${highlight.fileName} - ${highlight.ranges.length} region(s)`;
      
      item.tooltip = new Date(highlight.timestamp).toLocaleString() + 
        `\nFile: ${highlight.fileName}\nPath: ${highlight.filePath}`;
      item.contextValue = 'highlight';
      
      // Add a direct command to instantly apply the highlight when clicking on the tree item
      item.command = {
        command: 'presentationTools.applyHighlight',
        title: 'Apply Highlight',
        arguments: [highlight]
      };
      
      return item;
    } 
    // If element is a HighlightGroup
    else {
      const group = element as HighlightGroup;
      const item = new vscode.TreeItem(
        group.label,
        group.highlights.length > 0 
          ? vscode.TreeItemCollapsibleState.Expanded 
          : vscode.TreeItemCollapsibleState.None
      );
      
      item.contextValue = 'highlightGroup';
      item.tooltip = `${group.highlights.length} highlight(s)`;
      item.iconPath = new vscode.ThemeIcon('folder');
      
      return item;
    }
  }
  
  getChildren(element?: HighlightTreeItem): Thenable<HighlightTreeItem[]> {
    // If getting children of a group, return its highlights
    if (element && 'highlights' in element) {
      return Promise.resolve(element.highlights);
    }
    
    // If getting root elements, return all groups from all files
    // Collect all highlights from all files
    const allHighlights: Highlight[] = [];
    
    Object.values(fileHighlights).forEach(fileHighlights => {
      allHighlights.push(...fileHighlights);
    });
    
    // Update context when getting children
    this.updateHighlightAvailability();
    
    if (allHighlights.length === 0) {
      return Promise.resolve([]);
    }
    
    // Group highlights
    const groupedHighlights = groupHighlights(allHighlights);
    
    // Convert to array of HighlightGroup objects
    const groups: HighlightGroup[] = [];
    groupedHighlights.forEach((highlights, groupName) => {
      groups.push(new HighlightGroup(groupName, highlights));
    });
    
    return Promise.resolve(groups);
  }

  // Get parent of an item in the tree
  getParent(element: HighlightTreeItem): vscode.ProviderResult<HighlightTreeItem> {
    // If element is a Highlight, find its parent group
    if ('ranges' in element) {
      const highlight = element as Highlight;
      
      // Find which group this highlight belongs to by searching all files
      let allHighlights: Highlight[] = [];
      Object.values(fileHighlights).forEach(highlights => {
        allHighlights = allHighlights.concat(highlights);
      });
      
      // Find the group this highlight belongs to
      const groupedHighlights = groupHighlights(allHighlights);
      for (const [groupName, highlights] of groupedHighlights.entries()) {
        if (highlights.some(h => h.id === highlight.id)) {
          return new HighlightGroup(groupName, highlights);
        }
      }
    }
    
    // If element is a group or we couldn't find a parent, return null
    return null;
  }
  
  // Handle drag start
  handleDrag(source: readonly HighlightTreeItem[], dataTransfer: vscode.DataTransfer): void {
    // Only support dragging highlights, not groups
    const highlights = source.filter(item => 'ranges' in item) as Highlight[];
    if (highlights.length === 0) {
      return;
    }
    
    // Set the data for the drag operation
    dataTransfer.set('application/vnd.code.tree.presentationToolsHighlightsView', 
      new vscode.DataTransferItem(highlights));
  }
  
  // Handle drop
  async handleDrop(target: HighlightTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    // Get the dragged highlights
    const transferItem = dataTransfer.get('application/vnd.code.tree.presentationToolsHighlightsView');
    if (!transferItem) {
      return;
    }
    
    const draggedHighlights = transferItem.value as Highlight[];
    if (!draggedHighlights || draggedHighlights.length === 0) {
      return;
    }
    
    // Handle drop onto a group
    if (target && 'highlights' in target) {
      const targetGroup = target as HighlightGroup;
      
      // Move all dragged highlights to this group
      for (const highlight of draggedHighlights) {
        // Find the highlight in its original file array
        const filePath = highlight.filePath;
        if (!fileHighlights[filePath]) {
          continue;
        }
        
        const index = fileHighlights[filePath].findIndex(h => h.id === highlight.id);
        if (index !== -1) {
          // Update its group
          fileHighlights[filePath][index].group = targetGroup.label;
        }
      }
      
      this.refresh();
      return;
    }
    
    // Handle drop onto another highlight
    if (target && 'ranges' in target) {
      const targetHighlight = target as Highlight;
      
      // Find the target highlight's group
      const targetHighlightGroup = targetHighlight.group;
      
      // Move all dragged highlights to the target highlight's group
      for (const highlight of draggedHighlights) {
        // Find the highlight in its original file
        const filePath = highlight.filePath;
        if (!fileHighlights[filePath]) {
          continue;
        }
        
        const index = fileHighlights[filePath].findIndex(h => h.id === highlight.id);
        if (index !== -1) {
          // Update its group
          if (targetHighlightGroup) {
            fileHighlights[filePath][index].group = targetHighlightGroup;
          } else if (fileHighlights[filePath][index].group) {
            delete fileHighlights[filePath][index].group;
          }
        }
      }
      
      this.refresh();
      return;
    }
    
    // If dropped onto an empty area (and not a group), move to ungrouped
    if (!target) {
      for (const highlight of draggedHighlights) {
        // Find the highlight in its original file
        const filePath = highlight.filePath;
        if (!fileHighlights[filePath]) {
          continue;
        }
        
        const index = fileHighlights[filePath].findIndex(h => h.id === highlight.id);
        if (index !== -1 && fileHighlights[filePath][index].group) {
          // Remove from group
          delete fileHighlights[filePath][index].group;
        }
      }
      
      this.refresh();
    }
  }
}