'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCrawlHistory } from '@/lib/context/crawl-history';
import { Pin } from 'lucide-react';

interface HistoryGridProps {
  onSelect?: (url: string) => void;
}

export function HistoryGrid({ onSelect }: HistoryGridProps) {
  const { recentHistory, pinnedHistory, togglePin } = useCrawlHistory();

  if (recentHistory.length === 0 && pinnedHistory.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Label>History</Label>
        <span className="text-xs text-muted-foreground">
          {recentHistory.length + pinnedHistory.length} items
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[...pinnedHistory, ...recentHistory].map((entry) => (
          <Button
            key={entry.url}
            variant="outline"
            className="justify-start h-auto py-2 px-3 relative group"
            onClick={() => onSelect?.(entry.url)}>
            <div className="flex flex-col items-start gap-0.5 truncate w-full pr-6">
              <span className="font-medium truncate">{entry.title}</span>
              <span className="text-xs text-muted-foreground truncate">
                {entry.pageCount} pages
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePin(entry.url);
              }}
              className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Pin
                className={`h-4 w-4 ${
                  entry.isPinned
                    ? 'text-primary fill-current'
                    : 'text-muted-foreground'
                }`}
              />
            </button>
          </Button>
        ))}
      </div>
    </div>
  );
}
