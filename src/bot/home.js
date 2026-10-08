let homeBlock;

function blockPosition(position) {
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new Error('No se pudo determinar la posición actual del bot para guardar /home zs.');
  }
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
  };
}

export function rememberHomePosition(position) {
  homeBlock = blockPosition(position);
}

export function isAtHome(position) {
  if (!homeBlock || !position) return false;
  const currentBlock = blockPosition(position);
  return currentBlock.x === homeBlock.x
    && currentBlock.y === homeBlock.y
    && currentBlock.z === homeBlock.z;
}
