import test from 'node:test';
import assert from 'node:assert/strict';
import { kitRoleForItem, shulkerLabel } from './kit-matcher.js';

test('classifies colored shulkers by display name without requiring the word kit', () => {
  assert.equal(kitRoleForItem({
    name: 'purple_shulker_box',
    displayName: 'Caja de Líder'
  }), 'lider');
});

test('recognizes the requested leader and member kit names', () => {
  assert.equal(kitRoleForItem({
    name: 'purple_shulker_box',
    displayName: 'Lideres kit del C.R'
  }), 'lider');
  assert.equal(kitRoleForItem({
    name: 'blue_shulker_box',
    displayName: 'Miembro Lideres kit del C.R'
  }), 'miembro');
});

test('recognizes honorable kits by mh, m.h, and honorable name variants', () => {
  for (const displayName of [
    'm.h kit del C.R',
    'mh kit del C.R',
    'Miembro Honorable',
    'Honorable'
  ]) {
    assert.equal(kitRoleForItem({
      name: 'red_shulker_box',
      displayName
    }), 'miembro_honorable', displayName);
  }
});

test('classifies shulkers by custom name stored in NBT', () => {
  assert.equal(kitRoleForItem({
    name: 'red_shulker_box',
    nbt: {
      display: {
        Name: { type: 'string', value: '{"text":"Kit Miembro Honorable"}' }
      }
    }
  }), 'miembro_honorable');
});

test('does not classify an unmarked shulker or a non-shulker item', () => {
  assert.equal(kitRoleForItem({ name: 'black_shulker_box' }), undefined);
  assert.equal(kitRoleForItem({ name: 'diamond', displayName: 'Kit Líder' }), undefined);
});

test('returns a useful label for stock diagnostics', () => {
  assert.equal(shulkerLabel({ name: 'white_shulker_box', displayName: 'Kit Lider' }), 'Kit Lider');
});
