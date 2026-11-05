# Grand Charter

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

Open [Grand Charter](http://127.0.0.1:3000). Choose a fictional demo account. Each account uses the password `grand-charter-demo`.

1. Sign in as Maya and submit an **Employment** lead in **Ontario**. That pair routes to Northline Legal.
2. Use **Switch account** to choose Alex or Priya at Northline. Open the lead from the inbox and accept it. The lead stays under **Accepted**, where you can open the linked case.
3. Switch back to Maya and open the same case from your request list.

This first build persists users, sessions, leads, cases, and audit events in PostgreSQL. Unmatched submissions stay pending and are visible to the demo admin. Decline and admin assignment actions, case progress updates, PDFs, private notes, and the audit history screen are still to come.

Run `npm run typecheck` or `npm run build` to check the app. Stop the database with `docker compose stop db`. The database volume keeps records between runs.

## Local prototype

From the repository root, run:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory prototype
```

Open [the prototype](http://127.0.0.1:4173) and use **Demo role** to switch between the plaintiff, firms, and admin. Changes and uploaded PDFs are saved in the current browser. The reset button restores the sample records.

Use fictional details and sample PDFs. The prototype uses a role switcher and browser storage to simulate the workflows.
