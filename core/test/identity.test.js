import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIdentity, identityCandidates, normalizePhone } from '../src/identity/normalize.js';

test('normalizes Indonesian phone variants', () => {
    assert.equal(normalizePhone('0895-3955-90009'), '62895395590009');
    assert.equal(normalizePhone('895395590009'), '62895395590009');
    assert.equal(normalizePhone('62895395590009'), '62895395590009');
});

test('classifies canonical WhatsApp JID', () => {
    assert.deepEqual(classifyIdentity('62895395590009@s.whatsapp.net'), {
        type: 'whatsapp_jid',
        normalizedValue: '62895395590009@s.whatsapp.net',
    });
});

test('classifies WhatsApp LID without treating it as a phone', () => {
    assert.deepEqual(classifyIdentity('79444496625700@lid'), {
        type: 'whatsapp_lid',
        normalizedValue: '79444496625700@lid',
    });
});

test('phone resolution searches phone and canonical JID', () => {
    assert.deepEqual(identityCandidates('0895395590009'), [
        { type: 'phone', normalizedValue: '62895395590009' },
        { type: 'whatsapp_jid', normalizedValue: '62895395590009@s.whatsapp.net' },
    ]);
});

test('rejects malformed phone values', () => {
    assert.throws(() => normalizePhone('123'), /Invalid phone number/);
});
