import "server-only";

import { indexLessons } from "@gitdojo/progress";
import { cache } from "react";
import { loadProgressCatalog } from "@/lib/progress-catalog";
import { isCredentialId } from "./ids";
import { publicCertificate, type PublicCertificate } from "./public-view";
import { findCertificate } from "./store";

export interface Requirement {
  id: string;
  title: string;
  /** The course a lesson belongs to, when it still exists. */
  course?: string;
}

export type CredentialLookup =
  | {
      status: "found";
      certificate: PublicCertificate;
      lessons: Requirement[];
      practice: Requirement[];
      /** When the record was read: the status shown is as of this moment. */
      checkedAt: Date;
    }
  | { status: "not-found" }
  /** The database could not be reached: say so, and never show the credential as valid. */
  | { status: "unavailable" };

const humanize = (id: string) => id.replaceAll("-", " ");

/**
 * Titles for an award's requirements, from the current content. The certificate stores ids, so a
 * lesson that was renamed shows its new title, and one that was removed still shows its id.
 */
async function requirements(certificate: PublicCertificate) {
  let lessons = new Map<string, Requirement>();
  let practice = new Map<string, Requirement>();
  try {
    const catalog = await loadProgressCatalog();
    lessons = new Map(
      [...indexLessons(catalog)].map(([id, lesson]) => [
        id,
        { id, title: lesson.title, ...(lesson.course ? { course: lesson.course.title } : {}) },
      ]),
    );
    practice = new Map(
      catalog.practice.map((task) => [task.id, { id: task.id, title: task.title }]),
    );
  } catch (error) {
    // Titles are a nicety: the ids are still shown, and the credential's status is unaffected.
    console.error("[gitdojo] could not load content titles for verification", error);
  }
  return {
    lessons: certificate.lessons.map((id) => lessons.get(id) ?? { id, title: humanize(id) }),
    practice: certificate.practice.map((id) => practice.get(id) ?? { id, title: humanize(id) }),
  };
}

/**
 * A credential as the public may see it, read from the database on every request (shared by the
 * page and its metadata within one request). Status always comes from the stored record, never
 * from the URL, a PDF or a QR code.
 */
export const lookupCredential = cache(async (id: string): Promise<CredentialLookup> => {
  if (!isCredentialId(id)) return { status: "not-found" };
  let found;
  try {
    found = await findCertificate(id.toLowerCase());
  } catch (error) {
    console.error("[gitdojo] credential lookup failed", error);
    return { status: "unavailable" };
  }
  if (!found) return { status: "not-found" };
  const certificate = publicCertificate(found);
  return {
    status: "found",
    certificate,
    ...(await requirements(certificate)),
    checkedAt: new Date(),
  };
});
