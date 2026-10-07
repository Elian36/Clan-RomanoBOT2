const ROLE_LABELS = Object.freeze({
  miembro_honorable: ['miembro honorable', 'miembro_honorable', 'honorable', 'honored', 'honoured', 'honor'],
  lider: ['lider', 'leader'],
  miembro: ['miembro', 'member']
});

const SHULKER_PATTERN = /(?:^|_)shulker_box$/;

function normalizedText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  const escapedLabel = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escapedLabel}(?:$|[^a-z0-9])`).test(description);
}

export function isShulker(item) {
  return typeof item?.name === 'string' && SHULKER_PATTERN.test(item.name);
}

export function kitRoleForItem(item) {
  if (!isShulker(item)) {
    return undefined;
  }

  const description = itemDescription(item);
  return Object.entries(ROLE_LABELS)
    .find(([, labels]) => labels.some((label) => hasLabel(description, label)))?.[0];
}

export function shulkerLabel(item) {
  return item.displayName ?? item.customName ?? item.name;
}
