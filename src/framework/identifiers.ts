function splitIdentifierParts(value: string): string[] {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '';
}

function finalizeIdentifier(
  candidate: string,
  reservedWords: ReadonlySet<string>,
  fallback: string
): string {
  let normalized = String(candidate || '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    normalized = fallback;
  }

  if (/^\d/.test(normalized)) {
    normalized = `_${normalized}`;
  }

  if (reservedWords.has(normalized.toLowerCase())) {
    normalized = `${normalized}_`;
  }

  return normalized || fallback;
}

export function toSafeCamelIdentifier(
  value: string,
  reservedWords: ReadonlySet<string>,
  fallback = 'value'
): string {
  const parts = splitIdentifierParts(value);
  const candidate = parts.length === 0
    ? fallback
    : parts[0].toLowerCase() + parts.slice(1).map(capitalize).join('');
  return finalizeIdentifier(candidate, reservedWords, fallback);
}

export function toSafeSnakeIdentifier(
  value: string,
  reservedWords: ReadonlySet<string>,
  fallback = 'value'
): string {
  const parts = splitIdentifierParts(value).map((part) => part.toLowerCase());
  const candidate = parts.length === 0 ? fallback : parts.join('_');
  return finalizeIdentifier(candidate, reservedWords, fallback);
}

export function createUniqueIdentifierMap(
  rawValues: string[],
  normalize: (value: string) => string,
  reservedNames: Iterable<string> = []
): Map<string, string> {
  const used = new Set<string>(Array.from(reservedNames, (value) => String(value || '').trim()).filter(Boolean));
  const resolved = new Map<string, string>();

  for (const rawValue of rawValues) {
    const rawKey = String(rawValue || '');
    if (resolved.has(rawKey)) {
      continue;
    }

    let candidate = normalize(rawKey) || 'value';
    while (used.has(candidate)) {
      candidate = incrementIdentifier(candidate);
    }

    used.add(candidate);
    resolved.set(rawKey, candidate);
  }

  return resolved;
}

function incrementIdentifier(value: string): string {
  const match = value.match(/_(\d+)$/);
  if (match) {
    const nextIndex = Number(match[1]) + 1;
    return value.replace(/_(\d+)$/, `_${nextIndex}`);
  }
  return `${value}_`;
}
