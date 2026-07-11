# Security

## Authentication

Version 1.2 uses Discord OAuth2 with the `identify` scope. The backend exchanges the OAuth code for a Discord profile, stores the user in the configured database, and creates an HTTP-only session cookie.

Required secrets are read from environment variables:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `SESSION_SECRET`
- `DATABASE_URL`

Do not commit real secrets to the repository or expose `DATABASE_URL` to frontend code. PostgreSQL operations use parameterized queries and a connection pool. Production fails startup unless `DATABASE_URL` is a PostgreSQL URL.

## Permissions

Frontend role checks are only for user experience. They are not trusted.

Every shared-data mutation is checked on the backend:

- creator edits require `manager`, `administrator`, or `owner`
- import/export requires `administrator` or `owner`
- user role management requires `administrator` or `owner`
- assigning or changing `owner` requires `owner`
- backup restore requires `administrator` or `owner`

Anonymous users and `viewer` users can only read data.

## Server-Side Validation

The backend validates every creator edit:

- editable fields are limited to approved creator fields in `server/permissions.js`
- enum fields must match allowed values
- text fields are sanitized and capped
- imports must contain a valid creators array

## Audit Log

Every backend mutation writes an audit record with:

- Discord ID
- username
- action
- creator ID when relevant
- field changed when relevant
- old value
- new value
- IP address
- timestamp

Audit data is stored in the `audit_logs` table.

## Deployment Notes

Use HTTPS in production so session cookies can be marked secure. Set:

```bash
NODE_ENV=production
```

Use a long random `SESSION_SECRET`. Set `DATABASE_URL` to the provider's PostgreSQL connection string and enable `DATABASE_SSL` when required. SQLite is a local-development fallback only. JSON backup restore remains protected by the existing role checks.
