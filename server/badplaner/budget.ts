/** A request-wide deadline; a stage timeout never extends it. */
export interface Clock {
  now(): number;
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export class TimeoutError extends Error {
  constructor() {
    super('Request deadline exceeded');
    this.name = 'TimeoutError';
  }
}

export class Budget {
  private readonly deadline: number;
  constructor(private readonly clock: Clock, durationMs: number) {
    this.deadline = clock.now() + durationMs;
  }

  remaining(): number {
    return Math.max(0, this.deadline - this.clock.now());
  }

  async run<T>(maximumMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const duration = Math.min(maximumMs, this.remaining());
    if (duration <= 0) throw new TimeoutError();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = this.clock.setTimeout(() => {
        controller.abort();
        reject(new TimeoutError());
      }, duration);
    });
    try {
      // Racing also bounds adapters that fail to honour AbortSignal.
      return await Promise.race([work(controller.signal), expiry]);
    } finally {
      if (timer !== undefined) this.clock.clearTimeout(timer);
    }
  }
}
