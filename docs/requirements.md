# Product requirements

## Overview

The app connects people seeking legal help with law firms. A plaintiff submits a lead describing their situation. A firm reviews the lead and, if it accepts, the app creates a case. Admins oversee intake and assignments across firms.

## Product success criteria

- A plaintiff can submit a lead and return later to see its status, any case progress, and shared PDFs.
- A firm can review an assigned lead, accept it, and work on the linked case. Staff and the plaintiff can exchange PDFs, and staff can keep private notes.
- An admin can assign an unmatched lead and either reassign or close a declined lead. The plaintiff can see what the admin did when they return.
- After a case moves, the new firm can continue from the case and its linked lead. The previous firm loses access, private notes remain protected, and an admin can inspect what changed.

## Scope and constraints

- **In scope.** Lead intake, routing and review, case progress, PDF exchange, firm-private notes, admin search and reassignment, and audit history.
- **Stack.** Use Next.js, or React with a Python or JavaScript/TypeScript backend. If the project uses multiple apps or services, keep them in one monorepo.
- **Scale.** Design for at least 100 firms, 1,000 leads per day, and 100,000 stored leads. A case may have hundreds of related records.

## Jobs to be done

### Plaintiff

- When I need legal help, I need a firm that can review my situation.
- After I've asked for help, I need to know where things stand and keep track of the documents I share with the firm.

### Attorney or paralegal

- When a lead comes in, I need enough information to decide whether our firm can take it.
- Once we take a case, I need to keep the plaintiff up to date and exchange the documents we need to work on it.
- When a colleague picks up a case, they need enough context to continue the work while keeping our internal notes private.

### Admin

- When a lead goes unmatched or a firm declines it, I need to find out what happened and decide where it should go next.
- When work moves between firms, I need the receiving firm to have enough information to continue and the former firm to lose access.
- When someone questions an assignment or status change, I need to reconstruct what happened and who made the change.

## Functional requirements

### Lead intake and routing

**User stories**

- As a plaintiff, I want to submit a lead so that a firm can review my situation.
- As an admin, I want unmatched leads to stay pending so that I can assign them to a firm.

**Acceptance criteria**

- A plaintiff can submit their name, email, region, category, and a description. The app saves the submission as a lead.
- If the region and category match the routing map, the app assigns the lead to one firm and shows it in that firm's inbox.
- If there's no match, the lead stays pending and an admin can find it.

### Lead review

**User stories**

- As an attorney or paralegal, I want to filter my firm's inbox and open a lead so that I can decide whether we can take it.
- As an attorney or paralegal, I want to accept a lead so that my firm can start working on the case.
- As an attorney or paralegal, I want to decline a lead so that an admin can find another way to resolve it.

**Acceptance criteria**

- Attorneys and paralegals can view and filter their firm's inbox, open a lead, and accept or decline it.
- Accepting a lead creates a linked case. Staff can find the lead under Accepted and open the case from there.
- A decline moves the lead out of the active inbox and into the admin queue. Staff can still view it while their firm is assigned.

### Case progress and PDFs

**User stories**

- As a plaintiff, I want to see my leads and cases so that I can check their progress when I return.
- As a member of the assigned firm, I want to update the case status so that the plaintiff can see where it stands.
- As a plaintiff, I want to upload PDFs and open the PDFs my firm shares so that we can exchange documents for my case.
- As a member of the assigned firm, I want to open PDFs from the plaintiff and share PDFs in return so that we can work from the same case documents.

**Acceptance criteria**

- A plaintiff can return to see their own leads, cases, and progress. Staff at the assigned firm can update case progress.
- A plaintiff can upload PDFs to a lead before acceptance. Those PDFs are available on the linked case once it exists.
- The plaintiff and assigned firm staff can exchange case PDFs. The [workflow rules](workflow-rules.md#permissions-and-ownership) define access after reassignment.

### Firm-private notes

**User stories**

- As a member of the assigned firm, I want to add and read our private notes so that staff at my firm can pick up where a colleague left off.
- As an authorized admin, I want to inspect firm-private notes so that I can review the case when needed, including after reassignment.

**Acceptance criteria**

- Staff at the assigned firm can add and read their firm's private notes. Each note belongs to the firm that wrote it, even if the case moves.
- Plaintiffs and other firms can't read those notes. Authorized admins can inspect them.

### Admin search and reassignment

**User stories**

- As an admin, I want to search leads and cases across firms so that I can find the right record and check its assignment.
- As an admin, I want to assign an unmatched lead or resolve a declined lead so that the inquiry can move forward.
- As an admin, I want to reassign a lead or case so that the right firm can take over.
- As a member of the receiving firm, I want access to the case details and the plaintiff's PDFs so that I can continue the case without asking the plaintiff to resend them.
- As a plaintiff, I want to know when an admin reassigns or closes my lead so that I know whether it is still being reviewed.

**Acceptance criteria**

- Admins can search leads and cases across firms, assign unmatched leads, and reassign or close declined leads. They can also move assigned work between firms.
- A lead reassigned for review appears in the receiving firm's active inbox. Closing a declined lead ends its assignment and leaves it visible to the plaintiff and admins.
- The plaintiff sees an in-app notice when an admin reassigns or closes their lead.
- After reassignment, the record is available to the new firm and the previous firm loses access, including through links it already has.
- A reassigned case keeps its progress and moves with its linked lead. The new firm can see the case details and PDFs uploaded by the plaintiff. The plaintiff keeps access to the case and PDFs already shared with them. The [private note rules](#firm-private-notes) still apply.

### Audit history

**User story**

- As an admin, I want to see who changed an assignment or status so that I can trace what happened.

**Acceptance criteria**

- Admins can inspect assignment changes and important status changes. Each entry shows who made the change, what changed, and when. For example, a reassignment entry shows the previous and new firm.

## Nonfunctional requirements

### Access and persistence

- A plaintiff can access only their own leads and cases. Firm staff can access only leads and cases assigned to their firm. The backend enforces these rules, including when someone opens a record or PDF link directly.
- Leads, cases, PDFs, private notes, and audit history persist between sessions and remain available to users who have access.

See the [original assignment](assignment.md), [user personas](user-personas.md), [journeys](user-journeys-and-flows.md), [workflow rules](workflow-rules.md), and [decision log](decisions.md).
