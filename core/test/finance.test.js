import test from 'node:test';
import assert from 'node:assert/strict';
import { kakeiboBucket } from '../src/finance/service.js';

test('kakeibo uses explicit category', () => {
    assert.equal(kakeiboBucket({ category: 'Bakso', kakeibo_category: 'wants' }), 'wants');
    assert.equal(kakeiboBucket({ category: 'Bakso', kakeibo_category: 'needs' }), 'needs');
});

test('kakeibo falls back to keyword matching', () => {
    assert.equal(kakeiboBucket({ category: 'makan malam', kakeibo_category: null }), 'needs');
    assert.equal(kakeiboBucket({ category: 'kursus inggris', kakeibo_category: null }), 'culture');
    assert.equal(kakeiboBucket({ category: 'service laptop', kakeibo_category: null }), 'extras');
    assert.equal(kakeiboBucket({ category: 'game', kakeibo_category: null }), 'wants');
});
