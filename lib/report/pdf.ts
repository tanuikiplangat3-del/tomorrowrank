// lib/report/pdf.ts
// Renders the emailed PDF report to visually and structurally match the web
// dashboard — same dark theme, same real data (scores, keywords, backlinks,
// issues), same colors — rather than a plain light-background text document.
// Pure pdf-lib (no Chromium), so it still runs reliably in the container.

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import type { AuditReport, AiVisibilityReport } from "@/types/audit";

// Short, targeted prose blurbs Claude writes FROM the real data below — it no
// longer structures the whole report (that's done directly from real data
// now), just explains it in a few places.
export interface ReportNarrative {
  executiveSummary: string;      // 2-3 sentences
  technicalSummary: string;      // 1-2 sentences
  aiVisibilitySummary: string;   // 1-2 sentences, "" if no AI data
  recommendationsIntro: string;  // 1 sentence
}

// ---- Dashboard's exact palette ----
const BG = rgb(0.043, 0.063, 0.055);        // near-black dark background
const PAPER = rgb(0.933, 0.933, 0.933);     // primary light text
const MUTED = rgb(0.725, 0.761, 0.737);     // secondary/grey text
const GREEN = rgb(0.298, 0.651, 0.420);     // wtgreen — brand accent
const GOOD = rgb(0.298, 0.651, 0.420);
const WARN = rgb(0.886, 0.702, 0.251);
const BAD = rgb(0.941, 0.416, 0.353);

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

// pdf-lib standard fonts use WinAnsi (CP1252) and throw on characters outside
// it (smart quotes, emoji, arrows, etc. from Claude's prose or scraped page
// titles). Map common ones to safe equivalents; strip anything else so the
// PDF never fails to render regardless of what real-world text comes through.
function sanitize(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .replace(/[\u2264]/g, "<=").replace(/[\u2265]/g, ">=")
    .replace(/[\u2192\u2794\u27a4]/g, "->").replace(/[\u2190]/g, "<-")
    .replace(/[\u00d7]/g, "x").replace(/[\u2022\u25cf\u25aa]/g, "-")
    .replace(/[\u2018\u2019\u201b]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/[\u2026]/g, "...")
    .replace(/[\u00a0]/g, " ").replace(/[\u2122]/g, "(TM)").replace(/[\u00ae]/g, "(R)")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = sanitize(text).replace(/\s+/g, " ").trim().split(" ");
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

function scoreColor(score: number) {
  return score >= 85 ? GOOD : score >= 70 ? GREEN : score >= 50 ? WARN : BAD;
}

function severityBand(priority: number): { label: string; color: typeof BAD } {
  if (priority <= 2) return { label: "Very High", color: BAD };
  if (priority <= 4) return { label: "High", color: BAD };
  if (priority <= 6) return { label: "Medium", color: WARN };
  if (priority <= 8) return { label: "Low", color: GOOD };
  return { label: "Very Low", color: MUTED };
}

export async function buildReportPdf(
  report: AuditReport,
  ai: AiVisibilityReport | undefined,
  narrative: ReportNarrative
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const makePage = (): PDFPage => {
    const p = doc.addPage([PAGE_W, PAGE_H]);
    // Dark background FIRST, so all subsequent content on this page draws on
    // top of it — matches the dashboard's dark theme instead of a plain
    // white page with just a header band.
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BG });
    return p;
  };

  let page: PDFPage = makePage();
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = makePage();
    y = PAGE_H - MARGIN;
  };
  const need = (h: number) => { if (y - h < MARGIN + 30) newPage(); };

  const text = (t: string, x: number, size: number, f: PDFFont, color = PAPER) => {
    page.drawText(sanitize(t), { x, y: y - size, size, font: f, color });
  };

  const drawLines = (t: string, f: PDFFont, size: number, color = PAPER, gap = 5, x = MARGIN, maxW = CONTENT_W) => {
    for (const ln of wrap(t, f, size, maxW)) {
      need(size + gap);
      text(ln, x, size, f, color);
      y -= size + gap;
    }
  };

  const sectionHeading = (title: string) => {
    need(34);
    y -= 8;
    text(title, MARGIN, 15, bold, PAPER);
    y -= 21; // clear the full text height (15) + descender/gap before the underline
    page.drawRectangle({ x: MARGIN, y, width: 36, height: 2.5, color: GREEN });
    y -= 14;
  };

  // ================= PAGE 1: HERO =================
  text("Welcome Tomorrow", MARGIN, 12, bold, GREEN);
  text("SEO & AI Visibility Report", PAGE_W - MARGIN - 160, 10, font, MUTED);
  y -= 26;

  const pageTitle = report.meta.pageTitle || report.meta.finalUrl;
  drawLines(pageTitle, bold, 18, PAPER, 6);
  drawLines(report.meta.finalUrl, font, 10, MUTED, 4);
  y -= 8;

  // Embedded homepage screenshot — the single biggest fidelity win vs. the
  // old plain-text PDF. Best-effort: if embedding fails for any reason
  // (corrupt data URL, unsupported format), skip it silently rather than
  // failing the whole report.
  if (report.meta.screenshotDesktop) {
    try {
      const b64 = report.meta.screenshotDesktop.split(",")[1];
      const bytes = Buffer.from(b64, "base64");
      const img = await doc.embedPng(bytes);
      const scale = CONTENT_W / img.width;
      const h = Math.min(img.height * scale, 190); // cap height so it can't dominate the page
      need(h + 12);
      page.drawImage(img, { x: MARGIN, y: y - h, width: CONTENT_W, height: h });
      y -= h + 14;
    } catch {
      /* screenshot embed failed — continue without it */
    }
  }

  // Readiness score — big number + the 3 category bars, same grouping as the
  // dashboard hero (Technical / Content / AI Visibility, averaged).
  need(70);
  const r = report.readiness;
  text(String(r.overall), MARGIN, 34, bold, scoreColor(r.overall));
  text("/100  Overall Readiness", MARGIN + 46, 13, font, MUTED);
  y -= 40;

  const bars: [string, number][] = [
    ["Technical Readiness", r.technical],
    ["Content Readiness", r.content],
    ["AI Visibility Readiness", r.aiVisibility],
  ];
  for (const [label, score] of bars) {
    need(22);
    text(label, MARGIN, 10, font, MUTED);
    text(`${score}/100`, MARGIN + CONTENT_W - 40, 10, bold, scoreColor(score));
    y -= 13;
    page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_W, height: 6, color: rgb(0.2, 0.22, 0.21) });
    page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_W * Math.min(score, 100) / 100, height: 6, color: scoreColor(score) });
    y -= 16;
  }
  y -= 6;

  if (narrative.executiveSummary) {
    drawLines(narrative.executiveSummary, font, 10.5, MUTED, 5);
  }

  // Your Score / Industry Average / Top Competitor — same real, computed
  // comparison the dashboard shows (never a fabricated benchmark).
  if (report.competitorComparison) {
    y -= 6;
    need(30);
    const comp = report.competitorComparison;
    const cols: [string, string][] = [["Your Score", `${comp.yourScore}/100`]];
    if (comp.industryAverage != null) cols.push(["Industry Average", `${comp.industryAverage}/100`]);
    if (comp.topCompetitor) cols.push(["Top Competitor", `${comp.topCompetitor.overall}/100 (${comp.topCompetitor.domain})`]);
    const colW = CONTENT_W / cols.length;
    cols.forEach(([label], i) => text(label, MARGIN + i * colW, 9, font, MUTED));
    y -= 13;
    cols.forEach(([, value], i) => text(value, MARGIN + i * colW, 13, bold, PAPER));
    y -= 20;
  }

  // ================= TOP ISSUES =================
  const problemIssues = (report.siteIssues ?? [])
    .filter((i) => i.status === "checked" && i.affected?.length > 0)
    .sort((a, b) => a.priority - b.priority || b.affected.length - a.affected.length)
    .slice(0, 12);

  if (problemIssues.length > 0) {
    newPage();
    sectionHeading("Technical SEO Audit — Top Issues");
    if (narrative.technicalSummary) {
      drawLines(narrative.technicalSummary, font, 10, MUTED, 4);
      y -= 6;
    }
    for (const issue of problemIssues) {
      need(28);
      const band = severityBand(issue.priority);
      text(band.label.toUpperCase(), MARGIN, 8, bold, band.color);
      text(`${issue.affected.length} page(s) affected`, MARGIN + 80, 8, font, MUTED);
      y -= 12;
      drawLines(issue.title, bold, 11, PAPER, 3);
      // Show up to 2 real affected URLs so it stays verifiable, not abstract.
      for (const a of issue.affected.slice(0, 2)) {
        drawLines(`- ${a.url}`, font, 8.5, MUTED, 2, MARGIN + 8, CONTENT_W - 8);
      }
      y -= 8;
    }
  }

  // ================= KEYWORDS + BACKLINKS =================
  newPage();
  sectionHeading("Top Organic Keywords");
  const kws = report.keywords.organic.slice(0, 10);
  if (kws.length === 0) {
    drawLines(
      "No ranking keywords found - this is the biggest opportunity: build brand awareness through informational content around the niche, see what competitors already rank for, then publish something more useful and more thorough on the same topics.",
      font, 10, MUTED, 4
    );
  } else {
    need(14);
    text("Keyword", MARGIN, 9, bold, MUTED);
    text("Pos.", MARGIN + 320, 9, bold, MUTED);
    text("Volume", MARGIN + 380, 9, bold, MUTED);
    y -= 14;
    for (const k of kws) {
      need(15);
      drawLines(k.keyword, font, 9.5, PAPER, 0, MARGIN, 300);
      text(String(k.position), MARGIN + 320, 9.5, bold, GREEN);
      text(String(k.searchVolume ?? "-"), MARGIN + 380, 9.5, font, MUTED);
      y -= 14;
    }
  }
  y -= 14;

  sectionHeading("Backlink Profile");
  const bl = report.backlinks.summary;
  need(30);
  const blCols: [string, string][] = [
    ["Backlinks", String(bl.totalBacklinks ?? "-")],
    ["Ref. Domains", String(bl.referringDomains ?? "-")],
    ["Domain Rating", String(bl.domainAuthority ?? "-")],
  ];
  const blColW = CONTENT_W / 3;
  blCols.forEach(([label], i) => text(label, MARGIN + i * blColW, 9, font, MUTED));
  y -= 13;
  blCols.forEach(([, value], i) => text(value, MARGIN + i * blColW, 15, bold, PAPER));
  y -= 24;
  if (report.backlinks.top.length > 0) {
    text("Top Backlinks", MARGIN, 10, bold, PAPER);
    y -= 15;
    for (const b of report.backlinks.top.slice(0, 5)) {
      need(13);
      text(b.sourceDomain, MARGIN, 9.5, font, MUTED);
      text(`DR ${b.domainAuthority ?? "-"}`, MARGIN + CONTENT_W - 50, 9.5, bold, GREEN);
      y -= 14;
    }
  }

  // ================= AI VISIBILITY =================
  if (ai) {
    newPage();
    sectionHeading("AI Visibility");
    if (narrative.aiVisibilitySummary) {
      drawLines(narrative.aiVisibilitySummary, font, 10, MUTED, 4);
      y -= 8;
    }
    if (ai.overallSentiment.hasMentions) {
      need(50);
      const sentCols: [string, number, typeof GOOD][] = [
        ["Positive", ai.overallSentiment.positivePct, GOOD],
        ["Neutral", ai.overallSentiment.neutralPct, MUTED],
        ["Negative", ai.overallSentiment.negativePct, BAD],
      ];
      for (const [label, pct, color] of sentCols) {
        text(label, MARGIN, 9, font, MUTED);
        text(`${pct}%`, MARGIN + CONTENT_W - 30, 9, bold, color);
        y -= 12;
        page.drawRectangle({ x: MARGIN, y: y - 5, width: CONTENT_W, height: 5, color: rgb(0.2, 0.22, 0.21) });
        page.drawRectangle({ x: MARGIN, y: y - 5, width: CONTENT_W * pct / 100, height: 5, color });
        y -= 13;
      }
      y -= 6;
    }
    if (ai.shareOfVoice?.length) {
      text("Share of Voice", MARGIN, 10, bold, PAPER);
      y -= 15;
      for (const s of ai.shareOfVoice.slice(0, 6)) {
        need(13);
        text(s.brand, MARGIN, 9.5, font, s.isClient ? PAPER : MUTED);
        text(`${s.sharePct}%`, MARGIN + CONTENT_W - 30, 9.5, bold, s.isClient ? GREEN : MUTED);
        y -= 14;
      }
    }
  }

  // ================= RECOMMENDATIONS =================
  if (report.recommendations?.length) {
    newPage();
    sectionHeading("Priority Recommendations");
    if (narrative.recommendationsIntro) {
      drawLines(narrative.recommendationsIntro, font, 10, MUTED, 4);
      y -= 6;
    }
    const order = { high: 0, medium: 1, low: 2, pass: 3 } as const;
    const recs = [...report.recommendations].sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 15);
    for (const rec of recs) {
      need(24);
      const color = rec.priority === "high" ? BAD : rec.priority === "medium" ? WARN : GOOD;
      text(rec.priority.toUpperCase(), MARGIN, 8, bold, color);
      text(rec.category, MARGIN + 55, 8, font, MUTED);
      y -= 12;
      drawLines(rec.title, font, 10, PAPER, 3);
      y -= 4;
    }
  }

  // ================= FOOTER (every page) =================
  const allPages = doc.getPages();
  allPages.forEach((p, i) => {
    p.drawText("Welcome Tomorrow  -  welcometomorrow.io  -  seo@welcometomorrow.io", {
      x: MARGIN, y: 26, size: 7.5, font, color: MUTED,
    });
    p.drawText(`Page ${i + 1} of ${allPages.length}`, {
      x: PAGE_W - MARGIN - 70, y: 26, size: 7.5, font, color: MUTED,
    });
  });

  return await doc.save();
}
