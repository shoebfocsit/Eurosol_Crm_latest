/**
 * Retry wrapper for React.lazy dynamic imports.
 *
 * After a fresh deploy, old hashed chunks no longer exist on the server.
 * If the browser still runs an older index.html (HTTP/SW cache), the chunk
 * fetch 404s with "Failed to fetch dynamically imported module".
 * In that case reload once to get the fresh index.html, then load normally.
 */
export function lazyRetry<T>(importFn: () => Promise<T>, key?: string): () => Promise<T> {
  return () => {
    const flag = `chunk-reloaded:${key || 'app'}`;
    return importFn().catch((err) => {
      const isChunkError =
        err instanceof TypeError ||
        /dynamically imported module|Loading chunk|ChunkLoadError/i.test(String(err?.message || err));
      if (isChunkError && !sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, '1');
        window.location.reload();
        // Return a never-resolving promise while the reload happens.
        return new Promise<T>(() => {});
      }
      throw err;
    });
  };
}
