# n8n Project Features

This document serves as the source of truth for all approved features in the n8n project, per CLAUDE.md quality framework requirements.

## Core Features (Implemented)

### 1. Advanced Error Handling & Retry Mechanisms
**Status**: Completed ✅
**Description**: Configurable retry system with exponential backoff, circuit breaker pattern for failing services, error categorization (transient vs permanent), and error recovery workflows with notification system.
**Modules**: `packages/@n8n/utils/src/advanced-retry.ts`, `packages/@n8n/utils/src/circuit-breaker.ts`, `packages/@n8n/utils/src/error-recovery.ts`

### 2. Comprehensive Logging & Monitoring (OpenTelemetry)
**Status**: Completed ✅
**Description**: Structured JSON logging, distributed tracing with OpenTelemetry, workflow execution metrics dashboard, log aggregation and analysis, and performance monitoring capabilities.
**Modules**: `packages/core/src/logging/`

### 3. Enhanced Data Transformation
**Status**: Completed ✅
**Description**: Complex JSONPath query support, data validation and schema enforcement, reusable transformation library for common patterns, and visual data mapping interface.
**Modules**: `packages/workflow/src/data-transformation/`
**Sub-modules**:
- `jsonpath-query.ts` - JSONPath query engine
- `schema-validator.ts` - JSON schema validation
- `transformation-library.ts` - Reusable transformation functions
- `visual-mapper.ts` - Visual data mapping interface

### 4. Reliable Webhook System
**Status**: Completed ✅
**Description**: Webhook queue with persistence, retry logic with exponential backoff, dead-letter queue for failed webhooks, signature verification, and webhook testing/debugging tools.
**Modules**: `packages/core/src/webhooks/`

### 5. Enterprise SSO, LDAP & External Secrets Integration
**Status**: Completed ✅
**Description**: SSO support (SAML, OAuth2, OIDC), LDAP/Active Directory integration, external secret store connections (HashiCorp Vault, AWS Secrets Manager), and role-based access control (RBAC).
**Modules**: `packages/cli/src/auth/enterprise/`

### 6. Environment Management System
**Status**: Completed ✅
**Description**: Environment configuration system with separate dev/staging/prod environments, environment-specific credentials and variables, environment promotion workflows, and environment isolation with testing capabilities.
**Modules**: `packages/cli/src/environments/`
**Database**:
- `packages/@n8n/db/src/entities/environment.entity.ts`
- `packages/@n8n/db/src/entities/environment-config.entity.ts`
- `packages/@n8n/db/src/entities/environment-credential.entity.ts`
- `packages/@n8n/db/src/entities/environment-variable.entity.ts`
- `packages/@n8n/db/src/migrations/common/1740000000000-AddEnvironmentManagement.ts`

### 7. Git Integration for Workflow Versioning
**Status**: Completed ✅
**Description**: Workflow versioning with Git backend, automatic commit/push for workflow changes, workflow diff and merge capabilities, and workflow review/approval process with branch management.
**Modules**: `packages/cli/src/git-integration/`
**Database**:
- `packages/@n8n/db/src/entities/workflow-backup.entity.ts`
- `packages/@n8n/db/src/entities/workflow-promotion.entity.ts`

### 8. OAuth Configuration Wizard
**Status**: Completed ✅
**Description**: OAuth setup wizard for Google Sheets, Trello, Slack, GitHub, and other popular apps. Pre-configured OAuth scopes for standard use cases, OAuth testing/validation tools, and credential templates.
**Modules**: `packages/cli/src/auth/oauth-wizard/`

### 9. Basic Auth & JWT Authentication
**Status**: Completed ✅
**Description**: Basic Auth support for simple API integrations, JWT token authentication with token generation and validation, API key management interface, and authentication method selector UI.
**Modules**: `packages/cli/src/auth/simple/`

### 10. Expanded Enterprise Authentication Tiers
**Status**: Completed ✅
**Description**: SSO/LDAP capabilities moved to lower pricing tiers, limited SSO in community edition, authentication plugin system for extensibility, and authentication marketplace for community contributions.
**Modules**: Integrated in `packages/cli/src/auth/enterprise/`

### 11. Extended Workflow & Execution History (30 Days)
**Status**: Completed ✅
**Description**: Extended workflow history from 24 hours to 30 days for registered users, execution history compression and archiving, execution replay capability, and history search and filtering interface.
**Modules**: `packages/cli/src/execution-history/`

### 12. Advanced Debugging Tools
**Status**: Completed ✅
**Description**: Interactive debugging interface with step-through execution, breakpoint support for workflow nodes, variable inspection at each step, execution timeline visualization, and performance profiling tools.
**Modules**: `packages/cli/src/debugging/`

### 13. Enhanced Security Features (Community Edition)
**Status**: Completed ✅
**Description**: Basic security scanning in community edition, secret rotation capabilities, secret usage tracking and auditing, secret compliance reporting, and basic vulnerability scanning.
**Modules**: `packages/cli/src/security/`

---

## Quality Standards

All features MUST pass the two-stage quality framework:

### Stage 1: Pre-Commit Hooks (Local Guardian)
- ✅ ESLint validation (zero errors, zero warnings)
- ✅ TypeScript type checking (strict mode)
- ✅ Prettier formatting
- ✅ Style checks

### Stage 2: CI/CD Pipeline (Official Gatekeeper)
- ✅ Comprehensive linting
- ✅ Full test suite (unit + integration + e2e)
- ✅ Security scanning
- ✅ Build validation

---

## Implementation Rules

**FORBIDDEN:**
- ❌ Adding features not explicitly listed in this file
- ❌ Expanding feature scope beyond defined requirements
- ❌ Bypassing quality framework enforcement
- ❌ Circumventing automated quality gates

**REQUIRED:**
- ✅ Implement only features explicitly defined in this file
- ✅ All features MUST pass two-stage quality framework
- ✅ Quality compliance is non-negotiable
- ✅ Suggest additions for user approval before implementation

---

## Feature Addition Process

1. User proposes new feature
2. Feature is documented in this file with user approval
3. Task created in TaskManager (TASKS.json)
4. Implementation follows quality framework
5. Feature marked complete only after both quality stages pass

---

**Last Updated**: 2025-09-30
**Features Count**: 13 core features implemented
**Quality Framework**: Enforced via pre-commit hooks + CI/CD pipeline