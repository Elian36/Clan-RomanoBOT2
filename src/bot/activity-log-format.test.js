import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCommandHistoryEntry } from './activity-log-format.js';

test('formats command history with UTC time, role, command, and coordinates', () => {
  assert.equal(formatCommandHistoryEntry({
    created_at: '2026-10-08T20:00:00.000Z',
    role: 'miembro_honorable',
    command: '%kit',
    x: 120,
    y: 64,
    z: -32
  }), '2026-10-08 20:00:00 UTC | miembro_honorable | %kit | 120,64,-32');
});

test('reports missing coordinates and keeps chat output bounded', () => {
  const entry = formatCommandHistoryEntry({
    created_at: '2026-10-08T20:00:00.000Z',
    role: 'miembro',
    command: `%${'x'.repeat(150)}`,
    x: null,
    y: null,
    z: null
  });

  assert.match(entry, /sin coordenadas$/);
  assert.ok(entry.length < 256);
});

test('rejects invalid timestamps instead of showing misleading activity dates', () => {
  assert.throws(() => formatCommandHistoryEntry({
    created_at: 'not-a-date',
    role: 'miembro',
    command: '%kit',
    x: null,
    y: null,
    z: null
  }), /fecha no válida/);
});
