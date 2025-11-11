# WhatsApp Messaging Troubleshooting Guide

## 🚨 Current Issues Identified

Based on your error logs, the following issues are preventing messages from being delivered:

### 1. **EXPIRED ACCESS TOKEN** (CRITICAL - Error 190)

**Error Message:**
```
Error validating access token: Session has expired on Saturday, 08-Nov-25 23:00:00 PST
```

**Root Cause:** Your WhatsApp Business API access token has expired.

**Solution:**

#### Option A: Generate a Permanent System User Token (RECOMMENDED)

1. Go to [Meta Business Settings](https://business.facebook.com/settings)
2. Navigate to **System Users** (under Users section)
3. Click **Add** or select an existing system user
4. Click **Generate New Token**
5. Select your WhatsApp Business App
6. Grant the following permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
7. Click **Generate Token**
8. **Save this token** - it won't be shown again!
9. Update your `.env` file:
   ```bash
   WA_TOKEN=your_new_permanent_token_here
   ```

#### Option B: Temporary User Access Token (NOT RECOMMENDED - expires in 24-90 days)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your app → WhatsApp → API Setup
3. Copy the temporary access token (valid for 24 hours to 90 days)
4. Update your `.env` file

**After updating the token, restart your server:**
```bash
npm run dev
```

---

### 2. **TEMPLATE DOES NOT EXIST** (Error 132001)

**Error Message:**
```
(#132001) Template name does not exist in the translation
template name (guest_invite_id_request) does not exist in en_US
```

**Root Cause:** The template `guest_invite_id_request` doesn't exist or isn't approved in your WhatsApp Business Account.

**Solution:**

1. Go to [WhatsApp Manager](https://business.facebook.com/) → Message Templates
2. Check if `guest_invite_id_request` exists
3. Verify the exact template name (case-sensitive!)
4. If it doesn't exist, create and submit it for approval

**Template Structure for `guest_invite_id_request`:**
```
Category: UTILITY
Language: English (US)

Header: {{1}} (parameter for name)
Body: Your message body with {{1}} for event name
Button: URL button with dynamic parameter for participant ID
```

**Alternative:** Update your code to use an existing approved template name.

---

### 3. **MISSING OR INCORRECT PARAMETERS** (Error 131008, 132000)

**Error Messages:**
```
(#131008) Required parameter is missing
buttons: Button at index 0 of type Url requires a parameter

(#132000) Number of parameters does not match the expected number of params
body: number of localizable_params (2) does not match the expected number of params (1)
```

**Root Cause:** The parameters sent in your API request don't match the template definition.

**Solution:**

1. Check your template definition in WhatsApp Manager
2. Count the number of `{{1}}`, `{{2}}`, etc. placeholders
3. Ensure your code sends exactly that many parameters
4. For button parameters, ensure the `index` matches the button position (0-indexed)

**Example Fix:**
```typescript
// If your template has 1 body parameter and 1 button parameter:
components: [
  {
    type: 'header',
    parameters: [{ type: 'text', text: participantName }],
  },
  {
    type: 'body',
    parameters: [{ type: 'text', text: eventName }],
  },
  {
    type: 'button',
    sub_type: 'url',
    index: '0', // First button (0-indexed)
    parameters: [{ type: 'text', text: participantId }],
  },
],
```

---

### 4. **PHONE NUMBER FORMAT ISSUES**

**Root Cause:** WhatsApp API requires phone numbers in E.164 format: `+{country_code}{number}`

**Fixed in your code now:**
- Automatically adds `+91` (India) prefix if missing
- Validates minimum length (12 characters for India: +91 + 10 digits)

**Manual Check:**
Ensure phone numbers in your database are stored in one of these formats:
- `+919123456789` ✅
- `919123456789` ✅ (code will add +)
- `9123456789` ✅ (code will add +91)
- `91-9123456789` ❌ (will be normalized by code)

---

### 5. **RATE LIMITING**

**Current Implementation:**
- 1.5 second delay between messages
- Retry with exponential backoff (3 attempts)
- Rate limit detection for errors 80007, 80008, 80009

**WhatsApp API Rate Limits:**
- **Messaging Tier 1**: 1,000 messages per 24 hours (default)
- **Messaging Tier 2**: 10,000 messages per 24 hours
- **Messaging Tier 3**: 100,000 messages per 24 hours

**Check your tier:**
1. Go to [WhatsApp Manager](https://business.facebook.com/)
2. Select your phone number → Insights → Quality Rating
3. Your messaging tier is displayed there

**If you're hitting rate limits:**
- Increase delay between messages: Change `1500` to `2000` or `3000` in `event-participants.service.ts` (line 362)
- Request a tier upgrade from Meta

---

## 🔧 Quick Fixes Applied

The following fixes have been applied to your code:

### 1. Fixed `isProcessed` flag
**File:** `src/modules/whatsapp/whatsapp.service.ts` (line 629)
```typescript
// Changed from:
false, // Was: true

// To:
false, // Message not yet processed
```

### 2. Improved phone number handling
**File:** `src/modules/event-participants/event-participants.service.ts`
- Automatically adds `+91` country code if missing
- Better validation (minimum 12 characters for Indian numbers)
- Applied to both reminder messages and booking confirmations

---

## 🧪 Testing Your Configuration

### Test 1: Verify Access Token

```bash
curl -X GET "https://graph.facebook.com/v22.0/${WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating" \
  -H "Authorization: Bearer ${WA_TOKEN}"
```

**Expected Response:**
```json
{
  "display_phone_number": "+1234567890",
  "verified_name": "Your Business Name",
  "quality_rating": "GREEN",
  "id": "your_phone_number_id"
}
```

**If you get error 190:** Your token is expired/invalid. Follow "Solution 1" above.

### Test 2: List Available Templates

```bash
curl -X GET "https://graph.facebook.com/v22.0/${WA_BUSINESS_ACCOUNT_ID}/message_templates" \
  -H "Authorization: Bearer ${WA_TOKEN}"
```

This will show all your approved templates. Verify `guest_invite_id_request` is in the list.

### Test 3: Send Test Message

Use your WhatsApp controller endpoint:
```bash
curl -X POST "http://localhost:3000/api/v2/whatsapp/send-template" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+919123456789",
    "template": {
      "name": "guest_invite_id_request",
      "language": { "code": "en" },
      "components": [
        {
          "type": "header",
          "parameters": [{ "type": "text", "text": "Test Name" }]
        },
        {
          "type": "body",
          "parameters": [{ "type": "text", "text": "Test Event" }]
        },
        {
          "type": "button",
          "sub_type": "url",
          "index": "0",
          "parameters": [{ "type": "text", "text": "test-id-123" }]
        }
      ]
    }
  }'
```

---

## 📊 Monitoring Logs

### View Real-time Logs
```bash
# Combined logs (info + errors)
tail -f logs/combined.log

# Error logs only
tail -f logs/error.log

# Filter for WhatsApp errors
tail -f logs/error.log | grep -i whatsapp
```

### Check Message Sending Summary
After sending messages, check the logs for the JSON summary:
```bash
grep "MESSAGE SENDING SUMMARY" logs/combined.log -A 50
```

---

## 🔐 Environment Variables Checklist

Ensure these are set in your `.env` file:

```bash
# Required
WA_TOKEN=your_system_user_token_here
WA_PHONE_NUMBER_ID=your_phone_number_id
WA_BUSINESS_ACCOUNT_ID=your_whatsapp_business_account_id

# Optional (defaults shown)
WA_API_BASE=https://graph.facebook.com
WA_API_VERSION=v22.0
WA_WEBHOOK_VERIFY_TOKEN=miosync_webhook_verify_token
```

---

## 🆘 Still Having Issues?

### Check Meta Status
https://metastatus.com/ - Check if WhatsApp Business API is experiencing issues

### Review WhatsApp Business API Documentation
https://developers.facebook.com/docs/whatsapp/cloud-api

### Common Issues:

1. **"Invalid phone number" errors**
   - Phone numbers must be registered WhatsApp users
   - Cannot send to landlines
   - Number must be in E.164 format

2. **"User cannot be sender" errors**
   - User hasn't opted in to receive messages
   - User blocked your business number

3. **"Template rejected" errors**
   - Template violates WhatsApp policies
   - Resubmit with policy-compliant content

4. **"Quality rating: RED"**
   - Too many users blocking/reporting your messages
   - Reduce message frequency
   - Improve message quality/relevance

---

## 📈 Best Practices

1. **Always use System User Tokens** for production (never expire)
2. **Test templates thoroughly** before sending to all users
3. **Monitor quality rating** regularly
4. **Implement proper error handling** (already done in your code)
5. **Respect user opt-outs** (add opt-out handling)
6. **Keep delay between messages** to avoid rate limits
7. **Store message IDs** for tracking delivery status (already implemented)

---

## 🔄 Recent Changes Made

1. ✅ Fixed `isProcessed` flag initialization (was `true`, now `false`)
2. ✅ Added automatic country code addition (+91 for India)
3. ✅ Improved phone number validation
4. ✅ Better error logging with specific WhatsApp error codes

**Next Steps:**
1. 🔴 **UPDATE YOUR ACCESS TOKEN** (most critical!)
2. 🟡 Verify template exists and is approved
3. 🟡 Ensure template parameters match
4. 🟢 Restart your server and test

---

Generated on: 2025-11-11

