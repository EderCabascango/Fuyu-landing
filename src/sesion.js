// Acceso a la plataforma: una contraseña (secreto CLAVE_PLATAFORMA) y una sesión firmada (secreto
// SECRETO_SESION) guardada en una cookie que el navegador no deja leer a JavaScript.
// Si falta alguno de los dos secretos, nadie entra (falla cerrado).

const COOKIE = "fuyu_plataforma";
const DURACION_S = 12 * 60 * 60; // 12 horas

const codificar = new TextEncoder();

async function llaveHmac(secreto) {
  return crypto.subtle.importKey("raw", codificar.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (hex) => new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16)));

export function configurado(env) {
  return Boolean(env.CLAVE_PLATAFORMA && env.SECRETO_SESION && env.SECRETO_SESION.length >= 32);
}

// Compara la contraseña sin dar pistas por el tiempo de respuesta
export async function claveCorrecta(env, intento) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", codificar.encode(String(intento ?? ""))),
    crypto.subtle.digest("SHA-256", codificar.encode(env.CLAVE_PLATAFORMA)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function crearCookie(env) {
  const vence = Math.floor(Date.now() / 1000) + DURACION_S;
  const firma = aHex(await crypto.subtle.sign("HMAC", await llaveHmac(env.SECRETO_SESION), codificar.encode(String(vence))));
  return `${COOKIE}=${vence}.${firma}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_S}`;
}

export function cookieVencida() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function sesionValida(request, env) {
  if (!configurado(env)) return false;
  const cookies = request.headers.get("cookie") || "";
  const valor = cookies.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!valor) return false;
  const [vence, firma] = valor.split(".");
  if (!/^\d+$/.test(vence || "") || !/^[0-9a-f]{64}$/.test(firma || "")) return false;
  if (Number(vence) < Date.now() / 1000) return false;
  return crypto.subtle.verify("HMAC", await llaveHmac(env.SECRETO_SESION), deHex(firma), codificar.encode(vence));
}
