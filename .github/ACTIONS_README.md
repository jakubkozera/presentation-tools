# GitHub Actions Workflow

This repository includes a GitHub Actions workflow that automates the process of building, testing, and releasing the VS Code extension.

## Workflow Features

The workflow (`build-and-release.yml`) performs the following tasks:

- **Continuous Integration**: Automatically builds and tests the extension on every push to the main branch and on pull requests
- **Packaging**: Creates a VSIX package of the extension
- **Release Automation**: When a new version tag is pushed (e.g., v0.3.0), automatically:
  - Creates a GitHub Release with the VSIX file attached
  - Publishes the extension to the VS Code Marketplace (when properly configured)

## How to Use

### For Regular Development

Simply push your changes to the main branch or create a pull request. The workflow will automatically build and test your extension.

### To Release a New Version

1. Update the `version` field in `package.json`
2. Commit your changes
3. Create and push a new tag that matches the version:

```bash
git tag v0.3.0
git push origin v0.3.0
```

The workflow will automatically create a GitHub Release and publish to the VS Code Marketplace.

### Publishing to VS Code Marketplace

To enable publishing to the VS Code Marketplace, you need to:

1. Create a Personal Access Token (PAT) from the [Azure DevOps platform](https://dev.azure.com/)
2. Add this token as a secret in your GitHub repository:
   - Go to your GitHub repository
   - Click on "Settings" > "Secrets and variables" > "Actions"
   - Create a new secret named `VSCE_PAT` with your token as the value

## Troubleshooting

If the workflow fails:

1. Check the "Actions" tab in your GitHub repository
2. Click on the failed workflow run
3. Examine the logs for error messages
4. Make the necessary adjustments to your code or workflow configuration

## Extending the Workflow

You can modify `.github/workflows/build-and-release.yml` to add more functionality, such as:

- Running additional tests
- Building for multiple platforms
- Adding code coverage reporting
- Implementing automatic version bumping