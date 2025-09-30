# Git Integration Quick Start Guide

## Installation

### 1. Install Dependencies

The Git integration uses `simple-git` (already in package.json) and requires `yamljs` for YAML support:

```bash
cd packages/cli
pnpm add yamljs
pnpm add -D @types/yamljs
```

### 2. Environment Configuration

Add these environment variables to your `.env` file:

```bash
# Required
GIT_REPO_PATH=/var/lib/n8n/git-repo
GIT_USER_NAME=n8n-bot
GIT_USER_EMAIL=bot@company.com

# Optional - Remote Repository
GIT_REMOTE_URL=https://github.com/org/workflows.git
GIT_ACCESS_TOKEN=your_github_token_here

# Optional - Behavior
GIT_AUTO_COMMIT=true
GIT_AUTO_PUSH=false
GIT_DEFAULT_BRANCH=main
```

## Basic Usage

### Initialize Git Integration

```typescript
import { GitIntegrationService } from '@/git-integration';

// In your server.ts or initialization code
const gitIntegrationService = Container.get(GitIntegrationService);

const gitConfig = {
  repositoryPath: process.env.GIT_REPO_PATH || '/var/lib/n8n/git-repo',
  remoteUrl: process.env.GIT_REMOTE_URL,
  userName: process.env.GIT_USER_NAME || 'n8n-bot',
  userEmail: process.env.GIT_USER_EMAIL || 'bot@company.com',
  defaultBranch: process.env.GIT_DEFAULT_BRANCH || 'main',
  autoCommit: process.env.GIT_AUTO_COMMIT === 'true',
  autoPush: process.env.GIT_AUTO_PUSH === 'true',
  accessToken: process.env.GIT_ACCESS_TOKEN,
};

await gitIntegrationService.initialize(gitConfig);
```

### Integrate with WorkflowService

Update your `workflow.service.ts`:

```typescript
import { GitIntegrationService } from '@/git-integration';

@Service()
export class WorkflowService {
  constructor(
    // ... existing dependencies
    private readonly gitIntegrationService: GitIntegrationService,
  ) {}

  async save(workflow: WorkflowEntity): Promise<WorkflowEntity> {
    // Save to database
    const saved = await this.workflowRepository.save(workflow);

    // Save to Git if initialized
    if (this.gitIntegrationService.isInitialized()) {
      try {
        await this.gitIntegrationService.saveWorkflow(saved);
        this.logger.info('Workflow saved to Git', { id: saved.id });
      } catch (error) {
        this.logger.error('Failed to save workflow to Git', {
          id: saved.id,
          error: error.message,
        });
        // Don't fail the workflow save if Git fails
      }
    }

    return saved;
  }

  async delete(workflowId: string): Promise<void> {
    // Delete from database
    await this.workflowRepository.delete(workflowId);

    // Delete from Git if initialized
    if (this.gitIntegrationService.isInitialized()) {
      try {
        await this.gitIntegrationService.deleteWorkflow(workflowId);
      } catch (error) {
        this.logger.error('Failed to delete workflow from Git', {
          workflowId,
          error: error.message,
        });
      }
    }
  }
}
```

### Add API Endpoints

Create `git.controller.ts`:

```typescript
import { GitIntegrationService } from '@/git-integration';
import { Get, Post, RestController } from '@/decorators';
import { GitRequest } from '@/requests';

@RestController('/git')
export class GitController {
  constructor(private readonly gitIntegrationService: GitIntegrationService) {}

  @Get('/status')
  async getStatus() {
    return await this.gitIntegrationService.getStatus();
  }

  @Get('/branches')
  async listBranches() {
    return await this.gitIntegrationService.listBranches();
  }

  @Post('/push')
  async push() {
    await this.gitIntegrationService.push();
    return { success: true };
  }

  @Post('/pull')
  async pull() {
    await this.gitIntegrationService.pull();
    return { success: true };
  }

  @Post('/sync/from-git')
  async syncFromGit() {
    const result = await this.gitIntegrationService.syncFromGit();
    return result;
  }

  @Post('/sync/to-git')
  async syncToGit() {
    const result = await this.gitIntegrationService.syncToGit();
    return result;
  }

  @Get('/workflows/:id/history')
  async getWorkflowHistory(req: GitRequest.WorkflowHistory) {
    const history = await this.gitIntegrationService.getWorkflowHistory(
      req.params.id,
      req.query.maxCount || 50
    );
    return history;
  }

  @Get('/workflows/:id/diff')
  async getWorkflowDiff(req: GitRequest.WorkflowDiff) {
    const diff = await this.gitIntegrationService.calculateWorkflowDiff(
      req.params.id,
      req.query.from,
      req.query.to
    );
    return diff;
  }
}
```

## Common Operations

### 1. Manual Workflow Save to Git

```typescript
const workflow = await workflowRepository.findOne({ where: { id: workflowId }});
await gitIntegrationService.saveWorkflow(
  workflow,
  'Updated workflow configuration',
  true, // auto-commit
  true  // auto-push
);
```

### 2. Load Workflow from Git

```typescript
const serializedWorkflow = await gitIntegrationService.loadWorkflow(workflowId);
```

### 3. Sync All Workflows from Git

```typescript
const result = await gitIntegrationService.syncFromGit();
console.log(`Imported: ${result.imported}, Updated: ${result.updated}`);
```

### 4. Create Feature Branch

```typescript
await gitIntegrationService.createFeatureBranch('feature/new-api-integration');
// Make changes
await gitIntegrationService.saveWorkflow(workflow);
// Merge back
await gitIntegrationService.mergeWorkflows('feature/new-api-integration', 'main');
```

### 5. View Workflow History

```typescript
const history = await gitIntegrationService.getWorkflowHistory(workflowId, 10);
for (const commit of history) {
  console.log(`${commit.hash}: ${commit.message} by ${commit.author_name}`);
}
```

### 6. Calculate Workflow Diff

```typescript
const diff = await gitIntegrationService.calculateWorkflowDiff(
  workflowId,
  'old-commit-hash',
  'new-commit-hash'
);

console.log(`Nodes added: ${diff.addedNodes.length}`);
console.log(`Nodes removed: ${diff.removedNodes.length}`);
console.log(`Nodes modified: ${diff.modifiedNodes.length}`);
```

## Testing

### Manual Testing

1. **Initialize repository:**
```bash
curl -X POST http://localhost:5678/api/v1/git/initialize
```

2. **Check status:**
```bash
curl http://localhost:5678/api/v1/git/status
```

3. **Save a workflow** (through n8n UI or API)

4. **View history:**
```bash
curl http://localhost:5678/api/v1/git/workflows/{workflow-id}/history
```

5. **Push to remote:**
```bash
curl -X POST http://localhost:5678/api/v1/git/push
```

### Unit Testing

```typescript
import { GitIntegrationService } from '@/git-integration';

describe('GitIntegrationService', () => {
  let gitService: GitIntegrationService;

  beforeEach(async () => {
    gitService = new GitIntegrationService(/* dependencies */);
    await gitService.initialize({
      repositoryPath: '/tmp/test-repo',
      userName: 'test',
      userEmail: 'test@example.com',
    });
  });

  it('should save workflow to Git', async () => {
    const workflow = createMockWorkflow();
    await gitService.saveWorkflow(workflow);

    const status = await gitService.getStatus();
    expect(status.files).toHaveLength(0); // All changes committed
  });

  it('should load workflow from Git', async () => {
    const saved = await gitService.loadWorkflow(workflowId);
    expect(saved).toBeDefined();
    expect(saved.id).toBe(workflowId);
  });
});
```

## Troubleshooting

### Git Not Initialized Error

```typescript
if (!gitIntegrationService.isInitialized()) {
  await gitIntegrationService.initialize(config);
}
```

### Authentication Failed

Check your credentials:
- For HTTPS: Verify `GIT_ACCESS_TOKEN` is correct
- For SSH: Verify `GIT_SSH_KEY_PATH` points to valid key
- Ensure remote URL format is correct

### Merge Conflicts

```typescript
const status = await gitIntegrationService.getStatus();
if (status.conflicted.length > 0) {
  console.log('Conflicts:', status.conflicted);
  // Resolve manually or use resolution strategy
}
```

### Push Rejected

Ensure you have latest changes:
```typescript
await gitIntegrationService.pull();
// Make changes
await gitIntegrationService.push();
```

## Configuration Examples

### GitHub HTTPS
```typescript
{
  repositoryPath: '/var/lib/n8n/git-repo',
  remoteUrl: 'https://github.com/org/workflows.git',
  userName: 'n8n-bot',
  userEmail: 'bot@company.com',
  accessToken: process.env.GITHUB_TOKEN,
  autoCommit: true,
  autoPush: true,
}
```

### GitHub SSH
```typescript
{
  repositoryPath: '/var/lib/n8n/git-repo',
  remoteUrl: 'git@github.com:org/workflows.git',
  userName: 'n8n-bot',
  userEmail: 'bot@company.com',
  sshKeyPath: '/home/user/.ssh/id_rsa',
  autoCommit: true,
  autoPush: true,
}
```

### Local Only (No Remote)
```typescript
{
  repositoryPath: '/var/lib/n8n/git-repo',
  userName: 'Local User',
  userEmail: 'user@localhost',
  autoCommit: true,
  // No remote configuration
}
```

## Next Steps

1. ✅ Install dependencies (`yamljs`)
2. ✅ Configure environment variables
3. ✅ Initialize Git integration on startup
4. ✅ Integrate with WorkflowService
5. ✅ Add API endpoints
6. ✅ Test basic operations
7. 🔲 Implement UI components
8. 🔲 Add webhook handlers
9. 🔲 Configure platform-specific integrations
10. 🔲 Deploy to production

## Support

For detailed documentation, see:
- [README.md](./README.md) - Comprehensive documentation
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Implementation details
- [config.example.ts](./config.example.ts) - Configuration examples

## Security Notes

⚠️ **Important Security Considerations:**

1. Never commit credentials or secrets to Git
2. Use environment variables for sensitive data
3. Restrict access to Git repository
4. Use SSH keys or tokens with minimal required permissions
5. Enable branch protection on production branches
6. Regularly rotate access tokens

## License

Part of n8n - Same license applies.