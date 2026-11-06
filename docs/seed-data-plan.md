# Seed data proposal

Proposed replacement for the current starter data. This plan has not been seeded.

## Size

| Record | Count | Purpose |
| --- | ---: | --- |
| Firms | 6 | Distinct inboxes and coverage across the four provinces. |
| Plaintiffs | 40 | Maya has two matters, Jordan has none, and the other 38 people have one each. |
| Requests | 40 | Enough variety to make searching, filtering, routing, and reassignment useful. |
| Cases | 18 | A linked subset of the accepted requests, not additional requests. |
| PDFs | 50 | Readable documents with meaningful filenames and content. |
| Private notes | 24 | Owned by their authoring firm, including notes written before reassignment. |
| Audit entries | About 100 | A consistent history of the seeded actions. |

## Request distribution

| State | Count |
| --- | ---: |
| Awaiting firm review | 12 |
| Pending assignment | 4 |
| Declined, awaiting admin resolution | 4 |
| Closed without a case | 2 |
| Accepted, with a linked case | 18 |

The 18 cases comprise five new cases, nine in progress, and four closed cases. Acceptance stays visible in lead history; it does not create a second inquiry.

## Firms and routing

| Firm | Province | Categories |
| --- | --- | --- |
| Northline Legal | Ontario | Employment, Contract dispute |
| Harbour Law | Ontario | Housing, Personal injury |
| Cedar Legal | British Columbia | Employment, Housing |
| Pacific Counsel | British Columbia | Personal injury, Contract dispute |
| Prairie Legal | Alberta | Employment, Housing, Personal injury |
| Laurent Legal | Quebec | All four categories |

These 15 rules cover 15 of the 16 category/province combinations. Alberta contract disputes remain unmatched so the admin assignment workflow can be demonstrated. A firm may cover several combinations; adding firms alone does not expand routing coverage.

Give every firm reviewable leads and accepted cases. Vary the case mix rather than giving every firm identical boards.

## People and matters

- Maya has a dismissal request awaiting review and a housing case in progress. Use different titles, descriptions, dates, firms, and documents so they read as separate matters.
- Jordan has no requests and starts at the intake form.
- The other 38 plaintiffs each have one request. Use varied names and descriptions rather than numbered people or repeated Maya records.
- Example titles: “Unpaid overtime,” “Deposit not returned,” “Outstanding contractor invoice,” and “Injury after a fall.” Leave four titles blank to exercise the category fallback.
- Include all four provinces and categories, with submission dates spread over six weeks. Keep every event and document timestamp in a sensible sequence.

## Workflows to include

- Unmatched requests ready for assignment and declined requests ready for reassignment or closure.
- New, ongoing, and closed cases, with appropriate documents and read-only behavior.
- One reassigned case with plaintiff PDFs, PDFs shared by the previous firm, and notes from both firms. Verify ownership and access against the existing workflow rules.
- One case with six to eight PDFs and several updates. Keep other matters lighter, including a few with no PDFs.
- Specific private notes about the next action, with a believable author and date. Do not use filler text.

## Documents

Use valid PDFs with a short readable body that matches the matter. Examples include `Employment agreement.pdf`, `Pay records.pdf`, `Rent receipts.pdf`, `Deposit correspondence.pdf`, and `Incident report.pdf`.

Distinguish plaintiff uploads from firm-shared PDFs through their real ownership fields. Do not put “demo,” “test,” or “sample” in filenames, request descriptions, notes, or visible UI labels.

## Account access

Keep the sign-in choices manageable: Maya, Jordan, one additional plaintiff with a single case, one attorney from each firm, two paralegals, and Morgan as admin. That is 12 selectable accounts. The remaining plaintiff profiles provide records without adding dozens of sign-in options.

Explain the account scenarios on the sign-in page and in the repository guide. Do not add explanatory banners to signed-in workspaces.

## Applying this plan

Use stable IDs and repeatable inserts. Ordinary seeding must not overwrite later workflow changes. Generate PDF files as part of the documented setup so a fresh checkout includes working document examples.

Replacing existing local records is a separate reset. Do not reset the current database just to apply UI changes.
