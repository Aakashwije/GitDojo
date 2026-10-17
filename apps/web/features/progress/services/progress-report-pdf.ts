import { type ProgressReport } from "@gitdojo/progress";
// `import type`: erased completely, so jsPDF is only loaded by the dynamic import below.
import type { jsPDF } from "jspdf";

/**
 * The PDF progress report: a pure layout over a `ProgressReport` (`@gitdojo/progress`), drawn
 * with jsPDF entirely in the browser. Nothing here touches the network except loading GitDojo's
 * own logo from this site, and the report never contains more than the model holds.
 *
 * Text uses the PDF's built-in Helvetica, so it stays selectable and searchable. Those fonts
 * cover Latin-1 only; {@link toReportText} folds typographic punctuation to plain equivalents,
 * and the export dialog refuses names it could not print (see {@link isPrintableName}).
 */

/** The logo, already decoded and scaled for the page. */
export interface ReportLogo {
  dataUrl: string;
  width: number;
  height: number;
}

/** Where every piece of content landed, so tests can check page breaks and overlaps. */
export interface LayoutBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "text" | "card" | "bar" | "image";
  text?: string;
}

export interface ReportLayout {
  pages: number;
  boxes: LayoutBox[];
}

// A4 portrait, in points.
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 54;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
/** First content line on pages after the first (below the running header). */
const CONTENT_TOP = 78;
/** Nothing is drawn below this line except the footer. */
const CONTENT_BOTTOM = PAGE.height - 66;

type Rgb = readonly [number, number, number];

/** GitDojo's light-theme tokens (packages/ui/src/styles/theme.css). */
const COLORS = {
  text: [0x11, 0x18, 0x27],
  secondary: [0x3d, 0x47, 0x56],
  muted: [0x55, 0x60, 0x70],
  accent: [0x3a, 0x5a, 0xd6],
  accentSoft: [0xec, 0xf0, 0xfc],
  success: [0x11, 0x70, 0x3a],
  border: [0xd6, 0xdc, 0xe4],
  borderSubtle: [0xe4, 0xe8, 0xee],
  surface: [0xf4, 0xf6, 0xf9],
  track: [0xe5, 0xe9, 0xef],
} as const satisfies Record<string, Rgb>;

const PUNCTUATION: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  "•": "·",
  "→": "->",
  " ": " ",
};

function isLatin1Printable(code: number): boolean {
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
}

/** Text the built-in PDF fonts can show: typographic punctuation folded, anything else `?`. */
export function toReportText(text: string): string {
  let out = "";
  for (const char of text) {
    const mapped = PUNCTUATION[char];
    if (mapped !== undefined) out += mapped;
    else if (char === "\n" || isLatin1Printable(char.codePointAt(0) ?? 0)) out += char;
    else out += "?";
  }
  return out;
}

/** True when every character of a learner's name can be printed as typed. */
export function isPrintableName(name: string): boolean {
  for (const char of name) {
    if (!isLatin1Printable(char.codePointAt(0) ?? 0) && PUNCTUATION[char] === undefined) {
      return false;
    }
  }
  return true;
}

/** `gitdojo-progress-2026-10-17.pdf`, in the learner's own calendar day. */
export function reportFileName(exportedAt: number): string {
  const date = new Date(exportedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `gitdojo-progress-${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.pdf`;
}

const LONG_DATE = new Intl.DateTimeFormat("en", { dateStyle: "long" });
const SHORT_DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

interface TextStyle {
  size: number;
  bold?: boolean;
  color?: Rgb;
  /** Line height as a multiple of the font size. */
  leading?: number;
}

/** Draws top to bottom with a cursor, starting a new page whenever content would not fit. */
class Writer {
  y = 0;
  readonly boxes: LayoutBox[] = [];
  /** The section being drawn, named again at the top of a page it continues onto. */
  section: string | null = null;

  constructor(readonly doc: jsPDF) {}

  get page(): number {
    return this.doc.getNumberOfPages();
  }

  /** Makes room for `height` points, on a new page when this one is full. */
  ensure(height: number): void {
    if (this.y + height <= CONTENT_BOTTOM) return;
    this.doc.addPage("a4", "portrait");
    this.y = CONTENT_TOP;
    if (this.section !== null) {
      this.text(`${this.section} (continued)`, { size: 9, bold: true, color: COLORS.muted });
      this.y += 8;
    }
  }

  style({ size, bold = false, color = COLORS.text }: TextStyle): void {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(color[0], color[1], color[2]);
  }

  lines(text: string, width: number, style: TextStyle): string[] {
    this.style(style);
    return this.doc.splitTextToSize(toReportText(text), width) as string[];
  }

  /** Height of `text` wrapped to `width`. */
  measure(text: string, width: number, style: TextStyle): number {
    return this.lines(text, width, style).length * style.size * (style.leading ?? 1.35);
  }

  /**
   * Draws wrapped text at the cursor (or at `x`), moving the cursor below it unless `stay`.
   * Returns the height drawn.
   */
  text(
    text: string,
    style: TextStyle,
    {
      x = MARGIN,
      width = CONTENT_WIDTH,
      y = this.y,
      align = "left",
      stay = false,
      url,
    }: {
      x?: number;
      width?: number;
      y?: number;
      align?: "left" | "right";
      stay?: boolean;
      url?: string;
    } = {},
  ): number {
    const lines = this.lines(text, width, style);
    const lineHeight = style.size * (style.leading ?? 1.35);
    lines.forEach((line, index) => {
      // `top` baseline keeps the measured box and the drawn glyphs in the same place.
      const lineY = y + index * lineHeight;
      const anchorX = align === "right" ? x + width : x;
      this.doc.text(line, anchorX, lineY, { baseline: "top", align });
      if (url) {
        const lineWidth = this.doc.getTextWidth(line);
        this.doc.link(align === "right" ? anchorX - lineWidth : x, lineY, lineWidth, style.size, {
          url,
        });
      }
    });
    const height = lines.length * lineHeight;
    this.boxes.push({ page: this.page, x, y, width, height, kind: "text", text: lines.join(" ") });
    if (!stay) this.y = y + height;
    return height;
  }

  fill(color: Rgb): void {
    this.doc.setFillColor(color[0], color[1], color[2]);
  }

  stroke(color: Rgb, width = 0.75): void {
    this.doc.setDrawColor(color[0], color[1], color[2]);
    this.doc.setLineWidth(width);
  }
}

/** The opening block on page 1: logo, tagline, title, learner and date. */
function drawCover(writer: Writer, report: ProgressReport, logo: ReportLogo | undefined): void {
  const { doc } = writer;
  writer.fill(COLORS.accent);
  doc.rect(0, 0, PAGE.width, 6, "F");

  let top = 40;
  if (logo) {
    // Fixed height, width from the artwork's own ratio: never stretched.
    const height = 46;
    const width = (logo.width / logo.height) * height;
    doc.addImage(logo.dataUrl, "PNG", MARGIN, top, width, height, "gitdojo-logo", "FAST");
    writer.boxes.push({ page: 1, x: MARGIN, y: top, width, height, kind: "image" });
    top += height + 6;
  } else {
    // Wordmark fallback when the logo could not be loaded: "Git" dark, "Dojo" blue.
    writer.style({ size: 26, bold: true });
    doc.text("Git", MARGIN, top, { baseline: "top" });
    const gitWidth = doc.getTextWidth("Git");
    writer.style({ size: 26, bold: true, color: COLORS.accent });
    doc.text("Dojo", MARGIN + gitWidth, top, { baseline: "top" });
    writer.boxes.push({
      page: 1,
      x: MARGIN,
      y: top,
      width: 120,
      height: 32,
      kind: "text",
      text: "GitDojo",
    });
    top += 38;
  }
  writer.text("Learn Git by doing.", { size: 10.5, color: COLORS.muted }, { y: top });

  writer.y += 26;
  writer.text("Progress report", { size: 26, bold: true, leading: 1.15 });
  writer.y += 6;
  writer.text(report.learnerName, { size: 15, bold: true, color: COLORS.accent });
  writer.y += 2;
  writer.text(`Exported ${LONG_DATE.format(report.exportedAt)}`, {
    size: 10,
    color: COLORS.muted,
  });
  writer.y += 16;
  writer.stroke(COLORS.borderSubtle);
  doc.line(MARGIN, writer.y, PAGE.width - MARGIN, writer.y);
  writer.y += 18;
}

/** A section heading, kept on the same page as at least `keepWith` points of what follows. */
function heading(writer: Writer, title: string, keepWith = 60): void {
  // A heading never says "continued": it starts its own section.
  writer.section = null;
  writer.ensure(34 + keepWith);
  writer.y += 10;
  writer.text(title, { size: 14, bold: true });
  writer.y += 8;
  writer.section = title;
}

function drawSummary(writer: Writer, report: ProgressReport): void {
  heading(writer, "Overview");
  writer.ensure(writer.measure(report.summary, CONTENT_WIDTH, { size: 11 }));
  writer.text(report.summary, { size: 11, color: COLORS.secondary });
  writer.y += 14;

  // Stat cards, three to a row; each card's text is the label, so nothing relies on colour.
  const columns = 3;
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const padding = 10;
  for (let row = 0; row < report.stats.length; row += columns) {
    const stats = report.stats.slice(row, row + columns);
    const height = Math.max(
      ...stats.map(
        (stat) =>
          padding * 2 +
          writer.measure(stat.label, width - padding * 2, { size: 9 }) +
          26 +
          (stat.detail ? writer.measure(stat.detail, width - padding * 2, { size: 8.5 }) : 0),
      ),
    );
    writer.ensure(height);
    const top = writer.y;
    stats.forEach((stat, index) => {
      const x = MARGIN + index * (width + gap);
      writer.fill(COLORS.surface);
      writer.stroke(COLORS.borderSubtle);
      writer.doc.roundedRect(x, top, width, height, 6, 6, "FD");
      writer.boxes.push({ page: writer.page, x, y: top, width, height, kind: "card" });
      const inner = { x: x + padding, width: width - padding * 2 };
      let y = top + padding;
      y += writer.text(stat.label, { size: 9, color: COLORS.muted }, { ...inner, y, stay: true });
      y += 2;
      y += writer.text(
        stat.value.toLocaleString("en"),
        { size: 20, bold: true, leading: 1.1 },
        {
          ...inner,
          y,
          stay: true,
        },
      );
      if (stat.detail) {
        writer.text(
          stat.detail,
          { size: 8.5, color: COLORS.muted },
          { ...inner, y: y + 2, stay: true },
        );
      }
    });
    writer.y = top + height + gap;
  }
}

function drawCourses(writer: Writer, report: ProgressReport): void {
  if (report.courses.length === 0) return;
  heading(writer, "Course progress");
  const numberWidth = 150;
  for (const course of report.courses) {
    const label = `${String(course.completed)} of ${String(course.total)} lessons · ${String(course.percent)}%`;
    const titleHeight = writer.measure(course.title, CONTENT_WIDTH - numberWidth - 12, {
      size: 11,
      bold: true,
    });
    writer.ensure(titleHeight + 22);
    const top = writer.y;
    writer.text(
      course.title,
      { size: 11, bold: true },
      { width: CONTENT_WIDTH - numberWidth - 12, stay: true },
    );
    writer.text(
      label,
      { size: 10, color: COLORS.secondary },
      {
        x: PAGE.width - MARGIN - numberWidth,
        width: numberWidth,
        align: "right",
        stay: true,
      },
    );
    const barY = top + titleHeight + 4;
    // The bar repeats what the text says; complete courses also say so in words.
    writer.fill(COLORS.track);
    writer.doc.roundedRect(MARGIN, barY, CONTENT_WIDTH, 6, 3, 3, "F");
    if (course.percent > 0) {
      writer.fill(course.percent === 100 ? COLORS.success : COLORS.accent);
      writer.doc.roundedRect(MARGIN, barY, (CONTENT_WIDTH * course.percent) / 100, 6, 3, 3, "F");
    }
    writer.boxes.push({
      page: writer.page,
      x: MARGIN,
      y: barY,
      width: CONTENT_WIDTH,
      height: 6,
      kind: "bar",
    });
    writer.y = barY + 6 + 12;
  }
}

function drawSkills(writer: Writer, report: ProgressReport): void {
  const { skills } = report;
  if (!skills) return;
  heading(writer, "Skills practiced");
  writer.ensure(writer.measure(skills.masteryRule, CONTENT_WIDTH, { size: 9 }));
  writer.text(skills.masteryRule, { size: 9, color: COLORS.muted });
  writer.y += 8;
  const statusWidth = 80;
  const countWidth = 120;
  const labelWidth = CONTENT_WIDTH - statusWidth - countWidth - 16;
  for (const skill of skills.practiced) {
    const height = Math.max(16, writer.measure(skill.label, labelWidth, { size: 10.5 })) + 6;
    writer.ensure(height);
    const top = writer.y;
    writer.text(skill.label, { size: 10.5 }, { width: labelWidth, stay: true });
    writer.text(
      skill.status === "mastered" ? "Mastered" : "Practiced",
      {
        size: 10,
        bold: true,
        color: skill.status === "mastered" ? COLORS.success : COLORS.accent,
      },
      { x: MARGIN + labelWidth + 8, width: statusWidth, stay: true },
    );
    writer.text(
      `${String(skill.handsOn)} of ${String(skill.available)} hands-on`,
      {
        size: 9.5,
        color: COLORS.muted,
      },
      { x: PAGE.width - MARGIN - countWidth, width: countWidth, align: "right", stay: true },
    );
    writer.stroke(COLORS.borderSubtle, 0.5);
    writer.doc.line(MARGIN, top + height - 2, PAGE.width - MARGIN, top + height - 2);
    writer.y = top + height + 2;
  }
  if (skills.untouchedCount > 0) {
    writer.y += 4;
    writer.ensure(14);
    writer.text(
      `${String(skills.untouchedCount)} more skill${skills.untouchedCount === 1 ? "" : "s"} not practiced hands-on yet.`,
      { size: 9.5, color: COLORS.muted },
    );
  }
}

function drawActivity(writer: Writer, report: ProgressReport): void {
  if (report.activity.length === 0) return;
  heading(writer, "Recent activity");
  const dateWidth = 80;
  const rewardWidth = 56;
  const titleWidth = CONTENT_WIDTH - dateWidth - rewardWidth - 16;
  for (const item of report.activity) {
    const detail = item.context ? `${item.kind} · ${item.context}` : item.kind;
    const height =
      writer.measure(item.title, titleWidth, { size: 10.5 }) +
      writer.measure(detail, titleWidth, { size: 9 }) +
      8;
    writer.ensure(height);
    const top = writer.y;
    writer.text(
      SHORT_DATE.format(item.completedAt),
      { size: 9.5, color: COLORS.muted },
      {
        width: dateWidth,
        stay: true,
      },
    );
    const titleHeight = writer.text(
      item.title,
      { size: 10.5 },
      {
        x: MARGIN + dateWidth + 8,
        width: titleWidth,
        stay: true,
      },
    );
    writer.text(
      detail,
      { size: 9, color: COLORS.muted },
      {
        x: MARGIN + dateWidth + 8,
        y: top + titleHeight,
        width: titleWidth,
        stay: true,
      },
    );
    writer.text(
      item.reward,
      { size: 9.5, color: COLORS.secondary },
      {
        x: PAGE.width - MARGIN - rewardWidth,
        width: rewardWidth,
        align: "right",
        stay: true,
      },
    );
    writer.y = top + height;
  }
}

function drawCommands(writer: Writer, report: ProgressReport): void {
  if (report.commands.length === 0) return;
  heading(writer, "Most used Git commands");
  writer.text("Each command typed counts once; succeeded means Git ran it without an error.", {
    size: 9,
    color: COLORS.muted,
  });
  writer.y += 6;
  const numberWidth = 70;
  for (const command of report.commands) {
    writer.ensure(16);
    const top = writer.y;
    writer.text(
      `git ${command.command}`,
      { size: 10.5 },
      { width: CONTENT_WIDTH - numberWidth * 2, stay: true },
    );
    writer.text(
      `${String(command.uses)} used`,
      { size: 9.5, color: COLORS.secondary },
      {
        x: PAGE.width - MARGIN - numberWidth * 2,
        width: numberWidth,
        align: "right",
        stay: true,
      },
    );
    writer.text(
      `${String(command.successes)} succeeded`,
      { size: 9.5, color: COLORS.muted },
      {
        x: PAGE.width - MARGIN - numberWidth,
        width: numberWidth,
        align: "right",
        stay: true,
      },
    );
    writer.y = top + 16;
  }
}

function drawNextSteps(writer: Writer, report: ProgressReport): void {
  if (report.nextSteps.length === 0) return;
  heading(writer, "Recommended next");
  for (const step of report.nextSteps) {
    const height =
      writer.measure(step.reason, CONTENT_WIDTH - 16, { size: 9 }) +
      writer.measure(step.title, CONTENT_WIDTH - 16, { size: 11, bold: true }) +
      14;
    writer.ensure(height);
    const top = writer.y;
    writer.fill(COLORS.accent);
    writer.doc.rect(MARGIN, top, 3, height - 8, "F");
    const x = MARGIN + 14;
    const width = CONTENT_WIDTH - 14;
    const reasonHeight = writer.text(
      step.reason,
      { size: 9, color: COLORS.muted },
      { x, width, stay: true },
    );
    writer.text(
      step.title,
      { size: 11, bold: true, color: step.url ? COLORS.accent : COLORS.text },
      {
        x,
        width,
        y: top + reasonHeight + 1,
        stay: true,
        ...(step.url ? { url: step.url } : {}),
      },
    );
    writer.y = top + height;
  }
}

/** Running header (pages 2+) and footer with page numbers, drawn once every page exists. */
function drawPageChrome(writer: Writer, report: ProgressReport): void {
  const { doc } = writer;
  const total = doc.getNumberOfPages();
  const date = LONG_DATE.format(report.exportedAt);
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      writer.fill(COLORS.accent);
      doc.rect(0, 0, PAGE.width, 4, "F");
      writer.style({ size: 9, bold: true, color: COLORS.accent });
      doc.text("GitDojo", MARGIN, 40, { baseline: "top" });
      writer.style({ size: 9, color: COLORS.muted });
      doc.text(toReportText(`Progress report · ${report.learnerName}`), PAGE.width - MARGIN, 40, {
        baseline: "top",
        align: "right",
      });
      writer.stroke(COLORS.borderSubtle, 0.5);
      doc.line(MARGIN, 58, PAGE.width - MARGIN, 58);
    }
    const footerY = PAGE.height - 42;
    writer.stroke(COLORS.borderSubtle, 0.5);
    doc.line(MARGIN, footerY - 8, PAGE.width - MARGIN, footerY - 8);
    writer.style({ size: 8.5, color: COLORS.muted });
    doc.text(`GitDojo · Learn Git by doing. · Exported ${date}`, MARGIN, footerY, {
      baseline: "top",
    });
    doc.text(`Page ${String(page)} of ${String(total)}`, PAGE.width - MARGIN, footerY, {
      baseline: "top",
      align: "right",
    });
  }
}

/** Lays the whole report out on `doc` (a fresh A4 jsPDF in points) and says where it went. */
export function renderProgressReport(
  doc: jsPDF,
  report: ProgressReport,
  logo?: ReportLogo,
): ReportLayout {
  const writer = new Writer(doc);
  doc.setProperties({
    title: toReportText(`GitDojo progress report: ${report.learnerName}`),
    subject: "Git learning progress",
    creator: "GitDojo",
  });
  doc.setLanguage("en-US");
  drawCover(writer, report, logo);
  drawSummary(writer, report);
  drawCourses(writer, report);
  drawSkills(writer, report);
  drawActivity(writer, report);
  drawCommands(writer, report);
  drawNextSteps(writer, report);
  drawPageChrome(writer, report);
  return { pages: doc.getNumberOfPages(), boxes: writer.boxes };
}

/** Creates the report as a PDF file. jsPDF is loaded only now, so it never slows the dashboard. */
export async function createProgressReportPdf(
  report: ProgressReport,
  { logo, compress = true }: { logo?: ReportLogo; compress?: boolean } = {},
): Promise<{ blob: Blob; pages: number }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress });
  const { pages } = renderProgressReport(doc, report, logo);
  return { blob: doc.output("blob"), pages };
}

/** Bounds every layout must respect, exported for tests. */
export const REPORT_PAGE = {
  ...PAGE,
  margin: MARGIN,
  contentTop: CONTENT_TOP,
  contentBottom: CONTENT_BOTTOM,
};

/**
 * GitDojo's logo for light backgrounds (`gitdojo-logo-light.png`: dark "Git", blue "Dojo"),
 * scaled down so the PDF stays small. Resolves to `undefined` when it cannot be loaded or
 * decoded, and the report falls back to a text wordmark.
 */
export async function loadReportLogo(
  src = "/brand/gitdojo-logo-light.png",
): Promise<ReportLogo | undefined> {
  try {
    const response = await fetch(src);
    if (!response.ok) return undefined;
    const bitmap = await createImageBitmap(await response.blob());
    const width = Math.min(640, bitmap.width);
    const height = Math.round((bitmap.height / bitmap.width) * width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  } catch {
    // A missing logo is cosmetic: the report still downloads, with the text wordmark.
    return undefined;
  }
}
