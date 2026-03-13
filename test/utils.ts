/**
 * Test utilities for reliable async waiting and sequencing.
 */

import { GenericContainer, StartedTestContainer } from "testcontainers";
import { MessagingClient } from "../src/messagingclient";

export const CONTAINER_IMAGE = "tailuge/billiards-network:latest";

let globalContainer: StartedTestContainer | null = null;
let globalServer: string | null = null;
let globalClients: MessagingClient[] = [];

export async function startContainer(): Promise<string> {
  if (globalServer) return globalServer;

  globalContainer = await new GenericContainer(CONTAINER_IMAGE)
    .withExposedPorts(8080)
    .withUser("root")
    .start();

  const port = globalContainer.getMappedPort(8080);
  globalServer = `localhost:${port}`;
  return globalServer;
}

export async function stopContainer(): Promise<void> {
  await Promise.all(globalClients.map((c) => c.stop()));
  globalClients = [];

  if (globalContainer) {
    await globalContainer.stop();
    globalContainer = null;
    globalServer = null;
  }
}

export function getServer(): string {
  if (!globalServer) throw new Error("Container not started. Call startContainer() first.");
  return globalServer;
}

export function createTestClient(): MessagingClient {
  const client = new MessagingClient({ baseUrl: getServer() });
  globalClients.push(client);
  return client;
}

export async function cleanupClients(): Promise<void> {
  await Promise.all(globalClients.map((c) => c.stop()));
  globalClients = [];
}

export async function forceCleanup(): Promise<void> {
  await cleanupClients();
  await stopContainer();
}

// Polls until condition returns true, or throws on timeout
export async function waitUntil(
  condition: () => boolean,
  timeout = 2000,
  pollInterval = 50,
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
  timeout = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`waitFor timeout after ${timeout}ms`)),
      timeout,
    );

    subscribe((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

// Convenience: wait for a specific duration (use sparingly)
export async function wait(ms = 100): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
