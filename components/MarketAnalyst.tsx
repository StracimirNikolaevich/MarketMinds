import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { fetchMarketData, fetchMarketNews, fetchStockHistory, TimeRange } from '../services/marketService';
import { MarketData, NewsItem, GroundingSource, HistoricalDataPoint } from '../types';
import { createChartPaths, fetchHistoricalData } from '../utils';

type MarketTab = 'Americas' | 'Europe' | 'Asia' | 'Commodities' | 'Currencies' | 'Bonds';

// Predefined ticker lists for each category
const MARKET_CATEGORIES: Record<MarketTab, string[]> = {
  Americas: ['S&P 500', 'Dow Jones Industrial Average', 'NASDAQ Composite', 'Russell 2000', 'VIX'],
  Europe: ['FTSE 100', 'DAX', 'CAC 40', 'STOXX 50', 'SMI'],
  Asia: ['Nikkei 225', 'Hang Seng', 'Shanghai Composite', 'KOSPI', 'Nifty 50'],
  Commodities: ['Gold', 'Silver', 'Crude Oil WTI', 'Brent Crude', 'Natural Gas', 'Copper', 'Platinum', 'Palladium', 'Wheat', 'Corn'],
  Currencies: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CNY', 'BTC-USD', 'ETH-USD'],
  Bonds: ['US 10Y Treasury Yield', 'US 2Y Treasury Yield', 'US 5Y Treasury Yield', 'US 30Y Treasury Yield', 'German 10Y Bund', 'UK 10Y Gilt', 'Japan 10Y Bond']
};

const SEARCH_KEYWORDS: Record<string, string> = {
  solar: 'TAN',
  'solar etf': 'TAN',
  'clean energy': 'ICLN',
  energy: 'XLE',
  firstsolar: 'FSLR',
  'first solar': 'FSLR',
  'first solar inc': 'FSLR',
};

interface MarketDashboardProps {
  onAddToWatchlist?: (symbol: string) => void;
  isDarkMode?: boolean;
}

export const MarketDashboard: React.FC<MarketDashboardProps> = React.memo(({ onAddToWatchlist, isDarkMode = false }) => {
  const [activeTab, setActiveTab] = useState<MarketTab>('Americas');
  const [marketData, setMarketData] = useState<Record<MarketTab, MarketData[]>>({
    Americas: [], Europe: [], Asia: [], Commodities: [], Currencies: [], Bonds: []
  });
  
  const [news, setNews] = useState<NewsItem[]>([]);
  
  // Loading states
  const [tabLoading, setTabLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(true);
  
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<MarketData | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  
  // Chart state
  const [historyData, setHistoryData] = useState<HistoricalDataPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hoverData, setHoverData] = useState<{index: number, x: number, y: number} | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('1D');
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  // Time range labels for display
  const TIME_RANGE_LABELS: Record<TimeRange, string> = {
    '1D': 'Today',
    '1W': 'Week',
    '1M': 'Month',
    '1Y': 'Year',
    '5Y': '5 Years',
    'MAX': 'All Time'
  };

  // Helper to merge sources
  const addSources = (newSources: GroundingSource[]) => {
    setSources(prev => {
      const all = [...prev, ...newSources];
      const unique = new Map();
      all.forEach(s => unique.set(s.url, s));
      return Array.from(unique.values());
    });
  };

  const fetchCategoryData = async (category: MarketTab) => {
    setTabLoading(true);
    try {
      const symbols = MARKET_CATEGORIES[category];
      const res = await fetchMarketData(symbols);
      setMarketData(prev => ({ ...prev, [category]: res.data }));
      addSources(res.sources);
    } catch (err) {
      console.error(err);
    } finally {
      setTabLoading(false);
    }
  };

  const refreshAll = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setNewsLoading(true);
    }
    
    setLastRefreshed(new Date());

    // Refresh current active tab
    if (!isBackground) setTabLoading(true);
    
    fetchMarketData(MARKET_CATEGORIES[activeTab])
      .then(res => {
        setMarketData(prev => ({ ...prev, [activeTab]: res.data }));
        addSources(res.sources);
      })
      .finally(() => setTabLoading(false));

    // Refresh News
    fetchMarketNews()
      .then(res => {
        setNews(res.news);
        addSources(res.sources);
      })
      .finally(() => setNewsLoading(false));

    // Refresh Search Result if active
    if (activeSearchTerm) {
      handleSearchFetch(activeSearchTerm, true);
    }
  }, [activeTab, activeSearchTerm]);

  // Effect to fetch when tab changes
  useEffect(() => {
    fetchCategoryData(activeTab);
  }, [activeTab]);

  // Effect for Auto Refresh - Updates every 5 seconds for live feel
  useEffect(() => {
    // Initial news load
    fetchMarketNews().then(res => {
      setNews(res.news);
      addSources(res.sources);
      setNewsLoading(false);
    });

    // Auto-refresh prices every 15 seconds (real API has rate limits)
    const priceIntervalId = setInterval(() => {
      // Silently refresh market data without loading spinners
      fetchMarketData(MARKET_CATEGORIES[activeTab])
        .then(res => {
          setMarketData(prev => ({ ...prev, [activeTab]: res.data }));
          setLastRefreshed(new Date());
        });
    }, 15000); // 15s for live price updates

    // Refresh news less frequently (every 2 minutes)
    const newsIntervalId = setInterval(() => {
      fetchMarketNews().then(res => {
        setNews(res.news);
        addSources(res.sources);
      });
    }, 120000); // 2 min

    return () => {
      clearInterval(priceIntervalId);
      clearInterval(newsIntervalId);
    };
  }, [activeTab]);

  const handleSearchFetch = async (query: string, isRefresh: boolean = false) => {
    const raw = query.trim();
    if (!raw) return;

    if (!isRefresh) {
      setSearchLoading(true);
      setSearchError('');
      setSearchResult(null);
      setHistoryData([]);
      setHistoryLoading(true);
      setHoverData(null);
    }

    // Normalize and map common keywords to symbols
    const keyword = raw.toLowerCase();
    let symbolQuery = raw.toUpperCase();
    if (SEARCH_KEYWORDS[keyword]) {
      symbolQuery = SEARCH_KEYWORDS[keyword];
    }

    try {
      setActiveSearchTerm(symbolQuery);

      const result = await fetchMarketData([symbolQuery]);
      if (result.data && result.data.length > 0) {
        const item = result.data[0];
        setSearchResult(item);
        addSources(result.sources);
        
        fetchStockHistory(item.symbol, selectedTimeRange).then(async (histRes) => {
          if (histRes.history && histRes.history.length >= 2) {
            setHistoryData(histRes.history);
            if (histRes.sources) addSources(histRes.sources);
            return;
          }

          const fallbackPrices = await fetchHistoricalData(item.symbol, '1M');
          if (fallbackPrices.length > 0) {
            const today = new Date();
            const syntheticData: HistoricalDataPoint[] = fallbackPrices.map((p, i) => {
              const d = new Date();
              d.setDate(today.getDate() - (fallbackPrices.length - 1 - i));
              return { date: d.toISOString().split('T')[0], price: p };
            });
            setHistoryData(syntheticData);
          } else {
            setHistoryData([]);
          }

          if (histRes.sources) addSources(histRes.sources);
        }).finally(() => {
          setHistoryLoading(false);
        });

      } else {
        const hint = SEARCH_KEYWORDS[keyword] || 'NVDA';
        setSearchError(`No market data found for "${raw}". Try searching by ticker symbol (e.g. NVDA, BTC-USD, TAN for solar).`);
        setActiveSearchTerm('');
        setHistoryLoading(false);
      }
    } catch (err) {
      console.error("Search error:", err);
      setSearchError("Failed to fetch search results.");
      setHistoryLoading(false);
    } finally {
      if (!isRefresh) setSearchLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    handleSearchFetch(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setActiveSearchTerm('');
    setSearchResult(null);
    setSearchError('');
    setHistoryData([]);
    setHoverData(null);
    setSelectedTimeRange('1D');
  };
  
  // Change time range and refetch history
  const changeTimeRange = async (range: TimeRange) => {
    if (!searchResult) return;
    setSelectedTimeRange(range);
    setHistoryLoading(true);
    setHoverData(null);
    
    try {
      const histRes = await fetchStockHistory(searchResult.symbol, range);
      if (histRes.history && histRes.history.length >= 2) {
        setHistoryData(histRes.history);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Generate chart SVG props
  const chartProps = useMemo(() => {
    if (historyData.length === 0) return null;
    const prices = historyData.map(d => d.price);
    return createChartPaths(prices, 400, 150); // width 400, height 150
  }, [historyData]);

  // Chart interaction handlers
  const handleChartMouseMove = (e: React.MouseEvent) => {
    if (!chartContainerRef.current || historyData.length === 0) return;
    
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    // Calculate index based on X position
    const ratio = Math.max(0, Math.min(1, x / width));
    const index = Math.round(ratio * (historyData.length - 1));
    
    // Calculate exact X position for this index to snap tooltip
    const snapX = (index / (historyData.length - 1)) * width;
    
    setHoverData({ index, x: snapX, y: 0 }); // y is not used for vertical line
  };

  const handleChartMouseLeave = () => {
    setHoverData(null);
  };

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-[#f5f5f5] text-slate-900'} overflow-y-auto font-sans scrollbar-hide`}>
      {/* Top Navigation / Header */}
      <div
        className={`p-4 md:p-6 border-b sticky top-0 z-20 shadow-sm ${
          isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4 md:gap-6 max-w-7xl mx-auto w-full">
          
          <div className="flex-shrink-0 text-center xl:text-left w-full xl:w-auto">
            <h1
              className={`text-2xl md:text-3xl font-bold tracking-tight flex items-center justify-center xl:justify-start gap-2 ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">Global Markets</span>
            </h1>
            <p
              className={`text-[10px] md:text-xs font-medium uppercase tracking-widest mt-1 ${
                isDarkMode ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Real-time Data & Intelligence
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex-1 w-full max-w-2xl relative">
              <div className="relative group">
                  <input 
                      type="text" 
                      className={`w-full rounded-full py-2.5 md:py-3 pl-10 md:pl-12 pr-10 md:pr-12 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all shadow-sm border ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500'
                          : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                      placeholder="Search Quote, Index, or Crypto (e.g. NVDA, BTC)..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                  />
                  <i
                    className={`fas fa-search absolute left-3 md:left-4 top-1/2 transform -translate-y-1/2 text-sm md:text-base transition-colors ${
                      isDarkMode ? 'text-slate-500 group-focus-within:text-blue-400' : 'text-slate-400 group-focus-within:text-blue-500'
                    }`}
                  ></i>
                  {searchQuery && (
                      <button 
                          type="button"
                          onClick={clearSearch}
                          className={`absolute right-3 md:right-4 top-1/2 transform -translate-y-1/2 p-1 rounded-full transition-all ${
                            isDarkMode
                              ? 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                          }`}
                      >
                          <i className="fas fa-times"></i>
                      </button>
                  )}
              </div>
          </form>

          <div className="flex items-center gap-3 md:gap-4 flex-shrink-0 justify-between w-full xl:w-auto">
             <div className="flex items-center gap-3">
               <div
                 className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${
                   isDarkMode ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-emerald-50 border-emerald-200'
                 }`}
               >
                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                 <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">LIVE</span>
               </div>
               <div className="flex flex-col items-start xl:items-end text-left xl:text-right">
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Auto-updating</span>
                  <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {lastRefreshed ? lastRefreshed.toLocaleTimeString() : '--:--:--'}
                  </span>
               </div>
             </div>
             <button 
               onClick={() => refreshAll(false)}
               disabled={tabLoading || newsLoading}
               className={`p-2.5 md:p-3 rounded-full transition-colors shadow border disabled:opacity-60 ${
                 isDarkMode
                   ? 'bg-slate-900 hover:bg-slate-800 text-blue-400 border-slate-700'
                   : 'bg-white hover:bg-slate-50 text-blue-600 border-slate-200'
               }`}
               title="Refresh Data"
             >
               <i className={`fas fa-sync-alt ${tabLoading || newsLoading ? 'animate-spin' : ''}`}></i>
             </button>
          </div>
        </div>
      </div>

      <div className="p-3 md:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto w-full">
        
        {/* Search Result Section - Expanded with Chart */}
        {(searchResult || searchLoading || searchError) && (
            <div className="animate-fade-in mb-6 md:mb-8">
                {searchLoading && (
                   <div
                     className={`w-full rounded-xl border p-6 animate-pulse h-48 ${
                       isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                     }`}
                   ></div>
                )}

                {searchError && (
                    <div
                      className={`p-4 border rounded-lg flex items-center gap-3 ${
                        isDarkMode
                          ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}
                    >
                        <i className="fas fa-exclamation-triangle"></i>
                        {searchError}
                    </div>
                )}

                {searchResult && !searchLoading && (
                    <div
                      className={`rounded-xl border shadow overflow-hidden relative group transition-colors ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-800 hover:border-slate-600'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                        <div className="p-4 md:p-6 flex flex-col lg:flex-row justify-between items-stretch gap-6">
                            
                            {/* Left: Info */}
                            <div className="flex-1 flex flex-col justify-center">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-3">
                                    <h2
                                      className={`text-3xl md:text-4xl font-bold tracking-tight ${
                                        isDarkMode ? 'text-white' : 'text-slate-900'
                                      }`}
                                    >
                                      {searchResult.symbol}
                                    </h2>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                        isDarkMode
                                          ? 'bg-slate-800 text-slate-200 border-slate-600'
                                          : 'bg-slate-100 text-slate-600 border-slate-200'
                                      }`}
                                    >
                                      Real-Time
                                    </span>
                                  </div>
                                  
                                  {/* Add to Watchlist Button */}
                                  {onAddToWatchlist && (
                                    <button
                                      onClick={() => onAddToWatchlist(searchResult.symbol)}
                                      className="lg:hidden p-2 text-slate-400 hover:text-blue-400 bg-slate-800 rounded-full transition-colors"
                                    >
                                      <i className="fas fa-plus"></i>
                                    </button>
                                  )}
                                </div>

                                <h3
                                  className={`text-base md:text-lg font-medium mb-4 md:mb-6 ${
                                    isDarkMode ? 'text-slate-300' : 'text-slate-600'
                                  }`}
                                >
                                  {searchResult.name}
                                </h3>
                                
                                <div className="flex items-baseline gap-4 mb-4">
                                  <span
                                    className={`text-5xl md:text-6xl font-bold tracking-tighter ${
                                      isDarkMode ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {searchResult.price}
                                  </span>
                                </div>
                                <div className={`flex items-center gap-3 ${searchResult.isPositive ? 'text-emerald-400' : 'text-rose-500'}`}>
                                    <span className="text-xl md:text-2xl font-bold flex items-center gap-1">
                                      <i className={`fas fa-caret-${searchResult.isPositive ? 'up' : 'down'}`}></i>
                                      {searchResult.change}
                                    </span>
                                    <span className="text-lg md:text-xl font-medium opacity-80 bg-slate-800/50 px-2 py-1 rounded">
                                      {searchResult.changePercent}
                                    </span>
                                </div>

                                <div className="mt-6 md:mt-8 hidden lg:block">
                                   <button 
                                      onClick={() => onAddToWatchlist && onAddToWatchlist(searchResult.symbol)}
                                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg hover:shadow-blue-500/25 transform hover:-translate-y-0.5"
                                   >
                                      <i className="fas fa-plus-circle"></i>
                                      Add to Watchlist
                                   </button>
                                </div>
                            </div>

                            {/* Right: Detailed Chart */}
                            <div
                              className={`flex-[1.5] min-h-[280px] md:min-h-[320px] rounded-lg p-4 md:p-6 relative border flex flex-col ${
                                isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                              }`}
                            >
                                <div className="flex flex-col gap-3 mb-3">
                                  <div className="flex justify-between items-start">
                                    <div>
                                       <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Price History</span>
                                       <span className="text-[10px] text-slate-500">{TIME_RANGE_LABELS[selectedTimeRange]}</span>
                                    </div>
                                    <div className="flex gap-2">
                                       <span className={`text-xs px-2 py-1 rounded font-bold ${searchResult.isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                         {searchResult.isPositive ? 'Bullish' : 'Bearish'}
                                       </span>
                                    </div>
                                  </div>
                                  
                                  {/* Time Range Buttons */}
                                  <div className="flex gap-1 flex-wrap">
                                    {(['1D', '1W', '1M', '1Y', '5Y', 'MAX'] as TimeRange[]).map((range) => (
                                      <button
                                        key={range}
                                        onClick={() => changeTimeRange(range)}
                                        disabled={historyLoading}
                                        className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all ${
                                          selectedTimeRange === range
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : isDarkMode
                                              ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
                                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                                        } ${historyLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        {range === 'MAX' ? 'ALL' : range}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex-1 w-full h-full relative" ref={chartContainerRef} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  {historyLoading ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                       <i className="fas fa-circle-notch fa-spin text-2xl"></i>
                                    </div>
                                  ) : chartProps ? (
                                    <div className="relative w-full h-full cursor-crosshair">
                                      {/* Y-Axis Labels */}
                                      <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-slate-500 font-mono pointer-events-none z-10">
                                         <span>{chartProps.max.toFixed(2)}</span>
                                         <span>{((chartProps.max + chartProps.min)/2).toFixed(2)}</span>
                                         <span>{chartProps.min.toFixed(2)}</span>
                                      </div>
                                      
                                      {/* Chart SVG */}
                                      <svg viewBox="0 0 400 150" className="w-full h-full overflow-visible preserve-3d pl-8">
                                        <defs>
                                          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={searchResult.isPositive ? '#10b981' : '#f43f5e'} stopOpacity="0.2" />
                                            <stop offset="100%" stopColor={searchResult.isPositive ? '#10b981' : '#f43f5e'} stopOpacity="0" />
                                          </linearGradient>
                                        </defs>
                                        
                                        {/* Grid lines */}
                                        <line x1="0" y1="0" x2="400" y2="0" stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.9" />
                                        <line x1="0" y1="75" x2="400" y2="75" stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.9" />
                                        <line x1="0" y1="150" x2="400" y2="150" stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.9" />

                                        <path 
                                          d={chartProps.area} 
                                          fill="url(#chartGradient)" 
                                        />
                                        <path 
                                          d={chartProps.line} 
                                          fill="none" 
                                          stroke={searchResult.isPositive ? '#10b981' : '#f43f5e'} 
                                          strokeWidth="2.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="drop-shadow-lg"
                                        />
                                        
                                        {/* Hover Tooltip Overlay */}
                                        {hoverData && (
                                            <>
                                                <line 
                                                    x1={400 * (hoverData.index / (historyData.length - 1))} 
                                                    y1="0" 
                                                    x2={400 * (hoverData.index / (historyData.length - 1))}  
                                                    y2="150" 
                                                    stroke="#64748b" 
                                                    strokeWidth="1" 
                                                    strokeDasharray="4 2"
                                                />
                                                <circle 
                                                    cx={400 * (hoverData.index / (historyData.length - 1))} 
                                                    cy={150 - 150 * ((historyData[hoverData.index].price - chartProps.min) / (chartProps.max - chartProps.min || 1)) * 0.7 - 22.5} 
                                                    r="4" 
                                                    fill="white" 
                                                    stroke={searchResult.isPositive ? '#10b981' : '#f43f5e'}
                                                    strokeWidth="2"
                                                />
                                            </>
                                        )}
                                      </svg>
                                      
                                      {/* HTML Tooltip (absolute positioned over container) */}
                                      {hoverData && (
                                         <div 
                                            className="absolute bg-slate-800 text-white text-xs rounded p-2 shadow-xl border border-slate-700 pointer-events-none z-20 whitespace-nowrap"
                                            style={{ 
                                                left: hoverData.x + 32, // Offset by padding
                                                top: 0,
                                                transform: `translate(${hoverData.index > historyData.length / 2 ? '-100%' : '0'}, -120%)` 
                                            }}
                                         >
                                            <div className="font-bold">{historyData[hoverData.index].date}</div>
                                            <div className="font-mono text-emerald-400">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(historyData[hoverData.index].price)}
                                            </div>
                                         </div>
                                      )}

                                      {/* X-Axis Labels */}
                                      <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-2 pl-8">
                                         <span>{historyData[0]?.date}</span>
                                         {historyData.length > 2 && (
                                           <span>{historyData[Math.floor(historyData.length / 2)]?.date}</span>
                                         )}
                                         <span>{historyData[historyData.length - 1]?.date || 'Now'}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
                                      Chart data unavailable
                                    </div>
                                  )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Market Tabs */}
        <div>
          <div
            className={`flex overflow-x-auto scrollbar-hide border-b mb-4 md:mb-6 gap-1 rounded-t-lg px-1 ${
              isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
            }`}
          >
            {(Object.keys(MARKET_CATEGORIES) as MarketTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 md:px-6 py-2 md:py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-all relative ${
                  activeTab === tab 
                    ? isDarkMode
                      ? 'text-blue-400'
                      : 'text-blue-600'
                    : isDarkMode
                      ? 'text-slate-400 hover:text-slate-100'
                      : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
            ))}
          </div>

          <div className="min-h-[300px]">
            {tabLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array(6).fill(0).map((_, i) => (
                   <div
                     key={i}
                     className={`h-32 rounded-lg animate-pulse border ${
                       isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                     }`}
                   ></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {marketData[activeTab]?.map((item) => (
                  <div
                    key={item.symbol}
                    className={`rounded-lg p-4 md:p-5 transition-all group cursor-pointer border ${
                      isDarkMode
                        ? 'bg-slate-900 border-slate-800 hover:border-blue-500/60 hover:bg-slate-900/80'
                        : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/40'
                    }`}
                    onClick={() => { setSearchQuery(item.symbol); setActiveSearchTerm(item.symbol); handleSearchFetch(item.symbol); }}
                  >
                      <div className="flex justify-between items-start mb-3">
                        <div className="overflow-hidden flex-1">
                          <h4
                            className={`font-semibold truncate pr-2 group-hover:text-blue-400 transition-colors ${
                              isDarkMode ? 'text-slate-100' : 'text-slate-900'
                            }`}
                          >
                            {item.name}
                          </h4>
                          <span className="text-xs text-slate-500 font-mono">{item.symbol}</span>
                        </div>
                        {/* Trend indicator */}
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-lg ${
                            item.isPositive
                              ? isDarkMode
                                ? 'bg-emerald-500/10'
                                : 'bg-emerald-50'
                              : isDarkMode
                                ? 'bg-rose-500/10'
                                : 'bg-rose-50'
                          }`}
                        >
                          <i className={`fas fa-arrow-trend-${item.isPositive ? 'up text-emerald-400' : 'down text-rose-400'}`}></i>
                        </div>
                      </div>
                      <div className="flex items-end justify-between">
                         <span
                           className={`text-xl font-bold ${
                             isDarkMode ? 'text-slate-50' : 'text-slate-900'
                           }`}
                         >
                           {item.price}
                         </span>
                         <div className={`text-sm font-medium text-right ${item.isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                            <div className="flex items-center justify-end gap-1">
                              <span>{item.change}</span>
                              <i className={`fas fa-caret-${item.isPositive ? 'up' : 'down'}`}></i>
                            </div>
                            <div className="opacity-75 text-xs">{item.changePercent}</div>
                         </div>
                      </div>
                  </div>
                ))}
                {marketData[activeTab]?.length === 0 && !tabLoading && (
                   <div className="col-span-full py-12 text-center text-slate-500">
                     <i className="fas fa-satellite-dish mb-2 text-2xl"></i>
                     <p>Unable to fetch data for {activeTab}. Please try refreshing.</p>
                   </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* News Section */}
        <div className="pt-6 md:pt-8 border-t border-slate-200">
            <h3
              className={`text-lg md:text-xl font-bold mb-4 md:mb-6 flex items-center gap-2 ${
                isDarkMode ? 'text-slate-100' : 'text-slate-900'
              }`}
            >
              <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
              Market Intelligence
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              <div className="lg:col-span-2 space-y-4">
                {newsLoading ? (
                  Array(3).fill(0).map((_, i) => (
                    <div
                      key={i}
                      className={`h-24 rounded-lg animate-pulse border ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    ></div>
                  ))
                ) : (
                  news.map((item, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg p-4 flex gap-4 group cursor-pointer border transition-all ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-800 hover:border-blue-500/60'
                          : 'bg-white border-slate-200 hover:border-blue-200'
                      }`}
                      onClick={() => window.open(item.url, '_blank')}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                           <span
                             className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                               isDarkMode
                                 ? 'text-slate-200 bg-slate-800 border-slate-600'
                                 : 'text-slate-600 bg-slate-100 border-slate-200'
                             }`}
                           >
                             {item.source}
                           </span>
                           <span className="text-xs text-slate-500"><i className="far fa-clock mr-1"></i>{item.time}</span>
                        </div>
                        <h4
                          className={`text-base md:text-lg font-medium leading-snug group-hover:text-blue-400 transition-colors ${
                            isDarkMode ? 'text-slate-100' : 'text-slate-900'
                          }`}
                        >
                          {item.title}
                        </h4>
                      </div>
                      <div
                        className={`hidden sm:flex flex-col justify-center items-center w-12 border-l pl-4 transition-colors ${
                          isDarkMode
                            ? 'border-slate-700 text-slate-500 group-hover:text-blue-400'
                            : 'border-slate-200 text-slate-400 group-hover:text-blue-500'
                        }`}
                      >
                         <i className="fas fa-chevron-right"></i>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Sources Sidebar */}
              <div
                className={`rounded-xl p-6 border h-fit shadow-sm ${
                  isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                 <h4
                   className={`text-sm font-bold uppercase tracking-widest mb-4 ${
                     isDarkMode ? 'text-slate-100' : 'text-slate-700'
                   }`}
                 >
                   Data Sources
                 </h4>
                 <div className="space-y-3">
                    {sources.length > 0 ? sources.slice(0, 8).map((source, i) => (
                      <a
                        key={i}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-2 text-xs transition-colors truncate ${
                          isDarkMode
                            ? 'text-blue-300 hover:text-blue-200'
                            : 'text-blue-400/80 hover:text-blue-400'
                        }`}
                      >
                        <i className="fas fa-link text-[10px] opacity-50"></i>
                        <span className="truncate">{source.title}</span>
                      </a>
                    )) : (
                      <p className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                        Sources will appear here after data is fetched.
                      </p>
                    )}
                 </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
});
