"use client";

import { useState } from "react";
import { DOCS_ARTICLES, type DocArticle } from "./DocsContent";
import { BookOpen, Search, ChevronRight, Copy, Check } from "lucide-react";

export function DocsLayout({ selectedSlug }: { selectedSlug?: string }) {
  const defaultArticle =
    DOCS_ARTICLES.find((a) => a.slug === selectedSlug) || DOCS_ARTICLES[0]!;

  const [activeArticle, setActiveArticle] = useState<DocArticle>(defaultArticle);
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(false);

  const filteredArticles = DOCS_ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.category.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const categories = Array.from(new Set(DOCS_ARTICLES.map((a) => a.category)));

  const currentIndex = DOCS_ARTICLES.findIndex((a) => a.id === activeArticle.id);
  const prevArticle = currentIndex > 0 ? DOCS_ARTICLES[currentIndex - 1] : null;
  const nextArticle = currentIndex < DOCS_ARTICLES.length - 1 ? DOCS_ARTICLES[currentIndex + 1] : null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeArticle.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid gap-8 md:grid-cols-4">
        {/* Sidebar Navigation */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 backdrop-blur-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
              <BookOpen className="h-5 w-5 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Documentation Hub</h2>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-500" />
              <input
                type="text"
                placeholder="Search docs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-neutral-500 focus:border-indigo-500 focus:outline-none transition"
              />
            </div>

            <div className="space-y-4 pt-1">
              {categories.map((cat) => {
                const catArticles = filteredArticles.filter((a) => a.category === cat);
                if (catArticles.length === 0) return null;

                return (
                  <div key={cat} className="space-y-1">
                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-2">
                      {cat}
                    </div>
                    {catArticles.map((article) => {
                      const isActive = activeArticle.id === article.id;
                      return (
                        <button
                          key={article.id}
                          onClick={() => setActiveArticle(article)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition ${
                            isActive
                              ? "bg-indigo-600 text-white font-medium shadow-sm"
                              : "text-neutral-300 hover:bg-neutral-800/80 hover:text-white"
                          }`}
                        >
                          <span className="truncate">{article.title}</span>
                          {isActive && <ChevronRight className="h-3 w-3 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Article Content */}
        <main className="md:col-span-3 space-y-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 md:p-8 backdrop-blur-sm shadow-xl space-y-6">
            {/* Article Header */}
            <div className="border-b border-neutral-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                  {activeArticle.category}
                </span>
                <h1 className="text-2xl font-bold text-white mt-2">{activeArticle.title}</h1>
                <p className="text-xs text-neutral-400 mt-1">{activeArticle.summary}</p>
              </div>

              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-700 hover:text-white transition shrink-0"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Copied Article" : "Copy Markdown"}</span>
              </button>
            </div>

            {/* Formatted Article Body */}
            <div className="prose prose-invert max-w-none text-xs leading-relaxed text-neutral-300 whitespace-pre-line font-sans">
              {activeArticle.content}
            </div>

            {/* Footer Navigation: Prev & Next Articles */}
            <div className="border-t border-neutral-800 pt-6 grid grid-cols-2 gap-4">
              {prevArticle ? (
                <button
                  onClick={() => setActiveArticle(prevArticle)}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-left hover:border-neutral-700 hover:bg-neutral-900 transition"
                >
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Previous</div>
                  <div className="text-xs font-semibold text-white mt-0.5">{prevArticle.title}</div>
                </button>
              ) : (
                <div />
              )}

              {nextArticle ? (
                <button
                  onClick={() => setActiveArticle(nextArticle)}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-right hover:border-neutral-700 hover:bg-neutral-900 transition ml-auto w-full"
                >
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Next</div>
                  <div className="text-xs font-semibold text-white mt-0.5">{nextArticle.title}</div>
                </button>
              ) : (
                <div />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
