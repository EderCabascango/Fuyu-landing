"""
Script: generar_datos_finca.py
Propósito: Generar datos sintéticos realistas para la finca ficticia 'Rosas del Valle (DEMO)'
en Cayambe/Tabacundo para alimentar la Demo Web interactiva de Fuyu (Fase 1 y Fase 2).
Semilla fija (seed=42) para reproducibilidad total. Ningún dato real ni empresa real.
"""

import os
import json
import math
import random

# Fijamos semilla para total reproducibilidad
random.seed(42)

# --- DEFINICIÓN DE PARÁMETROS DE LA FINCA ---
FINCA_NOMBRE = "Rosas del Valle (DEMO)"
UBICACION = "Cayambe - Pedro Moncayo, Ecuador"
ALTITUD = "2,880 msnm"
AREA_TOTAL_HA = 12.5

VARIEDADES = [
    {
        "id": "freedom",
        "nombre": "Freedom",
        "color": "Rojo Clásico",
        "hex": "#D32F2F",
        "productividad_base": 1.35,  # tallos/planta/mes base
        "multiplicador_valentin": 2.45,
        "multiplicador_madre": 2.10,
        "ciclo_dias": 100,
        "sensibilidad_enfermedad": 0.05
    },
    {
        "id": "explorer",
        "nombre": "Explorer",
        "color": "Rojo Terciopelo",
        "hex": "#8B0000",
        "productividad_base": 1.15,
        "multiplicador_valentin": 2.50,
        "multiplicador_madre": 1.95,
        "ciclo_dias": 108,
        "sensibilidad_enfermedad": 0.04
    },
    {
        "id": "mondial",
        "nombre": "Mondial",
        "color": "Blanco Nupcial",
        "hex": "#E0E0E0",
        "productividad_base": 1.25,
        "multiplicador_valentin": 1.65,
        "multiplicador_madre": 2.25,
        "ciclo_dias": 102,
        "sensibilidad_enfermedad": 0.08  # más sensible a botrytis
    },
    {
        "id": "playa_blanca",
        "nombre": "Playa Blanca",
        "color": "Blanco Puro",
        "hex": "#FFFFFF",
        "productividad_base": 1.10,
        "multiplicador_valentin": 1.70,
        "multiplicador_madre": 2.15,
        "ciclo_dias": 105,
        "sensibilidad_enfermedad": 0.06
    },
    {
        "id": "vendela",
        "nombre": "Vendela",
        "color": "Marfil / Crema",
        "hex": "#FFFDD0",
        "productividad_base": 1.20,
        "multiplicador_valentin": 1.80,
        "multiplicador_madre": 1.90,
        "ciclo_dias": 102,
        "sensibilidad_enfermedad": 0.05
    },
    {
        "id": "pink_floyd",
        "nombre": "Pink Floyd",
        "color": "Fucsia Intenso",
        "hex": "#E91E63",
        "productividad_base": 1.05,
        "multiplicador_valentin": 2.10,
        "multiplicador_madre": 2.35,
        "ciclo_dias": 104,
        "sensibilidad_enfermedad": 0.07
    }
]

LARGOS = [40, 50, 60, 70, 80]  # cm

# 12 Bloques con condiciones microclimáticas y tecnológicas diferenciadas
BLOQUES = [
    # Sector El Río (Suelo bajo, plástico antiguo, mayor humedad)
    {"id": 1, "sector": "El Río", "area_ha": 0.95, "plantas": 68000, "variedad": "Mondial", "tasa_descarte_base": 0.115, "tasa_nacional_base": 0.095, "causa_principal": "Botrytis por condensación"},
    {"id": 2, "sector": "El Río", "area_ha": 1.00, "plantas": 72000, "variedad": "Freedom", "tasa_descarte_base": 0.108, "tasa_nacional_base": 0.088, "causa_principal": "Velloso y tallos torcidos"},
    {"id": 3, "sector": "El Río", "area_ha": 0.90, "plantas": 65000, "variedad": "Pink Floyd", "tasa_descarte_base": 0.122, "tasa_nacional_base": 0.098, "causa_principal": "Botrytis y deformidad botón"},
    
    # Sector Central (Plano, riego tecnificado óptimo, plástico 2do año)
    {"id": 4, "sector": "Central", "area_ha": 1.10, "plantas": 82000, "variedad": "Freedom", "tasa_descarte_base": 0.062, "tasa_nacional_base": 0.055, "causa_principal": "Daño mecánico en malla"},
    {"id": 5, "sector": "Central", "area_ha": 1.15, "plantas": 85000, "variedad": "Explorer", "tasa_descarte_base": 0.058, "tasa_nacional_base": 0.052, "causa_principal": "Trips localizado"},
    {"id": 6, "sector": "Central", "area_ha": 1.05, "plantas": 78000, "variedad": "Vendela", "tasa_descarte_base": 0.065, "tasa_nacional_base": 0.058, "causa_principal": "Quemadura de sol ligera"},
    {"id": 7, "sector": "Central", "area_ha": 1.00, "plantas": 75000, "variedad": "Playa Blanca", "tasa_descarte_base": 0.068, "tasa_nacional_base": 0.054, "causa_principal": "Mancha de agua pétalo"},
    {"id": 8, "sector": "Central", "area_ha": 1.10, "plantas": 80000, "variedad": "Freedom", "tasa_descarte_base": 0.059, "tasa_nacional_base": 0.051, "causa_principal": "Daño mecánico en deschuponado"},
    
    # Sector La Loma (Naves altas, ventilación cenital automatizada, camas con sustrato)
    {"id": 9, "sector": "La Loma", "area_ha": 1.10, "plantas": 84000, "variedad": "Explorer", "tasa_descarte_base": 0.038, "tasa_nacional_base": 0.035, "causa_principal": "Selección estricta largo"},
    {"id": 10, "sector": "La Loma", "area_ha": 1.05, "plantas": 80000, "variedad": "Vendela", "tasa_descarte_base": 0.042, "tasa_nacional_base": 0.038, "causa_principal": "Corte prematuro ocasional"},
    {"id": 11, "sector": "La Loma", "area_ha": 1.00, "plantas": 76000, "variedad": "Playa Blanca", "tasa_descarte_base": 0.045, "tasa_nacional_base": 0.040, "causa_principal": "Roce con plástico lateral"},
    {"id": 12, "sector": "La Loma", "area_ha": 1.10, "plantas": 83000, "variedad": "Mondial", "tasa_descarte_base": 0.048, "tasa_nacional_base": 0.042, "causa_principal": "Falta de calibre en botón"}
]

CLIENTES = [
    {"id": "CL-01", "nombre": "Miami Petals Wholesaler", "pais": "EE. UU.", "mercado": "Norteamérica", "tipo_habitual": "Contrato Fijo"},
    {"id": "CL-02", "nombre": "Eurasia Premium Blooms", "pais": "Rusia", "mercado": "Europa del Este", "tipo_habitual": "Contrato Fijo"},
    {"id": "CL-03", "nombre": "Royal Amsterdam Flowers", "pais": "Holanda", "mercado": "Europa Occidental", "tipo_habitual": "Contrato Fijo"},
    {"id": "CL-04", "nombre": "Maple Leaf Floral Direct", "pais": "Canadá", "mercado": "Norteamérica", "tipo_habitual": "Venta Abierta"},
    {"id": "CL-05", "nombre": "New York Event Florals", "pais": "EE. UU.", "mercado": "Norteamérica", "tipo_habitual": "Venta Abierta"},
    {"id": "CL-06", "nombre": "Alpine Roses Zurich", "pais": "Suiza", "mercado": "Europa Occidental", "tipo_habitual": "Venta Abierta"},
    {"id": "CL-07", "nombre": "Sunbelt Distributors Texas", "pais": "EE. UU.", "mercado": "Norteamérica", "tipo_habitual": "Venta Abierta"},
    {"id": "CL-08", "nombre": "St. Petersburg Imperial Flor", "pais": "Rusia", "mercado": "Europa del Este", "tipo_habitual": "Contrato Fijo"}
]

# --- FUNCIONES DE CÁLCULO ESTACIONAL ---
def get_curva_estacionalidad(semana):
    """
    Retorna el factor multiplicador de corte para una semana del año (1 a 52).
    Pico 1: San Valentín (semanas 3, 4 y 5 - pico máximo semana 4).
    Pico 2: Día de la Madre (semanas 16, 17 y 18 - pico semana 17).
    Valle 1: Post-Valentín (semanas 7 y 8, caída por descanso de plantas).
    Verano: Semanas 28 a 34 (producción estable, demanda más baja en Europa).
    """
    # Base constante 1.0
    factor = 1.0
    
    # San Valentín (pico de corte entre semanas 2 y 5)
    if semana == 2:
        factor = 1.45
    elif semana == 3:
        factor = 2.10
    elif semana == 4:
        factor = 2.65  # Semana cumbre de corte y despacho
    elif semana == 5:
        factor = 1.95
    elif semana == 6:
        factor = 1.15
    elif semana in [7, 8]:
        factor = 0.72  # Valle post-temporada
        
    # Día de la Madre (pico semanas 16 a 18)
    elif semana == 15:
        factor = 1.35
    elif semana == 16:
        factor = 1.95
    elif semana == 17:
        factor = 2.30  # Semana cumbre Día de la Madre
    elif semana == 18:
        factor = 1.70
    elif semana in [19, 20]:
        factor = 0.80
        
    # Verano y resto de semanas: ligera oscilación natural (+/- 8%)
    else:
        oscilacion = 0.08 * math.sin((semana - 25) * 0.25)
        factor = 0.95 + oscilacion
        
    return factor

def get_distribucion_largos(variedad_nombre):
    """
    Distribución promedio de largos por variedad (% de 40, 50, 60, 70, 80 cm).
    Explorer y Freedom producen tallos más largos.
    Pink Floyd y Mondial tienen proporción mayor de 50-60 cm.
    """
    if variedad_nombre in ["Explorer", "Playa Blanca"]:
        return {40: 0.05, 50: 0.18, 60: 0.35, 70: 0.28, 80: 0.14}
    elif variedad_nombre in ["Freedom", "Vendela"]:
        return {40: 0.08, 50: 0.24, 60: 0.36, 70: 0.22, 80: 0.10}
    else:  # Pink Floyd, Mondial
        return {40: 0.10, 50: 0.30, 60: 0.35, 70: 0.18, 80: 0.07}

# --- GENERADOR PRINCIPAL ---
def generar_dataset_completo():
    historico_semanal = []
    
    # Generamos 2 años de datos históricos (Año 1 y Año 2, 52 semanas c/u)
    for anio in [1, 2]:
        for sem in range(1, 53):
            factor_estacion = get_curva_estacionalidad(sem)
            
            # Ligera variación climática interanual
            ruido_clima_anio = 0.98 if anio == 1 else 1.02
            
            registro_semana = {
                "anio": anio,
                "semana": sem,
                "factor_estacional": round(factor_estacion, 3),
                "cosecha_total_bruta": 0,
                "descarte_total": 0,
                "nacional_total": 0,
                "exportable_total": 0,
                "pedidos_fijos_total": 0,
                "pedidos_abiertos_total": 0,
                "pedidos_totales": 0,
                "por_variedad": {},
                "por_bloque": []
            }
            
            # Inicializamos acumulador por variedad
            for v in VARIEDADES:
                registro_semana["por_variedad"][v["nombre"]] = {
                    "cosecha_bruta": 0,
                    "descarte": 0,
                    "nacional": 0,
                    "exportable": 0,
                    "pedidos_fijos": 0,
                    "pedidos_abiertos": 0,
                    "pedidos_totales": 0,
                    "largos_exportables": {str(l): 0 for l in LARGOS}
                }
            
            # Producimos por bloque
            for b in BLOQUES:
                v_obj = next(item for item in VARIEDADES if item["nombre"] == b["variedad"])
                
                # Producción semanal base del bloque (tallos/semana)
                prod_semanal_base = (b["plantas"] * v_obj["productividad_base"]) / 4.33
                
                # Multiplicador específico de la variedad para esta temporada
                if sem in [2, 3, 4, 5]:
                    mult_temporada = v_obj["multiplicador_valentin"]
                    # Suavizamos curva alrededor del pico de la semana 4
                    pico_dist = abs(sem - 4)
                    factor_temp_var = 1.0 + (mult_temporada - 1.0) * math.exp(-0.7 * (pico_dist ** 2))
                elif sem in [15, 16, 17, 18]:
                    mult_temporada = v_obj["multiplicador_madre"]
                    pico_dist = abs(sem - 17)
                    factor_temp_var = 1.0 + (mult_temporada - 1.0) * math.exp(-0.7 * (pico_dist ** 2))
                else:
                    factor_temp_var = factor_estacion
                
                # Ruido aleatorio por bloque (+/- 4%)
                ruido_bloque = random.uniform(0.96, 1.04)
                
                cosecha_bruta = int(prod_semanal_base * factor_temp_var * ruido_clima_anio * ruido_bloque)
                
                # Tasas de descarte y flor nacional del bloque con ligera variación climática
                ruido_tasa = random.uniform(0.95, 1.08)
                pct_descarte = min(0.18, round(b["tasa_descarte_base"] * ruido_tasa, 4))
                pct_nacional = min(0.15, round(b["tasa_nacional_base"] * ruido_tasa, 4))
                
                descarte_tallos = int(cosecha_bruta * pct_descarte)
                nacional_tallos = int(cosecha_bruta * pct_nacional)
                exportable_tallos = cosecha_bruta - descarte_tallos - nacional_tallos
                
                dist_largos = get_distribucion_largos(b["variedad"])
                largos_tallos = {}
                for l in LARGOS:
                    largos_tallos[str(l)] = int(exportable_tallos * dist_largos[l])
                
                # Ajuste de redondeo
                dif_redondeo = exportable_tallos - sum(largos_tallos.values())
                largos_tallos["60"] += dif_redondeo
                
                # Guardamos registro por bloque
                registro_semana["por_bloque"].append({
                    "bloque_id": b["id"],
                    "sector": b["sector"],
                    "variedad": b["variedad"],
                    "cosecha_bruta": cosecha_bruta,
                    "descarte_tallos": descarte_tallos,
                    "pct_descarte": round(pct_descarte * 100, 2),
                    "nacional_tallos": nacional_tallos,
                    "pct_nacional": round(pct_nacional * 100, 2),
                    "exportable_tallos": exportable_tallos,
                    "largos": largos_tallos
                })
                
                # Acumulamos en variedad
                var_dict = registro_semana["por_variedad"][b["variedad"]]
                var_dict["cosecha_bruta"] += cosecha_bruta
                var_dict["descarte"] += descarte_tallos
                var_dict["nacional"] += nacional_tallos
                var_dict["exportable"] += exportable_tallos
                for l in LARGOS:
                    var_dict["largos_exportables"][str(l)] += largos_tallos[str(l)]
                
                # Acumulamos en totales semana
                registro_semana["cosecha_total_bruta"] += cosecha_bruta
                registro_semana["descarte_total"] += descarte_tallos
                registro_semana["nacional_total"] += nacional_tallos
                registro_semana["exportable_total"] += exportable_tallos
            
            # --- MODELADO DE PEDIDOS (FIJOS Y ABIERTOS) ---
            # En San Valentín (semanas 3, 4, 5) los pedidos de rojas explotan
            for v_nombre, v_data in registro_semana["por_variedad"].items():
                exp = v_data["exportable"]
                
                if sem == 4:
                    # SEMANA CUMBRE SAN VALENTÍN: DEMANDA EXTREMA
                    if v_nombre == "Freedom":
                        # Caso de riesgo real: Pedidos superan disponibilidad en 11% (DÉFICIT)
                        fijos = int(exp * 0.72)
                        abiertos = int(exp * 0.39)  # Total 1.11x exportable
                    elif v_nombre == "Explorer":
                        # Caso de riesgo real: Pedidos superan disponibilidad en 7% (DÉFICIT)
                        fijos = int(exp * 0.75)
                        abiertos = int(exp * 0.32)  # Total 1.07x exportable
                    elif v_nombre == "Vendela":
                        # Vendela muy ajustada (99% vendida)
                        fijos = int(exp * 0.80)
                        abiertos = int(exp * 0.19)
                    elif v_nombre == "Mondial":
                        # Mondial con ligero sobrante (91% vendida, 9% disponible)
                        fijos = int(exp * 0.60)
                        abiertos = int(exp * 0.31)
                    else:  # Playa Blanca, Pink Floyd
                        fijos = int(exp * 0.55)
                        abiertos = int(exp * 0.35)
                elif sem in [2, 3]:
                    # Semanas de arranque de San Valentín
                    fijos = int(exp * 0.68)
                    abiertos = int(exp * 0.28)
                elif sem == 5:
                    # Cierre de San Valentín: pedidos de rojas desaceleran
                    fijos = int(exp * 0.60)
                    abiertos = int(exp * 0.25)
                elif sem in [7, 8]:
                    # Valle Post-Valentín: SOBRANTE ALTO (demanda caída a 65%)
                    fijos = int(exp * 0.50)
                    abiertos = int(exp * 0.15)
                elif sem in [16, 17]:
                    # Día de la Madre: Rosas de color y blancas en alta demanda
                    if v_nombre in ["Pink Floyd", "Mondial", "Playa Blanca"]:
                        fijos = int(exp * 0.70)
                        abiertos = int(exp * 0.35)  # Déficit en colores!
                    else:
                        fijos = int(exp * 0.60)
                        abiertos = int(exp * 0.25)
                else:
                    # Resto del año estándar (~85% colocado entre fijos y venta abierta)
                    fijos = int(exp * random.uniform(0.58, 0.65))
                    abiertos = int(exp * random.uniform(0.20, 0.28))
                
                v_data["pedidos_fijos"] = fijos
                v_data["pedidos_abiertos"] = abiertos
                v_data["pedidos_totales"] = fijos + abiertos
                v_data["disponible_neto"] = exp - (fijos + abiertos)
                
                # Semáforo de riesgo comercial
                if v_data["disponible_neto"] < 0:
                    v_data["semaforo"] = "rojo"      # Falta flor, riesgo de incumplimiento
                elif v_data["disponible_neto"] < (exp * 0.05):
                    v_data["semaforo"] = "amarillo"  # Ajustado al límite (< 5% margen)
                else:
                    v_data["semaforo"] = "verde"     # Con inventario disponible para venta abierta
                
                registro_semana["pedidos_fijos_total"] += fijos
                registro_semana["pedidos_abiertos_total"] += abiertos
                registro_semana["pedidos_totales"] += (fijos + abiertos)
            
            historico_semanal.append(registro_semana)
            
    return historico_semanal

# Generamos los datasets
historico = generar_dataset_completo()

# --- EXTRACCIÓN DE VISTAS ESPECÍFICAS PARA LA DEMO WEB (FASE 2) ---

# Vista 1: Resumen de la Semana Cumbre de San Valentín (Año 2, Semana 4)
semana_activa = next(s for s in historico if s["anio"] == 2 and s["semana"] == 4)

resumen_semanal_data = {
    "finca": FINCA_NOMBRE,
    "ubicacion": UBICACION,
    "semana": 4,
    "anio": 2027,
    "periodo": "22 Ene - 28 Ene 2027 (Ventana Pico San Valentín)",
    "kpis_globales": {
        "tallos_cosechados_brutos": semana_activa["cosecha_total_bruta"],
        "descarte_tallos": semana_activa["descarte_total"],
        "pct_descarte": round((semana_activa["descarte_total"] / semana_activa["cosecha_total_bruta"]) * 100, 2),
        "nacional_tallos": semana_activa["nacional_total"],
        "pct_nacional": round((semana_activa["nacional_total"] / semana_activa["cosecha_total_bruta"]) * 100, 2),
        "tallos_exportables": semana_activa["exportable_total"],
        "pct_exportabilidad": round((semana_activa["exportable_total"] / semana_activa["cosecha_total_bruta"]) * 100, 2),
        "pedidos_fijos": semana_activa["pedidos_fijos_total"],
        "pedidos_abiertos": semana_activa["pedidos_abiertos_total"],
        "pedidos_totales": semana_activa["pedidos_totales"],
        "disponibilidad_neta": semana_activa["exportable_total"] - semana_activa["pedidos_totales"],
        "estado_general": "Riesgo de déficit en variedades rojas (Freedom / Explorer)"
    },
    "variedades": []
}

for v in VARIEDADES:
    v_info = semana_activa["por_variedad"][v["nombre"]]
    resumen_semanal_data["variedades"].append({
        "id": v["id"],
        "nombre": v["nombre"],
        "color": v["color"],
        "hex": v["hex"],
        "cosecha_bruta": v_info["cosecha_bruta"],
        "descarte": v_info["descarte"],
        "nacional": v_info["nacional"],
        "exportable": v_info["exportable"],
        "pedidos_fijos": v_info["pedidos_fijos"],
        "pedidos_abiertos": v_info["pedidos_abiertos"],
        "pedidos_totales": v_info["pedidos_totales"],
        "disponible_neto": v_info["disponible_neto"],
        "semaforo": v_info["semaforo"],
        "largos": v_info["largos_exportables"]
    })

# Vista 2: Proyección de Cosecha San Valentín (Semanas 1 a 6) con modelo explicable y bandas P10/P50/P90
semanas_valentin = [s for s in historico if s["anio"] == 2 and 1 <= s["semana"] <= 6]
semanas_valentin_anterior = [s for s in historico if s["anio"] == 1 and 1 <= s["semana"] <= 6]

proyeccion_valentin_data = {
    "finca": FINCA_NOMBRE,
    "temporada": "San Valentín 2027",
    "ventana_semanas": [1, 2, 3, 4, 5, 6],
    "fechas_referencia": {
        "1": "01 Ene - 07 Ene",
        "2": "08 Ene - 14 Ene",
        "3": "15 Ene - 21 Ene",
        "4": "22 Ene - 28 Ene (Pico de corte)",
        "5": "29 Ene - 04 Feb (Últimos despachos)",
        "6": "05 Feb - 11 Feb (Cierre post-fiesta)"
    },
    "modelo_utilizado": {
        "nombre": "Curva Fenológica Ponderada con Factor de Acumulación Térmica (Degree-Days) y Censo de Botón",
        "justificacion": (
            "No se usa una 'caja negra'. El modelo proyecta la cosecha a partir de los datos históricos del año previo, "
            "corregidos por el censo de brotación realizado 15 semanas antes (semanas 39-42) y ajustados con el promedio de "
            "horas de sol registradas. La banda inferior P10 simula un escenario de días fríos/nublados que retardan el corte, "
            "mientras la banda P90 simula un adelanto por temperaturas diurnas elevadas."
        ),
        "margen_error_historico": "+/- 4.2%"
    },
    "semanas": []
}

for i, s2 in enumerate(semanas_valentin):
    s1 = semanas_valentin_anterior[i]
    sem_num = s2["semana"]
    
    # Proyección con banda
    p50 = s2["exportable_total"]
    p10 = int(p50 * 0.91)  # -9% por frío o demora
    p90 = int(p50 * 1.07)  # +7% por maduración acelerada
    
    # Detalle por variedad en la semana
    det_variedades = {}
    for v in VARIEDADES:
        v_nom = v["nombre"]
        v_exp = s2["por_variedad"][v_nom]["exportable"]
        det_variedades[v_nom] = {
            "p10": int(v_exp * 0.90),
            "p50": v_exp,
            "p90": int(v_exp * 1.08),
            "pedidos_comprometidos": s2["por_variedad"][v_nom]["pedidos_totales"],
            "brecha": v_exp - s2["por_variedad"][v_nom]["pedidos_totales"]
        }
        
    proyeccion_valentin_data["semanas"].append({
        "semana": sem_num,
        "fecha": proyeccion_valentin_data["fechas_referencia"][str(sem_num)],
        "historico_ano_anterior": s1["exportable_total"],
        "proyectado_p50": p50,
        "banda_inferior_p10": p10,
        "banda_superior_p90": p90,
        "pedidos_comprometidos": s2["pedidos_totales"],
        "pedidos_fijos": s2["pedidos_fijos_total"],
        "pedidos_abiertos": s2["pedidos_abiertos_total"],
        "balance_neto": p50 - s2["pedidos_totales"],
        "detalle_variedades": det_variedades
    })

# Vista 3: Pedidos vs Disponibilidad (Semana 4 - Pico San Valentín)
# Generamos órdenes individuales ficticias que alimentan el desglose de cobertura
pedidos_detalle = []
order_id_counter = 1001

random.seed(88)  # Semilla local para consistencia de pedidos
for cl in CLIENTES:
    num_pedidos_cliente = random.randint(3, 6)
    for _ in range(num_pedidos_cliente):
        v = random.choice(VARIEDADES)
        l = random.choice([50, 60, 70, 80])
        tipo = cl["tipo_habitual"] if random.random() > 0.3 else ("Venta Abierta" if cl["tipo_habitual"] == "Contrato Fijo" else "Contrato Fijo")
        
        # Cantidad de tallos en cajas (Full Boxes de 300 o 350 tallos aprox)
        cajas = random.randint(15, 60)
        tallos_caja = 300 if l >= 70 else 350
        tallos = cajas * tallos_caja
        
        # Estado de riesgo según variedad
        if v["nombre"] in ["Freedom", "Explorer"] and l in [60, 70] and tipo == "Venta Abierta":
            estado = "En Riesgo" if random.random() > 0.4 else "Sobrevendido"
        elif v["nombre"] in ["Freedom", "Explorer"] and tipo == "Contrato Fijo":
            estado = "Cubierto (Prioritario)"
        else:
            estado = "Cubierto"
            
        pedidos_detalle.append({
            "order_id": f"ORD-2027-{order_id_counter}",
            "cliente": cl["nombre"],
            "mercado": cl["mercado"],
            "pais": cl["pais"],
            "tipo": tipo,
            "variedad": v["nombre"],
            "largo_cm": l,
            "cajas_equivalentes": cajas,
            "tallos_solicitados": tallos,
            "fecha_vuelo": random.choice(["2027-01-24", "2027-01-26", "2027-01-27", "2027-01-28"]),
            "estado": estado
        })
        order_id_counter += 1

pedidos_disponibilidad_data = {
    "finca": FINCA_NOMBRE,
    "semana": 4,
    "total_ordenes": len(pedidos_detalle),
    "resumen_estados": {
        "cubiertos": len([p for p in pedidos_detalle if "Cubierto" in p["estado"]]),
        "en_riesgo": len([p for p in pedidos_detalle if p["estado"] == "En Riesgo"]),
        "sobrevendidos": len([p for p in pedidos_detalle if p["estado"] == "Sobrevendido"])
    },
    "pedidos": pedidos_detalle
}

# Vista 4: Pérdidas por Bloque (Descarte y Flor Nacional) - Ranking
perdidas_bloques_data = {
    "finca": FINCA_NOMBRE,
    "semana_analizada": 4,
    "periodo": "Semana Pico San Valentín 2027",
    "precio_referencia_exportacion_tallo": 0.58,  # Promedio San Valentín en finca (USD)
    "precio_referencia_nacional_tallo": 0.12,     # Venta en mercado nacional local (USD)
    "bloques_ranking": []
}

ranking_temp = []
for b in semana_activa["por_bloque"]:
    b_meta = next(item for item in BLOQUES if item["id"] == b["bloque_id"])
    
    # Pérdida económica = (tallos descarte * precio_exportacion) + (tallos nacional * (precio_exportacion - precio_nacional))
    perdida_descarte_usd = round(b["descarte_tallos"] * 0.58, 2)
    perdida_nacional_usd = round(b["nacional_tallos"] * (0.58 - 0.12), 2)
    perdida_total_usd = round(perdida_descarte_usd + perdida_nacional_usd, 2)
    
    pct_perdida_total = round(((b["descarte_tallos"] + b["nacional_tallos"]) / b["cosecha_bruta"]) * 100, 2)
    
    ranking_temp.append({
        "bloque_id": b["bloque_id"],
        "sector": b["sector"],
        "variedad": b["variedad"],
        "area_ha": b_meta["area_ha"],
        "plantas": b_meta["plantas"],
        "causa_principal": b_meta["causa_principal"],
        "cosecha_bruta": b["cosecha_bruta"],
        "descarte_tallos": b["descarte_tallos"],
        "pct_descarte": b["pct_descarte"],
        "nacional_tallos": b["nacional_tallos"],
        "pct_nacional": b["pct_nacional"],
        "pct_perdida_total": pct_perdida_total,
        "exportable_tallos": b["exportable_tallos"],
        "perdida_estimada_usd": perdida_total_usd
    })

# Ordenamos de mayor pérdida económica a menor
ranking_temp.sort(key=lambda x: x["perdida_estimada_usd"], reverse=True)
for puesto, b_item in enumerate(ranking_temp, start=1):
    b_item["puesto_ranking"] = puesto
    perdidas_bloques_data["bloques_ranking"].append(b_item)

# Guardamos los archivos JSON en assets/data/
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(os.path.join(OUTPUT_DIR, "resumen_semanal.json"), "w", encoding="utf-8") as f:
    json.dump(resumen_semanal_data, f, indent=2, ensure_ascii=False)

with open(os.path.join(OUTPUT_DIR, "proyeccion_valentin.json"), "w", encoding="utf-8") as f:
    json.dump(proyeccion_valentin_data, f, indent=2, ensure_ascii=False)

with open(os.path.join(OUTPUT_DIR, "pedidos_disponibilidad.json"), "w", encoding="utf-8") as f:
    json.dump(pedidos_disponibilidad_data, f, indent=2, ensure_ascii=False)

with open(os.path.join(OUTPUT_DIR, "perdidas_bloques.json"), "w", encoding="utf-8") as f:
    json.dump(perdidas_bloques_data, f, indent=2, ensure_ascii=False)

# Guardamos un resumen con metadatos de la finca
finca_meta = {
    "finca": FINCA_NOMBRE,
    "ubicacion": UBICACION,
    "altitud": ALTITUD,
    "area_total_ha": AREA_TOTAL_HA,
    "num_bloques": len(BLOQUES),
    "variedades": [v["nombre"] for v in VARIEDADES],
    "largos": LARGOS,
    "bloques": BLOQUES,
    "clientes": CLIENTES
}
with open(os.path.join(OUTPUT_DIR, "finca_metadata.json"), "w", encoding="utf-8") as f:
    json.dump(finca_meta, f, indent=2, ensure_ascii=False)

print(f"OK: Datasets generados con éxito en {OUTPUT_DIR}")
print(f"- resumen_semanal.json ({len(resumen_semanal_data['variedades'])} variedades)")
print(f"- proyeccion_valentin.json ({len(proyeccion_valentin_data['semanas'])} semanas)")
print(f"- pedidos_disponibilidad.json ({len(pedidos_disponibilidad_data['pedidos'])} pedidos)")
print(f"- perdidas_bloques.json ({len(perdidas_bloques_data['bloques_ranking'])} bloques rankeados)")
print(f"- finca_metadata.json")
