# GitHub App Setup Guide

This project uses **GitHub App** for authentication, which provides better security and more fine-grained permissions compared to OAuth Apps.

## Why GitHub App?

- **Fine-grained permissions**: Request only the permissions you need
- **Better security**: Separate user authentication from app installation
- **Modern approach**: Recommended by GitHub for new applications
- **Flexible**: Support both user authentication and app-level operations

## Creating a GitHub App

### 1. Navigate to GitHub App Settings

Go to [GitHub Developer Settings](https://github.com/settings/apps) and click **New GitHub App**.

### 2. Fill in Basic Information

- **GitHub App name**: Your app name (e.g., "Project Dashboard Dev")
- **Homepage URL**: `http://localhost:5173` (for development)
- **Callback URL**: `http://localhost:5173/callback`
- **Webhook**: Uncheck "Active" (unless you need webhooks)

### 3. Configure Permissions

Under **Repository permissions**, select:

- **Contents**: Read-only (to read repository data)
- **Metadata**: Read-only (required, automatically enabled)
- **Commit statuses**: Read-only (for commit statistics)

Under **Account permissions**, select:

- **Email addresses**: Read-only (to get user email)

### 4. Where can this GitHub App be installed?

Choose:

- **Any account** (allows any user to authenticate)

### 5. Create the App

Click **Create GitHub App**.

### 6. Get Your Credentials

After creation, you'll see:

1. **App ID**: Found at the top of the app settings page
2. **Client ID**: Under "About" section
3. **Client secrets**: Click "Generate a new client secret"

### 7. Update Your `.env` File

Copy the credentials to your `.env` file:

```env
GITHUB_APP_ID="123456"
GITHUB_APP_CLIENT_ID="Iv1.abc123def456"
GITHUB_APP_CLIENT_SECRET="your-client-secret-here"
```

## User Authentication Flow

The authentication flow for GitHub Apps is similar to OAuth Apps:

1. **Frontend**: Redirect user to GitHub authorization URL:

   ```
   https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID
   ```

2. **GitHub**: User authorizes the app and is redirected back with a `code`

3. **Frontend**: Send the `code` to your backend API:

   ```
   POST /auth/login
   { "code": "received_code" }
   ```

4. **Backend**:
   - Exchange code for access token
   - Fetch user information
   - Generate JWT token
   - Return to frontend

## Frontend Integration Example

```typescript
// Redirect to GitHub for authorization
const clientId = 'YOUR_GITHUB_APP_CLIENT_ID'
const redirectUri = 'http://localhost:5173/callback'
const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`

window.location.href = authUrl

// In your callback page, extract the code
const urlParams = new URLSearchParams(window.location.search)
const code = urlParams.get('code')

// Send to backend
const response = await fetch('http://localhost:3333/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
})

const { data } = await response.json()
const token = data.token // Use this JWT for subsequent API calls
```

## Differences from OAuth Apps

| Feature     | OAuth App             | GitHub App                                |
| ----------- | --------------------- | ----------------------------------------- |
| Permissions | Coarse-grained scopes | Fine-grained permissions                  |
| Token Type  | User access token     | User access token + Installation token    |
| Rate Limits | 5,000 requests/hour   | 5,000 requests/hour (user) + 15,000 (app) |
| Recommended | Legacy                | **✓ Modern**                              |

## Troubleshooting

### "Bad verification code" error

- Ensure the code hasn't expired (codes are single-use and expire after 10 minutes)
- Check that your Client ID and Client Secret are correct

### "Not found" error

- Verify your GitHub App is set to "Any account" installation
- Check that the callback URL matches your frontend URL

### API Rate Limiting

- User authentication has 5,000 requests/hour per user
- Consider implementing Redis caching (already included in this project)

## Additional Resources

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [User-to-Server Authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [GitHub App Permissions](https://docs.github.com/en/rest/overview/permissions-required-for-github-apps)
