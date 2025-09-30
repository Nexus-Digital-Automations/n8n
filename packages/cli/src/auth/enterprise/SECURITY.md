# Enterprise Authentication Security Guide

## Overview

This document outlines critical security considerations, best practices, and threat mitigation strategies for the n8n enterprise authentication implementation.

## Security Architecture

### Defense in Depth

The implementation employs multiple layers of security:

1. **Network Layer**: IP whitelisting/blacklisting
2. **Transport Layer**: TLS/SSL for all communications
3. **Authentication Layer**: Multi-factor authentication, SSO, LDAP
4. **Authorization Layer**: RBAC with fine-grained permissions
5. **Session Layer**: Token validation, session management
6. **Audit Layer**: Comprehensive logging and monitoring

### Zero Trust Principles

- Never trust, always verify
- Assume breach mentality
- Verify explicitly on every request
- Use least privilege access
- Segment access by resource type

## Critical Security Requirements

### 1. Transport Security

#### HTTPS Everywhere

**Requirement**: All endpoints must use HTTPS (TLS 1.2 or higher)

**Implementation**:
```typescript
// Express server configuration
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('path/to/private-key.pem'),
  cert: fs.readFileSync('path/to/certificate.pem'),
  minVersion: 'TLSv1.2',
  ciphers: [
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-RSA-AES256-SHA384',
  ].join(':'),
};

https.createServer(options, app).listen(443);
```

**Validation**:
```bash
# Test TLS configuration
nmap --script ssl-enum-ciphers -p 443 n8n.example.com
```

#### LDAPS (LDAP over TLS)

**Requirement**: All LDAP connections must use LDAPS

**Implementation**:
```typescript
const ldapConfig = {
  url: 'ldaps://ldap.example.com:636',
  tlsEnabled: true,
  tlsRejectUnauthorized: true, // Validate certificates
};
```

**Certificate Validation**:
```typescript
import { readFileSync } from 'fs';

const ldapConfig = {
  url: 'ldaps://ldap.example.com:636',
  tlsOptions: {
    rejectUnauthorized: true,
    ca: [readFileSync('path/to/ca-cert.pem')],
    minVersion: 'TLSv1.2',
  },
};
```

### 2. Secret Management

#### Never Store Secrets in Code

**❌ BAD**:
```typescript
const dbPassword = 'hardcoded-password-123';
const apiKey = 'sk-1234567890abcdef';
```

**✅ GOOD**:
```typescript
// Use environment variables
const dbPassword = process.env.DB_PASSWORD;
const apiKey = process.env.API_KEY;

// Or use external secrets manager
const dbPassword = await secretsManager.getSecret('database-password');
const apiKey = await secretsManager.getSecret('api-key');
```

#### Secret Rotation

**Automated Rotation**:
```typescript
// Enable automatic secret rotation
const secretsConfig = {
  enabled: true,
  provider: 'aws',
  autoRotate: true,
  rotationInterval: 30, // days
};

// Manual rotation
await secretsManager.rotateSecret('database-password');
```

**Rotation Schedule**:
- Database passwords: 30 days
- API keys: 90 days
- SSO client secrets: 90 days
- LDAP bind passwords: 90 days
- JWT signing keys: 180 days

#### Secret Encryption

**At Rest**:
- Use AWS Secrets Manager encryption
- Use Azure Key Vault encryption
- Use GCP Secret Manager encryption
- Encrypt environment variables in CI/CD

**In Transit**:
- All secrets transmitted over TLS
- No secrets in query parameters
- No secrets in URLs or logs

### 3. Authentication Security

#### SSO Security

**Callback URL Validation**:
```typescript
const ssoConfig = {
  callbackUrl: 'https://n8n.example.com/api/v1/auth/callback/google',
  // Must match exactly in SSO provider configuration
};

// Validate callback URL
function validateCallbackUrl(url: string): boolean {
  const parsed = new URL(url);
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === 'n8n.example.com' &&
    parsed.pathname.startsWith('/api/v1/auth/callback/')
  );
}
```

**Token Validation**:
```typescript
// Always validate SSO tokens on the backend
async function validateSSOToken(token: string): Promise<User | null> {
  try {
    // Verify token signature
    const decoded = await verifyToken(token);

    // Verify issuer
    if (decoded.iss !== EXPECTED_ISSUER) {
      throw new Error('Invalid token issuer');
    }

    // Verify audience
    if (decoded.aud !== CLIENT_ID) {
      throw new Error('Invalid token audience');
    }

    // Verify expiration
    if (decoded.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }

    return decoded;
  } catch (error) {
    logger.error('Token validation failed', { error });
    return null;
  }
}
```

**Domain Restriction**:
```typescript
const ssoConfig = {
  allowedDomains: ['example.com', 'example.org'],
};

// Validate email domain
function validateEmailDomain(email: string, allowedDomains: string[]): boolean {
  const domain = email.split('@')[1];
  return allowedDomains.includes(domain);
}
```

#### LDAP Security

**Service Account Permissions**:
```ldif
# Minimal LDAP service account permissions
dn: cn=n8n-service,ou=service-accounts,dc=example,dc=com
objectClass: account
cn: n8n-service
description: n8n LDAP service account

# Grant only read access to users and groups
aci: (target="ldap:///ou=users,dc=example,dc=com")(targetattr="*")
  (version 3.0; acl "n8n read users"; allow (read,search)
  userdn="ldap:///cn=n8n-service,ou=service-accounts,dc=example,dc=com";)
```

**Connection Security**:
```typescript
const ldapConfig = {
  url: 'ldaps://ldap.example.com:636',
  bindDN: process.env.LDAP_BIND_DN,
  bindPassword: process.env.LDAP_BIND_PASSWORD,
  timeout: 5000, // 5 second timeout
  tlsOptions: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  },
};
```

**Password Security**:
```typescript
// Never log passwords
logger.debug('LDAP authentication attempt', {
  username,
  // ❌ password: password,
  dn: userDN
});

// Always use separate client for bind
const userClient = new Client({ url: ldapConfig.url });
try {
  await userClient.bind(userDN, password);
  // Success
} finally {
  await userClient.unbind(); // Always cleanup
}
```

### 4. Authorization Security (RBAC)

#### Principle of Least Privilege

**Default Deny**:
```typescript
// Default to deny access
const decision = await rbacManager.checkPermission({
  userId,
  resource,
  action,
});

if (!decision.allowed) {
  throw new ForbiddenError('Access denied');
}
```

**Explicit Permissions**:
```typescript
// Require explicit permission grants
const role = {
  id: 'viewer',
  name: 'Viewer',
  permissions: [
    { resource: 'workflow', action: 'read', effect: 'allow' },
    // Must explicitly list each permission
    // No wildcard permissions in production
  ],
};
```

#### Deny Rules Override Allow Rules

```typescript
// Policy deny rules take precedence
const policy = {
  id: 'deny-delete-production',
  name: 'Prevent Production Deletions',
  rules: [{
    resource: 'workflow',
    action: 'delete',
    effect: 'deny', // Overrides any allow rules
    conditions: {
      resourceAttributes: {
        environment: 'production',
      },
    },
  }],
};
```

#### Time-Based Access Control

```typescript
// Restrict access to business hours
const policy = {
  id: 'business-hours-only',
  name: 'Business Hours Access',
  rules: [{
    resource: 'workflow',
    action: 'execute',
    effect: 'allow',
    conditions: {
      timeRestrictions: {
        startTime: '09:00',
        endTime: '17:00',
        daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
        timezone: 'America/New_York',
      },
    },
  }],
};
```

#### IP-Based Access Control

```typescript
// Restrict access by IP address
const policy = {
  id: 'internal-network-only',
  name: 'Internal Network Access',
  rules: [{
    resource: 'credential',
    action: 'read',
    effect: 'allow',
    conditions: {
      ipRestrictions: [
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
      ],
    },
  }],
};
```

### 5. Session Management

#### Session Security

**Session Timeout**:
```typescript
const authConfig = {
  sessionTimeout: 60, // minutes
  maxConcurrentSessions: 5,
  enableSessionTracking: true,
};
```

**Session Invalidation**:
```typescript
// Invalidate session on logout
app.post('/api/v1/logout', async (req, res) => {
  await authService.invalidateToken(req);
  authMiddleware.revokeSession(req.user.id, req.sessionId);
  authService.clearCookie(res);
  res.json({ success: true });
});
```

**Session Hijacking Prevention**:
```typescript
// Include browser fingerprint in session
const sessionId = createHash('sha256')
  .update(`${ip}:${userAgent}:${userId}`)
  .digest('hex');

// Validate on each request
if (session.ip !== req.ip || session.userAgent !== req.headers['user-agent']) {
  throw new AuthError('Session hijacking detected');
}
```

#### JWT Security

**Token Signing**:
```typescript
// Use strong signing algorithm
const token = jwt.sign(payload, SECRET_KEY, {
  algorithm: 'HS256', // or RS256 for asymmetric
  expiresIn: '1h',
  issuer: 'n8n',
  audience: 'n8n-api',
});
```

**Token Validation**:
```typescript
// Verify all claims
const payload = jwt.verify(token, SECRET_KEY, {
  algorithms: ['HS256'],
  issuer: 'n8n',
  audience: 'n8n-api',
});

// Check token invalidation list
const isInvalid = await invalidAuthTokenRepository.existsBy({ token });
if (isInvalid) {
  throw new AuthError('Token has been revoked');
}
```

### 6. Audit Logging

#### Comprehensive Logging

**What to Log**:
```typescript
const auditEntry = {
  timestamp: new Date(),
  userId: user.id,
  action: 'delete_workflow',
  resource: 'workflow',
  resourceId: workflowId,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  success: true,
  duration: Date.now() - startTime,
  metadata: {
    workflowName: workflow.name,
    method: req.method,
    path: req.path,
  },
};
```

**What NOT to Log**:
- ❌ Passwords
- ❌ API keys or tokens
- ❌ Secrets or credentials
- ❌ Personal identifiable information (PII) unless required
- ❌ Credit card numbers
- ❌ Social security numbers

**Log Sanitization**:
```typescript
function sanitizeForLogging(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'apiKey',
    'apiSecret',
    'privateKey',
    'creditCard',
    'ssn',
  ];

  const sanitized = { ...data };
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '***REDACTED***';
    }
  }

  return sanitized;
}
```

#### Audit Log Security

**Log Storage**:
- Store logs in append-only storage
- Use separate database or log service
- Encrypt logs at rest
- Limit access to security team only

**Log Retention**:
```typescript
// Retention policy
const retentionPolicy = {
  authenticationLogs: 90, // days
  permissionLogs: 90,
  adminActionLogs: 365,
  securityIncidents: 730,
};

// Automated cleanup
async function cleanupOldLogs() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionPolicy.authenticationLogs);

  await auditLogRepository.delete({
    timestamp: LessThan(cutoffDate),
  });
}
```

### 7. Input Validation

#### Prevent Injection Attacks

**LDAP Injection**:
```typescript
// Sanitize LDAP search filters
function sanitizeLDAPInput(input: string): string {
  // Escape special characters
  return input.replace(/[*()\\\0]/g, (char) => {
    switch (char) {
      case '*': return '\\2a';
      case '(': return '\\28';
      case ')': return '\\29';
      case '\\': return '\\5c';
      case '\0': return '\\00';
      default: return char;
    }
  });
}

// Use parameterized filters
const searchFilter = `(&(uid=${sanitizeLDAPInput(username)})(objectClass=person))`;
```

**SQL Injection**:
```typescript
// Use parameterized queries
const user = await userRepository.findOne({
  where: { email: email }, // Safe - TypeORM handles escaping
});

// ❌ Never use string concatenation
// const query = `SELECT * FROM users WHERE email = '${email}'`;
```

**Command Injection**:
```typescript
// ❌ Never pass user input to shell commands
// exec(`ldapsearch -x -h ${hostname}`);

// ✅ Use library functions instead
const client = new Client({ url: hostname });
```

### 8. Rate Limiting

#### Prevent Brute Force Attacks

**Authentication Rate Limiting**:
```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/v1/auth/login', authLimiter, authController.login);
```

**Account Lockout**:
```typescript
// Lock account after 5 failed attempts
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

async function checkAccountLockout(userId: string): Promise<void> {
  const attempts = await failedLoginRepository.count({
    where: {
      userId,
      timestamp: MoreThan(new Date(Date.now() - LOCKOUT_DURATION)),
    },
  });

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    throw new AuthError('Account locked due to too many failed attempts');
  }
}
```

### 9. Error Handling

#### Prevent Information Disclosure

**Generic Error Messages**:
```typescript
// ❌ Don't reveal internal details
throw new Error('User not found in database table users at row 123');

// ✅ Use generic messages
throw new AuthError('Invalid username or password');
```

**Error Logging**:
```typescript
try {
  await authenticateUser(username, password);
} catch (error) {
  // Log full error details internally
  logger.error('Authentication failed', {
    username,
    error: error.message,
    stack: error.stack,
    timestamp: new Date(),
  });

  // Return generic error to user
  throw new AuthError('Authentication failed');
}
```

### 10. Security Headers

#### Configure Security Headers

```typescript
import helmet from 'helmet';

app.use(helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  // Strict-Transport-Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options
  noSniff: true,

  // X-XSS-Protection
  xssFilter: true,

  // Referrer-Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
}));
```

## Threat Model

### Identified Threats and Mitigations

#### 1. Credential Theft

**Threat**: Attacker steals user credentials

**Mitigations**:
- Enforce strong password policies
- Implement multi-factor authentication
- Use SSO when possible
- Monitor for suspicious login patterns
- Implement account lockout

#### 2. Session Hijacking

**Threat**: Attacker steals or predicts session tokens

**Mitigations**:
- Use cryptographically secure random tokens
- Include browser fingerprint in sessions
- Implement session timeout
- Validate IP address and user agent
- Revoke sessions on password change

#### 3. Privilege Escalation

**Threat**: User gains unauthorized elevated privileges

**Mitigations**:
- Implement RBAC with least privilege
- Audit permission changes
- Validate permissions on every request
- Use deny-by-default policy
- Regular permission audits

#### 4. LDAP Injection

**Threat**: Attacker injects malicious LDAP queries

**Mitigations**:
- Sanitize all LDAP inputs
- Use parameterized queries
- Implement input validation
- Limit LDAP service account permissions
- Monitor LDAP queries

#### 5. Token Replay

**Threat**: Attacker reuses stolen authentication tokens

**Mitigations**:
- Short token expiration times
- One-time use refresh tokens
- Token invalidation list
- Bind tokens to client characteristics
- Monitor for suspicious token usage

#### 6. Man-in-the-Middle

**Threat**: Attacker intercepts communications

**Mitigations**:
- Enforce TLS 1.2 or higher
- Validate SSL certificates
- Use certificate pinning
- Implement HSTS
- Monitor certificate expiration

## Security Checklist

### Pre-Production Security Checklist

- [ ] All secrets stored in external secrets manager
- [ ] HTTPS enabled with valid SSL certificate
- [ ] LDAPS configured with certificate validation
- [ ] SSO callback URLs validated
- [ ] Rate limiting configured
- [ ] Account lockout implemented
- [ ] Audit logging enabled
- [ ] Session timeout configured
- [ ] IP whitelisting/blacklisting configured
- [ ] Security headers configured
- [ ] Error messages sanitized
- [ ] Input validation implemented
- [ ] SQL injection prevention verified
- [ ] LDAP injection prevention verified
- [ ] XSS prevention verified
- [ ] CSRF protection enabled
- [ ] Password policy enforced
- [ ] MFA enabled (if required)
- [ ] Regular security audits scheduled
- [ ] Incident response plan documented
- [ ] Disaster recovery plan tested
- [ ] Security training completed
- [ ] Vulnerability scanning configured
- [ ] Penetration testing scheduled
- [ ] Compliance requirements verified

### Ongoing Security Tasks

#### Daily
- [ ] Monitor audit logs for anomalies
- [ ] Check failed authentication attempts
- [ ] Review security alerts

#### Weekly
- [ ] Review permission changes
- [ ] Analyze authentication patterns
- [ ] Check for locked accounts
- [ ] Review session statistics

#### Monthly
- [ ] Rotate secrets
- [ ] Review RBAC configurations
- [ ] Audit user permissions
- [ ] Update security documentation
- [ ] Review incident logs

#### Quarterly
- [ ] Security training for team
- [ ] Penetration testing
- [ ] Vulnerability assessment
- [ ] Compliance audit
- [ ] Disaster recovery test

#### Annually
- [ ] Full security audit
- [ ] Update threat model
- [ ] Review and update policies
- [ ] Certifications renewal
- [ ] Third-party security assessment

## Incident Response

### Security Incident Procedure

1. **Detection**
   - Monitor audit logs
   - Security alerts
   - User reports

2. **Containment**
   - Revoke compromised sessions
   - Lock affected accounts
   - Block suspicious IPs
   - Disable compromised integrations

3. **Investigation**
   - Review audit logs
   - Identify scope of breach
   - Document timeline
   - Preserve evidence

4. **Remediation**
   - Rotate all secrets
   - Patch vulnerabilities
   - Update security controls
   - Reset affected passwords

5. **Recovery**
   - Restore from backups if needed
   - Re-enable services
   - Verify security controls
   - Monitor for recurrence

6. **Post-Incident**
   - Document lessons learned
   - Update security procedures
   - Notify affected parties
   - Implement additional controls

## Compliance Considerations

### GDPR Compliance

- Audit logging of all data access
- Right to erasure (delete user data)
- Data portability
- Consent management
- Data encryption at rest and in transit

### SOC 2 Compliance

- Access controls (RBAC)
- Audit logging
- Encryption
- Change management
- Incident response

### HIPAA Compliance

- Access controls
- Audit logs (minimum 6 years retention)
- Encryption
- Authentication
- Session timeout

## Contact

For security issues or questions, contact:
- Security Team: security@n8n.io
- Emergency: security-emergency@n8n.io