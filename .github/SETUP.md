# GitHub Actions Setup Guide

## Required Secrets

To enable automated publishing, you need to configure the following repository secrets:

### 1. NPM_TOKEN

1. **Generate NPM Token**:
   - Go to [npmjs.com/settings/tokens](https://www.npmjs.com/settings/tokens)
   - Click "Generate New Token"
   - Select "Automation" token type
   - Copy the token (starts with `npm_`)

2. **Add to GitHub Secrets**:
   - Go to your repository on GitHub
   - Navigate to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click "Add secret"

### 2. Repository Permissions

Ensure the repository has the correct permissions:

1. **Go to Settings → Actions → General**
2. **Workflow permissions**:
   - Select "Read and write permissions"
   - Check "Allow GitHub Actions to create and approve pull requests"

## Testing the Workflows

### 1. Test CI Pipeline
The CI workflow runs automatically on pushes to main and pull requests.

### 2. Test Release Workflow
1. Go to Actions tab
2. Select "Release and Publish"
3. Click "Run workflow"
4. Choose "patch" release type
5. Leave "publish" checked
6. Click "Run workflow"

This will:
- Bump version to 0.1.2
- Create a GitHub release
- Publish to npm automatically

## Workflow Files

- **`ci.yml`**: Continuous integration testing
- **`publish.yml`**: Direct publishing from tags/releases
- **`release.yml`**: Complete release management

## Security Notes

- NPM tokens have expiration dates - monitor and rotate them
- Use "Automation" token type for GitHub Actions
- Never commit tokens directly to the repository
- Tokens are masked in GitHub Actions logs

## Troubleshooting

### NPM Publish Fails
- Check token hasn't expired
- Verify token has publish permissions
- Ensure package name isn't already taken
- Check 2FA settings on npm account

### Version Conflicts
- Ensure version numbers follow semver
- Don't manually publish same version
- Use GitHub releases for version management

### Permission Errors
- Verify repository workflow permissions
- Check if organization has restrictions
- Ensure token scope matches package scope