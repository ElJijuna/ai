import type { AICreateMonitor } from '../types/chrome-ai.js';
import type { AIFeatureName, DownloadProgress } from '../types.js';

/**
 * Adapts a friendly `onProgress` callback into the `monitor(m) { m.addEventListener(...) }`
 * shape every Chrome built-in AI `create()` call accepts.
 */
export function createDownloadMonitor(
  feature: AIFeatureName,
  onProgress?: (progress: DownloadProgress) => void,
): ((monitor: AICreateMonitor) => void) | undefined {
  if (!onProgress) {
    return undefined;
  }

  return (monitor: AICreateMonitor) => {
    monitor.addEventListener('downloadprogress', (event) => {
      onProgress({ feature, loaded: event.loaded });
    });
  };
}
