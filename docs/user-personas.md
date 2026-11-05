# User personas

The assignment defines these four roles. The goals, motivations, and needs below are working assumptions based on each role's tasks. The requirements link to the PRD.

## Plaintiff

A person seeking legal help.

- **Goals** - Get their situation in front of a law firm and follow its progress.
- **Motivation** - Know that their request reached the right place and whether anything has changed since they last checked.
- **Needs** - Clear intake questions, an easy way to find their lead or case again, and a place to share documents.
- **Requirements** - [Submit a lead](requirements.md#lead-intake-and-routing), [check progress and exchange PDFs](requirements.md#case-progress-and-pdfs), and [access only their own records](requirements.md#access-and-persistence).

## Attorney

A member of a law firm who reviews leads and works on cases.

- **Goals** - Decide which leads the firm can take and move accepted cases forward.
- **Motivation** - Make an informed decision from the initial inquiry and keep the plaintiff up to date once the firm takes the case.
- **Needs** - Enough detail to evaluate a lead and a clear view of the latest case progress, PDFs, and firm notes.
- **Requirements** - [Review, accept, or decline leads](requirements.md#lead-review), [update cases and exchange PDFs](requirements.md#case-progress-and-pdfs), and [write firm-private notes](requirements.md#firm-private-notes).

## Paralegal

A member of a law firm who can review leads and help keep cases current.

- **Goals** - Keep leads moving and make sure staff can find current case information.
- **Motivation** - Pick up work another staff member started without having to piece together what's already happened.
- **Needs** - A filterable firm inbox and quick access to case progress, PDFs, and firm notes.
- **Requirements** - [Review, accept, or decline leads](requirements.md#lead-review), [update cases and exchange PDFs](requirements.md#case-progress-and-pdfs), and [write firm-private notes](requirements.md#firm-private-notes).

The brief gives attorneys and paralegals the same lead review and case management capabilities.

## Admin

A platform admin who oversees leads and cases across firms.

- **Goals** - Resolve unmatched and declined leads, correct assignments, and review important changes.
- **Motivation** - Keep inquiries from getting stuck and be able to explain why a record moved or changed status.
- **Needs** - Search across firms, a clear view of the current assignment, and a record of who changed what and when.
- **Requirements** - [Search, resolve, and reassign records](requirements.md#admin-search-and-reassignment), [inspect audit history](requirements.md#audit-history), and [inspect firm-private notes when authorized](requirements.md#firm-private-notes).
