# Server-graded Git capstone

`/assessment` is separate from lessons, Practice mode and completion certificates. A signed-in
learner starts a fresh, isolated browser repository whose root commit contains a random marker
stored with the database attempt. The marker and rubric version bind a submission to that attempt.

On submission the browser exports the canonical, decompressed Git objects reachable from `HEAD`
and the reflog. It does not send a pass flag. The server:

1. limits the body and object count;
2. recomputes every Git SHA-1 from its type, byte length and content;
3. parses commit parent links and tree objects itself;
4. verifies the server-issued marker in the root tree; and
5. evaluates the versioned branching, merge/conflict and recovery rubric.

Malformed, missing or altered object graphs fail closed. A reset-away mistake remains available
through a verified reflog object, so both revert and reset are valid recovery solutions. Feedback
names the unmet rubric item without prescribing a command sequence.

Migration `0007_assessed_capstone` stores the attempt, rubric version, grade and submitted evidence.
Submission is locked and written transactionally. Repeating it returns the original result, and
the existing certificate uniqueness constraint prevents duplicate assessed credentials. Passing
creates a credential with `credential_kind = 'assessed'`; it never changes the three completion
awards or treats learner-reported progress as assessment evidence.

The public verification page and signed Open Badge identify the credential as server-graded and
show the rubric results. As with completion certificates, the account profile name is not an
independent legal-identity verification.
