import PQueue from 'p-queue';
import { CrawlerProgress } from './types';

export class QueueManager {
  private queue: PQueue;
  private startTime: number;
  private visited = new Set<string>();
  private queued = new Set<string>();
  private errors = new Set<string>();
  private resultsCount = 0;

  constructor(concurrency: number = 3) {
    this.queue = new PQueue({ concurrency });
    this.startTime = Date.now();
  }

  public start(): void {
    this.startTime = Date.now();
    this.queue.start();
  }

  public pause(): void {
    this.queue.pause();
  }

  public clear(): void {
    this.queue.clear();
    this.cleanup();
  }

  public add<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(fn, { throwOnTimeout: true });
  }

  public get size(): number {
    return this.queue.size;
  }

  public get pending(): number {
    return this.queue.pending;
  }

  public onIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  public markVisited(url: string): void {
    this.visited.add(url);
  }

  public markQueued(url: string): void {
    this.queued.add(url);
  }

  public markError(url: string): void {
    this.errors.add(url);
  }

  public incrementResults(): void {
    this.resultsCount++;
  }

  public isVisited(url: string): boolean {
    return this.visited.has(url);
  }

  public isQueued(url: string): boolean {
    return this.queued.has(url);
  }

  public getProgress(): CrawlerProgress {
    return {
      visited: this.visited.size,
      errors: this.errors.size,
      queued: this.queue.size + this.queue.pending,
      results: this.resultsCount,
      timeElapsed: Date.now() - this.startTime,
    };
  }

  private cleanup(): void {
    this.visited.clear();
    this.queued.clear();
    this.errors.clear();
    this.resultsCount = 0;
  }
}
