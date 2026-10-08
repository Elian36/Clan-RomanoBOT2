import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import mineflayer from 'mineflayer';
import pathfinderPlugin from 'mineflayer-pathfinder';
import { installCommandHandlers } from './commands.js';
import { rememberHomePosition } from './home.js';

const { pathfinder } = pathfinderPlugin;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} es obligatorio; configúralo en .env.`);
  }
  return value;
}

const reconnectDelay = Number(process.env.RECONNECT_DELAY_MS ?? 10000);
if (!Number.isFinite(reconnectDelay) || reconnectDelay < 1000) {
  throw new Error('RECONNECT_DELAY_MS debe ser un número de al menos 1000 ms.');
}

let reconnectTimer;
let stoppedKeepAlive;
let stopping = false;

function readAntiAfkInterval() {
  const intervalMs = Number(process.env.ANTI_AFK_INTERVAL_MS ?? 60000);
  if (!Number.isFinite(intervalMs) || intervalMs < 10000) {
    throw new Error('ANTI_AFK_INTERVAL_MS debe ser un número de al menos 10000 ms.');
  }
  return intervalMs;
}

const antiAfkInterval = readAntiAfkInterval();

function createBot() {
  const options = {
    host: process.env.MINECRAFT_HOST ?? '8b8t.me',
    port: Number(process.env.MINECRAFT_PORT ?? 25565),
    username: requiredEnv('MINECRAFT_USERNAME')
  };
  const auth = process.env.MINECRAFT_AUTH;
  if (auth) {
    options.auth = auth;
  }
  if (process.env.MINECRAFT_VERSION) {
    options.version = process.env.MINECRAFT_VERSION;
  }

  const bot = mineflayer.createBot(options);
  let antiAfkTimer;
  let connectionConflict = false;
  let hasSpawned = false;
  let returnHomeAfterRespawn = false;
  bot.loadPlugin(pathfinder);
  bot.once('login', () => console.log(`Conectado a ${options.host}:${options.port} como ${bot.username}.`));
  bot.on('death', () => {
    returnHomeAfterRespawn = true;
    console.warn('El bot murió; se preparará para volver a /home zs al respawnear.');
    setTimeout(() => {
      if (!bot.isAlive && typeof bot.respawn === 'function') {
        bot.respawn();
      }
    }, 1000);
  });
  bot.on('spawn', () => {
    if (hasSpawned) {
      if (returnHomeAfterRespawn) {
        returnHomeAfterRespawn = false;
        setTimeout(() => {
          if (bot.entity) {
            bot.chat('/home zs');
            console.log('Después del respawn, se envió /home zs.');
            setTimeout(() => {
              if (bot.entity) {
                rememberHomePosition(bot.entity.position);
              }
            }, Number(process.env.HOME_COMMAND_DELAY_MS ?? 5000));
          }
        }, Number(process.env.HOME_COMMAND_DELAY_MS ?? 5000));
      }
      return;
    }
    hasSpawned = true;
    console.log('El bot apareció en el mundo.');
    const password = process.env.MINECRAFT_PASSWORD;
    if (password) {
      setTimeout(() => {
        if (bot.entity) {
          bot.chat(`/login ${password}`);
          console.log('Se envió el comando de autenticación al servidor.');
        }
      }, 1500);
    }
    antiAfkTimer = setInterval(() => {
      if (!bot.entity) {
        return;
      }
      const yaw = bot.entity.yaw + 0.45;
      bot.look(yaw, bot.entity.pitch, true)
        .catch((error) => console.error('No se pudo mover la cámara para anti-AFK:', error));
    }, antiAfkInterval);
    antiAfkTimer.unref();
    installCommandHandlers(bot, () => {
      stopping = true;
      clearTimeout(reconnectTimer);
      clearInterval(antiAfkTimer);
      bot.quit('Desconectado por comando de lider');
      stoppedKeepAlive = setInterval(() => {}, 60000);
    });
  });
  bot.on('kicked', (reason) => {
    const kickMessage = typeof reason === 'string' ? reason : JSON.stringify(reason);
    if (/already connected|already logged in|already online/i.test(kickMessage)) {
      connectionConflict = true;
      console.error('El servidor rechazó esta sesión porque la cuenta ya está conectada. Se detienen los reintentos para evitar saturar los logs. Cierra la otra instancia y reinicia este servicio.');
      return;
    }
    console.error('El servidor expulsó al bot:', reason);
  });
  bot.on('error', (error) => console.error('Error de Mineflayer:', error));
  bot.once('end', (reason) => {
    clearInterval(antiAfkTimer);
    console.warn(`Conexión finalizada: ${reason ?? 'sin motivo informado'}`);
    if (connectionConflict) {
      stopping = true;
      clearTimeout(reconnectTimer);
      stoppedKeepAlive = setInterval(() => {}, 60000);
      return;
    }
    if (!stopping) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(createBot, reconnectDelay);
      console.log(`Se intentará reconectar en ${reconnectDelay} ms.`);
    }
  });
}

export function startBot() {
  process.once('SIGINT', () => {
    stopping = true;
    clearTimeout(reconnectTimer);
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    stopping = true;
    clearTimeout(reconnectTimer);
    process.exit(0);
  });

  createBot();
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  startBot();
}
