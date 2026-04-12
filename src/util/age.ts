interface FormatAgeOptions {
  invalid?: string;
  future?: string;
  includeSeconds?: boolean;
  justNow?: string;
}

export function formatAgeFromTimestamp(timestamp: number, options: FormatAgeOptions = {}): string {
  const invalid = options.invalid ?? 'n/a';
  const future = options.future ?? invalid;
  const justNow = options.justNow ?? 'just now';
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return invalid;
  }
  const deltaMs = Date.now() - timestamp;
  return formatAgeFromDeltaMs(deltaMs, { ...options, invalid, future, justNow });
}

export function formatAgeFromDeltaMs(deltaMs: number, options: FormatAgeOptions = {}): string {
  const invalid = options.invalid ?? 'n/a';
  const future = options.future ?? invalid;
  const justNow = options.justNow ?? 'just now';
  if (!Number.isFinite(deltaMs)) {
    return invalid;
  }
  if (deltaMs < 0) {
    return future;
  }
  if (options.includeSeconds) {
    const seconds = Math.floor(deltaMs / 1000);
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
  }
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) {
    return justNow;
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

