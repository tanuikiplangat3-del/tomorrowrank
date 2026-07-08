// lib/report/pdf.ts
// Renders a clean, branded, multi-page PDF report from a structured narrative
// (written by Claude) using pdf-lib — pure JS, no Chromium/native deps, so it
// runs reliably inside the standalone container.

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

export interface ReportSection {
  heading: string;
  body?: string;        // paragraph text
  bullets?: string[];   // optional bullet list
}
export interface ReportContent {
  title: string;
  subtitle?: string;
  intro?: string;
  sections: ReportSection[];
}

// Welcome Tomorrow greens
const GREEN = rgb(0.16, 0.72, 0.47);
const DARK = rgb(0.09, 0.11, 0.10);
const GREY = rgb(0.36, 0.40, 0.38);
const BLACK = rgb(0.10, 0.10, 0.10);

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = (text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildReportPdf(content: ReportContent): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const need = (h: number) => { if (y - h < MARGIN + 40) newPage(); };

  const drawLines = (text: string, f: PDFFont, size: number, color = BLACK, gap = 4, indent = 0) => {
    const lines = wrap(text, f, size, CONTENT_W - indent);
    for (const ln of lines) {
      need(size + gap);
      page.drawText(ln, { x: MARGIN + indent, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };

  // ---- Header band ----
  page.drawRectangle({ x: 0, y: PAGE_H - 90, width: PAGE_W, height: 90, color: DARK });
  page.drawText("Welcome Tomorrow", { x: MARGIN, y: PAGE_H - 46, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("SEO & AI Visibility Report", { x: MARGIN, y: PAGE_H - 66, size: 11, font, color: GREEN });
  y = PAGE_H - 120;

  // ---- Title ----
  drawLines(content.title, bold, 22, DARK, 6);
  if (content.subtitle) { y -= 2; drawLines(content.subtitle, font, 12, GREY, 4); }
  y -= 8;
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 2, color: GREEN });
  y -= 18;

  if (content.intro) { drawLines(content.intro, font, 11, BLACK, 5); y -= 10; }

  // ---- Sections ----
  for (const s of content.sections) {
    need(30);
    y -= 6;
    drawLines(s.heading, bold, 14, DARK, 5);
    y -= 2;
    if (s.body) { drawLines(s.body, font, 11, BLACK, 5); }
    if (s.bullets?.length) {
      y -= 2;
      for (const b of s.bullets) {
        need(16);
        page.drawText("•", { x: MARGIN + 4, y: y - 11, size: 11, font: bold, color: GREEN });
        const lines = wrap(b, font, 11, CONTENT_W - 20);
        lines.forEach((ln, i) => {
          need(15);
          page.drawText(ln, { x: MARGIN + 18, y: y - 11, size: 11, font, color: BLACK });
          y -= 15;
          if (i < lines.length - 1) { /* continue */ }
        });
        y -= 3;
      }
    }
    y -= 8;
  }

  // ---- Footer on every page ----
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText("Welcome Tomorrow · welcometomorrow.io · seo@welcometomorrow.io", {
      x: MARGIN, y: 28, size: 8, font, color: GREY,
    });
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE_W - MARGIN - 60, y: 28, size: 8, font, color: GREY,
    });
  });

  return await doc.save();
}
