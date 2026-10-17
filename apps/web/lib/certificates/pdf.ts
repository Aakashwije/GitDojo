import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { verificationUrl } from "./credential";
import type { Certificate } from "./store";

/** Measured against the artwork (A4 landscape, in points). */
const NAME_BASELINE = 378;
/** A two-line name sits a little lower, so its first line clears "Presented to". */
const TWO_LINE_BASELINE = 382;
const NAME_WIDTH = 470;
const NAME_SIZES = { max: 30, min: 16, smallest: 11 };
/**
 * Right of the "Learn Git by doing" tagline, below the band covering the artwork's claim (which
 * ends at y 468), and left of the gold corner line.
 */
export const VERIFY_PANEL = { x: 536, y: 472, width: 132, height: 76, qr: 64 };
/** Between the signature lines and the inner border. */
const FOOTER_BASELINES = [553, 562] as const;
const FOOTER_WIDTH = 400;
const SHORT_DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/**
 * The size and lines for the holder's name: as large as fits on one line down to `min`, then two
 * lines, shrinking further only if two lines at `min` are still too wide.
 */
export function fitName(doc: jsPDF, name: string): { size: number; lines: string[] } {
  for (let size = NAME_SIZES.max; size >= NAME_SIZES.min; size -= 1) {
    doc.setFontSize(size);
    if (doc.getTextWidth(name) <= NAME_WIDTH) return { size, lines: [name] };
  }
  for (let size = NAME_SIZES.min; size >= NAME_SIZES.smallest; size -= 1) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(name, NAME_WIDTH) as string[];
    if (lines.length <= 2) return { size, lines };
  }
  doc.setFontSize(NAME_SIZES.smallest);
  return { size: NAME_SIZES.smallest, lines: doc.splitTextToSize(name, NAME_WIDTH) as string[] };
}

/** The background is decorative; every issued detail remains real PDF text. */
export async function certificatePdf(
  certificate: Certificate,
  { compress = true }: { compress?: boolean } = {},
): Promise<Uint8Array> {
  const award = certificate.evidence;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const image = await readFile(path.join(process.cwd(), "public", "certificates", award.template));
  doc.addImage(new Uint8Array(image), "PNG", 0, 0, width, height, undefined, "FAST");

  // Covers the artwork's fixed claim about demonstrated skills; the current API records
  // learner-reported completion, so that stronger claim would be inaccurate.
  doc.setFillColor(255, 255, 255);
  doc.rect(108, 402, 625, 66, "F");
  doc.setTextColor(10, 35, 85);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.text("For completing the required GitDojo lessons and Practice mode tasks.", width / 2, 436, {
    align: "center",
  });
  doc.setFontSize(9);
  doc.text(
    "Completion records are learner-reported; exercise outcomes are not independently checked.",
    width / 2,
    453,
    {
      align: "center",
    },
  );

  // The template leaves this line blank for the learner's name: one line when it fits at a
  // readable size, otherwise two, so a long name never runs past the line or onto the text above.
  doc.setFont("times", "bold");
  const name = fitName(doc, certificate.recipientName);
  doc.setFontSize(name.size);
  const lastBaseline = name.lines.length > 1 ? TWO_LINE_BASELINE : NAME_BASELINE;
  name.lines.forEach((line, index) => {
    doc.text(line, width / 2, lastBaseline - (name.lines.length - 1 - index) * name.size * 1.1, {
      align: "center",
    });
  });

  // The verification panel sits in the clear space right of the tagline, inside the corner art.
  const url = verificationUrl(certificate.id);
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  const { x, y, width: panelWidth, height: panelHeight, qr: qrSize } = VERIFY_PANEL;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, panelWidth, panelHeight, 5, 5, "F");
  doc.addImage(qr, "PNG", x + 6, y + 6, qrSize, qrSize);
  doc.link(x + 6, y + 6, qrSize, qrSize, { url });
  const column = x + qrSize + 11;
  doc.setTextColor(26, 49, 92);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("SCAN TO", column, y + 16);
  doc.text("VERIFY", column, y + 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("Issued", column, y + 42);
  doc.text(SHORT_DATE.format(certificate.issuedAt), column, y + 51);
  doc.text("(UTC)", column, y + 60);

  // The id and the exact URL as plain text, for when the code can't be scanned.
  const lines = [`Credential ID: ${certificate.id}`, `Verify at ${url}`];
  doc.setFontSize(7);
  while (
    Math.max(...lines.map((line) => doc.getTextWidth(line))) > FOOTER_WIDTH &&
    doc.getFontSize() > 5
  ) {
    doc.setFontSize(doc.getFontSize() - 0.5);
  }
  doc.text(lines[0] ?? "", width / 2, FOOTER_BASELINES[0], { align: "center" });
  doc.text(lines[1] ?? "", width / 2, FOOTER_BASELINES[1], { align: "center" });
  const urlWidth = doc.getTextWidth(lines[1] ?? "");
  doc.link((width - urlWidth) / 2, FOOTER_BASELINES[1] - 7, urlWidth, 9, { url });
  return new Uint8Array(doc.output("arraybuffer"));
}
