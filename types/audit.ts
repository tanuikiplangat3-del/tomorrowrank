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

// Keywords the domain already shows up for (position 4-50) but hasn't broken
// into the top 3 yet — the closest, highest-value wins rather than a blind
// "keyword ideas" list.
export interface KeywordOpportunity {
  keyword: string;
  position: number;
  searchVolume: number | null;
  difficulty: number | null;
  url?: string;
}

// A domain that links to a competitor but not to the audited site — a
// concrete outreach target, not just a number.
export interface LinkGapDomain {
  domain: string;
  domainRating: number | null;
  linksToCompetitor: string; // which competitor domain it links to
}

// Live follower/engagement numbers for a discovered social profile — replaces
// "does an og:tag/link exist" with real, current numbers where the platform
// makes them publicly visible.
export interface SocialProfile {
  platform: "Facebook" | "X (Twitter)" | "Instagram" | "LinkedIn" | "YouTube";
  url: string;
  followers: number | null;
  engagement: number | null;
  handle: string | null;
  available: boolean; // false = profile found on the site, but platform hid the numbers publicly
}

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

// ---- AI Responses dashboard (multi-LLM mention tracking, screenshot-style) ----
export interface AiPlatformStat {
  platform: "AI Overviews" | "ChatGPT" | "AI Mode" | "Gemini" | "Perplexity" | "Copilot" | "Grok";
  responses: number | null;      // how many of the tracked prompts mentioned/cited the brand
  responsesOf: number | null;    // out of how many prompts were tracked
  responsesDelta: number | null; // vs the previous audit of this domain; null = no prior data
  pages: number | null;          // distinct site pages cited — only populated where the platform's
                                  // API returns real citation URLs (not fabricated for text-only answers)
  pagesDelta: number | null;
  available: boolean;            // false = platform not reachable via any connected API (e.g. Copilot, Grok)
  note?: string;
}

export interface AiResponsesDashboard {
  platforms: AiPlatformStat[];
  comparedToPrevious: boolean; // false on a domain's first-ever audit — deltas are then all null
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
  aiResponses?: AiResponsesDashboard;
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
  competitorUrl?: string;
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

// ---- Broader SERP snapshot (DataForSEO real Google SERP for the target/top keyword) ----
export interface SerpSnapshot {
  keyword: string;
  searchVolume: number | null;   // real Google Ads volume, not Ahrefs' estimate
  cpc: number | null;            // USD
  yourPosition: number | null;   // null = not found in the checked results
  hasFeaturedSnippet: boolean;
  featuredSnippetIsYours: boolean;
  hasPeopleAlsoAsk: boolean;
  hasKnowledgePanel: boolean;
  topResults: { position: number; domain: string; title: string }[];
}

// ---- Local business presence (DataForSEO Business Data API) ----
export interface LocalBusinessProfile {
  checked: boolean;      // false = lookup wasn't attempted (e.g. API not configured)
  found: boolean;
  name?: string;
  rating?: number | null;
  reviewCount?: number | null;
  category?: string | null;
  issue?: { title: string; recommendation: string; reason: string }; // populated when !found
}

export interface AuditReport {
  meta: AuditMeta;
  overall: { grade: Grade; score: number; summary: string; recommendationCount: number };
  categories: CategoryScore[];
  checks: CheckResult[];
  recommendations: Recommendation[];
  keywords: {
    organic: KeywordRanking[];
    paid: KeywordRanking[];
    trafficFromSearch: number | null;
    opportunities: KeywordOpportunity[]; // ranking 4-50, not yet top-3 — closest wins
  };
  backlinks: {
    summary: BacklinkSummary;
    top: Backlink[];
    topPages: TopPageByBacklinks[];
    topAnchors: TopAnchor[];
    geographies: ReferringGeography[];
    linkGap: { competitor: string | null; domains: LinkGapDomain[] }; // sites linking to a competitor, not you
  };
  performance: { mobile: PageSpeedReport; desktop: PageSpeedReport };
  geo: GeoReport;
  social: SocialProfile[]; // live follower/engagement numbers, where publicly visible
  serpSnapshot?: SerpSnapshot;       // real Google SERP for the target/top-opportunity keyword
  localBusiness?: LocalBusinessProfile; // Google Business Profile check
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
  input: { url: string; country: string; language: string; targetKeyword?: string; competitorUrl?: string; internal?: boolean };
  report?: AuditReport;
  aiVisibility?: AiVisibilityReport;
  error?: string;
  createdAt: string;
  updatedAt: string;
  deadlineAt?: number;         // epoch ms; a running job past this is treated as timed-out
}
