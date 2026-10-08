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

async function findNearbyChest(bot, { radius, slotCount, description }) {
  const positions = bot.findBlocks({
    matching: (block) => block.name === 'chest' || block.name === 'trapped_chest',
    maxDistance: radius,
    count: 100
  });
  const failures = [];

  for (const position of positions) {
    const block = bot.blockAt(position);
    if (!block || (block.name !== 'chest' && block.name !== 'trapped_chest')) {
      continue;
    }
    try {
      const matches = await withContainer(bot, block, (window) => window.inventoryStart === slotCount);
      if (matches) {
        return block;
      }
    } catch (error) {
      failures.push(error.message);
    }
  }

  const failureDetails = failures.length ? ` No se pudieron abrir algunos cofres: ${failures.slice(0, 2).join('; ')}.` : '';
  throw new Error(`No se encontró un ${description} accesible a ${radius} bloques o menos.${failureDetails}`);
}

function inventorySlotInWindow(bot, window, item) {
  return window.inventoryStart + item.slot - bot.inventory.inventoryStart;
}

async function moveContainerKitsToInventory(bot, window) {
  let moved = 0;
  while (true) {
    const source = containerItems(window).find(({ item }) => kitRoleForItem(item));
    if (!source) return moved;

    const destination = window.firstEmptySlotRange(window.inventoryStart, window.inventoryEnd);
    if (destination === null) return moved;

    await bot.moveSlotItem(source.slot, destination);
    moved += 1;
  }
}

async function moveInventoryKitsToContainer(bot, window) {
  let moved = 0;
  while (true) {
    const item = bot.inventory.items().find((candidate) => kitRoleForItem(candidate));
    if (!item) return moved;

    const destination = window.firstEmptySlotRange(0, window.inventoryStart);
    if (destination === null) return moved;

    await bot.moveSlotItem(inventorySlotInWindow(bot, window, item), destination);
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
      if (Date.now() - countReachedAt >= 500) {
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
  await bot.tossStack(item);
  await waitForKitDrop(bot, role, countBeforeDrop - item.count);
}

export async function restockKits(bot) {
  const sourceChest = await findNearbyChest(bot, {
    radius: 3,
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
  const targetChest = await findNearbyChest(bot, {
    radius: 2,
    slotCount: 27,
    description: 'cofre simple'
  });
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

  const freeChestSlots = await withContainer(bot, targetChest, (window) => (
    Array.from({ length: window.inventoryStart }, (_, slot) => slot).filter((slot) => !window.slots[slot]).length
  ));
  if (freeChestSlots < requiredSlots) {
    throw new Error(`El cofre simple solo tiene ${freeChestSlots} slots libres y se necesitan ${requiredSlots}; no se movieron kits.`);
  }

  await withEnderChest(bot, async (window) => {
    const moved = await moveContainerKitsToInventory(bot, window);
    if (moved < requiredSlots - carriedSlots.length) {
      throw new Error('No se pudieron retirar todos los kits del Ender Chest.');
    }
  });
  return withContainer(bot, targetChest, (window) => moveInventoryKitsToContainer(bot, window));
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
