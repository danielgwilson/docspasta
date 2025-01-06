import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { ToastProvider } from '@/components/ui/toast';
import { CrawlHistoryProvider } from '@/lib/context/crawl-history';
import App from '@/pages/Home';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CrawlHistoryProvider>
          <App />
          <Toaster />
        </CrawlHistoryProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>
);
