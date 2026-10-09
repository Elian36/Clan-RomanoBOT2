import { addUser, getUser, removeUser, ROLES, updateUserRole } from './permissions.js';
import {
  countKits,
  deliverKit,
  discardEnderChestGarbage,
  moveAllKitsToSingleChest,
  prepareKit,
  restockKits
} from './enderchest.js';
import { waitForTpaTeleport } from './tpa.js';
import { isAtHome, rememberHomePosition } from './home.js';
import {
  formatCommandHistoryEntry,
  getCommandHistory,
  recordCommandUse
} from './activity-log.js';

let kitDeliveryInProgress = false;
let homeOperationInProgress = false;
let storageOperationInProgress = false;

function readHomeDelay() {
  const delayMs = Number(process.env.HOME_COMMAND_DELAY_MS ?? 5000);
  if (!Number.isFinite(delayMs) || delayMs < 1000) {
    throw new Error('HOME_COMMAND_DELAY_MS debe ser un número de al menos 1000 ms.');
  }
  return delayMs;
}

async function returnHome(bot) {
  if (isAtHome(bot.entity?.position)) {
    return false;
  }
  bot.chat('/home zs');
  await new Promise((resolve) => setTimeout(resolve, readHomeDelay()));
  if (bot.entity?.position) {
    rememberHomePosition(bot.entity.position);
  }
  return true;
}

function isNearSpawn(position) {
  const spawnX = Number(process.env.SPAWN_X ?? 0);
  const spawnZ = Number(process.env.SPAWN_Z ?? 0);
  if (!Number.isFinite(spawnX) || !Number.isFinite(spawnZ)) {
    throw new Error('SPAWN_X y SPAWN_Z deben ser coordenadas válidas.');
  }
  if (!position) {
    return false;
  }
  return Math.hypot(position.x - spawnX, position.z - spawnZ) < 15000;
}

function tell(bot, username, message) {
  try {
    bot.chat(`/msg ${username} ${message}`);
  } catch (error) {
    console.error(`No se pudo enviar un mensaje privado a ${username}:`, error);
  }
}

function parseCommand(message) {
  const parts = message.trim().split(/\s+/);
  const [name, ...args] = parts;
  return { name: name.slice(1).toLowerCase(), args };
}

async function handleKit(bot, username, user) {
  if (kitDeliveryInProgress) {
    tell(bot, username, 'Hay otra operación de kits en curso. Inténtalo de nuevo más tarde.');
    return;
  }

  kitDeliveryInProgress = true;
  try {
    await returnHome(bot);
    await prepareKit(bot, user.role);
    const requestPosition = bot.entity?.position?.clone();
    const teleported = waitForTpaTeleport(bot, username, requestPosition);
    bot.chat(`/tpa ${username}`);
    tell(bot, username, 'Solicitud de TPA enviada. La entrega continuará al detectar que el bot llegó.');
    await teleported;
    await deliverKit(bot, username, user.role);
    const deliveryPosition = bot.entity?.position?.clone();
    const nearSpawn = isNearSpawn(deliveryPosition);
    try {
      if (nearSpawn) {
        bot.chat('/kill');
        tell(bot, username, 'Kit entregado; solicitando respawn para volver rápido a /home zs.');
        return;
      }
      await returnHome(bot);
    } catch (error) {
      tell(bot, username, `El kit se entregó, pero no se pudo iniciar el regreso: ${error.message}`);
      throw error;
    }
    tell(bot, username, 'Kit entregado; el bot ya está en /home zs.');
  } finally {
    kitDeliveryInProgress = false;
  }
}

async function executeCommand(bot, username, message, onStop, playerPosition) {
  const { name, args } = parseCommand(message);
  const user = await getUser(username);
  if (!user) {
    tell(bot, username, 'No tienes permisos para usar este bot.');
    return;
  }

  try {
    await recordCommandUse({
      username,
      role: user.role,
      command: message,
      position: playerPosition
    });
  } catch (error) {
    console.error(`No se pudo registrar el comando de ${username}:`, error);
    tell(bot, username, 'Aviso: no se pudo guardar este uso en el historial de Supabase.');
  }

  switch (name) {
    case 'yo':
      tell(bot, username, `Registrado: sí | Rol: ${user.role}`);
      return;
    case 'kit':
      if (storageOperationInProgress) {
        tell(bot, username, 'El bot está ocupado organizando el inventario. Inténtalo de nuevo más tarde.');
        return;
      }
      await handleKit(bot, username, user);
      return;
    case 'stock': {
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede consultar el stock.');
        return;
      }
      if (kitDeliveryInProgress) {
        tell(bot, username, 'Hay una entrega de kit en curso. Inténtalo de nuevo más tarde.');
        return;
      }
      if (storageOperationInProgress) {
        tell(bot, username, 'El bot está ocupado organizando cofres. Inténtalo de nuevo más tarde.');
        return;
      }
      await returnHome(bot);
      const { counts, unidentified, totalShulkers, carriedShulkers, enderChestShulkers, enderChestSlots } = await countKits(bot);
      const unrecognized = unidentified.length
        ? ` Sin clasificar: ${unidentified.slice(0, 3).map(({ label, count }) => `${label} x${count}`).join(', ')}.`
        : '';
      const scanDetails = totalShulkers === 0
        ? ` No encontré shulkers; revisé ${carriedShulkers} en inventario y ${enderChestSlots} slots del Ender Chest (${enderChestShulkers} shulkers).`
        : ` Total: ${totalShulkers} shulkers (${carriedShulkers} en inventario, ${enderChestShulkers} en Ender Chest).`;
      tell(bot, username, `Stock: lider ${counts.lider}, miembro_honorable ${counts.miembro_honorable}, miembro ${counts.miembro}.${unrecognized}${scanDetails}`);
      return;
    }
    case 'registro': {
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede consultar el historial de uso.');
        return;
      }
      if (args.length !== 1) {
        tell(bot, username, 'Uso: %registro <miembro>');
        return;
      }
      const history = await getCommandHistory(args[0]);
      if (history.length === 0) {
        tell(bot, username, `${args[0]} todavía no tiene comandos registrados.`);
        return;
      }
      tell(bot, username, `Últimos ${history.length} comandos de ${args[0]} (fecha UTC | rol | comando | X,Y,Z):`);
      for (const entry of history) {
        tell(bot, username, formatCommandHistoryEntry(entry));
      }
      return;
    }
    case 'sethome':
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede configurar la home.');
        return;
      }
      if (args.length !== 0) {
        tell(bot, username, 'Uso: %sethome');
        return;
      }
      if (homeOperationInProgress || kitDeliveryInProgress || storageOperationInProgress) {
        tell(bot, username, 'El bot está ocupado. Inténtalo de nuevo más tarde.');
        return;
      }
      homeOperationInProgress = true;
      try {
        bot.chat('/sethome zs');
        rememberHomePosition(bot.entity?.position);
        tell(bot, username, 'Se envió /sethome zs. La home queda en la ubicación actual del bot.');
      } finally {
        homeOperationInProgress = false;
      }
      return;
    case 'restock':
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede reabastecer kits.');
        return;
      }
      if (storageOperationInProgress || kitDeliveryInProgress) {
        tell(bot, username, 'El bot está ocupado. Inténtalo de nuevo más tarde.');
        return;
      }
      storageOperationInProgress = true;
      try {
        await returnHome(bot);
        const result = await restockKits(bot);
        tell(bot, username, `Restock: ${result.stored} kits al Ender Chest, ${result.returned} devueltos al cofre doble${result.remaining ? `, ${result.remaining} siguen en inventario` : ''}${result.sourceRemaining ? `, ${result.sourceRemaining} siguen en el cofre doble` : ''}.`);
      } finally {
        storageOperationInProgress = false;
      }
      return;
    case 'limpiar': {
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede limpiar cofres.');
        return;
      }
      if (args.length !== 1 || !['a', 'b'].includes(args[0].toLowerCase())) {
        tell(bot, username, 'Uso: %limpiar a | %limpiar b');
        return;
      }
      if (storageOperationInProgress || kitDeliveryInProgress) {
        tell(bot, username, 'El bot está ocupado. Inténtalo de nuevo más tarde.');
        return;
      }
      storageOperationInProgress = true;
      try {
        await returnHome(bot);
        if (args[0].toLowerCase() === 'a') {
          const moved = await moveAllKitsToSingleChest(bot);
          tell(bot, username, `Limpieza A: ${moved} kits movidos del Ender Chest al cofre simple.`);
        } else {
          try {
            const tossed = await discardEnderChestGarbage(bot);
            tell(bot, username, `Limpieza B: ${tossed} stacks de basura soltados a 32 bloques.`);
          } finally {
            await returnHome(bot);
          }
        }
      } finally {
        storageOperationInProgress = false;
      }
      return;
    }
    case 'add': {
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede usar este comando.');
        return;
      }
      if (args.length !== 2) {
        tell(bot, username, `Uso: %add <usuario> <${ROLES.join('|')}>`);
        return;
      }
      const created = await addUser(args[0], args[1]);
      tell(bot, username, `${created.username} fue agregado con rol ${created.role}.`);
      return;
    }
    case 'role': {
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede usar este comando.');
        return;
      }
      if (args.length !== 2) {
        tell(bot, username, `Uso: %role <usuario> <${ROLES.join('|')}>`);
        return;
      }
      const updated = await updateUserRole(args[0], args[1]);
      tell(bot, username, `${updated.username} ahora tiene el rol ${updated.role}.`);
      return;
    }
    case 'remove': {
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede usar este comando.');
        return;
      }
      if (args.length !== 1) {
        tell(bot, username, 'Uso: %remove <usuario>');
        return;
      }
      const removed = await removeUser(args[0]);
      tell(bot, username, `${removed.username} fue eliminado.`);
      return;
    }
    case 'stop':
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede desconectar el bot.');
        return;
      }
      tell(bot, username, 'Desconectando el bot.');
      onStop();
      return;
    case 'kill':
      if (user.role !== 'lider') {
        tell(bot, username, 'Solo un lider puede matar al bot.');
        return;
      }
      if (kitDeliveryInProgress || storageOperationInProgress) {
        tell(bot, username, 'No puedo morir durante una entrega o movimiento de cofres.');
        return;
      }
      tell(bot, username, 'Ejecutando /kill; al respawnear el bot volverá a /home zs.');
      bot.chat('/kill');
      return;
    default:
      tell(bot, username, 'Comando no reconocido. Usa %yo, %kit, %stock, %registro <miembro>, %sethome, %kill, %restock, %limpiar a|b o %stop.');
  }
}

export function installCommandHandlers(bot, onStop) {
  const handleMessage = async (username, message) => {
    if (!username || username === bot.username || !message?.startsWith('%')) {
      return;
    }

    try {
      await executeCommand(bot, username, message, onStop, bot.players[username]?.entity?.position);
    } catch (error) {
      console.error(`Error procesando comando de ${username}:`, error);
      tell(bot, username, `Error: ${error.message}`);
    }
  };

  bot.on('chat', handleMessage);
  bot.on('whisper', handleMessage);
}
