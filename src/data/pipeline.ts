/**
 * HTTP request pipeline for Shred Scout.
 *
 * RequestPipeline wraps undici.fetch() with per-host p-queue concurrency limiting
 * (concurrency=2 per hostname) and p-retry exponential backoff (3 retries: 1s→2s→4s).
 * All HTTP calls in Phase 3 must go through this class — it is the single point of
 * concurrency and error policy.
 *
 * Retry policy:
 *   - Retries on HTTP 429 and 5xx responses
 *   - Throws AbortError (no retry) on 4xx non-429 (permanent failures)
 *   - 15s timeout per request via AbortController
 */

import PQueue from 'p-queue';
import pRetry, { AbortError } from 'p-retry';
import { fetch } from 'undici';

/** Options for constructing a RequestPipeline. */
export interface RequestPipelineOptions {
  /** Max concurrent requests per hostname. Default: 2. */
  concurrency?: number;
  /** Request timeout in milliseconds. Default: 15000. */
  timeout?: number;
  /** User-Agent header value. Default: 'shred-scout/1.0.0 (https://github.com/user/shred-scout)'. */
  userAgent?: string;
}

/**
 * Per-host rate-limited, retry-aware HTTP request pipeline.
 *
 * Create one instance and pass it to all scraper functions.
 * Internally maintains one PQueue per unique hostname.
 */
export class RequestPipeline {
  private readonly queues = new Map<string, PQueue>();
  readonly userAgent: string;
  readonly timeout: number;
  readonly concurrency: number;

  constructor(opts: RequestPipelineOptions = {}) {
    this.concurrency = opts.concurrency ?? 2;
    this.timeout = opts.timeout ?? 15_000;
    this.userAgent =
      opts.userAgent ??
      'shred-scout/1.0.0 (https://github.com/user/shred-scout)';
  }

  private getQueue(hostname: string): PQueue {
    let queue = this.queues.get(hostname);
    if (!queue) {
      queue = new PQueue({ concurrency: this.concurrency });
      this.queues.set(hostname, queue);
    }
    return queue;
  }

  /**
   * Fetch a URL through the per-host queue with automatic retry on transient errors.
   *
   * @throws AbortError on permanent 4xx errors (except 429)
   * @throws Error after 3 failed retries on 429/5xx
   */
  async fetch(url: string): Promise<Response> {
    const { hostname } = new URL(url);
    const queue = this.getQueue(hostname);
    const timeout = this.timeout;
    const userAgent = this.userAgent;

    const result = await (queue.add(() =>
      pRetry(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);
          try {
            const res = await fetch(url, {
              headers: { 'User-Agent': userAgent },
              signal: controller.signal,
            });
            // Permanent 4xx (except 429) — abort retries immediately
            if (res.status >= 400 && res.status < 500 && res.status !== 429) {
              throw new AbortError(`Permanent HTTP ${res.status} from ${url}`);
            }
            if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
            return res;
          } finally {
            clearTimeout(timer);
          }
        },
        {
          retries: 3,
          minTimeout: 1_000,
          factor: 2, // 1s → 2s → 4s
          // p-retry v8 automatically stops retrying when AbortError is thrown —
          // no shouldRetry guard is needed. The throw new AbortError(...) above
          // is the real abort fence; shouldRetry is never called for AbortErrors.
        },
      ),
    ) as Promise<Response | undefined>);
    // PQueue.add() can resolve to undefined if the queue is paused/item dropped.
    if (!result) throw new Error(`Queue returned no response for ${url}`);
    return result;
  }
}
