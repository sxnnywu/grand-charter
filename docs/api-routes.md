# API routes

The UI and API live in one Next.js app. Pages and API routes use the same server code for access checks and workflow rules.

## Session

| Route | Who | What it does |
| --- | --- | --- |
| `GET /api/session` | Anyone | Returns the current session and the available demo accounts. |
| `POST /api/session` | Reviewer with seeded demo credentials | Signs in as the selected demo account and starts a server session. |
| `DELETE /api/session` | Signed-in user | Ends the current session so the reviewer can sign in as another account. |

## Leads

| Route | Who | What it does |
| --- | --- | --- |
| `GET /api/leads` | Plaintiff, firm staff, admin | Lists the plaintiff's own leads, the firm's assigned leads, or the admin queue. Supports inbox filters and admin search. |
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
| `GET /api/cases` | Plaintiff, firm staff, admin | Lists the plaintiff's own cases, the firm's assigned cases, or cases across firms for an admin. Supports admin search. |
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

Lead and case lists return up to 50 records and a cursor for the next page. Admins can search by plaintiff name or record ID and filter by firm. A plaintiff's lead details include their assignment and closure notices.

See the [workflow rules](workflow-rules.md) for allowed transitions and record visibility, and [identity and access](identity-and-access.md) for how the server checks each request.
