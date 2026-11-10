# Fuyu – sitio y demo

Sitio de Fuyu en Cloudflare Workers. Los archivos públicos están en `public/`; el código del servidor en `src/worker.js`.

- `/` portada
- `/demo` demo "Pedidos y documentos sin digitar"
- `POST /api/procesar` lee un pedido o una factura con Groq (no guarda nada)

## Probar en local

```bash
npm install
cp .dev.vars.example .dev.vars   # y ponga su clave real de Groq en .dev.vars
npx wrangler dev
```

Abra http://localhost:8787/demo

`.dev.vars` está en `.gitignore`: la clave nunca se sube al repo.

## Cargar la clave en Cloudflare

Opción A, desde la terminal (una sola vez; queda guardada como secreto del Worker):

```bash
npx wrangler login
npx wrangler secret put GROQ_API_KEY
```

Opción B, desde el panel: Workers & Pages → `fuyu` → Settings → Variables and Secrets → Add → tipo **Secret**, nombre `GROQ_API_KEY`.

## Configuración (wrangler.jsonc → `vars`)

| Variable | Para qué |
|---|---|
| `GROQ_MODELO_TEXTO` | Modelo para texto (correos, WhatsApp, PDF con texto, Excel). Hoy `openai/gpt-oss-120b`. |
| `GROQ_MODELO_VISION` | Modelo para fotos y PDF escaneados. Hoy `qwen/qwen3.8-27b` (en vista previa en Groq). |
| `TAMANO_MAXIMO_BYTES` | Tamaño máximo de lo que se envía (2 MB). |

El límite de uso por IP (5 documentos por minuto) está en `ratelimits` dentro de `wrangler.jsonc`.
Cloudflare solo permite ventanas de 10 o 60 segundos.

## Documentos de ejemplo

Se generan con `python scripts/generar_ejemplos.py` (necesita reportlab, openpyxl y pillow) en `public/demo/ejemplos/`.
El catálogo ficticio de la finca está en `public/demo/catalogo.json`.
