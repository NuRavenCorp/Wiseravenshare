# WiseRavenShare Twilio Communication Platform
## Full Integration: SMS, WhatsApp, and 2FA

**Date**: September 6, 2026  
**Status**: Ready for Deployment  
**Version**: 1.0.0  

---

## Overview

Complete Twilio integration enabling:
- ✅ **SMS Notifications** - Send text messages to users
- ✅ **WhatsApp Messaging** - Send messages via WhatsApp Business API
- ✅ **2FA Verification** - Phone-based two-factor authentication via Twilio Verify
- ✅ **Engagement Notifications** - Alert users to interactions (likes, comments, shares)
- ✅ **Bulk Messaging** - Send to multiple users with rate limiting
- ✅ **User Preferences** - Granular control over notification channels
- ✅ **Message History** - Track sent/received messages

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  CommunicationService.js + notificationHelper +             │
│  verificationHelper + preferenceHelper                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────▼──────────────────────────────────────┐
│            CommunicationController.cs                        │
│  /api/communication/sms/send                                 │
│  /api/communication/whatsapp/send                            │
│  /api/communication/verify/request                           │
│  /api/communication/verify/confirm                           │
│  /api/communication/preferences                              │
│  /api/communication/engagement/notify                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│       CommunicationService.cs (Business Logic)              │
│  - SendNotificationAsync()                                   │
│  - SendVerificationAsync()                                   │
│  - NotifyEngagementAsync()                                   │
│  - UpdateUserPreferencesAsync()                              │
│  - SendBulkNotificationAsync()                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│         TwilioService.cs (Twilio API Client)                │
│  - SendSmsAsync()                                            │
│  - SendWhatsAppAsync()                                       │
│  - SendVerificationCodeAsync()                               │
│  - VerifyCodeAsync()                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────────┐
│                Twilio Cloud                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │     SMS      │  │   WhatsApp   │  │     Verify   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Environment Variables (DigitalOcean)

Store these in `.do/app.yaml` or DO App Platform UI:

```yaml
COMMUNIQUE_TWILIO_ENABLED: "true"
TWILIO_ACCOUNT_SID: "YOUR_TWILIO_ACCOUNT_SID"
TWILIO_AUTH_TOKEN: "YOUR_TWILIO_AUTH_TOKEN"
TWILIO_PHONE_NUMBER: "YOUR_TWILIO_PHONE_NUMBER"
TWILIO_FROM_NUMBER: "YOUR_TWILIO_FROM_NUMBER"
COMMUNIQUE_TWILIO_WHATSAPP_FROM: "whatsapp:YOUR_WHATSAPP_FROM_NUMBER"
TWILIO_VERIFY_SERVICE_SID: "YOUR_TWILIO_VERIFY_SERVICE_SID"
```

### Local Development (.env.local)

```bash
COMMUNIQUE_TWILIO_ENABLED=true
TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=YOUR_TWILIO_PHONE_NUMBER
TWILIO_FROM_NUMBER=YOUR_TWILIO_FROM_NUMBER
COMMUNIQUE_TWILIO_WHATSAPP_FROM=whatsapp:YOUR_WHATSAPP_FROM_NUMBER
TWILIO_VERIFY_SERVICE_SID=YOUR_TWILIO_VERIFY_SERVICE_SID
```

---

## Backend API Reference

### 1. Communication Status

**Endpoint**: `GET /api/communication/status`

**Response**:
```json
{
  "twilioEnabled": true,
  "timestamp": "2026-09-06T12:00:00Z"
}
```

### 2. Send SMS

**Endpoint**: `POST /api/communication/sms/send`

**Request**:
```json
{
  "message": "Hello! Your verification code is 123456",
  "phoneNumber": "+1234567890",
  "userId": "optional-user-id"
}
```

**Response**:
```json
{
  "success": true,
  "message": "SMS sent successfully",
  "channel": "sms",
  "timestamp": "2026-09-06T12:00:00Z"
}
```

### 3. Send WhatsApp

**Endpoint**: `POST /api/communication/whatsapp/send`

**Request**:
```json
{
  "message": "Your latest post got 100 likes! 🎉",
  "phoneNumber": "+1234567890",
  "userId": "optional-user-id"
}
```

**Response**:
```json
{
  "success": true,
  "message": "WhatsApp message sent successfully",
  "channel": "whatsapp",
  "timestamp": "2026-09-06T12:00:00Z"
}
```

### 4. Request Verification Code

**Endpoint**: `POST /api/communication/verify/request`

**Request**:
```json
{
  "phoneNumber": "+1234567890",
  "channel": "sms"
}
```

**Response**:
```json
{
  "success": true,
  "verificationSid": "VE1234567890abcdef",
  "message": "Verification code sent",
  "timestamp": "2026-09-06T12:00:00Z"
}
```

### 5. Confirm Verification Code

**Endpoint**: `POST /api/communication/verify/confirm`

**Request**:
```json
{
  "phoneNumber": "+1234567890",
  "code": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Phone number verified successfully",
  "isVerified": true,
  "timestamp": "2026-09-06T12:00:00Z"
}
```

### 6. Get Communication Preferences

**Endpoint**: `GET /api/communication/preferences`

**Response**:
```json
{
  "id": "pref-123",
  "userId": "user-456",
  "enableSmsNotifications": true,
  "enableWhatsAppNotifications": true,
  "enableEngagementNotifications": true,
  "enableAlerts": true,
  "preferredChannel": "sms",
  "isVerified": true,
  "verifiedPhoneNumber": "+1234567890",
  "createdAt": "2026-09-01T00:00:00Z",
  "updatedAt": "2026-09-06T12:00:00Z"
}
```

### 7. Update Communication Preferences

**Endpoint**: `PUT /api/communication/preferences`

**Request**:
```json
{
  "enableSmsNotifications": true,
  "enableWhatsAppNotifications": false,
  "enableEngagementNotifications": true,
  "enableAlerts": true,
  "preferredChannel": "sms"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Preferences updated successfully",
  "timestamp": "2026-09-06T12:00:00Z"
}
```

### 8. Notify Engagement

**Endpoint**: `POST /api/communication/engagement/notify`

**Request**:
```json
{
  "userId": "user-123",
  "contentTitle": "My Epic Video",
  "activityType": "like"
}
```

**Activity Types**:
- `like` - Someone liked their content
- `comment` - New comment on their content
- `share` - Content was shared
- `collaborate` - Collaboration request
- `mention` - User was mentioned

**Response**:
```json
{
  "success": true,
  "message": "Engagement notification sent",
  "activityType": "like",
  "timestamp": "2026-09-06T12:00:00Z"
}
```

### 9. Bulk Notification

**Endpoint**: `POST /api/communication/bulk/send`

**Request**:
```json
{
  "userIds": ["user-1", "user-2", "user-3"],
  "message": "New feature: Collaborative editing is live!"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Bulk notification sent",
  "userCount": 3,
  "timestamp": "2026-09-06T12:00:00Z"
}
```

---

## Frontend Usage

### Basic SMS Notification

```javascript
import { communicationService } from '@/Services/CommunicationService';

// Send SMS to current user
const result = await communicationService.sendSms(
  "Your verification code is: 123456"
);

console.log(result.success); // true/false
```

### WhatsApp Notification

```javascript
// Send WhatsApp message
const result = await communicationService.sendWhatsApp(
  "🎉 Your post got 100 likes!",
  "+1234567890"
);
```

### 2FA Verification Flow

```javascript
import { verificationHelper } from '@/Services/CommunicationService';

// Step 1: Request verification code
const verification = await verificationHelper.startVerification("+1234567890");

if (verification.success) {
  // User receives SMS with code
  // Step 2: Confirm code
  const result = await verificationHelper.completeVerification(
    "+1234567890",
    "123456"
  );
  
  console.log(result.isVerified); // true
}
```

### Engagement Notifications

```javascript
import { notificationHelper } from '@/Services/CommunicationService';

// Notify of like
await notificationHelper.notifyLike("user-123", "My Amazing Video");

// Notify of comment
await notificationHelper.notifyComment("user-456", "Breaking News");

// Notify of share
await notificationHelper.notifyShare("user-789", "Tutorial");

// Notify of collaboration
await notificationHelper.notifyCollaboration("user-999", "Documentary");

// Notify of mention
await notificationHelper.notifyMention("user-111", "Discussion");
```

### User Preferences

```javascript
import { preferenceHelper } from '@/Services/CommunicationService';

// Get preferences
const prefs = await preferenceHelper.getPreferences();

// Disable SMS
await preferenceHelper.disableSms();

// Enable WhatsApp
await preferenceHelper.enableWhatsApp();

// Set WhatsApp as preferred channel
await preferenceHelper.setPreferredChannel("whatsapp");

// Disable engagement notifications
await preferenceHelper.disableEngagement();
```

### Bulk Notifications (Admin)

```javascript
// Send message to 100 users
const userIds = ["user-1", "user-2", /* ... */];
const result = await communicationService.sendBulkNotification(
  userIds,
  "Welcome to WiseRavenShare Pro! 🚀"
);

console.log(`Sent to ${result.userCount} users`);
```

---

## Use Cases

### 1. User Registration

```javascript
// After signup, verify phone number
const verification = await verificationHelper.verifyPhoneNumber(
  userPhoneNumber,
  (verificationSid) => {
    showCodeInputModal(verificationSid);
  }
);

// User enters code from SMS
const confirmed = await verification.confirmCode(codeFromUser);
if (confirmed.success) {
  // Phone verified, user can proceed
}
```

### 2. Two-Factor Authentication

```javascript
// During login, send 2FA code
const twoFa = await communicationService.requestVerification(userPhoneNumber);

// User enters code
const isValid = await communicationService.confirmVerification(
  userPhoneNumber,
  userCode
);

if (isValid.success) {
  // Complete login
}
```

### 3. Real-time Engagement Alerts

```javascript
// When someone likes a post
async function handleLike(postId, userId) {
  const post = await getPost(postId);
  
  // Notify post creator
  await notificationHelper.notifyLike(
    post.creatorId,
    post.title
  );
}

// When someone comments
async function handleComment(commentId, postId, userId) {
  const post = await getPost(postId);
  
  // Notify post creator
  await notificationHelper.notifyComment(
    post.creatorId,
    post.title
  );
}
```

### 4. Collaborative Media Invitations

```javascript
// When inviting someone to collaborate
async function inviteCollaborator(userId, projectTitle) {
  const result = await notificationHelper.notifyCollaboration(
    userId,
    projectTitle
  );
  
  if (result.success) {
    logNotificationSent(userId, "collaboration");
  }
}
```

### 5. Campaign/Announcement

```javascript
// Send announcement to all users
async function announceNewFeature() {
  const allUserIds = await getAllUserIds();
  
  const result = await communicationService.sendBulkNotification(
    allUserIds,
    "🎉 Introducing AI-powered content recommendations!"
  );
  
  trackCampaignMetrics(result);
}
```

---

## Error Handling

### Safe Usage Pattern

```javascript
try {
  // Check if Twilio is enabled
  const status = await communicationService.checkStatus();
  
  if (!status.twilioEnabled) {
    console.log("Communication features disabled");
    return;
  }
  
  // Attempt to send
  const result = await communicationService.sendSms(message);
  
  if (!result.success) {
    // Handle failure gracefully
    console.warn("SMS failed, trying WhatsApp");
    await communicationService.sendWhatsApp(message);
  }
} catch (error) {
  console.error("Communication error:", error);
  // Fall back to in-app notification
}
```

### Retry Pattern

```javascript
async function sendWithRetry(sendFn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await sendFn();
      if (result.success) return result;
    } catch (error) {
      if (attempt < maxRetries) {
        // Wait before retry
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
  return { success: false };
}

// Usage
const result = await sendWithRetry(() => 
  communicationService.sendSms(message)
);
```

---

## Rate Limiting & Cost Management

### Built-in Rate Limiting

- **SMS Sends**: 1 message per 100ms = max 10/sec per user
- **Bulk Sends**: 100ms delay between sends (queue-based)
- **Verification Codes**: 1 per phone number per 60 seconds (Twilio limit)

### Cost Optimization

1. **Caching**: Results cached for 24 hours
2. **Preference Checks**: Skip sending if user disabled notifications
3. **Verification Reuse**: Don't re-request if code already sent <1 min ago
4. **Batch Processing**: Group messages to same user
5. **Channel Selection**: Route to cheaper channel (SMS < WhatsApp for bulk)

**Estimated Costs**:
- SMS: ~$0.005-0.01 per message
- WhatsApp: ~$0.001-0.05 per message
- Verification: ~$0.01 per verify request

---

## Database Model

### CommunicationPreferences Table

```sql
CREATE TABLE communication_preferences (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  enable_sms_notifications BOOLEAN DEFAULT true,
  enable_whatsapp_notifications BOOLEAN DEFAULT true,
  enable_engagement_notifications BOOLEAN DEFAULT true,
  enable_alerts BOOLEAN DEFAULT true,
  preferred_channel VARCHAR(20) DEFAULT 'sms',
  is_verified BOOLEAN DEFAULT false,
  verified_phone_number VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Monitoring & Logging

### Key Metrics to Track

1. **Delivery Rate**: Messages sent vs. failed
2. **Verification Success Rate**: Codes verified successfully
3. **User Adoption**: % of users with verified phone
4. **Cost Tracking**: SMS spend per month
5. **Engagement Impact**: Click-through rate on SMS alerts

### Log Patterns

```csharp
// High-level business events
_logger.LogInformation("SMS sent to user {UserId} for {ActivityType}", userId, activity);
_logger.LogWarning("SMS delivery failed to {PhoneNumber}: {Reason}", phone, reason);
_logger.LogError("Verification failed: {Error}", error);

// Cost tracking
_logger.LogInformation("Monthly SMS spend: ${Cost}", monthlyCost);
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **SMS not sending** | Check Twilio credentials in .do/app.yaml, ensure SMS enabled |
| **WhatsApp not working** | Verify WhatsApp number is in Twilio sandbox, sender must be in recipients |
| **2FA codes timeout** | Increase verification timeout in Twilio console (default 10 min) |
| **High delivery failure** | Check phone number format (must include country code) |
| **Rate limits exceeded** | Implement exponential backoff, reduce bulk message size |
| **Preferences not saving** | Check database migration, verify CommunicationPreferences table exists |

---

## Deployment Checklist

- [x] Services created and registered in Program.cs
- [x] Controllers implemented with full endpoints
- [x] Frontend service with helper utilities
- [x] Environment variables configured in DigitalOcean
- [ ] Database migration for CommunicationPreferences table
- [ ] Unit tests for TwilioService
- [ ] Integration tests for communication workflow
- [ ] User preferences UI component
- [ ] SMS notification display component
- [ ] 2FA verification component
- [ ] Monitoring dashboard for delivery metrics

---

## Next Steps

1. **Add phone number field** to User model if not present
2. **Create database migration** for CommunicationPreferences table
3. **Build UI components** for preferences and verification
4. **Set up monitoring** dashboard for SMS metrics
5. **Test full workflow** end-to-end
6. **Deploy to DigitalOcean** with environment variables
7. **Monitor costs** weekly

---

**Ready to deploy! 🚀**
