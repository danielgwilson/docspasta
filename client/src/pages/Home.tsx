import { useState } from 'react';
import { CrawlerContainer } from '@/components/crawler/container';
import Spline from '@splinetool/react-spline';

export default function Home() {
  return (
    <main>
      <div className="absolute inset-0 -z-10">
        <Spline scene="https://prod.spline.design/dH29XAkRKntH2D-F/scene.splinecode" />
      </div>
      <div className="min-h-dvh flex flex-col justify-center items-center p-4">
        <CrawlerContainer />
      </div>
    </main>
  );
}
