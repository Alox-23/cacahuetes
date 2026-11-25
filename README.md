## Arranque del portátil

Desde la carpeta del proyecto, en **Windows** abre `lanzar.cmd` (requiere Windows con winget). En **macOS o Fedora** ejecuta `bash lanzar.sh`. Ejecuta el lanzador con tu usuario habitual. El instalador de Ollama puede solicitar permisos de administrador.

La primera ejecución necesita internet para instalar Node 22, las dependencias, Ollama y el modelo Qwen2.5 7B (4,7 GB). Vuelve a usar el mismo comando después: reutiliza las dependencias y el modelo, recompila la web y sirve frontend y API en el puerto 3000. Abre la dirección de localhost o de la intranet que aparece en la consola. Ctrl+C detiene la web; Ollama sigue disponible en el portátil.

Las rutas y las cuentas se conservan en `.cacahuete/postgres` con PGlite. Si defines `DATABASE_URL` en `backend/.env`, el lanzador migra y usa ese PostgreSQL. Puedes ajustar `PORT` u `OLLAMA_MODEL` en el mismo archivo. Usa un puerto libre y ejecuta una sola instancia por carpeta de datos. Consulta [la guía de intranet](backend/README.md) para el firewall.

### Abrir Cacahuete desde un móvil

Conecta el portátil y el móvil a la intranet y arranca Cacahuete en el portátil. Cuando la consola muestre `Intranet (Wi-Fi)` o `Intranet (Ethernet)`, abre esa URL en el móvil. Si el router entrega `10.10.83.57`, por ejemplo, la URL será `http://10.10.83.57:3000`. La consola muestra primero las direcciones `10.10.83.x` y también identifica los demás adaptadores por su nombre.

La IP se detecta en cada arranque. Si cambia mientras el servidor está abierto, reinicia el lanzador y comparte la nueva URL. Puedes comprobar la conexión desde el móvil abriendo `/api/cacahuete?action=health` en la misma dirección. La respuesta debe incluir `"ok":true`. Ollama funciona en el propio portátil.

# cacahuetes
Web app para turistas
