import { useState } from 'react';
import { CrawlerContainer } from '@/components/crawler/container';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <CrawlerContainer />
    </div>
  );
}
