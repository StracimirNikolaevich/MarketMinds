import React, { useState, useEffect, useMemo } from 'react';
import { MarketData, PortfolioItem } from '../types';
import { parsePriceToNumber, formatCurrency, fetchRealMarketData } from '../utils';

// Color palette for chart
const CHART_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#6366f1', // indigo-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
  '#14b8a6', // teal-500
];

interface PortfolioProps {
  items: PortfolioItem[];
  onAddPosition: (symbol: string, quantity: number) => void;
  onRemovePosition: (index: number) => void;
}

export const Portfolio: React.FC<PortfolioProps & { isDarkMode?: boolean }> = ({ items, onAddPosition, onRemovePosition, isDarkMode = false }) => {
  
  const [marketDataMap, setMarketDataMap] = useState<Record<string, MarketData>>({});
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form State
  const [newSymbol, setNewSymbol] = useState('');
  const [newQuantity, setNewQuantity] = useState('');

  const fetchPortfolioData = async (items: PortfolioItem[]) => {
    if (items.length === 0) return;
    setLoading(true);
    const symbols = items.map(p => p.symbol);
    // Dedup symbols for fetch
    const uniqueSymbols = Array.from(new Set(symbols));
    
    try {
      const result = await fetchRealMarketData(uniqueSymbols);
      if (!result) {
        return;
      }

      const newMap = { ...marketDataMap };
      const newPrices: Record<string, number> = { ...currentPrices };
      result.forEach(item => {
        newMap[item.symbol] = item;
        newPrices[item.symbol] = parsePriceToNumber(item.price);
      });
      
      setMarketDataMap(newMap);
      setCurrentPrices(newPrices);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch portfolio data", error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and auto-refresh every 15 seconds
  useEffect(() => {
    fetchPortfolioData(items);
    
    const intervalId = setInterval(() => {
      if (items.length > 0) {
        fetchPortfolioData(items);
      }
    }, 15000);
    
    return () => clearInterval(intervalId);
  }, [items]);

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol || !newQuantity) return;
    
    const quantity = parseFloat(newQuantity);
    if (isNaN(quantity) || quantity <= 0) return;
    
    const symbol = newSymbol.toUpperCase().trim();
    
    // Notify parent to add position
    onAddPosition(symbol, quantity);
    
    // Fetch data for new item immediately
    await fetchPortfolioData([{ symbol, quantity }]);
    
    setNewSymbol('');
    setNewQuantity('');
  };

  const handleRemovePosition = (index: number) => {
    onRemovePosition(index);
  };

  // Calculations
  const totalValue = useMemo(() => {
    return items.reduce((acc, item) => {
      const data = marketDataMap[item.symbol];
      if (!data) return acc;
      const price = currentPrices[item.symbol] ?? parsePriceToNumber(data.price);
      return acc + (price * item.quantity);
    }, 0);
  }, [items, marketDataMap, currentPrices]);

  // Chart Data Preparation
  const allocationData = useMemo(() => {
    if (totalValue === 0) return [];
    
    let currentCumulativePercent = 0;
    
    const data = items.map((item, index) => {
      const data = marketDataMap[item.symbol];
      const price = data ? parsePriceToNumber(data.price) : 0;
      const value = price * item.quantity;
      const percent = value / totalValue;
      
      return {
        ...item,
        value,
        percent,
        color: CHART_COLORS[index % CHART_COLORS.length]
      };
    })
    .sort((a, b) => b.value - a.value); // Sort descending for chart

    // Calculate start/end angles based on sorted data
    return data.map(item => {
       const start = currentCumulativePercent;
       const end = currentCumulativePercent + item.percent;
       currentCumulativePercent += item.percent;
       return { ...item, start, end };
    });
  }, [items, marketDataMap, totalValue]);

  const largestPosition = useMemo(() => {
    if (!allocationData.length) return null;
    return allocationData.reduce((max, item) => (item.value > max.value ? item : max), allocationData[0]);
  }, [allocationData]);

  // Helper to create donut slice path
  const getDonutPath = (start: number, end: number) => {
    const startAngle = start * Math.PI * 2;
    const endAngle = end * Math.PI * 2;
    
    // If full circle
    if (end - start >= 0.999) {
       return `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0 M 0.6 0 A 0.6 0.6 0 1 0 -0.6 0 A 0.6 0.6 0 1 0 0.6 0 Z`;
    }

    const x1 = Math.cos(startAngle);
    const y1 = Math.sin(startAngle);
    const x2 = Math.cos(endAngle);
    const y2 = Math.sin(endAngle);
    
    const r2 = 0.6; // Inner radius
    const x3 = x2 * r2;
    const y3 = y2 * r2;
    const x4 = x1 * r2;
    const y4 = y1 * r2;
    
    const largeArc = end - start > 0.5 ? 1 : 0;
    
    return `
      M ${x1} ${y1}
      A 1 1 0 ${largeArc} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${r2} ${r2} 0 ${largeArc} 0 ${x4} ${y4}
      Z
    `;
  };

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-[#f5f5f5] text-slate-900'} overflow-y-auto`}>
      {/* Header */}
      <div
        className={`p-6 border-b flex flex-col md:flex-row justify-between items-center shadow-sm sticky top-0 z-10 gap-4 ${
          isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
        }`}
      >
        <div>
          <h1
            className={`text-2xl font-bold tracking-tight ${
              isDarkMode ? 'text-slate-100' : 'text-slate-900'
            }`}
          >
            Investment Portfolio
          </h1>
          <p
            className={`text-sm ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Track your asset allocation and performance
          </p>
          {largestPosition && (
            <p className="text-[11px] text-slate-500 mt-1">
              {items.length} assets · Largest: <span className="font-semibold text-slate-300">{largestPosition.symbol}</span>
              {` ${(largestPosition.percent * 100).toFixed(1)}% of portfolio`}
              {largestPosition.percent > 0.5
                ? ' · Very high concentration'
                : largestPosition.percent > 0.3
                ? ' · High concentration'
                : ''}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-4">
           <div className="text-right">
             <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Total Value</div>
             <div className={`text-2xl font-bold font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
               {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalValue)}
             </div>
           </div>
           <button 
             onClick={() => fetchPortfolioData(items)}
             className={`p-3 rounded-full transition-colors border shadow-sm disabled:opacity-60 ${
               isDarkMode
                 ? 'bg-slate-900 hover:bg-slate-800 text-blue-400 border-slate-700'
                 : 'bg-white hover:bg-slate-50 text-blue-600 border-slate-200'
             }`}
             disabled={loading}
           >
             <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`}></i>
           </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Top Section: Allocation Chart & Add Form */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Allocation Chart */}
            <div
              className={`rounded-xl p-6 border shadow flex flex-col ${
                isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
                 <h3
                   className={`text-sm font-bold uppercase tracking-wider mb-4 ${
                     isDarkMode ? 'text-slate-200' : 'text-slate-700'
                   }`}
                 >
                   Allocation
                 </h3>
                 {totalValue > 0 ? (
                    <div className="flex-1 flex items-center justify-center gap-6">
                        <div className="w-32 h-32 md:w-40 md:h-40 relative flex-shrink-0">
                            <svg viewBox="-1 -1 2 2" className="transform -rotate-90 w-full h-full overflow-visible drop-shadow-xl">
                               {allocationData.map((item, i) => (
                                   <path 
                                      key={i}
                                      d={getDonutPath(item.start, item.end)} 
                                      fill={item.color} 
                                      className="transition-all hover:opacity-80"
                                      stroke="#1e293b"
                                      strokeWidth="0.02"
                                   />
                               ))}
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Total</span>
                                <span className="text-xs text-white font-bold">{items.length} Assets</span>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[180px] pr-2 custom-scrollbar">
                            {allocationData.map((item, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: item.color}}></div>
                                        <span className={`font-semibold truncate ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{item.symbol}</span>
                                    </div>
                                    <span className="text-slate-400 font-mono">{(item.percent * 100).toFixed(1)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                 ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm flex-col gap-2">
                        <i className="fas fa-chart-pie text-2xl opacity-20"></i>
                        <span>No data to display</span>
                    </div>
                 )}
            </div>

            {/* Add Position Form */}
            <div
              className={`lg:col-span-2 rounded-xl p-6 border shadow flex flex-col justify-center ${
                isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <h3
                className={`text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 ${
                  isDarkMode ? 'text-slate-200' : 'text-slate-700'
                }`}
              >
                <i className="fas fa-plus-circle text-blue-500"></i> Add New Position
              </h3>
              <form onSubmit={handleAddPosition} className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs mb-1 font-semibold text-slate-400">Stock Symbol</label>
                  <input
                    type="text"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    placeholder="e.g. NVDA"
                    className={`w-full rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono transition-all border ${
                      isDarkMode
                        ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-xs mb-1 font-semibold text-slate-400">Quantity</label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="0.00"
                    step="any"
                    className={`w-full rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none font-mono transition-all border ${
                      isDarkMode
                        ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold transition-all shadow hover:shadow-blue-100 flex items-center justify-center gap-2"
                >
                  <span>Add Asset</span>
                  <i className="fas fa-arrow-right text-xs"></i>
                </button>
              </form>
            </div>
        </div>

        {/* Holdings Table */}
        <div
          className={`rounded-xl overflow-hidden border shadow ${
            isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div
            className={`p-4 border-b flex justify-between items-center ${
              isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'
            }`}
          >
             <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Current Holdings</h3>
             <span className="text-[10px] text-slate-500">P&L assumes $100 cost basis per share.</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr
                  className={`text-xs uppercase tracking-wider border-b ${
                    isDarkMode
                      ? 'bg-slate-900 border-slate-800 text-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <th className="p-4 font-medium pl-6">Asset</th>
                  <th className="p-4 font-medium text-right">Quantity</th>
                  <th className="p-4 font-medium text-right">Last Price</th>
                  <th className="p-4 font-medium text-right">Day Change</th>
                  <th className="p-4 font-medium text-right">Total Value</th>
                  <th className="p-4 font-medium text-right">Unrealized P&L</th>
                  <th className="p-4 font-medium text-center pr-6">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {items.map((item, idx) => {
                  const data = marketDataMap[item.symbol];
                  const priceNum = data ? (currentPrices[item.symbol] ?? parsePriceToNumber(data.price)) : 0;
                  const value = priceNum * item.quantity;
                  const costBasisPerShare = 100;
                  const totalCost = costBasisPerShare * item.quantity;
                  const unrealizedPnl = value - totalCost;
                  const allocItem = allocationData.find(d => d.symbol === item.symbol);
                  
                  return (
                    <tr
                      key={`${item.symbol}-${idx}`}
                      className={`transition-colors group ${
                        isDarkMode ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          {allocItem && (
                              <div className="w-1 h-8 rounded-full" style={{background: allocItem.color}}></div>
                          )}
                          <div className="flex flex-col">
                            <span className="font-semibold text-lg text-slate-100">{item.symbol}</span>
                            <span className="text-xs text-slate-500">{data?.name || 'Loading...'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono text-slate-400">
                        {item.quantity.toLocaleString()}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-200">
                        {data ? data.price : <span className="text-slate-500 animate-pulse">---</span>}
                      </td>
                      <td className={`p-4 text-right font-mono font-medium ${data?.isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {data ? (
                          <div className="flex flex-col items-end">
                            <span>{data.change}</span>
                            <span className="text-xs opacity-75">{data.changePercent}</span>
                          </div>
                        ) : '--'}
                      </td>
                      <td className="p-4 text-right font-mono font-bold bg-slate-900/40 text-slate-50">
                        {data ? formatCurrency(value.toString()) : '--'}
                      </td>
                      <td className={`p-4 text-right font-mono font-bold ${unrealizedPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {data ? formatCurrency(unrealizedPnl.toString()) : '--'}
                      </td>
                      <td className="p-4 text-center pr-6">
                        <button 
                          onClick={() => handleRemovePosition(idx)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-2 rounded-full hover:bg-rose-900/30"
                          title="Remove Position"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500">
                      <i className="fas fa-wallet text-4xl mb-3 opacity-20"></i>
                      <p>Your portfolio is empty.</p>
                      <p className="text-xs mt-1">Add stocks above to start tracking performance.</p>
                    </td>
                  </tr>
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot
                  className={`font-bold border-t ${
                    isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <tr>
                    <td colSpan={4} className="p-4 text-right text-slate-500 uppercase text-xs tracking-wider">Total Portfolio Value</td>
                    <td className={`p-4 text-right font-mono text-lg ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      {formatCurrency(totalValue.toString())}
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
