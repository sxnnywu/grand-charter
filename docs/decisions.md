# Product decisions

The [assignment](assignment.md) defines required behavior. This log records choices we made where the brief left room for interpretation. See the [workflow rules](workflow-rules.md) for the resulting behavior.

## Agreed

| Topic | Decision |
| --- | --- |
| Accepted leads | Keep the lead in an Accepted view while the firm is assigned. Staff can open the linked case from there. |
| Declined leads | The firm has read-only access while assigned. The admin can reassign or close the lead. To correct a mistaken decline, the admin can assign it back to the same firm for review. |
| Plaintiff notices | Show a persistent in-app notice after admin reassignment or closure of a lead. Notifications outside the app are out of scope. |
| Case progress and reassignment | Use New case, In progress, and Closed. Offer a transfer for the receiving firm to accept or decline. The current firm keeps ownership until acceptance; the same case and lead then move together with progress preserved. |
| PDF sharing | Plaintiffs can upload PDFs before acceptance. Their uploads follow the case. PDFs shared by a former firm stay visible to the plaintiff, who can upload a copy for the new firm if needed. Requests to a former firm are out of scope. |
| Admin PDF access | Admins can manage assignments and review case records, audit history, and authorized firm notes. PDF access is limited to the plaintiff and eligible firm staff. |
| Returning firm | If a case returns to a firm, the firm can read the private notes it wrote during an earlier assignment. |
| Audit history | Record routing and assignment changes, lead acceptance, decline and closure, and case status changes. Identify automatic routing as a system action. |

## Open

### Routing and manual assignment

One firm per region and category pair would make the seeded map predictable. Confirm whether we need a tie-break rule or limits on which firms an admin can assign manually.

### Case closure and reopening

The draft moves a case from Open to In progress to Closed. Decide whether staff can close a case directly from Open, reopen a closed case, or keep adding PDFs and notes after closure.

### Closing unmatched leads

Admins can close declined leads. Decide whether they should also be able to close an unmatched lead before any firm has reviewed it.

### Inbox filters and search fields

Start with status, region, and category in the firm inbox. For admin search, consider record ID or plaintiff name, with a firm filter to narrow the results.
