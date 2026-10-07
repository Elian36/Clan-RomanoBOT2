import { addUser, getLeaders, getUser, removeUser, ROLES, updateUserRole } from './permissions.js';
import { countKits, deliverKit, prepareKit } from './enderchest.js';
import { waitForTpaTeleport } from './tpa.js';

let kitDeliveryInProgress = false;
let homeOperationInProgress = false;

function readHomeDelay() {
  const delayMs = Number(process.env.HOME_COMMAND_DELAY_MS ?? 5000);
  if (!Number.isFinite(delayMs) || delayMs < 1000) {
    throw new Error('HOME_COMMAND_DELAY_MS debe ser un número de al menos 1000 ms.');
  }
  return delayMs;
}

async function returnHome(bot) {
  bot.chat('/home aa');
  await new Promise((resolve) => setTimeout(resolve, readHomeDelay()));
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
  return Math.hypot(position.x - spawnX, position.z - spawnZ) < 20000;
}

function waitForKillConfirmation(bot) {
  const source = process.env.KILL_CONFIRM_REGEX ?? '(?:kill|respawn).{0,80}(?:confirm|sure|accept)|(?:confirm|sure|accept).{0,80}(?:kill|respawn)';
  const command = process.env.KILL_CONFIRM_COMMAND ?? '/kill confirm';
  let pattern;
  try {
    pattern = new RegExp(source, 'i');
  } catch (error) {
    throw new Error(`KILL_CONFIRM_REGEX no es válida: ${error.message}`);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('El servidor no mostró una confirmación para /kill.')), 15000);
    const onMessage = (message) => {
      pattern.lastIndex = 0;
      if (pattern.test(message)) {
        bot.chat(command);
        finish();
      }
    };
    const onEnd = () => finish(new Error('El bot se desconectó esperando confirmar /kill.'));
    function finish(error) {
      clearTimeout(timer);
      bot.removeListener('messagestr', onMessage);
      bot.removeListener('end', onEnd);
      if (error) reject(error);
      else resolve();
    }
    bot.on('messagestr', onMessage);
    bot.once('end', onEnd);
  });
}

async function respawnAtBed(bot, username) {
  const confirmation = waitForKillConfirmation(bot);
  bot.chat('/kill');
  tell(bot, username, 'No hay líderes conectados; solicité respawn con /kill y confirmaré el aviso del servidor.');
  await confirmation;
}

async function askOnlineLeadersForHelp(bot, username, position) {
  const leaders = await getLeaders();
  const onlineLeaders = leaders.filter(({ username: leader }) => (
    /^[A-Za-z0-9_]{1,16}$/.test(leader)
    && bot.players[leader]?.entity
  ));

  if (onlineLeaders.length === 0) return false;

  const message = `El bot necesita ayuda después de entregar un kit. Posición: ${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)}.`;
  for (const leader of onlineLeaders) {
    bot.chat(`/msg ${leader.username} ${message}`);
  }
  return true;
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
    tell(bot, username, 'Kit entregado.');
    const deliveryPosition = bot.entity?.position?.clone();
    const nearSpawn = isNearSpawn(deliveryPosition);
    try {
      if (nearSpawn && !await askOnlineLeadersForHelp(bot, username, deliveryPosition)) {
        await respawnAtBed(bot, username);
        tell(bot, username, 'Respawn solicitado para volver a la cama.');
        return;
      }
      await returnHome(bot);
    } catch (error) {
      tell(bot, username, `La entrega se completó, pero falló la recuperación: ${error.message}`);
      throw error;
    }
    tell(bot, username, 'El bot volvió a /home aa.');
  } finally {
    kitDeliveryInProgress = false;
  }
}

async function executeCommand(bot, username, message, onStop) {
  const { name, args } = parseCommand(message);
  const user = await getUser(username);
  if (!user) {
    tell(bot, username, 'No tienes permisos para usar este bot.');
    return;
  }

  switch (name) {
    case 'yo':
      tell(bot, username, `Registrado: sí | Rol: ${user.role}`);
      return;
    case 'kit':
      await handleKit(bot, username, user);
      return;
    case 'stock': {
      if (kitDeliveryInProgress) {
        tell(bot, username, 'Hay una entrega de kit en curso. Inténtalo de nuevo más tarde.');
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
    case 'sethome':
      if (args.length !== 0) {
        tell(bot, username, 'Uso: %sethome');
        return;
      }
      if (homeOperationInProgress || kitDeliveryInProgress) {
        tell(bot, username, 'El bot está ocupado. Inténtalo de nuevo más tarde.');
        return;
      }
      homeOperationInProgress = true;
      try {
        bot.chat('/sethome aa');
        tell(bot, username, 'Se envió /sethome aa. La home queda en la ubicación actual del bot.');
      } finally {
        homeOperationInProgress = false;
      }
      return;
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
    default:
      tell(bot, username, 'Comando no reconocido. Usa %yo, %kit, %stock, %sethome o %stop.');
  }
}

export function installCommandHandlers(bot, onStop) {
  const handleMessage = async (username, message) => {
    if (!username || username === bot.username || !message?.startsWith('%')) {
      return;
    }

    try {
      await executeCommand(bot, username, message, onStop);
    } catch (error) {
      console.error(`Error procesando comando de ${username}:`, error);
      tell(bot, username, `Error: ${error.message}`);
    }
  };

  bot.on('chat', handleMessage);
  bot.on('whisper', handleMessage);
}
