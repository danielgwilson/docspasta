'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { useState } from 'react';

// Map of URLs to their badges
const QUICK_ACTIONS = [
  {
    name: 'Lovable',
    url: 'https://docs.lovable.dev',
    badge: { text: 'Recommended', type: 'recommended' as const },
  },
  {
    name: 'Next.js',
    url: 'https://nextjs.org/docs',
    badge: { text: 'Popular', type: 'popular' as const },
  },
  {
    name: 'Tailwind CSS',
    url: 'https://tailwindcss.com/docs',
    badge: { text: 'Popular', type: 'popular' as const },
  },
  {
    name: 'React',
    url: 'https://react.dev',
    badge: { text: 'Popular', type: 'popular' as const },
  },
  {
    name: 'TypeScript',
    url: 'https://www.typescriptlang.org/docs/',
  },
  {
    name: 'Supabase',
    url: 'https://supabase.com/docs',
  },
];

interface CrawlerFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export function CrawlerForm({ onSubmit, isLoading }: CrawlerFormProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim());
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="url">Documentation URL</Label>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            id="url"
            type="url"
            placeholder="https://docs.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !url.trim()}>
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Crawling...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Start Crawl
              </div>
            )}
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Button
            key={action.url}
            variant="outline"
            className="justify-start h-auto py-2 px-3"
            disabled={isLoading}
            onClick={() => {
              setUrl(action.url);
              onSubmit(action.url);
            }}>
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{action.name}</span>
              {action.badge && (
                <span
                  className={`text-xs ${
                    action.badge.type === 'recommended'
                      ? 'text-green-500'
                      : 'text-primary'
                  }`}>
                  {action.badge.text}
                </span>
              )}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
