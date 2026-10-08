const ROLE_LABELS = Object.freeze({
  miembro_honorable: ['m h kit del c r', 'm h', 'mh'],
  miembro: ['miembro kit del c r'],
  lider: ['lideres kit del c r']
});

const SHULKER_PATTERN = /(?:^|_)shulker_box$/;

function normalizedText(value) {
  return String(value)
    .replace(/§[0-9a-fk-orx]/gi, '')
    .replace(/&[0-9a-fk-orx]/gi, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function collectText(value, output = [], visited = new WeakSet()) {
  if (typeof value === 'string') {
    output.push(value);
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== value) collectText(parsed, output, visited);
      } catch {
        // Keep the original string; Minecraft component text is not always valid JSON.
      }
    }
    return output;
  }
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return output;
  }

  visited.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) collectText(entry, output, visited);
  } else {
    for (const entry of Object.values(value)) collectText(entry, output, visited);
  }
  return output;
}

function itemDescription(item) {
  const values = [
    item.name,
    item.displayName,
    item.customName,
    item.nbt
  ];
  return normalizedText(collectText(values).join(' '));
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
  const customText = collectText([item.customName, item.nbt])
    .map((value) => value.trim())
    .filter(Boolean)
    .find((value) => /lider|miembro|honor|m\.?\s*h/i.test(value));
  return customText ?? item.displayName ?? item.customName ?? item.name;
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
