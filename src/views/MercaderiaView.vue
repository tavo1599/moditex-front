<script setup lang="ts">
/**
 * MERCADERÍA COMPRADA — COMPRA SIMPLIFICADA + CÓDIGOS DE BARRAS
 * ===========================================================================
 * Esta vista es para la ropa que COMPRAMOS ya hecha, no la que producimos.
 *
 * LA REGLA QUE HAY QUE ENTENDER:
 *
 *   · Nuestra producción  → se maneja por COLOR y TALLA (la cortamos nosotros).
 *   · Mercadería comprada → se maneja GENERAL: solo CANTIDAD.
 *
 * Por eso aquí solo se pide lo mínimo para no perder mercadería:
 *
 *      nombre · cantidad · precio de compra · precio de venta · N° de factura
 *
 * Al guardar, cada prenda recibe un CÓDIGO DE BARRAS corto y numérico
 * (ej. 000123) que se imprime, se pega y se vende con la pistola. Si la
 * pistola falla, el cajero teclea los 6 dígitos y listo.
 */
import { ref, onMounted, computed } from 'vue'
import api from '../api/axios'
import JsBarcode from 'jsbarcode'

type Pestania = 'comprar' | 'catalogo' | 'historial'
const pestania = ref<Pestania>('comprar')

// ---------------------------------------------------------------------------
// DATOS BASE
// ---------------------------------------------------------------------------
const proveedores = ref<any[]>([])
const bodegas = ref<any[]>([])
const catalogo = ref<any[]>([])
const historial = ref<any[]>([])
const cargando = ref(true)
const guardando = ref(false)

const aviso = ref<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
let timerAviso: ReturnType<typeof setTimeout> | null = null
const avisar = (texto: string, tipo: 'ok' | 'error' = 'ok') => {
  aviso.value = { texto, tipo }
  if (timerAviso) clearTimeout(timerAviso)
  timerAviso = setTimeout(() => (aviso.value = null), 9000)
}

const cargar = async () => {
  cargando.value = true
  try {
    const [resP, resB, resC] = await Promise.all([
      api.get('/compras/proveedores'),
      api.get('/almacen-terminados/bodegas'),
      api.get('/compras/mercaderia/catalogo'),
    ])
    proveedores.value = resP.data
    bodegas.value = (resB.data || []).filter((b: any) => b.estado !== false)
    catalogo.value = resC.data
    if (!cabecera.value.bodegaDestinoId && bodegas.value.length > 0) {
      cabecera.value.bodegaDestinoId = bodegas.value[0].id
    }
  } catch (e: any) {
    avisar('No se pudo cargar: ' + (e.response?.data?.message || e.message), 'error')
  } finally {
    cargando.value = false
  }
}

const cargarHistorial = async () => {
  try {
    const { data } = await api.get('/compras/mercaderia/historial')
    historial.value = data
  } catch (e: any) {
    avisar('No se pudo cargar el historial: ' + (e.response?.data?.message || e.message), 'error')
  }
}

onMounted(async () => {
  await cargar()
  await cargarHistorial()
})

// ===========================================================================
// A) REGISTRAR LA COMPRA
// ===========================================================================
const cabecera = ref({
  numeroFactura: '',
  proveedorId: '' as any,
  proveedorNombre: '',
  bodegaDestinoId: '' as any,
})

// Cada línea de la compra. productoId lleno = prenda que ya existe en el
// catálogo; vacío = prenda nueva que se crea con el nombre escrito.
const lineas = ref<any[]>([])

const nuevaLinea = () => ({
  productoId: '' as any,
  nombre: '',
  cantidad: 1,
  costoUnitario: 0,
  precioVenta: 0,
  precioMayorista: 0,
})

const agregarLinea = () => lineas.value.push(nuevaLinea())
const quitarLinea = (i: number) => lineas.value.splice(i, 1)

// Al elegir una prenda que ya existe, traemos sus precios actuales para que
// el usuario solo los confirme o los cambie.
const alElegirProducto = (linea: any) => {
  if (!linea.productoId) return
  const p = catalogo.value.find((x) => x.id === Number(linea.productoId))
  if (!p) return
  linea.nombre = p.nombre
  if (!linea.precioVenta) linea.precioVenta = p.precioMinorista
  if (!linea.precioMayorista) linea.precioMayorista = p.precioMayorista
  if (!linea.costoUnitario) linea.costoUnitario = p.costoPromedio
}

const subtotalLinea = (l: any) => (Number(l.cantidad) || 0) * (Number(l.costoUnitario) || 0)
const totalCompra = computed(() => lineas.value.reduce((s, l) => s + subtotalLinea(l), 0))
const totalUnidades = computed(() => lineas.value.reduce((s, l) => s + (Number(l.cantidad) || 0), 0))
const totalVentaEsperada = computed(() =>
  lineas.value.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precioVenta) || 0), 0),
)
const gananciaEsperada = computed(() => totalVentaEsperada.value - totalCompra.value)

// Margen de una línea: si sale rojo, estamos vendiendo por debajo del costo.
const margenLinea = (l: any) => {
  const venta = Number(l.precioVenta) || 0
  const costo = Number(l.costoUnitario) || 0
  if (venta <= 0) return null
  return ((venta - costo) / venta) * 100
}

const lineasValidas = computed(() =>
  lineas.value.filter(
    (l) => (Number(l.cantidad) || 0) > 0 && (l.productoId || String(l.nombre).trim()),
  ),
)

const razonBloqueo = computed(() => {
  if (!cabecera.value.numeroFactura.trim()) return 'Escribe el número de la factura o boleta.'
  if (!cabecera.value.bodegaDestinoId) return 'Elige a qué bodega entra la mercadería.'
  if (lineasValidas.value.length === 0) return 'Agrega al menos una prenda con su cantidad.'
  const sinPrecio = lineasValidas.value.filter((l) => !(Number(l.precioVenta) > 0))
  if (sinPrecio.length > 0) return `Falta el precio de venta de ${sinPrecio.length} prenda(s).`
  return ''
})

// Resultado de la última compra: de aquí salen las etiquetas a imprimir
const ultimaCompra = ref<any>(null)

const guardar = async () => {
  if (razonBloqueo.value) return avisar(razonBloqueo.value, 'error')

  guardando.value = true
  try {
    const { data } = await api.post('/compras/mercaderia', {
      numeroFactura: cabecera.value.numeroFactura.trim(),
      bodegaDestinoId: Number(cabecera.value.bodegaDestinoId),
      proveedorId: cabecera.value.proveedorId ? Number(cabecera.value.proveedorId) : null,
      proveedorNombre: cabecera.value.proveedorNombre.trim() || null,
      items: lineasValidas.value.map((l) => ({
        productoId: l.productoId ? Number(l.productoId) : null,
        nombre: String(l.nombre).trim(),
        cantidad: Number(l.cantidad),
        costoUnitario: Number(l.costoUnitario) || 0,
        precioVenta: Number(l.precioVenta) || 0,
        precioMayorista: Number(l.precioMayorista) || 0,
      })),
    })

    ultimaCompra.value = data
    // Las etiquetas quedan listas con la cantidad comprada de cada prenda
    etiquetasAImprimir.value = data.etiquetas.map((e: any) => ({ ...e, imprimir: e.cantidad }))

    avisar(
      `✅ Factura ${data.factura} registrada: ${data.unidades} prendas entraron a ${data.bodega}. ` +
        'Ya puedes imprimir sus códigos de barras y venderlas.',
    )

    cabecera.value = {
      numeroFactura: '',
      proveedorId: cabecera.value.proveedorId,
      proveedorNombre: '',
      bodegaDestinoId: cabecera.value.bodegaDestinoId,
    }
    lineas.value = []
    await cargar()
    await cargarHistorial()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo registrar la compra.', 'error')
  } finally {
    guardando.value = false
  }
}

// ===========================================================================
// B) CÓDIGOS DE BARRAS
// ===========================================================================
// etiquetasAImprimir = [{ productoId, nombre, codigoBarras, precio, imprimir }]
const etiquetasAImprimir = ref<any[]>([])

const agregarACola = (prenda: any, cantidad = 1) => {
  const ya = etiquetasAImprimir.value.find((e) => e.productoId === prenda.id)
  if (ya) {
    ya.imprimir = (Number(ya.imprimir) || 0) + cantidad
  } else {
    etiquetasAImprimir.value.push({
      productoId: prenda.id,
      nombre: prenda.nombre,
      codigoBarras: prenda.codigoBarras,
      precio: prenda.precioMinorista,
      imprimir: cantidad,
    })
  }
  avisar(`${prenda.nombre}: ${cantidad} etiqueta(s) a la cola de impresión.`)
}

const quitarDeCola = (i: number) => etiquetasAImprimir.value.splice(i, 1)
const totalEtiquetas = computed(() =>
  etiquetasAImprimir.value.reduce((s, e) => s + (Number(e.imprimir) || 0), 0),
)

// Código de barras en PNG de alta resolución: barras gruesas y zona de
// silencio amplia para que la pistola lo lea sin pelear.
const barcodePng = (codigo: string): string => {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, codigo, { format: 'CODE128', width: 4, height: 110, displayValue: false, margin: 10 })
  return canvas.toDataURL('image/png')
}

const imprimirEtiquetas = () => {
  const planas: any[] = []
  for (const e of etiquetasAImprimir.value) {
    const n = Math.trunc(Number(e.imprimir) || 0)
    for (let k = 0; k < n; k++) planas.push(e)
  }
  if (planas.length === 0) return avisar('No hay etiquetas en la cola.', 'error')

  const html = planas
    .map(
      (e) => `
      <div class="etiqueta">
        <div class="nombre">${String(e.nombre).toUpperCase()}</div>
        <img class="barra" src="${barcodePng(e.codigoBarras)}" />
        <div class="pie">
          <span class="codigo">${e.codigoBarras}</span>
          ${Number(e.precio) > 0 ? `<span class="precio">S/ ${Number(e.precio).toFixed(2)}</span>` : ''}
        </div>
      </div>`,
    )
    .join('')

  const ventana = window.open('', '_blank')
  if (!ventana) return avisar('El navegador bloqueó la ventana de impresión.', 'error')

  ventana.document.write(`
    <!doctype html><html><head><meta charset="utf-8"><title>Códigos de barras</title>
    <style>
      @page { margin: 4mm; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; display: flex; flex-wrap: wrap; gap: 2mm; }
      .etiqueta {
        width: 40mm; height: 25mm; border: 1px dashed #ccc; box-sizing: border-box;
        padding: 1mm 1.5mm; display: flex; flex-direction: column;
        align-items: center; justify-content: space-between; page-break-inside: avoid;
      }
      .nombre { font-size: 6pt; font-weight: bold; text-align: center; line-height: 1.1;
                max-height: 7mm; overflow: hidden; }
      .barra { width: 100%; height: 11mm; object-fit: fill; }
      .pie { width: 100%; display: flex; justify-content: space-between; align-items: center; }
      .codigo { font-size: 7pt; font-weight: bold; letter-spacing: 1px; }
      .precio { font-size: 9pt; font-weight: bold; }
      @media print { .etiqueta { border: none; } }
    </style></head><body>${html}</body></html>
  `)
  ventana.document.close()
  setTimeout(() => ventana.print(), 350)
}

const asignarCodigosFaltantes = async () => {
  try {
    const { data } = await api.post('/compras/mercaderia/codigos')
    avisar(
      data.cantidad > 0
        ? `✅ Se asignaron ${data.cantidad} código(s) de barras.`
        : 'Toda la mercadería ya tenía su código de barras.',
    )
    await cargar()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo asignar códigos.', 'error')
  }
}

// ---------------------------------------------------------------------------
// FILTRO DEL CATÁLOGO
// ---------------------------------------------------------------------------
const buscar = ref('')
const catalogoFiltrado = computed(() => {
  const q = buscar.value.trim().toLowerCase()
  if (!q) return catalogo.value
  return catalogo.value.filter((p) =>
    `${p.nombre} ${p.codigoBarras} ${p.skuBase}`.toLowerCase().includes(q),
  )
})

const fecha = (f: string) => new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="max-w-7xl mx-auto pb-24">

    <!-- ===================== ENCABEZADO ===================== -->
    <div class="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 rounded-3xl p-6 md:p-8 text-white shadow-xl mb-6">
      <h1 class="text-3xl md:text-4xl font-black tracking-tight">📦 Mercadería Comprada</h1>
      <p class="text-orange-50 mt-2 max-w-3xl">
        Para la ropa que <strong>compramos ya hecha</strong>. Se registra solo lo necesario:
        nombre, cantidad, precio de compra, precio de venta y número de factura.
        Al guardar, cada prenda recibe su <strong>código de barras</strong> para imprimir y vender.
      </p>

      <!-- La regla del módulo, bien visible para quien recién llega -->
      <div class="mt-5 bg-white/15 rounded-2xl p-4 grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p class="font-black uppercase tracking-wider text-[11px] text-orange-100 mb-1">🏭 Nuestra producción</p>
          <p>Se registra <strong>por color y talla</strong>, porque la cortamos nosotros.</p>
        </div>
        <div>
          <p class="font-black uppercase tracking-wider text-[11px] text-orange-100 mb-1">📦 Mercadería comprada</p>
          <p>Se maneja <strong>general: solo cantidad</strong>. Al vender, el cajero solo jala la prenda.</p>
        </div>
      </div>
    </div>

    <!-- ===================== AVISO ===================== -->
    <transition name="fade">
      <div
        v-if="aviso" class="mb-5 px-5 py-4 rounded-2xl font-bold border-2 shadow-sm"
        :class="aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'"
      >{{ aviso.texto }}</div>
    </transition>

    <!-- ===================== PESTAÑAS ===================== -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <button
        @click="pestania = 'comprar'"
        class="py-5 rounded-2xl font-black text-base md:text-lg shadow transition-all active:scale-95"
        :class="pestania === 'comprar' ? 'bg-orange-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'"
      >🛒 Registrar Compra</button>
      <button
        @click="pestania = 'catalogo'"
        class="py-5 rounded-2xl font-black text-base md:text-lg shadow transition-all active:scale-95"
        :class="pestania === 'catalogo' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'"
      >🏷️ Códigos de Barras</button>
      <button
        @click="pestania = 'historial'"
        class="py-5 rounded-2xl font-black text-base md:text-lg shadow transition-all active:scale-95"
        :class="pestania === 'historial' ? 'bg-slate-700 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'"
      >📋 Historial</button>
    </div>

    <!-- ======================================================================
         A) REGISTRAR COMPRA
         ================================================================== -->
    <div v-if="pestania === 'comprar'" class="space-y-6">

      <!-- Cabecera: factura, proveedor, bodega -->
      <div class="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-orange-500 to-amber-600 px-6 py-5 text-white">
          <h2 class="text-2xl font-black">🧾 Datos de la compra</h2>
          <p class="text-orange-100 text-sm mt-1">El número de factura evita que la misma compra se registre dos veces.</p>
        </div>

        <div class="p-6 grid md:grid-cols-3 gap-5">
          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
              N° de factura o boleta <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="cabecera.numeroFactura" type="text" placeholder="Ej. F001-00123"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-14 text-lg font-black text-slate-800 uppercase focus:border-orange-500 outline-none"
            />
          </div>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
              ¿A qué bodega entra? <span class="text-rose-500">*</span>
            </label>
            <select
              v-model="cabecera.bodegaDestinoId"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-14 text-lg font-bold text-slate-700 focus:border-orange-500 outline-none"
            >
              <option value="">— Elige la bodega —</option>
              <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Proveedor</label>
            <select
              v-model="cabecera.proveedorId"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-14 font-bold text-slate-700 focus:border-orange-500 outline-none"
            >
              <option value="">— Escribir uno nuevo abajo —</option>
              <option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.razonSocial }}</option>
            </select>
            <input
              v-if="!cabecera.proveedorId"
              v-model="cabecera.proveedorNombre" type="text" placeholder="Nombre del proveedor nuevo (opcional)"
              class="mt-2 w-full border-2 border-slate-200 rounded-xl px-4 h-11 font-semibold text-slate-700 focus:border-orange-500 outline-none"
            />
          </div>
        </div>
      </div>

      <!-- Las prendas compradas -->
      <div class="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-5 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-2xl font-black">👕 ¿Qué compramos?</h2>
            <p class="text-indigo-100 text-sm mt-1">Sin talla ni color: solo nombre y cantidad.</p>
          </div>
          <button
            @click="agregarLinea"
            class="bg-white text-indigo-700 hover:bg-indigo-50 font-black text-lg px-6 py-3.5 rounded-2xl shadow-lg active:scale-95 transition-transform"
          >➕ Agregar prenda</button>
        </div>

        <div class="p-6">
          <div v-if="lineas.length === 0" class="bg-indigo-50 border-2 border-dashed border-indigo-300 rounded-2xl p-12 text-center">
            <p class="text-5xl mb-3">👕</p>
            <p class="text-lg font-black text-indigo-900">Todavía no agregaste prendas</p>
            <p class="text-indigo-700 text-sm mt-1 mb-5">Pulsa «Agregar prenda» para empezar.</p>
            <button
              @click="agregarLinea"
              class="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg px-8 py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
            >➕ Agregar la primera prenda</button>
          </div>

          <!-- Una tarjeta por prenda: en el celular no hay tabla que se corte -->
          <div v-else class="space-y-4">
            <div
              v-for="(l, i) in lineas" :key="i"
              class="bg-slate-50 rounded-2xl p-5 border-2 border-slate-200 relative"
            >
              <button
                @click="quitarLinea(i)"
                class="absolute top-3 right-3 w-9 h-9 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-600 font-black grid place-items-center"
                title="Quitar esta prenda"
              >✕</button>

              <p class="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Prenda {{ i + 1 }}</p>

              <div class="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                    ¿Ya existe en el catálogo?
                  </label>
                  <select
                    v-model="l.productoId" @change="alElegirProducto(l)"
                    class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-indigo-500 outline-none"
                  >
                    <option value="">— No, es nueva —</option>
                    <option v-for="p in catalogo" :key="p.id" :value="p.id">
                      {{ p.nombre }} ({{ p.codigoBarras }}) · stock {{ p.stockTotal }}
                    </option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                    Nombre de la prenda <span class="text-rose-500">*</span>
                  </label>
                  <input
                    v-model="l.nombre" type="text" :disabled="!!l.productoId"
                    placeholder="Ej. Polo algodón cuello redondo"
                    class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-indigo-500 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              </div>

              <!-- Los 4 números de la compra: grandes y claros -->
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Cantidad</label>
                  <input
                    v-model.number="l.cantidad" type="number" min="1"
                    class="w-full border-2 border-slate-300 rounded-xl px-4 h-14 text-2xl text-center font-black text-slate-800 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs font-black uppercase tracking-wider text-rose-600 mb-2">Precio compra</label>
                  <input
                    v-model.number="l.costoUnitario" type="number" step="0.01" min="0" placeholder="0.00"
                    class="w-full border-2 border-rose-200 bg-rose-50 rounded-xl px-4 h-14 text-xl text-center font-black text-rose-800 focus:border-rose-500 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs font-black uppercase tracking-wider text-emerald-600 mb-2">
                    Precio venta <span class="text-rose-500">*</span>
                  </label>
                  <input
                    v-model.number="l.precioVenta" type="number" step="0.01" min="0" placeholder="0.00"
                    class="w-full border-2 border-emerald-300 bg-emerald-50 rounded-xl px-4 h-14 text-xl text-center font-black text-emerald-800 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs font-black uppercase tracking-wider text-sky-600 mb-2">Precio mayorista</label>
                  <input
                    v-model.number="l.precioMayorista" type="number" step="0.01" min="0" placeholder="opcional"
                    class="w-full border-2 border-sky-200 bg-sky-50 rounded-xl px-4 h-14 text-xl text-center font-black text-sky-800 focus:border-sky-500 outline-none"
                  />
                </div>
              </div>

              <!-- Lo que esta línea significa en dinero -->
              <div class="mt-4 flex flex-wrap gap-5 text-sm pt-4 border-t-2 border-slate-200">
                <p class="font-bold text-slate-600">
                  Pagamos: <span class="text-rose-700 font-black">S/ {{ subtotalLinea(l).toFixed(2) }}</span>
                </p>
                <p class="font-bold text-slate-600">
                  Si lo vendemos todo:
                  <span class="text-emerald-700 font-black">
                    S/ {{ ((Number(l.cantidad) || 0) * (Number(l.precioVenta) || 0)).toFixed(2) }}
                  </span>
                </p>
                <p v-if="margenLinea(l) !== null" class="font-bold">
                  Margen:
                  <span :class="(margenLinea(l) as number) >= 0 ? 'text-emerald-700 font-black' : 'text-rose-700 font-black'">
                    {{ (margenLinea(l) as number).toFixed(1) }}%
                  </span>
                  <span v-if="(margenLinea(l) as number) < 0" class="text-rose-600 text-xs ml-1">
                    ⚠️ vendes más barato de lo que compras
                  </span>
                </p>
              </div>
            </div>

            <button
              @click="agregarLinea"
              class="w-full bg-indigo-50 hover:bg-indigo-100 border-2 border-dashed border-indigo-300 text-indigo-700 font-black text-lg py-5 rounded-2xl transition-colors"
            >➕ Agregar otra prenda</button>
          </div>
        </div>
      </div>

      <!-- Totales + guardar -->
      <div v-if="lineas.length" class="bg-white rounded-3xl shadow-sm p-6 space-y-5">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-slate-50 rounded-2xl p-5 text-center border-2 border-slate-200">
            <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Unidades</p>
            <p class="text-3xl font-black text-slate-800">{{ totalUnidades }}</p>
          </div>
          <div class="bg-rose-50 rounded-2xl p-5 text-center border-2 border-rose-200">
            <p class="text-[11px] font-black uppercase tracking-wider text-rose-600">Total a pagar</p>
            <p class="text-3xl font-black text-rose-700">S/ {{ totalCompra.toFixed(2) }}</p>
          </div>
          <div class="bg-emerald-50 rounded-2xl p-5 text-center border-2 border-emerald-200">
            <p class="text-[11px] font-black uppercase tracking-wider text-emerald-600">Venta esperada</p>
            <p class="text-3xl font-black text-emerald-700">S/ {{ totalVentaEsperada.toFixed(2) }}</p>
          </div>
          <div class="rounded-2xl p-5 text-center border-2" :class="gananciaEsperada >= 0 ? 'bg-violet-50 border-violet-200' : 'bg-rose-50 border-rose-300'">
            <p class="text-[11px] font-black uppercase tracking-wider" :class="gananciaEsperada >= 0 ? 'text-violet-600' : 'text-rose-600'">Ganancia</p>
            <p class="text-3xl font-black" :class="gananciaEsperada >= 0 ? 'text-violet-700' : 'text-rose-700'">
              S/ {{ gananciaEsperada.toFixed(2) }}
            </p>
          </div>
        </div>

        <div v-if="razonBloqueo" class="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4 font-bold text-amber-800">
          ⚠️ {{ razonBloqueo }}
        </div>

        <button
          @click="guardar" :disabled="guardando || !!razonBloqueo"
          class="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700
                 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed
                 text-white font-black text-xl py-6 rounded-2xl shadow-lg active:scale-95 transition-all"
        >
          {{ guardando ? 'Registrando...' : `💾 Registrar compra — ${totalUnidades} prendas · S/ ${totalCompra.toFixed(2)}` }}
        </button>
      </div>

      <!-- Resultado: etiquetas listas para imprimir -->
      <div v-if="ultimaCompra" class="bg-emerald-50 border-2 border-emerald-300 rounded-3xl p-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-2xl font-black text-emerald-900">
              ✅ Factura {{ ultimaCompra.factura }} registrada
            </p>
            <p class="text-emerald-800 mt-1">
              {{ ultimaCompra.unidades }} prendas entraron a <strong>{{ ultimaCompra.bodega }}</strong>.
              Ya se pueden vender.
            </p>
          </div>
          <button
            @click="pestania = 'catalogo'"
            class="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg px-7 py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
          >🏷️ Imprimir sus códigos ({{ totalEtiquetas }})</button>
        </div>
      </div>
    </div>

    <!-- ======================================================================
         B) CÓDIGOS DE BARRAS
         ================================================================== -->
    <div v-if="pestania === 'catalogo'" class="space-y-5">
      <div class="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5">
        <p class="font-black text-indigo-900 mb-1">🏷️ Cómo funciona el código</p>
        <p class="text-sm text-indigo-800">
          Cada prenda comprada tiene un código de <strong>6 dígitos</strong> (ej. <code class="bg-white px-1.5 py-0.5 rounded font-bold">000123</code>).
          Se imprime, se pega y se vende con la pistola. Si la pistola falla,
          el cajero <strong>teclea los 6 números</strong> en el Punto de Venta y la prenda entra igual.
        </p>
      </div>

      <!-- Cola de impresión -->
      <div v-if="etiquetasAImprimir.length" class="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-indigo-600 to-violet-700 px-6 py-5 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-2xl font-black">🖨️ Cola de impresión</h2>
            <p class="text-indigo-100 text-sm mt-1">{{ totalEtiquetas }} etiqueta(s) listas — 40 × 25 mm</p>
          </div>
          <div class="flex gap-2">
            <button
              @click="imprimirEtiquetas"
              class="bg-white text-indigo-700 hover:bg-indigo-50 font-black text-lg px-7 py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
            >🖨️ Imprimir {{ totalEtiquetas }}</button>
            <button
              @click="etiquetasAImprimir = []"
              class="bg-white/20 hover:bg-white/30 text-white font-bold px-5 py-4 rounded-2xl"
            >Vaciar</button>
          </div>
        </div>

        <div class="p-6 space-y-3">
          <div
            v-for="(e, i) in etiquetasAImprimir" :key="e.productoId"
            class="flex flex-wrap items-center gap-4 bg-slate-50 border-2 border-slate-200 rounded-2xl p-4"
          >
            <!-- Vista previa real de la etiqueta -->
            <div class="bg-white border-2 border-slate-300 rounded-xl p-2 w-40 shrink-0">
              <p class="text-[8px] font-black text-center truncate">{{ String(e.nombre).toUpperCase() }}</p>
              <img :src="barcodePng(e.codigoBarras)" class="w-full h-8 object-fill" />
              <div class="flex justify-between items-center">
                <span class="text-[9px] font-black tracking-wider">{{ e.codigoBarras }}</span>
                <span v-if="Number(e.precio) > 0" class="text-[10px] font-black">S/ {{ Number(e.precio).toFixed(2) }}</span>
              </div>
            </div>

            <div class="flex-1 min-w-[160px]">
              <p class="font-black text-slate-800">{{ e.nombre }}</p>
              <p class="text-sm text-slate-500 font-mono font-bold">{{ e.codigoBarras }}</p>
            </div>

            <div>
              <label class="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Cuántas imprimir</label>
              <input
                v-model.number="e.imprimir" type="number" min="0"
                class="w-28 border-2 border-slate-300 rounded-xl h-12 text-center text-xl font-black text-slate-800 focus:border-indigo-500 outline-none"
              />
            </div>

            <button @click="quitarDeCola(i)" class="w-11 h-11 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-600 font-black grid place-items-center">✕</button>
          </div>
        </div>
      </div>

      <!-- Catálogo de mercadería -->
      <div class="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <input
          v-model="buscar" type="text" placeholder="🔍 Buscar prenda por nombre o código..."
          class="flex-1 min-w-[240px] border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-indigo-500 outline-none"
        />
        <button
          @click="asignarCodigosFaltantes"
          class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 h-12 rounded-xl"
          title="Para mercadería antigua que quedó sin código"
        >🔧 Asignar códigos faltantes</button>
      </div>

      <p v-if="cargando" class="text-center py-16 text-slate-400 font-bold">Cargando catálogo...</p>

      <div v-else-if="catalogoFiltrado.length === 0" class="bg-white rounded-3xl p-14 text-center shadow-sm">
        <p class="text-6xl mb-4">📦</p>
        <p class="text-xl font-black text-slate-700">
          {{ catalogo.length === 0 ? 'Todavía no hay mercadería comprada' : 'Ninguna prenda coincide' }}
        </p>
        <p class="text-slate-500 mt-2">
          {{ catalogo.length === 0
            ? 'Registra una compra en la pestaña «Registrar Compra» y aparecerá aquí con su código.'
            : 'Prueba con otro texto de búsqueda.' }}
        </p>
      </div>

      <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="p in catalogoFiltrado" :key="p.id"
          class="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden border-2 border-slate-100"
        >
          <div class="h-2 bg-gradient-to-r from-indigo-500 to-violet-500"></div>
          <div class="p-5">
            <p class="font-black text-slate-800 leading-tight mb-1">{{ p.nombre }}</p>
            <p class="text-2xl font-black text-indigo-700 font-mono tracking-widest mb-3">{{ p.codigoBarras }}</p>

            <!-- Vista previa de cómo saldrá la etiqueta -->
            <div class="bg-white border-2 border-slate-200 rounded-xl p-2 mb-4">
              <img :src="barcodePng(p.codigoBarras)" class="w-full h-10 object-fill" />
            </div>

            <div class="grid grid-cols-3 gap-2 text-center mb-4">
              <div class="bg-slate-50 rounded-xl p-2">
                <p class="text-[10px] font-black uppercase text-slate-500">Stock</p>
                <p class="text-xl font-black" :class="p.stockTotal > 0 ? 'text-slate-800' : 'text-rose-500'">{{ p.stockTotal }}</p>
              </div>
              <div class="bg-emerald-50 rounded-xl p-2">
                <p class="text-[10px] font-black uppercase text-emerald-600">Venta</p>
                <p class="text-xl font-black text-emerald-700">{{ p.precioMinorista.toFixed(0) }}</p>
              </div>
              <div class="bg-violet-50 rounded-xl p-2">
                <p class="text-[10px] font-black uppercase text-violet-600">Margen</p>
                <p class="text-xl font-black" :class="p.margen >= 0 ? 'text-violet-700' : 'text-rose-600'">{{ p.margen }}%</p>
              </div>
            </div>

            <p v-if="p.porBodega.length" class="text-xs text-slate-500 mb-3">
              📍 <span v-for="(b, k) in p.porBodega" :key="b.bodegaId">{{ b.bodega }}: {{ b.stock }}{{ Number(k) < p.porBodega.length - 1 ? ' · ' : '' }}</span>
            </p>

            <div class="flex gap-2">
              <button
                @click="agregarACola(p, 1)"
                class="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm py-3 rounded-xl border-2 border-indigo-200"
              >+ 1 etiqueta</button>
              <button
                @click="agregarACola(p, p.stockTotal || 1)"
                class="flex-1 bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold text-sm py-3 rounded-xl border-2 border-violet-200"
                :title="`Una etiqueta por cada unidad en stock (${p.stockTotal})`"
              >+ {{ p.stockTotal || 1 }} (stock)</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================================
         C) HISTORIAL
         ================================================================== -->
    <div v-if="pestania === 'historial'" class="space-y-4">
      <div v-if="historial.length === 0" class="bg-white rounded-3xl p-14 text-center shadow-sm">
        <p class="text-6xl mb-4">📋</p>
        <p class="text-xl font-black text-slate-700">Todavía no hay compras registradas</p>
      </div>

      <div
        v-for="c in historial" :key="c.id"
        class="bg-white rounded-2xl shadow-sm overflow-hidden border-2 border-slate-100"
      >
        <div class="bg-slate-50 px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100">
          <div>
            <p class="text-lg font-black text-slate-800">🧾 {{ c.factura }}</p>
            <p class="text-xs text-slate-500">{{ fecha(c.fecha) }} · {{ c.proveedor }}</p>
          </div>
          <div class="flex gap-6 text-center">
            <div>
              <p class="text-xl font-black text-slate-800">{{ c.unidades }}</p>
              <p class="text-[10px] font-bold uppercase text-slate-500">prendas</p>
            </div>
            <div>
              <p class="text-xl font-black text-rose-700">S/ {{ c.total.toFixed(2) }}</p>
              <p class="text-[10px] font-bold uppercase text-slate-500">pagado</p>
            </div>
          </div>
        </div>
        <div class="p-5 space-y-2">
          <div
            v-for="(l, k) in c.lineas" :key="k"
            class="flex flex-wrap items-center gap-3 py-2 border-b border-slate-100 last:border-0"
          >
            <span class="font-mono font-black text-indigo-700 text-sm w-20">{{ l.codigoBarras }}</span>
            <span class="flex-1 min-w-[140px] font-bold text-slate-700">{{ l.producto }}</span>
            <span class="font-black text-slate-800">{{ l.cantidad }} u.</span>
            <span class="text-sm text-slate-500">× S/ {{ l.costoUnitario.toFixed(2) }}</span>
            <span class="font-black text-rose-700 w-24 text-right">S/ {{ l.subtotal.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease, transform .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
