# Presentation Snapshots - VS Code Extension

## Overview
Presentation Snapshots is a VS Code extension that enhances your coding demonstrations and presentations by allowing you to create pre-defined snapshots of your code that can be recalled with a typewriter-like animation effect.

## Features
- **Code Snapshots**: Save important states of your code to recall during presentations
- **Typewriter Animation**: Simulate live coding with realistic typing animations
- **Customizable Speed**: Adjust the typing speed to match your presentation pace
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Installation
You can install this extension in one of two ways:

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X or Cmd+Shift+X)
3. Search for "Presentation Snapshots"
4. Click Install

### Manual Installation (VSIX)
1. Download the `.vsix` file from the releases page
2. Open VS Code
3. Go to Extensions view
4. Click the "..." menu in the top-right corner
5. Select "Install from VSIX..."
6. Choose the downloaded `.vsix` file

## How to Use

### Creating Snapshots
1. Prepare your code in the editor
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Type "Presentation Snapshots: Save Snapshot"
4. Enter a name for your snapshot

### Recalling Snapshots
1. Open the file you want to modify
2. Open the Command Palette
3. Type "Presentation Snapshots: Load Snapshot"
4. Select a previously saved snapshot
5. Watch as your code transforms with a realistic typing effect

### Adjusting Settings
You can customize the extension behavior:
1. Go to File > Preferences > Settings
2. Search for "Presentation Snapshots"
3. Adjust the typing speed and other available options

## Requirements
- VS Code 1.60.0 or higher

## Known Issues
- Auto-formatting features may interfere with the typing animation - the extension temporarily disables them during playback

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This extension is licensed under the MIT License.
