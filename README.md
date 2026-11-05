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

1. Sign in as Maya and submit an **Employment** lead in **Ontario**. That pair routes to Northline Legal.
2. Open the request and upload a sample PDF. Use **Switch account** to choose Alex or Priya at Northline. Open the lead from the inbox and accept it.
3. Open the linked case under **Accepted**. Start work, share a PDF, and add a private note. Switch back to Maya to see the progress and PDFs.
4. Switch to Morgan and use **Cases** to find and reassign the case to Harbour. Switch to Sofia at Harbour to see the same case progress and Maya’s PDF. Maya can still open the PDF Northline shared, and Morgan can still inspect Northline’s note.

For the admin queue, submit a **Housing** lead in **Quebec**. Morgan can find and assign it under **Unmatched**. A **Housing** lead in **Ontario** routes directly to Harbour Law. Routing is evaluated when a lead is submitted.

If a firm declines a lead, Morgan can send it back for review or close it. Maya can see a notice after reassignment or closure. Morgan can open the record to inspect its audit history.

The demo uses seeded sign-in and a fixed routing map. Cases move from **Open** to **In progress** to **Closed**. Closed cases are read-only for plaintiffs and firm staff. Admins can still reassign them. PDFs are limited to 10 MB and stored in the private local folder `.data/documents`. Keep that folder and the database volume to retain uploads between runs.

Run `npm run typecheck` or `npm run build` to check the app. Stop the database with `docker compose stop db`.

## Local prototype

From the repository root, run:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory prototype
```

Open [the prototype](http://127.0.0.1:4173) and use **Demo role** to switch between the plaintiff, firms, and admin. Changes and uploaded PDFs are saved in the current browser. The reset button restores the sample records.

Use fictional details and sample PDFs. The prototype uses a role switcher and browser storage to simulate the workflows.
