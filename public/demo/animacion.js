// Tarjeta animada del encabezado de la demo
import { montarAntesDespues, EJEMPLO_WHATSAPP } from "../componentes/antes-despues.js";

montarAntesDespues(document.getElementById("animacion-demo"), EJEMPLO_WHATSAPP, {
    etiqueta: "Ejemplo",
    columnas: ["variedad", "largo", "cajas", "tallos", "precio"],
    tiempos: { linea: 400, lectura: 550, pausaLectura: 400, resultado: 2600 },
});
