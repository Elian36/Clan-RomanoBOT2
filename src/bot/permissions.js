import { supabase } from '../config/supabase.js';

export const ROLES = Object.freeze(['lider', 'miembro_honorable', 'miembro']);

function validateUsername(username) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(username)) {
    throw new Error('El nombre debe ser un username de Minecraft válido (1-16 letras, números o _).');
  }
}

function validateRole(role) {
  if (!ROLES.includes(role)) {
    throw new Error(`Rol no válido. Roles permitidos: ${ROLES.join(', ')}.`);
  }
}

async function queryUser(username) {
  validateUsername(username);
  const { data, error } = await supabase
    .from('users')
    .select('username, role, created_at')
    .eq('username', username)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo consultar Supabase: ${error.message}`);
  }
  return data;
}

export async function getUser(username) {
  return queryUser(username);
}

export async function addUser(username, role) {
  validateUsername(username);
  validateRole(role);

  const { data, error } = await supabase
    .from('users')
    .insert({ username, role })
    .select('username, role, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`${username} ya está registrado.`);
    }
    throw new Error(`No se pudo agregar a ${username}: ${error.message}`);
  }
  return data;
}

export async function updateUserRole(username, role) {
  validateUsername(username);
  validateRole(role);

  const { data, error } = await supabase
    .from('users')
    .update({ role })
    .eq('username', username)
    .select('username, role')
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar a ${username}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`${username} no está registrado.`);
  }
  return data;
}

export async function removeUser(username) {
  validateUsername(username);
  const { data, error } = await supabase
    .from('users')
    .delete()
    .eq('username', username)
    .select('username')
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo eliminar a ${username}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`${username} no está registrado.`);
  }
  return data;
}
