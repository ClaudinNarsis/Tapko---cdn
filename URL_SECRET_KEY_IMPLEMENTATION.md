# URL Secret Key Implementation

## Overview

The Tapko widget now supports URL secret key verification for enhanced security. This feature allows you to restrict widget initialization to only URLs that contain a valid secret key parameter.

## How It Works

The widget checks the API response from `GET /project` for a `security` object and validates based on these rules:

### Edge Cases Handled

1. **No security object** → Widget initializes ✅
2. **`is_url_secret_enabled: false`** → Widget initializes ✅
3. **`is_url_secret_enabled: true` + Missing URL parameter** → Widget does NOT initialize ❌
4. **`is_url_secret_enabled: true` + Invalid URL parameter** → Widget does NOT initialize ❌
5. **`is_url_secret_enabled: true` + Valid URL parameter** → Widget initializes ✅

## API Response Format

```json
{
  "success": true,
  "message": "Project retrieved successfully",
  "status": {
    "exists": true,
    "isCollectingFeedback": true
  },
  "data": {
    "projectId": "b0693ad4-c6d5-42d7-80f1-05a2b677a6f6",
    "projectName": "Sample site",
    "security": {
      "is_url_secret_enabled": true,
      "url_secret_key": "rvBZfv52wRLA"
    }
  }
}
```

## URL Parameter

When `is_url_secret_enabled: true`, add the URL parameter:

```
https://yoursite.com?tapko_url_secret_key=rvBZfv52wRLA
```

## Detailed Console Logs

The implementation provides comprehensive console logging for all security checks:

### Scenario 1: No Security Object

```
[Tapko Security] Starting URL secret key verification...
[Tapko Security] Project data security object: undefined
[Tapko Security] ✓ No security object found in API response - initialization allowed
[Tapko Security] Security verification complete - proceeding with initialization
```

### Scenario 2: Security Disabled

```
[Tapko Security] Starting URL secret key verification...
[Tapko Security] Project data security object: { is_url_secret_enabled: false, url_secret_key: "..." }
[Tapko Security] Security object found: {
  is_url_secret_enabled: false,
  url_secret_key_length: 12,
  url_secret_key_preview: "rvBZ..."
}
[Tapko Security] ✓ URL secret key protection is DISABLED - initialization allowed
[Tapko Security] Security verification complete - proceeding with initialization
```

### Scenario 3: Security Enabled - Missing URL Parameter ❌

```
[Tapko Security] Starting URL secret key verification...
[Tapko Security] Project data security object: { is_url_secret_enabled: true, url_secret_key: "rvBZfv52wRLA" }
[Tapko Security] Security object found: {
  is_url_secret_enabled: true,
  url_secret_key_length: 12,
  url_secret_key_preview: "rvBZ..."
}
[Tapko Security] URL secret key protection is ENABLED
[Tapko Security] URL parameter "tapko_url_secret_key": NOT PROVIDED
[Tapko Security] ✗ FAILED: URL secret key is required but missing from URL parameters
[Tapko Security] Expected URL format: ?tapko_url_secret_key=YOUR_SECRET_KEY
[Tapko] Auto-init failed: Error: [Tapko] URL secret key is required but not provided in URL parameters.
```

**Error Event Dispatched:**
```javascript
{
  message: '[Tapko] URL secret key is required but not provided in URL parameters.',
  type: 'URL_SECRET_KEY_MISSING',
  validation: { /* API response */ }
}
```

### Scenario 4: Security Enabled - Invalid URL Parameter ❌

```
[Tapko Security] Starting URL secret key verification...
[Tapko Security] Project data security object: { is_url_secret_enabled: true, url_secret_key: "rvBZfv52wRLA" }
[Tapko Security] Security object found: {
  is_url_secret_enabled: true,
  url_secret_key_length: 12,
  url_secret_key_preview: "rvBZ..."
}
[Tapko Security] URL secret key protection is ENABLED
[Tapko Security] URL parameter "tapko_url_secret_key": wrongkey
[Tapko Security] Comparing keys...
[Tapko Security] - Provided key: wrongkey
[Tapko Security] - Expected key: rvBZfv52wRLA
[Tapko Security] - Keys match: false
[Tapko Security] ✗ FAILED: URL secret key does not match expected value
[Tapko Security] Provided: wrongkey
[Tapko Security] Expected: rvBZfv52wRLA
[Tapko] Auto-init failed: Error: [Tapko] Invalid URL secret key.
```

**Error Event Dispatched:**
```javascript
{
  message: '[Tapko] Invalid URL secret key.',
  type: 'URL_SECRET_KEY_INVALID',
  validation: { /* API response */ }
}
```

### Scenario 5: Security Enabled - Valid URL Parameter ✅

```
[Tapko Security] Starting URL secret key verification...
[Tapko Security] Project data security object: { is_url_secret_enabled: true, url_secret_key: "rvBZfv52wRLA" }
[Tapko Security] Security object found: {
  is_url_secret_enabled: true,
  url_secret_key_length: 12,
  url_secret_key_preview: "rvBZ..."
}
[Tapko Security] URL secret key protection is ENABLED
[Tapko Security] URL parameter "tapko_url_secret_key": rvBZfv52wRLA
[Tapko Security] Comparing keys...
[Tapko Security] - Provided key: rvBZfv52wRLA
[Tapko Security] - Expected key: rvBZfv52wRLA
[Tapko Security] - Keys match: true
[Tapko Security] ✓ SUCCESS: URL secret key verified successfully
[Tapko Security] Security verification complete - proceeding with initialization
[Tapko] Widget initialized successfully
```

## Implementation Details

### Files Modified

1. **`src/utils/dom.js`** - Added `getUrlParam()` utility function
2. **`src/index.js`** - Added security verification logic in `init()` method

### Code Location

The verification logic is in [src/index.js:186-259](src/index.js#L186-L259)

### Error Events

The widget dispatches custom events when security validation fails:

```javascript
// Listen for security errors
window.addEventListener('tapko:error', (event) => {
  console.log('Error type:', event.detail.type);
  console.log('Error message:', event.detail.message);
});

// Error types:
// - URL_SECRET_KEY_MISSING
// - URL_SECRET_KEY_INVALID
```

## Testing

Use the test page to verify all scenarios:

```bash
# Open test page
open examples/url-secret-test.html

# Test with valid key
open examples/url-secret-test.html?tapko_url_secret_key=rvBZfv52wRLA

# Test with invalid key
open examples/url-secret-test.html?tapko_url_secret_key=wrongkey
```

## Security Benefits

- **URL-based access control**: Only users with the correct URL can initialize the widget
- **Prevent unauthorized access**: Protect against widget initialization on unauthorized domains
- **Flexible security**: Can be enabled/disabled per project via API
- **Detailed logging**: Complete visibility into security checks for debugging

## Best Practices

1. **Keep the secret key secure**: Don't commit it to public repositories
2. **Use HTTPS**: Always serve your site over HTTPS when using secret keys
3. **Rotate keys regularly**: Change the secret key periodically for enhanced security
4. **Monitor logs**: Check console logs to verify security is working as expected
