<script setup lang="ts">
import { ref } from 'vue';
import { useColaVentas } from '../../composables/useColaVentas';

const { pendientes, sincronizando, enLinea, hayPendientes, montoPendiente, procesarCola, descartar } = useColaVentas();

const expandido = ref(false);

const reintentar = async () => {
  const { enviadas, fallidas } = await procesarCola(true);
  if (enviadas > 0 && fallidas === 0) alert(`✅ ${enviadas} venta(s) enviada(s) correctamente.`);
  else if (enviadas > 0) alert(`✅ ${enviadas} enviada(s). ⚠️ ${fallidas} siguen pendientes.`);
  else if (fallidas > 0) alert('⚠️ No se pudo enviar todavía. Se seguirá reintentando solo.');
};

const confirmarDescarte = (uuid: string, cliente: string) => {
  if (!confirm(`¿Descartar la venta de "${cliente}"?\n\nHazlo SOLO si ya verificaste que quedó registrada en el sistema. Si la descartas y no estaba registrada, se pierde.`)) return;
  descartar(uuid);
};

const formatearHora = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <div v-if="hayPendientes" class="rounded-2xl border-2 overflow-hidden shadow-sm"
       :class="pendientes.some(v => v.bloqueada) ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'">

    <button @click="expandido = !expandido" class="w-full px-5 py-4 flex items-center justify-between gap-3 text-left">
      <div class="flex items-center gap-3 min-w-0">
        <span class="text-2xl shrink-0">{{ sincronizando ? '🔄' : '⚠️' }}</span>
        <div class="min-w-0">
          <p class="font-black text-gray-900 text-sm">
            {{ pendientes.length }} venta{{ pendientes.length === 1 ? '' : 's' }} sin enviar
            <span class="font-mono text-gray-600">· S/ {{ montoPendiente.toFixed(2) }}</span>
          </p>
          <p class="text-[11px] font-bold" :class="enLinea ? 'text-amber-700' : 'text-red-600'">
            {{ sincronizando
                ? 'Enviando al servidor...'
                : enLinea
                  ? 'Guardadas en este equipo. Se reintenta solo cada 30 s.'
                  : '📴 Sin conexión. Se enviarán apenas vuelva el internet.' }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <span
          @click.stop="reintentar"
          :class="sincronizando ? 'opacity-50 pointer-events-none' : ''"
          class="bg-gray-900 text-white px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider hover:bg-gray-800 cursor-pointer"
        >
          Reintentar
        </span>
        <span class="text-gray-400 text-xs">{{ expandido ? '▲' : '▼' }}</span>
      </div>
    </button>

    <div v-if="expandido" class="px-5 pb-4 space-y-2">
      <div
        v-for="v in pendientes"
        :key="v.uuid"
        class="bg-white rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3"
        :class="v.bloqueada ? 'border-red-200' : 'border-gray-200'"
      >
        <div class="min-w-0">
          <p class="font-black text-gray-800 text-sm truncate">
            {{ v.resumen.cliente }}
            <span class="font-mono text-gray-500 ml-1">S/ {{ v.resumen.total.toFixed(2) }}</span>
          </p>
          <p class="text-[10px] font-bold text-gray-400">
            {{ v.resumen.items }} ítem(s) · {{ v.resumen.bodega }} · {{ formatearHora(v.creadaEn) }} · {{ v.intentos }} intento(s)
          </p>
          <p v-if="v.ultimoError" class="text-[10px] font-bold mt-1" :class="v.bloqueada ? 'text-red-600' : 'text-amber-600'">
            {{ v.bloqueada ? '⛔ Requiere revisión manual: ' : '↻ ' }}{{ v.ultimoError }}
          </p>
        </div>
        <button
          @click="confirmarDescarte(v.uuid, v.resumen.cliente)"
          class="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
        >
          Descartar
        </button>
      </div>

      <p class="text-[10px] font-bold text-gray-500 pt-1">
        Estas ventas están guardadas en este navegador. No borres los datos del navegador ni cierres sesión hasta que se envíen.
      </p>
    </div>
  </div>
</template>
