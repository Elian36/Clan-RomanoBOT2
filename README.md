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
| `%stock` | Cuenta las cajas de kit disponibles en el Ender Chest. |
| `%add <usuario> <rol>` | Agrega un usuario. Solo para `lider`. |
| `%role <usuario> <nuevo_rol>` | Cambia el rol. Solo para `lider`. |
| `%remove <usuario>` | Elimina un usuario. Solo para `lider`. |
| `%stop` | Desconecta el bot y desactiva la reconexión automática. Solo para `lider`. En Railway, reinicia el servicio manualmente para volver a conectarlo. |
| `%sethome` | Guarda `/sethome aa` en la ubicación actual del bot. Disponible para usuarios registrados. |

Roles: `lider`, `miembro_honorable`, `miembro`.

## Preparación de kits y TPA

- El bot debe tener cerca (máximo 32 bloques) un Ender Chest accesible con el kit guardado dentro.
- Guarda cada kit como una caja shulker con estas etiquetas visibles/NBT: líder `Lideres kit del C.R`; miembro `Miembro kit del C.R`; honorable `m.h kit del C.R`. Para detectar la shulker honorable se usa esa etiqueta completa; `miembro_honorable` sigue siendo el nombre del rol en la base de datos, no una etiqueta adicional de shulker. No importa el uso de mayúsculas ni puntos en los nombres de kit. Cada caja contada equivale a una entrega. Las shulkers sin etiqueta de rol no se asignan a ningún kit.
- `%stock` cuenta las shulkers que el bot lleva en su inventario y las que siguen dentro del Ender Chest; ignora códigos de color de Minecraft y muestra los nombres sin clasificar y el número de slots revisados para ayudar a diagnosticar problemas.
- `%kit` usa primero una shulker del rol correspondiente que el bot ya lleva; si no tiene una, la busca y la retira del Ender Chest.
- `%kit` mueve una caja coincidente al inventario, envía `/tpa <usuario>`, espera un mensaje del servidor que indique aceptación, se acerca al jugador y arroja la caja.
- Tras confirmar que la shulker salió del inventario, vuelve a `/home aa`. Si la entrega ocurrió a menos de 20.000 bloques horizontales del spawn, envía las coordenadas por privado a los líderes registrados que estén conectados. Si no hay ninguno, ejecuta `/kill` y, si el servidor muestra un mensaje de confirmación que coincide con `KILL_CONFIRM_REGEX`, envía `KILL_CONFIRM_COMMAND` (por defecto `/kill confirm`) para respawnear en la cama. Ajusta esas variables al texto y comando de confirmación que use el servidor.
- Coloca el bot junto al Ender Chest y ejecuta `%sethome` para fijar `aa`. Antes de revisar stock o retirar kits, volverá con `/home aa`; asegúrate de tener el Ender Chest a 32 bloques o menos de esa ubicación.
- Los textos de aceptación de TPA varían entre servidores. Ajusta `TPA_ACCEPT_REGEX` en `.env` al mensaje real del servidor (debe incluir el username del jugador y el texto de aceptación) y `TPA_TIMEOUT_MS` al tiempo de espera deseado. Si la expresión no coincide, el bot no arroja el kit y el comando informa que expiró.
- No se detecta aceptación solo porque el jugador se teletransporte; se requiere que el servidor emita texto coincidente con la expresión configurada.
- El servidor puede restringir bots, comandos, TPA o interacción con Ender Chests. Respeta sus reglas y verifica el flujo en un entorno permitido antes de dejarlo funcionando.

## Configuración opcional

El bot mueve la cabeza cada 60 segundos para mantenerse activo. Configura `ANTI_AFK_INTERVAL_MS` para ajustar el intervalo (mínimo 10000 ms). `HOME_COMMAND_DELAY_MS` controla cuánto espera tras `/home aa` antes de abrir el Ender Chest (por defecto 5000 ms). `SPAWN_X` y `SPAWN_Z` definen las coordenadas X/Z del spawn para la comprobación de distancia (por defecto 0, 0). `KILL_CONFIRM_REGEX` y `KILL_CONFIRM_COMMAND` configuran la aceptación del respawn alternativo. También están documentados `MINECRAFT_HOST`, `MINECRAFT_PORT`, `MINECRAFT_VERSION`, `RECONNECT_DELAY_MS`, `TPA_TIMEOUT_MS` y `TPA_ACCEPT_REGEX` en `.env.example`. Si se omite `MINECRAFT_VERSION`, Mineflayer intenta detectar la versión.

## Desplegar el bot en Railway

Supabase aloja la base de datos, no un proceso Mineflayer persistente. Para mantener la conexión TCP con Minecraft, despliega este proyecto como un servicio worker en Railway:

1. En Railway, crea un proyecto y elige **Deploy from GitHub repo**; selecciona `Elian36/Clan-RomanoBOT2` y la rama `main`.
2. Abre el servicio y ve a **Variables**. Añade las variables privadas del `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MINECRAFT_USERNAME`, `MINECRAFT_PASSWORD`, `MINECRAFT_HOST=8b8t.me`, `MINECRAFT_PORT=25565`, `RECONNECT_DELAY_MS=10000`, `HOME_COMMAND_DELAY_MS=5000`, `ANTI_AFK_INTERVAL_MS=60000`, `TPA_TIMEOUT_MS=120000` y `TPA_ACCEPT_REGEX`.
3. No definas `MINECRAFT_AUTH` para la cuenta que inicia sesión con `/login`. Railway tomará Node.js y `npm start` del proyecto; [`railway.json`](./railway.json) configura el reinicio automático del worker.
4. En **Deployments**, espera el deploy y revisa los logs. Deben indicar conexión a `8b8t.me:25565`, aparición en el mundo y envío de `/login`.

Las variables de Railway son privadas; nunca pongas credenciales en el repositorio o en la configuración pública. Mantén un solo servicio conectado con esta cuenta de Minecraft para evitar sesiones duplicadas. Railway requiere una cuenta/servicio con disponibilidad de ejecución continua según sus condiciones y plan vigentes.

Si los logs muestran `already connected to this proxy`, detén cualquier proceso local y revisa que Railway tenga una sola réplica del servicio. El bot ahora detiene los reintentos cuando detecta ese rechazo para no generar un ciclo de logs; cierra la otra sesión y reinicia el deployment de Railway.

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
