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

| Account | Role | Workspace and actions |
| --- | --- | --- |
| Maya Patel (`maya@example.com`) | Plaintiff | Existing requests and an in-progress case. |
| Jordan Lee (`jordan@example.com`) | Plaintiff | An empty workspace and a first request. |
| Alex Chen (`alex@example.com`) | Northline Legal attorney | Review, accept, or decline leads. |
| Priya Shah (`priya@example.com`) | Northline Legal paralegal | Work from the same firm inbox and cases. |
| Sofia Martin (`sofia@example.com`) | Harbour Law attorney | Update Maya’s case and exchange PDFs. |
| Nora Davis (`nora@example.com`) | Plaintiff | One ongoing case with several supporting PDFs. |
| Renee Walker (`renee@example.com`) | Cedar Legal attorney | Review requests and manage British Columbia cases. |
| Elena Brooks (`elena@example.com`) | Cedar Legal paralegal | Work in the same firm as Renee. |
| Daniel Park (`daniel@example.com`) | Pacific Counsel attorney | Review requests and work across case stages. |
| Amara Okafor (`amara@example.com`) | Prairie Legal attorney | Review Alberta requests and cases. |
| Luc Moreau (`luc@example.com`) | Laurent Legal attorney | Review Quebec work, including a transferred case. |
| Morgan Ellis (`morgan@example.com`) | Admin | Search records, manage assignments, and inspect history. |

## Request routing

New requests are routed by province and category using this mapping:

| Province | Employment | Housing | Personal injury | Contract dispute |
| --- | --- | --- | --- | --- |
| Ontario | Northline Legal | Harbour Law | Harbour Law | Northline Legal |
| British Columbia | Cedar Legal | Cedar Legal | Pacific Counsel | Pacific Counsel |
| Alberta | Prairie Legal | Prairie Legal | Prairie Legal | Unassigned |
| Quebec | Laurent Legal | Laurent Legal | Laurent Legal | Laurent Legal |

Unmatched requests wait for an admin to assign a firm. Alberta contract disputes are intentionally unmapped so this workflow can be explored.

The mapping is defined in [db/workspace-data.mjs](db/workspace-data.mjs) and seeded into the `routing_rules` table. Request creation looks up that table in [server/leads.ts](server/leads.ts). Rerunning the seed adds missing rules but does not overwrite existing mappings.

Run `npm run typecheck` or `npm run build` to check the app. Stop the database with `docker compose stop db`.
