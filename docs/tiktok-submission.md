# TikTok for Developers — App Submission Details

Use this document when filling in the TikTok for Developers portal (resubmission). Copy the fields verbatim.

## App Name
**Wiseravenshare**

## Category
Social / Communication

## App Description
Wiseravenshare is a truth-powered social platform that combines a social feed,
real-time fact checking, and a creator video studio. Users share posts, verify
claims with the Truth Seeker engine, publish video content with Ravensight
Studio, and cross-post their work to their connected social accounts — including
TikTok. TikTok Login is used only to verify a user's identity when linking their
TikTok account for cross-posting and profile attribution. We do not post,
upload, or delete anything on TikTok without an explicit action by the user.

## Scopes Requested
| Scope | Justification |
|---|---|
| `user.info.basic` | Retrieve `open_id`, `union_id`, and `avatar_url` to identify the connected TikTok account and display the user's avatar on their linked-profile screen. No other fields are requested or used. |

## Data Usage & Storage
- We store only: `open_id`, `union_id`, `avatar_url`, and the timestamp the account was linked.
- We do NOT collect TikTok videos, likes, followers, comments, or any other TikTok content.
- Access tokens are stored encrypted at rest and used only to confirm the linked account identity.
- Data is never shared with third parties or used for advertising.
- Unlinking the TikTok account (or deleting the Wiseravenshare account) deletes all stored TikTok identifiers immediately.

## Redirect URI (must match portal exactly)
https://wiseravenshare.com/api/auth/callback/tiktok

## Website URL
https://wiseravenshare.com

## Terms of Service
https://wiseravenshare.com/terms

## Privacy Policy
https://wiseravenshare.com/privacy

## App Icon
Upload: `wiseravenshare.client/public/icons/tiktok-app-icon-1024.png`
(1024x1024, square, opaque background, no transparency — meets TikTok icon requirements)

## Tester Account
Provide a registered Wiseravenshare account (email + password) so TikTok review
can sign in and walk the "Connect TikTok" flow end to end.
