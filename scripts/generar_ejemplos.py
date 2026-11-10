"""Genera los documentos de ejemplo de la demo (todos ficticios).

Uso:  python scripts/generar_ejemplos.py
Salida: public/demo/ejemplos/
Requiere: reportlab, openpyxl, pillow
"""
import io
import random
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

SALIDA = Path(__file__).resolve().parent.parent / "public" / "demo" / "ejemplos"
SALIDA.mkdir(parents=True, exist_ok=True)
random.seed(7)

CLIENTE_FINCA = "ROSAS DEL VALLE (EJEMPLO) S.A."
RUC_FINCA = "1792345678001"
DIR_FINCA = "Vía Cayambe – Olmedo km 4, Cayambe, Pichincha"


def escribir(nombre, texto):
    (SALIDA / nombre).write_text(texto.strip() + "\n", encoding="utf-8")


# ------------------------------------------------------------------ pedidos de texto

escribir("pedido_correo_ingles.txt", """
From: Michael Turner <purchasing@bloomfieldwholesale.com>
To: ventas@rosasdelvalle-ejemplo.com
Date: Mon, Nov 9, 2026 at 4:12 PM
Subject: PO #BW-4471 – Thanksgiving week

Hi Carolina,

Hope all is well at the farm. Please confirm the order below for Thanksgiving week.
Ship date: Wednesday, November 18, 2026 (arriving MIA on the 19th).

PO #BW-4471 – Bloomfield Wholesale Inc., Miami FL

  • Freedom 60 cm – 12 HB, 10 bunches x 25 stems per box – $0.42/stem (3,000 stems)
  • Explorer 70 cm – 6 HB, 8 bunches x 25 stems – $0.55/stem (1,200 stems)
  • Mondial 50 cm – 4 QB, 5 bunches x 25 stems – $0.38/stem (500 stems)
  • Pink Floyd 60 cm – 3 QB, 5 bunches x 25 stems – $0.45/stem (375 stems)

Same packing as last time please: sleeves with our logo, UPC labels on each bunch.
Let me know ASAP if anything is short so we can sub with another red.

Thanks!
Michael Turner
Purchasing Manager | Bloomfield Wholesale Inc.
8200 NW 25th St, Doral, FL 33122
""")

escribir("pedido_whatsapp.txt", """
[10/11/26, 08:14] Andrés – Floristería Los Andes: Buenos días Caro 🌹
[10/11/26, 08:14] Andrés – Floristería Los Andes: te paso el pedido para Santiago
[10/11/26, 08:15] Andrés – Floristería Los Andes: para el sábado 21 de noviembre porfa
[10/11/26, 08:15] Andrés – Floristería Los Andes: 10 cajas de freedom en 50
[10/11/26, 08:17] Andrés – Floristería Los Andes: y unas 3 qb de playa blanca 40
[10/11/26, 08:17] Andrés – Floristería Los Andes: ahh y 2 de vendela 60 pero que sean QB
[10/11/26, 08:20] Carolina Rosas del Valle: Buenos días Andrés! Las freedom en HB?
[10/11/26, 08:22] Andrés – Floristería Los Andes: si HB. corrijo: freedom 6 HB en 50 y 4 HB en 60
[10/11/26, 08:22] Andrés – Floristería Los Andes: las HB de 10 bonches y las QB de 5, bonches de 25 normal
[10/11/26, 08:23] Andrés – Floristería Los Andes: precio el mismo de la otra vez, 0.30 la freedom y 0.28 lo blanco
[10/11/26, 08:23] Andrés – Floristería Los Andes: gracias!! 🙏
""")

escribir("pedido_con_errores.txt", """
From: Jennifer Liu <orders@sunrisefloral.ca>
To: ventas@rosasdelvalle-ejemplo.com
Date: Tue, Nov 10, 2026 at 9:03 AM
Subject: New order SF-2290 for Dec 2

Hello,

Please book the following for delivery on December 2, 2026 (Toronto, Canada).
Customer: Sunrise Floral Distribution Ltd.
Order: SF-2290

Freedom 60 cm ...... 8 HB x 10 bunches x 25 stems = 2,000 stems @ $0.48
Pink Moonlight 50 cm  4 QB x 5 bunches x 25 stems = 500 stems @ $0.50
Explorer 70 cm ..... 6 HB x 8 bunches x 25 stems = 1,400 stems @ $0.60
Mondial 60 cm ...... 3 QB x 5 bunches x 25 stems = 375 stems @ $0.44

Total: 21 boxes / 4,275 stems

Kind regards,
Jennifer Liu
Sunrise Floral Distribution Ltd. – Mississauga, ON
""")

# ------------------------------------------------------------------ pedido en PDF (tabla)

def pdf_pedido():
    ruta = SALIDA / "pedido_tabla.pdf"
    doc = SimpleDocTemplate(str(ruta), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm)
    st_t = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=16, leading=20)
    st = ParagraphStyle("n", fontName="Helvetica", fontSize=9.5, leading=13)
    st_b = ParagraphStyle("b", parent=st, fontName="Helvetica-Bold")
    el = [
        Paragraph("TSVETOK IMPORT LLC", st_t),
        Paragraph("Ul. Lesnaya 43, Moscow 127055, Russia · tel. +7 495 000 0000 · import@tsvetok-import.ru", st),
        Spacer(1, 10),
        Paragraph("PURCHASE ORDER / ZAKAZ", st_b),
        Spacer(1, 4),
    ]
    info = Table(
        [["Order No.:", "TS-2026-1187", "Supplier:", "Rosas del Valle (ejemplo)"],
         ["Order date:", "09.11.2026", "Delivery date:", "25.11.2026"],
         ["Destination:", "Moscow (SVO), Russia", "Cargo agent:", "Ecuador Cargo Express"]],
        colWidths=[26 * mm, 50 * mm, 28 * mm, 70 * mm])
    info.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9),
                              ("FONT", (2, 0), (2, -1), "Helvetica-Bold", 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    el += [info, Spacer(1, 12)]
    filas = [["#", "Variety", "Length", "Boxes", "Box", "Bunches/box", "Stems/bunch", "Total stems", "Price/stem USD", "Amount USD"]]
    datos = [("Explorer", 80, 10, "HB", 8, 20, 0.68), ("Freedom", 70, 8, "HB", 10, 25, 0.55),
             ("Vendela", 60, 5, "QB", 5, 25, 0.40), ("Playa Blanca", 50, 4, "QB", 6, 25, 0.35),
             ("Mondial", 80, 6, "HB", 8, 25, 0.62)]
    tot_cajas = tot_tallos = tot_valor = 0
    for i, (v, l, c, t, b, s, p) in enumerate(datos, 1):
        tallos = c * b * s
        tot_cajas += c; tot_tallos += tallos; tot_valor += tallos * p
        filas.append([i, v, f"{l} cm", c, t, b, s, f"{tallos:,}", f"{p:.2f}", f"{tallos * p:,.2f}"])
    filas.append(["", "TOTAL", "", tot_cajas, "", "", "", f"{tot_tallos:,}", "", f"{tot_valor:,.2f}"])
    tabla = Table(filas, repeatRows=1, colWidths=[7 * mm, 26 * mm, 15 * mm, 12 * mm, 10 * mm, 19 * mm, 19 * mm, 19 * mm, 20 * mm, 20 * mm])
    tabla.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8), ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
        ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 8.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2b3a55")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9aa3b5")), ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#eef1f6")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    el += [tabla, Spacer(1, 14),
           Paragraph("Packing: bunches with sleeve, 1 label per box with variety and length. Payment: 30 days after arrival.", st),
           Spacer(1, 30), Paragraph("_____________________________<br/>Elena Morozova – Purchasing", st)]
    doc.build(el)


# ------------------------------------------------------------------ pedido en Excel

def excel_pedido():
    wb = Workbook()
    ws = wb.active
    ws.title = "Order"
    negrita = Font(bold=True)
    ws["A1"] = "VAN DER BERG FLOWERS B.V."; ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = "Legmeerdijk 313, 1431 GB Aalsmeer, Netherlands"
    ws["A4"], ws["B4"] = "Order reference", "VDB-88412"
    ws["A5"], ws["B5"] = "Grower", "Rosas del Valle (ejemplo) – Ecuador"
    ws["A6"], ws["B6"] = "Delivery date", "1 Dec 2026"
    ws["A7"], ws["B7"] = "Destination", "Amsterdam (AMS), Netherlands"
    for c in ("A4", "A5", "A6", "A7"):
        ws[c].font = negrita
    cab = ["Variety", "Length (cm)", "Boxes", "Box type", "Bunches per box", "Stems per bunch", "Price per stem (USD)", "Remarks"]
    fila0 = 9
    relleno = PatternFill("solid", fgColor="1F4E3D")
    borde = Border(*(Side(style="thin", color="B0B7C3"),) * 4)
    for j, h in enumerate(cab, 1):
        c = ws.cell(row=fila0, column=j, value=h)
        c.font = Font(bold=True, color="FFFFFF"); c.fill = relleno; c.border = borde
        c.alignment = Alignment(horizontal="center", wrap_text=True)
    lineas = [("Vendela", 50, 6, "QB", 6, 25, 0.36, ""), ("Pink Floyd", 50, 4, "QB", 6, 25, 0.40, "open cut"),
              ("Freedom", 50, 10, "HB", 12, 25, 0.33, ""), ("Mondial", 60, 5, "HB", 10, 25, 0.45, "strong heads")]
    for i, l in enumerate(lineas, 1):
        for j, v in enumerate(l, 1):
            c = ws.cell(row=fila0 + i, column=j, value=v); c.border = borde
    ws.cell(row=fila0 + len(lineas) + 2, column=1, value="Please send availability for Christmas week as well.")
    for col, ancho in zip("ABCDEFGH", (16, 12, 8, 10, 15, 15, 18, 16)):
        ws.column_dimensions[col].width = ancho
    wb.save(SALIDA / "pedido_excel.xlsx")


# ------------------------------------------------------------------ facturas

def factura_pdf(nombre, prov, ruc, dir_prov, numero, fecha, autorizacion, items, subtotal, iva, total, tarifa=15):
    ruta = SALIDA / nombre
    c = rl_canvas.Canvas(str(ruta), pagesize=A4)
    W, H = A4
    x0 = 18 * mm
    c.setFont("Helvetica-Bold", 14); c.drawString(x0, H - 22 * mm, prov)
    c.setFont("Helvetica", 8.5)
    c.drawString(x0, H - 27 * mm, dir_prov)
    c.drawString(x0, H - 31 * mm, "Obligado a llevar contabilidad: SÍ")
    # recuadro derecho
    c.setStrokeColor(colors.HexColor("#555555")); c.roundRect(W - 92 * mm, H - 52 * mm, 74 * mm, 36 * mm, 3, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 9); c.drawString(W - 88 * mm, H - 22 * mm, f"R.U.C.: {ruc}")
    c.setFont("Helvetica-Bold", 12); c.drawString(W - 88 * mm, H - 29 * mm, "FACTURA")
    c.setFont("Helvetica", 9); c.drawString(W - 88 * mm, H - 35 * mm, f"No. {numero}")
    c.setFont("Helvetica", 7); c.drawString(W - 88 * mm, H - 41 * mm, "NÚMERO DE AUTORIZACIÓN")
    c.drawString(W - 88 * mm, H - 45 * mm, autorizacion)
    c.drawString(W - 88 * mm, H - 49 * mm, "AMBIENTE: PRODUCCIÓN   EMISIÓN: NORMAL")
    # cliente
    y = H - 62 * mm
    c.setFont("Helvetica", 8.5)
    c.drawString(x0, y, f"Razón social / Cliente: {CLIENTE_FINCA}")
    c.drawString(x0, y - 5 * mm, f"RUC / CI: {RUC_FINCA}")
    c.drawString(x0 + 95 * mm, y - 5 * mm, f"Fecha de emisión: {fecha}")
    c.drawString(x0, y - 10 * mm, f"Dirección: {DIR_FINCA}")
    # tabla
    filas = [["Cant.", "Descripción", "P. Unitario", "Descuento", "P. Total"]]
    for d, q, pu in items:
        filas.append([f"{q:g}", d, f"{pu:,.3f}" if pu < 0.1 else f"{pu:,.2f}", "0.00", f"{q * pu:,.2f}"])
    t = Table(filas, colWidths=[16 * mm, 92 * mm, 22 * mm, 20 * mm, 24 * mm])
    t.setStyle(TableStyle([("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8), ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
                           ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#888888")),
                           ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e9e9e9")),
                           ("ALIGN", (2, 1), (-1, -1), "RIGHT"), ("ALIGN", (0, 1), (0, -1), "CENTER")]))
    tw, th = t.wrapOn(c, W, H)
    t.drawOn(c, x0, y - 18 * mm - th)
    # totales
    ty = y - 26 * mm - th
    tot = [[f"SUBTOTAL {tarifa}%", f"{subtotal:,.2f}"], ["SUBTOTAL 0%", "0.00"], ["DESCUENTO", "0.00"],
           [f"IVA {tarifa}%", f"{iva:,.2f}"], ["VALOR TOTAL", f"{total:,.2f}"]]
    tt = Table(tot, colWidths=[34 * mm, 24 * mm])
    tt.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 8.5), ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 9),
                            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#888888")), ("ALIGN", (1, 0), (1, -1), "RIGHT")]))
    _, h2 = tt.wrapOn(c, W, H)
    tt.drawOn(c, W - 18 * mm - 58 * mm, ty - h2)
    c.setFont("Helvetica", 8)
    c.drawString(x0, ty - 6 * mm, "Forma de pago: Transferencia – 30 días")
    c.drawString(x0, ty - 11 * mm, "Información adicional: Entrega en finca, bodega de empaque.")
    c.save()


def factura_escaneada():
    """Factura en papel, 'escaneada': imagen inclinada con ruido, dentro de un PDF sin texto."""
    Wp, Hp = 1240, 1754  # A4 a 150 ppp
    img = Image.new("L", (Wp, Hp), 250)
    d = ImageDraw.Draw(img)
    fuentes = Path("C:/Windows/Fonts")
    f_b = ImageFont.truetype(str(fuentes / "arialbd.ttf"), 34)
    f_m = ImageFont.truetype(str(fuentes / "arial.ttf"), 22)
    f_s = ImageFont.truetype(str(fuentes / "arial.ttf"), 19)
    f_c = ImageFont.truetype(str(fuentes / "cour.ttf"), 22)
    f_cb = ImageFont.truetype(str(fuentes / "courbd.ttf"), 24)
    tinta = 40
    d.text((90, 90), "FRÍO ANDINO", font=f_b, fill=tinta)
    d.text((90, 132), "Servicios Técnicos de Refrigeración", font=f_m, fill=tinta)
    d.text((90, 162), "Juan Carlos Pazmiño Tituaña", font=f_s, fill=tinta)
    d.text((90, 188), "Av. Natalia Jarrín y Ascázubi, Cayambe · 099 000 0000", font=f_s, fill=tinta)
    d.rectangle((760, 80, 1150, 260), outline=tinta, width=3)
    d.text((780, 95), "R.U.C. 1712345678001", font=f_m, fill=tinta)
    d.text((780, 130), "FACTURA", font=f_b, fill=tinta)
    d.text((780, 175), "001-001-000000873", font=f_cb, fill=tinta)
    d.text((780, 215), "Aut. SRI 1124567890", font=f_s, fill=tinta)
    y = 320
    d.text((90, y), f"Sr.(es): {CLIENTE_FINCA}", font=f_m, fill=tinta)
    d.text((90, y + 36), f"RUC: {RUC_FINCA}", font=f_m, fill=tinta)
    d.text((700, y + 36), "Fecha: 04 / 11 / 2026", font=f_m, fill=tinta)
    d.text((90, y + 72), "Dirección: Finca Rosas del Valle, Cayambe", font=f_m, fill=tinta)
    # tabla
    y0, xs = 460, [90, 200, 820, 990, 1150]
    d.rectangle((xs[0], y0, xs[-1], y0 + 50), outline=tinta, width=2)
    for x, h in zip(xs[:-1], ["CANT.", "DESCRIPCIÓN", "V. UNIT.", "V. TOTAL"]):
        d.text((x + 12, y0 + 12), h, font=f_m, fill=tinta)
    items = [("1", "Mantenimiento preventivo cuarto frío N.º 1", "280.00", "280.00"),
             ("6", "Recarga gas refrigerante R-404A (kg)", "22.50", "135.00"),
             ("1", "Cambio de motor ventilador evaporador", "165.00", "165.00")]
    yy = y0 + 50
    for fila in items:
        d.rectangle((xs[0], yy, xs[-1], yy + 54), outline=tinta, width=2)
        for x, v in zip(xs[:-1], fila):
            d.text((x + 12, yy + 15), v, font=f_c, fill=tinta)
        yy += 54
    for _ in range(4):
        d.rectangle((xs[0], yy, xs[-1], yy + 54), outline=tinta, width=2); yy += 54
    for x in xs[1:-1]:
        d.line((x, y0, x, yy), fill=tinta, width=2)
    tot = [("SUBTOTAL 15%", "580.00"), ("SUBTOTAL 0%", "0.00"), ("IVA 15%", "87.00"), ("TOTAL", "667.00")]
    ty = yy + 30
    for k, v in tot:
        d.rectangle((760, ty, 1150, ty + 46), outline=tinta, width=2)
        d.text((775, ty + 11), k, font=f_m, fill=tinta)
        d.text((1010, ty + 10), v, font=f_c, fill=tinta)
        ty += 46
    d.text((90, yy + 40), "Forma de pago: transferencia", font=f_s, fill=tinta)
    # firma a mano alzada
    pts = [(160 + i * 9, 1480 + int(18 * random.uniform(-1, 1))) for i in range(30)]
    d.line(pts, fill=60, width=3)
    d.line((120, 1530, 520, 1530), fill=tinta, width=2)
    d.text((200, 1540), "Firma autorizada", font=f_s, fill=tinta)
    d.line((700, 1530, 1100, 1530), fill=tinta, width=2)
    d.text((800, 1540), "Recibí conforme", font=f_s, fill=tinta)

    # efecto escáner: inclinación, desenfoque leve, ruido y tono
    img = img.rotate(-0.9, resample=Image.BICUBIC, expand=False, fillcolor=235)
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    ruido = Image.effect_noise((Wp, Hp), 14)
    img = Image.blend(img, ruido, 0.08)
    rgb = Image.merge("RGB", (img.point(lambda p: min(255, p + 4)), img, img.point(lambda p: max(0, p - 10))))
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=62)
    buf.seek(0)
    tmp = SALIDA / "_escaneo.jpg"
    tmp.write_bytes(buf.getvalue())
    c = rl_canvas.Canvas(str(SALIDA / "factura_frio_escaneada.pdf"), pagesize=A4)
    c.drawImage(str(tmp), 0, 0, width=A4[0], height=A4[1])
    c.save()
    tmp.unlink()


def main():
    pdf_pedido()
    excel_pedido()
    factura_pdf(
        "factura_cartonera.pdf", "CARTONERA ANDINA S.A.", "1790845621001",
        "Panamericana Norte km 12, Calderón, Quito · facturacion@cartoneraandina.ec",
        "002-001-000045219", "02/11/2026", "0211202601179084562100120020010000452191234567812",
        [("Caja HB cartón corrugado impresa 105x50x30", 800, 1.35), ("Caja QB cartón corrugado impresa 105x25x30", 600, 0.95),
         ("Tapa HB cartón corrugado", 800, 0.42), ("Separador de cartón para bonches", 1000, 0.08)],
        2066.00, 309.90, 2375.90)
    factura_pdf(
        "factura_insumos_total_mal.pdf", "INSUMOS AGRÍCOLAS DEL NORTE CÍA. LTDA.", "1091567234001",
        "Av. Mariano Acosta 2-45, Ibarra, Imbabura · ventas@insumosdelnorte.ec",
        "001-003-000012877", "05/11/2026", "0511202601109156723400110010030000128771234567819",
        [("Capuchón plástico microperforado 60 cm", 5000, 0.045), ("Liga de caucho (funda 1 kg)", 20, 6.80),
         ("Papel periódico en láminas (resma)", 15, 18.50), ("Zuncho plástico (rollo)", 6, 24.00)],
        782.50, 117.38, 909.88)  # total mal calculado a propósito: debería ser 899.88
    factura_escaneada()
    for p in sorted(SALIDA.iterdir()):
        print(f"{p.name:35s} {p.stat().st_size / 1024:7.1f} KB")


if __name__ == "__main__":
    main()
