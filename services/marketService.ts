import { MarketResponse, NewsResponse, MarketData, HistoricalDataPoint } from "../types";

// ============ REAL-TIME MARKET DATA SERVICE ============
// Uses Yahoo Finance API for accurate, real-time prices

// Symbol mapping for indices and special assets
const SYMBOL_MAP: Record<string, string> = {
  'S&P 500': '^GSPC',
  'DOW JONES INDUSTRIAL AVERAGE': '^DJI',
  'NASDAQ COMPOSITE': '^IXIC',
  'RUSSELL 2000': '^RUT',
  'VIX': '^VIX',
  'FTSE 100': '^FTSE',
  'DAX': '^GDAXI',
  'CAC 40': '^FCHI',
  'STOXX 50': '^STOXX50E',
  'SMI': '^SSMI',
  'NIKKEI 225': '^N225',
  'HANG SENG': '^HSI',
  'SHANGHAI COMPOSITE': '000001.SS',
  'KOSPI': '^KS11',
  'NIFTY 50': '^NSEI',
  'GOLD': 'GC=F',
  'SILVER': 'SI=F',
  'CRUDE OIL WTI': 'CL=F',
  'BRENT CRUDE': 'BZ=F',
  'NATURAL GAS': 'NG=F',
  'COPPER': 'HG=F',
  'PLATINUM': 'PL=F',
  'PALLADIUM': 'PA=F',
  'WHEAT': 'ZW=F',
  'CORN': 'ZC=F',
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'JPY=X',
  'USD/CNY': 'CNY=X',
  'BTC-USD': 'BTC-USD',
  'ETH-USD': 'ETH-USD',
  'US 10Y TREASURY YIELD': '^TNX',
  'US 2Y TREASURY YIELD': '^IRX',
  'US 5Y TREASURY YIELD': '^FVX',
  'US 30Y TREASURY YIELD': '^TYX',
  'GERMAN 10Y BUND': '^BUND',
  'UK 10Y GILT': '^GILT',
  'JAPAN 10Y BOND': '^JGB',
};

// Cache to reduce API calls
const priceCache: Map<string, { data: MarketData; timestamp: number }> = new Map();
const CACHE_TTL = 10000; // 10 seconds cache

// CORS proxies to try (in order)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  ''  // Direct fetch as fallback
];

// Fetch with CORS proxy fallback
async function fetchWithProxy(url: string): Promise<Response> {
  for (const proxy of CORS_PROXIES) {
    try {
      const fetchUrl = proxy ? `${proxy}${encodeURIComponent(url)}` : url;
      const response = await fetch(fetchUrl);
      if (response.ok) {
        return response;
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error('All fetch attempts failed');
}

// Fetch real data from Yahoo Finance
async function fetchYahooQuote(symbol: string): Promise<MarketData | null> {
  const yahooSymbol = SYMBOL_MAP[symbol.toUpperCase()] || symbol;
  
  try {
    // Using Yahoo Finance API via a public endpoint
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
    
    const response = await fetchWithProxy(url);
    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result) {
      throw new Error('No data');
    }
    
    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice || meta.previousClose;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    const isPositive = change >= 0;
    
    return {
      symbol: symbol.toUpperCase(),
      name: meta.shortName || meta.symbol || symbol,
      price: currentPrice < 10 ? currentPrice.toFixed(4) : currentPrice.toFixed(2),
      change: (isPositive ? '+' : '') + change.toFixed(2),
      changePercent: (isPositive ? '+' : '') + changePercent.toFixed(2) + '%',
      isPositive,
      lastUpdated: new Date()
    };
  } catch (error) {
    console.warn(`Failed to fetch ${symbol}:`, error);
    return null;
  }
}

// Fetch multiple quotes from Yahoo Finance in a single request
async function fetchYahooQuotesBatch(symbols: string[]): Promise<MarketData[]> {
  if (!symbols.length) return [];

  const now = Date.now();

  // Map display symbols (what the app uses, e.g. 'S&P 500') to Yahoo symbols
  const yahooSymbols: string[] = [];
  const yahooToDisplay: Record<string, string> = {};

  for (const symbol of symbols) {
    const displaySymbol = symbol.toUpperCase();
    const yahooSymbol = SYMBOL_MAP[displaySymbol] || displaySymbol;
    yahooSymbols.push(yahooSymbol);
    yahooToDisplay[yahooSymbol] = displaySymbol;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbols.join(','))}`;
    const response = await fetchWithProxy(url);
    const data = await response.json();
    const results = data.quoteResponse?.result || [];

    const marketData: MarketData[] = [];

    for (const quote of results) {
      const yahooSymbol: string | undefined = quote.symbol;
      if (!yahooSymbol) continue;

      const displaySymbol = yahooToDisplay[yahooSymbol] || yahooSymbol.toUpperCase();

      const currentPriceRaw = quote.regularMarketPrice ?? quote.previousClose;
      const previousCloseRaw = quote.regularMarketPreviousClose ?? quote.previousClose ?? currentPriceRaw;

      if (currentPriceRaw == null || previousCloseRaw == null) continue;

      const currentPrice = Number(currentPriceRaw);
      const previousClose = Number(previousCloseRaw) || currentPrice;
      if (!isFinite(currentPrice) || !isFinite(previousClose) || previousClose === 0) continue;

      const change = currentPrice - previousClose;
      const changePercent = (change / previousClose) * 100;
      const isPositive = change >= 0;

      const formattedPrice = currentPrice < 10 ? currentPrice.toFixed(4) : currentPrice.toFixed(2);

      const item: MarketData = {
        symbol: displaySymbol,
        name: quote.shortName || quote.longName || displaySymbol,
        price: formattedPrice,
        change: (isPositive ? '+' : '') + change.toFixed(2),
        changePercent: (isPositive ? '+' : '') + changePercent.toFixed(2) + '%',
        isPositive,
        lastUpdated: new Date(),
      };

      marketData.push(item);
      priceCache.set(displaySymbol, { data: item, timestamp: now });
    }

    return marketData;
  } catch (error) {
    console.warn('Failed to fetch batch quotes:', error);
    return [];
  }
}

// Time range configurations for Yahoo Finance API
export type TimeRange = '1D' | '1W' | '1M' | '1Y' | '5Y' | 'MAX';

const TIME_RANGE_CONFIG: Record<TimeRange, { range: string; interval: string }> = {
  '1D': { range: '1d', interval: '5m' },      // 5 min intervals for today
  '1W': { range: '5d', interval: '15m' },     // 15 min intervals for week
  '1M': { range: '1mo', interval: '1h' },     // 1 hour intervals for month
  '1Y': { range: '1y', interval: '1d' },      // Daily for year
  '5Y': { range: '5y', interval: '1wk' },     // Weekly for 5 years
  'MAX': { range: 'max', interval: '1mo' },   // Monthly for all time
};

// Fetch historical data from Yahoo Finance with configurable time range
async function fetchYahooHistory(symbol: string, timeRange: TimeRange = '1D'): Promise<HistoricalDataPoint[]> {
  const yahooSymbol = SYMBOL_MAP[symbol.toUpperCase()] || symbol;
  const config = TIME_RANGE_CONFIG[timeRange];
  
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${config.interval}&range=${config.range}`;
    
    const response = await fetchWithProxy(url);
    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result || !result.timestamp) {
      return [];
    }
    
    const timestamps = result.timestamp;
    const closes = result.indicators?.quote?.[0]?.close || [];
    
    const history: HistoricalDataPoint[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        const date = new Date(timestamps[i] * 1000);
        // Format date based on time range
        let dateStr: string;
        if (timeRange === '1D') {
          dateStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === '1W') {
          dateStr = date.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        } else {
          dateStr = date.toISOString().split('T')[0];
        }
        
        history.push({
          date: dateStr,
          price: parseFloat(closes[i].toFixed(2))
        });
      }
    }
    
    return history;
  } catch (error) {
    console.warn(`Failed to fetch history for ${symbol}:`, error);
    return [];
  }
}

// ============ EXPORTED API ============

export const fetchMarketData = async (symbols: string[]): Promise<MarketResponse> => {
  const uniqueSymbols = Array.from(new Set(symbols.map(s => s.toUpperCase())));
  const now = Date.now();
  const results: MarketData[] = [];

  // First, collect any symbols we can serve from cache
  const symbolsToFetch: string[] = [];

  for (const symbol of uniqueSymbols) {
    const cached = priceCache.get(symbol);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      results.push(cached.data);
    } else {
      symbolsToFetch.push(symbol);
    }
  }

  // Fetch uncached symbols in a single batch request
  if (symbolsToFetch.length > 0) {
    const fresh = await fetchYahooQuotesBatch(symbolsToFetch);
    results.push(...fresh);

    // Fallback: for any symbols still missing after batch, try single-quote API
    const missing = symbolsToFetch.filter(sym => !results.some(r => r.symbol === sym));
    if (missing.length > 0) {
      const fallbackPromises = missing.map(sym => (
        fetchYahooQuote(sym).then(data => {
          if (data) {
            priceCache.set(sym, { data, timestamp: now });
            results.push(data);
          }
        })
      ));
      await Promise.all(fallbackPromises);
    }
  }

  // Sort results to match input order
  const orderedResults = uniqueSymbols
    .map(sym => results.find(r => r.symbol === sym))
    .filter((r): r is MarketData => r !== undefined);

  return { data: orderedResults, sources: [] };
};

export const fetchStockHistory = async (symbol: string, timeRange: TimeRange = '1D'): Promise<{ history: HistoricalDataPoint[], sources: never[] }> => {
  const history = await fetchYahooHistory(symbol, timeRange);
  return { history, sources: [] };
};

export const fetchMarketNews = async (): Promise<NewsResponse> => {
  // Fetch real news from a free RSS feed
  try {
    const response = await fetchWithProxy('https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US');
    const text = await response.text();
    
    // Parse RSS XML
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const items = xml.querySelectorAll('item');
    
    const news = Array.from(items).slice(0, 5).map(item => {
      const title = item.querySelector('title')?.textContent || 'Market Update';
      const link = item.querySelector('link')?.textContent || '#';
      const pubDate = item.querySelector('pubDate')?.textContent;
      
      let time = 'Recent';
      if (pubDate) {
        const date = new Date(pubDate);
        const diff = Date.now() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) time = `${mins}m ago`;
        else if (mins < 1440) time = `${Math.floor(mins / 60)}h ago`;
        else time = `${Math.floor(mins / 1440)}d ago`;
      }
      
      return {
        title,
        source: 'Yahoo Finance',
        time,
        url: link
      };
    });
    
    return { news, sources: [] };
  } catch (error) {
    console.warn('Failed to fetch news:', error);
    // Fallback static news
    return {
      news: [
        { title: 'Markets update - Check back for latest news', source: 'System', time: 'Now', url: '#' }
      ],
      sources: []
    };
  }
};
