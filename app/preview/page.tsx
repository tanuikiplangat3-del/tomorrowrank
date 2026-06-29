"use client";
import { Report } from "@/components/Report";
import type { AuditReport, AiVisibilityReport } from "@/types/audit";

const report: AuditReport = {
  meta: { url: "welcometomorrow.io", finalUrl: "https://welcometomorrow.io", country: "Kenya", countryCode: "KE", language: "English", languageCode: "en", targetKeyword: "growth agency", fetchedAt: new Date().toISOString() },
  overall: { grade: "B", score: 84, summary: "Your page could be better", recommendationCount: 14 },
  categories: [
    { category: "On-Page SEO", grade: "A-", score: 91, passed: 9, total: 11 },
    { category: "GEO", grade: "C+", score: 78, passed: 4, total: 6 },
    { category: "Links", grade: "C+", score: 77, passed: 2, total: 3 },
    { category: "Usability", grade: "D", score: 65, passed: 4, total: 8 },
    { category: "Performance", grade: "A+", score: 97, passed: 6, total: 6 },
    { category: "Social", grade: "C", score: 73, passed: 5, total: 8 },
    { category: "Local", grade: "B", score: 83, passed: 1, total: 2 },
  ],
  checks: [
    { id:"title-tag", label:"Title Tag", category:"On-Page SEO", status:"warn", weight:3, value:"Custom Growth Systems Built to Scale", detail:"35 characters", recommendation:"Increase length of title tag toward 50–60 characters.", priority:"medium" },
    { id:"h1", label:"H1 Header Tag Usage", category:"On-Page SEO", status:"warn", weight:3, value:1, detail:"Use main keywords across important HTML tags", recommendation:"Use your main keywords across the important HTML tags.", priority:"medium" },
    { id:"image-alt", label:"Image Alt Attributes", category:"On-Page SEO", status:"warn", weight:1, value:"6/14", detail:"43% of images have alt text", recommendation:"Add alt attributes to all images.", priority:"low" },
    { id:"core-web-vitals", label:"Google's Core Web Vitals", category:"Usability", status:"fail", weight:3, detail:"LCP 3.1s · CLS 0.04 · INP 240ms", recommendation:"Optimize for Core Web Vitals (LCP, CLS, INP).", priority:"medium" },
    { id:"psi-mobile", label:"PageSpeed Insights — Mobile", category:"Usability", status:"warn", weight:2, value:72, recommendation:"Optimize for Mobile PageSpeed Insights.", priority:"low" },
  ],
  recommendations: [
    { id:"cwv", title:"Optimize for Core Web Vitals", category:"Usability", priority:"medium" },
    { id:"title", title:"Increase length of Title Tag", category:"On-Page SEO", priority:"medium" },
    { id:"kw", title:"Use your main keywords across the important HTML Tags", category:"On-Page SEO", priority:"medium" },
    { id:"alt", title:"Add Alt Attributes to all images", category:"On-Page SEO", priority:"low" },
    { id:"text", title:"Increase Page Text Content", category:"On-Page SEO", priority:"low" },
    { id:"psi-m", title:"Optimize for Mobile PageSpeed Insights", category:"Usability", priority:"low" },
    { id:"psi-d", title:"Optimize for Desktop PageSpeed Insights", category:"Usability", priority:"low" },
    { id:"x", title:"Create and link your X Profile", category:"Social", priority:"low" },
    { id:"yt", title:"Create and link an associated YouTube Channel", category:"Social", priority:"low" },
    { id:"addr", title:"Add Business Address and Phone Number to site", category:"Local", priority:"low" },
    { id:"schema", title:"Add Local Business Schema", category:"Local", priority:"low" },
    { id:"render", title:"Reduce Rendered Content", category:"GEO", priority:"low" },
    { id:"pixel", title:"Install a Facebook Pixel", category:"Social", priority:"low" },
    { id:"inline", title:"Remove Inline Styles", category:"Performance", priority:"low" },
  ],
  keywords: {
    organic: [
      { keyword:"growth marketing agency kenya", position:4, searchVolume:880, estimatedTraffic:120, type:"organic" },
      { keyword:"fintech growth agency", position:7, searchVolume:390, estimatedTraffic:45, type:"organic" },
      { keyword:"product led growth africa", position:11, searchVolume:210, estimatedTraffic:18, type:"organic" },
    ],
    paid: [],
    trafficFromSearch: 183,
  },
  backlinks: {
    summary: { totalBacklinks: 1240, referringDomains: 86, domainAuthority: 38, dofollow: 910, nofollow: 330 },
    top: [
      { sourceUrl:"https://techcrunch.com/x", sourceDomain:"techcrunch.com", anchor:"Welcome Tomorrow", domainAuthority:91, dofollow:true },
      { sourceUrl:"https://disrupt-africa.com/y", sourceDomain:"disrupt-africa.com", anchor:"growth partner", domainAuthority:62, dofollow:true },
    ],
    topPages: [], topAnchors: [], geographies: [{country:"Kenya",count:40},{country:"United States",count:22}],
  },
  performance: {
    mobile: { strategy:"mobile", performanceScore:72, lcp:3.1, cls:0.04, inp:240, fcp:1.8, ttfb:320, speedIndex:3.4, totalBytes:1800000, passesCoreWebVitals:false },
    desktop:{ strategy:"desktop", performanceScore:96, lcp:1.2, cls:0.02, inp:120, fcp:0.8, ttfb:180, speedIndex:1.1, totalBytes:1800000, passesCoreWebVitals:true },
  },
  geo: {
    llmReadableScore: 74, renderedContentRatio: 58, hasLlmsTxt:false, hasIdentitySchema:true, hasOrganizationSchema:true,
    authoritySignals:["client logos","case studies","named team"],
    aiOverviewCitations:[{query:"best growth agency kenya",cited:false,competitorsCited:["speero.com","growthcurve.com"]}],
    googleAiSearchPresence:false,
  },
};

const ai: AiVisibilityReport = {
  clientBrand:"welcometomorrow.io",
  competitors:["Speero","Growthcurve","Ogilvy","Growth collective","NoGood"],
  shareOfVoice:[
    { brand:"Other", isClient:false, sharePct:49, sentimentScore:65, mentions:24 },
    { brand:"Speero", isClient:false, sharePct:18, sentimentScore:100, mentions:9 },
    { brand:"Growthcurve", isClient:false, sharePct:17, sentimentScore:98, mentions:8 },
    { brand:"Ogilvy", isClient:false, sharePct:8, sentimentScore:2, mentions:4 },
    { brand:"Growth collective", isClient:false, sharePct:8, sentimentScore:66, mentions:4 },
    { brand:"Welcome tomorrow", isClient:true, sharePct:0, sentimentScore:0, mentions:0 },
  ],
  overallSentiment:{ hasMentions:false, positivePct:0, neutralPct:0, negativePct:0, summary:"" },
  headline:{ tag:"Absent from conversation", text:"You hold 0% share vs Speero's 18%. Launch visibility campaigns now." },
  insights:[
    { rank:1, title:"Make OS Story Concrete", body:"Turn 5/5 analytics and experimentation mentions into a named 'growth OS' product.", link:{label:"Go to Perception",href:"#perception"} },
    { rank:2, title:"From Invisible To Listed", body:"Zero ChatGPT share of voice despite strong relevance—target 'best agency' list inclusions.", link:{label:"Go to Narrative Drivers",href:"#narrative-drivers"} },
    { rank:3, title:"Own African Growth Playbook", body:"Leverage pan-African expertise to publish Kenya-specific, fintech-led frameworks.", link:{label:"Go to Perception",href:"#perception"} },
    { rank:4, title:"Co-Occur With Leaders", body:"Engineer content where Welcome Tomorrow appears beside Speero, Growthcurve, NoGood repeatedly.", link:{label:"Go to Narrative Drivers",href:"#narrative-drivers"} },
  ],
  modelsQueried:["Claude","ChatGPT","Gemini"],
};

export default function Preview() {
  return <main className="relative z-10 min-h-screen"><Report report={report} ai={ai} /></main>;
}
