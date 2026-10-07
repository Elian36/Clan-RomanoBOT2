import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { waitForTpaTeleport } from './tpa.js';

function makeBot() {
  const bot = new EventEmitter();
  bot.entity = {
    position: {
      x: 0,
      y: 64,
      z: 0,
      distanceTo(other) {
        return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z);
      }
    }
  };
  bot.players = {};
  return bot;
}

test('detects server-forced TPA teleport without relying on player entity visibility', async () => {
  const bot = makeBot();
  const origin = { ...bot.entity.position };
  const pending = waitForTpaTeleport(bot, 'wNeofor', origin);
  bot.entity.position.x = 100;
  bot.emit('forcedMove');
  await pending;
});

test('detects teleport by position change if forcedMove is not emitted', async () => {
  const bot = makeBot();
  const origin = { ...bot.entity.position };
  const pending = waitForTpaTeleport(bot, 'wNeofor', origin);
  bot.entity.position.x = 100;
  await pending;
});

test('acceptance message plus arrival next to the player confirms TPA', async () => {
  const bot = makeBot();
  bot.players.wNeofor = {
    entity: {
      position: {
        x: 1,
        y: 64,
        z: 1
      }
    }
  };
  const pending = waitForTpaTeleport(bot, 'wNeofor', { x: 0, y: 64, z: 0 });
  bot.emit('messagestr', 'wNeofor accepted your tpa request');
  await pending;
});
