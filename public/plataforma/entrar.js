const form = document.getElementById("form");
const error = document.getElementById("error");
const boton = document.getElementById("entrar");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  error.textContent = "";
  boton.disabled = true;
  try {
    const r = await fetch("/api/plataforma/entrar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clave: document.getElementById("clave").value }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      location.href = "/plataforma/";
      return;
    }
    error.textContent = j.error || "No se pudo entrar.";
  } catch {
    error.textContent = "No hay conexión. Intente de nuevo.";
  } finally {
    boton.disabled = false;
  }
});
