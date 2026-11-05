# Workflow rules

This document defines the lead and case states, who can change them, and who can access each record. See the [PRD](requirements.md) for acceptance criteria and the [decision log](decisions.md) for open questions.

## Lead state machine

```mermaid
stateDiagram-v2
    state "New submission" as Submitted
    state "Pending assignment" as Pending
    state "Awaiting firm review" as Review

    [*] --> Submitted
    Submitted --> Review: System finds a match
    Submitted --> Pending: No routing match
    Pending --> Review: Admin assigns
    Review --> Review: Admin reassigns
    Review --> Accepted: Firm accepts and case opens
    Review --> Declined: Firm declines
    Declined --> Review: Admin assigns for another review
    Declined --> Closed: Admin closes
```

| Current state | Action | Actor | Next state | What changes |
| --- | --- | --- | --- | --- |
| New submission | Route to a matching firm | System | Awaiting firm review | The app assigns the lead to one firm. It appears in that firm's active inbox. |
| New submission | Find no routing match | System | Pending assignment | The lead has no assigned firm and appears in the admin queue. |
| Pending assignment | Assign to a firm | Admin | Awaiting firm review | The lead appears in the assigned firm's active inbox. |
| Awaiting firm review | Reassign to another firm | Admin | Awaiting firm review | The lead moves to the new firm's active inbox. The previous firm loses access. |
| Awaiting firm review | Accept | Assigned firm staff | Accepted | The app creates one linked case. The lead moves from the active inbox to Accepted, where staff can open the case from the lead. |
| Awaiting firm review | Decline | Assigned firm staff | Declined | Staff confirm the decline. The lead leaves the active inbox and enters the admin queue. The firm can still read the lead while assigned. |
| Declined | Assign for another review | Admin | Awaiting firm review | The lead returns to the active inbox of the selected firm. The admin can assign it back to the same firm to correct a mistaken decline. The original decline stays in the audit history. |
| Declined | Close without assigning | Admin | Closed | The assignment ends. The lead remains visible to the plaintiff and admins. |

- The app checks the current state and assignment before accepting or declining. A second attempt to accept the same lead can't create another case.
- A firm can act on a lead only while it is assigned and awaiting firm review. Admin assignment is the path back to review after decline.
- An accepted lead stays Accepted as its case progresses. An admin moves it through case reassignment, which transfers the case and its linked lead together.

### Plaintiff status and notices

- A declined lead appears to the plaintiff as **Awaiting admin review** while the admin decides what to do.
- When an admin reassigns or closes a lead, the plaintiff sees a persistent in-app notice on return. For closure, the notice explains that the request was closed without placement at a firm.
- Notifications outside the app are out of scope.

## Case state machine

The agreed case statuses are **Open**, **In progress**, and **Closed**. The progress and closure transitions below are proposed defaults.

```mermaid
stateDiagram-v2
    direction LR
    state "In progress" as InProgress

    [*] --> Open: Firm accepts the lead
    Open --> InProgress: Start work (proposed)
    InProgress --> Closed: Close case (proposed)
```

An admin can reassign a case in any state. The assigned firm changes and the case keeps its current status.

| Current state | Action | Actor | Next state | What changes |
| --- | --- | --- | --- | --- |
| Case creation | Accept the linked lead | Assigned firm staff | Open | The new case starts with the same plaintiff and assigned firm as the lead. PDFs already uploaded by the plaintiff are available on the case. |
| Open | Start work (proposed) | Assigned firm staff | In progress | The new status is visible to the plaintiff. |
| In progress | Close the case (proposed) | Assigned firm staff | Closed | The case stays available to users with access. The linked lead stays Accepted. |
| Any case status | Reassign the case | Admin | Same status | The case keeps its identity and progress. The case and linked lead move to the new firm together. Access changes with the assignment. |

See [case closure and reopening](decisions.md#case-closure-and-reopening) for the remaining questions about Closed cases.

## Permissions and ownership

Attorneys and paralegals have the same firm permissions. **Assigned firm** means the current firm on the lead or case. **Other firm** includes the previous firm once reassignment takes effect.

| Record or action | Plaintiff on the record | Assigned firm | Other firm | Admin |
| --- | --- | --- | --- | --- |
| Lead | Submit and view own leads | View while assigned. Accept or decline only while awaiting review. | No access | Search and view across firms. Assign, reassign, or close as allowed by the lead state machine. |
| Case | View case and progress | View and update progress | No access | Search and view across firms. Reassign the case and linked lead. |
| Plaintiff-uploaded PDFs | Upload and view own PDFs | View while assigned, including PDFs uploaded before acceptance | No access | PDF access is open for review. |
| Firm-shared case PDFs | View PDFs shared with them, including after reassignment. Upload a copy if they choose to share it with the current firm. | Upload PDFs to share with the plaintiff. View PDFs shared by their own firm. | No case access | PDF access is open for review. |
| Firm-private notes | No access | Add and read notes owned by their firm. If the case returns, they can read notes they wrote during a previous assignment. | No access | Authorized admins can read notes across firms and assignments. |
| Audit history | No access | No access | No access | Inspect the history of lead and case changes. |

- Plaintiffs can access only their own records. The same rules apply to lists, search results, direct record links, and PDF links.
- Private notes stay owned by the firm that wrote them. Reassignment changes access to the case and leaves note ownership intact.
- The new firm automatically gets case details and plaintiff-uploaded PDFs. A PDF shared by a former firm stays available to the plaintiff. The new firm can see a copy if the plaintiff uploads it for them. Requests to a former firm are outside the take-home scope.

## Audit history

Record automatic routing that assigns a firm, manual assignment and reassignment, acceptance, decline, lead closure, and case status changes. Each entry shows the actor, what changed, and when. Use **System** for automatic routing. For a reassignment, show the previous and new firm.
