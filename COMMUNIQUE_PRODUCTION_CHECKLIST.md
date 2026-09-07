# Communique Production Wiring Checklist

## Overview
Communique is fully implemented on the backend but requires production environment configuration and frontend UI components to be fully operational.

**Status**: Configuration wired (commit 7a62f6c), awaiting Twilio credentials and frontend components.

---

## Part 1: Configuration Setup ✅ (Code Fixed)

### What Was Fixed
- `TwilioService.cs` now reads from hierarchical config keys (`Communique:Twilio:*`) as set in `.do/app.yaml`
- Falls back to flat env vars (`TWILIO_*`) for local development
- Better logging for initialization status
- Build verified passing

### Environment Variables Required on DigitalOcean

**Step 1**: Obtain Twilio Credentials
- Log into https://www.twilio.com/console
- Find your Account SID and Auth Token
- Set up a Twilio phone number (for SMS/Voice)
- Set up Twilio WhatsApp sandbox or approved number
- Create a Twilio Verify service and note the Service SID

**Step 2**: Add Secrets to DigitalOcean App Platform
Navigate to Apps → Select your app → Settings → Environment Variables

Add these as **Secrets** (not regular env vars):

| Variable Name | Source | Example |
|---|---|---|
| `COMMUNIQUE_TWILIO_ENABLED` | Manual | `true` |
| `TWILIO_ACCOUNT_SID` | Twilio Console | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio Console | `your_auth_token_here` |
| `TWILIO_FROM_NUMBER` | Twilio Purchased Number | `+1234567890` |
| `COMMUNIQUE_TWILIO_WHATSAPP_FROM` | Twilio Setup | `whatsapp:+1234567890` |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify Service | `VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

**Important**: All secrets must be added to App Platform UI, NOT committed to `.do/app.yaml`.

---

## Part 2: Database Migration ⏳ (Code Ready)

### What Exists
Three migrations already implemented:
- `20260906150000_AddCommunicationPreferences.cs` - Preferences table with user FK
- `20260906150001_AddPhoneNumberToUser.cs` - Phone number fields on Users
- `20260906150002_AddNotificationCosts.cs` - Cost tracking for SMS/WhatsApp

### Apply Migrations
Once Twilio is configured and database is accessible:

```bash
# From server directory
cd Wiseravenshare.Server
dotnet ef database update --context AppDbContext --project . --startup-project .
```

Verify tables exist in production:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- Should include: communication_preferences, notification_costs
```

---

## Part 3: Frontend Components ⏸️ (Not Started)

### Verification Modal
Create `wiseravenshare.client/src/Components/PhoneVerificationModal.jsx`

**Features**:
- Phone number input with country code selector
- SMS/WhatsApp channel toggle
- OTP code verification (6 digits)
- Loading states + error messages
- Success confirmation

**API Integration**:
```javascript
// Start verification
POST /api/communique/verify/start
Body: { phoneNumber, channel: 'sms' | 'whatsapp' }

// Check code
POST /api/communique/verify/check
Body: { verificationSid, code }
```

### Communication Preferences Panel
Create `wiseravenshare.client/src/Components/CommunicationPreferences.jsx`

**Features**:
- SMS toggle (enable/disable notifications)
- WhatsApp toggle
- Engagement notification toggle
- Preferred channel selector (radio)
- Saved status indicator

**API Integration**:
```javascript
// Get preferences
GET /api/communique/preferences

// Update preferences
PUT /api/communique/preferences
Body: CommunicationPreferences object
```

### Notification Display Component
Create `wiseravenshare.client/src/Components/NotificationCostOverview.jsx`

**Features**:
- SMS sent count + cost
- WhatsApp sent count + cost
- Total cost this month
- Delivery status pie chart
- Cost trend chart (last 7 days)

**API Integration**:
```javascript
// Get message history
GET /api/communique/messages

// Get cost summary
GET /api/communique/cost-summary
```

### Integration Points
1. Add to User Settings page → "Communication" tab
2. Add to Podcast Studio → Studio Info → "Alert Setup"
3. Add to Engagement Dashboard → New "SMS/WhatsApp Delivery" card

---

## Part 4: Testing ⏸️ (Blocked Until Parts 1-3)

### Manual Testing Checklist
- [ ] User can register with phone number
- [ ] Verification code arrives via SMS within 30 seconds
- [ ] Code validation accepts correct code, rejects invalid
- [ ] SMS notifications preference is saved and persists
- [ ] WhatsApp notifications can be toggled
- [ ] Sending SMS increments cost tracking
- [ ] Cost summary reflects sent messages
- [ ] Message history shows SMS/WhatsApp events

### Automated E2E Test
Create `wiseravenshare.client/src/__tests__/communication.e2e.test.js`

```javascript
describe('Communique SMS/WhatsApp Flow', () => {
  test('Complete verification → save preferences → send notification', async () => {
    // 1. Open verification modal
    // 2. Enter phone number
    // 3. Receive SMS code
    // 4. Submit code
    // 5. Verify success
    // 6. Open preferences
    // 7. Toggle WhatsApp on
    // 8. Verify saved to API
  })
})
```

---

## Part 5: Monitoring & Alerting ⏸️

### Logging
TwilioService logs:
- ✅ Initialization status (credentials found/missing)
- ✅ Send attempts + responses
- TODO: Delivery status callbacks
- TODO: Error categorization (invalid number, rate limit, auth failure)

### Metrics to Track
```
- communique.sms.sent (counter)
- communique.sms.failed (counter)
- communique.whatsapp.sent (counter)
- communique.cost.monthly (gauge)
- communique.verify.success_rate (gauge)
```

### Alerts
- Cost exceeds $50/month
- Delivery success rate < 95%
- Twilio service unavailable
- DB write failures for preferences

---

## Part 6: Cost Projection

### Twilio Pricing (2024)
- SMS outbound: $0.0075 per message (US)
- WhatsApp: $0.0116 per message (US)
- Twilio Verify: $0.01 per verification

### Monthly Cost Estimate (Sample)
- 1,000 SMS notifications → $7.50
- 500 WhatsApp messages → $5.80
- 2,000 verification codes → $20.00
- **Total: ~$33/month**

**Set budget alert at: $100/month**

---

## Deployment Sequence

### Phase 1: Infrastructure (This Week)
1. ✅ TwilioService code fixed to read production config
2. ⏳ Add Twilio secrets to DigitalOcean UI
3. ⏳ Run database migrations
4. ⏳ Test Twilio connectivity (optional test send)

### Phase 2: Frontend (Next Week)
1. ⏸️ Build verification modal
2. ⏸️ Build preferences panel
3. ⏸️ Wire components into settings page
4. ⏸️ Integration testing

### Phase 3: Rollout (Following Week)
1. ⏸️ Enable for admin user (test flow)
2. ⏸️ Gradual rollout to user base
3. ⏸️ Monitor cost/delivery metrics
4. ⏸️ Adjust rate limits if needed

---

## Troubleshooting

### "Twilio is enabled but credentials are missing"
- Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set in DigitalOcean UI
- Verify they're set as Secrets, not regular env vars
- Redeploy after adding secrets
- Check server logs: `doctl apps logs <app-id> --component api`

### "Invalid phone number"
- Ensure +1 country code format (e.g., `+12125551234`)
- Verify number is real and SMS-capable
- Check Twilio account has SMS permissions

### "Verification code not received"
- Check Twilio Verify service SID is correct
- Verify SMS sending is working (test via API)
- Check user phone number is correct
- Twilio may throttle repeated sends to same number

### Database migration fails
- Verify connection string: `${wiseravenshare-db.DATABASE_URL}`
- Check database user has DDL permissions
- Review migration SQL for syntax errors
- Run migrations locally first to debug

---

## Next Steps

1. **Today**: Obtain Twilio credentials
2. **Today**: Add secrets to DigitalOcean UI (ask team for access)
3. **Tomorrow**: Deploy and verify server can connect
4. **This week**: Build frontend components
5. **Next week**: Full integration testing
6. **Following week**: Production rollout

For questions or blockers, check the backend services in `Wiseravenshare.Server/Services/Communication/` or review `TWILIO_INTEGRATION_GUIDE.md`.
