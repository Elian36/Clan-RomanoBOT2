const DOWNWARD_PITCH = -Math.PI / 2;
const ROTATION_SETTLE_TICKS = 10;

export async function lookDown(bot) {
  if (!bot.entity || typeof bot.look !== 'function' || typeof bot.waitForTicks !== 'function') {
    throw new Error('No se pudo orientar el bot hacia abajo antes de soltar el kit.');
  }

  await bot.look(bot.entity.yaw, DOWNWARD_PITCH);
  await bot.waitForTicks(ROTATION_SETTLE_TICKS);
}
