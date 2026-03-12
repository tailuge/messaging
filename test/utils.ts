/**
 * Test utilities for reliable async waiting and sequencing.
 */

// Polls until condition returns true, or throws on timeout
export async function waitUntil(
  condition: () => boolean,
  timeout = 2000,
  pollInterval = 50
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitUntil timeout after ${timeout}ms`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
}

// Waits for a callback to be invoked and returns the emitted value
export async function waitFor<T>(
  subscribe: (cb: (value: T) => void) => void,
  timeout = 2000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`waitFor timeout after ${timeout}ms`)), timeout);

    subscribe((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

// Convenience: wait for a specific duration (use sparingly)
export async function wait(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
