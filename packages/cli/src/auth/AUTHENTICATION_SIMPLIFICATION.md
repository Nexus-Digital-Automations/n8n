# Authentication Simplification Implementation

## Overview

This implementation provides comprehensive OAuth simplification with wizards for common apps and restores Basic Auth/JWT support to n8n. The solution is organized into two main directories: `oauth-wizard/` and `simple/`.

## Directory Structure

```
packages/cli/src/auth/
├── oauth-wizard/
│   ├── oauth-wizard.ts           # OAuth setup wizard service
│   ├── oauth-templates.ts        # Pre-configured OAuth templates
│   ├── oauth-testing.ts          # OAuth testing and validation
│   ├── credential-templates.ts   # Quick credential setup templates
│   └── index.ts                  # Module exports
└── simple/
    ├── basic-auth.ts             # Basic Authentication implementation
    ├── jwt-auth.ts               # JWT authentication service
    ├── api-key-manager.ts        # API key lifecycle management
    ├── auth-method-selector.ts   # Authentication method selector
    └── index.ts                  # Module exports
```

## OAuth Wizard Features

### 1. Pre-configured OAuth Providers

**Supported Providers (12 total):**
- Google Sheets
- Google Drive
- Gmail
- Trello
- Slack
- GitHub
- Notion
- Airtable
- Microsoft Teams
- Dropbox
- HubSpot
- Asana

**Features per Provider:**
- Pre-configured authorization and token URLs
- Default scopes for standard use cases
- Optional scopes for advanced features
- OAuth grant type (authorizationCode/PKCE)
- Authentication method configuration
- Provider-specific parameters

### 2. OAuth Wizard Service (`oauth-wizard.ts`)

**Key Capabilities:**
- Quick setup wizard for OAuth credentials
- Provider discovery and information
- Scope recommendations (minimal, standard, full)
- Credential validation
- Setup instructions per provider
- Documentation links
- Provider-specific tips

**Main Methods:**
- `getAvailableProviders()` - List all OAuth providers
- `getProviderDetails(name)` - Get provider configuration
- `quickSetup(request, user)` - One-click OAuth setup
- `getScopeRecommendations(provider)` - Scope guidance
- `validateSetup(credentialId, user)` - Validate configuration

### 3. OAuth Templates Service (`oauth-templates.ts`)

**Features:**
- Template-based credential creation
- Scope management and recommendations
- Configuration validation
- Pre-defined OAuth configurations

**Template Structure:**
```typescript
{
  name: 'Provider Name',
  credentialType: 'providerOAuth2Api',
  authUrl: 'https://...',
  accessTokenUrl: 'https://...',
  defaultScopes: ['scope1', 'scope2'],
  optionalScopes: ['advanced1', 'advanced2'],
  grantType: 'authorizationCode',
  authenticationType: 'body',
  authentication: 'body',
  usePKCE: true,
  additionalParams: {}
}
```

### 4. OAuth Testing Service (`oauth-testing.ts`)

**Testing Capabilities:**
- Credential testing with real API calls
- Token information retrieval
- Callback URL validation
- Reauthorization detection
- Connection status monitoring
- Bulk credential testing
- Health metrics calculation
- Test report generation

**Key Methods:**
- `testCredential(id, user)` - Test OAuth credential
- `getTokenInfo(id, user)` - Get token details
- `validateCallbackUrl(url)` - Validate callback
- `needsReauthorization(id, user)` - Check if reauth needed
- `getConnectionStatus(id, user)` - Get connection state
- `bulkTestCredentials(ids, user)` - Test multiple
- `getHealthMetrics(ids, user)` - Calculate health score

### 5. Credential Templates Service (`credential-templates.ts`)

**Quick Setup Templates (10 types):**
- HTTP Basic Auth
- HTTP Header Auth
- API Key
- Bearer Token
- JWT Authentication
- AWS Credentials
- MongoDB Connection
- PostgreSQL Connection
- MySQL Connection
- Redis Connection

**Features:**
- Template-based quick setup
- Field validation
- Default values
- Setup instructions
- Usage examples

## Simple Authentication Features

### 1. Basic Authentication (`basic-auth.ts`)

**Capabilities:**
- Username/password credential creation
- Base64 encoding/decoding
- Authorization header generation
- Password hashing (SHA-256 with salt)
- Password strength validation
- Strong password generation
- Credential validation
- Password updates
- Test endpoint support

**Security Features:**
- Optional password hashing
- Salt generation
- Strong password requirements (8+ chars)
- Password strength scoring

**Key Methods:**
- `createCredential(name, username, password, user)` - Create Basic Auth
- `encodeCredentials(username, password)` - Encode to Base64
- `decodeCredentials(encoded)` - Decode from Base64
- `generateAuthorizationHeader(username, password)` - Generate header
- `validateCredentials(id, username, password, user)` - Validate
- `updatePassword(id, newPassword, user)` - Update password
- `generateStrongPassword(length)` - Generate secure password
- `validatePasswordStrength(password)` - Check strength

### 2. JWT Authentication (`jwt-auth.ts`)

**Features:**
- JWT token generation
- Token verification
- Token refresh
- Custom claims support
- Multiple algorithms (HS256, HS384, HS512, RS256, etc.)
- Expiration handling
- Issuer/Audience validation
- Secret generation

**Supported Algorithms:**
- HS256, HS384, HS512 (HMAC)
- RS256, RS384, RS512 (RSA)
- ES256, ES384, ES512 (ECDSA)

**Key Methods:**
- `createCredential(name, config, user)` - Create JWT credential
- `generateToken(config, payload)` - Generate token
- `verifyToken(token, config)` - Verify token
- `decodeToken(token)` - Decode without verification
- `generateSecret(length)` - Generate JWT secret
- `refreshToken(id, oldToken, user)` - Refresh token
- `getTokenInfo(token)` - Get token metadata

**Configuration:**
```typescript
{
  secret: string,           // Signing secret (32+ chars)
  algorithm: 'HS256',       // Algorithm
  expiresIn: '1h',          // Expiration
  issuer: 'n8n',           // Token issuer
  audience: 'api',         // Token audience
  claims: {}               // Custom claims
}
```

### 3. API Key Manager (`api-key-manager.ts`)

**Features:**
- API key generation (multiple formats)
- Key rotation
- Key revocation
- Expiration management
- Usage tracking
- Validation
- Metadata management

**Key Formats:**
- UUID v4
- Base64
- Hex
- Alphanumeric

**Key Locations:**
- Header (e.g., X-API-Key)
- Query parameter
- Request body

**Key Methods:**
- `generateApiKey(format, length)` - Generate key
- `createApiKeyCredential(name, config, user)` - Create credential
- `rotateApiKey(id, user)` - Rotate key
- `revokeApiKey(id, user)` - Revoke key
- `validateApiKey(id, providedKey, user)` - Validate
- `setExpiration(id, expiresIn, user)` - Set expiration
- `getApiKeyMetadata(id, user)` - Get metadata

**Metadata Tracked:**
- Creation timestamp
- Last used timestamp
- Usage count
- Expiration date
- Active status
- Key prefix (first 8 chars)

### 4. Authentication Method Selector (`auth-method-selector.ts`)

**Features:**
- Authentication method comparison
- Use case recommendations
- Security level evaluation
- Complexity assessment
- Interactive selection wizard

**Supported Methods:**
- OAuth 2.0
- Basic Auth
- API Key
- JWT
- Bearer Token
- Digest Auth
- NTLM
- No Auth

**Method Information:**
```typescript
{
  method: 'oauth2',
  name: 'OAuth 2.0',
  description: '...',
  securityLevel: 5,        // 1-5 scale
  complexity: 4,           // 1-5 scale
  useCases: [...],
  advantages: [...],
  disadvantages: [...],
  requiredFields: [...],
  recommendedFor: [...]
}
```

**Key Methods:**
- `getAllMethods()` - Get all auth methods
- `getMethodInfo(method)` - Get method details
- `recommendMethod(useCase)` - Recommend based on use case
- `compareMethods(methods)` - Compare multiple methods
- `getMethodsBySecurityLevel(min)` - Filter by security
- `findBestMethod(requirements)` - Find best match
- `getSelectionWizard()` - Interactive wizard

**Use Cases Supported:**
- Web API
- Microservices
- Mobile App
- Desktop App
- IoT
- Legacy System
- Internal Service
- Public API
- Third-party Integration

## Usage Examples

### Quick OAuth Setup

```typescript
import { OAuthWizard } from '@/auth/oauth-wizard';

// List available providers
const providers = oauthWizard.getAvailableProviders();

// Quick setup Google Sheets OAuth
const result = await oauthWizard.quickSetup({
  provider: 'Google Sheets',
  name: 'My Google Sheets',
  clientId: 'client_id_here',
  clientSecret: 'client_secret_here',
  projectId: 'project-id'
}, user);

// Get scope recommendations
const scopes = oauthWizard.getScopeRecommendations('Google Sheets');
// { minimal: [...], standard: [...], full: [...] }
```

### OAuth Testing

```typescript
import { OAuthTesting } from '@/auth/oauth-wizard';

// Test credential
const testResult = await oauthTesting.testCredential(credentialId, user);

// Get token info
const tokenInfo = await oauthTesting.getTokenInfo(credentialId, user);

// Check connection status
const status = await oauthTesting.getConnectionStatus(credentialId, user);

// Get health metrics
const metrics = await oauthTesting.getHealthMetrics(credentialIds, user);
```

### Basic Auth

```typescript
import { BasicAuth } from '@/auth/simple';

// Create credential
const credential = await basicAuth.createCredential(
  'My API',
  'username',
  'password123',
  user,
  { hashPassword: true }
);

// Generate Authorization header
const header = basicAuth.generateAuthorizationHeader('username', 'password');
// 'Basic dXNlcm5hbWU6cGFzc3dvcmQ='

// Validate credentials
const valid = await basicAuth.validateCredentials(
  credentialId,
  'username',
  'password',
  user
);
```

### JWT Authentication

```typescript
import { JwtAuth } from '@/auth/simple';

// Create JWT credential
const credential = await jwtAuth.createCredential(
  'My JWT',
  {
    secret: jwtAuth.generateSecret(64),
    algorithm: 'HS256',
    expiresIn: '1h',
    issuer: 'n8n',
    audience: 'api'
  },
  user
);

// Generate token
const token = await jwtAuth.generateTokenFromCredential(
  credentialId,
  { sub: 'user-123', role: 'admin' },
  user
);

// Verify token
const validation = await jwtAuth.validateCredential(
  credentialId,
  token,
  user
);
```

### API Key Management

```typescript
import { ApiKeyManager } from '@/auth/simple';

// Create API key
const key = apiKeyManager.generateApiKey('base64', 32);

const credential = await apiKeyManager.createApiKeyCredential(
  'My API Key',
  {
    key,
    location: 'header',
    name: 'X-API-Key'
  },
  user
);

// Rotate key
const result = await apiKeyManager.rotateApiKey(credentialId, user);

// Set expiration
const expiresAt = await apiKeyManager.setExpiration(
  credentialId,
  '30d',
  user
);

// Get metadata
const metadata = await apiKeyManager.getApiKeyMetadata(credentialId, user);
```

### Auth Method Selection

```typescript
import { AuthMethodSelector } from '@/auth/simple';

// Get recommendation for use case
const recommendation = authMethodSelector.recommendMethod('web-api');
// { method: 'oauth2', score: 95, reason: '...', alternatives: [...] }

// Compare methods
const comparison = authMethodSelector.compareMethods([
  'oauth2',
  'basic',
  'apiKey'
]);

// Find best method
const best = authMethodSelector.findBestMethod({
  minSecurityLevel: 4,
  maxComplexity: 3,
  useCase: 'microservices'
});
```

## Integration Points

All services are designed to integrate with existing n8n infrastructure:

1. **CredentialsService** - Uses existing credential storage and encryption
2. **Logger** - Integrates with n8n logging framework
3. **User Authentication** - Works with existing user system
4. **Project Management** - Supports project-based credentials
5. **Error Handling** - Uses n8n error types

## Security Considerations

1. **OAuth:**
   - CSRF protection with state tokens
   - PKCE support for mobile apps
   - Token refresh handling
   - Secure token storage

2. **Basic Auth:**
   - Password hashing with salt
   - Strong password requirements
   - HTTPS requirement warning
   - Credential validation

3. **JWT:**
   - Strong secret requirements (32+ chars)
   - Multiple algorithm support
   - Token expiration
   - Signature verification

4. **API Keys:**
   - Secure generation
   - Key rotation support
   - Revocation capability
   - Usage tracking

## Benefits

1. **Simplified OAuth Setup:**
   - One-click setup for 12 popular providers
   - Pre-configured scopes and settings
   - Guided setup process
   - Testing and validation tools

2. **Restored Authentication Methods:**
   - Basic Auth with password hashing
   - JWT with full token lifecycle
   - API Key with rotation and tracking
   - Method comparison and selection

3. **Developer Experience:**
   - Clear documentation
   - Usage examples
   - Type safety
   - Error handling

4. **Enterprise Features:**
   - Credential lifecycle management
   - Usage tracking
   - Health monitoring
   - Bulk operations

## Future Enhancements

1. **Additional OAuth Providers:**
   - Salesforce
   - LinkedIn
   - Twitter/X
   - Box
   - OneDrive

2. **Advanced Features:**
   - OAuth flow debugging
   - Token encryption at rest
   - Rate limiting per credential
   - Credential sharing policies

3. **UI Components:**
   - OAuth wizard frontend
   - Method selector UI
   - Credential health dashboard
   - Testing interface

## Summary

This implementation provides a comprehensive authentication simplification layer for n8n, including:

- **12 pre-configured OAuth providers** with templates and testing
- **Full Basic Auth support** with password hashing and validation
- **Complete JWT implementation** with token lifecycle management
- **Advanced API Key management** with rotation and tracking
- **Authentication method selector** with recommendations and comparison

All components are fully typed, documented, and integrate seamlessly with existing n8n infrastructure while maintaining enterprise-grade security standards.