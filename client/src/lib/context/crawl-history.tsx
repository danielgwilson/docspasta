import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

const HISTORY_KEY = 'docspasta:history';

export interface HistoryEntry {
  url: string;
  title: string;
  timestamp: number;
  pageCount: number;
  isPinned?: boolean;
}

interface CrawlHistoryContextType {
  history: HistoryEntry[];
  addEntry: (url: string, title: string, pageCount: number) => void;
  togglePin: (url: string) => void;
  removeEntry: (url: string) => void;
  clearHistory: () => void;
  recentHistory: HistoryEntry[];
  pinnedHistory: HistoryEntry[];
}

const CrawlHistoryContext = createContext<CrawlHistoryContextType | undefined>(
  undefined
);

// Helper to safely parse history from localStorage
const loadHistoryFromStorage = (): HistoryEntry[] => {
  try {
    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (!savedHistory) return [];
    const parsed = JSON.parse(savedHistory);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse history:', error);
    return [];
  }
};

// Helper to safely save history to localStorage
const saveHistoryToStorage = (history: HistoryEntry[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save history:', error);
  }
};

export function CrawlHistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const loaded = loadHistoryFromStorage();
    console.log('Initial history loaded:', loaded.length, 'items');
    return loaded;
  });

  useEffect(() => {
    console.log('Saving history:', history.length, 'items');
    saveHistoryToStorage(history);
  }, [history]);

  const addEntry = useCallback(
    (url: string, title: string, pageCount: number) => {
      console.log('Adding history entry:', { url, title, pageCount });
      setHistory((prev) => {
        const filtered = prev.filter((entry) => entry.url !== url);
        const wasPinned = prev.find((entry) => entry.url === url)?.isPinned;

        return [
          {
            url,
            title,
            pageCount,
            timestamp: Date.now(),
            isPinned: wasPinned ?? false,
          },
          ...filtered,
        ];
      });
    },
    []
  );

  const togglePin = useCallback((url: string) => {
    setHistory((prev) =>
      prev.map((entry) =>
        entry.url === url ? { ...entry, isPinned: !entry.isPinned } : entry
      )
    );
  }, []);

  const removeEntry = useCallback((url: string) => {
    setHistory((prev) => prev.filter((entry) => entry.url !== url));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const pinnedHistory = history.filter((entry) => entry.isPinned);
  const unpinnedHistory = history.filter((entry) => !entry.isPinned);
  const recentHistory = unpinnedHistory.slice(0, 6);

  return (
    <CrawlHistoryContext.Provider
      value={{
        history,
        addEntry,
        togglePin,
        removeEntry,
        clearHistory,
        recentHistory,
        pinnedHistory,
      }}>
      {children}
    </CrawlHistoryContext.Provider>
  );
}

export function useCrawlHistory() {
  const context = useContext(CrawlHistoryContext);
  if (!context) {
    throw new Error('useCrawlHistory must be used within CrawlHistoryProvider');
  }
  return context;
}
