import { type LocalProgress } from "./model";

export const EXPORT_FORMAT = "gitdojo-progress";
/** Version of the export envelope; the progress inside carries its own `schemaVersion`. */
export const EXPORT_VERSION = 1;

export interface ProgressExport {
  format: typeof EXPORT_FORMAT;
  exportVersion: typeof EXPORT_VERSION;
  exportedAt: string;
  progress: LocalProgress;
}

/** A self-describing, versioned snapshot of local progress, for download. */
export function exportProgress(progress: LocalProgress, now: number): ProgressExport {
  return {
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    progress,
  };
}

/** `gitdojo-progress-2026-10-04.json` */
export function exportFileName(now: number): string {
  return `gitdojo-progress-${new Date(now).toISOString().slice(0, 10)}.json`;
}
