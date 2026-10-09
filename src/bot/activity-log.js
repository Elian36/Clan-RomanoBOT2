import { supabase } from '../config/supabase.js';
import { formatCommandHistoryEntry } from './activity-log-format.js';

const VALID_ROLES = new Set(['lider', 'miembro_honorable', 'miembro']);

function validateUsername(username) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(username)) {
    throw new Error('El username debe tener de 1 a 16 letras, números o _.');
  }
}

function positionCoordinate(position, coordinate) {
  const value = position?.[coordinate];
  return Number.isFinite(value) ? Math.floor(value) : null;
}

export async function recordCommandUse({ username, role, command, position }) {
  validateUsername(username);
  if (!VALID_ROLES.has(role)) {
    throw new Error(`Rol no válido para registrar el comando: ${role}.`);
  }
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('No se puede registrar un comando vacío.');
  }

  const { error } = await supabase.from('command_history').insert({
    username,
    role,
    command: command.trim().slice(0, 256),
    x: positionCoordinate(position, 'x'),
    y: positionCoordinate(position, 'y'),
    z: positionCoordinate(position, 'z')
  });

  if (error) {
    throw new Error(`No se pudo guardar el registro del comando en Supabase: ${error.message}`);
  }
}

export async function getCommandHistory(username) {
  validateUsername(username);
  const { data, error } = await supabase
    .from('command_history')
    .select('username, role, command, x, y, z, created_at')
    .eq('username', username)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`No se pudo consultar el historial de ${username}: ${error.message}`);
  }
  return data;
}

export { formatCommandHistoryEntry };
