import test from 'node:test';
import assert from 'node:assert/strict';
import { kitRoleForItem, shulkerLabel } from './kit-matcher.js';

test('requires the requested leader kit label instead of any generic leader text', () => {
  assert.equal(kitRoleForItem({
    name: 'purple_shulker_box',
    displayName: 'Lideres kit del C.R'
  }), 'lider');
  assert.equal(kitRoleForItem({
    name: 'purple_shulker_box',
    displayName: 'Caja de Líder'
  }), undefined);
});

test('recognizes the requested leader and exact member kit names', () => {
  assert.equal(kitRoleForItem({
    name: 'purple_shulker_box',
    displayName: 'Lideres kit del C.R'
  }), 'lider');
  assert.equal(kitRoleForItem({
    name: 'blue_shulker_box',
    displayName: 'Miembro kit del C.R'
  }), 'miembro');
  assert.equal(kitRoleForItem({
    name: 'blue_shulker_box',
    displayName: 'Miembro Lideres kit del C.R'
  }), undefined);
});

test('recognizes the full m.h kit del C.R honorable label', () => {
  assert.equal(kitRoleForItem({
    name: 'red_shulker_box',
    displayName: 'm.h kit del C.R'
  }), 'miembro_honorable');
  assert.equal(kitRoleForItem({
    name: 'red_shulker_box',
    displayName: 'm.h'
  }), undefined);
  assert.equal(kitRoleForItem({
    name: 'red_shulker_box',
    displayName: 'Miembro Honorable'
  }), undefined);
});

test('classifies shulkers by custom name stored in NBT', () => {
  assert.equal(kitRoleForItem({
    name: 'red_shulker_box',
    nbt: {
      display: {
        Name: { type: 'string', value: '{"text":"m.h kit del C.R"}' }
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
