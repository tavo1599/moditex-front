import { ref, computed } from 'vue';
import api from '../api/axios';

/**
 * 🛟 RED DE SEGURIDAD DE VENTAS
 *
 * Antes, si el POST /ventas fallaba (se cayó el internet, el servidor no
 * respondió, el módem se reinició), la venta se perdía: solo salía un alert y
 * no quedaba registro en ningún lado. El vendedor la anotaba en papel y esa
 * venta terminaba desapareciendo.
 *
 * Ahora toda venta que no se pueda enviar se guarda COMPLETA en el navegador y
 * se reintenta sola cada 30 segundos y apenas vuelve la conexión. La venta ya
 * no depende de que el internet esté bueno en ese instante exacto.
 *
 * Cada venta lleva un UUID en la cabecera 'X-Venta-Uuid'. Si el backend lo
 * respeta (guardándolo como campo único), un reintento nunca duplica la venta
 * aunque el servidor sí la haya procesado y solo se haya perdido la respuesta.
 */

const CLAVE_COLA = 'pv_cola_ventas';
const INTERVALO_REINTENTO = 30_000;

export interface VentaEnCola {
  uuid: string;
  payload: any;
  resumen: { cliente: string; total: number; items: number; bodega: string };
  creadaEn: string;
  intentos: number;
  ultimoError: string | null;
  /** true = el servidor la rechazó por un motivo de negocio; no sirve reintentar sola. */
  bloqueada: boolean;
}

const leerCola = (): VentaEnCola[] => {
  try {
    const crudo = localStorage.getItem(CLAVE_COLA);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
};

// Estado a nivel de módulo: la cola sobrevive aunque la vista se desmonte.
const pendientes = ref<VentaEnCola[]>(leerCola());
const sincronizando = ref(false);
const enLinea = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);
let listenersListos = false;
let temporizador: any = null;

const guardarCola = () => {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(pendientes.value));
  } catch (e) {
    console.error('No se pudo guardar la cola de ventas', e);
  }
};

const generarUuid = (): string => {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* navegadores viejos */ }
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * ¿Vale la pena reintentar este error?
 * - Sin respuesta (red caída, timeout) → SÍ, es un problema de conexión.
 * - 5xx (servidor caído o reventado) → SÍ.
 * - 4xx (sin stock, datos inválidos) → NO, reintentar da el mismo error.
 */
const esErrorReintentable = (error: any): boolean => {
  if (!error?.response) return true;
  return Number(error.response.status) >= 500;
};

const mensajeDeError = (error: any): string =>
  error?.response?.data?.message ||
  error?.message ||
  'No hubo respuesta del servidor';

const encolar = (uuid: string, payload: any, resumen: VentaEnCola['resumen'], error: any) => {
  pendientes.value.push({
    uuid,
    payload,
    resumen,
    creadaEn: new Date().toISOString(),
    intentos: 1,
    ultimoError: mensajeDeError(error),
    bloqueada: false
  });
  guardarCola();
};

/**
 * Envía una venta. Si falla por conexión, la guarda en la cola en vez de perderla.
 */
const enviarVenta = async (
  payload: any,
  resumen: VentaEnCola['resumen']
): Promise<{ ok: true; data: any } | { ok: false; encolada: boolean; mensaje: string }> => {
  const uuid = generarUuid();
  try {
    const { data } = await api.post('/ventas', payload, { headers: { 'X-Venta-Uuid': uuid } });
    return { ok: true, data };
  } catch (error: any) {
    if (esErrorReintentable(error)) {
      encolar(uuid, payload, resumen, error);
      return { ok: false, encolada: true, mensaje: mensajeDeError(error) };
    }
    return { ok: false, encolada: false, mensaje: mensajeDeError(error) };
  }
};

/**
 * Recorre la cola e intenta enviar cada venta pendiente.
 * Las que salen bien se borran; las que fallan se quedan para el siguiente intento.
 */
const procesarCola = async (forzarBloqueadas = false): Promise<{ enviadas: number; fallidas: number }> => {
  if (sincronizando.value) return { enviadas: 0, fallidas: 0 };

  const candidatas = pendientes.value.filter(v => forzarBloqueadas || !v.bloqueada);
  if (candidatas.length === 0) return { enviadas: 0, fallidas: 0 };

  sincronizando.value = true;
  let enviadas = 0;
  let fallidas = 0;

  try {
    for (const venta of candidatas) {
      try {
        await api.post('/ventas', venta.payload, { headers: { 'X-Venta-Uuid': venta.uuid } });
        pendientes.value = pendientes.value.filter(v => v.uuid !== venta.uuid);
        enviadas++;
      } catch (error: any) {
        venta.intentos++;
        venta.ultimoError = mensajeDeError(error);
        // Un 4xx no se arregla reintentando: la marcamos para que alguien la revise
        // a mano, pero NUNCA la borramos (la venta existió de verdad).
        venta.bloqueada = !esErrorReintentable(error);
        fallidas++;
      }
      guardarCola();
    }
  } finally {
    sincronizando.value = false;
  }

  return { enviadas, fallidas };
};

/** Descarta una venta de la cola. Solo debería usarse tras confirmar a mano que ya está registrada. */
const descartar = (uuid: string) => {
  pendientes.value = pendientes.value.filter(v => v.uuid !== uuid);
  guardarCola();
};

const iniciarVigilancia = () => {
  if (listenersListos || typeof window === 'undefined') return;
  listenersListos = true;

  window.addEventListener('online', () => {
    enLinea.value = true;
    procesarCola();
  });
  window.addEventListener('offline', () => {
    enLinea.value = false;
  });

  temporizador = setInterval(() => {
    if (pendientes.value.some(v => !v.bloqueada)) procesarCola();
  }, INTERVALO_REINTENTO);

  // Aviso del navegador si intentan cerrar la pestaña con ventas sin enviar.
  window.addEventListener('beforeunload', (e) => {
    if (pendientes.value.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
};

export function useColaVentas() {
  iniciarVigilancia();

  return {
    pendientes,
    sincronizando,
    enLinea,
    hayPendientes: computed(() => pendientes.value.length > 0),
    totalPendientes: computed(() => pendientes.value.length),
    montoPendiente: computed(() => pendientes.value.reduce((s, v) => s + (v.resumen?.total || 0), 0)),
    enviarVenta,
    procesarCola,
    descartar
  };
}
