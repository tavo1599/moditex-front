/**
 * Orden natural de tallas.
 *
 * Ordenar alfabéticamente deja "L, M, S, XL" en vez de "S, M, L, XL", que es
 * ilegible para el vendedor. Aquí van primero las tallas por letra en su orden
 * real y después las numéricas ordenadas por valor (28, 30, 32... no 28, 30, 8).
 */
const ORDEN_TALLAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', 'UNICA', 'ÚNICA'];

export const pesoTalla = (talla: string): number => {
  const clave = String(talla || '').trim().toUpperCase();
  const idx = ORDEN_TALLAS.indexOf(clave);
  if (idx !== -1) return idx;

  const num = parseFloat(clave.replace(',', '.'));
  return !isNaN(num) ? 1000 + num : 5000; // numéricas después; lo desconocido, al final
};

export const ordenarTallas = (tallas: string[]): string[] =>
  [...tallas].sort((a, b) => pesoTalla(a) - pesoTalla(b) || String(a).localeCompare(String(b)));
