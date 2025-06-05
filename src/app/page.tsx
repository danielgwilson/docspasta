'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Zap, FileText, XCircle, Copy } from 'lucide-react';
import { CrawlResults } from '@/components/CrawlResults';

const QUICK_ACTIONS = [
  {
    name: 'Lovable',
    url: 'https://docs.lovable.dev',
    badge: { text: 'Recommended', type: 'recommended' as const },
    icon: '💖'
  },
  {
    name: 'Next.js',
    url: 'https://nextjs.org/docs',
    badge: { text: 'Popular', type: 'popular' as const },
    icon: '⚡'
  },
  {
    name: 'Tailwind CSS',
    url: 'https://tailwindcss.com/docs',
    badge: { text: 'Popular', type: 'popular' as const },
    icon: '🎨'
  },
  {
    name: 'React',
    url: 'https://react.dev',
    badge: { text: 'Popular', type: 'popular' as const },
    icon: '⚛️'
  },
  {
    name: 'TypeScript',
    url: 'https://www.typescriptlang.org/docs/',
    icon: '📘'
  },
  {
    name: 'Supabase',
    url: 'https://supabase.com/docs',
    icon: '🗄️'
  },
];

interface CrawlResult {
  id: string;
  url: string;
  status: 'started' | 'processing' | 'completed' | 'error';
  markdown?: string;
  error?: string;
  progress?: {
    currentUrl: string;
    pageCount: number;
    totalPages: number;
    status: string;
  };
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (urlToSubmit: string) => {
    if (!urlToSubmit.trim()) return;
    
    // Clear previous state
    setError(null);
    setCrawlResult(null);
    setIsLoading(true);
    setUrl(urlToSubmit);
    
    try {
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlToSubmit }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to start crawl');
        return;
      }

      // Poll for results
      const crawlId = data.data.id;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout
      
      const pollStatus = async () => {
        try {
          const statusResponse = await fetch(`/api/crawl/${crawlId}`);
          const statusData = await statusResponse.json();
          
          if (statusData.success && statusData.data) {
            setCrawlResult(statusData.data);
            
            if (statusData.data.status === 'completed') {
              setIsLoading(false); // Stop loading when crawl is complete
              return;
            }
            
            if (statusData.data.status === 'error') {
              setError(statusData.data.error || 'Crawl failed');
              setIsLoading(false);
              return;
            }
          } else {
            // Handle API error response
            setError(statusData.error || 'Failed to get crawl status');
            setIsLoading(false);
            return;
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 1000);
          } else {
            setError('Crawl timed out');
            setIsLoading(false);
          }
        } catch {
          setError('Failed to check crawl status');
          setIsLoading(false);
        }
      };
      
      setTimeout(pollStatus, 1000);
      
    } catch {
      setError('Failed to start crawl');
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Copy feedback is now handled in CrawlResults component
    } catch (_err) {
      console.error('Failed to copy text:', _err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 dark:from-amber-950 dark:via-orange-950 dark:to-yellow-900">
      {/* Header */}
      <header className="border-b border-amber-200/20 bg-white/10 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-2xl">🍝</div>
            <span className="text-xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
              Docspasta
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700">
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">
              Turn any docs into LLM-ready markdown
            </span>
          </div>

          {/* Main Heading - Balanced Size */}
          <div className="space-y-4">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-gray-900 via-amber-800 to-orange-800 bg-clip-text text-transparent dark:from-gray-100 dark:via-amber-200 dark:to-orange-200">
                What docs do you
              </span>
              <br />
              <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                want to paste?
              </span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
              Zero friction docs → markdown for AI chats. Just paste a URL and get beautiful, 
              LLM-ready content in seconds.
            </p>
          </div>

          {/* Main Input */}
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300"></div>
              <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 border border-amber-200/50 shadow-xl">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(url);
                }} className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://docs.example.com"
                      className="pl-10 pr-4 py-3 text-lg border-0 bg-gray-50 dark:bg-gray-800 focus:bg-white dark:focus:bg-gray-700 rounded-xl transition-all duration-200 w-full"
                      disabled={isLoading}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !url.trim()}
                    size="lg"
                    className="px-8 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 rounded-xl font-semibold w-full sm:w-auto"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Crawling...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5" />
                        Paste It!
                      </div>
                    )}
                  </Button>
                </form>
              </div>
            </div>

            {/* Error Display - Right after input */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <XCircle className="w-5 h-5" />
                  <span className="font-medium">Error:</span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Results Display - Right after input/error */}
            {crawlResult && (
              <CrawlResults
                result={crawlResult}
                onCopyMarkdown={copyToClipboard}
              />
            )}

            {/* Quick Actions - After results */}
            {!crawlResult && !error && (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Or try these popular docs:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {QUICK_ACTIONS.map((action) => (
                    <Button
                      key={action.url}
                      variant="outline"
                      className="h-auto p-4 bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-700 border-amber-200/50 hover:border-amber-300 transition-all duration-200 group"
                      disabled={isLoading}
                      onClick={() => handleSubmit(action.url)}
                    >
                      <div className="flex flex-col items-start gap-1 w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{action.icon}</span>
                          <span className="font-medium text-sm group-hover:text-amber-700 transition-colors">
                            {action.name}
                          </span>
                        </div>
                        {action.badge && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            action.badge.type === 'recommended'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                          }`}>
                            {action.badge.text}
                          </span>
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Recent Crawls Preview (Coming Soon) */}
      <section className="container mx-auto px-4 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Your Recent Crawls
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Coming soon - your crawl history will appear here
            </p>
          </div>
          
          {/* Placeholder cards */}
          <div className="grid md:grid-cols-3 gap-6 opacity-50">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-6 border border-amber-200/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-400 rounded-lg"></div>
                  <Copy className="w-4 h-4 text-gray-400" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}