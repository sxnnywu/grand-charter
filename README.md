# Brief

## Run the app locally

Install Node.js 22 or newer and start Docker with Compose. From the repository root, run:

```sh
npm ci
cp .env.example .env.local
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev
```

Open [Brief](http://127.0.0.1:3000). Choose an account. Each account uses the password `grand-charter-demo`.

## Accounts

Maya has existing requests and a case. Jordan starts with an empty workspace.

| Account | Role | Workspace and actions |
| --- | --- | --- |
| Maya Patel (`maya@example.com`) | Plaintiff | Existing requests and an in-progress case. |
| Jordan Lee (`jordan@example.com`) | Plaintiff | An empty workspace and a first request. |
| Alex Chen (`alex@example.com`) | Northline Legal attorney | Review, accept, or decline leads. |
| Priya Shah (`priya@example.com`) | Northline Legal paralegal | Work from the same firm inbox and cases. |
| Sofia Martin (`sofia@example.com`) | Harbour Law attorney | Update Maya’s case and exchange PDFs. |
| Morgan Ellis (`morgan@example.com`) | Admin | Search records, manage assignments, and inspect history. |

These are the starting states after seeding a fresh database. Changes persist. Running the seed again adds missing initial records without resetting existing requests or case progress.

Maya starts with an Employment request waiting for Northline Legal’s decision and an accepted Housing request with an in-progress case at Harbour Law. Jordan starts without requests.

## Workflow

1. Sign in as Jordan and submit an **Employment** request in **Ontario**. That pair routes to Northline Legal.
2. Open the request and upload a PDF. Use **Switch account** to choose Alex or Priya at Northline. Open the lead from the inbox and accept it.
3. Open the linked case under **Accepted**. Start work, share a PDF, and add a private note. Switch back to Jordan to see the progress and PDFs.
4. Switch to Morgan and use **Cases** to find and reassign the case to Harbour. Switch to Sofia at Harbour to see the same case progress and Jordan’s PDF. Jordan can still open the PDF Northline shared, and Morgan can still inspect Northline’s note.

For the admin queue, submit a **Housing** lead in **Quebec**. Morgan can find and assign it under **Needs attention**, alongside leads declined by a firm. Use **All leads** for the full intake history. A **Housing** lead in **Ontario** routes directly to Harbour Law. Routing is evaluated when a lead is submitted.

Firm staff start in **Review leads**. Under **Manage cases**, every firm can switch between **List** and **Board**, including when it has no cases. Admins have the same views under **Cases**, with search and firm, province, and category filters. **Needs attention** stays a table for assignment decisions.

If a firm declines a lead, Morgan can send it back for review or close it. The plaintiff can see a notice after reassignment or closure. Morgan can open the record to inspect its audit history.

Accounts and routing rules are seeded during setup. Cases move from **New case** to **In progress** to **Closed**. Closed cases are read-only for plaintiffs and firm staff. Admins can still reassign them. PDFs are limited to 10 MB and stored in the private local folder `.data/documents`. Keep that folder and the database volume to retain uploads between runs.

Run `npm run typecheck` or `npm run build` to check the app. Stop the database with `docker compose stop db`.
