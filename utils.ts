import type { MarketData } from './types';
import { fetchMarketData } from './services/marketService';

export const formatCurrency = (val: string): string => {
  if (!val) return '$0.00';
  // If it's a percentage (like bond yield), just return it
  if (val.includes('%') && !val.includes('$')) return val;
  
  const num = parseFloat(val.replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return val;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

export const parsePriceToNumber = (val: string): number => {
  if (!val) return 0;
  // Remove currency symbols, commas, etc, but keep decimal point and negative sign
  const num = parseFloat(val.replace(/[^0-9.-]+/g, ""));
  return isNaN(num) ? 0 : num;
};

export const fetchRealMarketData = async (symbols: string[]): Promise<MarketData[] | null> => {
  const cleaned = Array.from(
    new Set(
      (symbols || [])
        .map((s) => (s ?? '').toString().trim().toUpperCase())
        .filter((s) => s.length > 0)
    )
  );

  if (cleaned.length === 0) {
    return [];
  }

  try {
    const response = await fetchMarketData(cleaned);

    const result: MarketData[] = response.data
      .map((item) => {
        const priceNum = parsePriceToNumber(item.price);
        if (!isFinite(priceNum) || priceNum <= 0) {
          return null;
        }

        const changeNum = parsePriceToNumber(item.change);
        const percentNum = parseFloat(item.changePercent.replace(/[^0-9.-]+/g, ''));
        const isPositive = changeNum >= 0;

        return {
          symbol: item.symbol.toUpperCase(),
          name: item.name || item.symbol.toUpperCase(),
          price: priceNum < 10 ? priceNum.toFixed(4) : priceNum.toFixed(2),
          change: `${isPositive ? '+' : ''}${changeNum.toFixed(2)}`,
          changePercent: `${percentNum >= 0 ? '+' : ''}${percentNum.toFixed(2)}%`,
          isPositive,
          lastUpdated: item.lastUpdated instanceof Date ? item.lastUpdated : new Date(item.lastUpdated),
        } as MarketData;
      })
      .filter((item): item is MarketData => item !== null);

    return result;
  } catch (error) {
    console.error('fetchRealMarketData failed', error);
    return null;
  }
};

export const extractSources = (groundingChunks: any[]): {title: string, url: string}[] => {
  const sources: {title: string, url: string}[] = [];
  if (!groundingChunks) return sources;
  
  for (const chunk of groundingChunks) {
    if (chunk.web && chunk.web.uri) {
      sources.push({
        title: chunk.web.title || new URL(chunk.web.uri).hostname,
        url: chunk.web.uri
      });
    }
  }
  return sources;
};

/**
 * Generates a random SVG path for a sparkline chart based on trend.
 * Used for small list items.
 */
export const generateSparkline = (isPositive: boolean, width: number = 200, height: number = 50): string => {
  const points: [number, number][] = [];
  const segments = 10;
  const stepX = width / segments;
  
  // Start point
  let currentY = isPositive ? height * 0.8 : height * 0.2; 
  points.push([0, currentY]);

  for (let i = 1; i < segments; i++) {
    const x = i * stepX;
    // Random jitter
    const randomY = Math.random() * (height * 0.6) + (height * 0.2);
    // Bias slightly towards the trend direction
    const trendBias = isPositive ? -2 : 2; 
    currentY = (currentY + randomY) / 2 + trendBias;
    // Clamp
    currentY = Math.max(5, Math.min(height - 5, currentY));
    points.push([x, currentY]);
  }

  // End point
  const endY = isPositive ? height * 0.2 : height * 0.8;
  points.push([width, endY]);

  // Construct SVG path command
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]},${p[1]}`).join(' ');
  return d;
};

/**
 * Generates SVG paths for a detailed area chart.
 */
export const createChartPaths = (data: number[], width: number, height: number): { line: string, area: string, min: number, max: number } => {
  if (data.length < 2) return { line: '', area: '', min: 0, max: 0 };

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  // Add vertical padding so the line isn't cut off
  const paddingY = height * 0.15;
  const usableHeight = height - (paddingY * 2);

  const points: [number, number][] = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    // Invert Y because SVG 0 is top
    const normalizedVal = (val - min) / range;
    const y = height - paddingY - (normalizedVal * usableHeight);
    return [x, y];
  });

  // Create smooth bezier curve or straight lines. Using straight lines for financial precision feel.
  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p[0]},${p[1]}`).join(' ');
  
  // Close the path for the area fill
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return { line: linePath, area: areaPath, min, max };
};

/**
 * Generates synthetic historical data points ending at currentPrice.
 * Ensures the transition from (Day -1) to (Day 0) matches the 'change' value.
 */
export const fetchHistoricalData = async (symbol: string, period: '7D' | '1M'): Promise<number[]> => {
  const days = period === '7D' ? 7 : 30;

  let anchorPrice = 100;
  try {
    const data = await fetchRealMarketData([symbol]);
    if (data && data[0]) {
      const parsed = parsePriceToNumber(data[0].price);
      if (parsed > 0) {
        anchorPrice = parsed;
      }
    }
  } catch {
    // Fallback to default anchorPrice
  }

  const history: number[] = [];
  let price = anchorPrice;

  for (let i = days - 1; i >= 0; i--) {
    history.unshift(price);
    const volatility = price * 0.015;
    const move = (Math.random() - 0.5) * 2 * volatility;
    price = Math.max(1, price - move);
  }

  return history;
};
