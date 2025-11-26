
import React, { useState, useEffect, Suspense } from 'react';
import { AppMode, PortfolioItem } from './types';
import { auth, db } from './firebaseClient';
import { FirebaseError } from 'firebase/app';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Lazy load components for better initial performance
const MarketDashboard = React.lazy(() => import('./components/MarketAnalyst').then(module => ({ default: module.MarketDashboard })));
const Watchlist = React.lazy(() => import('./components/ImageStudio').then(module => ({ default: module.Watchlist })));
const Portfolio = React.lazy(() => import('./components/Portfolio').then(module => ({ default: module.Portfolio })));
const StockHelper = React.lazy(() => import('./components/StockHelper').then(module => ({ default: module.StockHelper })));

const DEFAULT_WATCHLIST: string[] = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN'];

const DEFAULT_PORTFOLIO: PortfolioItem[] = [
  { symbol: 'AAPL', quantity: 10 },
  { symbol: 'NVDA', quantity: 5 },
  { symbol: 'MSFT', quantity: 8 },
];

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.MARKETS);
  
  // Lifted Watchlist State
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(DEFAULT_WATCHLIST);

  // Lifted Portfolio State
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(DEFAULT_PORTFOLIO);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const loadUserData = React.useCallback(async (uid: string) => {
    try {
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as { watchlistSymbols?: string[]; portfolioItems?: PortfolioItem[] };
        if (Array.isArray(data.watchlistSymbols) && data.watchlistSymbols.length > 0) {
          setWatchlistSymbols(data.watchlistSymbols);
        } else {
          setWatchlistSymbols(DEFAULT_WATCHLIST);
        }
        if (Array.isArray(data.portfolioItems) && data.portfolioItems.length > 0) {
          setPortfolioItems(data.portfolioItems as PortfolioItem[]);
        } else {
          setPortfolioItems(DEFAULT_PORTFOLIO);
        }
      } else {
        await setDoc(ref, {
          watchlistSymbols: DEFAULT_WATCHLIST,
          portfolioItems: DEFAULT_PORTFOLIO,
          createdAt: new Date().toISOString(),
        });
        setWatchlistSymbols(DEFAULT_WATCHLIST);
        setPortfolioItems(DEFAULT_PORTFOLIO);
      }
    } catch (e) {
      console.warn('Failed to load user data from Firestore', e);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await loadUserData(user.uid);
      }
    });
    return () => unsub();
  }, [loadUserData]);

  useEffect(() => {
    if (!firebaseUser) return;
    const save = async () => {
      try {
        const ref = doc(db, 'users', firebaseUser.uid);
        await setDoc(ref, { watchlistSymbols, portfolioItems }, { merge: true });
      } catch (e) {
        console.warn('Failed to save user data to Firestore', e);
      }
    };
    save();
  }, [firebaseUser, watchlistSymbols, portfolioItems]);

  const addToWatchlist = React.useCallback((symbol: string) => {
    if (!firebaseUser) {
      setAuthStatus('You are in guest mode. Log in or sign up to save your watchlist in the cloud.');
    }
    const upper = symbol.toUpperCase().trim();
    setWatchlistSymbols(prev => {
      if (upper && !prev.includes(upper)) {
        return [...prev, upper];
      }
      return prev;
    });
  }, [firebaseUser]);

  const removeFromWatchlist = React.useCallback((symbol: string) => {
    if (!firebaseUser) {
      setAuthStatus('You are in guest mode. Log in or sign up to keep changes across sessions.');
    }
    setWatchlistSymbols(prev => prev.filter(s => s !== symbol));
  }, [firebaseUser]);

  const addToPortfolio = React.useCallback((symbol: string, quantity: number) => {
    if (!firebaseUser) {
      setAuthStatus('You are in guest mode. Log in or sign up to save your portfolio.');
    }
    const upper = symbol.toUpperCase().trim();
    setPortfolioItems(prev => [...prev, { symbol: upper, quantity }]);
  }, [firebaseUser]);

  const removeFromPortfolio = React.useCallback((index: number) => {
    if (!firebaseUser) {
      setAuthStatus('You are in guest mode. Log in or sign up to keep portfolio changes.');
    }
    setPortfolioItems(prev => prev.filter((_, i) => i !== index));
  }, [firebaseUser]);

  const toggleTheme = React.useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  const handleAuthSubmit = React.useCallback(async () => {
    if (!authEmail || !authPassword) return;
    setAuthLoading(true);
    setAuthStatus(null);
    try {
      if (authMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await loadUserData(cred.user.uid);
        setAuthStatus('Account created and signed in.');
      } else {
        const cred = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        await loadUserData(cred.user.uid);
      }
      setShowAuthOverlay(false);
    } catch (e: any) {
      let msg = 'Authentication failed.';
      if (e instanceof FirebaseError) {
        switch (e.code) {
          case 'auth/invalid-email':
            msg = 'That email address is not valid.';
            break;
          case 'auth/user-not-found':
          case 'auth/wrong-password':
            msg = 'Incorrect email or password.';
            break;
          case 'auth/email-already-in-use':
            msg = 'An account with this email already exists. Try logging in instead.';
            break;
          case 'auth/weak-password':
            msg = 'Password is too weak. Use at least 6 characters.';
            break;
          case 'auth/network-request-failed':
            msg = 'Network error. Check your connection and try again.';
            break;
          default:
            msg = e.message || msg;
        }
      } else if (typeof e?.message === 'string') {
        msg = e.message;
      }
      setAuthStatus(msg);
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword, authMode, loadUserData]);

  const handleLogout = React.useCallback(async () => {
    try {
      await signOut(auth);
      setFirebaseUser(null);
      setAuthStatus(null);
    } catch (e) {
      console.warn('Failed to sign out', e);
    }
  }, []);

  const handleProviderLogin = React.useCallback(
    async (providerKey: 'google' | 'facebook' | 'apple') => {
      setAuthLoading(true);
      setAuthStatus(null);
      try {
        let provider;
        if (providerKey === 'google') {
          provider = new GoogleAuthProvider();
        } else if (providerKey === 'facebook') {
          provider = new FacebookAuthProvider();
        } else {
          provider = new OAuthProvider('apple.com');
        }

        const cred = await signInWithPopup(auth, provider);
        await loadUserData(cred.user.uid);
        setShowAuthOverlay(false);
        setAuthStatus(`Signed in with ${providerKey.charAt(0).toUpperCase() + providerKey.slice(1)}.`);
      } catch (e: any) {
        let msg = 'Authentication failed.';
        if (e instanceof FirebaseError) {
          switch (e.code) {
            case 'auth/popup-blocked':
              msg = 'Popup was blocked by the browser. Allow popups for this site and try again.';
              break;
            case 'auth/popup-closed-by-user':
              msg = 'Sign-in popup was closed before finishing.';
              break;
            case 'auth/account-exists-with-different-credential':
              msg = 'An account already exists with the same email but different sign-in method.';
              break;
            case 'auth/operation-not-allowed':
              msg = 'This sign-in method is not enabled in Firebase Authentication settings.';
              break;
            default:
              msg = e.message || msg;
          }
        } else if (typeof e?.message === 'string') {
          msg = e.message;
        }
        setAuthStatus(msg);
      } finally {
        setAuthLoading(false);
      }
    },
    [loadUserData]
  );

  return (
    <div className={`flex h-screen w-screen ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-[#f5f5f5] text-slate-900'} overflow-hidden font-sans`}>
      {/* Sidebar Navigation */}
      <nav
        className={`w-20 md:w-64 border-r flex flex-col justify-between flex-shrink-0 transition-all duration-300 z-50 ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800 shadow-lg'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div>
          <div
            className={`p-4 md:p-6 flex items-center justify-center md:justify-start gap-3 border-b h-20 md:h-24 ${
              isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
            }`}
          >
            {/* Logo Section */}
            <div className="flex items-center gap-3">
               <div
                 className={`w-10 h-10 rounded-lg overflow-hidden p-0.5 flex-shrink-0 border ${
                   isDarkMode ? 'border-slate-700 bg-slate-900 shadow' : 'border-slate-200 bg-white shadow-sm'
                 }`}
               >
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
                  <span
                    className={`text-lg font-bold tracking-tight leading-none ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Market<span className="text-blue-600">Minds</span>
                  </span>
                  <span
                    className={`text-[10px] font-medium uppercase tracking-widest mt-1 ${
                      isDarkMode ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Terminal v2.6
                  </span>
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

        <div
          className={`p-4 border-t hidden md:block ${
            isDarkMode ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <div
            className={`rounded-lg p-3 text-xs flex flex-col gap-2 border ${
              isDarkMode
                ? 'bg-slate-900 text-slate-400 border-slate-800'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            <div>
              <p
                className={`font-semibold mb-1 ${
                  isDarkMode ? 'text-slate-200' : 'text-slate-700'
                }`}
              >
                Data Feed
              </p>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span>Search Grounding Active</span>
              </div>
            </div>
            <div
              className={`flex items-center justify-between mt-1 pt-2 border-t opacity-90 ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              <span>Powered by Gemini 2.5</span>
              <button
                type="button"
                onClick={toggleTheme}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-medium transition-colors ${
                  isDarkMode
                    ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <i className={`fas ${isDarkMode ? 'fa-sun text-amber-400' : 'fa-moon text-slate-500'}`}></i>
                <span>{isDarkMode ? 'Light' : 'Dark'} mode</span>
              </button>
            </div>
            <div
              className={`mt-3 pt-3 border-t ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              {firebaseUser ? (
                <div
                  className={`rounded-xl px-3 py-3 flex flex-col gap-2 shadow-sm ${
                    isDarkMode
                      ? 'bg-slate-900/80 border border-slate-700'
                      : 'bg-white border border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px]">
                        <i className="fas fa-lock"></i>
                      </span>
                      <div className="flex flex-col leading-tight">
                        <span className="text-[11px] font-semibold text-slate-200">Signed in</span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {firebaseUser.email || 'user'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-2 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-100"
                    >
                      Log out
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Watchlist and portfolio are synced to this account.
                  </p>
                  {authStatus && (
                    <div className="text-[10px] text-emerald-400">{authStatus}</div>
                  )}
                </div>
              ) : (
                <div
                  className={`rounded-xl px-3 py-3 flex flex-col gap-2 shadow-sm cursor-pointer transition-colors ${
                    isDarkMode
                      ? 'bg-slate-900/80 border border-slate-700 hover:border-slate-500'
                      : 'bg-white border border-slate-200 hover:border-slate-400'
                  }`}
                  onClick={() => {
                    setAuthMode('signup');
                    setShowAuthOverlay(true);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-slate-200 text-[10px]">
                        <i className="fas fa-user"></i>
                      </span>
                      <div className="flex flex-col leading-tight">
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Account</span>
                        <span className="text-[10px] text-slate-500">
                          Log in or create an account.
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] text-blue-600">
                      <span>Open</span>
                      <i className="fas fa-arrow-up-right-from-square"></i>
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Auth opens in a full-screen panel so you can focus without leaving the terminal.
                  </p>
                </div>
              )}
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

        {showAuthOverlay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div
              className={`w-full max-w-md mx-4 rounded-2xl shadow-xl border ${
                isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">Account</span>
                  <span className="text-sm font-bold">{authMode === 'signup' ? 'Create your MarketMinds account' : 'Welcome back'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuthOverlay(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800/70 hover:bg-slate-700 text-slate-300"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="px-5 pt-3 pb-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-500 max-w-[75%]">
                    Use a social account or email to sync your watchlist and portfolio securely.
                  </p>
                  <div className="inline-flex gap-1 text-[10px] bg-slate-900/60 px-2 py-1 rounded-full border border-slate-700">
                    <span className={`cursor-pointer ${authMode === 'login' ? 'text-blue-400 font-semibold' : 'text-slate-400'}`} onClick={() => setAuthMode('login')}>
                      Log in
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className={`cursor-pointer ${authMode === 'signup' ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`} onClick={() => setAuthMode('signup')}>
                      Sign up
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleProviderLogin('google')}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-[12px] font-medium ${
                      isDarkMode
                        ? 'bg-slate-950 border-slate-700 text-slate-100 hover:bg-slate-900'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <i className="fab fa-google text-red-500"></i>
                    Continue with Google
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleProviderLogin('facebook')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-[11px] font-medium ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-slate-100 hover:bg-slate-900'
                          : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <i className="fab fa-facebook-f text-blue-500"></i>
                      Facebook
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProviderLogin('apple')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-[11px] font-medium ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-slate-100 hover:bg-slate-900'
                          : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <i className="fab fa-apple"></i>
                      Apple
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-1">
                    <span className="flex-1 h-px bg-slate-700/60"></span>
                    <span>or use email</span>
                    <span className="flex-1 h-px bg-slate-700/60"></span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">Email</label>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={`w-full px-3 py-2 rounded-md border text-[12px] ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-600'
                          : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">Password</label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className={`w-full px-3 py-2 rounded-md border text-[12px] ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-600'
                          : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAuthSubmit}
                  disabled={authLoading || !authEmail || !authPassword}
                  className={`w-full mt-1 px-3 py-2 rounded-md text-[13px] font-semibold flex items-center justify-center gap-2 ${
                    authMode === 'signup'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  } ${authLoading || !authEmail || !authPassword ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {authLoading && <i className="fas fa-circle-notch fa-spin"></i>}
                  {authMode === 'signup' ? 'Create account' : 'Log in'}
                </button>
                {authStatus && (
                  <div className="text-[11px] text-rose-400">
                    {authStatus}
                  </div>
                )}
                {authMode === 'signup' && (
                  <p className="text-[10px] text-slate-500">
                    By creating an account you agree this is a simulated terminal for educational use only, not financial advice.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
