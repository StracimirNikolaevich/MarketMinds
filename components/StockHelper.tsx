import React, { useState, useRef, useEffect, useMemo } from 'react';
import { fetchMarketData, fetchStockHistory, TimeRange } from '../services/marketService';
import { MarketData, HistoricalDataPoint } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface MarketAnalysis {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  topMovers: { symbol: string; change: string; direction: 'up' | 'down' }[];
  sectors: { name: string; trend: 'up' | 'down' | 'flat' }[];
  recommendation: string;
}

// Stockie Logic - Smart Analysis Engine
class TradingAI {
  private marketData: Map<string, MarketData> = new Map();
  private historyCache: Map<string, HistoricalDataPoint[]> = new Map();

  // Parse numeric values from strings
  private parseNum(val: string): number {
    return parseFloat(val.replace(/[^0-9.-]/g, '')) || 0;
  }

  // Fetch and cache market data
  async updateMarketData() {
    const symbols = [
      'S&P 500', 'NASDAQ COMPOSITE', 'DOW JONES INDUSTRIAL AVERAGE',
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META',
      'GOLD', 'CRUDE OIL WTI', 'BTC-USD', 'ETH-USD',
      'US 10Y TREASURY YIELD', 'VIX', 'AMD', 'JPM', 'V', 'WMT'
    ];
    const result = await fetchMarketData(symbols);
    result.data.forEach(item => this.marketData.set(item.symbol.toUpperCase(), item));
  }

  // Fetch price history for deeper analysis
  async getHistory(symbol: string): Promise<HistoricalDataPoint[]> {
    const key = symbol.toUpperCase();
    if (!this.historyCache.has(key)) {
      const result = await fetchStockHistory(symbol, '1M');
      this.historyCache.set(key, result.history);
    }
    return this.historyCache.get(key) || [];
  }

  // Calculate volatility from price history
  calculateVolatility(history: HistoricalDataPoint[]): number {
    if (history.length < 2) return 0;
    const prices = history.map(h => h.price);
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100;
  }

  // Detect trend direction from history
  detectTrend(history: HistoricalDataPoint[]): string {
    if (history.length < 5) return 'insufficient data';
    const prices = history.map(h => h.price);
    const first = prices.slice(0, 3).reduce((a, b) => a + b) / 3;
    const last = prices.slice(-3).reduce((a, b) => a + b) / 3;
    const change = ((last - first) / first) * 100;
    if (change > 3) return 'strong uptrend';
    if (change > 1) return 'mild uptrend';
    if (change < -3) return 'strong downtrend';
    if (change < -1) return 'mild downtrend';
    return 'sideways consolidation';
  }

  // Find support and resistance from history
  findLevels(history: HistoricalDataPoint[]): { support: number; resistance: number } {
    if (history.length < 2) return { support: 0, resistance: 0 };
    const prices = history.map(h => h.price).sort((a, b) => a - b);
    return {
      support: prices[Math.floor(prices.length * 0.15)],
      resistance: prices[Math.floor(prices.length * 0.85)]
    };
  }

  // Calculate momentum score
  calcMomentum(data: MarketData, history: HistoricalDataPoint[]): number {
    const daily = this.parseNum(data.changePercent);
    if (history.length < 5) return daily;
    const prices = history.map(h => h.price);
    const weekChange = ((prices[prices.length - 1] - prices[Math.max(0, prices.length - 5)]) / prices[Math.max(0, prices.length - 5)]) * 100;
    return daily * 0.4 + weekChange * 0.6;
  }

  analyzeMarket(): MarketAnalysis {
    const allData = Array.from(this.marketData.values());
    
    // Calculate overall sentiment
    const positiveCount = allData.filter(d => d.isPositive).length;
    const totalCount = allData.length || 1;
    const positiveRatio = positiveCount / totalCount;
    
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (positiveRatio > 0.6) sentiment = 'bullish';
    else if (positiveRatio < 0.4) sentiment = 'bearish';
    
    // Get top movers
    const sorted = [...allData].sort((a, b) => {
      const aChange = Math.abs(parseFloat(a.changePercent.replace(/[^0-9.-]/g, '')));
      const bChange = Math.abs(parseFloat(b.changePercent.replace(/[^0-9.-]/g, '')));
      return bChange - aChange;
    });
    
    const topMovers = sorted.slice(0, 5).map(d => ({
      symbol: d.symbol,
      change: d.changePercent,
      direction: d.isPositive ? 'up' as const : 'down' as const
    }));

    // Sector analysis
    const sectors = [
      { name: 'Tech', symbols: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'] },
      { name: 'Indices', symbols: ['S&P 500', 'NASDAQ COMPOSITE', 'DOW JONES INDUSTRIAL AVERAGE'] },
      { name: 'Crypto', symbols: ['BTC-USD', 'ETH-USD'] },
      { name: 'Commodities', symbols: ['GOLD', 'CRUDE OIL WTI'] },
    ].map(sector => {
      const sectorData = sector.symbols
        .map(s => this.marketData.get(s.toUpperCase()))
        .filter(Boolean) as MarketData[];
      
      const avgChange = sectorData.reduce((acc, d) => {
        return acc + parseFloat(d.changePercent.replace(/[^0-9.-]/g, ''));
      }, 0) / (sectorData.length || 1);
      
      return {
        name: sector.name,
        trend: avgChange > 0.3 ? 'up' as const : avgChange < -0.3 ? 'down' as const : 'flat' as const
      };
    });

    // Generate recommendation
    const vix = this.marketData.get('VIX');
    const vixValue = vix ? parseFloat(vix.price) : 15;
    
    let recommendation = '';
    if (sentiment === 'bullish' && vixValue < 20) {
      recommendation = 'Market conditions favor growth stocks. Consider adding to tech positions.';
    } else if (sentiment === 'bearish' || vixValue > 25) {
      recommendation = 'Elevated volatility detected. Consider defensive positions or hedging strategies.';
    } else {
      recommendation = 'Mixed signals in the market. Maintain balanced portfolio allocation.';
    }

    return {
      sentiment,
      confidence: Math.round(Math.abs(positiveRatio - 0.5) * 200),
      topMovers,
      sectors,
      recommendation
    };
  }

  async generateResponse(userMessage: string): Promise<string> {
    const msg = userMessage.toLowerCase().trim();
    
    // Handle very short/vague messages
    if (msg.length < 5 || /^(ok|yes|no|sure|yep|nope|yeah|nah|fine|cool|nice|great|thanks|thx|ty|k|kk)$/i.test(msg)) {
      return this.getHelpResponse();
    }
    
    // Handle unclear "make it" / "do it" type messages
    if (/^(make|do|create|build|show|get)\s*(it|this|that|one|some)?\.?$/i.test(msg)) {
      return `🤔 I need more details! What would you like me to do?\n\n**Examples:**\n• "Make a tech portfolio"\n• "Add AAPL to watchlist"\n• "Show market overview"\n• "Analyze NVDA"\n\nWhat would you like?`;
    }
    
    try {
      await this.updateMarketData();
    } catch (e) {
      console.warn('Failed to update market data, using cached');
    }
    
    // Handle investment/money questions - but ONLY if they specify a target
    const hasNumbers = /\d+/.test(msg);
    const hasTarget = /(into|make|become|get|reach|turn.*into|want.*to be|goal)/i.test(msg);
    const moneyWords = ['euro', 'dollar', '€', '$'];
    const hasMoney = moneyWords.some(w => msg.includes(w));
    
    // Only use the template investment advice if they specify a TARGET
    // Otherwise use dynamic analysis which actually reads market conditions
    if (hasNumbers && hasTarget && hasMoney) {
      return this.getInvestmentAdvice(msg);
    }
    
    // Portfolio/strategy building questions
    const strategyResponse = this.handleStrategyQuestion(msg);
    if (strategyResponse) {
      return strategyResponse;
    }
    
    // Knowledge-based questions
    const knowledgeResponse = this.handleKnowledgeQuestion(msg);
    if (knowledgeResponse) {
      return knowledgeResponse;
    }
    
    // Extract potential stock symbols - require 3-5 letters (avoids most false positives)
    const symbolMatches = userMessage.toUpperCase().match(/\b([A-Z]{3,5})\b/g) || [];
    const commonWords = new Set([
      // Two-letter words (critical - these are often mistaken for tickers)
      'IT', 'IS', 'IN', 'ON', 'AT', 'TO', 'OF', 'OR', 'AN', 'AS', 'BY', 'DO', 'GO', 'HE', 'IF', 'ME', 'MY', 'NO',
      'OK', 'SO', 'UP', 'US', 'WE', 'AM', 'BE', 'HA', 'HI', 'HM', 'ID', 'IM', 'LA', 'LO', 'MA', 'OH', 'OW', 'OX',
      // Basic English words
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'HIS', 'WAS', 'ONE', 'OUR', 'OUT',
      'HOW', 'BUY', 'SELL', 'NOW', 'TODAY', 'WHAT', 'SHOULD', 'ABOUT', 'TELL', 'SHOW', 'MAKE', 'HAVE', 'WHERE', 'WHY',
      'THEM', 'INTO', 'WANT', 'WITH', 'THIS', 'THAT', 'FROM', 'WILL', 'WOULD', 'COULD', 'JUST', 'LIKE', 'SOME', 'ANY',
      'WHEN', 'YOUR', 'BEEN', 'MORE', 'ALSO', 'THEY', 'THAN', 'THEN', 'ONLY', 'COME', 'MADE', 'FIND', 'HERE', 'THERE',
      'MANY', 'GIVE', 'GOOD', 'MOST', 'VERY', 'OVER', 'SUCH', 'TAKE', 'MUCH', 'WELL', 'BACK', 'TURN', 'EVEN', 'STILL',
      'NEED', 'HELP', 'HIGH', 'YEAR', 'EACH', 'DOES', 'LOOK', 'BEST', 'KEEP', 'MUST', 'WENT', 'KNOW', 'LONG', 'TIME',
      'ABLE', 'AFTER', 'BEFORE', 'BEING', 'BOTH', 'CALL', 'CASE', 'COULD', 'DOWN', 'EVEN', 'FACT', 'FEEL', 'FEW',
      'GET', 'GO', 'GOT', 'GREAT', 'GROUP', 'HAND', 'HEAD', 'HOME', 'HOUSE', 'IDEA', 'IF', 'KEEP', 'KIND', 'KNOW',
      'LAST', 'LATE', 'LEFT', 'LET', 'LIFE', 'LINE', 'LIVE', 'LOVE', 'MAN', 'MAY', 'MEAN', 'MEN', 'MIGHT', 'MIND',
      'MOVE', 'NAME', 'NEW', 'NEXT', 'NIGHT', 'NO', 'NUMBER', 'OF', 'OFF', 'OLD', 'ONCE', 'OPEN', 'ORDER', 'OTHER',
      'OWN', 'PART', 'PARTY', 'PAST', 'PAY', 'PEOPLE', 'PLACE', 'PLAN', 'PLAY', 'POINT', 'POWER', 'PUT', 'QUESTION',
      'READ', 'REAL', 'RIGHT', 'RUN', 'SAID', 'SAME', 'SAY', 'SEE', 'SEEM', 'SET', 'SHE', 'SIDE', 'SINCE', 'SMALL',
      'SO', 'SOMETHING', 'STATE', 'STILL', 'STORY', 'STUDY', 'SURE', 'SYSTEM', 'TELL', 'THESE', 'THING', 'THINK',
      'THOSE', 'THOUGH', 'THREE', 'THROUGH', 'TOO', 'TRY', 'TWO', 'UNDER', 'UP', 'USE', 'USED', 'WAY', 'WE', 'WEEK',
      'WHILE', 'WHO', 'WORD', 'WORK', 'WORLD', 'WRITE', 'YEARS', 'YES', 'YET', 'YOUNG',
      // Question words
      'WHICH', 'WHOSE', 'WHOM', 'WHATEVER', 'WHENEVER', 'WHEREVER', 'WHETHER',
      // Pronouns
      'MYSELF', 'YOURSELF', 'HIMSELF', 'HERSELF', 'ITSELF', 'THEMSELVES', 'SOMEONE', 'ANYONE', 'EVERYONE', 'NOBODY',
      // Investment/trading terms
      'CHEAP', 'EURO', 'EUROS', 'DOLLAR', 'DOLLARS', 'POUND', 'POUNDS', 'YEN', 'YUAN',
      'STOCK', 'STOCKS', 'TRADE', 'TRADES', 'TRADING', 'TRADER', 'TRADERS',
      'SAFE', 'SAFER', 'SAFEST', 'RISK', 'RISKS', 'RISKY', 'RISKIER',
      'GROW', 'GROWS', 'GROWTH', 'GROWING', 'GROWN',
      'INVEST', 'INVESTS', 'INVESTED', 'INVESTING', 'INVESTOR', 'INVESTORS', 'INVESTMENT', 'INVESTMENTS',
      // Geography
      'ASIA', 'ASIAN', 'EUROPE', 'EUROPEAN', 'AMERICA', 'AMERICAN', 'AFRICA', 'AFRICAN',
      'CHINA', 'CHINESE', 'JAPAN', 'JAPANESE', 'KOREA', 'KOREAN', 'INDIA', 'INDIAN',
      'BRAZIL', 'BRAZILIAN', 'MEXICO', 'MEXICAN', 'CANADA', 'CANADIAN',
      'UK', 'USA', 'EU', 'GERMAN', 'GERMANY', 'FRENCH', 'FRANCE', 'ITALY', 'ITALIAN', 'SPAIN', 'SPANISH',
      'DUTCH', 'SWISS', 'AUSTRALIAN', 'RUSSIA', 'RUSSIAN',
      // Finance terms
      'PORTFOLIO', 'PORTFOLIOS', 'MONEY', 'CASH', 'BUDGET', 'BUDGETS',
      'PROFIT', 'PROFITS', 'PROFITABLE', 'GAIN', 'GAINS', 'LOSS', 'LOSSES', 'LOSING',
      'PRICE', 'PRICES', 'PRICED', 'PRICING', 'COST', 'COSTS', 'COSTING',
      'BULL', 'BULLS', 'BULLISH', 'BEAR', 'BEARS', 'BEARISH',
      'MARKET', 'MARKETS', 'TREND', 'TRENDS', 'TRENDING',
      'CHART', 'CHARTS', 'CHARTING', 'VOLUME', 'VOLUMES',
      'SHARE', 'SHARES', 'SHARING', 'SHAREHOLDER',
      'DIVIDEND', 'DIVIDENDS', 'YIELD', 'YIELDS', 'YIELDING',
      'INCOME', 'INCOMES', 'RETURN', 'RETURNS', 'RETURNING',
      'VALUE', 'VALUES', 'VALUED', 'VALUATION',
      'FEE', 'FEES', 'TAX', 'TAXES', 'TAXED',
      'LONG', 'SHORT', 'HOLD', 'HOLDING', 'HOLDINGS', 'HELD',
      'CALL', 'CALLS', 'PUT', 'PUTS', 'OPTION', 'OPTIONS',
      'BOND', 'BONDS', 'FUND', 'FUNDS', 'FUNDING',
      'ASSET', 'ASSETS', 'EQUITY', 'EQUITIES', 'DEBT', 'DEBTS',
      'MARGIN', 'MARGINS', 'LEVERAGE', 'LEVERAGED',
      'FOREX', 'CURRENCY', 'CURRENCIES', 'EXCHANGE', 'EXCHANGES',
      // Tech/sectors
      'GREEN', 'GREENER', 'GREENEST', 'CLEAN', 'CLEANER', 'CLEANEST',
      'ENERGY', 'ENERGIES', 'SOLAR', 'WIND', 'HYDRO', 'NUCLEAR',
      'CRYPTO', 'CRYPTOS', 'COIN', 'COINS', 'TOKEN', 'TOKENS', 'BLOCKCHAIN',
      'TECH', 'TECHNOLOGY', 'TECHNOLOGIES', 'TECHNICAL',
      'SOFTWARE', 'HARDWARE', 'CHIP', 'CHIPS', 'SEMICONDUCTOR', 'SEMICONDUCTORS',
      'SECTOR', 'SECTORS', 'INDUSTRY', 'INDUSTRIES', 'INDUSTRIAL',
      'HEALTH', 'HEALTHCARE', 'PHARMA', 'PHARMACEUTICAL', 'BIOTECH',
      'BANK', 'BANKS', 'BANKING', 'FINANCE', 'FINANCIAL', 'FINTECH',
      'REAL', 'ESTATE', 'PROPERTY', 'PROPERTIES', 'REIT', 'REITS',
      'RETAIL', 'CONSUMER', 'CONSUMERS', 'LUXURY',
      'AUTO', 'AUTOMOTIVE', 'CAR', 'CARS', 'VEHICLE', 'VEHICLES', 'EV', 'EVS',
      'OIL', 'GAS', 'PETROLEUM', 'NATURAL',
      'GOLD', 'SILVER', 'COPPER', 'METAL', 'METALS', 'MINING',
      'FOOD', 'FOODS', 'AGRICULTURE', 'FARMING',
      // Actions/verbs
      'START', 'STARTS', 'STARTED', 'STARTING', 'STOP', 'STOPS', 'STOPPED',
      'BEGIN', 'BEGINS', 'BEGAN', 'BEGINNING', 'END', 'ENDS', 'ENDED', 'ENDING',
      'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'LAST',
      'LEARN', 'LEARNS', 'LEARNED', 'LEARNING', 'TEACH', 'TEACHES', 'TEACHING',
      'GUIDE', 'GUIDES', 'GUIDED', 'GUIDING', 'TIPS', 'TIP', 'ADVICE', 'ADVISE',
      'CREATE', 'CREATES', 'CREATED', 'CREATING', 'BUILD', 'BUILDS', 'BUILT', 'BUILDING',
      'SUGGEST', 'SUGGESTS', 'SUGGESTED', 'SUGGESTION', 'SUGGESTIONS',
      'RECOMMEND', 'RECOMMENDS', 'RECOMMENDED', 'RECOMMENDATION',
      'LIST', 'LISTS', 'LISTED', 'LISTING', 'DISPLAY', 'DISPLAYS', 'DISPLAYED',
      'ADD', 'ADDS', 'ADDED', 'ADDING', 'REMOVE', 'REMOVES', 'REMOVED', 'REMOVING',
      'WATCH', 'WATCHES', 'WATCHED', 'WATCHING', 'TRACK', 'TRACKS', 'TRACKED', 'TRACKING',
      'ANALYZE', 'ANALYZES', 'ANALYZED', 'ANALYSIS', 'COMPARE', 'COMPARES', 'COMPARED', 'COMPARISON',
      // Adjectives
      'GOOD', 'BETTER', 'BEST', 'BAD', 'WORSE', 'WORST',
      'BIG', 'BIGGER', 'BIGGEST', 'SMALL', 'SMALLER', 'SMALLEST',
      'HIGH', 'HIGHER', 'HIGHEST', 'LOW', 'LOWER', 'LOWEST',
      'FAST', 'FASTER', 'FASTEST', 'SLOW', 'SLOWER', 'SLOWEST',
      'EASY', 'EASIER', 'EASIEST', 'HARD', 'HARDER', 'HARDEST',
      'QUICK', 'QUICKER', 'QUICKEST', 'SIMPLE', 'SIMPLER', 'SIMPLEST',
      'NEW', 'NEWER', 'NEWEST', 'OLD', 'OLDER', 'OLDEST',
      'TOP', 'BOTTOM', 'MIDDLE', 'LEFT', 'RIGHT', 'CENTER',
      'FREE', 'PAID', 'PREMIUM', 'BASIC', 'ADVANCED', 'EXPERT',
      'POPULAR', 'COMMON', 'RARE', 'UNIQUE', 'SPECIAL',
      'STABLE', 'VOLATILE', 'STEADY', 'AGGRESSIVE', 'CONSERVATIVE', 'PASSIVE', 'ACTIVE',
      'MONTHLY', 'WEEKLY', 'DAILY', 'YEARLY', 'ANNUAL', 'QUARTERLY',
      // Misc
      'PLEASE', 'THANK', 'THANKS', 'SORRY', 'HELLO', 'HI', 'HEY', 'BYE', 'OKAY', 'OK', 'YES', 'NO', 'MAYBE',
      'WANT', 'WANTS', 'WANTED', 'WANTING', 'NEED', 'NEEDS', 'NEEDED', 'NEEDING',
      'LIKE', 'LIKES', 'LIKED', 'LIKING', 'LOVE', 'LOVES', 'LOVED', 'LOVING',
      'THINK', 'THINKS', 'THOUGHT', 'THINKING', 'BELIEVE', 'BELIEVES', 'BELIEVED',
      'HOPE', 'HOPES', 'HOPED', 'HOPING', 'WISH', 'WISHES', 'WISHED', 'WISHING',
      'LOOKING', 'TRYING', 'GETTING', 'GOING', 'COMING', 'TAKING', 'MAKING', 'DOING',
      'TODAY', 'TOMORROW', 'YESTERDAY', 'WEEK', 'MONTH', 'YEAR', 'DAY', 'NIGHT',
      'NOW', 'LATER', 'SOON', 'NEVER', 'ALWAYS', 'SOMETIMES', 'OFTEN', 'RARELY',
      'ABOUT', 'AROUND', 'BETWEEN', 'THROUGH', 'DURING', 'BEFORE', 'AFTER', 'SINCE', 'UNTIL',
      'REALLY', 'ACTUALLY', 'PROBABLY', 'POSSIBLY', 'DEFINITELY', 'CERTAINLY', 'PERHAPS',
    ]);
    const potentialSymbols = symbolMatches.filter(s => !commonWords.has(s));

    try {
      // Single stock deep analysis
      if (potentialSymbols.length === 1) {
        return await this.deepStockAnalysis(potentialSymbols[0]);
      }

      // Compare stocks
      if (potentialSymbols.length >= 2 || msg.includes('compare') || msg.includes('vs')) {
        return await this.compareStocks(potentialSymbols.slice(0, 4));
      }

      // Market overview with real analysis
      if (msg.includes('market') || msg.includes('overview') || msg.includes('today') || msg.includes('how')) {
        return await this.smartMarketOverview();
      }
      
      // Find opportunities
      if (msg.includes('buy') || msg.includes('recommend') || msg.includes('opportunity') || msg.includes('pick')) {
        return await this.findOpportunities();
      }
      
      // Risk analysis
      if (msg.includes('risk') || msg.includes('volatil') || msg.includes('safe') || msg.includes('danger')) {
        return await this.smartRiskAnalysis();
      }
      
      // Crypto analysis
      if (msg.includes('crypto') || msg.includes('bitcoin') || msg.includes('btc') || msg.includes('eth')) {
        return await this.smartCryptoAnalysis();
      }
      
      // Tech sector
      if (msg.includes('tech') || msg.includes('semiconductor') || msg.includes('chip')) {
        return await this.smartSectorAnalysis(['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'AMD'], 'Technology');
      }

      // Default: Use dynamic AI analysis based on actual market data
      const dynamicResponse = await this.dynamicAnalysis(userMessage);
      if (dynamicResponse) {
        return dynamicResponse;
      }
      
      return await this.smartMarketOverview();
      
    } catch (error) {
      console.error('Analysis error:', error);
      return this.getFallbackResponse(msg);
    }
  }

  // Context memory for follow-up questions
  private lastAmount: number = 0;
  private lastTarget: number = 0;

  // Smart investment advice with better understanding
  private getInvestmentAdvice(msg: string): string {
    // Extract all numbers from the message
    const numbers = msg.match(/\d+\.?\d*/g)?.map(n => parseFloat(n)) || [];
    
    // Parse amount and target intelligently
    let amount = this.lastAmount || 0;
    let target = this.lastTarget || 0;
    
    // Patterns for understanding the question
    const patterns = {
      // "I have X dollars/euros"
      hasAmount: msg.match(/(?:i have|got|with|start|starting)\s*[$€]?\s*(\d+\.?\d*)/i),
      // "turn/make into X" or "make X" or "get X"
      targetAmount: msg.match(/(?:into|make|become|get|reach|to)\s*[$€]?\s*(\d+\.?\d*)/i),
      // "X to Y" pattern
      rangePattern: msg.match(/(\d+\.?\d*)\s*(?:to|into|→|->)\s*(\d+\.?\d*)/i),
      // "double/triple/10x"
      multiplierWords: msg.match(/(double|triple|quadruple|10x|100x|2x|3x|5x|20x|50x)/i),
      // Quick money questions
      quickMoney: /(quick|fast|easy|rapid|overnight|week|month)\s*(money|cash|profit|rich|gains)/i.test(msg),
      // Gambling/betting
      gambling: /(gamble|bet|casino|lottery|luck)/i.test(msg),
      // Beginner
      beginner: /(beginner|new|start|first time|never traded|learning)/i.test(msg),
      // Specific strategies
      crypto: /(crypto|bitcoin|btc|eth|altcoin|coin)/i.test(msg),
      options: /(option|call|put|strike|expir)/i.test(msg),
      forex: /(forex|fx|currency|eur\/usd)/i.test(msg),
      dayTrade: /(day\s*trad|scalp|intraday)/i.test(msg),
    };

    // Extract amount
    if (patterns.rangePattern) {
      amount = parseFloat(patterns.rangePattern[1]);
      target = parseFloat(patterns.rangePattern[2]);
    } else if (patterns.hasAmount) {
      amount = parseFloat(patterns.hasAmount[1]);
    } else if (numbers.length > 0) {
      // Use smallest number as amount if no clear pattern
      const sorted = [...numbers].sort((a, b) => a - b);
      if (!amount) amount = sorted[0];
    }

    // Extract target
    if (!target && patterns.targetAmount) {
      target = parseFloat(patterns.targetAmount[1]);
    } else if (!target && numbers.length >= 2) {
      const sorted = [...numbers].sort((a, b) => a - b);
      target = sorted[sorted.length - 1];
    }

    // Handle multiplier words
    if (patterns.multiplierWords && amount > 0) {
      const mult = patterns.multiplierWords[1].toLowerCase();
      const multipliers: Record<string, number> = {
        'double': 2, '2x': 2, 'triple': 3, '3x': 3, 'quadruple': 4,
        '5x': 5, '10x': 10, '20x': 20, '50x': 50, '100x': 100
      };
      target = amount * (multipliers[mult] || 10);
    }

    // Use context if no new numbers
    if (amount === 0 && this.lastAmount > 0) amount = this.lastAmount;
    if (target === 0 && numbers.length === 1) target = numbers[0];
    if (target <= amount) target = amount * 10;
    if (amount === 0) amount = 10; // Default

    // Save context for follow-ups
    this.lastAmount = amount;
    this.lastTarget = target;

    const multiplier = target / amount;
    const currency = msg.includes('dollar') || msg.includes('$') ? '$' : '€';

    // Generate intelligent response
    let response = `💰 **Investment Analysis**\n\n`;
    response += `**Your Goal:** ${currency}${amount} → ${currency}${target} (${multiplier.toFixed(1)}x return)\n\n`;

    // Quick money warning
    if (patterns.quickMoney) {
      response += `⚠️ **Reality Check:** "Quick money" usually means quick losses. Markets reward patience, not speed.\n\n`;
    }

    // Gambling warning
    if (patterns.gambling) {
      response += `🎰 **Warning:** Investing isn't gambling. If you're looking to gamble, the casino has better odds than uninformed trading.\n\n`;
    }

    // Based on multiplier and amount, give specific advice
    if (amount < 50) {
      response += `📚 **With ${currency}${amount}, here's my honest take:**\n\n`;
      response += `This amount is too small for meaningful traditional investing (fees would eat your gains). Instead:\n\n`;
      response += `1. **Learn first** - Use paper trading apps (free)\n`;
      response += `2. **Save more** - Aim for ${currency}500+ before real investing\n`;
      response += `3. **If you must try:**\n`;
      response += `   • Crypto on Binance/Coinbase (can buy tiny amounts)\n`;
      response += `   • Fractional shares on Robinhood/eToro\n\n`;
    } else if (multiplier >= 25) {
      response += `🚨 **${multiplier.toFixed(0)}x is extremely unrealistic:**\n\n`;
      response += `• 99% of people attempting this **lose everything**\n`;
      response += `• Even the best traders average 20-30% yearly\n`;
      response += `• This would require perfect timing + massive risk\n\n`;
      response += `**Only possible (not probable) through:**\n`;
      response += `• Lottery-tier crypto bets (99% fail)\n`;
      response += `• Options trading (90% of retail loses)\n`;
      response += `• Pure luck (not a strategy)\n\n`;
    } else if (multiplier >= 10) {
      response += `⚠️ **${multiplier.toFixed(0)}x is very aggressive:**\n\n`;
      response += `**High-risk paths:**\n`;
      response += `• Volatile small-cap stocks\n`;
      response += `• Leveraged ETFs (TQQQ, SOXL)\n`;
      response += `• Crypto during bull markets\n`;
      response += `• Options (if you really know what you're doing)\n\n`;
      response += `**Realistic timeframe:** 2-5 years with significant risk\n\n`;
    } else if (multiplier >= 2) {
      response += `✅ **${multiplier.toFixed(0)}x is achievable but takes time:**\n\n`;
      response += `**Realistic approaches:**\n`;
      response += `• S&P 500 (SPY): ~7-10 years to double\n`;
      response += `• Growth stocks (NVDA, AMZN): 2-5 years possible\n`;
      response += `• Mix of crypto + stocks: 1-3 years possible\n\n`;
    }

    // Specific strategy advice
    if (patterns.crypto) {
      response += `**🪙 Crypto-specific advice:**\n`;
      response += `• Only invest what you can lose 100%\n`;
      response += `• Stick to BTC/ETH for lower risk\n`;
      response += `• Altcoins can 10x but usually go to 0\n\n`;
    }

    if (patterns.dayTrade) {
      response += `**📊 Day trading reality:**\n`;
      response += `• 90% of day traders lose money\n`;
      response += `• You need ${currency}25,000+ for US pattern day trading\n`;
      response += `• It's a full-time job, not easy money\n\n`;
    }

    if (patterns.beginner) {
      response += `**🎓 Beginner's path:**\n`;
      response += `1. Learn basics (Investopedia, YouTube)\n`;
      response += `2. Paper trade for 3-6 months\n`;
      response += `3. Start small with index funds (SPY, QQQ)\n`;
      response += `4. Only risk money you can lose\n\n`;
    }

    response += `💡 **Bottom line:** ${multiplier >= 10 
      ? `A ${multiplier.toFixed(0)}x return requires extraordinary luck or skill. Most people lose trying.`
      : `Focus on consistent growth over time. Compound interest is the real wealth builder.`}`;

    return response;
  }

  // Fallback when API fails
  private getFallbackResponse(msg: string): string {
    return `🔄 **Connection Issue**

I'm having trouble fetching live market data right now. This could be due to:
• Market hours (some data limited outside trading hours)
• API rate limits
• Network issues

**What you can try:**
• Ask about specific stocks: "Analyze AAPL"
• Ask general questions: "How does momentum trading work?"
• Wait a moment and try again

**Trading Tip:** ${this.getRandomTip()}`;
  }

  private getRandomTip(): string {
    const tips = [
      "Never invest more than you can afford to lose.",
      "Diversification reduces risk but also limits gains.",
      "The best time to buy is when others are fearful.",
      "Set stop-losses before entering any trade.",
      "Past performance doesn't guarantee future results.",
      "Compound interest is the 8th wonder of the world.",
      "Buy the rumor, sell the news.",
      "Time in the market beats timing the market."
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  // Help response for vague/unclear messages
  private getHelpResponse(): string {
    return `👋 How can I help you today?\n\n**Try asking:**\n• "How's the market?" - Get market overview\n• "Analyze AAPL" - Deep stock analysis\n• "Add NVDA to watchlist" - Track a stock\n• "Make a tech portfolio" - Get stock suggestions\n• "What is an ETF?" - Learn concepts\n• "I have $100, where to invest?" - Get advice\n\n💡 **Tip:** ${this.getRandomTip()}`;
  }

  // DYNAMIC AI: Analyze user intent and generate response from real data
  async dynamicAnalysis(userMessage: string): Promise<string> {
    const msg = userMessage.toLowerCase();
    
    // Fetch fresh market data for analysis
    await this.updateMarketData();
    
    // Get key market indicators
    const sp500 = this.marketData.get('S&P 500');
    const nasdaq = this.marketData.get('NASDAQ COMPOSITE');
    const vix = this.marketData.get('VIX');
    const btc = this.marketData.get('BTC-USD');
    
    // Calculate market state
    const allData = Array.from(this.marketData.values());
    const gainers = allData.filter(d => d.isPositive);
    const losers = allData.filter(d => !d.isPositive);
    const marketBias = gainers.length / (allData.length || 1);
    const vixLevel = vix ? this.parseNum(vix.price) : 15;
    
    // Market state assessment
    const marketState = this.assessMarketState(marketBias, vixLevel);
    
    // Extract any numbers (potential amounts)
    const numbers = msg.match(/\d+/g)?.map(n => parseInt(n)).filter(n => n > 0 && n < 100000) || [];
    const amount = numbers.length > 0 ? numbers[0] : 0;
    
    // Detect what user is ACTUALLY asking
    const hasMoney = /euro|dollar|€|\$|\bhave\b.*\d+|\d+.*\bhave\b/i.test(msg);
    const asksWhatToDo = /what.*do|what.*should|should.*i|where.*put|how.*invest|can.*i/i.test(msg);
    const wantsAnalysis = /(analyze|analysis|look at|check|tell.*about|how.*doing|how.*is|market)/i.test(msg);
    const asksWhy = /why|reason|cause|explain/i.test(msg);
    
    // Build dynamic response based on ACTUAL intent
    let response = '';
    
    // "I have X euros, what should I do" - give advice based on CURRENT market
    if (amount > 0 && (asksWhatToDo || hasMoney)) {
      response = this.generateInvestmentAdvice(amount, marketState, gainers, losers);
    } 
    // Market analysis request
    else if (wantsAnalysis) {
      response = this.generateMarketAnalysis(marketState, sp500, nasdaq, vix, btc, gainers, losers);
    }
    // Why questions
    else if (asksWhy) {
      response = this.explainMarketMovement(marketState, gainers, losers);
    }
    // Default - show current market state
    else if (msg.length > 10) {
      response = this.generateMarketAnalysis(marketState, sp500, nasdaq, vix, btc, gainers, losers);
    }
    
    return response;
  }

  private assessMarketState(bias: number, vix: number): { mood: string; risk: string; action: string } {
    let mood = 'neutral';
    let risk = 'moderate';
    let action = 'hold';
    
    if (bias > 0.7 && vix < 18) {
      mood = 'bullish'; risk = 'low'; action = 'cautiously buy';
    } else if (bias > 0.6 && vix < 22) {
      mood = 'slightly bullish'; risk = 'moderate'; action = 'selective buying';
    } else if (bias < 0.3 || vix > 30) {
      mood = 'bearish'; risk = 'high'; action = 'defensive';
    } else if (bias < 0.4 || vix > 25) {
      mood = 'slightly bearish'; risk = 'elevated'; action = 'caution';
    } else {
      mood = 'mixed'; risk = 'moderate'; action = 'wait for clarity';
    }
    
    return { mood, risk, action };
  }

  private generateInvestmentAdvice(amount: number, state: { mood: string; risk: string; action: string }, gainers: MarketData[], losers: MarketData[]): string {
    const topGainers = gainers.sort((a, b) => this.parseNum(b.changePercent) - this.parseNum(a.changePercent)).slice(0, 3);
    const vix = this.marketData.get('VIX');
    const vixVal = vix ? this.parseNum(vix.price) : 15;
    
    let response = `💰 **What To Do With €${amount}**\n\n`;
    
    // Current market conditions - ACTUAL DATA
    response += `**Right Now (Live Data):**\n`;
    response += `• Market mood: ${state.mood.toUpperCase()}\n`;
    response += `• Fear index (VIX): ${vixVal.toFixed(1)} - ${vixVal < 18 ? 'calm' : vixVal < 25 ? 'cautious' : 'fearful'}\n`;
    response += `• Winners today: ${gainers.length} | Losers: ${losers.length}\n`;
    if (topGainers.length > 0) {
      response += `• Hot today: ${topGainers.slice(0, 3).map(g => `${g.symbol} (${g.changePercent})`).join(', ')}\n`;
    }
    response += `\n`;
    
    // Actual recommendation based on CONDITIONS
    response += `**My Take Based On Current Conditions:**\n`;
    
    if (state.mood.includes('bearish') || vixVal > 25) {
      response += `� Market is weak right now. I'd wait for better entry or buy defensive assets.\n`;
      response += `• Safe options: BND (bonds), GLD (gold)\n`;
      response += `• Or just hold cash and watch\n\n`;
    } else if (state.mood.includes('bullish') && vixVal < 20) {
      response += `� Conditions look decent for buying.\n`;
      response += `• With €${amount}: Consider VOO or QQQ (broad market)\n`;
      response += `• Fractional shares let you buy any amount\n\n`;
    } else {
      response += `🟡 Mixed signals. No strong conviction either way.\n`;
      response += `• Maybe put half in (€${Math.round(amount/2)}) and wait with the rest\n`;
      response += `• Dollar-cost averaging reduces timing risk\n\n`;
    }
    
    // Practical advice for the amount
    if (amount < 100) {
      response += `**With €${amount} specifically:**\n`;
      response += `• Best for learning (small losses = cheap lessons)\n`;
      response += `• Use fee-free brokers (eToro, Trading 212)\n`;
      response += `• Consider crypto apps for small amounts (Coinbase, Binance)\n`;
    } else if (amount < 500) {
      response += `**With €${amount} specifically:**\n`;
      response += `• Enough for 2-3 positions\n`;
      response += `• Suggested split: 60% ETF, 40% one stock you researched\n`;
    } else {
      response += `**With €${amount} specifically:**\n`;
      response += `• Good starting amount for a real portfolio\n`;
      response += `• Diversify: 50% index ETFs, 30% growth, 20% cash\n`;
    }
    
    return response;
  }

  private generateMarketAnalysis(state: { mood: string; risk: string; action: string }, sp500: MarketData | undefined, nasdaq: MarketData | undefined, vix: MarketData | undefined, btc: MarketData | undefined, gainers: MarketData[], losers: MarketData[]): string {
    let response = `📊 **Live Market Analysis**\n\n`;
    
    // Actual index data
    response += `**Indices:**\n`;
    if (sp500) response += `• S&P 500: $${sp500.price} (${sp500.changePercent}) ${sp500.isPositive ? '📈' : '📉'}\n`;
    if (nasdaq) response += `• NASDAQ: $${nasdaq.price} (${nasdaq.changePercent}) ${nasdaq.isPositive ? '📈' : '📉'}\n`;
    response += `\n`;
    
    // Risk assessment
    const vixVal = vix ? this.parseNum(vix.price) : 15;
    response += `**Risk Gauge:**\n`;
    response += `• VIX: ${vixVal.toFixed(1)} `;
    if (vixVal < 15) response += `(Very Low Fear - markets complacent)\n`;
    else if (vixVal < 20) response += `(Low Fear - normal conditions)\n`;
    else if (vixVal < 25) response += `(Moderate Fear - caution advised)\n`;
    else if (vixVal < 30) response += `(High Fear - elevated volatility)\n`;
    else response += `(Extreme Fear - crisis mode)\n`;
    response += `\n`;
    
    // Market breadth
    const breadth = (gainers.length / (gainers.length + losers.length) * 100).toFixed(0);
    response += `**Market Breadth:**\n`;
    response += `• ${gainers.length} advancing, ${losers.length} declining\n`;
    response += `• ${breadth}% of tracked assets are up\n`;
    response += `• Overall: ${state.mood.toUpperCase()}\n\n`;
    
    // Top movers (actual data)
    if (gainers.length > 0) {
      const topGainer = gainers.sort((a, b) => this.parseNum(b.changePercent) - this.parseNum(a.changePercent))[0];
      response += `**Top Gainer:** ${topGainer.symbol} ${topGainer.changePercent}\n`;
    }
    if (losers.length > 0) {
      const topLoser = losers.sort((a, b) => this.parseNum(a.changePercent) - this.parseNum(b.changePercent))[0];
      response += `**Top Loser:** ${topLoser.symbol} ${topLoser.changePercent}\n`;
    }
    response += `\n`;
    
    // Crypto if available
    if (btc) {
      response += `**Crypto:** BTC $${btc.price} (${btc.changePercent})\n\n`;
    }
    
    // Action recommendation based on actual data
    response += `**My Read:** `;
    if (state.mood.includes('bullish') && vixVal < 20) {
      response += `Conditions favor risk-on. Consider growth positions.`;
    } else if (state.mood.includes('bearish') || vixVal > 25) {
      response += `Defensive stance recommended. Reduce exposure or hedge.`;
    } else {
      response += `Mixed signals. Be selective, focus on quality.`;
    }
    
    return response;
  }

  private explainMarketMovement(state: { mood: string; risk: string; action: string }, gainers: MarketData[], losers: MarketData[]): string {
    let response = `🔍 **Why Is The Market Moving?**\n\n`;
    
    response += `**Current State:** ${state.mood.toUpperCase()}\n\n`;
    
    response += `**What I'm Seeing:**\n`;
    response += `• ${gainers.length} assets up, ${losers.length} down\n`;
    
    // Sector analysis
    const techSymbols = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'AMD'];
    const techData = techSymbols.map(s => this.marketData.get(s)).filter(Boolean) as MarketData[];
    const techUp = techData.filter(d => d.isPositive).length;
    
    if (techUp >= 4) {
      response += `• Tech sector showing strength (${techUp}/${techData.length} up)\n`;
    } else if (techUp <= 2 && techData.length > 0) {
      response += `• Tech sector weak (${techUp}/${techData.length} up)\n`;
    }
    
    response += `\n**Possible Drivers:**\n`;
    if (state.mood.includes('bullish')) {
      response += `• Positive sentiment/momentum\n`;
      response += `• Possibly: good economic data, earnings, Fed news\n`;
    } else if (state.mood.includes('bearish')) {
      response += `• Risk-off sentiment\n`;
      response += `• Possibly: economic concerns, geopolitics, profit-taking\n`;
    } else {
      response += `• No clear catalyst\n`;
      response += `• Market digesting recent moves\n`;
    }
    
    response += `\n*Note: For specific news, check financial news sites.*`;
    
    return response;
  }

  // Handle knowledge-based questions
  private handleKnowledgeQuestion(msg: string): string | null {
    
    // What is X questions
    if (msg.includes('what is') || msg.includes('what are') || msg.includes("what's") || msg.includes('explain') || msg.includes('define')) {
      if (/stock|share/i.test(msg)) {
        return `📚 **What is a Stock?**\n\nA stock (or share) is a piece of ownership in a company. When you buy stock, you become a partial owner.\n\n**Key points:**\n• Stock price goes up = you profit\n• Some stocks pay dividends (cash payments)\n• Stocks are traded on exchanges (NYSE, NASDAQ)\n• You can buy fractional shares on most platforms\n\n**Example:** If you buy 1 AAPL share at $180, you own a tiny piece of Apple Inc.`;
      }
      if (/etf/i.test(msg)) {
        return `📚 **What is an ETF?**\n\nETF = Exchange-Traded Fund. It's a basket of stocks you can buy as one.\n\n**Popular ETFs:**\n• **SPY** - Tracks S&P 500 (top 500 US companies)\n• **QQQ** - Tracks NASDAQ 100 (tech-heavy)\n• **VTI** - Total US stock market\n\n**Why ETFs are great for beginners:**\n• Instant diversification\n• Lower risk than single stocks\n• Low fees\n• Easy to buy/sell`;
      }
      if (/dividend/i.test(msg)) {
        return `📚 **What are Dividends?**\n\nDividends are cash payments companies give to shareholders.\n\n**How it works:**\n• Company earns profit → shares some with you\n• Usually paid quarterly\n• Dividend yield = annual dividend ÷ stock price\n\n**High dividend stocks:** KO (Coca-Cola), JNJ, PG\n**Dividend yield example:** 4% yield on $1000 = $40/year`;
      }
      if (/option|call|put/i.test(msg)) {
        return `📚 **What are Options?**\n\nOptions are contracts that give you the right to buy/sell a stock at a specific price.\n\n**Two types:**\n• **Call** - Bet stock goes UP\n• **Put** - Bet stock goes DOWN\n\n**Warning:** ⚠️ Options are complex and risky\n• Can lose 100% of investment\n• 90% of retail traders lose money\n• Not for beginners\n\nLearn paper trading first before trying options.`;
      }
      if (/crypto|bitcoin|blockchain/i.test(msg)) {
        return `📚 **What is Cryptocurrency?**\n\nCrypto is digital money that uses blockchain technology.\n\n**Top cryptos:**\n• **Bitcoin (BTC)** - Digital gold, most established\n• **Ethereum (ETH)** - Smart contracts platform\n\n**Key facts:**\n• Extremely volatile (can move 10%+ daily)\n• Not backed by any government\n• Can buy fractions (0.001 BTC)\n• Trade 24/7 unlike stocks\n\n⚠️ Only invest what you can afford to lose 100%`;
      }
      if (/bear|bull/i.test(msg)) {
        return `📚 **Bull vs Bear Market**\n\n🐂 **Bull Market:** Prices rising, optimism high\n• Good time to buy growth stocks\n• Everyone making money\n\n🐻 **Bear Market:** Prices falling 20%+, fear high\n• Stocks "on sale"\n• Good for long-term buying\n• Can last months or years\n\n**Remember:** Bull markets climb stairs, bear markets fall out windows.`;
      }
      if (/short|shorting/i.test(msg)) {
        return `📚 **What is Short Selling?**\n\nShorting = betting a stock will go DOWN.\n\n**How it works:**\n1. Borrow shares from broker\n2. Sell them immediately\n3. Buy back later (hopefully cheaper)\n4. Return shares, keep difference\n\n**Risks:** ⚠️\n• Unlimited loss potential (stock can go up forever)\n• Must pay interest while borrowing\n• Can get "squeezed" (GME situation)\n\nNot recommended for beginners.`;
      }
      if (/leverage|margin/i.test(msg)) {
        return `📚 **What is Leverage/Margin?**\n\nLeverage = using borrowed money to invest.\n\n**Example:** With 2x leverage:\n• You put $100, broker lends $100\n• You control $200 worth of stock\n• Gains AND losses are doubled\n\n**Risks:** ⚠️\n• **Margin call** - Broker forces you to sell\n• Can lose more than you invested\n• Interest charges\n\nLeveraged ETFs: TQQQ (3x Nasdaq), SOXL (3x semiconductors)`;
      }
      if (/pe ratio|p\/e/i.test(msg)) {
        return `📚 **What is P/E Ratio?**\n\nP/E = Price ÷ Earnings per Share\n\nTells you how "expensive" a stock is relative to profits.\n\n**Interpretation:**\n• **Low P/E (<15):** Possibly undervalued or slow growth\n• **High P/E (>30):** Expensive or high growth expected\n• **Negative P/E:** Company is losing money\n\n**Example:** AAPL at P/E 28 means you pay $28 for every $1 of earnings.`;
      }
    }

    // How to questions
    if (msg.includes('how to') || msg.includes('how do') || msg.includes('how can')) {
      if (/start|begin|first/i.test(msg)) {
        return `🎓 **How to Start Investing**\n\n**Step 1: Learn basics (1-2 weeks)**\n• YouTube: "stock market for beginners"\n• Investopedia.com for definitions\n\n**Step 2: Choose a broker**\n• US: Robinhood, Fidelity, Charles Schwab\n• EU: eToro, DEGIRO, Trading 212\n• Crypto: Coinbase, Binance\n\n**Step 3: Paper trade first**\n• Practice with fake money\n• Most brokers have simulators\n\n**Step 4: Start small**\n• Begin with $50-100\n• Buy ETFs (SPY, QQQ) first\n• Don't risk what you can't lose`;
      }
      if (/read chart|technical analysis|chart/i.test(msg)) {
        return `📊 **How to Read Charts**\n\n**Basic elements:**\n• **Candlesticks:** Green=up, Red=down\n• **Volume:** Bars at bottom showing trading activity\n• **Moving averages:** Lines showing trend\n\n**Key patterns:**\n• **Support:** Price level that holds\n• **Resistance:** Price level that blocks\n• **Trend:** Higher highs = uptrend\n\n**Indicators for beginners:**\n• RSI (overbought/oversold)\n• MACD (momentum)\n• 50/200 day moving averages\n\n📚 Learn more: TradingView has free charts`;
      }
      if (/pick stock|choose stock|find stock/i.test(msg)) {
        return `🎯 **How to Pick Stocks**\n\n**Fundamental analysis:**\n• Is the company profitable?\n• Is revenue growing?\n• Is debt manageable?\n• Do you understand the business?\n\n**Technical analysis:**\n• Is it in an uptrend?\n• Is volume increasing?\n• Near support (good entry)?\n\n**Simple strategy for beginners:**\n1. Start with companies you know (AAPL, AMZN)\n2. Check they're profitable\n3. Buy on dips, not all-time highs\n4. Diversify across 5-10 stocks`;
      }
      if (/stop.?loss|protect|risk manage/i.test(msg)) {
        return `🛡️ **How to Manage Risk**\n\n**Rule 1: Position sizing**\n• Never put >5% in one stock\n• Never risk >2% on one trade\n\n**Rule 2: Stop-losses**\n• Set automatic sell orders\n• Typically 5-10% below entry\n• Protects from big losses\n\n**Rule 3: Diversify**\n• Different sectors\n• Different asset types\n• Different geographies\n\n**Rule 4: Cash is a position**\n• Keep 10-20% in cash\n• Dry powder for opportunities`;
      }
    }

    // When questions
    if (msg.includes('when') || msg.includes('best time')) {
      if (/buy|enter/i.test(msg)) {
        return `⏰ **When to Buy**\n\n**Good times to buy:**\n• Market pullbacks/corrections\n• Stock at support level\n• After earnings beat (sometimes)\n• When VIX is high (fear = opportunity)\n\n**Avoid buying:**\n• At all-time highs (unless breakout)\n• Before major events (earnings, Fed)\n• When everyone is euphoric\n• Stocks you don't understand\n\n**Best approach:** Dollar-cost averaging\n• Buy same amount regularly\n• Removes timing stress`;
      }
      if (/sell|exit|take profit/i.test(msg)) {
        return `⏰ **When to Sell**\n\n**Sell signals:**\n• Hit your profit target (set one!)\n• Fundamentals change\n• Better opportunity elsewhere\n• You need the money\n\n**Don't sell because:**\n• Small daily drops\n• News panic (usually overblown)\n• To "lock in" tiny gains\n\n**Strategy:** Sell in portions\n• Sell 25% at +20%\n• Sell 25% at +50%\n• Let rest run with trailing stop`;
      }
      if (/market open|market close|trading hours/i.test(msg)) {
        return `🕐 **Market Hours**\n\n**US Stock Market (NYSE/NASDAQ):**\n• Open: 9:30 AM - 4:00 PM ET\n• Pre-market: 4:00 AM - 9:30 AM\n• After-hours: 4:00 PM - 8:00 PM\n\n**Best times to trade:**\n• First hour (9:30-10:30) - Most volatile\n• Last hour (3:00-4:00) - Strong moves\n• Avoid: 11:00 AM - 2:00 PM (slow)\n\n**Crypto:** 24/7, never closes\n\n**Note:** Check your time zone!`;
      }
    }

    // Why questions
    if (msg.includes('why')) {
      if (/stock.*(down|drop|fall|crash)/i.test(msg)) {
        return `📉 **Why Stocks Drop**\n\n**Company reasons:**\n• Bad earnings report\n• Lost major customer\n• CEO departure\n• Scandal/fraud\n\n**Market reasons:**\n• Fed raising rates\n• Recession fears\n• Geopolitical events\n• Sector rotation\n\n**Remember:**\n• Drops are normal and healthy\n• Corrections (10%) happen yearly\n• Bear markets (20%+) every few years\n• Long-term trend is always up`;
      }
      if (/lose money|losing/i.test(msg)) {
        return `💸 **Why Traders Lose Money**\n\n**Main reasons:**\n1. **No strategy** - Trading on emotion\n2. **Overleveraging** - Too much risk\n3. **No stop-losses** - Letting losers run\n4. **FOMO** - Buying at the top\n5. **Overtrading** - Too many trades\n\n**Statistics:**\n• 90% of day traders lose money\n• Average retail trader underperforms market\n\n**Solution:** Buy and hold index funds beats most active traders.`;
      }
    }

    // Best/Worst questions  
    if (msg.includes('best') || msg.includes('top') || msg.includes('worst')) {
      if (/broker|platform|app/i.test(msg)) {
        return `📱 **Best Trading Platforms**\n\n**For beginners:**\n• **Robinhood** - Simple, commission-free\n• **Fidelity** - Great research, no minimums\n• **Charles Schwab** - Full service\n\n**For active traders:**\n• **TD Ameritrade** - Best tools\n• **Interactive Brokers** - Lowest fees\n\n**For crypto:**\n• **Coinbase** - Beginner friendly\n• **Binance** - Most coins, lower fees\n\n**For EU:**\n• **eToro** - Social trading\n• **DEGIRO** - Low fees\n• **Trading 212** - Free trades`;
      }
      if (/stock.*buy|stock.*invest/i.test(msg)) {
        return `🎯 **Stocks to Consider**\n\n**Blue chips (safer):**\n• AAPL, MSFT, GOOGL, AMZN\n• JNJ, PG, KO (defensive)\n\n**Growth (higher risk/reward):**\n• NVDA, AMD (AI/chips)\n• TSLA (EV)\n• META (social/VR)\n\n**ETFs (diversified):**\n• SPY (S&P 500)\n• QQQ (Nasdaq 100)\n• VTI (Total market)\n\n⚠️ **Not financial advice** - Always do your own research!`;
      }
    }

    // Should I questions
    if (msg.includes('should i') || msg.includes('is it worth')) {
      if (/day trade/i.test(msg)) {
        return `🤔 **Should You Day Trade?**\n\n**Probably not, because:**\n• 90% lose money\n• Need $25k minimum (US)\n• Very stressful full-time job\n• Taxes eat profits\n\n**Better alternatives:**\n• Swing trading (days to weeks)\n• Position trading (weeks to months)\n• Buy and hold (years)\n\n**If you still want to try:**\n• Paper trade for 6+ months first\n• Only use money you can lose\n• Start with small positions`;
      }
      if (/crypto|bitcoin/i.test(msg)) {
        return `🤔 **Should You Invest in Crypto?**\n\n**Pros:**\n• Huge upside potential\n• 24/7 markets\n• New technology\n\n**Cons:**\n• Extremely volatile\n• No fundamentals to analyze\n• Regulatory uncertainty\n• Many scams\n\n**My take:**\n• Only 1-5% of portfolio max\n• Stick to BTC/ETH\n• Use cold storage for safety\n• Be ready to lose it all`;
      }
    }

    // Difference questions
    if (msg.includes('difference') || msg.includes('vs') || msg.includes('versus')) {
      if (/stock.*etf/i.test(msg)) {
        return `📊 **Stocks vs ETFs**\n\n**Stocks:**\n• Single company ownership\n• Higher risk/reward\n• You pick the winners\n• More research needed\n\n**ETFs:**\n• Basket of many stocks\n• Instant diversification\n• Lower risk\n• Set and forget\n\n**Verdict:** Beginners should start with ETFs, add individual stocks as you learn.`;
      }
      if (/invest.*trad|trading.*invest/i.test(msg)) {
        return `📊 **Investing vs Trading**\n\n**Investing:**\n• Long-term (years)\n• Buy and hold\n• Focus on fundamentals\n• Less stress, less time\n• Most successful approach\n\n**Trading:**\n• Short-term (days/weeks)\n• Buy and sell frequently\n• Focus on technicals\n• Very stressful, time-consuming\n• Most people lose\n\n**My advice:** Start as investor, trade only with money you can lose.`;
      }
    }

    return null; // No match found
  }

  // Handle portfolio building and investment strategy questions
  private handleStrategyQuestion(msg: string): string | null {
    const isPortfolioRequest = /(make|create|build|suggest|recommend|give)\s*(me\s*)?(a\s*)?(portfolio|stocks|investments)/i.test(msg);
    const isStrategyQuestion = /(cheap|budget|low.?cost|affordable|european|europe|asian|asia|tech|growth|dividend|safe|conservative|aggressive|risky|beginner)/i.test(msg);
    
    if (!isPortfolioRequest && !isStrategyQuestion) return null;
    
    // Detect themes
    const themes = {
      european: /(europe|european|eu\b|euro)/i.test(msg),
      asian: /(asia|asian|china|japan|korea)/i.test(msg),
      cheap: /(cheap|budget|low.?cost|affordable|penny|under\s*\$?\d+)/i.test(msg),
      tech: /(tech|technology|ai|semiconductor|software)/i.test(msg),
      dividend: /(dividend|income|yield|passive)/i.test(msg),
      growth: /(growth|aggressive|high.?return)/i.test(msg),
      safe: /(safe|conservative|stable|low.?risk|beginner)/i.test(msg),
      crypto: /(crypto|bitcoin|ethereum)/i.test(msg),
      green: /(green|sustainable|esg|clean|energy)/i.test(msg),
    };
    
    let response = `📋 **Portfolio Suggestions**\n\n`;
    
    if (themes.european) {
      response += `🇪🇺 **European Investment Options:**\n\n`;
      response += `**ETFs (easiest way):**\n`;
      response += `• **VGK** - Vanguard FTSE Europe ETF\n`;
      response += `• **EZU** - iShares MSCI Eurozone ETF\n`;
      response += `• **FEZ** - Euro STOXX 50 ETF\n\n`;
      response += `**Individual European Stocks:**\n`;
      response += `• **ASML** - Dutch semiconductor giant\n`;
      response += `• **SAP** - German software company\n`;
      response += `• **NVO** - Novo Nordisk (Danish pharma)\n`;
      response += `• **LVMHF** - LVMH (French luxury)\n`;
      response += `• **TTE** - TotalEnergies (French oil)\n\n`;
      response += `**EU Trading Platforms:**\n`;
      response += `• eToro, DEGIRO, Trading 212, Interactive Brokers\n\n`;
    }
    
    if (themes.cheap || themes.safe) {
      response += `💰 **Budget-Friendly Options:**\n\n`;
      response += `**Low-cost ETFs (best for small budgets):**\n`;
      response += `• **VOO** - S&P 500 (expense ratio 0.03%)\n`;
      response += `• **VTI** - Total US Market\n`;
      response += `• **SCHD** - Dividend ETF\n\n`;
      response += `**Fractional Shares:** Most brokers let you buy $1 worth of any stock\n\n`;
      response += `**Tip:** Avoid penny stocks - they're cheap for a reason (usually bad companies)\n\n`;
    }
    
    if (themes.asian) {
      response += `🌏 **Asian Market Options:**\n\n`;
      response += `**ETFs:**\n`;
      response += `• **VWO** - Emerging Markets\n`;
      response += `• **EWT** - Taiwan (semiconductors)\n`;
      response += `• **EWJ** - Japan\n`;
      response += `• **KWEB** - China Internet\n\n`;
      response += `**Stocks:**\n`;
      response += `• **TSM** - Taiwan Semiconductor\n`;
      response += `• **BABA** - Alibaba\n`;
      response += `• **SONY** - Sony\n\n`;
    }
    
    if (themes.tech) {
      response += `💻 **Tech Portfolio:**\n\n`;
      response += `**Big Tech (safer):**\n`;
      response += `• AAPL, MSFT, GOOGL, AMZN, META\n\n`;
      response += `**AI/Semiconductors (higher growth):**\n`;
      response += `• NVDA, AMD, AVGO, TSM\n\n`;
      response += `**Tech ETFs:**\n`;
      response += `• **QQQ** - Nasdaq 100\n`;
      response += `• **SMH** - Semiconductors\n`;
      response += `• **XLK** - Tech Select\n\n`;
    }
    
    if (themes.dividend) {
      response += `💵 **Dividend Portfolio:**\n\n`;
      response += `**High Dividend Stocks:**\n`;
      response += `• **O** - Realty Income (monthly dividend!)\n`;
      response += `• **KO** - Coca-Cola\n`;
      response += `• **JNJ** - Johnson & Johnson\n`;
      response += `• **VZ** - Verizon\n`;
      response += `• **PG** - Procter & Gamble\n\n`;
      response += `**Dividend ETFs:**\n`;
      response += `• **SCHD** - Quality dividend\n`;
      response += `• **VYM** - High dividend yield\n`;
      response += `• **JEPI** - Income with options\n\n`;
    }
    
    if (themes.growth) {
      response += `🚀 **Growth Portfolio (High Risk/Reward):**\n\n`;
      response += `**High Growth Stocks:**\n`;
      response += `• NVDA, TSLA, AMD, PLTR\n\n`;
      response += `**Growth ETFs:**\n`;
      response += `• **QQQ** - Nasdaq 100\n`;
      response += `• **ARKK** - ARK Innovation (very volatile)\n`;
      response += `• **VUG** - Vanguard Growth\n\n`;
      response += `⚠️ High growth = high volatility. Be prepared for big swings.\n\n`;
    }
    
    if (themes.green) {
      response += `🌱 **Green/Sustainable Portfolio:**\n\n`;
      response += `**Clean Energy:**\n`;
      response += `• **ICLN** - Clean Energy ETF\n`;
      response += `• **TAN** - Solar ETF\n`;
      response += `• **ENPH** - Enphase (solar)\n`;
      response += `• **TSLA** - Tesla (EVs)\n\n`;
      response += `**ESG ETFs:**\n`;
      response += `• **ESGU** - ESG Leaders\n`;
      response += `• **SUSA** - Sustainable USA\n\n`;
    }
    
    if (themes.crypto) {
      response += `🪙 **Crypto Portfolio:**\n\n`;
      response += `**Core (lower risk):**\n`;
      response += `• 60% Bitcoin (BTC)\n`;
      response += `• 30% Ethereum (ETH)\n\n`;
      response += `**Altcoins (higher risk):**\n`;
      response += `• SOL, MATIC, LINK, AVAX\n\n`;
      response += `⚠️ Only invest 1-5% of total portfolio in crypto\n\n`;
    }
    
    // Default balanced portfolio if no specific theme
    if (!Object.values(themes).some(v => v)) {
      response += `**Balanced Starter Portfolio:**\n\n`;
      response += `• 40% - **VOO** (S&P 500)\n`;
      response += `• 20% - **QQQ** (Tech/Nasdaq)\n`;
      response += `• 20% - **VEA** (International Developed)\n`;
      response += `• 10% - **BND** (Bonds for stability)\n`;
      response += `• 10% - **Cash** (for opportunities)\n\n`;
    }
    
    response += `💡 **Tips:**\n`;
    response += `• Diversify across sectors and regions\n`;
    response += `• Start with ETFs, add individual stocks as you learn\n`;
    response += `• Invest regularly (dollar-cost averaging)\n`;
    response += `• This is educational - always do your own research!`;
    
    return response;
  }

  // Deep analysis of a single stock with real calculations
  private async deepStockAnalysis(symbol: string): Promise<string> {
    const data = this.marketData.get(symbol.toUpperCase());
    if (!data) {
      const result = await fetchMarketData([symbol]);
      if (!result.data[0]) return `❌ Could not find data for "${symbol}". Check if it's a valid ticker.`;
      this.marketData.set(symbol.toUpperCase(), result.data[0]);
    }
    
    const stock = this.marketData.get(symbol.toUpperCase())!;
    const history = await this.getHistory(symbol);
    
    const volatility = this.calculateVolatility(history);
    const trend = this.detectTrend(history);
    const levels = this.findLevels(history);
    const momentum = this.calcMomentum(stock, history);
    const currentPrice = this.parseNum(stock.price);
    
    const distToSupport = levels.support > 0 ? ((currentPrice - levels.support) / currentPrice * 100).toFixed(1) : 'N/A';
    const distToResistance = levels.resistance > 0 ? ((levels.resistance - currentPrice) / currentPrice * 100).toFixed(1) : 'N/A';

    let response = `🔍 **${stock.symbol} - Deep Analysis**\n\n`;
    response += `**${stock.name}**\n`;
    response += `Price: **$${stock.price}** (${stock.changePercent})\n\n`;
    
    response += `**📊 Technical Indicators:**\n`;
    response += `• Trend: ${trend.includes('up') ? '🟢' : trend.includes('down') ? '🔴' : '🟡'} ${trend}\n`;
    response += `• Momentum: ${momentum > 0 ? '🟢' : '🔴'} ${momentum.toFixed(2)} (${Math.abs(momentum) > 3 ? 'Strong' : 'Moderate'})\n`;
    response += `• Volatility: ${volatility.toFixed(2)}% ${volatility > 2.5 ? '⚠️ High' : volatility > 1 ? 'Normal' : 'Low'}\n\n`;
    
    response += `**🎯 Price Levels (from 1M data):**\n`;
    response += `• Support: $${levels.support.toFixed(2)} (${distToSupport}% away)\n`;
    response += `• Resistance: $${levels.resistance.toFixed(2)} (${distToResistance}% away)\n\n`;
    
    // Generate dynamic insight
    response += `**💡 My Analysis:**\n`;
    if (trend.includes('uptrend') && momentum > 0) {
      response += `${stock.symbol} shows strength with ${trend} and positive momentum. `;
      if (parseFloat(distToResistance as string) < 3) {
        response += `Price is near resistance ($${levels.resistance.toFixed(2)}) - watch for breakout or rejection.`;
      } else {
        response += `There's room to run before hitting resistance.`;
      }
    } else if (trend.includes('downtrend')) {
      response += `${stock.symbol} is in a ${trend}. `;
      if (parseFloat(distToSupport as string) < 3) {
        response += `Approaching support at $${levels.support.toFixed(2)} - could bounce or break down.`;
      } else {
        response += `Wait for stabilization before considering entry.`;
      }
    } else {
      response += `${stock.symbol} is consolidating. Watch for a decisive break above $${levels.resistance.toFixed(2)} or below $${levels.support.toFixed(2)}.`;
    }
    
    return response;
  }

  // Compare multiple stocks with real data
  private async compareStocks(symbols: string[]): Promise<string> {
    if (symbols.length < 2) symbols = ['AAPL', 'MSFT', 'GOOGL'];
    
    await this.updateMarketData();
    const analyses: Array<{symbol: string; price: string; change: string; momentum: number; volatility: number; trend: string}> = [];
    
    for (const sym of symbols) {
      let data = this.marketData.get(sym);
      if (!data) {
        const result = await fetchMarketData([sym]);
        if (result.data[0]) data = result.data[0];
      }
      if (data) {
        const history = await this.getHistory(sym);
        analyses.push({
          symbol: data.symbol,
          price: data.price,
          change: data.changePercent,
          momentum: this.calcMomentum(data, history),
          volatility: this.calculateVolatility(history),
          trend: this.detectTrend(history)
        });
      }
    }
    
    analyses.sort((a, b) => b.momentum - a.momentum);
    
    let response = `📊 **Stock Comparison**\n\n`;
    analyses.forEach((a, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
      response += `${medal} **${a.symbol}**: $${a.price} (${a.change})\n`;
      response += `   Momentum: ${a.momentum.toFixed(1)} | Vol: ${a.volatility.toFixed(1)}% | ${a.trend}\n\n`;
    });
    
    const best = analyses[0];
    response += `**💡 Verdict:** ${best.symbol} currently shows the strongest momentum at ${best.momentum.toFixed(1)}.`;
    if (best.volatility > 2.5) response += ` However, higher volatility means more risk.`;
    
    return response;
  }

  // Smart market overview with dynamic analysis
  private async smartMarketOverview(): Promise<string> {
    const sp500 = this.marketData.get('S&P 500');
    const nasdaq = this.marketData.get('NASDAQ COMPOSITE');
    const vix = this.marketData.get('VIX');
    
    const allData = Array.from(this.marketData.values());
    const gainers = allData.filter(d => d.isPositive).length;
    const total = allData.length || 1;
    const marketHealth = (gainers / total) * 100;
    
    const vixVal = vix ? this.parseNum(vix.price) : 15;
    const fearLevel = vixVal > 25 ? 'High Fear' : vixVal > 18 ? 'Moderate Caution' : 'Low Fear (Greed)';
    
    let response = `📊 **Market Analysis - ${new Date().toLocaleDateString()}**\n\n`;
    response += `**Major Indices:**\n`;
    response += `• S&P 500: $${sp500?.price || 'N/A'} (${sp500?.changePercent || 'N/A'})\n`;
    response += `• NASDAQ: $${nasdaq?.price || 'N/A'} (${nasdaq?.changePercent || 'N/A'})\n\n`;
    
    response += `**Market Health:** ${marketHealth > 60 ? '🟢' : marketHealth > 40 ? '🟡' : '🔴'} ${marketHealth.toFixed(0)}% of tracked assets are up\n`;
    response += `**VIX (Fear Index):** ${vixVal.toFixed(2)} - ${fearLevel}\n\n`;
    
    // Dynamic insight
    response += `**💡 My Take:**\n`;
    if (marketHealth > 65 && vixVal < 18) {
      response += `Markets show broad strength with low fear. Good conditions for growth positions, but don't chase - look for pullbacks.`;
    } else if (marketHealth < 35 || vixVal > 25) {
      response += `Elevated caution warranted. Consider defensive positions or raising cash. Look for quality names at discount.`;
    } else {
      response += `Mixed signals today. Be selective - focus on individual stock strength rather than broad market bets.`;
    }
    
    return response;
  }

  // Find trading opportunities based on momentum and trend
  private async findOpportunities(): Promise<string> {
    const allData = Array.from(this.marketData.values());
    const opportunities: Array<{symbol: string; name: string; price: string; momentum: number; reason: string}> = [];
    
    for (const data of allData.slice(0, 10)) {
      const history = await this.getHistory(data.symbol);
      const momentum = this.calcMomentum(data, history);
      const trend = this.detectTrend(history);
      const volatility = this.calculateVolatility(history);
      
      if (momentum > 1 && trend.includes('uptrend') && volatility < 4) {
        opportunities.push({
          symbol: data.symbol, name: data.name, price: data.price, momentum,
          reason: `${trend}, momentum ${momentum.toFixed(1)}, vol ${volatility.toFixed(1)}%`
        });
      }
    }
    
    opportunities.sort((a, b) => b.momentum - a.momentum);
    
    let response = `🎯 **Opportunity Scan**\n\n`;
    if (opportunities.length === 0) {
      response += `No strong opportunities found right now. Markets may be choppy or extended.\n\n`;
      response += `**Suggestion:** Wait for pullbacks in quality names or look at specific sectors.`;
    } else {
      response += `Found ${opportunities.length} potential opportunities:\n\n`;
      opportunities.slice(0, 5).forEach((o, i) => {
        response += `${i + 1}. **${o.symbol}** ($${o.price})\n   ${o.reason}\n\n`;
      });
      response += `⚠️ Always do your own research. These are based on momentum, not fundamentals.`;
    }
    
    return response;
  }

  // Smart risk analysis
  private async smartRiskAnalysis(): Promise<string> {
    const vix = this.marketData.get('VIX');
    const vixVal = vix ? this.parseNum(vix.price) : 15;
    const vixChange = vix ? this.parseNum(vix.changePercent) : 0;
    
    // Calculate average volatility across assets
    let totalVol = 0, count = 0;
    for (const data of Array.from(this.marketData.values()).slice(0, 8)) {
      const history = await this.getHistory(data.symbol);
      totalVol += this.calculateVolatility(history);
      count++;
    }
    const avgVol = count > 0 ? totalVol / count : 2;
    
    let response = `⚠️ **Risk Assessment**\n\n`;
    response += `**VIX:** ${vixVal.toFixed(2)} (${vixChange > 0 ? '↑' : '↓'} ${vix?.changePercent || '0%'})\n`;
    response += `**Avg Asset Volatility:** ${avgVol.toFixed(2)}%\n\n`;
    
    response += `**Risk Level:** `;
    if (vixVal > 25 || avgVol > 3) {
      response += `🔴 **HIGH**\nMarkets are volatile. Reduce position sizes, tighten stops, consider hedging.\n`;
    } else if (vixVal > 18 || avgVol > 2) {
      response += `🟡 **MODERATE**\nNormal market conditions. Standard risk management applies.\n`;
    } else {
      response += `🟢 **LOW**\nCalm markets. Good for position building, but complacency can be dangerous.\n`;
    }
    
    response += `\n**💡 Risk Tips:**\n`;
    response += `• Never risk more than 2% of portfolio on one trade\n`;
    response += `• Use stop-losses on all positions\n`;
    response += `• Higher VIX = smaller position sizes`;
    
    return response;
  }

  // Smart crypto analysis
  private async smartCryptoAnalysis(): Promise<string> {
    const btc = this.marketData.get('BTC-USD');
    const eth = this.marketData.get('ETH-USD');
    
    const btcHistory = btc ? await this.getHistory('BTC-USD') : [];
    const ethHistory = eth ? await this.getHistory('ETH-USD') : [];
    
    const btcTrend = this.detectTrend(btcHistory);
    const ethTrend = this.detectTrend(ethHistory);
    const btcVol = this.calculateVolatility(btcHistory);
    
    let response = `₿ **Crypto Analysis**\n\n`;
    response += `**Bitcoin:** $${btc?.price || 'N/A'} (${btc?.changePercent || 'N/A'})\n`;
    response += `  Trend: ${btcTrend} | Volatility: ${btcVol.toFixed(1)}%\n\n`;
    response += `**Ethereum:** $${eth?.price || 'N/A'} (${eth?.changePercent || 'N/A'})\n`;
    response += `  Trend: ${ethTrend}\n\n`;
    
    response += `**💡 Analysis:**\n`;
    if (btcTrend.includes('uptrend')) {
      response += `Bitcoin showing strength. Altcoins typically follow BTC's lead. `;
    } else if (btcTrend.includes('downtrend')) {
      response += `Bitcoin weak - be cautious with crypto exposure. `;
    }
    response += `Crypto volatility is ${btcVol > 5 ? 'very high' : btcVol > 3 ? 'elevated' : 'moderate'} - size positions accordingly.`;
    
    return response;
  }

  // Smart sector analysis
  private async smartSectorAnalysis(symbols: string[], sectorName: string): Promise<string> {
    const analyses: Array<{symbol: string; price: string; change: string; momentum: number}> = [];
    
    for (const sym of symbols) {
      let data = this.marketData.get(sym);
      if (!data) {
        const result = await fetchMarketData([sym]);
        if (result.data[0]) data = result.data[0];
      }
      if (data) {
        const history = await this.getHistory(sym);
        analyses.push({
          symbol: data.symbol, price: data.price, change: data.changePercent,
          momentum: this.calcMomentum(data, history)
        });
      }
    }
    
    analyses.sort((a, b) => b.momentum - a.momentum);
    const avgMomentum = analyses.reduce((a, b) => a + b.momentum, 0) / (analyses.length || 1);
    
    let response = `💻 **${sectorName} Sector Analysis**\n\n`;
    analyses.forEach(a => {
      const icon = a.momentum > 0 ? '🟢' : '🔴';
      response += `${icon} **${a.symbol}**: $${a.price} (${a.change}) | Mom: ${a.momentum.toFixed(1)}\n`;
    });
    
    response += `\n**Sector Momentum:** ${avgMomentum > 0 ? '🟢' : '🔴'} ${avgMomentum.toFixed(2)}\n\n`;
    response += `**💡 Insight:** `;
    if (avgMomentum > 2) {
      response += `${sectorName} showing strength. ${analyses[0].symbol} leads the pack.`;
    } else if (avgMomentum < -2) {
      response += `${sectorName} under pressure. Wait for stabilization.`;
    } else {
      response += `Mixed signals in ${sectorName}. Be selective - ${analyses[0].symbol} looks best.`;
    }
    
    return response;
  }

  private getMarketOverview(analysis: MarketAnalysis): string {
    const sp500 = this.marketData.get('S&P 500');
    const nasdaq = this.marketData.get('NASDAQ COMPOSITE');
    const dow = this.marketData.get('DOW JONES INDUSTRIAL AVERAGE');
    
    return `📊 **Market Overview**

**Overall Sentiment:** ${analysis.sentiment.toUpperCase()} (${analysis.confidence}% confidence)

**Major Indices:**
• S&P 500: ${sp500?.price || 'N/A'} (${sp500?.changePercent || 'N/A'})
• NASDAQ: ${nasdaq?.price || 'N/A'} (${nasdaq?.changePercent || 'N/A'})
• DOW: ${dow?.price || 'N/A'} (${dow?.changePercent || 'N/A'})

**Sector Performance:**
${analysis.sectors.map(s => `• ${s.name}: ${s.trend === 'up' ? '🟢 Trending Up' : s.trend === 'down' ? '🔴 Trending Down' : '🟡 Flat'}`).join('\n')}

**Top Movers:**
${analysis.topMovers.map(m => `• ${m.symbol}: ${m.change} ${m.direction === 'up' ? '📈' : '📉'}`).join('\n')}

**AI Recommendation:** ${analysis.recommendation}`;
  }

  private getBuyRecommendation(analysis: MarketAnalysis): string {
    const bullishStocks = Array.from(this.marketData.values())
      .filter(d => d.isPositive)
      .sort((a, b) => parseFloat(b.changePercent) - parseFloat(a.changePercent))
      .slice(0, 3);

    return `🎯 **Buy Recommendations**

Based on current market conditions (${analysis.sentiment} sentiment):

**Strong Momentum Picks:**
${bullishStocks.map(s => `• **${s.symbol}** (${s.name}): ${s.price} ${s.changePercent}`).join('\n')}

**Strategy Suggestions:**
${analysis.sentiment === 'bullish' ? 
`• Consider growth-oriented positions
• Tech sector showing strength
• Use pullbacks as entry points` :
`• Focus on defensive stocks
• Consider dollar-cost averaging
• Keep some cash for opportunities`}

**Risk Management:**
• Set stop-loss orders at 5-7% below entry
• Don't invest more than 5% in single position
• Diversify across sectors

⚠️ *This is simulated analysis for educational purposes. Always do your own research.*`;
  }

  private getSellAdvice(analysis: MarketAnalysis): string {
    const bearishStocks = Array.from(this.marketData.values())
      .filter(d => !d.isPositive)
      .sort((a, b) => parseFloat(a.changePercent) - parseFloat(b.changePercent))
      .slice(0, 3);

    return `📉 **Sell/Exit Analysis**

**Underperforming Assets:**
${bearishStocks.map(s => `• **${s.symbol}**: ${s.price} ${s.changePercent}`).join('\n')}

**When to Consider Selling:**
• If a position drops 10%+ from your entry
• When fundamentals change significantly  
• To rebalance your portfolio allocation
• If you need to reduce risk exposure

**Current Market Context:**
The market is currently ${analysis.sentiment}. ${
  analysis.sentiment === 'bearish' 
    ? 'Consider trimming weak positions and raising cash.'
    : 'Hold quality positions but set trailing stops.'
}

**Tax Tip:** Consider tax-loss harvesting if you have losing positions.`;
  }

  private getRiskAnalysis(analysis: MarketAnalysis): string {
    const vix = this.marketData.get('VIX');
    const vixValue = vix ? parseFloat(vix.price) : 15;
    
    let riskLevel = 'MODERATE';
    let riskColor = '🟡';
    if (vixValue < 15) { riskLevel = 'LOW'; riskColor = '🟢'; }
    else if (vixValue > 25) { riskLevel = 'HIGH'; riskColor = '🔴'; }

    return `⚠️ **Risk Analysis**

**Volatility Index (VIX):** ${vix?.price || 'N/A'} ${vix?.changePercent || ''}
**Risk Level:** ${riskColor} ${riskLevel}

**What This Means:**
${vixValue < 15 ? 
`• Market is calm and stable
• Good environment for growth investing
• Lower option premiums` :
vixValue > 25 ?
`• Elevated fear in the market
• Expect larger price swings
• Consider hedging strategies` :
`• Normal market conditions
• Standard risk management applies
• Stay diversified`}

**Risk Management Tips:**
• Never invest money you can't afford to lose
• Keep 10-20% in cash for opportunities
• Use position sizing (max 5% per trade)
• Set stop-losses on all positions
• Diversify across asset classes`;
  }

  private getCryptoAnalysis(): string {
    const btc = this.marketData.get('BTC-USD');
    const eth = this.marketData.get('ETH-USD');
    
    return `₿ **Crypto Market Analysis**

**Bitcoin (BTC):** ${btc?.price || 'N/A'} (${btc?.changePercent || 'N/A'})
**Ethereum (ETH):** ${eth?.price || 'N/A'} (${eth?.changePercent || 'N/A'})

**Trend:** ${btc?.isPositive ? '🟢 Bullish momentum' : '🔴 Bearish pressure'}

**Key Observations:**
• Crypto remains highly volatile (3-5x stocks)
• Institutional adoption continues to grow
• Correlation with tech stocks is elevated

**Strategy:**
• Only allocate 1-5% of portfolio to crypto
• Dollar-cost average rather than lump sum
• Use cold storage for long-term holdings
• Be prepared for 30-50% drawdowns`;
  }

  private getTechAnalysis(): string {
    const techStocks = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'TSLA']
      .map(s => this.marketData.get(s))
      .filter(Boolean) as MarketData[];
    
    const avgChange = techStocks.reduce((acc, s) => 
      acc + parseFloat(s.changePercent.replace(/[^0-9.-]/g, '')), 0) / techStocks.length;

    return `💻 **Tech Sector Analysis**

**Performance Overview:**
${techStocks.map(s => `• **${s.symbol}**: ${s.price} (${s.changePercent})`).join('\n')}

**Sector Trend:** ${avgChange > 0 ? '🟢 Outperforming' : '🔴 Underperforming'} (Avg: ${avgChange.toFixed(2)}%)

**Key Themes:**
• AI/ML driving semiconductor demand
• Cloud computing growth continues
• Consumer tech facing headwinds

**Top Pick:** NVDA - AI chip leader with strong momentum
**Value Play:** GOOGL - Trading at reasonable multiples`;
  }

  private getCommodityAnalysis(): string {
    const gold = this.marketData.get('GOLD');
    const oil = this.marketData.get('CRUDE OIL WTI');
    
    return `🏆 **Commodities Analysis**

**Gold:** ${gold?.price || 'N/A'} (${gold?.changePercent || 'N/A'})
**Crude Oil (WTI):** ${oil?.price || 'N/A'} (${oil?.changePercent || 'N/A'})

**Gold Outlook:**
${gold?.isPositive ? '• Showing strength as inflation hedge' : '• Facing pressure from strong dollar'}
• Central bank buying remains supportive
• Good portfolio diversifier (5-10% allocation)

**Oil Outlook:**
${oil?.isPositive ? '• Demand recovery supporting prices' : '• Supply concerns weighing on prices'}
• OPEC+ decisions key to watch
• Energy stocks offer leveraged exposure`;
  }

  private getStockAnalysis(stock: MarketData): string {
    const momentum = stock.isPositive ? 'positive' : 'negative';
    const changeNum = Math.abs(parseFloat(stock.changePercent.replace(/[^0-9.-]/g, '')));
    
    let strength = 'moderate';
    if (changeNum > 3) strength = 'strong';
    else if (changeNum < 1) strength = 'weak';

    return `📈 **${stock.symbol} Analysis**

**${stock.name}**
• **Price:** ${stock.price}
• **Change:** ${stock.change} (${stock.changePercent})
• **Momentum:** ${momentum.toUpperCase()} (${strength})

**Technical View:**
${stock.isPositive ? 
`• Currently showing bullish momentum
• Consider waiting for pullback to enter
• Set stop-loss 5% below current price` :
`• Currently under selling pressure
• May present buying opportunity if oversold
• Watch for support levels`}

**Position Sizing:**
For a $10,000 portfolio, consider max position of $500 (5%)

⚠️ *Always conduct your own due diligence before trading.*`;
  }

  private getDefaultResponse(analysis: MarketAnalysis): string {
    return `🤖 **Stockie**

I can help you with:
• **"How's the market?"** - Get overall market analysis
• **"What should I buy?"** - Get buy recommendations
• **"Analyze AAPL"** - Get specific stock analysis
• **"Tell me about crypto"** - Crypto market insights
• **"What's the risk level?"** - Volatility analysis
• **"Tech sector analysis"** - Sector breakdown

**Current Market:** ${analysis.sentiment.toUpperCase()} sentiment

Ask me anything about stocks, crypto, commodities, or trading strategies!`;
  }
}

// Props for app interactions
interface StockHelperProps {
  watchlistSymbols?: string[];
  onAddToWatchlist?: (symbol: string) => void;
  onRemoveFromWatchlist?: (symbol: string) => void;
  portfolioSymbols?: string[];
  onAddToPortfolio?: (symbol: string, quantity: number) => void;
  isDarkMode?: boolean;
}

// React Component
export const StockHelper: React.FC<StockHelperProps> = ({
  watchlistSymbols = [],
  onAddToWatchlist,
  onRemoveFromWatchlist,
  portfolioSymbols = [],
  onAddToPortfolio,
  isDarkMode = false
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef(new TradingAI());

  const portfolioPositionMap = useMemo(() => {
    const map: Record<string, number> = {};
    portfolioSymbols.forEach((entry) => {
      const raw = (entry ?? '').toString().trim();
      if (!raw) return;
      const [symbolPart, qtyPart] = raw.split(':');
      const symbol = symbolPart.toUpperCase();
      const qty = qtyPart ? parseFloat(qtyPart) : NaN;
      map[symbol] = !isNaN(qty) && qty > 0 ? qty : (map[symbol] ?? 0);
    });
    return map;
  }, [portfolioSymbols]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('stockie_messages_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as { id: string; role: 'user' | 'assistant'; content: string; timestamp: string }[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const restored: Message[] = parsed.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          setMessages(restored);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to restore Stockie messages', e);
    }

    // Welcome message
    const welcomeMsg: Message = {
      id: 'welcome',
      role: 'assistant',
      content: `👋 **Welcome to Stockie!**

I can help you with market analysis AND control the app:

**📊 Analysis:**
• "How's the market?" - Market overview
• "Analyze NVDA" - Deep stock analysis
• "Compare AAPL vs MSFT" - Stock comparison

**🎬 Actions I can do:**
• "Add AAPL to watchlist" - Track stocks
• "Remove TSLA from watchlist" - Untrack stocks
• "Show my watchlist" - See your tracked stocks
• "Create watchlist with NVDA, AMD, GOOGL"

**💡 Learning:**
• "What is an ETF?" - Definitions
• "How to start investing?" - Guides

Try: **"Add NVDA to my watchlist"**`,
      timestamp: new Date()
    };
    setMessages([welcomeMsg]);
  }, []);

  useEffect(() => {
    try {
      const serialized = messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      }));
      localStorage.setItem('stockie_messages_v1', JSON.stringify(serialized));
    } catch (e) {
      console.warn('Failed to persist Stockie messages', e);
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle action commands
  const handleAction = (msg: string): string | null => {
    const lowerMsg = msg.toLowerCase();
    
    // Add to watchlist patterns
    const addWatchlistMatch = lowerMsg.match(/(?:add|put|include|track|watch)\s+([a-z]{1,5})\s+(?:to|in|on)\s*(?:my\s*)?(?:watchlist|watch\s*list)/i) 
      || lowerMsg.match(/(?:watchlist|watch)\s+(?:add|track)\s+([a-z]{1,5})/i)
      || lowerMsg.match(/(?:add|track)\s+([a-z]{1,5})/i);
    
    if (addWatchlistMatch && onAddToWatchlist) {
      const symbol = addWatchlistMatch[1].toUpperCase();
      if (watchlistSymbols.includes(symbol)) {
        return `📋 **${symbol}** is already in your watchlist!`;
      }
      onAddToWatchlist(symbol);
      return `✅ **${symbol}** has been added to your watchlist!\n\nYou can view it in the Watchlist tab. Your watchlist now has ${watchlistSymbols.length + 1} stocks.`;
    }
    
    // Remove from watchlist patterns
    const removeWatchlistMatch = lowerMsg.match(/(?:remove|delete|drop|unwatch)\s+([a-z]{1,5})\s+(?:from|off)\s*(?:my\s*)?(?:watchlist|watch\s*list)/i)
      || lowerMsg.match(/(?:remove|delete)\s+([a-z]{1,5})/i);
    
    if (removeWatchlistMatch && onRemoveFromWatchlist) {
      const symbol = removeWatchlistMatch[1].toUpperCase();
      if (!watchlistSymbols.includes(symbol)) {
        return `❌ **${symbol}** is not in your watchlist.`;
      }
      onRemoveFromWatchlist(symbol);
      return `🗑️ **${symbol}** has been removed from your watchlist.`;
    }
    
    // Add to portfolio patterns
    const addPortfolioMatch = lowerMsg.match(/(?:add|buy|purchase)\s+(\d+\.?\d*)\s*(?:shares?\s+(?:of\s+)?)?([a-z]{1,5})\s+(?:to|in)\s*(?:my\s*)?(?:portfolio)/i)
      || lowerMsg.match(/(?:portfolio)\s+(?:add|buy)\s+(\d+\.?\d*)\s+([a-z]{1,5})/i)
      || lowerMsg.match(/(?:buy|add)\s+(\d+\.?\d*)\s+([a-z]{1,5})/i);
    
    if (addPortfolioMatch && onAddToPortfolio) {
      const quantity = parseFloat(addPortfolioMatch[1]);
      const symbol = addPortfolioMatch[2].toUpperCase();
      if (quantity <= 0) {
        return `❌ Please specify a valid quantity greater than 0.`;
      }
      onAddToPortfolio(symbol, quantity);
      return `✅ Added **${quantity} shares of ${symbol}** to your portfolio!\n\nView your holdings in the Portfolio tab.`;
    }
    
    // Show watchlist
    if (lowerMsg.includes('show') && lowerMsg.includes('watchlist') || lowerMsg.includes('my watchlist')) {
      if (watchlistSymbols.length === 0) {
        return `📋 **Your Watchlist is Empty**\n\nSay "add AAPL to watchlist" to start tracking stocks!`;
      }
      return `📋 **Your Watchlist (${watchlistSymbols.length} stocks)**\n\n${watchlistSymbols.map(s => `• ${s}`).join('\n')}\n\n**Commands:**\n• "Add NVDA to watchlist"\n• "Remove AAPL from watchlist"`;
    }
    
    // Show portfolio
    if (lowerMsg.includes('show') && lowerMsg.includes('portfolio') || lowerMsg.includes('my portfolio')) {
      const symbols = Object.keys(portfolioPositionMap);
      if (symbols.length === 0) {
        return `💼 **Your Portfolio is Empty**\n\nSay "buy 10 AAPL" or "add 5 shares NVDA to portfolio" to add holdings!`;
      }
      const lines = symbols.map(symbol => {
        const qty = portfolioPositionMap[symbol];
        return qty ? `• ${symbol} (${qty} shares)` : `• ${symbol}`;
      });
      return `💼 **Your Portfolio**\n\n${lines.join('\n')}\n\nView details in the Portfolio tab.`;
    }
    
    // Create watchlist with multiple stocks
    const createWatchlistMatch = lowerMsg.match(/(?:create|make|build|start)\s+(?:a\s+)?watchlist\s+(?:with|of|containing)\s+(.+)/i);
    if (createWatchlistMatch && onAddToWatchlist) {
      const stocksText = createWatchlistMatch[1];
      const symbols = stocksText.toUpperCase().match(/[A-Z]{1,5}/g) || [];
      const commonWords = ['AND', 'THE', 'WITH', 'FOR'];
      const validSymbols = symbols.filter(s => !commonWords.includes(s));
      
      if (validSymbols.length === 0) {
        return `❌ No valid stock symbols found. Try: "Create watchlist with AAPL, NVDA, MSFT"`;
      }
      
      validSymbols.forEach(s => onAddToWatchlist(s));
      return `✅ **Watchlist Created!**\n\nAdded ${validSymbols.length} stocks:\n${validSymbols.map(s => `• ${s}`).join('\n')}\n\nView them in the Watchlist tab!`;
    }
    
    // Create portfolio based on theme/strategy
    const portfolioThemes: Record<string, string[]> = {
      european: ['VGK', 'EZU', 'ASML', 'SAP', 'NVO'],
      europe: ['VGK', 'EZU', 'ASML', 'SAP', 'NVO'],
      cheap: ['VOO', 'VTI', 'SCHD'],
      budget: ['VOO', 'VTI', 'SCHD'],
      tech: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMD'],
      technology: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMD'],
      dividend: ['SCHD', 'VYM', 'O', 'KO', 'JNJ'],
      income: ['SCHD', 'VYM', 'O', 'KO', 'JNJ'],
      growth: ['NVDA', 'TSLA', 'AMD', 'AMZN', 'META'],
      aggressive: ['NVDA', 'TSLA', 'AMD', 'COIN', 'PLTR'],
      safe: ['VOO', 'BND', 'JNJ', 'PG', 'KO'],
      conservative: ['VOO', 'BND', 'JNJ', 'PG', 'KO'],
      beginner: ['VOO', 'QQQ', 'VTI'],
      asian: ['VWO', 'EWT', 'TSM', 'BABA', 'SONY'],
      asia: ['VWO', 'EWT', 'TSM', 'BABA', 'SONY'],
      green: ['ICLN', 'TAN', 'TSLA', 'ENPH'],
      sustainable: ['ICLN', 'TAN', 'TSLA', 'ENPH'],
      crypto: ['COIN', 'MSTR', 'SQ'],
    };
    
    const isPortfolioCreate = /(?:make|create|build|give|start).*(?:portfolio|watchlist|investments)/i.test(lowerMsg);
    
    if (isPortfolioCreate && (onAddToWatchlist || onAddToPortfolio)) {
      // Find matching theme
      let matchedTheme: string | null = null;
      let stocks: string[] = [];
      
      for (const [theme, themeStocks] of Object.entries(portfolioThemes)) {
        if (lowerMsg.includes(theme)) {
          matchedTheme = theme;
          stocks = themeStocks;
          break;
        }
      }
      
      // Default to balanced portfolio if no theme
      if (!matchedTheme) {
        matchedTheme = 'balanced';
        stocks = ['VOO', 'QQQ', 'VEA', 'SCHD', 'BND'];
      }
      
      // Extract budget and goal
      const allNumbers = lowerMsg.match(/\d+/g)?.map(n => parseInt(n)) || [];
      const yearMatch = lowerMsg.match(/\b(20[2-9]\d)\b/);
      const targetYear = yearMatch ? parseInt(yearMatch[1]) : null;
      const yearsToGoal = targetYear ? Math.max(1, targetYear - new Date().getFullYear()) : 5;
      const amounts = allNumbers.filter(n => n < 2020 || n > 2099).sort((a, b) => a - b);
      const budget = amounts.length >= 1 ? amounts[0] : 0;
      const goal = amounts.length >= 2 ? amounts[amounts.length - 1] : 0;
      const multiplier = goal > budget ? goal / budget : 0;
      
      // CRITICAL: Analyze if this is realistic BEFORE creating portfolio
      const annualReturnNeeded = multiplier > 1 ? (Math.pow(multiplier, 1/yearsToGoal) - 1) * 100 : 0;
      
      // If the goal is unrealistic, give honest advice FIRST
      if (multiplier > 5 && budget < 100) {
        return `⚠️ **Let's Be Real Here**

**Your Goal:** €${budget} → €${goal} (${multiplier.toFixed(0)}x) in ${yearsToGoal} years
**Required Return:** ${annualReturnNeeded.toFixed(0)}% per year

**The Hard Truth:**
• The S&P 500 averages 7-10% yearly over decades
• Even the best hedge funds average 15-20%
• Warren Buffett averages ~20% and he's a legend
• You're asking for ${annualReturnNeeded.toFixed(0)}% which is ${(annualReturnNeeded/10).toFixed(0)}x the market average

**What Actually Happens:**
• 90% of people trying to get rich quick lose money
• Small amounts + unrealistic expectations = gambling, not investing
• €${budget} in fees alone could wipe your gains

**My Honest Advice:**
1. With €${budget}, focus on **learning** not earning
2. Paper trade (fake money) for 6 months
3. Save €50-100/month until you have €500+
4. Then invest in ETFs like VOO or QQQ
5. Expect 7-10% yearly returns (€${budget} → €${Math.round(budget * Math.pow(1.08, yearsToGoal))} in ${yearsToGoal} years realistically)

**Want me to create a learning-focused watchlist instead?**
Say: "Create a beginner portfolio" for safer picks to study.`;
      }
      
      // Add stocks to watchlist and/or portfolio
      stocks.forEach(s => {
        if (onAddToWatchlist) onAddToWatchlist(s);
        if (onAddToPortfolio) onAddToPortfolio(s, 1); // default 1 share per asset
      });
      
      const themeEmojis: Record<string, string> = {
        european: '🇪🇺', europe: '🇪🇺', cheap: '💰', budget: '💰',
        tech: '💻', technology: '💻', dividend: '💵', income: '💵',
        growth: '🚀', aggressive: '🚀', safe: '🛡️', conservative: '🛡️',
        beginner: '🎓', asian: '🌏', asia: '🌏', green: '🌱', sustainable: '🌱',
        crypto: '🪙', balanced: '⚖️'
      };
      
      let response = `✅ **${themeEmojis[matchedTheme] || '📋'} ${matchedTheme.charAt(0).toUpperCase() + matchedTheme.slice(1)} Portfolio Created!**\n\n`;
      response += `I've added these to your watchlist:\n${stocks.map(s => `• **${s}**`).join('\n')}\n\n`;
      
      // Add realistic goal analysis if amounts provided
      if (budget > 0 && goal > budget) {
        const realisticGrowth = Math.round(budget * Math.pow(1.08, yearsToGoal));
        const optimisticGrowth = Math.round(budget * Math.pow(1.15, yearsToGoal));
        
        response += `📊 **Your Goal Analysis:**\n`;
        response += `• Target: €${budget} → €${goal} (${multiplier.toFixed(0)}x) by ${targetYear || (new Date().getFullYear() + yearsToGoal)}\n`;
        response += `• Required: ${annualReturnNeeded.toFixed(0)}% annual return\n\n`;
        
        if (annualReturnNeeded > 50) {
          response += `🚨 **Warning:** This is extremely unlikely.\n`;
          response += `• Realistic (8%/yr): €${budget} → €${realisticGrowth}\n`;
          response += `• Optimistic (15%/yr): €${budget} → €${optimisticGrowth}\n`;
          response += `• Your goal needs hedge fund returns consistently.\n\n`;
        } else if (annualReturnNeeded > 20) {
          response += `⚠️ **Challenging:** Possible but risky.\n`;
          response += `• This beats most professional investors.\n`;
          response += `• Consider more realistic expectations.\n\n`;
        } else if (annualReturnNeeded > 10) {
          response += `📈 **Ambitious but doable** with growth stocks.\n\n`;
        } else {
          response += `✅ **Realistic!** Achievable with consistent investing.\n\n`;
        }
      }
      
      response += `📍 **Go to Watchlist tab** to track live prices, and Portfolio tab to see positions (1 share each).`;
      
      return response;
    }
    
    return null; // No action matched
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = input;
    setInput('');
    setIsLoading(true);

    try {
      // First check for action commands
      const actionResponse = handleAction(userInput);
      
      let response: string;
      if (actionResponse) {
        response = actionResponse;
      } else {
        const upper = userInput.toUpperCase();
        const contextLines: string[] = [];
        Object.entries(portfolioPositionMap).forEach(([symbol, qty]) => {
          if (upper.includes(symbol)) {
            const quantityText = qty > 0 ? qty.toString() : 'an unspecified number of';
            contextLines.push(`Internal Context: "User currently holds ${quantityText} shares of ${symbol}."`);
          }
        });
        const enrichedInput = contextLines.length > 0
          ? `${contextLines.join('\n')}\n\n${userInput}`
          : userInput;
        response = await aiRef.current.generateResponse(enrichedInput);
      }
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('AI Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    "How's the market?",
    "Add NVDA to watchlist",
    "Show my watchlist",
    "Analyze AAPL",
    "What is an ETF?",
    "Compare NVDA vs AMD"
  ];

  const handleResetChat = () => {
    try {
      localStorage.removeItem('stockie_messages_v1');
    } catch (e) {
      console.warn('Failed to clear Stockie messages', e);
    }

    const welcomeMsg: Message = {
      id: 'welcome',
      role: 'assistant',
      content: `👋 **Welcome to Stockie!**

I can help you with market analysis AND control the app:

**📊 Analysis:**
• "How's the market?" - Market overview
• "Analyze NVDA" - Deep stock analysis
• "Compare AAPL vs MSFT" - Stock comparison

**🎬 Actions I can do:**
• "Add AAPL to watchlist" - Track stocks
• "Remove TSLA from watchlist" - Untrack stocks
• "Show my watchlist" - See your tracked stocks
• "Create watchlist with NVDA, AMD, GOOGL"

**💡 Learning:**
• "What is an ETF?" - Definitions
• "How to start investing?" - Guides

Try: **"Add NVDA to my watchlist"**`,
      timestamp: new Date(),
    };

    setMessages([welcomeMsg]);
  };

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-[#f5f5f5] text-slate-900'}`}>
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow">
            <i className="fas fa-robot text-white"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Stockie</h1>
            <p className="text-xs text-slate-500">Your AI trading copilot</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Educational only · Not financial advice</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs text-emerald-600">Live</span>
            </div>
            <button
              type="button"
              onClick={handleResetChat}
              className="text-[10px] px-2 py-1 rounded-full border border-slate-300 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Reset chat"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {msg.content.split('**').map((part, i) => 
                  i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                )}
              </div>
              <div className={`text-[10px] mt-2 ${msg.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <span className="text-xs text-slate-500 ml-2">Analyzing markets...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setInput(prompt)}
              className="flex-shrink-0 px-3 py-1.5 text-xs bg-white hover:bg-slate-100 text-slate-700 rounded-full border border-slate-200 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 bg-white">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about stocks, crypto, market trends..."
            className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-5 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all shadow hover:shadow-violet-200"
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </form>
    </div>
  );
};
