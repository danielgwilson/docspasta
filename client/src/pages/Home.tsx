import { useState } from 'react';
import { CrawlerContainer } from '@/components/crawler/container';

export default function Home() {
  return (
    <div className="min-h-dvh bg-background flex flex-col justify-center items-center p-4">
      <CrawlerContainer />
    </div>
  );
}
