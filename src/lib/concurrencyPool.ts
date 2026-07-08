/**
 * Runs `worker` over `items` with at most `concurrency` in flight at once, with a
 * small delay between each dispatched batch to avoid hammering external servers.
 */
export async function runWithConcurrency<Item, Result>(
  items: Item[],
  concurrency: number,
  delayMs: number,
  worker: (item: Item, index: number) => Promise<Result>,
  onProgress?: (done: number, total: number) => void,
): Promise<Result[]> {
  const results: Result[] = new Array(items.length)
  let cursor = 0
  let completed = 0

  async function runNext(): Promise<void> {
    const index = cursor++
    if (index >= items.length) return
    if (index > 0 && index % concurrency === 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    results[index] = await worker(items[index], index)
    completed += 1
    onProgress?.(completed, items.length)
    await runNext()
  }

  const runners = Array.from({length: Math.min(concurrency, items.length)}, () => runNext())
  await Promise.all(runners)

  return results
}
