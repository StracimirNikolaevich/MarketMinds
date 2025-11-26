
import React, { useState, Suspense } from 'react';
import { AppMode, PortfolioItem } from './types';

// Lazy load components for better initial performance
const MarketDashboard = React.lazy(() => import('./components/MarketAnalyst').then(module => ({ default: module.MarketDashboard })));
const Watchlist = React.lazy(() => import('./components/ImageStudio').then(module => ({ default: module.Watchlist })));
const Portfolio = React.lazy(() => import('./components/Portfolio').then(module => ({ default: module.Portfolio })));
const StockHelper = React.lazy(() => import('./components/StockHelper').then(module => ({ default: module.StockHelper })));

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.MARKETS);
  
  // Lifted Watchlist State
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN']);

  // Lifted Portfolio State
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([
    { symbol: 'AAPL', quantity: 10 },
    { symbol: 'NVDA', quantity: 5 },
    { symbol: 'MSFT', quantity: 8 },
  ]);

  const [isDarkMode, setIsDarkMode] = useState(false);

  const addToWatchlist = React.useCallback((symbol: string) => {
    const upper = symbol.toUpperCase().trim();
    setWatchlistSymbols(prev => {
      if (upper && !prev.includes(upper)) {
        return [...prev, upper];
      }
      return prev;
    });
  }, []);

  const removeFromWatchlist = React.useCallback((symbol: string) => {
    setWatchlistSymbols(prev => prev.filter(s => s !== symbol));
  }, []);

  const addToPortfolio = React.useCallback((symbol: string, quantity: number) => {
    const upper = symbol.toUpperCase().trim();
    setPortfolioItems(prev => [...prev, { symbol: upper, quantity }]);
  }, []);

  const removeFromPortfolio = React.useCallback((index: number) => {
    setPortfolioItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const toggleTheme = React.useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  return (
    <div className={`flex h-screen w-screen ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-[#f5f5f5] text-slate-900'} overflow-hidden font-sans`}>
      {/* Sidebar Navigation */}
      <nav className="w-20 md:w-64 bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 transition-all duration-300 z-50 shadow-sm">
        <div>
          <div className="p-4 md:p-6 flex items-center justify-center md:justify-start gap-3 border-b border-slate-200 h-20 md:h-24 bg-white">
            {/* Logo Section */}
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-lg overflow-hidden shadow-sm border border-slate-200 bg-white p-0.5 flex-shrink-0">
                  <img 
                    src="/logo.jpg" 
                    alt="MarketMinds Logo" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      // Fallback if image fails
                      (e.target as HTMLImageElement).src = 'https://cdn-icons-png.flaticon.com/512/3310/3310748.png';
                    }}
                  />
               </div>
               <div className="hidden md:flex flex-col">
                  <span className="text-lg font-bold text-slate-900 tracking-tight leading-none">
                    Market<span className="text-blue-600">Minds</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-1">Terminal v2.6</span>
               </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 p-2 md:p-3 mt-2 md:mt-4">
            <button
              onClick={() => setMode(AppMode.MARKETS)}
              className={`flex items-center gap-4 px-3 md:px-4 py-3 rounded-xl transition-all duration-200 group ${
                mode === AppMode.MARKETS
                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Markets"
            >
              <i className={`fas fa-globe-americas text-lg w-6 text-center ${mode === AppMode.MARKETS ? 'text-blue-600' : 'group-hover:text-blue-600'}`}></i>
              <span className="hidden md:block font-medium text-sm">Markets & News</span>
            </button>

            <button
              onClick={() => setMode(AppMode.WATCHLIST)}
              className={`flex items-center gap-4 px-3 md:px-4 py-3 rounded-xl transition-all duration-200 group ${
                mode === AppMode.WATCHLIST
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Watchlist"
            >
              <i className={`fas fa-list-ul text-lg w-6 text-center ${mode === AppMode.WATCHLIST ? 'text-emerald-700' : 'group-hover:text-emerald-700'}`}></i>
              <span className="hidden md:block font-medium text-sm">My Watchlist</span>
              <span className="ml-auto bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full hidden md:block">
                {watchlistSymbols.length}
              </span>
            </button>

            <button
              onClick={() => setMode(AppMode.PORTFOLIO)}
              className={`flex items-center gap-4 px-3 md:px-4 py-3 rounded-xl transition-all duration-200 group ${
                mode === AppMode.PORTFOLIO
                  ? 'bg-violet-50 text-violet-700 border border-violet-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Portfolio"
            >
              <i className={`fas fa-briefcase text-lg w-6 text-center ${mode === AppMode.PORTFOLIO ? 'text-violet-700' : 'group-hover:text-violet-700'}`}></i>
              <span className="hidden md:block font-medium text-sm">Portfolio</span>
            </button>

            <button
              onClick={() => setMode(AppMode.AI_ASSISTANT)}
              className={`flex items-center gap-4 px-3 md:px-4 py-3 rounded-xl transition-all duration-200 group ${
                mode === AppMode.AI_ASSISTANT
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="Stockie"
            >
              <i className={`fas fa-robot text-lg w-6 text-center ${mode === AppMode.AI_ASSISTANT ? 'text-purple-700' : 'group-hover:text-purple-700'}`}></i>
              <span className="hidden md:block font-medium text-sm">Stockie</span>
              <span className="ml-auto bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full hidden md:block">
                NEW
              </span>
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 hidden md:block">
          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 border border-slate-200 flex flex-col gap-2">
            <div>
              <p className="font-semibold text-slate-700 mb-1">Data Feed</p>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span>Search Grounding Active</span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-200 opacity-90">
              <span>Powered by Gemini 2.5</span>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-300 bg-white text-[10px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <i className={`fas ${isDarkMode ? 'fa-sun text-amber-400' : 'fa-moon text-slate-500'}`}></i>
                <span>{isDarkMode ? 'Light' : 'Dark'} mode</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className={`flex-1 relative overflow-hidden ${isDarkMode ? 'bg-slate-950' : 'bg-[#f5f5f5]'}`}>
        <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500"><i className="fas fa-circle-notch fa-spin text-3xl"></i></div>}>
          {mode === AppMode.MARKETS && (
            <MarketDashboard onAddToWatchlist={addToWatchlist} isDarkMode={isDarkMode} />
          )}
          {mode === AppMode.WATCHLIST && (
            <Watchlist 
              symbols={watchlistSymbols} 
              onAdd={addToWatchlist} 
              onRemove={removeFromWatchlist} 
              onAddToPortfolio={addToPortfolio}
              isDarkMode={isDarkMode}
            />
          )}
          {mode === AppMode.PORTFOLIO && (
            <Portfolio 
              items={portfolioItems}
              onAddPosition={addToPortfolio}
              onRemovePosition={removeFromPortfolio}
              isDarkMode={isDarkMode}
            />
          )}
          {mode === AppMode.AI_ASSISTANT && (
            <StockHelper 
              watchlistSymbols={watchlistSymbols}
              onAddToWatchlist={addToWatchlist}
              onRemoveFromWatchlist={removeFromWatchlist}
              portfolioSymbols={portfolioItems.map(p => `${p.symbol}:${p.quantity}`)}
              onAddToPortfolio={addToPortfolio}
              isDarkMode={isDarkMode}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}
