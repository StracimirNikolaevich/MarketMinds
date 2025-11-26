import React, { useState, useEffect, useMemo } from 'react';
import { fetchMarketData, fetchMarketNews } from '../services/marketService';
import { MarketData, NewsItem } from '../types';
import { fetchHistoricalData, createChartPaths } from '../utils';

interface WatchlistProps {
  symbols: string[];
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onAddToPortfolio: (symbol: string, quantity: number) => void;
}

export const Watchlist: React.FC<WatchlistProps & { isDarkMode?: boolean }> = ({ symbols, onAdd, onRemove, onAddToPortfolio, isDarkMode = false }) => {
  const [watchlist, setWatchlist] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [selected, setSelected] = useState<MarketData | null>(null);
  const [historyPrices, setHistoryPrices] = useState<number[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  
  const refreshWatchlist = async (currentSymbols: string[]) => {
    if (currentSymbols.length === 0) {
      setWatchlist([]);
      return;
    }
    setLoading(true);
    const result = await fetchMarketData(currentSymbols);
    setWatchlist(result.data);
    setLoading(false);
  };

  useEffect(() => {
    refreshWatchlist(symbols);
    
    // Auto-refresh every 15 seconds (real API has rate limits)
    const intervalId = setInterval(() => {
      if (symbols.length > 0) {
        fetchMarketData(symbols).then(result => {
          setWatchlist(result.data);
        });
      }
    }, 15000);
    
    return () => clearInterval(intervalId);
  }, [symbols]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    onAdd(newSymbol);
    setNewSymbol('');
  };

  const openResearch = async (stock: MarketData) => {
    setSelected(stock);
    setHistoryLoading(true);
    setNewsLoading(true);

    try {
      const prices = await fetchHistoricalData(stock.symbol, '1M');
      setHistoryPrices(prices);
    } finally {
      setHistoryLoading(false);
    }

    try {
      const res = await fetchMarketNews();
      setNews(res.news);
    } catch {
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  };

  const closeResearch = () => {
    setSelected(null);
    setHistoryPrices([]);
    setNews([]);
  };

  const chartProps = useMemo(() => {
    if (!historyPrices.length) return null;
    return createChartPaths(historyPrices, 400, 150);
  }, [historyPrices]);

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-[#f5f5f5] text-slate-900'}`}>
      <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Watchlist</h1>
          <p className="text-slate-500 text-sm">Track your favorite stocks</p>
        </div>
        <form onSubmit={handleAddSubmit} className="flex gap-2">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            placeholder="Add Symbol (e.g. GOOGL)"
            className="bg-white border border-slate-300 rounded-lg px-4 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm placeholder-slate-400 uppercase"
          />
          <button 
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            Add
          </button>
        </form>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="p-4 font-medium">Symbol</th>
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium text-right">Price</th>
                  <th className="p-4 font-medium text-right">Change</th>
                  <th className="p-4 font-medium text-right">Percent</th>
                  <th className="p-4 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && watchlist.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      <i className="fas fa-circle-notch fa-spin mr-2"></i> Loading market data...
                    </td>
                  </tr>
                ) : (
                  watchlist.map((stock) => (
                    <tr 
                      key={stock.symbol} 
                      className="hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => openResearch(stock)}
                    >
                      <td className="p-4 font-semibold text-slate-900 underline decoration-dotted underline-offset-4">{stock.symbol}</td>
                      <td className="p-4 text-slate-700">{stock.name}</td>
                      <td className="p-4 text-right font-mono font-medium text-slate-900">{stock.price}</td>
                      <td className={`p-4 text-right font-mono font-medium ${stock.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {stock.change}
                      </td>
                      <td className={`p-4 text-right font-mono font-medium ${stock.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {stock.changePercent}
                      </td>
                      <td className="p-4 text-center" onClick={(e) => { e.stopPropagation(); }}>
                        <button 
                          onClick={() => onRemove(stock.symbol)}
                          className="text-slate-400 hover:text-rose-500 transition-colors p-2"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
                {!loading && watchlist.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      Your watchlist is empty. Add a symbol above to start tracking.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selected.symbol} Research</h2>
                <p className="text-xs text-slate-500">1M price history & latest headlines</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onAddToPortfolio(selected.symbol, 1)}
                  className="px-3 py-1.5 text-xs rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2 shadow-sm"
                >
                  <i className="fas fa-briefcase"></i>
                  Add to Portfolio
                </button>
                <button
                  onClick={closeResearch}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-0">
              <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-slate-200 p-4">
                <h3 className="text-xs font-bold text-slate-600 uppercase mb-2">1-Month Chart</h3>
                <div className="w-full h-56 bg-white rounded-xl border border-slate-200 flex items-center justify-center">
                  {historyLoading ? (
                    <i className="fas fa-circle-notch fa-spin text-slate-400"></i>
                  ) : chartProps ? (
                    <svg viewBox="0 0 400 150" className="w-full h-full p-4">
                      <defs>
                        <linearGradient id="watchlistChartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={chartProps.area} fill="url(#watchlistChartGradient)" />
                      <path d={chartProps.line} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="text-xs text-slate-500">No historical data available.</span>
                  )}
                </div>
              </div>
              <div className="border-t lg:border-t-0 border-slate-200 p-4 overflow-y-auto bg-slate-50/60">
                <h3 className="text-xs font-bold text-slate-600 uppercase mb-2">Latest Headlines</h3>
                {newsLoading ? (
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <i className="fas fa-circle-notch fa-spin"></i>
                    Fetching news...
                  </div>
                ) : news.length ? (
                  <ul className="space-y-3 text-sm">
                    {news.slice(0, 4).map((item, idx) => (
                      <li key={idx} className="border-b border-slate-200 pb-2 last:border-b-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() => item.url && window.open(item.url, '_blank')}
                          className="text-left hover:text-blue-600"
                        >
                          <div className="text-[11px] text-slate-500 mb-0.5">{item.source} · {item.time}</div>
                          <div className="text-slate-800">{item.title}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-slate-500">No news available.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
