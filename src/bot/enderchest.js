import { ROLES } from './permissions.js';
import { countKitItems, kitRoleForItem, isShulker, shulkerLabel } from './kit-matcher.js';
import pathfinderPlugin from 'mineflayer-pathfinder';

let enderChestQueue = Promise.resolve();
const { goals } = pathfinderPlugin;

function findEnderChest(bot) {
  const block = bot.findBlock({
    matching: (candidate) => candidate.name === 'ender_chest',
    maxDistance: 32
  });
  if (!block) {
    throw new Error('No se encontró un Ender Chest a 32 bloques o menos.');
  }
  return block;
}

async function openEnderChest(bot) {
  const block = findEnderChest(bot);
  return bot.openContainer(block);
}

function containerItems(window) {
  const end = window.inventoryStart ?? 27;
  return window.slots.slice(0, end).flatMap((item, slot) => item ? [{ item, slot }] : []);
}

function itemCountForRole(items, role) {
  return items
    .filter((item) => kitRoleForItem(item) === role)
    .reduce((count, item) => count + (item.count ?? 1), 0);
}

function isSingleChest(bot, block) {
  const chestType = block.getProperties?.().type;
  if (chestType) return chestType === 'single';

  const { x, y, z } = block.position;
  return ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetZ]) => {
    const neighbor = bot.blockAt({ x: x + offsetX, y, z: z + offsetZ });
    return neighbor?.name === block.name;
  });
}

async function withContainer(bot, block, action) {
  const window = await bot.openContainer(block);
  try {
    return await action(window);
  } finally {
    if (bot.currentWindow) {
      await bot.closeWindow(bot.currentWindow);
    }
  }
}

async function findNearbyChest(bot, { radius, fallbackRadius = radius, slotCount, description, requiredSlots = 0 }) {
  const failures = [];
  let largestAvailableSlotCount = 0;
  let foundMatchingChest = false;
  const checkedPositions = new Set();

  for (const searchRadius of [...new Set([radius, fallbackRadius])]) {
    const positions = bot.findBlocks({
      matching: (block) => block.name === 'chest' || block.name === 'trapped_chest',
      maxDistance: searchRadius,
      count: 100
    });

    for (const position of positions) {
      const key = `${position.x},${position.y},${position.z}`;
      if (checkedPositions.has(key)) continue;
      checkedPositions.add(key);

      const block = bot.blockAt(position);
      if (!block || (block.name !== 'chest' && block.name !== 'trapped_chest')) {
        continue;
      }
      if (slotCount === 27 && !isSingleChest(bot, block)) {
        continue;
      }
      try {
        const capacity = await withContainer(bot, block, (window) => {
          if (window.inventoryStart !== slotCount) return null;
          const freeSlots = Array.from({ length: window.inventoryStart }, (_, slot) => slot)
            .filter((slot) => !window.slots[slot]).length;
          return { block, freeSlots };
        });
        if (capacity) {
          foundMatchingChest = true;
          largestAvailableSlotCount = Math.max(largestAvailableSlotCount, capacity.freeSlots);
          if (capacity.freeSlots >= requiredSlots) return capacity;
        }
      } catch (error) {
        failures.push(error.message);
      }
    }
  }

  const capacityDetails = foundMatchingChest && requiredSlots
    ? ` El cofre simple con más espacio tiene ${largestAvailableSlotCount} slots libres y se necesitan ${requiredSlots}.`
    : '';
  const failureDetails = failures.length ? ` Algunos cofres no se pudieron inspeccionar: ${failures.slice(0, 2).join('; ')}.` : '';
  throw new Error(`No se encontró un ${description} accesible a ${fallbackRadius} bloques o menos con espacio suficiente.${capacityDetails}${failureDetails}`);
}

async function moveContainerKitsToInventory(bot, window) {
  let moved = 0;
  while (true) {
    const source = containerItems(window).find(({ item }) => kitRoleForItem(item));
    if (!source) return moved;

    if (window.firstEmptySlotRange(window.inventoryStart, window.inventoryEnd) === null) {
      return moved;
    }
    const role = kitRoleForItem(source.item);
    const inventoryCount = itemCountForRole(window.slots.slice(window.inventoryStart, window.inventoryEnd), role);
    await bot.putAway(source.slot);
    const remainingSource = window.slots[source.slot];
    const updatedInventoryCount = itemCountForRole(window.slots.slice(window.inventoryStart, window.inventoryEnd), role);
    if (remainingSource || updatedInventoryCount < inventoryCount + (source.item.count ?? 1)) {
      throw new Error(`El servidor no confirmó el traslado de ${shulkerLabel(source.item)} al inventario.`);
    }
    moved += 1;
  }
}

async function moveInventoryKitsToContainer(bot, window) {
  let moved = 0;
  while (true) {
    const source = window.slots
      .slice(window.inventoryStart, window.inventoryEnd)
      .find((item) => item && kitRoleForItem(item));
    if (!source) return moved;

    if (window.firstEmptySlotRange(0, window.inventoryStart) === null) {
      return moved;
    }
    const role = kitRoleForItem(source);
    const containerCount = itemCountForRole(window.slots.slice(0, window.inventoryStart), role);
    const sourceSlot = window.slots.indexOf(source, window.inventoryStart);
    await bot.putAway(sourceSlot);
    const remainingInventoryItem = window.slots[sourceSlot];
    const updatedContainerCount = itemCountForRole(window.slots.slice(0, window.inventoryStart), role);
    if (remainingInventoryItem || updatedContainerCount < containerCount + (source.count ?? 1)) {
      throw new Error(`El servidor no confirmó que ${shulkerLabel(source)} llegara al cofre simple.`);
    }
    moved += 1;
  }
}

function carriedKitSlots(bot) {
  return bot.inventory.items()
    .filter((item) => kitRoleForItem(item))
    .map((item) => item.slot);
}

function findCarriedKit(bot, role) {
  return bot.inventory.items().find((item) => kitRoleForItem(item) === role);
}

async function waitForCarriedKit(bot, role) {
  const deadline = Date.now() + 5000;
  let item;
  while (!item && Date.now() < deadline) {
    item = findCarriedKit(bot, role);
    if (!item) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return item;
}

function countCarriedKits(bot, role) {
  return bot.inventory.items()
    .filter((item) => kitRoleForItem(item) === role)
    .reduce((count, item) => count + item.count, 0);
}

async function waitForKitDrop(bot, role, expectedCount) {
  const deadline = Date.now() + 5000;
  let countReachedAt;
  while (Date.now() < deadline) {
    if (countCarriedKits(bot, role) <= expectedCount) {
      countReachedAt ??= Date.now();
      if (Date.now() - countReachedAt >= 100) {
        return;
      }
    } else {
      countReachedAt = undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('El servidor no confirmó que la shulker saliera del inventario; no se confirmó la entrega.');
}

export async function withEnderChest(bot, action) {
  const previousOperation = enderChestQueue;
  let release;
  enderChestQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previousOperation;
  try {
    const window = await openEnderChest(bot);
    try {
      return await action(window);
    } finally {
      if (bot.currentWindow) {
        await bot.closeWindow(bot.currentWindow);
      }
    }
  } finally {
    release();
  }
}

export async function countKits(bot) {
  return withEnderChest(bot, (window) => {
    const carriedItems = bot.inventory.items();
    const storedItems = containerItems(window).map(({ item }) => item);
    return {
      ...countKitItems([...carriedItems, ...storedItems]),
      carriedShulkers: countKitItems(carriedItems).totalShulkers,
      enderChestShulkers: countKitItems(storedItems).totalShulkers,
      enderChestSlots: window.inventoryStart ?? storedItems.length
    };
  });
}

export async function prepareKit(bot, role) {
  const carriedKit = findCarriedKit(bot, role);
  if (carriedKit) {
    return carriedKit;
  }

  await withEnderChest(bot, async (window) => {
    const items = containerItems(window);
    const candidate = items.find(({ item }) => kitRoleForItem(item) === role);
    if (!candidate) {
      const shulkers = items.filter(({ item }) => isShulker(item)).map(({ item }) => shulkerLabel(item));
      const details = shulkers.length ? ` Shulkers encontradas: ${shulkers.join(', ')}.` : '';
      throw new Error(`No se encontró una shulker identificada para el rol ${role}.${details}`);
    }

    const destinationSlot = window.firstEmptySlotRange(window.inventoryStart, window.inventoryEnd);
    if (destinationSlot === null) {
      throw new Error('El inventario del bot está lleno; no se retiró la shulker del Ender Chest.');
    }
    await bot.moveSlotItem(candidate.slot, destinationSlot);
  });

  const inventoryItem = await waitForCarriedKit(bot, role);
  if (!inventoryItem) {
    const carriedShulkers = bot.inventory.items()
      .filter((item) => isShulker(item))
      .map((item) => shulkerLabel(item));
    const details = carriedShulkers.length ? ` Shulkers en inventario: ${carriedShulkers.join(', ')}.` : '';
    throw new Error(`Se hizo clic en la shulker, pero el inventario no confirmó una caja del rol ${role}.${details}`);
  }
  return inventoryItem;
}

export async function deliverKit(bot, username, role) {
  const item = await waitForCarriedKit(bot, role);
  if (!item) {
    throw new Error(`El bot llegó junto a ${username}, pero ya no tiene la shulker de rol ${role} en el inventario.`);
  }
  const countBeforeDrop = countCarriedKits(bot, role);
  console.log(`TPA completado para ${username}; soltando ${shulkerLabel(item)} en la posición actual.`);
  await bot.look(bot.entity.yaw, Math.PI / 2, true);
  await bot.tossStack(item);
  await waitForKitDrop(bot, role, countBeforeDrop - item.count);
}

export async function restockKits(bot) {
  const { block: sourceChest } = await findNearbyChest(bot, {
    radius: 3,
    fallbackRadius: 5,
    slotCount: 54,
    description: 'cofre doble'
  });

  const collected = await withContainer(bot, sourceChest, (window) => moveContainerKitsToInventory(bot, window));
  let stored;
  try {
    stored = await withEnderChest(bot, (window) => moveInventoryKitsToContainer(bot, window));
  } catch (error) {
    try {
      await withContainer(bot, sourceChest, (window) => moveInventoryKitsToContainer(bot, window));
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], 'Falló el restock y tampoco se pudieron devolver los kits al cofre doble.');
    }
    throw error;
  }
  let returned = 0;

  if (bot.inventory.items().some((item) => kitRoleForItem(item))) {
    returned = await withContainer(bot, sourceChest, (window) => moveInventoryKitsToContainer(bot, window));
  }

  const remaining = bot.inventory.items()
    .filter((item) => kitRoleForItem(item))
    .reduce((sum, item) => sum + item.count, 0);
  const sourceRemaining = await withContainer(bot, sourceChest, (window) => (
    containerItems(window)
      .filter(({ item }) => kitRoleForItem(item))
      .reduce((sum, { item }) => sum + item.count, 0)
  ));
  return { collected, stored, returned, remaining, sourceRemaining };
}

export async function moveAllKitsToSingleChest(bot) {
  const carriedSlots = carriedKitSlots(bot);

  const requiredSlots = await withEnderChest(bot, (window) => {
    const enderKits = containerItems(window).filter(({ item }) => kitRoleForItem(item));
    const freeInventorySlots = window.firstEmptySlotRange(window.inventoryStart, window.inventoryEnd) === null
      ? 0
      : Array.from({ length: window.inventoryEnd - window.inventoryStart }, (_, index) => window.inventoryStart + index)
        .filter((slot) => !window.slots[slot]).length;
    if (freeInventorySlots < enderKits.length) {
      throw new Error('No hay espacio suficiente en el inventario para sacar todos los kits del Ender Chest; no se movió ningún kit.');
    }
    return enderKits.length + carriedSlots.length;
  });

  const { block: targetChest } = await findNearbyChest(bot, {
    radius: 2,
    slotCount: 27,
    description: 'cofre simple',
    requiredSlots
  });

  await withEnderChest(bot, async (window) => {
    const moved = await moveContainerKitsToInventory(bot, window);
    if (moved < requiredSlots - carriedSlots.length) {
      throw new Error('No se pudieron retirar todos los kits del Ender Chest.');
    }
  });
  const movedToChest = await withContainer(bot, targetChest, (window) => moveInventoryKitsToContainer(bot, window));
  if (movedToChest !== requiredSlots) {
    throw new Error(`Se movieron ${movedToChest} de ${requiredSlots} kits al cofre simple; los restantes siguen en el inventario del bot.`);
  }
  return movedToChest;
}

export async function discardEnderChestGarbage(bot) {
  const slotsToDiscard = await withEnderChest(bot, async (window) => {
    const garbage = containerItems(window).filter(({ item }) => !kitRoleForItem(item));
    const freeInventorySlots = Array.from(
      { length: window.inventoryEnd - window.inventoryStart },
      (_, index) => window.inventoryStart + index
    ).filter((slot) => !window.slots[slot]).length;
    if (freeInventorySlots < garbage.length) {
      throw new Error(`Hay ${garbage.length} stacks de basura, pero solo ${freeInventorySlots} slots libres en el inventario; no se movió nada.`);
    }

    const discardedSlots = [];
    for (const entry of garbage) {
      const destination = window.firstEmptySlotRange(window.inventoryStart, window.inventoryEnd);
      if (destination === null) {
        throw new Error('El inventario se llenó durante la limpieza; se detuvo para no perder objetos.');
      }
      await bot.moveSlotItem(entry.slot, destination);
      discardedSlots.push(destination - (window.inventoryStart - bot.inventory.inventoryStart));
    }
    return discardedSlots;
  });

  if (slotsToDiscard.length === 0) {
    return 0;
  }

  const origin = bot.entity.position.clone();
  await bot.pathfinder.goto(new goals.GoalNear(origin.x + 32, origin.y, origin.z, 2));
  let tossed = 0;
  for (const slot of slotsToDiscard) {
    const item = bot.inventory.slots[slot];
    if (!item) continue;
    await bot.tossStack(item);
    tossed += 1;
  }
  return tossed;
}
