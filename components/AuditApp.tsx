'use client'

import { useState } from 'react';

export default function AuditApp() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [report, setReport] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setReport(null);
    setStatus('Extracting site context and generating buyer prompts...');

    try {
      // Step 1: Start the audit (Extract Context)
      const startRes = await fetch('/api/audit/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });
      
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Failed to extract context');
      
      const { brandName, domain, prompts } = startData;
      
      let aggregated = {
        visibilityScore: 0,
        shareOfVoice: 0,
        citationShare: 0,
        totalTargetMentions: 0,
        totalCompetitorMentions: 0,
        sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
        engineQueriesCount: 0,
        targetCitationsCount: 0,
        allCitationsCount: 0,
        competitorMap: {} as Record<string, number>,
        citationsFound: [] as { url: string; engine: string }[],
        queries: [] as any[]
      };

      // Step 2: Run queries for each prompt
      for (let i = 0; i < prompts.length; i++) {
        setStatus(`Testing prompt ${i + 1} of ${prompts.length}: "${prompts[i]}"...`);
        
        const runRes = await fetch('/api/audit/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompts[i], brandName, domain })
        });
        
        if (runRes.ok) {
          const runData = await runRes.json();
          aggregated.engineQueriesCount += runData.engineQueriesCount;
          aggregated.totalTargetMentions += runData.targetMentions;
          aggregated.totalCompetitorMentions += runData.competitorMentions;
          aggregated.allCitationsCount += runData.allCitationsCount;
          aggregated.targetCitationsCount += runData.targetCitationsCount;
          
          aggregated.sentimentBreakdown.positive += runData.sentiment.positive;
          aggregated.sentimentBreakdown.neutral += runData.sentiment.neutral;
          aggregated.sentimentBreakdown.negative += runData.sentiment.negative;
          
          for (const [comp, count] of Object.entries(runData.competitors as Record<string, number>)) {
            aggregated.competitorMap[comp] = (aggregated.competitorMap[comp] || 0) + count;
          }
          
          aggregated.citationsFound.push(...runData.citationsFound);
          aggregated.queries.push(...runData.queries);
        }
      }

      // Step 3: Finalize Metrics
      const totalAllMentions = aggregated.totalTargetMentions + aggregated.totalCompetitorMentions;
      aggregated.visibilityScore = aggregated.engineQueriesCount > 0 ? (aggregated.totalTargetMentions / aggregated.engineQueriesCount) * 100 : 0;
      aggregated.shareOfVoice = totalAllMentions > 0 ? (aggregated.totalTargetMentions / totalAllMentions) * 100 : 0;
      aggregated.citationShare = aggregated.allCitationsCount > 0 ? (aggregated.targetCitationsCount / aggregated.allCitationsCount) * 100 : 0;

      const competitorLeaderboard = Object.entries(aggregated.competitorMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      setReport({ ...aggregated, brandName, domain, competitorLeaderboard });
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-block px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-xs font-semibold text-cyan-400 uppercase tracking-widest">
            Generative Engine Optimization (GEO)
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
            AI Visibility & Mentions Audit
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-2xl mx-auto">
            Audit your brand’s real-time visibility, citations, sentiment, and share of voice.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition disabled:opacity-50 text-sm shadow-lg shadow-cyan-500/20"
          >
            {loading ? 'Auditing...' : 'Run Audit'}
          </button>
        </form>

        {loading && (
          <div className="text-center py-16 space-y-3">
            <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm">{status}</p>
          </div>
        )}

        {report && (
          <div className="space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="text-xs text-slate-400 font-medium">AI Visibility Score</div>
                <div className="text-3xl font-extrabold text-cyan-400 mt-2">{report.visibilityScore.toFixed(0)}%</div>
                <div className="text-xs text-slate-500 mt-1">Mentioned in {report.totalTargetMentions} AI answers</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="text-xs text-slate-400 font-medium">AI Share of Voice (SOV)</div>
                <div className="text-3xl font-extrabold text-indigo-400 mt-2">{report.shareOfVoice.toFixed(1)}%</div>
                <div className="text-xs text-slate-500 mt-1">vs. {report.totalCompetitorMentions} competitor mentions</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="text-xs text-slate-400 font-medium">Citation Share</div>
                <div className="text-3xl font-extrabold text-emerald-400 mt-2">{report.citationShare.toFixed(1)}%</div>
                <div className="text-xs text-slate-500 mt-1">{report.citationsFound.length} links directly to your domain</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
                <div className="text-xs text-slate-400 font-medium">Sentiment Stance</div>
                <div className="flex gap-2 mt-2 items-center">
                  <span className="text-emerald-400 font-bold text-sm">+{report.sentimentBreakdown.positive} pos</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-slate-400 text-sm">{report.sentimentBreakdown.neutral} neu</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-rose-400 font-bold text-sm">-{report.sentimentBreakdown.negative} neg</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Competitors Dominating This Niche</h2>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {report.competitorLeaderboard.map((comp: any, idx: number) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <div className="text-sm font-semibold text-slate-200 truncate">{comp.name}</div>
                    <div className="text-xs text-slate-500 mt-1">{comp.count} mentions</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Engine Query Log</h2>
              <div className="space-y-3">
                {report.queries.map((q: any, idx: number) => (
                  <div key={idx} className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">"{q.prompt}"</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-300">{q.engine}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${q.targetMentioned ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}>
                          {q.targetMentioned ? 'Target Mentioned' : 'Not Mentioned'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{q.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
