import test from 'node:test';
import assert from 'node:assert/strict';
import { countKitItems, kitRoleForItem, shulkerLabel } from './kit-matcher.js';
import { deliverKit } from './enderchest.js';

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

test('recognizes honorable kits labeled m.h kit del C.R, M.H, or MH', () => {
  for (const displayName of ['m.h kit del C.R', 'M.H', 'MH']) {
    assert.equal(kitRoleForItem({
      name: 'red_shulker_box',
      displayName
    }), 'miembro_honorable');
  }
  assert.equal(kitRoleForItem({
    name: 'red_shulker_box',
    displayName: 'Miembro Honorable'
  }), undefined);
});

test('ignores Minecraft color codes when matching kit names', () => {
  assert.equal(kitRoleForItem({
    name: 'purple_shulker_box',
    customName: '{"text":"§6Lideres kit del C.R","bold":true}'
  }), 'lider');
  assert.equal(kitRoleForItem({
    name: 'red_shulker_box',
    customName: '§cM.H kit del C.R'
  }), 'miembro_honorable');
});

test('reads kit names from nested Minecraft NBT and JSON text components', () => {
  assert.equal(kitRoleForItem({
    name: 'purple_shulker_box',
    customName: { text: '', extra: [{ text: 'Lideres kit del C.R', color: 'gold' }] }
  }), 'lider');
  assert.equal(kitRoleForItem({
    name: 'red_shulker_box',
    nbt: {
      value: {
        components: {
          'minecraft:custom_name': {
            type: 'compound',
            value: {
              text: { type: 'string', value: '{"text":"m.h kit del C.R","italic":false}' }
            }
          }
        }
      }
    }
  }), 'miembro_honorable');
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
    unidentified: [{ label: 'Otra caja', count: 1 }],
    totalShulkers: 5
  });
});

test('drops the carried kit at the current position after the TPA', async () => {
  const kit = { name: 'purple_shulker_box', displayName: 'Lideres kit del C.R', count: 1, slot: 36 };
  let tossCount = 0;
  const bot = {
    inventory: {
      items: () => tossCount === 0 ? [kit] : []
    },
    tossStack: async (item) => {
      assert.equal(item, kit);
      tossCount += 1;
    }
  };

  await deliverKit(bot, 'wNeofor', 'lider');
  assert.equal(tossCount, 1);
});
