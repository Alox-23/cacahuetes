## Arranque del portátil

Desde la carpeta del proyecto, en **Windows** abre `lanzar.cmd` (requiere Windows con winget). En **macOS o Fedora** ejecuta `bash lanzar.sh`. Ejecuta el lanzador con tu usuario habitual. El instalador de Ollama puede solicitar permisos de administrador.

La primera ejecución necesita internet para instalar Node 22, las dependencias, Ollama y el modelo Qwen2.5 7B (4,7 GB). Vuelve a usar el mismo comando después: reutiliza las dependencias y el modelo, recompila la web y sirve frontend y API en el puerto 3000. Abre la dirección de localhost o de la intranet que aparece en la consola. Ctrl+C detiene la web; Ollama sigue disponible en el portátil.

Las rutas y las cuentas se conservan en `.cacahuete/postgres` con PGlite. Si defines `DATABASE_URL` en `backend/.env`, el lanzador migra y usa ese PostgreSQL. Puedes ajustar `PORT` u `OLLAMA_MODEL` en el mismo archivo. Usa un puerto libre y ejecuta una sola instancia por carpeta de datos. Consulta [la guía de intranet](backend/README.md) para el firewall.

# cacahuetes
Web app para turistas
