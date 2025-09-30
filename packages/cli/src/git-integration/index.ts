/**
 * Git Integration for n8n Workflow Versioning
 *
 * This module provides comprehensive Git integration for versioning n8n workflows.
 * It includes:
 * - Core Git operations (commit, push, pull, merge)
 * - Workflow serialization/deserialization
 * - Diff calculation and visualization
 * - Merge conflict resolution
 * - Branch management
 * - Pull request and review system
 */

export { GitService } from './git-service';
export { WorkflowSerializer } from './workflow-serializer';
export { DiffEngine } from './diff-engine';
export { MergeResolver } from './merge-resolver';
export { BranchManager } from './branch-manager';
export { ReviewSystem } from './review-system';
export { GitIntegrationService } from './git-integration.service';

export type * from './types';
