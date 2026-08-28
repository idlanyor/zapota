import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRequest, safeSignatureEqual, signRequest } from '../src/security/hmac.js';

const request = {
    timestamp: '1785817849',
    nonce: 'random_nonce_123456',
    method: 'post',
    path: '/v1/finance/transactions?source=bot',
    body: Buffer.from('{"amount":15000}'),
};

test('creates stable canonical request and signature', () => {
    const canonical = canonicalRequest(request);
    assert.match(canonical, /^1785817849\.random_nonce_123456\.POST\./);
    const signature = signRequest('service-secret', request);
    assert.equal(signature.length, 64);
    assert.equal(signRequest('service-secret', request), signature);
});

test('compares valid signatures safely', () => {
    const signature = signRequest('service-secret', request);
    assert.equal(safeSignatureEqual(signature, signature), true);
    assert.equal(safeSignatureEqual(signature, '0'.repeat(64)), false);
    assert.equal(safeSignatureEqual(signature, 'invalid'), false);
});
