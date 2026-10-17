import { isUuid } from "@/lib/ids";

/** A credential id: the random UUID the database assigns. */
export function isCredentialId(value: string): boolean {
  return isUuid(value);
}

/** The public verification page, the same path the PDF, its QR code and the badge link to. */
export function verificationPath(id: string): string {
  return `/verify/${id}`;
}
