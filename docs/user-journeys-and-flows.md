# User journeys and flows

The main journey runs from plaintiff intake to firm review and case work. Admins handle leads that need an assignment and step in when work needs to move between firms. The screens below are proposals for Phase 2.

## Lead intake

1. The plaintiff describes their situation in the intake form and submits it.
2. The app saves the lead and checks the routing map for its region and category.
3. A matched lead goes to the firm's inbox. An unmatched lead goes to the admin queue.
4. The plaintiff can return to see the lead in their own list.

**Proposed screens** - Intake form, plaintiff lead list, firm inbox, and admin queue. See [lead intake and routing](requirements.md#lead-intake-and-routing).

## Firm review

1. An attorney or paralegal opens the firm's inbox and filters the list as needed.
2. They open a lead, review the details, and accept or decline it.
3. If they accept, the app creates a case. The lead moves to Accepted, where staff can open the case from the original lead.
4. If they confirm a decline, the lead moves out of the active inbox and waits for admin review. Staff can still open it under Declined while assigned.

**Proposed screens** - Firm inbox with Active, Accepted, and Declined views, plus lead details with a link to the case after acceptance. See [lead review](requirements.md#lead-review).

## Case work

1. Firm staff open the case and update its progress.
2. The plaintiff returns to check the update. The plaintiff and firm staff use the case to exchange PDFs.
3. Firm staff can add private notes as they work.

**Proposed screen** - Case details with progress and PDFs for both sides, plus a notes area for staff. See [case progress and PDFs](requirements.md#case-progress-and-pdfs) and [note visibility](requirements.md#firm-private-notes).

## Admin resolution and reassignment

1. The admin finds an unmatched or declined lead in the queue, or searches across firms for a specific lead or case.
2. The admin reviews the record and chooses which firm should receive it. For a declined lead, the admin can also close it without assigning it.
3. On reassignment, the receiving firm gains access and the previous firm loses it. On closure of a declined lead, the current assignment ends.
4. The plaintiff sees an in-app notice after lead reassignment or closure. The admin can review the change in the audit history.

**Proposed screens** - Admin search and queue, plus record details with assignment controls and audit history.

See the [workflow rules](workflow-rules.md) for state transitions and what moves with a case.

## Proposed empty and error states

- **No results.** Keep the current filters visible so the user can adjust them.
- **Save or upload fails.** Explain what failed and give the user a way to retry.
- **Access changed.** If staff had a record open when their firm lost access, show a message on their next request and return them to their list.
