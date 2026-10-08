import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discardEnderChestGarbage,
  moveAllKitsToSingleChest,
  restockKits
} from './enderchest.js';

function createWindow(containerSize) {
  const window = {
    inventoryStart: containerSize,
    inventoryEnd: containerSize + 36,
    slots: new Array(containerSize + 36).fill(null),
    firstEmptySlotRange(start, end) {
      for (let slot = start; slot < end; slot += 1) {
        if (!this.slots[slot]) return slot;
      }
      return null;
    }
  };
  return window;
}

function createBot({ enderChest, chests = [] }) {
  const blocks = chests.map(({ name = 'chest', window, x = 1 }) => {
    const block = { name, position: { x, y: 64, z: 0 } };
    block.window = window;
    return block;
  });
  const enderBlock = { name: 'ender_chest', window: enderChest, position: { x: 0, y: 64, z: 0 } };
  const inventory = { inventoryStart: 9, inventoryEnd: 45, slots: new Array(46).fill(null) };
  const bot = {
    inventory: {
      ...inventory,
      items() {
        return this.slots.flatMap((item, slot) => item ? [{ ...item, slot }] : []);
      }
    },
    currentWindow: null,
    entity: {
      position: {
        x: 0,
        y: 64,
        z: 0,
        clone() {
          return { x: this.x, y: this.y, z: this.z };
        }
      }
    },
    pathfinder: { async goto() {} },
    findBlock({ matching }) {
      return matching(enderBlock) ? enderBlock : null;
    },
    findBlocks() {
      return blocks.map((block) => block.position);
    },
    blockAt(position) {
      return blocks.find((block) => block.position === position);
    },
    async openContainer(block) {
      this.currentWindow = block.window;
      for (let slot = this.inventory.inventoryStart; slot < this.inventory.inventoryEnd; slot += 1) {
        const windowSlot = block.window.inventoryStart + slot - this.inventory.inventoryStart;
        block.window.slots[windowSlot] = this.inventory.slots[slot]
          ? { ...this.inventory.slots[slot] }
          : null;
      }
      return block.window;
    },
    async closeWindow(window) {
      assert.equal(this.currentWindow, window);
      this.currentWindow = null;
    },
    async moveSlotItem(sourceSlot, destinationSlot) {
      const window = this.currentWindow;
      const item = window.slots[sourceSlot];
      assert.ok(item, `expected item in slot ${sourceSlot}`);
      assert.equal(window.slots[destinationSlot], null);
      window.slots[sourceSlot] = null;
      window.slots[destinationSlot] = item;

      if (sourceSlot >= window.inventoryStart) {
        const inventorySlot = sourceSlot - window.inventoryStart + this.inventory.inventoryStart;
        this.inventory.slots[inventorySlot] = null;
      }
      if (destinationSlot >= window.inventoryStart) {
        const inventorySlot = destinationSlot - window.inventoryStart + this.inventory.inventoryStart;
        this.inventory.slots[inventorySlot] = { ...item };
      }
    },
    async tossStack(item) {
      this.inventory.slots[item.slot] = null;
    }
  };

  for (const block of [...blocks, enderBlock]) {
    block.window.slots.forEach((item, slot) => {
      if (item && slot >= block.window.inventoryStart) {
        const inventorySlot = slot - block.window.inventoryStart + bot.inventory.inventoryStart;
        bot.inventory.slots[inventorySlot] = { ...item };
      }
    });
  }
  return bot;
}

function kit(name) {
  return { name: 'purple_shulker_box', displayName: name, count: 1 };
}

test('restock moves kits from only a double chest to ender storage', async () => {
  const source = createWindow(54);
  source.slots[0] = kit('Lideres kit del C.R');
  const ender = createWindow(27);
  const bot = createBot({ enderChest: ender, chests: [{ window: source }] });

  const result = await restockKits(bot);

  assert.equal(result.stored, 1);
  assert.equal(result.sourceRemaining, 0);
  assert.equal(ender.slots[0].displayName, 'Lideres kit del C.R');
  assert.equal(source.slots[0], null);
});

test('restock returns overflow kits to their source double chest', async () => {
  const source = createWindow(54);
  source.slots[0] = kit('Miembro kit del C.R');
  const ender = createWindow(27);
  ender.slots.fill({ name: 'stone', count: 64 }, 0, 27);
  const bot = createBot({ enderChest: ender, chests: [{ window: source }] });

  const result = await restockKits(bot);

  assert.equal(result.stored, 0);
  assert.equal(result.returned, 1);
  assert.equal(result.remaining, 0);
  assert.equal(source.slots[0].displayName, 'Miembro kit del C.R');
});

test('clean A moves ender kits to a simple chest without moving other items', async () => {
  const ender = createWindow(27);
  ender.slots[0] = kit('m.h kit del C.R');
  ender.slots[1] = { name: 'stone', count: 64 };
  const destination = createWindow(27);
  const bot = createBot({ enderChest: ender, chests: [{ window: destination }] });

  const moved = await moveAllKitsToSingleChest(bot);

  assert.equal(moved, 1);
  assert.equal(ender.slots[0], null);
  assert.equal(ender.slots[1].name, 'stone');
  assert.equal(destination.slots[0].displayName, 'm.h kit del C.R');
});

test('clean A moves every kit and only opens the selected chest once for inspection and once for transfer', async () => {
  const ender = createWindow(27);
  ender.slots[0] = kit('m.h kit del C.R');
  ender.slots[1] = kit('M.H');
  ender.slots[2] = kit('MH');
  const destination = createWindow(27);
  const bot = createBot({ enderChest: ender, chests: [{ window: destination }] });
  const openCounts = new Map();
  const openContainer = bot.openContainer.bind(bot);
  bot.openContainer = async (block) => {
    openCounts.set(block.window, (openCounts.get(block.window) ?? 0) + 1);
    return openContainer(block);
  };

  const moved = await moveAllKitsToSingleChest(bot);

  assert.equal(moved, 3);
  assert.equal(ender.slots.slice(0, 3).filter(Boolean).length, 0);
  assert.deepEqual(destination.slots.slice(0, 3).map((item) => item.displayName), [
    'm.h kit del C.R',
    'M.H',
    'MH'
  ]);
  assert.equal(openCounts.get(destination), 2);
  assert.equal(openCounts.get(ender), 2);
});

test('clean A does not remove kits when no nearby simple chest has enough free slots', async () => {
  const ender = createWindow(27);
  ender.slots[0] = kit('Lideres kit del C.R');
  const destination = createWindow(27);
  destination.slots.fill({ name: 'stone', count: 64 }, 0, 27);
  const bot = createBot({ enderChest: ender, chests: [{ window: destination }] });

  await assert.rejects(moveAllKitsToSingleChest(bot), /más espacio/);
  assert.equal(ender.slots[0].displayName, 'Lideres kit del C.R');
});

test('clean B drops non-kit items and leaves recognized kits in the ender chest', async () => {
  const ender = createWindow(27);
  ender.slots[0] = { name: 'stone', count: 64 };
  ender.slots[1] = kit('Miembro kit del C.R');
  const bot = createBot({ enderChest: ender });
  let movedDistance = false;
  bot.pathfinder.goto = async (goal) => {
    movedDistance = goal.x === 32;
  };

  const tossed = await discardEnderChestGarbage(bot);

  assert.equal(tossed, 1);
  assert.equal(movedDistance, true);
  assert.equal(ender.slots[0], null);
  assert.equal(ender.slots[1].displayName, 'Miembro kit del C.R');
});
