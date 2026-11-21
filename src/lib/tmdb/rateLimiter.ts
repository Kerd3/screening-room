/**
 * Outbound rate limiting for TMDB.
 *
 * TokenBucket: callers `await acquire()` before each upstream request. Tokens
 * refill continuously at `ratePerSec`. When the bucket is empty, callers wait
 * in a FIFO queue instead of failing. `pauseFor()` empties the bucket and
 * blocks it, which the client uses when TMDB answers 429 with Retry-After.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  private blockedUntil = 0;
  private queue: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ratePerSec: number,
    private readonly capacity: number = ratePerSec,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  /** Stop handing out tokens for `ms` (e.g. after a 429). */
  pauseFor(ms: number) {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
    this.tokens = 0;
    this.reschedule(ms);
  }

  get pending() {
    return this.queue.length;
  }

  private refill() {
    const t = this.now();
    const elapsedSec = (t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.ratePerSec);
    this.last = t;
  }

  private drain() {
    const t = this.now();
    if (t < this.blockedUntil) {
      this.last = t; // no refill accrues while blocked
      this.reschedule(this.blockedUntil - t);
      return;
    }
    this.refill();
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      this.queue.shift()!();
    }
    if (this.queue.length > 0) {
      this.reschedule(Math.ceil(((1 - this.tokens) / this.ratePerSec) * 1000));
    }
  }

  private reschedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, Math.max(1, ms));
  }
}

export class RetryableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
  onRetry?: (attempt: number, delayMs: number, err: RetryableError) => void;
}

/**
 * Retries `fn` on RetryableError with exponential backoff and jitter. When the
 * server sent Retry-After, that wait is honored as the minimum delay.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseMs = 500, random = Math.random, onRetry } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof RetryableError) || attempt >= retries) throw err;
      const backoff = baseMs * 2 ** attempt + Math.floor(random() * 250);
      const delay = Math.max(err.retryAfterMs ?? 0, backoff);
      onRetry?.(attempt + 1, delay, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
