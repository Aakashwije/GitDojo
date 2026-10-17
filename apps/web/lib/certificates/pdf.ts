import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { credentialOrigin } from "./credential";
import type { Certificate } from "./store";

/** The background is decorative; every issued detail remains real PDF text. */
export async function certificatePdf(certificate: Certificate): Promise<Uint8Array> {
  const award = certificate.evidence;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
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
  doc.text("Completion records are learner-reported; exercise outcomes are not independently checked.", width / 2, 453, {
    align: "center",
  });

  // The template leaves this line blank for the learner's name.
  doc.setFont("times", "bold");
  doc.setFontSize(30);
  const name = certificate.recipientName;
  while (doc.getTextWidth(name) > 470 && doc.getFontSize() > 12) {
    doc.setFontSize(doc.getFontSize() - 1);
  }
  doc.text(name, width / 2, 378, { align: "center" });

  const url = `${credentialOrigin()}/verify/${certificate.id}`;
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(558, 468, 188, 83, 5, 5, "F");
  doc.addImage(qr, "PNG", 565, 474, 68, 68);
  doc.setTextColor(26, 49, 92);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("VERIFY CREDENTIAL", 640, 488);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Issued ${certificate.issuedAt.toISOString().slice(0, 10)}`, 640, 501);
  doc.text("ID", 640, 514);
  doc.setFontSize(6);
  doc.text(certificate.id, 640, 524);
  doc.link(565, 474, 180, 68, { url });
  doc.setFontSize(6);
  doc.text(url, width / 2, 560, { align: "center" });
  doc.link((width - doc.getTextWidth(url)) / 2, 550, doc.getTextWidth(url), 12, { url });
  return new Uint8Array(doc.output("arraybuffer"));
}
