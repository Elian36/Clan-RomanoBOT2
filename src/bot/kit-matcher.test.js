import test from 'node:test';
import assert from 'node:assert/strict';
import { countKitItems, kitRoleForItem, shulkerLabel } from './kit-matcher.js';

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

test('matches colored shulker item identifiers independently of inventory location', () => {
  assert.equal(kitRoleForItem({
    name: 'light_blue_shulker_box',
    displayName: 'Miembro kit del C.R'
  }), 'miembro');
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

test('counts carried shulkers by their role and reports unclassified shulkers', () => {
  const stock = countKitItems([
    { name: 'purple_shulker_box', displayName: 'Lideres kit del C.R', count: 1 },
    { name: 'blue_shulker_box', displayName: 'Miembro kit del C.R', count: 2 },
    { name: 'red_shulker_box', displayName: 'm.h kit del C.R', count: 1 },
    { name: 'black_shulker_box', displayName: 'Otra caja', count: 1 }
  ]);

  assert.deepEqual(stock, {
    counts: { lider: 1, miembro_honorable: 1, miembro: 2 },
    unidentified: [{ label: 'Otra caja', count: 1 }]
  });
});
