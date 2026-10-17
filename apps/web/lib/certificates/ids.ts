/** A credential id: the random UUID the database assigns (`gen_random_uuid()`), any case. */
const CREDENTIAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCredentialId(value: string): boolean {
  return CREDENTIAL_ID.test(value);
}

/** The public verification page, the same path the PDF, its QR code and the badge link to. */
export function verificationPath(id: string): string {
  return `/verify/${id}`;
}
