import { addUser, getUser, removeUser, ROLES, updateUserRole } from './permissions.js';
import { countKits, deliverKit, prepareKit } from './enderchest.js';

let kitDeliveryInProgress = false;

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

function getTpaAcceptancePattern() {
  const source = process.env.TPA_ACCEPT_REGEX
    ?? '(?:teleport(?:ation)?(?: request)?|tpa).{0,80}(?:accepted|approved)|(?:accepted|approved).{0,80}(?:teleport|tpa)';
  try {
    return new RegExp(source, 'i');
  } catch (error) {
    throw new Error(`TPA_ACCEPT_REGEX no es una expresión regular válida: ${error.message}`);
  }
}

function waitForTpaAcceptance(bot, username) {
  const timeoutMs = Number(process.env.TPA_TIMEOUT_MS ?? 120000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('TPA_TIMEOUT_MS debe ser un número de al menos 1000 ms.');
  }
  const acceptancePattern = getTpaAcceptancePattern();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Se agotó el tiempo esperando que ${username} acepte el TPA.`)), timeoutMs);
    const onMessage = (message) => {
      acceptancePattern.lastIndex = 0;
      if (message.toLowerCase().includes(username.toLowerCase()) && acceptancePattern.test(message)) {
        finish();
      }
    };
    const onEnd = () => finish(new Error('El bot se desconectó mientras esperaba la aceptación del TPA.'));
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

async function handleKit(bot, username, user) {
  if (kitDeliveryInProgress) {
    tell(bot, username, 'Hay otra operación de kits en curso. Inténtalo de nuevo más tarde.');
    return;
  }

  kitDeliveryInProgress = true;
  try {
    const item = await prepareKit(bot, user.role);
    bot.chat(`/tpa ${username}`);
    const accepted = waitForTpaAcceptance(bot, username);
    tell(bot, username, 'Solicitud de TPA enviada. Acepta la solicitud para recibir tu kit.');
    await accepted;
    await deliverKit(bot, username, item);
    tell(bot, username, 'Kit entregado.');
  } finally {
    kitDeliveryInProgress = false;
  }
}

async function executeCommand(bot, username, message) {
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
      const counts = await countKits(bot);
      tell(bot, username, `Stock: lider ${counts.lider}, miembro_honorable ${counts.miembro_honorable}, miembro ${counts.miembro}.`);
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
    default:
      tell(bot, username, 'Comando no reconocido. Usa %yo, %kit o %stock.');
  }
}

export function installCommandHandlers(bot) {
  const handleMessage = async (username, message) => {
    if (!username || username === bot.username || !message?.startsWith('%')) {
      return;
    }

    try {
      await executeCommand(bot, username, message);
    } catch (error) {
      console.error(`Error procesando comando de ${username}:`, error);
      tell(bot, username, `Error: ${error.message}`);
    }
  };

  bot.on('chat', handleMessage);
  bot.on('whisper', handleMessage);
}
