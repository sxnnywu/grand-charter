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

Open [Brief](http://127.0.0.1:3000). Choose a fictional demo account. Each account uses the password `grand-charter-demo`.

## Demo accounts

Maya and Jordan demonstrate the returning-user and first-time experiences without needing to create an account.

| Account | Role | What to try |
| --- | --- | --- |
| Maya Patel (`maya@example.com`) | Plaintiff | Existing requests and an in-progress case. |
| Jordan Lee (`jordan@example.com`) | Plaintiff | An empty workspace and a first request. |
| Alex Chen (`alex@example.com`) | Northline Legal attorney | Review, accept, or decline leads. |
| Priya Shah (`priya@example.com`) | Northline Legal paralegal | Work from the same firm inbox and cases. |
| Sofia Martin (`sofia@example.com`) | Harbour Law attorney | Update Maya’s case and exchange PDFs. |
| Morgan Ellis (`morgan@example.com`) | Admin | Search records, manage assignments, and inspect history. |

These are the starting states after seeding a fresh database. Demo activity persists. Running the seed again adds missing sample records without resetting existing requests or case progress.

Maya starts with an Employment request waiting for Northline Legal’s decision and an accepted Housing request with an in-progress case at Harbour Law. Jordan starts without requests.

## Try the full workflow

1. Sign in as Jordan and submit an **Employment** request in **Ontario**. That pair routes to Northline Legal.
2. Open the request and upload a sample PDF. Use **Switch account** to choose Alex or Priya at Northline. Open the lead from the inbox and accept it.
3. Open the linked case under **Accepted**. Start work, share a PDF, and add a private note. Switch back to Jordan to see the progress and PDFs.
4. Switch to Morgan and use **Cases** to find and reassign the case to Harbour. Switch to Sofia at Harbour to see the same case progress and Jordan’s PDF. Jordan can still open the PDF Northline shared, and Morgan can still inspect Northline’s note.

For the admin queue, submit a **Housing** lead in **Quebec**. Morgan can find and assign it under **Needs attention**, alongside leads declined by a firm. Use **All leads** for the full intake history. A **Housing** lead in **Ontario** routes directly to Harbour Law. Routing is evaluated when a lead is submitted.

If a firm declines a lead, Morgan can send it back for review or close it. The plaintiff can see a notice after reassignment or closure. Morgan can open the record to inspect its audit history.

The demo uses seeded sign-in and a fixed routing map. Cases move from **New case** to **In progress** to **Closed**. Closed cases are read-only for plaintiffs and firm staff. Admins can still reassign them. PDFs are limited to 10 MB and stored in the private local folder `.data/documents`. Keep that folder and the database volume to retain uploads between runs.

Run `npm run typecheck` or `npm run build` to check the app. Stop the database with `docker compose stop db`.

## Local prototype

From the repository root, run:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory prototype
```

Open [the prototype](http://127.0.0.1:4173) and use **Demo role** to switch between the plaintiff, firms, and admin. Changes and uploaded PDFs are saved in the current browser. The reset button restores the sample records.

Use fictional details and sample PDFs. The prototype uses a role switcher and browser storage to simulate the workflows.
