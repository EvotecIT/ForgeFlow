export type FilterMatchMode = 'substring' | 'fuzzy';

export function matchesFilter(haystack: string, needle: string, mode: FilterMatchMode): boolean {
  if (!needle) {
    return true;
  }
  const target = haystack.toLowerCase();
  const query = needle.toLowerCase();
  if (mode === 'fuzzy') {
    return isSubsequence(target, query);
  }
  return target.includes(query);
}

export function matchesFilterQuery(haystack: string, query: string, mode: FilterMatchMode): boolean {
  const parsed = parseFilterQuery(query);
  if (parsed.includes.length === 0 && parsed.excludes.length === 0) {
    return true;
  }
  for (const token of parsed.includes) {
    if (!matchesFilter(haystack, token, mode)) {
      return false;
    }
  }
  for (const token of parsed.excludes) {
    if (matchesFilter(haystack, token, mode)) {
      return false;
    }
  }
  return true;
}

function isSubsequence(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }
  let i = 0;
  let j = 0;
  while (i < haystack.length && j < needle.length) {
    if (haystack[i] === needle[j]) {
      j += 1;
    }
    i += 1;
  }
  return j === needle.length;
}

function parseFilterQuery(value: string): { includes: string[]; excludes: string[] } {
  const tokens = tokenizeFilter(value);
  const includes: string[] = [];
  const excludes: string[] = [];
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    const first = token[0];
    if (first === '-' || first === '!') {
      const cleaned = token.slice(1).trim();
      if (cleaned) {
        excludes.push(cleaned);
      }
      continue;
    }
    if (first === '+') {
      const cleaned = token.slice(1).trim();
      if (cleaned) {
        includes.push(cleaned);
      }
      continue;
    }
    includes.push(token);
  }
  return { includes, excludes };
}

function tokenizeFilter(value: string): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return [];
  }
  const tokens: string[] = [];
  const regex = /"([^"]+)"|'([^']+)'|\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const token = match[1] ?? match[2] ?? match[0];
    if (token) {
      tokens.push(token);
    }
  }
  return tokens;
}
