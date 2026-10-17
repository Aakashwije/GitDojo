# GitDojo completion certificates

GitDojo offers three versioned completion awards: Git Foundations, Branching and Collaboration,
and Git Recovery and History. Their fixed requirements live in
`apps/web/lib/certificates/awards.ts`. Change the criteria by adding a new version; preserve older
versions so previously issued credentials remain intelligible. The database also snapshots the
title, description, template, and full criteria at issuance, and verification displays this
snapshot even if current award definitions later change.

## Deploy

1. Set `NEXT_PUBLIC_SITE_URL` to the permanent HTTPS site origin of each environment (the
   production origin in production, the staging origin in staging). The verification links,
   issuer identity, signing-key URLs, and badge IDs are tied to it. Keep redirects serving old
   links if you later move domains.
2. Generate a 3072-bit RSA private key with `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out credential-key.pem`.
   Store the PEM in your deployment secrets as `GITDOJO_CREDENTIAL_PRIVATE_KEY`. Literal `\n`
   separators are accepted. Never commit the private key. Set a unique, stable
   `GITDOJO_CREDENTIAL_KEY_ID`, such as `rsa-2026-01`.
3. Apply migrations through `0007_assessed_capstone` with `pnpm --filter @gitdojo/web db:migrate` before
   deploying the new app. The release health check expects this migration.
4. Keep `DATABASE_URL` configured. Issuance is unavailable without the account database,
   identity provider, site origin, or signing key.

The dashboard shows each award's progress: requirements done and left, and the next lesson or
Practice task to finish, counted from the browser's progress as a guide. Before issuing, it asks
whether the learner's name may appear publicly (private by default): the PDF always shows the
name, and the public page and badge show it only with consent. A signed-in learner requests
issuance after finishing all named lessons and Practice tasks. The server reads account completion rows and inserts a
single certificate per learner, award, and criteria version. The recipient name comes from the
signed-in account profile; GitDojo does not verify legal identity. The name is snapshotted on
issue. The PDF is available only to the owner.
The learner decides at issuance whether that name appears on the public verification page and in
badges. This choice is fixed for the issued credential, because signed and downloaded badges
cannot be recalled or silently changed.

## Verification

Every PDF prints its credential ID and the exact verification URL,
`<NEXT_PUBLIC_SITE_URL>/verify/<uuid>`, as selectable text, and its QR code encodes the same URL
(`verificationUrl` in `lib/certificates/credential.ts`; the signed badge cites it as evidence and
the dashboard's "Copy verification link" copies it). Long names wrap onto two lines rather than
running past the name line, and the QR panel sits clear of the artwork's text.

`/verify/[id]` is public and needs no sign-in. On every request it reads the certificate from the
database by its random ID (`lookupCredential`) and shows:

- **Status:** **Valid** or **Revoked**, as text with an icon as well as colour, read from the
  stored record only, never from the URL, the PDF or the QR code. A revoked certificate says so
  however old the shared PDF is.
- **Details:** title, GitDojo as issuer, holder, issue date and time in UTC, credential ID and
  criteria version.
- **Criteria:** the snapshotted criteria, with the required lessons and Practice tasks by their
  current titles.

Only `publicCertificate` fields reach the page: no email, account ID or status index. The holder
is the name stored at issuance when the learner agreed to show it, and "Name withheld by
learner" otherwise. Page metadata follows the same rule.

- **Not found:** a malformed or unknown ID shows a "Credential not found" page with a 404 status.
- **Unavailable:** if the database cannot be read, the page says verification is unavailable and
  neither confirms nor denies the credential.
- **Never cached or indexed:** responses are dynamic and sent with `Cache-Control: no-store`, so a
  revocation shows at once. They carry `robots` noindex metadata and an
  `X-Robots-Tag: noindex, nofollow, noarchive` header (`next.config.ts`).

The page is GitDojo's live record. It is not a cryptographic proof; the signed Open Badge is.
The `/api/credentials` endpoint serves an RS256-signed OpenBadgeCredential JWT. Public JWK URLs
are retained in the database after key rotation. The badge includes a W3C Bitstring Status List entry; the matching
signed status list is served in batches of 131,072 entries. Status lists use a 60-second cache.

For an incorrect issuance, run `node apps/web/scripts/revoke-certificate.mjs <credential-uuid>`
with database credentials in the environment. This updates both the verification page and the
status list. Revocation is permanent.

**Claim boundary:** existing lesson and Practice completion endpoints accept learner-reported
progress and validate the content ID. They do not independently replay exercise outcomes. The
three certificates therefore state _completion_, not assessed skill or proficiency. The separate
Git Practical Skills credential is issued only from the server-graded, versioned capstone evidence
described in [assessment.md](./assessment.md); it does not upgrade or relabel completion records.

After deployment, issue a credential in a dedicated test account and check its JWT signature
against the public JWK URL in the `kid` header. Check that its `iss`, `sub`, `jti`, and `nbf` claims
match the embedded credential. Revoke the test certificate and confirm that the matching bit in
the fetched status list changes from zero to one. Submit both valid and revoked samples to the
[1EdTech conformance process](https://standards.1edtech.org/open-badges/specifications/standards/v3p0/cert)
before stating that GitDojo is certified. The official issuer test also asks for a credential
issued to its conformance recipient and a demonstration of badge retrieval. Certification
requires 1EdTech membership and review; a working signed badge alone is not certification.
