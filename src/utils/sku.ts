/**
 * 🏷️ LECTURA DE CÓDIGOS DE BARRAS DE PRENDA
 *
 * Las etiquetas conviven en dos formatos:
 *   • completo → 'PRD4-MLC-S'  (etiquetas viejas)
 *   • compacto → '4MLCS'       (etiquetas nuevas: sin 'PRD' ni guiones, la mitad
 *                               de barras, mucho más fácil de leer con la pistola)
 *
 * Esta lógica vivía solo dentro del punto de venta, así que Ingreso Libre y
 * Traslados no reconocían las etiquetas nuevas. Aquí queda una sola vez para que
 * las tres pantallas lean exactamente lo mismo.
 */

/** Mayúsculas, sin tildes y con las comillas que mete la pistola pasadas a guion. */
export const normalizarCodigo = (valor: any): string =>
  String(valor ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/'/g, '-');

/** 'PRD4-MLC-S' → '4MLCS'. Deja cualquier formato en su forma comparable. */
export const compactarSku = (sku: any): string =>
  normalizarCodigo(sku).replace(/^PRD/, '').replace(/-/g, '');

/**
 * ¿El código escaneado apunta a este SKU? Acepta ambos formatos en los dos lados,
 * así que da igual si la etiqueta es vieja y el SKU calculado es nuevo o al revés.
 */
export const coincideSku = (codigoEscaneado: any, skuCandidato: any): boolean => {
  const codigo = normalizarCodigo(codigoEscaneado);
  const sku = normalizarCodigo(skuCandidato);
  if (!codigo || !sku) return false;
  if (codigo === sku) return true;

  const a = compactarSku(codigo);
  const b = compactarSku(sku);
  if (a === b) return true;

  // Códigos de MERCADERÍA COMPRADA: son puro número ('000123'). Los comparamos
  // como número para que el cajero pueda teclear '123' cuando la pistola falle
  // y se reconozca igual que la etiqueta impresa '000123'.
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) === Number(b);

  return false;
};

/**
 * ¿Parece el código corto de mercadería comprada? Es puro número.
 * Nuestras etiquetas de producción siempre llevan letras (el código de color),
 * así que un código solo de dígitos nunca choca con ellas.
 */
export const esCodigoMercaderia = (valor: any): boolean =>
  /^\d{1,9}$/.test(normalizarCodigo(valor));

/**
 * ¿El código escaneado apunta a esta fila de inventario?
 *
 * Mira los DOS códigos que puede tener una prenda:
 *   • skuCalculado  → etiqueta de nuestra producción ('PRD4-MLC-S' o '4MLCS')
 *   • codigoBarras  → código corto de mercadería comprada ('000123')
 *
 * Es la función que deben usar las pantallas de venta: así una sola llamada
 * reconoce las etiquetas propias y las de mercadería sin lógica duplicada.
 */
export const coincideConPrenda = (codigoEscaneado: any, item: any): boolean => {
  if (!item) return false;
  if (coincideSku(codigoEscaneado, item.skuCalculado)) return true;
  const codigoMercaderia = item.codigoBarras ?? item.producto?.codigoBarras;
  return codigoMercaderia ? coincideSku(codigoEscaneado, codigoMercaderia) : false;
};

export interface PrendaEscaneada {
  productoId: number;
  color: string;
  talla: string;
}

/**
 * Descompone un código en producto + color + talla.
 *
 * El formato completo se parte solo por los guiones. El compacto es ambiguo por
 * sí mismo ('4MLCS' podría partirse de varias formas), así que se resuelve
 * contra el catálogo de colores: se prueba cada código de color como prefijo y
 * lo que sobra es la talla. Se prueban primero los códigos más largos para que
 * un color 'NG' no le gane a 'NGR'.
 *
 * Se usa donde hay que CREAR la variante (Ingreso Libre), no donde se busca en
 * un inventario existente — para eso está `coincideSku`, que es más tolerante.
 */
export const parsearCodigoPrenda = (
  codigoEscaneado: any,
  colores: { codigo?: string; nombre?: string }[] = []
): PrendaEscaneada | null => {
  const codigo = normalizarCodigo(codigoEscaneado);
  if (!codigo) return null;

  // Formato completo: PRD<id>-<color>-<talla>
  const completo = codigo.match(/^PRD(\d+)-(.+)-([^-]+)$/);
  if (completo) {
    return { productoId: Number(completo[1]), color: completo[2] ?? '', talla: completo[3] ?? '' };
  }

  // Formato compacto: <id><color><talla>, todo pegado
  const compacto = codigo.match(/^(\d+)([A-Z0-9]+)$/);
  if (!compacto) return null;

  const productoId = Number(compacto[1]);
  const resto = compacto[2] ?? '';

  const codigosColor = colores
    .map((c) => normalizarCodigo(c.codigo))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // el más largo primero

  for (const codColor of codigosColor) {
    if (resto.startsWith(codColor)) {
      const talla = resto.slice(codColor.length);
      if (talla) return { productoId, color: codColor, talla };
    }
  }

  return null;
};
