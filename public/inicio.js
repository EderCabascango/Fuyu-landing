// Tarjeta animada de la portada
import { montarAntesDespues, EJEMPLO_CORREO_ERRORES } from "./componentes/antes-despues.js";

montarAntesDespues(document.getElementById("animacion-portada"), EJEMPLO_CORREO_ERRORES, {
    etiqueta: "Ejemplo con datos ficticios",
    columnas: ["variedad", "cajas", "tallos", "precio"],
    enlace: { href: "/demo/", texto: "Pruébelo con un pedido de ejemplo →" },
});
