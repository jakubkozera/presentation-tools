import * as vscode from 'vscode';
import { diffChars } from 'diff';

/**
 * Applies changes between current content and target content with a typewriter effect
 * @param editor The text editor to apply changes to
 * @param currentContent Current content of the document
 * @param targetContent Target content to transform to
 * @param typingSpeed Characters per second for the typing effect
 */
export async function applyDiffWithTyping(
  editor: vscode.TextEditor, 
  currentContent: string, 
  targetContent: string, 
  typingSpeed: number
): Promise<void> {
  const differences = diffChars(currentContent, targetContent);
  console.log('currentContent', currentContent);
  console.log('targetContent', targetContent);
  console.log('differences', differences);
  
  // Calculate delay in ms based on typing speed (characters per second)
  const delayMs = 1000 / typingSpeed;
  
  // STAGE 1: Handle all removals first
  // Process each change sequentially, but only handle removals
  for (const diff of differences) {
    // Skip if the content is unchanged
    if (diff.added === undefined && diff.removed === undefined) {
      continue;
    }
    
    // Handle removals first (delete characters)
    if (diff.removed) {
      const searchText = diff.value;
      
      // Find the position of this text in the current document
      const currentDocText = editor.document.getText();
      const removePos = currentDocText.indexOf(searchText);
      
      if (removePos !== -1) {
        // Remove the text
        const startPos = editor.document.positionAt(removePos);
        const endPos = editor.document.positionAt(removePos + searchText.length);
        const deleteRange = new vscode.Range(startPos, endPos);
        
        // Create and apply edit to remove the text
        const edit = new vscode.WorkspaceEdit();
        edit.delete(editor.document.uri, deleteRange);
        await vscode.workspace.applyEdit(edit);
        
        // Add delay for typing effect
        await new Promise(resolve => setTimeout(resolve, delayMs * 2));
      }
    } else if (diff.added) {
      // Skip additions for now, we'll handle them in stage 2
      continue;
    }
  }
  
  // STAGE 2: Recalculate differences and handle additions
  // Get the current content after removals
  const updatedCurrentContent = editor.document.getText();
  const secondDifferences = diffChars(updatedCurrentContent, targetContent);
  console.log('updatedCurrentContent after removals', updatedCurrentContent);
  console.log('second differences', secondDifferences);
  
  // Now process each change for additions only
  let lastUnchangedText = "";
  let currentPosition = 0;
  
  for (const diff of secondDifferences) {
    // Handle unchanged text - use this to find position
    if (diff.added === undefined && diff.removed === undefined) {
      lastUnchangedText = diff.value;
      continue;
    }
    
    // Skip removals in this pass (they should have been handled)
    if (diff.removed) {
      continue;
    }
    
    // Handle additions (typing new characters)
    if (diff.added) {
      const textToAdd = diff.value;
      
      // Find where to insert the text
      const currentDocText = editor.document.getText();
      
      // If we have preceding unchanged text, find its position
      let insertPosition: vscode.Position;
      if (lastUnchangedText) {
        // Find the position after the last unchanged text
        const textPos = currentDocText.indexOf(lastUnchangedText, currentPosition);
        if (textPos !== -1) {
          currentPosition = textPos + lastUnchangedText.length;
          insertPosition = editor.document.positionAt(currentPosition);
        } else {
          // Fallback to current position if text not found
          insertPosition = editor.document.positionAt(currentPosition);
        }
      } else {
        // If no preceding unchanged text, use the beginning of document
        insertPosition = editor.document.positionAt(currentPosition);
      }
      
      // Type each character with a delay for realistic effect
      for (let i = 0; i < textToAdd.length; i++) {
        const char = textToAdd[i];
        
        // Create and apply edit to insert single character
        const edit = new vscode.WorkspaceEdit();
        
        // Need to get current position for each character as it may have changed
        const currentDocText = editor.document.getText();
        let currentInsertPos: vscode.Position;
        
        if (i === 0) {
          currentInsertPos = insertPosition;
        } else {
          // For subsequent characters, add after the previous ones
          const prevTextPos = currentDocText.indexOf(textToAdd.substring(0, i), currentPosition);
          if (prevTextPos !== -1) {
            currentInsertPos = editor.document.positionAt(prevTextPos + i);
          } else {
            currentInsertPos = insertPosition;
          }
        }
        
        edit.insert(editor.document.uri, currentInsertPos, char);
        await vscode.workspace.applyEdit(edit);
        
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