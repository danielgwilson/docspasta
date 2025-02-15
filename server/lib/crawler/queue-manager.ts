/**
 * Advanced queue management system for the documentation crawler.
 * Handles concurrency, rate limiting, and efficient crawl state tracking.
 * @module QueueManager
 */

import PQueue from 'p-queue';
import { CrawlerProgress, PageNode } from './types';
import { EventEmitter } from 'events';

interface BatchStats {
  processed: number;
  errors: number;
  startTime: number;
}

export class QueueManager extends EventEmitter {
  private queue: PQueue;
  private startTime: number;
  private visited = new Set<string>();
  private queued = new Set<string>();
  private errors = new Map<string, Error>();
  private resultsCount = 0;
  private retryCount = new Map<string, number>();
  private currentBatch: BatchStats;
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_TIMEOUT = 30000; // 30s batch timeout

  constructor(
    concurrency: number = 3,
    private rateLimit: number = 1000,
    private timeout: number = 30000
  ) {
    super();
    this.queue = new PQueue({
      concurrency,
      interval: rateLimit,
      intervalCap: 1,
      timeout,
    });
    this.startTime = Date.now();
    this.currentBatch = this.createNewBatch();
    this.setupQueueEvents();
  }

  private createNewBatch(): BatchStats {
    return {
      processed: 0,
      errors: 0,
      startTime: Date.now(),
    };
  }

  private setupQueueEvents(): void {
    this.queue.on('active', () => {
      this.emit('queueUpdate', this.getProgress());
    });

    this.queue.on('idle', () => {
      // Emit batch statistics
      const batchDuration = Date.now() - this.currentBatch.startTime;
      this.emit('batchComplete', {
        ...this.currentBatch,
        duration: batchDuration,
      });
      this.currentBatch = this.createNewBatch();
      this.emit('queueIdle', this.getProgress());
    });

    this.queue.on('error', (error) => {
      this.currentBatch.errors++;
      this.emit('error', error);
    });

    // Monitor batch progress
    setInterval(() => {
      const batchAge = Date.now() - this.currentBatch.startTime;
      if (batchAge > this.BATCH_TIMEOUT) {
        this.emit('batchTimeout', this.currentBatch);
        this.currentBatch = this.createNewBatch();
      }
    }, 5000);
  }

  /**
   * Start processing the queue
   */
  public start(): void {
    this.startTime = Date.now();
    this.queue.start();
    this.emit('start', this.getProgress());
  }

  /**
   * Pause queue processing
   */
  public pause(): void {
    this.queue.pause();
    this.emit('pause', this.getProgress());
  }

  /**
   * Clear the queue and reset state
   */
  public clear(): void {
    this.queue.clear();
    this.cleanup();
    this.emit('clear');
  }

  /**
   * Add a task to the queue with retry logic and batch tracking
   */
  public async add<T>(
    fn: () => Promise<T>,
    node: PageNode
  ): Promise<T | undefined> {
    const retryableTask = async (): Promise<T> => {
      try {
        const result = await fn();
        this.currentBatch.processed++;
        this.emit('success', node.url);
        return result;
      } catch (error) {
        const retries = this.retryCount.get(node.url) || 0;
        if (this.shouldRetry(error as Error) && retries < this.MAX_RETRIES) {
          this.retryCount.set(node.url, retries + 1);
          const delay = Math.pow(2, retries) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return retryableTask();
        }
        this.currentBatch.errors++;
        this.errors.set(node.url, error as Error);
        this.emit('error', { url: node.url, error });
        throw error;
      }
    };

    return this.queue.add(() => retryableTask(), {
      throwOnTimeout: true,
    });
  }

  private shouldRetry(error: Error): boolean {
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EPIPE',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
    ];
    return retryableErrors.some((e) => error.message.includes(e));
  }

  /**
   * Track visited URLs
   */
  public markVisited(url: string): void {
    this.visited.add(url);
    this.emit('visited', url);
  }

  /**
   * Track queued URLs
   */
  public markQueued(url: string): void {
    this.queued.add(url);
    this.emit('queued', url);
  }

  /**
   * Increment successful results counter
   */
  public incrementResults(): void {
    this.resultsCount++;
    this.emit('progress', this.getProgress());
  }

  /**
   * Check if URL has been visited
   */
  public isVisited(url: string): boolean {
    return this.visited.has(url);
  }

  /**
   * Check if URL is queued
   */
  public isQueued(url: string): boolean {
    return this.queued.has(url);
  }

  /**
   * Get current queue size
   */
  public get size(): number {
    return this.queue.size;
  }

  /**
   * Get number of pending tasks
   */
  public get pending(): number {
    return this.queue.pending;
  }

  /**
   * Wait for queue to become idle
   */
  public onIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  /**
   * Get current progress metrics
   */
  public getProgress(): CrawlerProgress {
    return {
      visited: this.visited.size,
      errors: this.errors.size,
      queued: this.queue.size + this.queue.pending,
      results: this.resultsCount,
      timeElapsed: Date.now() - this.startTime,
    };
  }

  /**
   * Get current batch statistics
   */
  public getBatchStats(): BatchStats {
    return { ...this.currentBatch };
  }

  /**
   * Reset internal state
   */
  private cleanup(): void {
    this.visited.clear();
    this.queued.clear();
    this.errors.clear();
    this.retryCount.clear();
    this.resultsCount = 0;
    this.currentBatch = this.createNewBatch();
    this.emit('cleanup');
  }
}