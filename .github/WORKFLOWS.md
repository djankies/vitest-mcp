# GitHub Actions Workflows

This repository uses GitHub Actions for automated testing, building, and publishing.

## Workflows

### 1. CI (`ci.yml`)
**Trigger**: Push to main, Pull Requests
**Purpose**: Continuous Integration testing

- Tests on Node.js 18, 20, 22
- Runs linting and tests
- Builds package
- Verifies package installation

### 2. Release (`release.yml`) 
**Trigger**: Manual workflow dispatch
**Purpose**: Create releases and publish to npm

**Inputs**:
- `release_type`: patch/minor/major
- `prerelease`: Optional (beta/alpha/rc)
- `publish`: Whether to publish to npm (default: true)

**Actions**:
- Bumps version in package.json
- Generates changelog
- Creates Git tag and GitHub release
- Publishes to npm (if enabled)

### 3. Publish (`publish.yml`)
**Trigger**: Tags starting with 'v', GitHub releases, manual dispatch
**Purpose**: Direct publishing to npm

## Setup Requirements

### 1. NPM Token
Create an npm access token and add it as a repository secret:

1. Go to [npm.com](https://www.npmjs.com/settings/tokens)
2. Create a new "Automation" token
3. Add it to GitHub repository secrets as `NPM_TOKEN`

### 2. Repository Permissions
Ensure the repository has these permissions:
- Contents: write (for creating releases)
- Pull requests: write (for updating PRs)
- ID token: write (for npm provenance)

## Usage

### Creating a Release
1. Go to Actions tab in GitHub
2. Select "Release and Publish" workflow
3. Click "Run workflow"
4. Choose release type and options
5. Click "Run workflow"

### Manual Publishing
1. Go to Actions tab in GitHub  
2. Select "Publish to npm" workflow
3. Click "Run workflow"
4. Optionally specify version
5. Click "Run workflow"

## Security Features

- Uses npm provenance for package verification
- Requires explicit approval for publishing
- Automated security scanning via npm audit
- Multi-node version testing

## Release Process

1. **Development**: Work on features/fixes in branches
2. **PR Review**: Create PR to main branch
3. **CI Testing**: Automated testing on PR
4. **Merge**: Merge to main after approval
5. **Release**: Use release workflow to publish
6. **Distribution**: Package available via npm/npx

## Troubleshooting

### NPM Token Issues
- Ensure token has "Automation" type
- Verify token scope includes publish permissions
- Check token hasn't expired

### Permission Issues  
- Verify repository settings allow Actions
- Check workflow permissions in repository settings
- Ensure personal/organization npm permissions

### Build Failures
- Check Node.js version compatibility
- Verify all dependencies install correctly
- Review test failures in CI logs