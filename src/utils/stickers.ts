/**
 * 🏷️ IMPRESIÓN DE STICKERS / ETIQUETAS (compartido)
 * ===========================================================================
 * La misma etiqueta de 30×40mm que arma la pantalla de Etiquetas, extraída
 * aquí para que también se pueda imprimir desde Acabados (Transformación) sin
 * duplicar la lógica. Recibe una lista plana de etiquetas ya "explotada" (una
 * por prenda) y abre el diálogo de impresión.
 */
import JsBarcode from 'jsbarcode'

export interface Etiqueta {
  nombreProducto: string
  nombreColor: string
  talla: string
  precio: number | null
  sku: string // completo: PRD7-NGR-M (el que se lee a ojo)
  skuBarra?: string // compacto: 7NGRM (el del código de barras)
  marca: string
  img?: string
}

/** Código de barras como PNG en alta resolución (CODE128). */
export const barcodeDataUrl = (sku: string): string => {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, sku, { format: 'CODE128', width: 4, height: 120, displayValue: false, margin: 8 })
  return canvas.toDataURL('image/png')
}

/**
 * Explota una matriz (prenda + color × talla con cantidades) en etiquetas
 * sueltas, una por prenda. Devuelve la lista lista para imprimir.
 */
export const construirEtiquetas = (params: {
  productoId: number
  nombreProducto: string
  marca: string
  precio: number | null
  // Cada combinación con su cantidad y los nombres/códigos de color ya resueltos.
  celdas: { color: string; colorCodigo: string; talla: string; cantidad: number }[]
}): Etiqueta[] => {
  const out: Etiqueta[] = []
  for (const c of params.celdas) {
    const cant = Math.trunc(Number(c.cantidad) || 0)
    if (cant < 1) continue
    const cod = String(c.colorCodigo || c.color).substring(0, 3).toUpperCase()
    const sku = `PRD${params.productoId}-${cod}-${c.talla}`
    const skuBarra = `${params.productoId}${cod}${c.talla}`.toUpperCase()
    for (let k = 0; k < cant; k++) {
      out.push({
        nombreProducto: params.nombreProducto,
        nombreColor: c.color,
        talla: c.talla,
        precio: params.precio,
        sku,
        skuBarra,
        marca: params.marca,
      })
    }
  }
  return out
}

/** Arma el HTML de la plancha y abre el diálogo de impresión. */
export const imprimirEtiquetas = (etiquetas: Etiqueta[]): boolean => {
  if (!etiquetas.length) return false

  // Un código de barras por SKU compacto (cache).
  const imgCache: Record<string, string> = {}
  for (const e of etiquetas) {
    const clave = e.skuBarra || e.sku
    if (!imgCache[clave]) imgCache[clave] = barcodeDataUrl(clave)
    e.img = imgCache[clave]
  }

  let cuerpo = ''
  for (let i = 0; i < etiquetas.length; i += 3) {
    cuerpo += '<div class="fila">'
    for (let j = 0; j < 3; j++) {
      const e = etiquetas[i + j]
      if (e) {
        cuerpo += `
          <div class="etiqueta">
            <div class="contenido">
              ${e.precio != null ? `<div class="precio">PRECIO S/ ${e.precio.toFixed(2)}</div>` : ''}
              <div class="marca">${e.marca}</div>
              <div class="tipo-prenda">${e.nombreProducto}</div>
              <div class="svg-container"><img src="${e.img}" style="width:37mm;height:10mm;"></div>
              <div class="sku-lectura">${e.sku}</div>
              <div class="footer-etiqueta">
                <span class="talla-gigante">${e.talla}</span>
                <span class="color-texto">${e.nombreColor}</span>
              </div>
            </div>
          </div>`
      } else {
        cuerpo += '<div class="etiqueta"></div>'
      }
    }
    cuerpo += '</div>'
  }

  const PITCH = 40
  const html = `
    <html><head><title>Etiquetas</title><style>
      @page { size: 100mm ${PITCH}mm; margin: 0 !important; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 100mm; background: #fff; font-family: Arial, sans-serif; }
      .fila { display: flex; flex-direction: row; width: 100mm; height: ${PITCH}mm; justify-content: space-around; align-items: flex-start; overflow: hidden; page-break-inside: avoid; page-break-after: always; }
      .etiqueta { width: 30mm; height: 40mm; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .contenido {
        width: 40mm; height: 30mm; flex: 0 0 auto;
        transform: rotate(-90deg);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 0.6mm; padding: 1mm 1.5mm;
      }
      .precio { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; line-height: 1; }
      .marca { font-size: 14px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; line-height: 1.05; -webkit-text-stroke: 0.3px #000; }
      .tipo-prenda { font-size: 7.5px; font-weight: 600; letter-spacing: 0.2px; text-transform: uppercase; line-height: 1; width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .svg-container { width: 100%; display: flex; justify-content: center; }
      .svg-container img { image-rendering: crisp-edges; }
      .sku-lectura { font-family: monospace; font-size: 7px; font-weight: 600; letter-spacing: 0.5px; line-height: 1; }
      .footer-etiqueta { display: flex; justify-content: space-between; align-items: center; width: 100%; border-top: 1px dashed #000; padding-top: 1mm; margin-top: 0.4mm; }
      .talla-gigante { font-size: 16px; font-weight: 900; line-height: 0.85; }
      .color-texto { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; max-width: 20mm; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    </style></head><body>${cuerpo}</body></html>`

  try {
    const iframe = document.createElement('iframe')
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) throw new Error('sin documento')
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() }
      catch { alert('No se pudo abrir el diálogo de impresión.') }
      setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe) }, 1500)
    }, 500)
  } catch {
    const v = window.open('', 'PRINT', 'height=600,width=800')
    if (!v) { alert('Permite ventanas emergentes para imprimir.'); return false }
    v.document.write(html); v.document.close(); v.focus()
    setTimeout(() => { v.print(); v.close() }, 800)
  }
  return true
}
