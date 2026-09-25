# Developer Notes

This page documents the public HTTP APIs that external systems can use to integrate with Loom. Everything below targets the `/api/auth`, `/api/work`, and `/api/issues` families.

Every request must be sent over HTTPS and authenticated with a Bearer access token issued by Loom. The base URL is the same as the app, e.g. `https://loom.example.com`.

## Conventions

- Authentication: `Authorization: Bearer <jwt>` on every request.
- Default token TTL: 8 hours (`LOOM_JWT_TTL_MINUTES=480`).
- Errors: standard HTTP status codes. `401` for missing/invalid token, `403` when the role is not allowed, `404` for unknown resources, `400` for validation problems. The response body for `400` is a JSON map `{"errors": [...]}` (mirrors the default Spring Boot validation format).
- All `*UserId` fields are nullable when the corresponding role has not been assigned yet (e.g. an unassigned developer).
- Timestamps are ISO-8601 strings in UTC.

## External Authentication

External systems can open Loom as a specific user via a pre-shared JWT.

The configuration lives under **Configurazione → Autenticazione esterna**: an `ADMIN` enables the feature per project, registers an "application" (a name, a signing algorithm — HS256/HS384/HS512 — and the shared secret, optionally Base64-encoded), and binds one or more `sub` claims to internal Loom users.

Once configured, the flow is:

```text
External system            Browser                Loom
     |                         |                     |
     |-- opens /login?t=<JWT> ->|                     |
     |                         |-- POST /api/auth/   |
     |                         |   external-login -> |
     |                         |                     |-- verifies signature,
     |                         |                     |   algorithm, exp,
     |                         |                     |   sub mapping,
     |                         |                     |   project membership
     |                         |<-- access token ----|
     |<----- loads app with token in fragment -------| (via frontend)
```

### POST /api/auth/external-login

```http
POST /api/auth/external-login
Content-Type: application/json

{ "token": "<jwt-esterno-firmato>" }
```

The token must be signed with the secret bound to the application's `sub` claim. The backend validates the signature, the algorithm, the expiry (`exp`), the `sub` mapping, the project enablement, and the user's membership in that project. On success:

```json
{
  "session": {
    "accessToken": "<jwt-applicativo>",
    "tokenType": "Bearer",
    "expiresInSeconds": 28800
  },
  "projectId": 12
}
```

The application is locked to `projectId`: every workspace endpoint called with the returned `accessToken` must use that same `projectId`, or be cross-project (`/api/issues`). A token with a different project is rejected.

### Minting the external token

External side, mint an HS256/HS384/HS512 JWT whose payload contains at least:

| Claim | Required | Description |
| --- | --- | --- |
| `sub` | yes | The opaque subject bound to a Loom user. Configured in the application's mappings. |
| `exp` | yes | Expiry as a Unix timestamp. The backend rejects expired tokens. |
| `iss` | no | Issuer string, recorded only for diagnostics. |
| `aud` | no | Audience string, recorded only for diagnostics. |

The signing key is the application secret as configured (UTF-8 bytes, or Base64-decoded when the "Base64" toggle is on). Minimum length depends on the algorithm: 32 / 48 / 64 bytes respectively.

Node.js example:

```js
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const secret = crypto.createHash("sha256").update(process.env.LOOM_SHARED_SECRET).digest();

const token = jwt.sign(
  { sub: "ticket-bot", iss: "helpdesk" },
  secret,
  { algorithm: "HS256", expiresIn: "5m" }
);
```

Python example:

```python
import jwt, time

token = jwt.encode(
    {"sub": "ticket-bot", "iss": "helpdesk", "exp": int(time.time()) + 300},
    key=open("/run/secrets/loom-shared").read().strip(),
    algorithm="HS256",
)
```

### Operational notes

- Use HTTPS and configure any proxy in front of Loom to drop the query string of `/login`: the token is in the very first request.
- The external JWT is never stored by Loom; only the returned `accessToken` is. Rotating the application secret invalidates outstanding external tokens.
- The application secret is stored encrypted with AES-GCM, with a key derived from `LOOM_JWT_SECRET`. Keep `LOOM_JWT_SECRET` stable: changing it forces every secret to be re-entered.

## Issue Creation

Two creation paths exist:

- **Workspace path** — `/api/work/issues` — used by the application frontend and any external integration acting as the current user. The reporter is forced to the JWT subject; the integration cannot impersonate another issuer.
- **Admin path** — `/api/issues` — used by administrative tooling. Requires an `ADMIN` role; reporter and developer are taken from the body.

Both paths accept the optional `metadata` map (a JSON object with arbitrary keys and values). It is **not** exposed in the issue creation form; it is only visible inside the detail dialog to users with role `TEAM` or `ADMIN`. Use it to attach external identifiers (e.g. JIRA ticket id, third-party reference) without polluting the UI fields.

### POST /api/work/issues (workspace)

```http
POST /api/work/issues
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "projectId": 12,
  "title": "Login fails when SSO is offline",
  "description": "When the SSO provider returns 503, the login form hangs.",
  "internal": false,
  "values": [
    { "definitionId": 31, "value": "HIGH" },
    { "definitionId": 42, "value": "production" }
  ],
  "metadata": {
    "source": "jira",
    "ticketId": "OPS-1234"
  }
}
```

- `projectId` must match the application the JWT was issued for, when using an external token.
- `title` and `description` are required and bounded.
- `values` lists the custom field values to set at creation. Definitions outside the user's visible scope are rejected.
- `metadata` is optional; `null` is treated as "not set". An empty map is treated as "not set" too. To clear an existing metadata, use the admin update endpoint with `metadata: null`.

The response is the same `IssueOutput` shape used by `GET /api/work/projects/{projectId}/issues`. `status` starts at `REPORTED`, `issueType` is `null` until planning.

### POST /api/issues (admin)

```http
POST /api/issues
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "projectId": 12,
  "title": "Backfill historical tickets",
  "description": "Imported from legacy system",
  "issuerUserId": 5,
  "devUserId": 7,
  "issueType": "IMPLEMENTATION",
  "internal": true,
  "metadata": { "legacy": true, "importedAt": "2026-09-01" }
}
```

Available fields: `projectId`, `title`, `description`, `issuerUserId`, `devUserId`, `issueType`, `internal`, `selectValues` (a `{ definitionId: [values] }` map), and `metadata`. Requires `ADMIN`.

### PUT /api/issues/{id} (admin)

```http
PUT /api/issues/42
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{ "title": "Updated title", "metadata": { "source": "jira", "ticketId": "OPS-1234", "priority": "P1" } }
```

All fields are optional. `metadata` semantics: `null` clears it; `{}` is a no-op (preserves the existing value); any non-empty map replaces the stored map.

### Status transitions

```http
PATCH /api/work/issues/{id}/status
Authorization: Bearer <access-token>
Content-Type: application/json

{ "status": "IN_PROGRESS" }
```

Allowed transitions are validated by the state machine. Approving requires a separate call:

```http
PATCH /api/work/issues/{id}/approval
Authorization: Bearer <access-token>
```

Available to `SUPERUSER` (always) or `ADMIN` (only when the issue is flagged `internal`). Approval transitions `RELEASED → APPROVED`.

The server manages two timestamps automatically:

- `releasedAt` is set the first time the issue reaches `RELEASED`, and cleared when it leaves `RELEASED` for any state other than `APPROVED`. Approving preserves `releasedAt`. Re-entering `RELEASED` re-stamps it.
- `approvedAt` and `approver` are set when the issue reaches `APPROVED`, and cleared when it leaves `APPROVED`.

Clients cannot pass these timestamps: they are computed server-side at transition time.

## Issue Counters (Per-User Activity)

External digest / dashboard tooling can pull a per-user activity snapshot for a project via:

```http
GET /api/work/projects/{projectId}/user-issue-counts
Authorization: Bearer <access-token>
```

Requires role `ADMIN`.

Response (200 OK):

```json
[
  {
    "userId": 5,
    "username": "mario.rossi",
    "firstName": "Mario",
    "lastName": "Rossi",
    "asIssuer": 14,
    "asDeveloper": 9,
    "asApprover": 3,
    "total": 22
  },
  {
    "userId": 7,
    "username": "anna.bianchi",
    "firstName": "Anna",
    "lastName": "Bianchi",
    "asIssuer": 0,
    "asDeveloper": 12,
    "asApprover": 0,
    "total": 12
  }
]
```

Semantics:

- Soft-deleted issues are excluded (the metric is about live work, not rejected tickets).
- `asIssuer`, `asDeveloper`, `asApprover` are the per-role counts: a user acting as both issuer and developer on the same issue will appear in both buckets.
- `total` is the number of distinct issues the user touched across any of the three roles: a user who is both issuer and developer on a single issue counts as `1`, not `2`.
- Results are sorted by `total` descending, then by `userId` ascending.
- A `null` user id (an unassigned role) is ignored.

This endpoint is intended for low-frequency digests (e.g. a weekly summary email). For high-frequency dashboards, prefer the standard project issue listing at `GET /api/work/projects/{projectId}/issues`.
