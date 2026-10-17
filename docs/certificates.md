# GitDojo completion certificates

GitDojo offers three versioned completion awards: Git Foundations, Branching and Collaboration,
and Git Recovery and History. Their fixed requirements live in
`apps/web/lib/certificates/awards.ts`. Change the criteria by adding a new version; preserve older
versions so previously issued credentials remain intelligible. The database also snapshots the
title, description, template, and full criteria at issuance, and verification displays this
snapshot even if current award definitions later change.

## Deploy

1. Set `NEXT_PUBLIC_SITE_URL` to the permanent HTTPS site origin. The verification links, issuer
   identity, signing-key URLs, and badge IDs are tied to it. Keep redirects serving old links if
   you later move domains.
2. Generate a 3072-bit RSA private key with `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out credential-key.pem`.
   Store the PEM in your deployment secrets as `GITDOJO_CREDENTIAL_PRIVATE_KEY`. Literal `\n`
   separators are accepted. Never commit the private key. Set a unique, stable
   `GITDOJO_CREDENTIAL_KEY_ID`, such as `rsa-2026-01`.
3. Apply migration `0006_certificates` with `pnpm --filter @gitdojo/web db:migrate` before
   deploying the new app. The release health check expects this migration.
4. Keep `DATABASE_URL` configured. Issuance is unavailable without the account database,
   identity provider, site origin, or signing key.

The dashboard shows each award's progress: requirements done and left, and the next lesson or
Practice task to finish, counted from the browser's progress as a guide. Before issuing, it asks
whether the learner's name may appear publicly (private by default). A signed-in learner requests issuance after finishing
all named lessons and Practice tasks. The server reads account completion rows and inserts a
single certificate per learner, award, and criteria version. The recipient name comes from the
signed-in account profile; GitDojo does not verify legal identity. The name is snapshotted on
issue. The PDF is available only to the owner.
The learner decides at issuance whether that name appears on the public verification page and in
badges. This choice is fixed for the issued credential, because signed and downloaded badges
cannot be recalled or silently changed.

The QR code points to `/verify/<uuid>`. The page displays the award, criteria, issue date,
credential ID, and revocation status. It discloses no email or account ID. The `/api/credentials`
endpoint serves an RS256-signed OpenBadgeCredential JWT. Public JWK URLs are retained in the
database after key rotation. The badge includes a W3C Bitstring Status List entry; the matching
signed status list is served in batches of 131,072 entries. Status lists use a 60-second cache.

For an incorrect issuance, run `node apps/web/scripts/revoke-certificate.mjs <credential-uuid>`
with database credentials in the environment. This updates both the verification page and the
status list. Revocation is permanent.

**Claim boundary:** existing lesson and Practice completion endpoints accept learner-reported
progress and validate the content ID. They do not independently replay exercise outcomes. The
certificate therefore states _completion_, not assessed skill or proficiency. Add server-side
exercise evidence before changing that claim.

After deployment, issue a credential in a dedicated test account and check its JWT signature
against the public JWK URL in the `kid` header. Check that its `iss`, `sub`, `jti`, and `nbf` claims
match the embedded credential. Revoke the test certificate and confirm that the matching bit in
the fetched status list changes from zero to one. Submit both valid and revoked samples to the
[1EdTech conformance process](https://standards.1edtech.org/open-badges/specifications/standards/v3p0/cert)
before stating that GitDojo is certified. The official issuer test also asks for a credential
issued to its conformance recipient and a demonstration of badge retrieval. Certification
requires 1EdTech membership and review; a working signed badge alone is not certification.
