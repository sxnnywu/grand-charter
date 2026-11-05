Before your interview

Build the lead-management system described below and reply to this email with a public GitHub repository URL by November 5, 2026, at 11:59 p.m. Eastern Time. There is no fixed time limit or prescribed number of hours; spend as much time as you choose and clearly identify anything incomplete or simulated. Focus on delivering the requested workflows well. Extra features, elaborate infrastructure, and visual polish are unnecessary unless they meaningfully improve the project—for example, by substantially improving performance.

AI tools are completely allowed. Use coding assistants, agents, generated code, documentation, and other tools as much as you like. Our main focus is your understanding of the implementation, your architecture and design choices, and how you checked that the system works. AI use itself is not scored positively or negatively.

Take-home exercise: build a lead-management system

Build a working system that connects people seeking legal help with law firms and lets admins oversee the intake and assignment process.

Submit one public GitHub repository containing all application code and the instructions needed to run it.

One application with different routes for the different user experiences is completely acceptable.
If you choose multiple applications or services, keep them together in a monorepo in that same public repository.
Either structure is equally acceptable. Be ready to explain your choice.
Use Next.js, or React with a Python or JavaScript/TypeScript backend.
A hosted demo is optional. The system must be runnable from the repository using the documented setup.
The system

A plaintiff is the person seeking help. A lead is their inquiry. A case is the work record created when a law firm accepts that lead. Attorneys and paralegals are staff at a law firm.

The overall flow is:

A plaintiff submits a lead describing their situation, including its region and category.
The system routes that lead to a law firm using a category/region mapping. The assigned firm's attorneys and paralegals see it in their inbox, and admins can see it across the system. If there is no matching firm, the lead waits for an admin to assign it.
The firm reviews the lead and accepts or declines it. Accepting creates a case; declining leaves the lead for an admin to resolve or reassign.
The firm works on the case, updates its progress, adds private notes, and exchanges PDFs with the plaintiff. The plaintiff can return to see progress and documents for their own work.
Admins oversee leads and cases across firms and can reassign them when needed.
Build the following workflows, including the interfaces and persistent state needed to demonstrate them.

1. Plaintiff

Submit a lead with name, email, region, category, and a description.
Access their own leads and cases to see progress and upload/view PDFs.
Keep other plaintiffs' information and firm-private notes inaccessible.
2. Law firm

Route a new lead to one firm using a category/region mapping. You may seed this mapping; a mapping editor is not required. Unmatched leads remain pending for an admin.
Attorneys and paralegals can view and filter their firm's inbox, inspect a lead, and accept or decline it. Acceptance creates a case; declined leads remain available for admin resolution.
Staff can update case progress, upload/view case PDFs, and add firm-private notes.
3. Admin

Search leads and cases across firms.
Resolve unmatched or declined leads and reassign leads or cases.
Record who changed an assignment or important status, what changed, and when; make that history inspectable.
On reassignment, the old firm loses future access to the lead/case. The new firm receives case information and plaintiff documents.
Firm-private notes retain their authoring firm's ownership: the new firm does not inherit them, plaintiffs cannot see them, and authorized admins can inspect them. No separate archive UI for the old firm is required.
Scope and assumptions

You do not need to implement account creation or registration. A single account with hardcoded demo sign-in details is fine for authentication. The plaintiff, law-firm, and admin workflows should still be available to demonstrate.

Generally assume that your architecture has to handle at least 100 firms, 1,000 leads per day, and 100,000 stored leads. A case may also have hundreds of related records.

Prioritize a coherent, working system covering the workflows above.
