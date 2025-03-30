import * as vscode from 'vscode';
import { diffChars } from 'diff';

// Store original formatting settings to restore later
interface FormattingSettings {
  formatOnType: boolean;
  formatOnPaste: boolean;
  formatOnSave: boolean;
  autoIndent: string | boolean;
  configTarget: vscode.ConfigurationTarget;
}

/**
 * Determines the appropriate configuration target to use
 * Falls back to Global if no workspace is open
 */
function getConfigurationTarget(): vscode.ConfigurationTarget {
  // Check if we have an open workspace
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return vscode.ConfigurationTarget.Workspace;
  }

  // Fall back to global settings if no workspace is open
  return vscode.ConfigurationTarget.Global;
}

/**
 * Disables auto-formatting features in the current editor temporarily
 * @returns The original formatting settings to restore later
 */
async function disableAutoFormatting(): Promise<FormattingSettings> {
  const config = vscode.workspace.getConfiguration('editor');
  const configTarget = getConfigurationTarget();

  // Store original settings
  const originalSettings: FormattingSettings = {
    formatOnType: config.get<boolean>('formatOnType', false),
    formatOnPaste: config.get<boolean>('formatOnPaste', false),
    formatOnSave: config.get<boolean>('formatOnSave', false),
    autoIndent: config.get<string | boolean>('autoIndent', 'full'),
    configTarget
  };

  // Disable all auto-formatting
  await config.update('formatOnType', false, configTarget);
  await config.update('formatOnPaste', false, configTarget);
  await config.update('formatOnSave', false, configTarget);
  await config.update('autoIndent', 'none', configTarget);

  return originalSettings;
}

/**
 * Restores the original auto-formatting settings
 * @param originalSettings The settings to restore
 */
async function restoreAutoFormatting(originalSettings: FormattingSettings): Promise<void> {
  const config = vscode.workspace.getConfiguration('editor');
  const configTarget = originalSettings.configTarget;

  // Restore original settings
  await config.update('formatOnType', originalSettings.formatOnType, configTarget);
  await config.update('formatOnPaste', originalSettings.formatOnPaste, configTarget);
  await config.update('formatOnSave', originalSettings.formatOnSave, configTarget);
  await config.update('autoIndent', originalSettings.autoIndent, configTarget);
}

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
  // Disable auto-formatting before we start typing
  let originalSettings: FormattingSettings | null = null;

  try {
    // Try to disable auto-formatting, but continue even if it fails
    try {
      originalSettings = await disableAutoFormatting();
    } catch (error) {
      console.error('Failed to disable auto-formatting:', error);
      // Continue with typing effect even if we couldn't disable formatting
    }

    const differences = diffChars(currentContent, targetContent);
    console.log('currentContent', currentContent);
    console.log('targetContent', targetContent);
    console.log('differences', differences);

    // Calculate delay in ms based on typing speed (characters per second)
    let currentCursorPosition = 0
    const delayMs = 1000 / typingSpeed;


    for (const diff of differences) {
      if (!diff.added && !diff.removed) {
        currentCursorPosition += diff.count!
      }
      if (diff.removed) {
        const textToRemove = diff.value;

        // delete  the text from the current position in a loop from the backwards

        try {
          for (let i = 0; i < textToRemove.length; i++) {
            const edit = new vscode.WorkspaceEdit();

            // Need to get current position for each character as it may have changed
            const currentInsertPos = editor.document.positionAt(currentCursorPosition - i + textToRemove.length);
            console.log('currentInsertPos', currentInsertPos);
            edit.delete(editor.document.uri, new vscode.Range(currentInsertPos, currentInsertPos.translate(0, -1)));
            await vscode.workspace.applyEdit(edit);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
        catch (e) {
          console.error('Error deleting text:', e);
        }



      }
      if (diff.added) {
        const textToAdd = diff.value;
        // Type each character with a delay for realistic effect
        let i = 0;
        while (i < textToAdd.length) {
          let char = textToAdd[i];
          
          // Handle \r\n as a single insertion to maintain proper line breaks
          if (char === '\r' && i + 1 < textToAdd.length && textToAdd[i + 1] === '\n') {
            char = '\r\n';
            i += 2; // Skip both characters
          } else {
            i += 1; // Normal character, move to next
          }

          // Create and apply edit to insert character(s)
          const edit = new vscode.WorkspaceEdit();

          // Need to get current position for each character as it may have changed
          const currentInsertPos = editor.document.positionAt(currentCursorPosition);
          edit.insert(editor.document.uri, currentInsertPos, char);
          await vscode.workspace.applyEdit(edit);

          currentCursorPosition += char.length;

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
  } finally {
    // Restore formatting settings if we were able to save them earlier
    if (originalSettings) {
      try {
        await restoreAutoFormatting(originalSettings);
      } catch (error) {
        console.error('Failed to restore auto-formatting settings:', error);
        // Continue execution even if we can't restore settings
      }
    }
  }
}