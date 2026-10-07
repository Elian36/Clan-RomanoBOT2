const ROLE_LABELS = Object.freeze({
  miembro_honorable: ['m h kit del c r'],
  miembro: ['miembro kit del c r'],
  lider: ['lideres kit del c r']
});

const SHULKER_PATTERN = /(?:^|_)shulker_box$/;

function normalizedText(value) {
  return value
    .replace(/§[0-9a-fk-orx]/gi, '')
    .replace(/&[0-9a-fk-orx]/gi, '')
    .normalize('NFD')
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
  return item.customName ?? item.displayName ?? item.name;
}

export function countKitItems(items) {
  const counts = Object.fromEntries(Object.keys(ROLE_LABELS).map((role) => [role, 0]));
  const unidentified = [];
  let totalShulkers = 0;
  for (const item of items) {
    if (!isShulker(item)) {
      continue;
    }
    totalShulkers += item.count ?? 1;
    const role = kitRoleForItem(item);
    if (role) counts[role] += item.count ?? 1;
    else unidentified.push({ label: shulkerLabel(item), count: item.count ?? 1 });
  }
  return { counts, unidentified, totalShulkers };
}
