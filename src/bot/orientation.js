const DOWNWARD_PITCH = -Math.PI / 2;
const ROTATION_SETTLE_TICKS = 24;
const FAST_PITCH_SPEED = Math.PI / 0.05;

export async function lookDown(bot) {
  if (!bot.entity || !bot.physics || typeof bot.look !== 'function' || typeof bot.waitForTicks !== 'function') {
    throw new Error('No se pudo orientar el bot hacia abajo antes de soltar el kit.');
  }

  const previousPitchSpeed = bot.physics.pitchSpeed;
  if (!Number.isFinite(previousPitchSpeed) || previousPitchSpeed <= 0) {
    throw new Error('La velocidad de giro vertical del bot no es válida.');
  }

  bot.physics.pitchSpeed = Math.max(previousPitchSpeed, FAST_PITCH_SPEED);
  try {
    await bot.look(bot.entity.yaw, DOWNWARD_PITCH);
    await bot.waitForTicks(ROTATION_SETTLE_TICKS);
  } finally {
    bot.physics.pitchSpeed = previousPitchSpeed;
  }
}
