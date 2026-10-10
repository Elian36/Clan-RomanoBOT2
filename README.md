# Clan Romano Minecraft Bot

Bot de Mineflayer para `8b8t.me:25565`, con comandos de chat autorizados mediante los roles de Supabase.

## Requisitos

- Node.js 20 o superior y npm.
- Una cuenta existente de Minecraft que pueda conectarse a 8b8t. Si el servidor usa `/login`, configura `MINECRAFT_PASSWORD`; para una cuenta Microsoft, usa `MINECRAFT_AUTH=microsoft`.
- Un proyecto de Supabase.

## Configuración

1. Instala dependencias:

   ```powershell
   npm install
   ```

2. Edita `.env`:
   - `SUPABASE_URL`: URL del proyecto.
   - `SUPABASE_SERVICE_ROLE_KEY`: clave secreta de servidor (service role). Se requiere para las operaciones administrativas del bot y no debe compartirse, publicarse ni incluirse en mensajes.
   - `MINECRAFT_USERNAME`: nombre de la cuenta del bot.
   - `MINECRAFT_PASSWORD`: opcional; el bot enviará `/login <contraseña>` una vez después de aparecer en el mundo. Déjalo vacío si el servidor no requiere ese comando.
   - `MINECRAFT_AUTH`: usa `microsoft` solo para el inicio de sesión Microsoft; déjalo vacío si el servidor utiliza `/login`.

   `.env` está excluido de Git. Las contraseñas y claves deben permanecer solo en ese archivo. La clave publishable/anon no sustituye la clave de servicio requerida por este bot. No pongas la clave de servicio en código, en `NEXT_PUBLIC_*`, ni en `.env.example`.

3. En Supabase, abre el SQL Editor y ejecuta [`supabase/schema.sql`](./supabase/schema.sql). El esquema agrega a `wNeofor` como líder inicial si todavía no existe.

4. Inicia el bot:

   ```powershell
   npm start
   ```

   Para comprobar sintaxis:

   ```powershell
   npm run check
   ```

## Comandos de chat

Los usernames se buscan exactamente como aparecen en Minecraft. Los comandos pueden enviarse por chat o mensaje privado. El bot consulta Supabase antes de ejecutar cada comando; los usuarios no registrados reciben un mensaje privado de denegación.

| Comando | Uso |
| --- | --- |
| `%yo` | Muestra por privado si el jugador está registrado y su rol. |
| `%kit` | Solicita el kit asociado a su rol. |
| `%stock` | Cuenta las cajas de kit disponibles en el Ender Chest. Solo para `lider`. |
| `%registro <miembro>` | Muestra los últimos 10 comandos registrados de ese jugador con fecha/hora UTC, rol y coordenadas. Solo para `lider`. |
| `%add <usuario> <rol>` | Agrega un usuario. Solo para `lider`. |
| `%role <usuario> <nuevo_rol>` | Cambia el rol. Solo para `lider`. |
| `%remove <usuario>` | Elimina un usuario. Solo para `lider`. |
| `%stop` | Desconecta el bot y desactiva la reconexión automática. Solo para `lider`. En Debian, usa `./scripts/start-or-restart.sh` para iniciarlo otra vez. |
| `%sethome` | Guarda `/sethome zs` en la ubicación actual del bot. Solo para `lider`. |
| `%kill` | Mata al bot. Solo para `lider`; al respawnear volverá automáticamente a `/home zs`. |
| `%restock` | Busca un cofre doble a 3 bloques o menos y repone con sus kits el Ender Chest. Si el Ender Chest se llena, devuelve el sobrante al mismo cofre. Solo para `lider`. |
| `%limpiar b` | Retira del Ender Chest lo que no sean kits, camina 32 bloques para soltarlo y vuelve a `/home zs`. Solo para `lider`. |
| `%limpiar a` | Saca los kits del Ender Chest y los guarda en un cofre simple a 2 bloques o menos. Solo para `lider`. |

Roles: `lider`, `miembro_honorable`, `miembro`.

## Preparación de kits y TPA

Para guardar el historial en Supabase, vuelve a ejecutar [`supabase/schema.sql`](./supabase/schema.sql) en el SQL Editor; crea la tabla protegida `command_history` sin borrar los usuarios existentes. Desde entonces se registran los comandos `%` enviados por cualquier usuario registrado, junto con su rol y coordenadas disponibles en ese momento. `%registro <miembro>` muestra hasta los 10 usos más recientes; las fechas se presentan en UTC. El comando está limitado a líderes porque expone ubicaciones. Los registros empiezan al aplicar el esquema y no incluyen actividad anterior.

- El bot debe tener cerca (máximo 32 bloques) un Ender Chest accesible con el kit guardado dentro.
- Guarda cada kit como una caja shulker con estas etiquetas visibles/NBT: líder `Lideres kit del C.R`; miembro `Miembro kit del C.R`; honorable `m.h kit del C.R`, `M.H` o `MH`. No importa el uso de mayúsculas ni puntos en los nombres de kit. `miembro_honorable` sigue siendo el nombre del rol en la base de datos. Cada caja contada equivale a una entrega. Las shulkers sin etiqueta de rol no se asignan a ningún kit.
- `%stock` cuenta las shulkers que el bot lleva en su inventario y las que siguen dentro del Ender Chest; ignora códigos de color de Minecraft y muestra los nombres sin clasificar y el número de slots revisados para ayudar a diagnosticar problemas.
- `%kit` usa primero una shulker del rol correspondiente que el bot ya lleva; si no tiene una, la transfiere a un slot vacío del inventario con una operación de movimiento antes de cerrar el Ender Chest.
- `%kit` mueve una caja coincidente al inventario, registra la posición antes de enviar `/tpa <usuario>` y detecta la llegada por `forcedMove` o por cambio de posición. Al llegar, arroja la shulker en su posición actual; no depende de localizar ni navegar hacia la entidad del jugador.
- Después de que el jugador acepta el `/tpa` y el bot llega, aumenta temporalmente la velocidad de giro vertical, mira bruscamente hacia abajo (pitch Mineflayer `-Math.PI / 2`) y espera 24 ticks antes de soltar el objeto. Luego restaura la velocidad de giro normal. No se gira antes del TPA porque el teletransporte reemplaza esa orientación. Tras confirmar la entrega, envía `/home zs` inmediatamente. Si la entrega ocurre a menos de 15.000 bloques horizontales del spawn, ejecuta `/kill` enseguida para respawnear y volver automáticamente a `/home zs`.
- El bot recuerda el bloque exacto de `zs` durante la sesión y omite `/home zs` cuando ya está en ese bloque, para evitar comandos repetidos en `%kit`, `%stock`, `%restock` y `%limpiar`. `%sethome` actualiza esa posición. Después de reiniciar el proceso la posición guardada en memoria se pierde; la primera operación que requiera la home ejecutará `/home zs` una vez y volverá a recordar el bloque.
- Coloca el bot junto al Ender Chest y ejecuta `%sethome` para fijar `zs`. Antes de revisar stock o retirar kits, volverá con `/home zs`; asegúrate de tener el Ender Chest a 32 bloques o menos de esa ubicación.
- `%restock` localiza únicamente un cofre doble (54 slots) dentro de 3 bloques, recoge las shulkers clasificadas como kits y llena el Ender Chest. Si no caben todas, el sobrante se devuelve al cofre doble de origen.
- `%limpiar b` mueve todas las cosas del Ender Chest que no coincidan con un kit a slots libres del inventario. Si no caben todas, aborta antes de mover nada. Después camina 32 bloques, las suelta y regresa a `/home zs`.
- `%limpiar a` requiere un cofre simple (27 slots) dentro de 2 bloques y suficiente capacidad libre para todos los kits que va a mover. Si no caben, aborta antes de moverlos.
- El texto de aceptación de TPA varía entre servidores. `TPA_ACCEPT_REGEX` puede ajustarse para reconocerlo; la llegada también se detecta por el evento de teletransporte o cambio de posición, así que un texto distinto no bloquea la entrega. `TPA_TIMEOUT_MS` controla el tiempo máximo de espera; si no se detecta aceptación ni teletransporte, el bot cancela la entrega.
- El servidor puede restringir bots, comandos, TPA o interacción con Ender Chests. Respeta sus reglas y verifica el flujo en un entorno permitido antes de dejarlo funcionando.

## Configuración opcional

El bot mueve la cabeza cada 60 segundos para mantenerse activo. Configura `ANTI_AFK_INTERVAL_MS` para ajustar el intervalo (mínimo 10000 ms). `HOME_COMMAND_DELAY_MS` controla cuánto espera tras `/home zs` antes de abrir el Ender Chest (por defecto 5000 ms). `SPAWN_X` y `SPAWN_Z` definen las coordenadas X/Z del spawn para la comprobación de distancia (por defecto 0, 0). También están documentados `MINECRAFT_HOST`, `MINECRAFT_PORT`, `MINECRAFT_VERSION`, `RECONNECT_DELAY_MS`, `TPA_TIMEOUT_MS` y `TPA_ACCEPT_REGEX` en `.env.example`. Si se omite `MINECRAFT_VERSION`, Mineflayer intenta detectar la versión.

## Ejecutar como servicio en Debian

Usa una sola instancia del bot para esta cuenta de Minecraft. Antes de arrancarla en Debian, detén el servicio de Railway y desactiva su despliegue automático o desvincula el repositorio desde el panel de Railway. Este proyecto no puede detener un servicio remoto de Railway por sí solo.

1. Instala Git, Node.js 20 o superior y npm. Verifica `node --version` y `npm --version`.
2. Clona el repositorio en la carpeta `Clan-RomanoBOT2` dentro de tu directorio personal y entra en ella:

   ```bash
   git clone https://github.com/Elian36/Clan-RomanoBOT2.git ~/Clan-RomanoBOT2
   cd ~/Clan-RomanoBOT2
   ```

3. Instala dependencias y configura el archivo privado `.env`:

   ```bash
   npm ci
   cp .env.example .env
   chmod 600 .env
   nano .env
   ```

   Completa las variables de Supabase y Minecraft siguiendo la sección **Configuración**. No copies `.env` a GitHub.

4. Inicia el servicio por primera vez:

   ```bash
   chmod +x scripts/start-or-restart.sh
   ./scripts/start-or-restart.sh
   ```

   El script instala/actualiza una unidad systemd del usuario, la habilita al inicio de sesión y arranca el bot. Si ya estaba activo, lo reinicia. Para que systemd lo mantenga activo después de cerrar sesión y al reiniciar Debian, habilita lingering una sola vez:

   ```bash
   sudo loginctl enable-linger "$USER"
   ```

   Para crear un acceso directo ejecutable en el escritorio y poder iniciar o reiniciar el bot con doble clic:

   ```bash
   chmod +x scripts/install-desktop-launcher.sh
   ./scripts/install-desktop-launcher.sh
   ```

   Después, abre **Clan Romano Bot** desde el escritorio. Si el entorno gráfico pregunta, elige **Permitir ejecutar** / **Allow Launching**. El acceso directo abre una terminal para mostrar el estado y cualquier error.

5. Consulta los logs y el estado:

   ```bash
   systemctl --user status clan-romano-bot
   journalctl --user -u clan-romano-bot -f
   ```

   Usa `./scripts/start-or-restart.sh` después de actualizar el código o de `%stop`; el script reinicia la unidad si ya estaba encendida. Para detenerla manualmente: `systemctl --user stop clan-romano-bot`.

El servicio usa la instalación de Node.js visible en `PATH` al ejecutar el script. Si actualizas Node desde un gestor de versiones, vuelve a ejecutar el script para actualizar la ruta usada por systemd.

## Inicializar Git y publicar en GitHub

En la carpeta del proyecto, configura tu identidad de Git si todavía no lo hiciste. No incluyas `.env` en el commit.

```powershell
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/Elian36/Clan-RomanoBOT2.git
git push -u origin main
```

Si `origin` ya existe, actualízalo en lugar de volver a agregarlo:

```powershell
git remote set-url origin https://github.com/Elian36/Clan-RomanoBOT2.git
```

Si Git no tiene tu identidad configurada, establece nombre y correo antes de hacer el commit:

```powershell
git config --global user.name "Tu nombre"
git config --global user.email "tu-correo@example.com"
```
