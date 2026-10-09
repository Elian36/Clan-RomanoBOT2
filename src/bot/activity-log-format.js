export function formatCommandHistoryEntry(entry) {
  const timestamp = new Date(entry.created_at);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new Error('Supabase devolvió una fecha no válida en el historial.');
  }
  const time = timestamp.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const coordinates = [entry.x, entry.y, entry.z].every(Number.isFinite)
    ? `${entry.x},${entry.y},${entry.z}`
    : 'sin coordenadas';
  const command = entry.command.length > 100
    ? `${entry.command.slice(0, 97)}...`
    : entry.command;
  return `${time} | ${entry.role} | ${command} | ${coordinates}`;
}
