import test from 'node:test';
import assert from 'node:assert/strict';
import { isAtHome, rememberHomePosition } from './home.js';

test('identifies the exact home block using floored Minecraft coordinates', () => {
  rememberHomePosition({ x: 120.2, y: 64, z: -30.8 });

  assert.equal(isAtHome({ x: 120.9, y: 64.9, z: -30.1 }), true);
  assert.equal(isAtHome({ x: 121, y: 64, z: -30 }), false);
  assert.equal(isAtHome(undefined), false);
});

test('rejects invalid home positions rather than caching an incorrect block', () => {
  assert.throws(() => rememberHomePosition(undefined), /No se pudo determinar/);
});
