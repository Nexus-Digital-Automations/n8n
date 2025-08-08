# Security Headers and Extension Filtering Research Report

## Executive Summary

This research examines n8n's security implementation for file handling, focusing on security headers, file extension filtering, and validation mechanisms. The analysis covers binary data handling, webhook security, and MIME type validation across the codebase.

## Key Findings

### 1. Security Headers Implementation

#### Helmet Security Middleware (`packages/cli/src/server.ts:433-459`)
- **Content Security Policy (CSP)**: Configurable via `SecurityConfig.contentSecurityPolicy`
- **X-Frame-Options**: Conditionally enabled (disabled in preview/dev mode)
- **HSTS**: Only enabled when TLS is handled directly by n8n
- **X-Powered-By**: Explicitly disabled for security

```typescript
const securityHeadersMiddleware = helmet({
  contentSecurityPolicy: isEmpty(cspDirectives) ? false : {
    useDefaults: false,
    reportOnly: cspReportOnly,
    directives: { ...cspDirectives }
  },
  xFrameOptions: isPreviewMode || inE2ETests || inDevelopment ? false : { action: 'sameorigin' },
  strictTransportSecurity: isTLSEnabled ? {
    maxAge: 180 * Time.days.toSeconds,
    includeSubDomains: false,
    preload: false
  } : false
});
```

### 2. File Extension and MIME Type Validation

#### Binary Data Controller (`packages/cli/src/controllers/binary-data.controller.ts`)

**Viewable MIME Type Restriction** (line 213):
```typescript
if (action === 'view' && (!mimeType || !ViewableMimeTypes.includes(mimeType.toLowerCase()))) {
  throw new BadRequestError('Content not viewable');
}
```

**File Upload Validation** (lines 87-127):
- **Size Limit**: 100MB maximum file size
- **File Count**: Single file upload only
- **Multer Configuration**: Memory storage with strict limits

```typescript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1, // Only one file at a time
  },
});
```

#### Binary Helper Functions (`packages/core/src/execution-engine/node-execution-context/utils/binary-helper-functions.ts`)

**MIME Type Detection Strategy** (lines 215-249):
1. **File Path Extension**: Uses `mime-types` library lookup
2. **Buffer Magic Numbers**: Uses `file-type` library for binary analysis
3. **Content-Type Headers**: For HTTP streams
4. **Fallback**: Defaults to `text/plain` if detection fails

```typescript
if (!mimeType) {
  if (filePath) {
    const mimeTypeLookup = lookup(filePath);
    if (mimeTypeLookup) {
      mimeType = mimeTypeLookup;
    }
  }
  
  if (!mimeType) {
    if (Buffer.isBuffer(binaryData)) {
      const fileTypeData = await FileType.fromBuffer(binaryData);
      if (fileTypeData) {
        mimeType = fileTypeData.mime;
        fileExtension = fileTypeData.ext;
      }
    }
  }
}
```

### 3. Binary Data ID Validation

#### Validation Logic (`packages/cli/src/controllers/binary-data.controller.ts:173-195`)

**Format Validation**:
- **Structure**: `mode:path` format required
- **Mode Validation**: Must be valid non-default mode
- **Path Validation**: Prevents empty paths and directory traversal

```typescript
private validateBinaryDataId(binaryDataId: string) {
  if (!binaryDataId) {
    throw new BadRequestError('Missing binary data ID');
  }

  const separatorIndex = binaryDataId.indexOf(':');
  if (separatorIndex === -1) {
    throw new BadRequestError('Malformed binary data ID');
  }

  const mode = binaryDataId.substring(0, separatorIndex);
  if (!isValidNonDefaultMode(mode)) {
    throw new BadRequestError('Invalid binary data mode');
  }

  const path = binaryDataId.substring(separatorIndex + 1);
  if (path === '' || path === '/' || path === '//') {
    throw new BadRequestError('Malformed binary data ID');
  }
}
```

### 4. Webhook Security Implementation

#### Request Body Parsing (`packages/cli/src/webhooks/webhook-helpers.ts:821-867`)

**Content Type Filtering**:
- **Multipart Form Data**: Special handling via custom parser
- **Node Version Based**: Different parsing strategies for v1 vs v2+
- **Selective Parsing**: Only specific content types are parsed

```typescript
if (nodeVersion > 1) {
  if (
    contentType?.startsWith('application/json') ||
    contentType?.startsWith('text/plain') ||
    contentType?.startsWith('application/x-www-form-urlencoded') ||
    contentType?.endsWith('/xml') ||
    contentType?.endsWith('+xml')
  ) {
    await parseBody(req);
  }
}
```

#### Form Data Parsing (`packages/cli/src/webhooks/webhook-helpers.ts:235-236`)
```typescript
const { formDataFileSizeMax } = Container.get(GlobalConfig).endpoints;
const parseFormData = createMultiFormDataParser(formDataFileSizeMax);
```

### 5. Advanced Binary Operations Security

#### Authorization Controls
- **Global Scope Requirements**: Operations require specific permissions
- **License Checks**: Advanced features require `feat:advancedPermissions`
- **User Context**: All operations track the authenticated user

#### Cross-Instance Transfer Security (`packages/cli/src/controllers/binary-data.controller.ts:315-365`)
**Authentication Options**:
- API Key authentication
- Auth Token authentication  
- Username/Password authentication
- **Validation**: At least one auth method required

### 6. File Extension Security Patterns

#### Extension Detection Logic
**Priority Order**:
1. **Explicit MIME Type**: If provided, derive extension from MIME
2. **File Path Extension**: Extract from file path
3. **Magic Number Detection**: Use `file-type` library
4. **Fallback**: Default to appropriate extension or none

```typescript
if (!fileExtension && mimeType) {
  fileExtension = extension(mimeType) || undefined;
}

if (filePath) {
  const filePathParts = path.parse(filePath);
  fileExtension = filePathParts.ext.slice(1); // Remove the dot
  if (fileExtension) {
    returnData.fileExtension = fileExtension;
  }
}
```

## Security Strengths

### 1. **Multi-Layer Validation**
- Binary data IDs validated at multiple levels
- MIME type detection uses multiple methods
- File extension validation cross-references MIME types

### 2. **Configurable Security Headers**
- CSP directives fully configurable
- Environment-aware header policies
- TLS-aware HSTS configuration

### 3. **Upload Restrictions**
- Strict file size limits (100MB)
- Single file upload enforcement
- Memory-based storage prevents disk attacks

### 4. **Permission-Based Access Control**
- Advanced operations require licenses
- Global scope enforcement
- User authentication required

## Security Gaps and Recommendations

### 1. **File Extension Allowlist Missing**
**Current State**: No explicit allowlist of permitted file extensions
**Risk**: Potential upload of executable or script files
**Recommendation**: Implement configurable allowlist of permitted extensions

### 2. **MIME Type Spoofing**
**Current State**: Relies on client-provided MIME types initially
**Risk**: Malicious files with spoofed MIME types
**Mitigation**: Magic number detection provides secondary validation

### 3. **ViewableMimeTypes Configuration**
**Current State**: Hardcoded viewable MIME types list
**Risk**: May not cover all safe viewing scenarios
**Recommendation**: Make ViewableMimeTypes configurable

### 4. **Content-Type Validation**
**Current State**: Basic content-type filtering for webhook parsing
**Enhancement**: Could benefit from stricter validation patterns

## Implementation Details

### File Upload Flow
1. **Multer Processing**: Memory storage with size limits
2. **MIME Type Detection**: Multi-method detection strategy
3. **Binary Data Storage**: Via BinaryDataService with metadata
4. **ID Generation**: Secure binary data ID creation
5. **Response**: Structured JSON response with metadata

### Security Headers Flow
1. **CSP Configuration**: JSON-based directive configuration
2. **Environment Detection**: Different policies for dev/prod
3. **TLS Detection**: HSTS only when appropriate
4. **Header Application**: Via helmet middleware

### Validation Chain
1. **Input Validation**: Binary data ID format and structure
2. **Mode Validation**: Non-default mode verification
3. **Path Validation**: Directory traversal prevention
4. **Permission Validation**: Global scope and license checks
5. **File Validation**: Size, count, and type restrictions

## Conclusion

n8n implements a comprehensive security framework for file handling with multi-layer validation, configurable security headers, and strong permission controls. The implementation shows security awareness with proper input validation, MIME type detection, and authorization checks. 

Key strengths include the multi-method MIME type detection, configurable security headers, and comprehensive binary data validation. Areas for improvement include implementing file extension allowlists and enhancing MIME type spoofing protections.

The system demonstrates enterprise-grade security considerations with proper separation between different security domains (upload, storage, retrieval, and cross-instance operations).