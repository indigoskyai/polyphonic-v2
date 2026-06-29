import { ExternalLink } from 'lucide-react';

export interface Citation {
  url: string;
  title?: string;
  snippet?: string;
}

interface Props {
  citations: Citation[];
  query?: string;
}

/**
 * Strip of source chips for Perplexity / web_search results. Tap a chip to
 * open the source in a new tab.
 */
export default function SearchCitationsCard({ citations, query }: Props) {
  if (!Array.isArray(citations) || citations.length === 0) return null;

  return (
    <div className="citations-card">
      <div className="citations-card-head">
        <span className="citations-card-label">Sources</span>
        {query && <span className="citations-card-query" title={query}>{query}</span>}
      </div>
      <div className="citations-card-grid">
        {citations.slice(0, 8).map((c, i) => {
          let host = '';
          try { host = new URL(c.url).hostname.replace(/^www\./, ''); } catch {
            host = c.url;
          }
          return (
            <a
              key={i}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="citation-chip"
              title={c.snippet || c.title || c.url}
            >
              <span className="citation-chip-num">{i + 1}</span>
              <span className="citation-chip-body">
                <span className="citation-chip-title">{c.title || host || c.url}</span>
                <span className="citation-chip-host">{host}<ExternalLink size={10} /></span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
