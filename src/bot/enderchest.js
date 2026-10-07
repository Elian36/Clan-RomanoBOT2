import pathfinderPlugin from 'mineflayer-pathfinder';
import { ROLES } from './permissions.js';
import { countKitItems, kitRoleForItem, isShulker, shulkerLabel } from './kit-matcher.js';

const { goals } = pathfinderPlugin;

let enderChestQueue = Promise.resolve();

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

    await bot.clickWindow(candidate.slot, 0, 0);
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

export async function deliverKit(bot, username, item) {
  await moveNearPlayer(bot, username);
  await bot.tossStack(item);
}
