<script setup lang="ts">
/**
 * 🧾 UNA LÍNEA DEL CARRITO DE LA CAJA RÁPIDA
 *
 * Vive en su propio archivo porque la caja rápida la pinta dos veces: en el
 * panel de la derecha (escritorio) y en la hoja que sube desde abajo (celular).
 * Duplicar este bloque era pedir que un día los dos dejaran de ser iguales.
 *
 * Todo lo que el cajero puede tocar de una prenda ya cargada está aquí:
 *   · cantidad (− / +)
 *   · precio escrito a mano
 *   · pasar ESA prenda sola a por mayor o por menor con un clic
 *   · quitarla
 *
 * El componente no decide nada: avisa hacia arriba y el motor de ventas
 * (useVentas) recalcula. Así el carrito del celular y el del escritorio
 * siempre muestran lo mismo.
 */

const props = defineProps<{
  item: any
  /** Lista de la venta completa: vale cuando la línea no tiene una propia. */
  listaVenta: string
}>()

defineEmits<{
  (e: 'quitar'): void
  (e: 'cantidad', valor: number): void
  (e: 'precio', valor: string): void
  (e: 'lista', valor: 'MINORISTA' | 'MAYORISTA'): void
}>()

/** La lista que manda en esta línea. */
const listaActiva = () =>
  props.item?.lista === 'MAYORISTA' || props.item?.lista === 'MINORISTA'
    ? props.item.lista
    : props.listaVenta

const esMayor = () => listaActiva() === 'MAYORISTA'

const subtotal = () => (Number(props.item?.precioUnitario) || 0) * (Number(props.item?.cantidad) || 0)
</script>

<template>
  <div
    class="bg-slate-50 border-2 rounded-2xl p-3"
    :class="esMayor() ? 'border-violet-200' : 'border-slate-100'"
  >
    <!-- Prenda -->
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="min-w-0">
        <p class="font-black text-slate-800 leading-tight">{{ item.nombre }}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-1">
          <span
            v-if="item.talla"
            class="bg-slate-800 text-white text-xs font-black px-2 py-0.5 rounded-md"
          >
            T. {{ item.talla }}
          </span>
          <span
            v-else
            class="bg-sky-100 text-sky-800 text-[10px] font-black px-2 py-0.5 rounded-md"
            title="Se vendió sin elegir talla. Al cobrar sale de las tallas con más stock y se corrige en el conteo físico."
          >
            📏 Talla surtida
          </span>
          <span
            v-if="item.precioEditado"
            class="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-md"
            title="Este precio se escribió a mano: no sale de ninguna lista."
          >
            ✍️ Precio a mano
          </span>
          <span
            v-if="item.stockForzado"
            class="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-md"
            title="El sistema no registraba stock suficiente. Revisar inventario."
          >
            ⚠️ Revisar stock
          </span>
        </div>
      </div>
      <button
        @click="$emit('quitar')"
        class="text-slate-300 hover:text-red-500 text-2xl leading-none font-black shrink-0 px-1"
        title="Quitar esta prenda"
      >
        ×
      </button>
    </div>

    <!-- Lista de precio de ESTA prenda · precio -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="flex bg-white border-2 border-slate-200 rounded-xl p-0.5 gap-0.5 shrink-0">
        <button
          @click="$emit('lista', 'MINORISTA')"
          :class="!esMayor() ? 'bg-sky-500 text-white' : 'text-slate-400'"
          class="px-2.5 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-colors"
          title="Esta prenda al precio normal"
        >
          Menor
        </button>
        <button
          @click="$emit('lista', 'MAYORISTA')"
          :class="esMayor() ? 'bg-violet-500 text-white' : 'text-slate-400'"
          class="px-2.5 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-colors"
          title="Esta prenda al precio por mayor"
        >
          Mayor
        </button>
      </div>

      <div class="relative">
        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
          S/
        </span>
        <input
          type="number"
          min="0"
          step="0.5"
          inputmode="decimal"
          :value="item.precioUnitario"
          @change="$emit('precio', ($event.target as HTMLInputElement).value)"
          @keyup.enter="($event.target as HTMLInputElement).blur()"
          @focus="($event.target as HTMLInputElement).select()"
          class="w-24 h-10 bg-white border-2 rounded-xl pl-7 pr-2 text-right font-black text-slate-800 outline-none focus:border-sky-500"
          :class="Number(item.precioUnitario) > 0 ? 'border-slate-200' : 'border-rose-300 bg-rose-50'"
          title="Escribe el precio que cobras por esta prenda"
        />
      </div>
    </div>

    <!-- Cantidad · subtotal -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <button
          @click="$emit('cantidad', Number(item.cantidad) - 1)"
          :disabled="Number(item.cantidad) <= 1"
          class="w-11 h-11 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-black text-2xl leading-none flex items-center justify-center active:scale-90 disabled:opacity-30 transition-all"
        >
          −
        </button>
        <span class="w-10 text-center font-black text-2xl text-slate-900 tabular-nums">
          {{ item.cantidad }}
        </span>
        <button
          @click="$emit('cantidad', Number(item.cantidad) + 1)"
          class="w-11 h-11 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-black text-2xl leading-none flex items-center justify-center active:scale-90 transition-all"
        >
          +
        </button>
      </div>
      <span class="font-black text-lg text-slate-900 tabular-nums">
        S/ {{ subtotal().toFixed(2) }}
      </span>
    </div>
  </div>
</template>
