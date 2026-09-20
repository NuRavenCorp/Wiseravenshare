# DigitalOcean Functions (Wiseravenshare)

This folder contains three sample DigitalOcean Functions copied into the repository:

- qrcode
- sendgrid-email
- twilio-sms

## Why WSL is used

On this Windows machine, `doctl serverless install` fails with a symlink privilege error.
Deploying through WSL avoids that blocker.

## One-time activation

1. Authenticate doctl in WSL (manual token entry in terminal):

   wsl bash -lc 'doctl auth init'

2. Activate serverless in WSL:

   powershell -ExecutionPolicy Bypass -File scripts/activate-do-functions-wsl.ps1

## Deploy all functions

powershell -ExecutionPolicy Bypass -File scripts/deploy-do-functions-wsl.ps1 -SkipInvoke

## Function names and invoke parameters

- QR code: qr/qr
  - text (required)
  - img (optional)

- SendGrid email: sample/emails
  - from (required)
  - to (required)
  - subject (required)
  - content (required)
  - environment variable: API_KEY

- Twilio SMS: sample/sms
  - from (required)
  - number (required)
  - message (required)
  - environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN

## Set function environment variables

Set env vars for each project before deploy by editing project.yml values or setting shell env vars in WSL session.

Examples:

- sendgrid-email/project.yml uses API_KEY
- twilio-sms/project.yml uses TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN

## Smoke test examples

wsl bash -lc "doctl serverless functions invoke qr/qr -p text:'Join WiseRavenshare Podcast'"
wsl bash -lc "doctl serverless functions invoke sample/emails -p from:'sender@example.com' to:'receiver@example.com' subject:'Invite' content:'Join now'"
wsl bash -lc "doctl serverless functions invoke sample/sms -p from:'+15555550100' number:'+15555550101' message:'Join now'"
