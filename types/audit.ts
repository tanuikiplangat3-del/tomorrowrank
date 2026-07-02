// types/audit.ts
// Central data model for TomorrowRank SEO + AI Visibility Audit.

export type Grade =
  | "A+" | "A" | "A-"
  | "B+" | "B" | "B-"
  | "C+" | "C" | "C-"
  | "D+" | "D" | "D-"
  | "F";

export type Priority = "high" | "medium" | "low" | "pass";

export type Category =
  | "On-Page SEO"
  | "GEO"
  | "Links"
  | "Usability"
  | "Performance"
  | "Social"
  | "Local"
  | "Other";

export type CheckStatus = "pass" | "warn" | "fail" | "info";

// A single audited signal (e.g. "Title Tag", "SSL Enabled").
export interface CheckResult {
  id: string;                // stable slug, e.g. "title-tag"
  label: string;             // human label, e.g. "Title Tag"
  category: Category;
  status: CheckStatus;
  weight: number;            // contribution to category score (0..n)
  value?: string | number | null; // measured value, shown in detail
  detail?: string;           // short explanation of the finding
  recommendation?: string;   // what to do (only when status !== pass)
  priority?: Priority;       // for the recommendations table
}

export interface CategoryScore {
  category: Category;
  grade: Grade;
  score: number;             // 0..100
  passed: number;
  total: number;
}

// ---- Keyword / backlink / performance sub-reports ----

export interface KeywordRanking {
  keyword: string;
  position: number;
  searchVolume: number | null;
  estimatedTraffic: number | null;
  url?: string;
  type: "organic" | "paid";
}

export interface BacklinkSummary {
  totalBacklinks: number | null;
  referringDomains: number | null;
  domainAuthority: number | null;   // 0..100 (DataForSEO "rank")
  dofollow: number | null;
  nofollow: number | null;
}

export interface Backlink {
  sourceUrl: string;
  sourceDomain: string;
  anchor: string | null;
  domainAuthority: number | null;
  dofollow: boolean;
  firstSeen?: string;
}

export interface TopPageByBacklinks { url: string; backlinks: number; }
export interface TopAnchor { anchor: string; backlinks: number; }
export interface ReferringGeography { country: string; count: number; }

export interface PageSpeedReport {
  strategy: "mobile" | "desktop";
  performanceScore: number | null;  // 0..100
  lcp: number | null;                // s
  cls: number | null;
  inp: number | null;                // ms (replaces FID)
  fcp: number | null;                // s
  ttfb: number | null;               // ms
  speedIndex: number | null;         // s
  totalBytes: number | null;
  passesCoreWebVitals: boolean | null;
}

// ---- GEO (Generative Engine Optimization) ----

export interface GeoReport {
  llmReadableScore: number | null;   // 0..100 how cleanly LLMs parse the page
  renderedContentRatio: number | null; // % of content present without JS
  hasLlmsTxt: boolean;
  hasIdentitySchema: boolean;
  hasOrganizationSchema: boolean;
  authoritySignals: string[];        // detected E-E-A-T signals
  aiOverviewCitations: AiOverviewCitation[];
  googleAiSearchPresence: boolean | null;
}

export interface AiOverviewCitation {
  query: string;
  cited: boolean;
  citedUrl?: string;
  competitorsCited: string[];
}

// ---- AI Visibility (Share of Voice / Sentiment, screenshots 6 & 7) ----

export interface BrandShare {
  brand: string;
  isClient: boolean;
  sharePct: number;            // 0..100
  sentimentScore: number;      // 0..100
  mentions: number;
}

export interface VisibilityInsight {
  rank: number;
  title: string;               // e.g. "Make OS Story Concrete"
  body: string;
  link: { label: string; href: string };
}

export interface AiVisibilityReport {
  clientBrand: string;
  competitors: string[];       // auto-discovered
  shareOfVoice: BrandShare[];
  overallSentiment: {
    hasMentions: boolean;
    positivePct: number;
    neutralPct: number;
    negativePct: number;
    summary: string;
  };
  headline: { tag: string; text: string };  // the purple "Leaders own sentiment" callout
  insights: VisibilityInsight[];
  modelsQueried: string[];     // which LLMs were polled
  citations?: { url: string; title: string; brandCited?: boolean }[]; // sources Claude cited via web search
  probes?: { engine: string; prompt: string; answer: string; brandCited: boolean }[]; // raw Q&A behind the insights
}

// ---- Multi-page crawl / clickable issues ----
export type IssueStatus = "checked" | "ok" | "not_checked" | "not_relevant";
export interface AffectedUrl { url: string; evidence: string; }
export interface SiteIssue {
  id: string;
  category: "Technical" | "Content" | "Links" | "AI";
  subcategory: string;
  title: string;
  status: IssueStatus;
  priority: number; // 1 (very high) … 9 (very low)
  affected: AffectedUrl[];
  passedCount: number;
  recommendation: string;
  actions: string[];
  reason?: string;
}
export interface CrawlMeta {
  source: "sitemap" | "crawl" | "mixed" | "ahrefs-siteaudit";
  discovered: number;
  crawled: number;
  truncated: boolean;
  score: number;
  grade: string;
  checkedCount: number;
  notCheckedCount: number;
}

// ---- Top-level report ----

export interface AuditMeta {
  url: string;
  finalUrl: string;
  country: string;             // e.g. "Kenya"
  countryCode: string;         // e.g. "KE"
  language: string;            // e.g. "English"
  languageCode: string;        // e.g. "en"
  targetKeyword?: string;
  screenshotDesktop?: string;  // data URL or hosted
  screenshotMobile?: string;
  fetchedAt: string;
}

export interface Recommendation {
  id: string;
  title: string;
  category: Category;
  priority: Priority;          // high | medium | low
  detail?: string;
}

export interface AuditReport {
  meta: AuditMeta;
  overall: { grade: Grade; score: number; summary: string; recommendationCount: number };
  categories: CategoryScore[];
  checks: CheckResult[];
  recommendations: Recommendation[];
  keywords: { organic: KeywordRanking[]; paid: KeywordRanking[]; trafficFromSearch: number | null };
  backlinks: {
    summary: BacklinkSummary;
    top: Backlink[];
    topPages: TopPageByBacklinks[];
    topAnchors: TopAnchor[];
    geographies: ReferringGeography[];
  };
  performance: { mobile: PageSpeedReport; desktop: PageSpeedReport };
  geo: GeoReport;
  siteIssues?: SiteIssue[];   // multi-page crawl findings (clickable drill-down)
  crawlMeta?: CrawlMeta;
}

// ---- Job lifecycle (polling pattern) ----

export type JobStatus = "queued" | "running" | "done" | "error";

export interface AuditJob {
  id: string;
  status: JobStatus;
  stage: string;               // human-readable current stage
  progress: number;            // 0..100
  input: { url: string; country: string; language: string; targetKeyword?: string };
  report?: AuditReport;
  aiVisibility?: AiVisibilityReport;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
