export function getTpaAcceptancePattern() {
  const source = process.env.TPA_ACCEPT_REGEX
    ?? '(?:teleport(?:ation)?(?: request)?|tpa).{0,80}(?:accepted|approved)|(?:accepted|approved).{0,80}(?:teleport|tpa)';
  try {
    return new RegExp(source, 'i');
  } catch (error) {
    throw new Error(`TPA_ACCEPT_REGEX no es una expresión regular válida: ${error.message}`);
  }
}

export function waitForTpaTeleport(bot, username, origin) {
  const timeoutMs = Number(process.env.TPA_TIMEOUT_MS ?? 120000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('TPA_TIMEOUT_MS debe ser un número de al menos 1000 ms.');
  }
  const acceptancePattern = getTpaAcceptancePattern();

  return new Promise((resolve, reject) => {
    let accepted = false;
    let finished = false;
    const timer = setTimeout(() => finish(new Error(
      accepted
        ? `${username} aceptó el TPA, pero no se detectó el teletransporte.`
        : `Se agotó el tiempo esperando que ${username} acepte el TPA.`
    )), timeoutMs);
    const onMessage = (message) => {
      acceptancePattern.lastIndex = 0;
      if (message.toLowerCase().includes(username.toLowerCase()) && acceptancePattern.test(message)) {
        accepted = true;
        const target = bot.players[username]?.entity;
        const position = bot.entity?.position;
        if (target && position?.distanceTo(target.position) <= 5) {
          finish();
        }
      }
    };
    const onForcedMove = () => {
      if (bot.entity?.position) {
        finish();
      }
    };
    const poll = setInterval(() => {
      const current = bot.entity?.position;
      if (current && origin && current.distanceTo(origin) >= 4) {
        finish();
        return;
      }
      const target = bot.players[username]?.entity;
      if (accepted && target && current && current.distanceTo(target.position) <= 5) {
        finish();
      }
    }, 250);
    const onEnd = () => finish(new Error('El bot se desconectó mientras esperaba el TPA.'));

    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(poll);
      bot.removeListener('messagestr', onMessage);
      bot.removeListener('forcedMove', onForcedMove);
      bot.removeListener('end', onEnd);
      if (error) reject(error);
      else resolve();
    }

    bot.on('messagestr', onMessage);
    bot.on('forcedMove', onForcedMove);
    bot.once('end', onEnd);
  });
}
