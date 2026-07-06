# NSAP Creator Manager

Internal creator management dashboard for the Night Shift at Paul's Roblox creator workflow.

This is now a full-stack application: an Express backend serves the API, Discord OAuth, SQLite database, backups, audit log, and the existing frontend UI.

## Requirements

- Node.js 22.5 or newer
- Discord Developer Application
- Render Web Service for production deployment

## Install And Run

```bash
npm install
npm start
```

Local URL:

```text
http://127.0.0.1:4173/
```

For local Discord login, copy `.env.example` to `.env` and fill the Discord variables.

## Environment Variables

```bash
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://127.0.0.1:4173/auth/discord/callback
SESSION_SECRET=replace-with-a-long-random-secret
DATABASE_URL=./server/data/nsap.sqlite
PORT=4173
NODE_ENV=development
APP_ORIGIN=http://127.0.0.1:4173
ALLOWED_ORIGINS=http://127.0.0.1:4173
SESSION_DAYS=14
TRUST_PROXY=true
```

In production, `SESSION_SECRET` and all Discord OAuth variables are required. Cookies are HTTP-only and marked Secure when `NODE_ENV=production`.

## Discord Setup

1. Create an application in the Discord Developer Portal.
2. Open OAuth2 settings.
3. Add the callback URL:
   `https://YOUR_RENDER_SERVICE.onrender.com/auth/discord/callback`
4. Set `DISCORD_REDIRECT_URI` to that same URL.
5. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in Render.

The first Discord user to log in becomes `Owner`. Later users start as `Viewer`.

## Roles And Permissions

- `Owner`: everything, including Owner role management
- `Administrator`: creator edits, import/export, users, audit, backups, restore
- `Manager`: edit creators
- `Viewer`: read-only

Permissions are enforced on the backend. Frontend permissions only control UI visibility.

## API Routes

- `GET /api/session`
- `GET /api/creators`
- `POST /api/creators`
- `PATCH /api/creators/:id`
- `PATCH /api/creators/:id/profile`
- `POST /api/creators/:id/timeline`
- `POST /api/creators/:id/mark-dm-sent`
- `DELETE /api/creators/:id`
- `POST /api/import`
- `GET /api/export`
- `GET /api/users`
- `PATCH /api/users/:discordId/role`
- `GET /api/audit`
- `GET /api/backups`
- `POST /api/backups`
- `POST /api/backups/:id/restore`

Unsafe API requests require the session cookie and CSRF token.

## Daily Creator Workflow

Managers, Administrators, and Owners can add creators from the Creators view with `+ Add Creator`. Creator name is required; Discord, Roblox, platform URLs, status, priority, category, quick note, notes, and follow-up date are optional. The modal keeps entered data if creation fails and shows the server validation message.

Creator profiles can be edited from the creator modal. Read-only profile cards and editable fields are shown separately. Edit mode uses `Save Changes`, `Cancel`, and an unsaved changes badge. Saves are validated on the backend and written to the audit log. Viewers can read data only.

Quick Note is for short working context such as `Waiting for reply`, `On break`, or `Busy with exams`. Manager+ users can edit it inline in the table; it autosaves after a short pause.

Follow-up Date appears in the table, modal, Dashboard cards, Needs Follow-up filter, and Notification Center. Due or overdue dates are highlighted from stored database data only.

Timeline entries are human-friendly creator context, separate from audit logs. Use `Add Entry` in the creator modal for notes like `Sent inactivity check message` or `Creator replied: taking a break`.

Reminder templates are available from the selected creator modal only, so every copied reminder is tied to a real creator. Copying a creator reminder adds a timeline entry for Manager+ users. `Mark DM Sent` must be clicked explicitly; copying a template does not mark DM as sent.

Backup import/export controls live in Settings as `Import Backup` and `Export Backup` for Administrator+ users. Import can overwrite creator data, so use only trusted backup JSON.

The sidebar can be collapsed or resized. Sidebar width and collapsed state are saved in browser localStorage with other UI preferences.

## Database

SQLite is the default database. The schema is kept simple for future PostgreSQL migration.

Tables:

- `users`
- `creators`
- `audit_logs`
- `backups`
- `sessions`

`data/creators.json` seeds an empty database only. Runtime dashboard data always comes from SQLite.

## Backups

The server creates automatic backups on startup when needed:

- daily, kept up to 30
- weekly, kept up to 12
- manual, kept up to 50

Admins can create manual backups and restore backups from the Admin view.

## Audit Log

Mutating backend actions are recorded with:

- timestamp
- Discord ID
- username
- action
- creator ID when relevant
- field
- old value
- new value
- IP address

Creator edits, imports, exports, user role updates, backup creation, restore, login, and logout are audited.

## Render Deployment

`render.yaml` defines a Node web service with a persistent disk mounted at `/var/data`.

Render values to set:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `APP_ORIGIN`
- `ALLOWED_ORIGINS`

`SESSION_SECRET` can be generated by Render. `DATABASE_URL` defaults to `/var/data/nsap.sqlite` in `render.yaml`.

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

## Project Structure

- `server/app.js` - Express app, middleware, routes, static frontend serving
- `server/server.js` - production entrypoint
- `server/auth.js` - Discord OAuth and HTTP-only sessions
- `server/db.js` - SQLite schema, migrations, audit, backups
- `server/permissions.js` - roles and permission checks
- `server/security.js` - CSRF helpers and async route wrapper
- `server/validation.js` - request and import validation
- `src/app.js` - frontend orchestration
- `src/data` - API client and creator normalization
- `src/state` - local UI preferences and view state only
- `src/ui` - dashboard, table, modal, admin, toast, settings rendering
- `src/utils` - date, formatting, and creator visuals

## Security Notes

The backend uses Helmet, compression, CORS, rate limiting, CSRF protection, HTTP-only sessions, secure production cookies, request validation, prepared SQLite statements, and a global error handler.

Do not store authentication, roles, permissions, or creator data in localStorage. localStorage is used only for personal UI settings and view state.
