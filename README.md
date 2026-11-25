<p align="center"><img src="frontend/public/mascot/cacahuete.svg" width="104" alt="Mascota de Cacahuete"></p><h1 align="center">Cacahuete</h1>
<p align="center"><strong>Un guía local para recorrer Marbella a pie</strong></p><p align="center">
  <a href="#arranque-rápido"><img alt="Lanzadores para Fedora, macOS y Windows" src="https://img.shields.io/badge/Fedora%20%C2%B7%20macOS%20%C2%B7%20Windows-334155?style=flat-square"></a>
  <a href="#cómo-funciona"><img alt="Modelo local con Ollama" src="https://img.shields.io/badge/modelo_local-Ollama-386641?style=flat-square"></a>
  <a href="LICENSE"><img alt="Licencia MIT" src="https://img.shields.io/badge/licencia-MIT-a65a20?style=flat-square"></a>
</p><p align="center"><a href="#arranque-rápido">Arranque rápido</a> · <a href="#requisitos-de-equipo">Requisitos</a> · <a href="#acceso-desde-el-móvil">Acceso móvil</a> · <a href="#cómo-funciona">Arquitectura</a> · <a href="#configuración-del-servidor">Configuración</a> · <a href="#desarrollo-y-pruebas">Desarrollo</a></p>«Salgo de la plaza de los Naranjos. Tengo una hora y media y me apetecen museos y tapas».

Cacahuete recoge el punto de partida, el tiempo disponible y los intereses del visitante. Al confirmar la propuesta, el visitante recibe una ruta con las paradas en el mapa y una estimación del tiempo de paseo y visita. Puede acortarla, cambiar una parada o guardarla en su cuenta.

En el evento, un portátil sirve la aplicación y ejecuta el modelo de lenguaje. Los visitantes abren la web desde el móvil conectado a la intranet y pueden empezar como invitados.
Arranque rápido
En el portátil que hará de servidor, clona el repositorio y entra en su carpeta. Git selecciona la rama principal (main) por defecto.
git clone https://github.com/Alox-23/cacahuetes.git
cd cacahuetes
Si has descargado el proyecto como ZIP, descomprímelo y abre la carpeta que contiene lanzar.sh y lanzar.cmd.
Sistema del portátil	Comando desde la raíz
Fedora o macOS	bash lanzar.sh
Windows con PowerShell	.\lanzar.cmd (también admite doble clic)


Haz el primer arranque con internet y con tu usuario habitual. El lanzador prepara Node.js 22, instala las dependencias, compila la web, instala Ollama si hace falta y descarga dos modelos: qwen2.5:7b, que redacta las respuestas (unos 4,7 GB), y qwen2.5:3b, que decide qué cambio aplicar a la ruta (unos 1,9 GB). Después los carga en memoria. En Fedora puede pedir la contraseña de sudo durante la instalación. En Windows necesita winget para instalar Ollama.

Espera a que la consola muestre las direcciones de acceso. En el portátil, abre http://localhost:3000. Para los siguientes arranques usa el mismo comando. Ctrl+C detiene la web, la API y el Ollama que haya arrancado el lanzador. Si Ollama ya estaba abierto, sigue en ejecución y el lanzador descarga los dos modelos de memoria.
Requisitos de equipo
Los modelos se ejecutan en el portátil servidor. Para una primera prueba con qwen2.5:7b y qwen2.5:3b, utiliza las siguientes cifras como referencia de planificación. El mínimo exacto y el número de visitantes simultáneos dependen del equipo y de la longitud de las conversaciones.
Recurso del servidor	Mínimo orientativo para probar	Recomendado para la demostración
Procesador	CPU de 64 bits compatible con Ollama y Node.js 22	CPU moderna de cuatro núcleos o más
Memoria	Unos 10 GB de RAM disponibles para mantener los dos modelos cargados en CPU	16 GB de RAM instalada o más para el sistema, los modelos y la aplicación
Almacenamiento	Reserva 12 GB libres para los modelos, las herramientas y las dependencias	SSD con 15 GB libres o más para disponer de margen durante la instalación
Gráficos	Puede ejecutarse en CPU	Una GPU compatible con Ollama o un Mac con Apple Silicon reduce la espera al generar respuestas
Red	Internet en la instalación inicial y acceso a la intranet durante la demo	Portátil y visitantes en una red que permita conexiones entre dispositivos


Los modelos predeterminados ocupan unos 4,7 GB y 1,9 GB de descarga. Antes del evento, pide una ruta y luego un cambio, como quitar una parada, desde un móvil para comprobar el tiempo de respuesta del equipo. Si las respuestas tardan demasiado, consulta las alternativas para portátiles solo con CPU en la [guía del backend](backend/README.md). Ficha de Qwen2.5 7B en Ollama · Ficha de Qwen2.5 3B en Ollama

Dispositivo del visitante: basta un móvil, una tableta o un ordenador con navegador actualizado y acceso a la misma intranet. Toda la instalación se realiza en el servidor.
Acceso desde el móvil
1. Conecta el portátil y el móvil a la red del evento.
2. En la consola del portátil, busca la línea Intranet del adaptador Wi-Fi o Ethernet. El servidor da prioridad a las direcciones 10.10.83.x. Si el router le asigna 10.10.83.57, por ejemplo, abre http://10.10.83.57:3000 en el móvil.
3. Para comprobar la conexión y la base de datos, abre /api/cacahuete?action=health en esa misma dirección. La respuesta debe incluir "ok":true. Para probar el flujo de la aplicación, pide una ruta desde la plaza de los Naranjos con una hora disponible.
La IP se detecta en cada arranque. Si cambia durante el evento, reinicia el lanzador y comparte la nueva URL. Si la web abre en el portátil pero el móvil agota el tiempo de espera, comprueba la IP, que el firewall del portátil permita TCP 3000 desde la intranet y que la Wi-Fi permita conexiones entre dispositivos. El puerto de Ollama se utiliza dentro del portátil.
Cómo funciona
Componente	Responsabilidad
Frontend · React, TypeScript y Vite	Conversación, preferencias, mapa e itinerarios. El lanzador compila la web para que consuma la API en su mismo origen.
Backend · Node.js	Gestiona sesiones y rutas. El planificador selecciona las paradas del catálogo de Marbella y estima los tiempos de visita y desplazamiento.
Modelo local · Ollama	Decide qué acción del planificador ejecutar en cada mensaje (crear la ruta, cambiar el horario, añadir o quitar una parada, deshacer…) y narra el resultado a partir del catálogo y del recorrido. El planificador es quien calcula las paradas y los horarios. Si el modelo falla o supera el tiempo de espera, el chat sigue funcionando con reglas y plantillas.
Persistencia · PGlite o PostgreSQL	El lanzador usa PGlite por defecto y conserva los datos entre arranques. También admite un servidor PostgreSQL configurado por el equipo.


Configuración del servidor
El arranque por defecto funciona sin crear un archivo de configuración. Para personalizarlo, usa backend/.env y reinicia el lanzador. Las opciones disponibles están en [.env.example](backend/.env.example).
Variable	Valor por defecto con el lanzador	Uso
PORT	3000	Puerto compartido por la web y la API. Si lo cambias, ajusta también el firewall.
OLLAMA_MODEL	qwen2.5:7b	Modelo que redacta las respuestas. El lanzador lo comprueba y lo descarga si falta.
OLLAMA_AGENT_MODEL	qwen2.5:3b	Modelo que decide qué acción del planificador ejecuta cada mensaje. El lanzador lo comprueba y lo descarga si falta.
OLLAMA_BASE_URL	http://127.0.0.1:11434/v1	Dirección de Ollama que utiliza el backend.
OLLAMA_STOP_ON_EXIT	started	Al detener el lanzador: started detiene el Ollama que arrancó el lanzador y, si Ollama ya estaba abierto, descarga de memoria los dos modelos; always además cierra ese Ollama; never lo deja todo en ejecución.
DATABASE_URL	Sin definir	Si se configura, el lanzador aplica las migraciones a PostgreSQL.


Con la configuración predeterminada, los datos se guardan en .cacahuete/postgres. Usa una sola instancia del servidor por carpeta de datos. Para comprobar qué modelos están instalados en el portátil, ejecuta ollama list.
Desarrollo y pruebas
El código de la interfaz está en [](frontend/) y la lógica de la aplicación en [](backend/). Tras instalar las dependencias con el lanzador, puedes ejecutar desde la raíz, con Node.js 22.13 o posterior de la serie 22 y npm disponibles en la terminal:
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run build
La [guía del backend](backend/README.md) documenta el contrato HTTP, las migraciones, el catálogo y el entrenamiento del clasificador de preferencias. La [guía del frontend](frontend/README.md) detalla cómo desarrollar la interfaz y conectarla a la API.
Licencia
El código se distribuye bajo la licencia MIT. Las fotografías del catálogo incluyen sus [créditos de autoría](frontend/public/places/creditos.txt).
