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
  return codigo === sku || compactarSku(codigo) === compactarSku(sku);
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
