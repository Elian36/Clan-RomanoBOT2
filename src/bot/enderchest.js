import pathfinderPlugin from 'mineflayer-pathfinder';
import { ROLES } from './permissions.js';

const { goals } = pathfinderPlugin;

const SHULKER_PATTERN = /(?:^|_)shulker_box$/;
const ROLE_LABELS = Object.freeze({
  lider: ['lider', 'líder', 'leader'],
  miembro_honorable: ['honorable', 'honor', 'honoured', 'honored'],
  miembro: ['miembro', 'member']
});

let enderChestQueue = Promise.resolve();

function itemDescription(item) {
  return `${item.name} ${item.displayName ?? ''} ${JSON.stringify(item.nbt ?? {})}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isKitForRole(item, role) {
  if (!SHULKER_PATTERN.test(item.name)) {
    return false;
  }
  const description = itemDescription(item);
  const hasKitLabel = /\bkit\b/.test(description);
  return hasKitLabel && ROLE_LABELS[role].some((label) => description.includes(label));
}

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
  const timeoutMs = 10000;
  let cleanup = () => {};

  const windowPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('El servidor no abrió el Ender Chest.'));
    }, timeoutMs);

    const onOpen = (window) => {
      cleanup();
      resolve(window);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('El bot se desconectó al abrir el Ender Chest.'));
    };
    function removeListeners() {
      clearTimeout(timer);
      bot.removeListener('windowOpen', onOpen);
      bot.removeListener('end', onEnd);
    }

    cleanup = removeListeners;
    bot.once('windowOpen', onOpen);
    bot.once('end', onEnd);
  });
  windowPromise.catch(() => {});

  try {
    await bot.activateBlock(block);
  } catch (error) {
    cleanup();
    throw error;
  }
  return await windowPromise;
}

function containerItems(window) {
  const end = window.inventoryStart ?? 27;
  return window.slots.slice(0, end).flatMap((item, slot) => item ? [{ item, slot }] : []);
}

function findAddedInventoryItem(bot, before, sourceItem) {
  const key = JSON.stringify(sourceItem.nbt ?? {});
  const signature = `${sourceItem.type}:${key}`;
  const previousCount = before.get(signature) ?? 0;
  const currentCount = bot.inventory.items()
    .filter((item) => item.type === sourceItem.type && JSON.stringify(item.nbt ?? {}) === key)
    .reduce((total, item) => total + item.count, 0);
  if (currentCount <= previousCount) {
    return undefined;
  }
  return bot.inventory.items().find((item) => {
    const itemKey = JSON.stringify(item.nbt ?? {});
    return item.type === sourceItem.type && itemKey === key;
  });
}

async function moveNearPlayer(bot, username) {
  const deadline = Date.now() + 15000;
  let target = bot.players[username]?.entity;
  while (!target && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    target = bot.players[username]?.entity;
  }
  if (!target) {
    throw new Error(`No se encontró a ${username} cerca después de aceptar el TPA.`);
  }
  await bot.pathfinder.goto(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2));
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
        bot.closeWindow(bot.currentWindow);
      }
    }
  } finally {
    release();
  }
}

export async function countKits(bot) {
  return withEnderChest(bot, (window) => {
    const counts = Object.fromEntries(ROLES.map((role) => [role, 0]));
    for (const { item } of containerItems(window)) {
      for (const role of ROLES) {
        if (isKitForRole(item, role)) {
          counts[role] += item.count;
          break;
        }
      }
    }
    return counts;
  });
}

export async function prepareKit(bot, role) {
  let selectedItem;
  let inventoryBefore;

  await withEnderChest(bot, async (window) => {
    const candidate = containerItems(window).find(({ item }) => isKitForRole(item, role));
    if (!candidate) {
      throw new Error(`No quedan kits para el rol ${role}.`);
    }

    inventoryBefore = new Map();
    for (const item of bot.inventory.items()) {
      const signature = `${item.type}:${JSON.stringify(item.nbt ?? {})}`;
      inventoryBefore.set(signature, (inventoryBefore.get(signature) ?? 0) + item.count);
    }
    selectedItem = candidate.item;
    await bot.clickWindow(candidate.slot, 0, 0);
  });

  const inventoryItem = findAddedInventoryItem(bot, inventoryBefore, selectedItem);
  if (!inventoryItem) {
    throw new Error('No se pudo mover el kit del Ender Chest al inventario.');
  }
  return inventoryItem;
}

export async function deliverKit(bot, username, item) {
  await moveNearPlayer(bot, username);
  await bot.tossStack(item);
}
