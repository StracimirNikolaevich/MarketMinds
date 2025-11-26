
export interface MarketData {
  symbol: string;
  name: string;
  price: string;
  change: string;
  changePercent: string;
  isPositive: boolean;
  lastUpdated: Date;
}

export interface NewsItem {
  title: string;
  source: string;
  time: string;
  url?: string;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface MarketResponse {
  data: MarketData[];
  sources: GroundingSource[];
  rawText?: string;
}

export interface NewsResponse {
  news: NewsItem[];
  sources: GroundingSource[];
}

export interface PortfolioItem {
  symbol: string;
  quantity: number;
}

export interface HistoricalDataPoint {
  date: string;
  price: number;
}

export enum AppMode {
  MARKETS = 'MARKETS',
  WATCHLIST = 'WATCHLIST',
  PORTFOLIO = 'PORTFOLIO',
  AI_ASSISTANT = 'AI_ASSISTANT'
}
