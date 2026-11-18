import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCommandInput } from '../commandInput.js';

test('owner AI settings receive the same arguments with or without a space after the prefix', () => {
    for (const action of ['on', 'off', 'check']) {
        const expected = { name: 'aisetting', args: [action], text: action };
        for (const body of [`.aisetting ${action}`, `. Aisetting ${action}`,
            `  .  Aisetting\t${action}  `, `.\nAisetting\n${action}`]) {
            assert.deepEqual(parseCommandInput(body, '.'), expected);
        }
    }
});

test('parses aliases, alternate prefixes, and commands without arguments', () => {
    assert.deepEqual(parseCommandInput('! aiconfig off', '!'), {
        name: 'aiconfig', args: ['off'], text: 'off',
    });
    assert.deepEqual(parseCommandInput(' . Aisetting ', '.'), {
        name: 'aisetting', args: [], text: '',
    });
    assert.deepEqual(parseCommandInput('  :: get https://example.com/file.mp4 ', '::'), {
        name: 'get', args: ['https://example.com/file.mp4'], text: 'https://example.com/file.mp4',
    });
});

test('keeps multi-argument command input aligned with the dispatched command', () => {
    assert.deepEqual(parseCommandInput('.qc ngeteh dulu', '.'), {
        name: 'qc', args: ['ngeteh', 'dulu'], text: 'ngeteh dulu',
    });
    assert.deepEqual(parseCommandInput('. catat beli bakso 15rb', '.'), {
        name: 'catat', args: ['beli', 'bakso', '15rb'], text: 'beli bakso 15rb',
    });
});
