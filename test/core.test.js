import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCacheControl, parseWarning, formatCacheControl } from '../src/index.js';

test('parseCacheControl: basic directives', () => {
  const result = parseCacheControl('public, max-age=600');
  assert.deepEqual(result, { public: true, maxAge: 600 });
});

test('parseCacheControl: quoted string values are preserved', () => {
  const result = parseCacheControl('no-cache="Set-Cookie"');
  assert.deepEqual(result, { noCache: 'Set-Cookie' });
});

test('parseCacheControl: quoted strings containing commas do not break parsing', () => {
  const result = parseCacheControl('private="a, b, c"');
  assert.deepEqual(result, { private: 'a, b, c' });
});

test('parseCacheControl: quoted strings containing equals signs', () => {
  const result = parseCacheControl('no-cache="key=value"');
  assert.deepEqual(result, { noCache: 'key=value' });
});

test('parseCacheControl: last duplicate wins', () => {
  const result = parseCacheControl('max-age=300, max-age=900');
  assert.equal(result.maxAge, 900);
});

test('parseCacheControl: token without value is true', () => {
  const result = parseCacheControl('no-store');
  assert.equal(result.noStore, true);
});

test('parseCacheControl: empty or invalid input returns empty object', () => {
  assert.deepEqual(parseCacheControl(''), {});
  assert.deepEqual(parseCacheControl(null), {});
  assert.deepEqual(parseCacheControl(undefined), {});
});

test('parseCacheControl: handles extra whitespace', () => {
  const result = parseCacheControl('  public  ,   no-cache   ');
  assert.deepEqual(result, { public: true, noCache: true });
});

test('parseWarning: basic four-part warning', () => {
  const result = parseWarning('199 - "cache miss" "Wed, 21 Oct 2020 07:28:00 GMT"');
  assert.equal(result.code, 199);
  assert.equal(result.agent, '-');
  assert.equal(result.text, 'cache miss');
  assert.equal(result.date, 'Wed, 21 Oct 2020 07:28:00 GMT');
});

test('parseWarning: warning without date', () => {
  const result = parseWarning('112 - "cache is down"');
  assert.equal(result.code, 112);
  assert.equal(result.text, 'cache is down');
  assert.equal(result.date, null);
});

test('parseWarning: quoted text containing spaces', () => {
  const result = parseWarning('199 - "this has spaces"');
  assert.equal(result.text, 'this has spaces');
});

test('formatCacheControl: round-trips simple values', () => {
  const obj = { public: true, maxAge: 600 };
  const formatted = formatCacheControl(obj);
  const reparsed = parseCacheControl(formatted);
  assert.deepEqual(reparsed, obj);
});

test('formatCacheControl: quotes string values that need it', () => {
  const obj = { noCache: 'Set-Cookie' };
  const formatted = formatCacheControl(obj);
  assert.equal(formatted, 'no-cache=Set-Cookie');
});

test('formatCacheControl: quotes strings with special characters', () => {
  const obj = { private: 'a, b' };
  const formatted = formatCacheControl(obj);
  assert.equal(formatted, 'private="a, b"');
});
