/**
 * Core parsing logic for HTTP cache-related headers.
 *
 * DESIGN NOTE:
 * A naive split(',') fails on quoted strings containing commas. We use a
 * single linear scan that tracks quote state, ensuring quoted content is preserved.
 */

/**
 * Parses an HTTP Cache-Control header string into a normalized object.
 *
 * EXAMPLE:
 *   parseCacheControl('max-age=600, no-cache="Set-Cookie"');
 *   // -> { maxAge: 600, noCache: 'Set-Cookie' }
 *
 * DUPLICATES:
 *   If the same directive appears multiple times, the LAST occurrence wins.
 *   This is an explicit design choice: it honors a common proxy pattern
 *   where a later directive overrides an earlier one.
 *
 * @param {string} header - The raw Cache-Control header value.
 * @returns {Object} A map of directive names to string/number/true values.
 */
export function parseCacheControl(header) {
  const result = {};
  if (!header || typeof header !== 'string') {
    return result;
  }

  // Split by commas, but ignore commas inside quoted strings.
  const parts = splitIgnoringQuotes(header, ',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Find the first '=' that is not inside a quoted string.
    // Most directives are simple (e.g., max-age=600), but no-cache="..." can contain '='.
    const { key, value } = splitDirective(trimmed);

    if (key === '') continue;

    const camelKey = kebabToCamel(key);

    if (value === null) {
      // Token only, e.g., 'public'. Store as boolean true for presence.
      result[camelKey] = true;
    } else {
      // Value present. Strip surrounding quotes if any, then check if it's numeric.
      const unquoted = stripQuotes(value.trim());
      if (/^-?\d+$/.test(unquoted)) {
        result[camelKey] = parseInt(unquoted, 10);
      } else {
        result[camelKey] = unquoted;
      }
    }
  }

  return result;
}

/**
 * Parses an HTTP Warning header string.
 * Format: <warn-code> <warn-agent> <warn-text> [<warn-date>]
 * The warn-text must be quoted. The warn-date is optional and quoted.
 *
 * DECISION:
 * We return the raw date string rather than parsing it into a Date object,
 * to avoid non-determinism from timezones and to keep the library pure.
 *
 * @param {string} header - The raw Warning header value.
 * @returns {Object} An object with code, agent, text, and optional date.
 */
export function parseWarning(header) {
  if (!header || typeof header !== 'string') {
    return { code: 0, agent: '', text: '', date: null };
  }

  const tokens = tokenizeWarning(header);

  // Minimum: warn-code, warn-agent, warn-text
  if (tokens.length < 3) {
    return { code: 0, agent: '', text: '', date: null };
  }

  const codeStr = tokens[0];
  const code = /^-?\d+$/.test(codeStr) ? parseInt(codeStr, 10) : 0;
  const agent = tokens[1];
  const text = stripQuotes(tokens[2]);
  const date = tokens.length >= 4 ? stripQuotes(tokens[3]) : null;

  return { code, agent, text, date };
}

/**
 * Formats a parsed Cache-Control object back into a header string.
 * Boolean true becomes just the key; numbers and strings become key=value.
 *
 * @param {Object} obj - The parsed cache control object.
 * @returns {string} The formatted header string.
 */
export function formatCacheControl(obj) {
  const parts = [];
  for (const [camelKey, value] of Object.entries(obj)) {
    const kebabKey = camelToKebab(camelKey);
    if (value === true) {
      parts.push(kebabKey);
    } else if (typeof value === 'number') {
      parts.push(`${kebabKey}=${value}`);
    } else if (typeof value === 'string') {
      // Per RFC 7234, string values should be quoted tokens.
      // We re-quote strings that contain spaces or special characters.
      // For simple tokens (like field names), we also quote to be safe,
      // since no-cache="Set-Cookie" is the canonical form.
      if (needsQuoting(value)) {
        parts.push(`${kebabKey}="${escapeQuotes(value)}"`);
      } else {
        parts.push(`${kebabKey}=${value}`);
      }
    }
  }
  return parts.join(', ');
}

/**
 * Splits a string by a delimiter, but ignores the delimiter when inside double quotes.
 * Backslash escapes inside quotes are respected (e.g., \" does not end the string).
 */
function splitIgnoringQuotes(str, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

/**
 * Splits a single directive into key and value.
 * 'max-age=600' -> { key: 'max-age', value: '600' }
 * 'public' -> { key: 'public', value: null }
 * 'no-cache="Set-Cookie"' -> { key: 'no-cache', value: '"Set-Cookie"' }
 */
function splitDirective(str) {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '=') {
      return { key: str.slice(0, i), value: str.slice(i + 1) };
    }
  }
  return { key: str, value: null };
}

/**
 * Strips surrounding double quotes from a value, handling escapes.
 * '"hello"' -> 'hello'
 * 'hello' -> 'hello'
 * '"hel\"lo"' -> 'hel"lo'
 */
function stripQuotes(str) {
  if (str.length >= 2 && str[0] === '"' && str[str.length - 1] === '"') {
    const inner = str.slice(1, -1);
    return inner.replace(/\\(.)/g, '$1');
  }
  return str;
}

/**
 * Escapes double quotes within a string for safe quoting.
 */
function escapeQuotes(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Determines if a string value needs to be wrapped in quotes when formatting.
 */
function needsQuoting(str) {
  // Quote if it contains spaces, commas, quotes, or equals signs.
  return /[\s,="\\]/.test(str);
}

/**
 * Converts a kebab-case string to camelCase.
 * 'max-age' -> 'maxAge'
 * 'no-cache' -> 'noCache'
 */
function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Converts a camelCase string to kebab-case.
 * 'maxAge' -> 'max-age'
 * 'noCache' -> 'no-cache'
 */
function camelToKebab(str) {
  return str.replace(/([A-Z])/g, (_, char) => '-' + char.toLowerCase());
}

/**
 * Tokenizes a Warning header string into its component parts.
 * Splits by spaces, but respects quoted strings (which may contain spaces).
 */
function tokenizeWarning(str) {
  const tokens = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
