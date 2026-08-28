import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCookies } from '../src/security/session.js';

test('parses cookie header', () => {
    assert.deepEqual(parseCookies('kanata_session=abc123; theme=dark'), {
        kanata_session: 'abc123',
        theme: 'dark',
    });
});

test('parses empty cookie header', () => {
    assert.deepEqual(parseCookies(''), {});
    assert.deepEqual(parseCookies(undefined), {});
});

test('decodes url-encoded cookie values', () => {
    assert.deepEqual(parseCookies('x=a%20b'), { x: 'a b' });
});

test('ignores malformed cookie values without dropping valid cookies', () => {
    assert.deepEqual(parseCookies('bad=%E0%A4%A; theme=dark'), { theme: 'dark' });
});
