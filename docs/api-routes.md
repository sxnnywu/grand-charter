# API routes

The UI and API live in one Next.js app. Pages and API routes use the same server code for access checks and workflow rules.

## Session

| Route | Who | What it does |
| --- | --- | --- |
| `GET /api/session` | Anyone | Returns the current session and the available accounts. |
| `POST /api/session` | User with seeded credentials | Signs in as the selected account and starts a server session. |
| `DELETE /api/session` | Signed-in user | Ends the current session so the user can sign in as another account. |

## Leads

| Route | Who | What it does |
| --- | --- | --- |
| `GET /api/leads` | Plaintiff, firm staff, admin | Lists the plaintiff's own leads, the firm's assigned leads, or the admin queue. Supports inbox filters and search for staff and admins. |
| `POST /api/leads` | Plaintiff | Submits a lead and routes it by category and region. A lead with no match stays pending for an admin. |
| `GET /api/leads/:id` | Plaintiff on the lead, assigned firm staff, admin | Opens the lead and its linked case reference if accepted. Shows the user only the information they can access. |
| `POST /api/leads/:id/accept` | Assigned firm staff | Accepts a lead awaiting review and creates its case. |
| `POST /api/leads/:id/decline` | Assigned firm staff | Declines a lead awaiting review and sends it to the admin queue. |
| `POST /api/leads/:id/assign` | Admin | Assigns an unmatched lead, changes its assigned firm before acceptance, or returns a declined lead to firm review. |
| `POST /api/leads/:id/close` | Admin | Closes a declined lead without placing it with another firm and records a notice for the plaintiff. |
| `GET /api/leads/:id/history` | Admin | Shows the audit history for the lead and its linked case. |
| `GET /api/firms` | Admin | Lists firms for assignment and filtering. |

## Cases

| Route | Who | What it does |
| --- | --- | --- |
| `GET /api/cases` | Plaintiff, firm staff, admin | Lists the plaintiff's own cases, the firm's assigned cases, or cases across firms for an admin. Supports progress filters and search for staff and admins. |
| `GET /api/cases/:id` | Plaintiff on the case, assigned firm staff, admin | Opens the case details and progress. PDFs, notes, and history use separate routes with their own access checks. |
| `PATCH /api/cases/:id/status` | Assigned firm staff | Changes case progress using an allowed transition. |
| `POST /api/cases/:id/reassign` | Admin | Moves the case and its linked lead together. Uses the same assignment logic as the lead route. |
| `GET /api/cases/:id/notes` | Assigned firm staff, authorized admin | Lists notes owned by the current firm for staff, or across firms for the admin. |
| `POST /api/cases/:id/notes` | Assigned firm staff | Adds a private note owned by the staff member's firm. |

## Documents

| Route | Who | What it does |
| --- | --- | --- |
| `GET /api/leads/:id/documents` | Plaintiff on the lead or assigned firm staff | Lists the PDFs visible to the current user. |
| `POST /api/leads/:id/documents` | Plaintiff on the lead or eligible assigned firm staff | Adds a PDF to the lead's document collection. The case uses that same collection after acceptance. |
| `GET /api/documents/:id` | Plaintiff or firm staff with access to that PDF | Checks current access and serves the private PDF. |

Lead and case lists return up to 50 records and a cursor for the next page. Firm staff and admins can search by plaintiff name or record ID. Staff search stays within their assigned firm; only admins can filter by firm. A plaintiff's lead details include their assignment and closure notices.

Lead and case lists support these query parameters:

| Parameter | Behavior |
| --- | --- |
| `status`, `category`, `region` | Filter the matching records. For cases, `status` refers to case progress. |
| `q` | Searches plaintiff names or full record IDs for staff and admins. Admin case searches use case IDs; staff can also use the original lead ID. |
| `firmId` | Filters by firm for admins. Staff always remain limited to their assigned firm. |
| `attention=true` | Admin lead lists only. Combines `pending_assignment` and `declined`; an additional `status` filter narrows that set. Returns `403` for other roles or `400` on the admin case list. |
| `count=true` | Adds numeric `totalCount` for all records matching access and filters, before pagination. Empty pages still include the full matching count. Omitted by default. |
| `sort=oldest` | Orders by original lead submission date and ID ascending. The default is newest first. Applies to both lead and case lists. |
| `before` | Uses `nextCursor` to load the next page with the same filters and sort order. The cursor is a lead ID for both lists. |

The case board requests each progress status separately so a full column does not hide cases in another status. Admin navigation can request exact counts for the combined attention queue and each individual status.

PDF and note lists return up to 25 records and `nextCursor`. Pass that value as `?before=...` for the next page. A cursor only works within the record and content the user can access.

Creating a lead, note, or PDF requires a UUID in the `Idempotency-Key` header. Keep the same key when retrying the same submission. The server returns the original result with status `201`; reusing that key with different input returns `409`. Keys are scoped to the user and operation, stored with the write in one transaction, and retained until the database is reset. Failed transactions can be retried with the same key. The UI keeps the key with the unsent draft; refreshing or discarding that draft starts a new attempt.

See the [workflow rules](workflow-rules.md) for allowed transitions and record visibility, and [identity and access](identity-and-access.md) for how the server checks each request.
