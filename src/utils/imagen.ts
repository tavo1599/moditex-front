const API = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';

/**
 * Convierte la ruta de imagen/archivo del backend en una URL absoluta usable en <img>/<a>.
 * - Almacenamiento LOCAL: el backend devuelve algo como "/uploads/...". Le anteponemos la API.
 * - Cloudflare R2: el backend ya devuelve la URL completa ("https://..."). Se usa tal cual.
 */
export const imagenUrl = (ruta?: string | null): string => {
  if (!ruta) return '';
  if (ruta.startsWith('http')) return ruta;
  return `${API}${ruta.startsWith('/') ? '' : '/'}${ruta}`;
};
