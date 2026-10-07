const ROLE_LABELS = Object.freeze({
  miembro_honorable: ['m h kit del c r'],
  miembro: ['miembro kit del c r'],
  lider: ['lideres kit del c r']
});

const SHULKER_PATTERN = /(?:^|_)shulker_box$/;

function normalizedText(value) {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function itemDescription(item) {
  return normalizedText([
    item.name ?? '',
    item.displayName ?? '',
    item.customName ?? '',
    JSON.stringify(item.nbt ?? {})
  ].join(' '));
}

function hasLabel(description, label) {
  const normalizedLabel = normalizedText(label);
  return ` ${description} `.includes(` ${normalizedLabel} `);
}

export function isShulker(item) {
  return typeof item?.name === 'string' && SHULKER_PATTERN.test(item.name);
}

export function kitRoleForItem(item) {
  if (!isShulker(item)) {
    return undefined;
  }

  const description = itemDescription(item);
  if (hasLabel(description, 'miembro') && !hasLabel(description, 'miembro kit del c r')) {
    return undefined;
  }
  return Object.entries(ROLE_LABELS)
    .find(([, labels]) => labels.some((label) => hasLabel(description, label)))?.[0];
}

export function shulkerLabel(item) {
  return item.displayName ?? item.customName ?? item.name;
}
