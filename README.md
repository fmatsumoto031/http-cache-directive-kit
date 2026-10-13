# http-cache-directive-kit

Parses HTTP `Cache-Control` and `Warning` headers into normalized objects with quoted tokens handled correctly.

## Usage

```javascript
import { parseCacheControl, parseWarning, formatCacheControl } from 'http-cache-directive-kit';

const cc = parseCacheControl('public, max-age=600, no-cache="Set-Cookie"');
console.log(cc.noCache);   // "Set-Cookie"
console.log(cc.maxAge);   // 600
console.log(cc.public);   // true

const w = parseWarning('199 - "cache miss" "Wed, 21 Oct 2020 07:28:00 GMT"');
console.log(w.code);        // 199
console.log(w.text);        // "cache miss"
console.log(w.date);        // "Wed, 21 Oct 2020 07:28:00 GMT"

const out = formatCacheControl(cc);
console.log(out); // 'public, max-age=600, no-cache="Set-Cookie"'
```

## Why

Real-world `Cache-Control` headers contain quoted-string values (e.g., `no-cache="Set-Cookie"`), and naive `split(',')` mangles them. This library exists to parse such headers correctly per the grammar, at the cost of supporting only `Cache-Control` and `Warning` (not the entire HTTP header zoo).

## Edge Cases

- Duplicate directives: the **last** wins, mirroring the caller's final intent.
- Numeric values like `max-age` are returned as `number`; tokens without `=` become `true`.
- `Warning` parsing requires the mandatory `warn-agent` field. Use `-` if it's unknown, per the spec.

## Run Tests

```bash
PYTHONPATH=src python -m unittest discover -s tests
node --test test/
```
