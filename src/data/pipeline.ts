/**
 * HTTP request pipeline for Shred Scout.
 *
 * RequestPipeline wraps undici.fetch() with per-host p-queue concurrency limiting and a
 * GLOBAL minimum interval between requests. All HTTP calls must go through this class - it is
 * the single point of concurrency and error policy.
 *
 * Why the global pacing: Shopify storefronts sit behind a per-IP rate limit that trips after a
 * short burst (~6 rapid requests) and then 429s everything for a while - measured against the
 * real product endpoints. Bursting concurrent pagination across ~10 stores trips it instantly.
 * A low concurrency + a global min-interval keeps the request rate under the limit so live
 * searches actually return data (a browser User-Agent is sent as defense-in-depth).
 *
 * Retry policy:
 *   - Retries on HTTP 5xx responses (3 retries: 1s→2s→4s)
 *   - Does NOT retry HTTP 429: once the per-IP limit is tripped it persists, so retrying just
 *     hammers it and prolongs the block. 429 aborts immediately and the store is skipped.
 *   - Throws AbortError (no retry) on all other 4xx (permanent failures)
 *   - 15s timeout per request via AbortController
 */

import PQueue from 'p-queue';
import pRetry, { AbortError } from 'p-retry';
import { fetch } from 'undici';

/** Minimal request init for non-GET calls routed through the pipeline (method/headers/body only). */
export interface PipelineRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Options for constructing a RequestPipeline. */
export interface RequestPipelineOptions {
  /** Max concurrent requests per hostname. Default: 1 (gentle, avoids tripping rate limits). */
  concurrency?: number;
  /** Request timeout in milliseconds. Default: 15000. */
  timeout?: number;
  /** User-Agent header value. Defaults to a current desktop-Chrome UA. */
  userAgent?: string;
  /** Minimum milliseconds between any two requests, globally across all hosts. Default: 800. */
  minIntervalMs?: number;
}

/** A current desktop-Chrome User-Agent - Shopify storefronts serve bots far more readily as one. */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
  readonly minIntervalMs: number;
  /** Timestamp (ms) of the next free request slot - reserved up front so the gate paces
   *  requests globally even when several are awaited concurrently. */
  private nextSlot = 0;

  constructor(opts: RequestPipelineOptions = {}) {
    this.concurrency = opts.concurrency ?? 1;
    this.timeout = opts.timeout ?? 15_000;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.minIntervalMs = opts.minIntervalMs ?? 800;
  }

  private getQueue(hostname: string): PQueue {
    let queue = this.queues.get(hostname);
    if (!queue) {
      queue = new PQueue({ concurrency: this.concurrency });
      this.queues.set(hostname, queue);
    }
    return queue;
  }

  /** Global pacing gate - blocks until this request's reserved slot, keeping the cross-host
   *  request rate under the per-IP limit. Reserving the slot before awaiting means concurrent
   *  callers line up at minIntervalMs spacing rather than all firing at once. */
  private async pace(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    this.nextSlot = at + this.minIntervalMs;
    const wait = at - now;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }

  /**
   * Fetch a URL through the per-host queue with automatic retry on transient errors.
   *
   * Pass `init` for non-GET requests (e.g. a Storefront GraphQL POST) so they ALSO inherit the
   * global pacing + per-host queue - otherwise a POST path would bypass the rate-limit protection.
   * The browser User-Agent is always merged in; caller headers override it only by exact key.
   *
   * @throws AbortError on permanent 4xx errors (except 429)
   * @throws Error after 3 failed retries on 429/5xx
   */
  async fetch(url: string, init?: PipelineRequestInit): Promise<Response> {
    const { hostname } = new URL(url);
    const queue = this.getQueue(hostname);
    const timeout = this.timeout;
    const userAgent = this.userAgent;

    const result = await (queue.add(() =>
      pRetry(
        async () => {
          await this.pace();
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);
          try {
            const res = await fetch(url, {
              method: init?.method,
              body: init?.body,
              headers: { 'User-Agent': userAgent, ...(init?.headers ?? {}) },
              signal: controller.signal,
            });
            // All 4xx (including 429) abort without retry. 429 here means the per-IP rate
            // limit is already tripped - retrying only hammers it and extends the block, so
            // we bail and let the caller skip this store.
            if (res.status >= 400 && res.status < 500) {
              throw new AbortError(`HTTP ${res.status} from ${url}`);
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
          factor: 2, // 1s → 2s → 4s, for transient 5xx only
          // p-retry stops retrying when AbortError is thrown - that's the fence for 4xx/429.
        },
      ),
    ) as Promise<Response | undefined>);
    // PQueue.add() can resolve to undefined if the queue is paused/item dropped.
    if (!result) throw new Error(`Queue returned no response for ${url}`);
    return result;
  }
}
