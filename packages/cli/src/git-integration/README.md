# n8n Git Integration for Workflow Versioning

## Overview

This Git integration module provides comprehensive version control for n8n workflows using Git. It enables teams to:

- **Version Control**: Track workflow changes with full Git history
- **Branch-Based Development**: Work on features in isolated branches
- **Merge Conflict Resolution**: Automatically detect and resolve workflow conflicts
- **Pull Request Workflow**: Review and approve workflow changes
- **Diff Visualization**: See exactly what changed in workflows
- **Webhook Integration**: Sync with GitHub/GitLab/Bitbucket

## Architecture

```
git-integration/
├── git-service.ts           # Core Git operations (commit, push, pull, merge)
├── workflow-serializer.ts   # Serialize/deserialize workflows to JSON/YAML
├── diff-engine.ts          # Calculate workflow diffs
├── merge-resolver.ts       # Resolve merge conflicts
├── branch-manager.ts       # Branch management
├── review-system.ts        # Pull request and review system
├── git-integration.service.ts  # Main orchestrator service
└── types.ts                # TypeScript type definitions
```

## Core Components

### GitService
Provides low-level Git operations using `simple-git` library:
- Initialize repository
- Commit, push, pull operations
- Branch management
- Diff calculation
- Repository status

### WorkflowSerializer
Converts workflows to/from Git-friendly formats:
- Serialize workflows to JSON/YAML files
- Deserialize workflows from files
- Maintain workflow-to-file mappings
- Generate commit messages

### DiffEngine
Analyzes differences between workflow versions:
- Node changes (added, removed, modified)
- Connection changes
- Settings changes
- Visual diff generation
- Human-readable summaries

### MergeResolver
Handles three-way merge of workflows:
- Detect merge conflicts
- Automatic conflict resolution
- Manual conflict resolution support
- Three-way merge algorithm

### BranchManager
Manages Git branches for workflow development:
- Create/delete branches
- Switch branches
- Branch naming conventions
- Protected branch support
- Stash management

### ReviewSystem
Integrates with Git platforms for code review:
- Create pull requests
- Approve/reject PRs
- Review comments
- Webhook handlers
- Merge validation

## Configuration

### Basic Configuration

```typescript
import { GitIntegrationService } from '@/git-integration';

const gitConfig = {
  repositoryPath: '/path/to/git/repo',
  remoteUrl: 'https://github.com/org/workflows.git',
  userName: 'n8n-bot',
  userEmail: 'bot@n8n.io',
  defaultBranch: 'main',
  autoCommit: true,
  autoPush: false,
};

// Initialize Git integration
await gitIntegrationService.initialize(gitConfig);
```

### Environment Variables

```bash
# Git Repository Configuration
GIT_REPO_PATH=/var/lib/n8n/git
GIT_REMOTE_URL=https://github.com/org/workflows.git
GIT_USER_NAME=n8n-bot
GIT_USER_EMAIL=bot@n8n.io

# Git Authentication
GIT_SSH_KEY_PATH=/home/user/.ssh/id_rsa
GIT_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Git Behavior
GIT_AUTO_COMMIT=true
GIT_AUTO_PUSH=false
GIT_DEFAULT_BRANCH=main
```

### Credentials Management

#### SSH Authentication
```typescript
const gitConfig = {
  repositoryPath: '/path/to/repo',
  remoteUrl: 'git@github.com:org/workflows.git',
  sshKeyPath: '/home/user/.ssh/id_rsa',
};
```

#### HTTPS with Token
```typescript
const gitConfig = {
  repositoryPath: '/path/to/repo',
  remoteUrl: 'https://github.com/org/workflows.git',
  accessToken: 'ghp_xxxxxxxxxxxxxxxxxxxx',
};
```

## Usage Examples

### Save Workflow to Git

```typescript
// Automatic commit and push
await gitIntegrationService.saveWorkflow(
  workflow,
  'Updated user authentication workflow',
  true,  // auto-commit
  true   // auto-push
);
```

### Load Workflow from Git

```typescript
// Load specific workflow
const workflow = await gitIntegrationService.loadWorkflow(workflowId);

// Load all workflows
const allWorkflows = await gitIntegrationService.loadAllWorkflows();
```

### Sync Workflows

```typescript
// Sync from Git to database
const result = await gitIntegrationService.syncFromGit();
console.log(`Imported: ${result.imported}, Updated: ${result.updated}`);

// Sync from database to Git
const exportResult = await gitIntegrationService.syncToGit();
console.log(`Exported: ${exportResult.exported} workflows`);
```

### Branch-Based Development

```typescript
// Create feature branch
await gitIntegrationService.createFeatureBranch('feature/new-integration');

// Make changes to workflows
await gitIntegrationService.saveWorkflow(workflow);

// Push to remote
await gitIntegrationService.push();

// Merge back to main
await branchManager.switchBranch('main');
await gitIntegrationService.mergeWorkflows('feature/new-integration');
```

### Diff and History

```typescript
// Calculate diff between versions
const diff = await gitIntegrationService.calculateWorkflowDiff(
  workflowId,
  'commit-hash-old',
  'commit-hash-new'
);

console.log(`Changes: ${diff.summary.totalChanges}`);
console.log(`Nodes added: ${diff.addedNodes.length}`);
console.log(`Nodes modified: ${diff.modifiedNodes.length}`);

// Get workflow history
const history = await gitIntegrationService.getWorkflowHistory(workflowId, 50);
```

### Merge Conflict Resolution

```typescript
// Detect conflicts
const conflicts = await gitIntegrationService.detectMergeConflicts(
  'base-commit',
  'current-commit',
  'incoming-commit'
);

// Resolve with strategy
for (const conflict of conflicts) {
  await gitIntegrationService.resolveMergeConflict(
    conflict,
    'current' // or 'incoming' or 'manual'
  );
}
```

### Webhook Integration

```typescript
// Handle webhook from GitHub/GitLab
app.post('/webhooks/git', async (req, res) => {
  const event = {
    type: req.body.action,
    repository: req.body.repository.name,
    branch: req.body.ref,
    author: req.body.sender.login,
    timestamp: new Date(),
    data: req.body,
  };

  await reviewSystem.handleWebhookEvent(event);
  res.status(200).send('OK');
});
```

## Workflow File Structure

Workflows are stored in the following structure:

```
repo/
├── workflows/
│   ├── user-authentication.json
│   ├── data-sync.json
│   ├── notification-sender.json
│   └── report-generator.json
└── .workflow-mappings.json
```

### Workflow File Format (JSON)

```json
{
  "id": "workflow-uuid",
  "name": "User Authentication",
  "active": true,
  "nodes": [
    {
      "id": "node-1",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300],
      "parameters": {
        "path": "auth",
        "method": "POST"
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "HTTP Request", "type": "main", "index": 0 }]]
    }
  },
  "settings": {
    "executionOrder": "v1"
  },
  "tags": ["authentication", "api"],
  "createdAt": "2025-01-15T10:00:00.000Z",
  "updatedAt": "2025-01-15T14:30:00.000Z",
  "version": 1
}
```

## Integration with n8n

### Workflow Service Integration

```typescript
// In workflow.service.ts
import { GitIntegrationService } from '@/git-integration';

@Service()
export class WorkflowService {
  constructor(
    private readonly gitIntegrationService: GitIntegrationService,
    // ... other dependencies
  ) {}

  async save(workflow: WorkflowEntity): Promise<WorkflowEntity> {
    // Save to database
    const saved = await this.workflowRepository.save(workflow);

    // Save to Git
    if (this.gitIntegrationService.isInitialized()) {
      await this.gitIntegrationService.saveWorkflow(saved);
    }

    return saved;
  }

  async delete(workflowId: string): Promise<void> {
    // Delete from database
    await this.workflowRepository.delete(workflowId);

    // Delete from Git
    if (this.gitIntegrationService.isInitialized()) {
      await this.gitIntegrationService.deleteWorkflow(workflowId);
    }
  }
}
```

### API Endpoints

Add these endpoints to your workflow controller:

```typescript
// Get workflow history
GET /api/v1/workflows/:id/history
// Response: Array of commits

// Get workflow diff
GET /api/v1/workflows/:id/diff?from=commit1&to=commit2
// Response: WorkflowDiff object

// Create branch
POST /api/v1/git/branches
// Body: { name, baseBranch }

// Merge branch
POST /api/v1/git/merge
// Body: { sourceBranch, targetBranch }

// Get repository status
GET /api/v1/git/status
// Response: Repository status

// Sync from Git
POST /api/v1/git/sync/from-git
// Response: { imported, updated, errors }

// Sync to Git
POST /api/v1/git/sync/to-git
// Response: { exported, errors }
```

## Best Practices

### 1. Branch Naming Convention
Use consistent branch naming:
- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `hotfix/description` - Urgent fixes
- `release/version` - Release branches

### 2. Commit Messages
Follow conventional commits:
```
feat(workflows): Add user authentication workflow
fix(workflows): Correct email notification trigger
chore(workflows): Update API endpoint URLs
```

### 3. Protected Branches
Protect important branches:
```typescript
// Configure protected branches
const protectedBranches = ['main', 'master', 'production'];
```

### 4. Automatic Backup
Enable auto-commit for safety:
```typescript
const gitConfig = {
  autoCommit: true,
  autoPush: true, // Push to remote for backup
};
```

### 5. Review Process
Require reviews for main branch merges:
- Create feature branches
- Make changes
- Create pull request
- Get approval
- Merge to main

## Security Considerations

### 1. Credentials Storage
- Store Git credentials securely (environment variables, secrets manager)
- Use SSH keys for authentication when possible
- Rotate access tokens regularly

### 2. Access Control
- Configure branch protection rules
- Require pull request reviews
- Restrict who can push to main branches

### 3. Sensitive Data
- Never commit credentials or secrets in workflows
- Use n8n's credential system
- Add `.gitignore` for sensitive files

### 4. Audit Trail
- All changes tracked in Git history
- Author and timestamp for every change
- Rollback capability

## Troubleshooting

### Git Not Initialized
```typescript
// Check initialization status
if (!gitIntegrationService.isInitialized()) {
  await gitIntegrationService.initialize(config);
}
```

### Merge Conflicts
```typescript
// Get current status
const status = await gitIntegrationService.getStatus();

// Check for conflicts
if (status.conflicted.length > 0) {
  console.log('Conflicted files:', status.conflicted);
  // Resolve conflicts manually or use resolution strategy
}
```

### Authentication Failures
- Verify SSH key is added to Git platform
- Check access token permissions
- Ensure remote URL is correct

### Sync Issues
```typescript
// Force sync from Git
await gitIntegrationService.pull();
await gitIntegrationService.syncFromGit();

// Force sync to Git
await gitIntegrationService.syncToGit();
const status = await gitIntegrationService.getStatus();
await gitIntegrationService.push();
```

## Performance Considerations

- **Large Repositories**: Consider shallow clones for faster operations
- **Frequent Commits**: Batch commits when possible
- **Background Operations**: Run sync operations asynchronously
- **Caching**: Cache workflow mappings and status

## Future Enhancements

- [ ] Visual merge conflict resolution UI
- [ ] Workflow version comparison viewer
- [ ] Automated testing before merge
- [ ] CI/CD pipeline integration
- [ ] Multi-repository support
- [ ] Workflow templates from Git
- [ ] Git LFS for large workflow assets
- [ ] Advanced diff visualization

## Support

For issues and questions:
- Check n8n documentation
- Review Git integration logs
- Open GitHub issue with details

## License

This module is part of n8n and follows the same license.