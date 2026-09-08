import { vi } from "vitest";

/*
 * next/cache::revalidatePath needs a Next.js render context. In tests
 * we don't have one, so stub the whole module. Callers don't care about
 * the return value.
 */
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T>(fn: T) => fn,
}));
