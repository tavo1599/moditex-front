<script setup lang="ts">
/**
 * ALMACÉN DE TELA EN ROLLOS
 * ===========================================================================
 * Primer paso del recorrido de la tela:
 *
 *    [ 1. ROLLOS ] → 2. Transformación → 3. Terminados → 4. Venta
 *
 * Aquí se registra la tela tal como llega: en rollos, pesados en kilos y con
 * su color. Cada rollo físico es una tarjeta. Si llegan 20 rollos, hay 20
 * tarjetas, porque después el cortador tiene que poder elegir EXACTAMENTE
 * los rollos que se lleva viendo el peso y el color de cada uno.
 */
import { ref, onMounted, computed, watch } from 'vue'
import api from '../api/axios'

// ---------------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------------
const rollos = ref<any[]>([])
const resumen = ref<any>(null)
const colores = ref<any[]>([])
const proveedores = ref<any[]>([])
const cargando = ref(true)
const guardando = ref(false)

// Avisos no bloqueantes (nunca un alert que corte el trabajo)
const aviso = ref<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
let timerAviso: ReturnType<typeof setTimeout> | null = null
const avisar = (texto: string, tipo: 'ok' | 'error' = 'ok') => {
  aviso.value = { texto, tipo }
  if (timerAviso) clearTimeout(timerAviso)
  timerAviso = setTimeout(() => (aviso.value = null), 6000)
}

// ---------------------------------------------------------------------------
// FILTROS
// ---------------------------------------------------------------------------
const filtroTexto = ref('')
const filtroColor = ref('')
const filtroEstado = ref('')

const rollosFiltrados = computed(() => {
  const txt = filtroTexto.value.trim().toLowerCase()
  return rollos.value.filter((r) => {
    if (filtroColor.value && r.color !== filtroColor.value) return false
    if (filtroEstado.value && r.estado !== filtroEstado.value) return false
    if (!txt) return true
    return `${r.codigo} ${r.color} ${r.descripcion || ''} ${r.proveedor?.razonSocial || ''}`
      .toLowerCase()
      .includes(txt)
  })
})

const coloresEnStock = computed(() => {
  const set = new Set(rollos.value.map((r) => r.color))
  return [...set].sort()
})

const kilosFiltrados = computed(() =>
  rollosFiltrados.value.reduce((s, r) => s + Number(r.pesoActual), 0),
)

// ---------------------------------------------------------------------------
// CARGA
// ---------------------------------------------------------------------------
const cargar = async () => {
  cargando.value = true
  try {
    const [resR, resS, resC, resP] = await Promise.all([
      api.get('/rollos'),
      api.get('/rollos/resumen'),
      api.get('/colores'),
      api.get('/compras/proveedores'),
    ])
    rollos.value = resR.data
    resumen.value = resS.data
    colores.value = resC.data
    proveedores.value = resP.data
  } catch (e: any) {
    avisar('No se pudo cargar el almacén de rollos: ' + (e.response?.data?.message || e.message), 'error')
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

// ---------------------------------------------------------------------------
// REGISTRO DE ROLLOS
// ---------------------------------------------------------------------------
// El caso real: llega una compra de varios rollos del mismo color. En vez de
// llenar un formulario por rollo, se escribe un peso y Enter, otro peso y
// Enter... y al final se guardan todos de golpe.
const panelAbierto = ref(false)
const form = ref({
  color: '',
  colorCodigo: '',
  descripcion: '',
  costoPorKilo: 0,
  proveedorId: '' as any,
  observacion: '',
})
const pesos = ref<number[]>([])
const pesoNuevo = ref<number | null>(null)
const inputPeso = ref<HTMLInputElement | null>(null)

const agregarPeso = () => {
  const p = Number(pesoNuevo.value)
  if (!p || p <= 0) {
    avisar('Escribe el peso del rollo en kilos (ej. 24.5).', 'error')
    return
  }
  pesos.value.push(Number(p.toFixed(3)))
  pesoNuevo.value = null
  inputPeso.value?.focus()
}
const quitarPeso = (i: number) => pesos.value.splice(i, 1)

// Atajo para cuando todos los rollos pesan parecido
const pesoRepetido = ref<number | null>(null)
const cantidadRepetida = ref<number>(1)
const agregarVarios = () => {
  const p = Number(pesoRepetido.value)
  const n = Math.trunc(Number(cantidadRepetida.value) || 0)
  if (!p || p <= 0 || n <= 0) {
    avisar('Indica el peso y cuántos rollos de ese peso llegaron.', 'error')
    return
  }
  for (let k = 0; k < n; k++) pesos.value.push(Number(p.toFixed(3)))
  pesoRepetido.value = null
  cantidadRepetida.value = 1
}

const kilosARegistrar = computed(() => pesos.value.reduce((s, p) => s + p, 0))
const costoARegistrar = computed(() => kilosARegistrar.value * Number(form.value.costoPorKilo || 0))

const alElegirColor = () => {
  const c = colores.value.find((x) => x.nombre === form.value.color)
  form.value.colorCodigo = c?.codigo || ''
}

const limpiarForm = () => {
  form.value = { color: '', colorCodigo: '', descripcion: '', costoPorKilo: 0, proveedorId: '', observacion: '' }
  pesos.value = []
  pesoNuevo.value = null
}

const guardar = async () => {
  if (!form.value.color.trim()) return avisar('Elige el color de la tela.', 'error')
  if (pesos.value.length === 0) return avisar('Agrega el peso de al menos un rollo.', 'error')

  guardando.value = true
  try {
    const { data } = await api.post('/rollos', {
      color: form.value.color.trim(),
      colorCodigo: form.value.colorCodigo || null,
      descripcion: form.value.descripcion.trim() || null,
      costoPorKilo: Number(form.value.costoPorKilo) || 0,
      proveedorId: form.value.proveedorId ? Number(form.value.proveedorId) : null,
      observacion: form.value.observacion.trim() || null,
      pesos: pesos.value,
    })
    avisar(`✅ ${data.cantidad} rollo(s) registrados — ${kilosARegistrar.value.toFixed(2)} kg de ${form.value.color}.`)
    limpiarForm()
    panelAbierto.value = false
    await cargar()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo registrar.', 'error')
  } finally {
    guardando.value = false
  }
}

// ---------------------------------------------------------------------------
// AJUSTE DE PESO (reconteo en balanza o tela devuelta)
// ---------------------------------------------------------------------------
const modalAjuste = ref<any>(null)
const pesoReal = ref<number | null>(null)
const motivoAjuste = ref('')

const abrirAjuste = (rollo: any) => {
  modalAjuste.value = rollo
  pesoReal.value = Number(rollo.pesoActual)
  motivoAjuste.value = ''
}
const confirmarAjuste = async () => {
  if (pesoReal.value === null || Number(pesoReal.value) < 0) {
    return avisar('El peso real no puede ser negativo.', 'error')
  }
  guardando.value = true
  try {
    await api.patch(`/rollos/${modalAjuste.value.id}/peso`, {
      pesoReal: Number(pesoReal.value),
      motivo: motivoAjuste.value.trim() || undefined,
    })
    avisar(`✅ ${modalAjuste.value.codigo} quedó en ${Number(pesoReal.value).toFixed(3)} kg.`)
    modalAjuste.value = null
    await cargar()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo ajustar.', 'error')
  } finally {
    guardando.value = false
  }
}

// ---------------------------------------------------------------------------
// ANULAR (solo rollos que nunca se usaron)
// ---------------------------------------------------------------------------
const anular = async (rollo: any) => {
  if (!confirm(`¿Anular el rollo ${rollo.codigo}? Se usa cuando se registró por error.`)) return
  try {
    await api.patch(`/rollos/${rollo.id}/anular`, { motivo: 'Registrado por error' })
    avisar(`${rollo.codigo} anulado.`)
    await cargar()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo anular.', 'error')
  }
}

// ---------------------------------------------------------------------------
// HISTORIAL DE UN ROLLO
// ---------------------------------------------------------------------------
const modalHistorial = ref<any>(null)
const verHistorial = async (rollo: any) => {
  try {
    const { data } = await api.get(`/rollos/${rollo.id}/historial`)
    modalHistorial.value = data
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo abrir el historial.', 'error')
  }
}

// ---------------------------------------------------------------------------
// AYUDAS DE PRESENTACIÓN
// ---------------------------------------------------------------------------
const hexDeColor = (nombre: string) =>
  colores.value.find((c) => c.nombre === nombre)?.codigoHex || '#94a3b8'

const porcentajeRestante = (r: any) => {
  const ini = Number(r.pesoInicial) || 1
  return Math.max(0, Math.min(100, (Number(r.pesoActual) / ini) * 100))
}

const estiloEstado = (estado: string) => {
  if (estado === 'DISPONIBLE') return 'bg-emerald-100 text-emerald-700 border-emerald-300'
  if (estado === 'EN_USO') return 'bg-amber-100 text-amber-700 border-amber-300'
  if (estado === 'CONSUMIDO') return 'bg-slate-200 text-slate-600 border-slate-300'
  return 'bg-rose-100 text-rose-700 border-rose-300'
}
const textoEstado = (estado: string) =>
  ({ DISPONIBLE: 'Disponible', EN_USO: 'Empezado', CONSUMIDO: 'Agotado', ANULADO: 'Anulado' } as any)[estado] || estado

const fecha = (f: string) => new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
const fechaHora = (f: string) => new Date(f).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// ---------------------------------------------------------------------------
// REPORTE DEL ALMACÉN DE ROLLOS
// ---------------------------------------------------------------------------
// Responde la pregunta de todos los días: ¿qué rollos tengo, de qué color,
// de qué peso, de quién vinieron y cuántos kilos ya se fueron al corte?
//
// Se arma con la lista que ya está en pantalla, así que sale al instante.
// Los ANULADOS (errores de registro) no vienen en esa lista: si se piden, se
// traen aparte una sola vez y se mezclan.
// ---------------------------------------------------------------------------
const mostrarReporte = ref(false)
const repEstado = ref('')
const repColor = ref('')
const repProveedor = ref('' as any)
const repDesde = ref('')
const repHasta = ref('')
const repIncluirAnulados = ref(false)

const anulados = ref<any[]>([])
const cargandoAnulados = ref(false)

// Los anulados se piden al servidor solo la primera vez que se marcan.
watch(repIncluirAnulados, async (incluir) => {
  if (!incluir || anulados.value.length > 0 || cargandoAnulados.value) return
  cargandoAnulados.value = true
  try {
    const { data } = await api.get('/rollos', { params: { estado: 'ANULADO' } })
    anulados.value = data
  } catch (e: any) {
    avisar('No se pudieron traer los rollos anulados: ' + (e.response?.data?.message || e.message), 'error')
    repIncluirAnulados.value = false
  } finally {
    cargandoAnulados.value = false
  }
})

const limpiarFiltrosReporte = () => {
  repEstado.value = ''
  repColor.value = ''
  repProveedor.value = ''
  repDesde.value = ''
  repHasta.value = ''
}

/** Un rollo convertido en fila de reporte: los kilos ya calculados. */
const aFila = (r: any) => {
  const ini = Number(r.pesoInicial) || 0
  const act = Number(r.pesoActual) || 0
  const costo = Number(r.costoPorKilo) || 0
  return {
    ...r,
    kgInicial: ini,
    kgActual: act,
    kgUsado: Math.max(0, ini - act),
    costo,
    valor: act * costo,
    pct: ini > 0 ? Math.max(0, Math.min(100, (act / ini) * 100)) : 0,
    proveedorNombre: r.proveedor?.razonSocial || '',
    dia: String(r.fechaIngreso || '').slice(0, 10),
  }
}

const filasReporte = computed(() => {
  const base = repIncluirAnulados.value ? [...rollos.value, ...anulados.value] : rollos.value
  const prov = repProveedor.value === '' ? null : Number(repProveedor.value)

  return base
    .map(aFila)
    .filter((f) => {
      if (repEstado.value && f.estado !== repEstado.value) return false
      if (repColor.value && f.color !== repColor.value) return false
      if (prov !== null && Number(f.proveedorId) !== prov) return false
      if (repDesde.value && f.dia < repDesde.value) return false
      if (repHasta.value && f.dia > repHasta.value) return false
      return true
    })
    .sort((a, b) => (b.dia || '').localeCompare(a.dia || '') || (b.codigo || '').localeCompare(a.codigo || ''))
})

const totalesReporte = computed(() => {
  const f = filasReporte.value
  const ingresados = f.reduce((t, r) => t + r.kgInicial, 0)
  const disponibles = f.reduce((t, r) => t + r.kgActual, 0)
  return {
    rollos: f.length,
    ingresados,
    disponibles,
    consumidos: Math.max(0, ingresados - disponibles),
    pctConsumido: ingresados > 0 ? ((ingresados - disponibles) / ingresados) * 100 : 0,
    valor: f.reduce((t, r) => t + r.valor, 0),
    colores: new Set(f.map((r) => r.color).filter(Boolean)).size,
    enteros: f.filter((r) => r.estado === 'DISPONIBLE').length,
    empezados: f.filter((r) => r.estado === 'EN_USO').length,
    agotados: f.filter((r) => r.estado === 'CONSUMIDO').length,
    anulados: f.filter((r) => r.estado === 'ANULADO').length,
    sinPrecio: f.filter((r) => r.costo <= 0).length,
    sinProveedor: f.filter((r) => !r.proveedorId).length,
  }
})

/** Agrupador: sirve igual para el corte por color y para el de proveedor. */
const agrupar = (clave: (f: any) => string) => {
  const mapa = new Map<string, any>()
  for (const f of filasReporte.value) {
    const k = clave(f)
    const a = mapa.get(k) || { nombre: k, rollos: 0, ingresados: 0, disponibles: 0, usados: 0, valor: 0 }
    a.rollos += 1
    a.ingresados += f.kgInicial
    a.disponibles += f.kgActual
    a.usados += f.kgUsado
    a.valor += f.valor
    mapa.set(k, a)
  }
  return [...mapa.values()].sort((a, b) => b.disponibles - a.disponibles || b.ingresados - a.ingresados)
}

const reportePorColor = computed(() => agrupar((f) => f.color || 'Sin color'))
const reportePorProveedor = computed(() => agrupar((f) => f.proveedorNombre || 'Sin proveedor'))

/** El grupo más grande marca el 100% de la barra. */
const maxKilosColor = computed(() => Math.max(1, ...reportePorColor.value.map((c) => c.ingresados)))

const hoyTexto = () => new Date().toLocaleString('es-PE')

const nombreProveedorFiltro = computed(() =>
  repProveedor.value === ''
    ? 'Todos'
    : proveedores.value.find((p) => p.id === Number(repProveedor.value))?.razonSocial || '',
)

/** Descarga en CSV. BOM + punto y coma para que Excel en español lo abra bien. */
const exportarReporte = () => {
  const t = totalesReporte.value
  const filas: any[][] = [
    ['REPORTE DEL ALMACÉN DE ROLLOS'],
    ['Generado', hoyTexto()],
    ['Estado', repEstado.value ? textoEstado(repEstado.value) : 'Todos'],
    ['Color', repColor.value || 'Todos'],
    ['Proveedor', nombreProveedorFiltro.value],
    ['Ingresados desde', repDesde.value || 'inicio', 'hasta', repHasta.value || 'hoy'],
    ['Incluye anulados', repIncluirAnulados.value ? 'Sí' : 'No'],
    [],
    ['Rollos', t.rollos],
    ['Kilos ingresados', t.ingresados.toFixed(3)],
    ['Kilos disponibles', t.disponibles.toFixed(3)],
    ['Kilos consumidos', t.consumidos.toFixed(3)],
    ['% consumido', t.pctConsumido.toFixed(1)],
    ['Valor de lo que queda (S/)', t.valor.toFixed(2)],
    ['Rollos enteros', t.enteros],
    ['Rollos empezados', t.empezados],
    ['Rollos agotados', t.agotados],
    [],
    ['CÓDIGO', 'FECHA', 'COLOR', 'DESCRIPCIÓN', 'PROVEEDOR', 'PESO INICIAL', 'PESO ACTUAL',
     'KILOS USADOS', '% RESTANTE', 'ESTADO', 'S/ POR KILO', 'VALOR'],
    ...filasReporte.value.map((f) => [
      f.codigo,
      f.dia,
      f.color,
      f.descripcion || '',
      f.proveedorNombre,
      f.kgInicial.toFixed(3),
      f.kgActual.toFixed(3),
      f.kgUsado.toFixed(3),
      f.pct.toFixed(1),
      textoEstado(f.estado),
      f.costo.toFixed(2),
      f.valor.toFixed(2),
    ]),
    [],
    ['RESUMEN POR COLOR'],
    ['COLOR', 'ROLLOS', 'INGRESADOS', 'DISPONIBLES', 'USADOS', 'VALOR'],
    ...reportePorColor.value.map((c) => [
      c.nombre, c.rollos, c.ingresados.toFixed(3), c.disponibles.toFixed(3),
      c.usados.toFixed(3), c.valor.toFixed(2),
    ]),
    [],
    ['RESUMEN POR PROVEEDOR'],
    ['PROVEEDOR', 'ROLLOS', 'INGRESADOS', 'DISPONIBLES', 'USADOS', 'VALOR'],
    ...reportePorProveedor.value.map((c) => [
      c.nombre, c.rollos, c.ingresados.toFixed(3), c.disponibles.toFixed(3),
      c.usados.toFixed(3), c.valor.toFixed(2),
    ]),
  ]

  const csv = '\ufeff' + filas.map((f) => f.join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `rollos_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  avisar('⬇️ Reporte descargado. Ábrelo con Excel.')
}

/** Impresión: una hoja limpia, sin menús ni botones. */
const imprimirReporte = () => {
  const t = totalesReporte.value
  const esc = (v: any) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const detalle = filasReporte.value
    .map(
      (f) => `<tr>
        <td class="mono">${esc(f.codigo)}</td>
        <td>${esc(f.dia)}</td>
        <td>${esc(f.color)}</td>
        <td>${esc(f.proveedorNombre || '—')}</td>
        <td class="num">${f.kgInicial.toFixed(3)}</td>
        <td class="num">${f.kgActual.toFixed(3)}</td>
        <td class="num">${f.kgUsado.toFixed(3)}</td>
        <td>${esc(textoEstado(f.estado))}</td>
        <td class="num">${f.valor > 0 ? 'S/ ' + f.valor.toFixed(2) : '—'}</td>
      </tr>`,
    )
    .join('')

  const porColor = reportePorColor.value
    .map(
      (c) => `<tr><td>${esc(c.nombre)}</td><td class="num">${c.rollos}</td>
        <td class="num">${c.ingresados.toFixed(3)}</td>
        <td class="num">${c.disponibles.toFixed(3)}</td>
        <td class="num">${c.usados.toFixed(3)}</td></tr>`,
    )
    .join('')

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>Reporte del almacén de rollos</title>
    <style>
      *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
      body{margin:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px}
      .sub{font-size:11px;color:#555;margin-bottom:16px}
      .kpis{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
      .kpi{border:1px solid #ddd;border-radius:8px;padding:8px 14px;min-width:115px}
      .kpi b{display:block;font-size:17px}
      .kpi span{font-size:9px;text-transform:uppercase;color:#666;letter-spacing:.5px}
      h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px;color:#333}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#222;color:#fff;text-align:left;padding:6px;font-size:9px;text-transform:uppercase}
      td{padding:5px 6px;border-bottom:1px solid #eee}
      tr:nth-child(even) td{background:#fafafa}
      .num{text-align:right;white-space:nowrap}
      .mono{font-family:monospace}
      .pie{margin-top:18px;font-size:9px;color:#777;border-top:1px solid #ddd;padding-top:8px}
    </style></head><body>
    <h1>REPORTE DEL ALMACÉN DE ROLLOS</h1>
    <div class="sub">
      Generado el ${esc(hoyTexto())} ·
      Estado: ${esc(repEstado.value ? textoEstado(repEstado.value) : 'todos')} ·
      Color: ${esc(repColor.value || 'todos')} ·
      Proveedor: ${esc(nombreProveedorFiltro.value)}
      ${repDesde.value || repHasta.value ? ` · Ingresados del ${esc(repDesde.value || 'inicio')} al ${esc(repHasta.value || 'hoy')}` : ''}
    </div>
    <div class="kpis">
      <div class="kpi"><b>${t.rollos}</b><span>Rollos</span></div>
      <div class="kpi"><b>${t.ingresados.toFixed(2)} kg</b><span>Ingresaron</span></div>
      <div class="kpi"><b>${t.disponibles.toFixed(2)} kg</b><span>Quedan</span></div>
      <div class="kpi"><b>${t.consumidos.toFixed(2)} kg</b><span>Se cortaron</span></div>
      <div class="kpi"><b>S/ ${t.valor.toFixed(2)}</b><span>Valor</span></div>
    </div>
    <h2>Detalle de rollos</h2>
    <table><thead><tr>
      <th>Código</th><th>Fecha</th><th>Color</th><th>Proveedor</th>
      <th class="num">Peso inicial</th><th class="num">Peso actual</th><th class="num">Usados</th>
      <th>Estado</th><th class="num">Valor</th>
    </tr></thead><tbody>${detalle || '<tr><td colspan="9">Sin rollos.</td></tr>'}</tbody></table>
    <h2>Resumen por color</h2>
    <table><thead><tr>
      <th>Color</th><th class="num">Rollos</th><th class="num">Ingresados</th>
      <th class="num">Disponibles</th><th class="num">Usados</th>
    </tr></thead><tbody>${porColor || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
    <div class="pie">
      Los kilos disponibles son los que quedan hoy en cada rollo. Los kilos usados
      salieron al corte y están detallados en Transformación.
    </div>
    </body></html>`

  const v = window.open('', '_blank', 'width=1000,height=700')
  if (!v) return avisar('El navegador bloqueó la ventana de impresión.', 'error')
  v.document.write(html)
  v.document.close()
  v.focus()
  setTimeout(() => v.print(), 300)
}

</script>

<template>
  <div class="max-w-7xl mx-auto pb-24">

    <!-- ===================== ENCABEZADO ===================== -->
    <div class="bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-700 rounded-3xl p-6 md:p-8 text-white shadow-xl mb-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sky-200 font-bold uppercase tracking-widest text-xs mb-1">Paso 1 de 4</p>
          <h1 class="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
            🧵 Almacén de Rollos
          </h1>
          <p class="text-sky-100 mt-2 max-w-2xl">
            Registra la tela como llega: <strong>por rollo, pesada en kilos y con su color</strong>.
            Cada rollo es una tarjeta, para que el cortador luego elija exactamente los que se lleva.
          </p>
        </div>
        <div class="flex flex-wrap gap-3 shrink-0">
          <button
            @click="mostrarReporte = true"
            class="bg-sky-900/40 hover:bg-sky-900/60 border-2 border-white/40 text-white font-black text-lg px-6 py-4
                   rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center gap-2"
          >
            <span class="text-2xl">📄</span>
            Reporte
          </button>
          <button
            @click="panelAbierto = !panelAbierto"
            class="bg-white text-sky-700 hover:bg-sky-50 font-black text-lg px-7 py-4 rounded-2xl shadow-lg
                   transition-transform active:scale-95 flex items-center gap-2"
          >
            <span class="text-2xl">{{ panelAbierto ? '✕' : '➕' }}</span>
            {{ panelAbierto ? 'Cerrar' : 'Registrar Rollos' }}
          </button>
        </div>
      </div>

      <!-- Mapa del recorrido: que cualquiera entienda dónde está parado -->
      <div class="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span class="bg-white/25 ring-2 ring-white px-3 py-1.5 rounded-full">1 · 🧵 Rollos</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/10 px-3 py-1.5 rounded-full">2 · ✂️ Transformación</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/10 px-3 py-1.5 rounded-full">3 · 🏬 Terminados</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/10 px-3 py-1.5 rounded-full">4 · 🛒 Venta</span>
      </div>
    </div>

    <!-- ===================== AVISO ===================== -->
    <transition name="fade">
      <div
        v-if="aviso"
        class="mb-5 px-5 py-4 rounded-2xl font-bold border-2 shadow-sm"
        :class="aviso.tipo === 'ok'
          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
          : 'bg-rose-50 border-rose-300 text-rose-800'"
      >
        {{ aviso.texto }}
      </div>
    </transition>

    <!-- ===================== TARJETAS DE RESUMEN ===================== -->
    <div v-if="resumen" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-2xl p-5 border-l-8 border-emerald-500 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Kilos disponibles</p>
        <p class="text-3xl font-black text-emerald-600 mt-1">{{ resumen.kilosDisponibles.toFixed(1) }}<span class="text-lg"> kg</span></p>
        <p class="text-xs text-slate-500 mt-1">Tela lista para cortar</p>
      </div>
      <div class="bg-white rounded-2xl p-5 border-l-8 border-sky-500 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Rollos con tela</p>
        <p class="text-3xl font-black text-sky-600 mt-1">{{ resumen.rollosDisponibles }}</p>
        <p class="text-xs text-slate-500 mt-1">De {{ resumen.totalRollos }} registrados</p>
      </div>
      <div class="bg-white rounded-2xl p-5 border-l-8 border-violet-500 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Valor en tela</p>
        <p class="text-3xl font-black text-violet-600 mt-1">S/ {{ resumen.valorInventario.toFixed(2) }}</p>
        <p class="text-xs text-slate-500 mt-1">Capital parado en el almacén</p>
      </div>
      <div class="bg-white rounded-2xl p-5 border-l-8 border-amber-500 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Kilos ya cortados</p>
        <p class="text-3xl font-black text-amber-600 mt-1">{{ resumen.kilosConsumidos.toFixed(1) }}<span class="text-lg"> kg</span></p>
        <p class="text-xs text-slate-500 mt-1">Se fueron a producción</p>
      </div>
    </div>

    <!-- Kilos por color: de un vistazo, de qué color hay tela -->
    <div v-if="resumen?.porColor?.length" class="bg-white rounded-2xl p-5 shadow-sm mb-6">
      <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Kilos disponibles por color</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in resumen.porColor"
          :key="c.color"
          @click="filtroColor = filtroColor === c.color ? '' : c.color"
          class="flex items-center gap-2 pl-2 pr-4 py-2 rounded-xl border-2 font-bold text-sm transition-all"
          :class="filtroColor === c.color
            ? 'border-sky-500 bg-sky-50 text-sky-800 shadow'
            : 'border-slate-200 hover:border-slate-300 text-slate-700'"
        >
          <span class="w-5 h-5 rounded-md border border-slate-300 shrink-0" :style="{ backgroundColor: hexDeColor(c.color) }"></span>
          {{ c.color }}
          <span class="text-slate-500 font-semibold">{{ c.kilos.toFixed(1) }} kg · {{ c.rollos }} rollos</span>
        </button>
      </div>
    </div>

    <!-- ===================== PANEL DE REGISTRO ===================== -->
    <transition name="fade">
      <div v-if="panelAbierto" class="bg-white rounded-3xl shadow-xl border-2 border-sky-200 overflow-hidden mb-6">
        <div class="bg-sky-50 px-6 py-4 border-b-2 border-sky-100">
          <h2 class="text-xl font-black text-sky-900">➕ Registrar rollos que acaban de llegar</h2>
          <p class="text-sm text-sky-700 mt-1">
            Llena los datos de la tela una sola vez y luego agrega el peso de cada rollo.
            Si llegaron 20 rollos del mismo color, se registran los 20 de golpe.
          </p>
        </div>

        <div class="p-6 space-y-6">
          <!-- Datos comunes a todos los rollos del lote -->
          <div class="grid md:grid-cols-2 gap-5">
            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                Color de la tela <span class="text-rose-500">*</span>
              </label>
              <div class="flex gap-2">
                <span class="w-12 h-12 rounded-xl border-2 border-slate-200 shrink-0" :style="{ backgroundColor: hexDeColor(form.color) }"></span>
                <select
                  v-model="form.color" @change="alElegirColor"
                  class="flex-1 border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none"
                >
                  <option value="">— Elige el color —</option>
                  <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }} ({{ c.codigo }})</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Tipo de tela</label>
              <input
                v-model="form.descripcion" type="text" placeholder="Ej. Algodón 20/1 jersey"
                class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
              />
            </div>

            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Proveedor</label>
              <select
                v-model="form.proveedorId"
                class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
              >
                <option value="">— Sin especificar —</option>
                <option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.razonSocial }}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                Costo por kilo (S/) <span class="text-slate-400 normal-case">(opcional)</span>
              </label>
              <input
                v-model.number="form.costoPorKilo" type="number" step="0.01" min="0" placeholder="0.00"
                class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none"
              />
              <p class="text-xs text-slate-500 mt-1">
                Sirve para saber cuánto cuesta cada prenda cuando se corte la tela.
                Si todavía no lo sabes, déjalo en 0.
              </p>
            </div>
          </div>

          <!-- Los pesos: el núcleo del registro -->
          <div class="bg-slate-50 rounded-2xl p-5 border-2 border-slate-200">
            <p class="text-sm font-black uppercase tracking-wider text-slate-700 mb-1">
              ⚖️ Peso de cada rollo
            </p>
            <p class="text-xs text-slate-500 mb-4">
              Escribe el peso y presiona <strong>Enter</strong>. Repite por cada rollo de la balanza.
            </p>

            <div class="flex flex-wrap gap-3 items-end mb-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Kilos del rollo</label>
                <div class="flex gap-2">
                  <input
                    ref="inputPeso" v-model.number="pesoNuevo" type="number" step="0.001" min="0"
                    placeholder="24.500" @keyup.enter="agregarPeso"
                    class="w-36 border-2 border-slate-300 rounded-xl px-4 h-12 text-lg font-black text-slate-800 focus:border-emerald-500 outline-none"
                  />
                  <button
                    @click="agregarPeso"
                    class="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-5 h-12 rounded-xl shadow active:scale-95 transition-transform"
                  >+ Agregar</button>
                </div>
              </div>

              <div class="h-12 w-px bg-slate-300 hidden md:block"></div>

              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">O varios del mismo peso</label>
                <div class="flex gap-2 items-center">
                  <input
                    v-model.number="pesoRepetido" type="number" step="0.001" min="0" placeholder="kg"
                    class="w-24 border-2 border-slate-300 rounded-xl px-3 h-12 font-bold text-slate-800 focus:border-sky-500 outline-none"
                  />
                  <span class="font-black text-slate-400">×</span>
                  <input
                    v-model.number="cantidadRepetida" type="number" min="1" placeholder="20"
                    class="w-20 border-2 border-slate-300 rounded-xl px-3 h-12 font-bold text-slate-800 focus:border-sky-500 outline-none"
                  />
                  <button
                    @click="agregarVarios"
                    class="bg-sky-500 hover:bg-sky-600 text-white font-black px-4 h-12 rounded-xl shadow active:scale-95 transition-transform"
                  >Agregar</button>
                </div>
              </div>
            </div>

            <!-- Lista de pesos cargados -->
            <div v-if="pesos.length" class="flex flex-wrap gap-2">
              <span
                v-for="(p, i) in pesos" :key="i"
                class="group inline-flex items-center gap-2 bg-white border-2 border-emerald-300 text-emerald-800
                       font-black px-3 py-2 rounded-xl shadow-sm"
              >
                <span class="text-slate-400 text-xs font-bold">#{{ i + 1 }}</span>
                {{ p.toFixed(3) }} kg
                <button @click="quitarPeso(i)" class="text-rose-400 hover:text-rose-600 font-black px-1">✕</button>
              </span>
            </div>
            <p v-else class="text-sm text-slate-400 italic">Todavía no agregaste ningún rollo.</p>

            <!-- Totales del lote -->
            <div v-if="pesos.length" class="mt-5 grid grid-cols-3 gap-3">
              <div class="bg-white rounded-xl p-3 text-center border-2 border-slate-200">
                <p class="text-[11px] font-bold uppercase text-slate-500">Rollos</p>
                <p class="text-2xl font-black text-slate-800">{{ pesos.length }}</p>
              </div>
              <div class="bg-white rounded-xl p-3 text-center border-2 border-emerald-200">
                <p class="text-[11px] font-bold uppercase text-slate-500">Total kilos</p>
                <p class="text-2xl font-black text-emerald-600">{{ kilosARegistrar.toFixed(2) }}</p>
              </div>
              <div class="bg-white rounded-xl p-3 text-center border-2 border-violet-200">
                <p class="text-[11px] font-bold uppercase text-slate-500">Costo total</p>
                <p class="text-2xl font-black text-violet-600">S/ {{ costoARegistrar.toFixed(2) }}</p>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Observación</label>
            <input
              v-model="form.observacion" type="text" placeholder="Opcional: nota para el almacén"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
            />
          </div>

          <!-- Botones grandes -->
          <div class="flex flex-wrap gap-3">
            <button
              @click="guardar" :disabled="guardando || pesos.length === 0"
              class="flex-1 min-w-[240px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700
                     disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed
                     text-white font-black text-lg py-5 rounded-2xl shadow-lg active:scale-95 transition-all"
            >
              {{ guardando ? 'Guardando...' : `💾 Guardar ${pesos.length} rollo(s) — ${kilosARegistrar.toFixed(2)} kg` }}
            </button>
            <button
              @click="limpiarForm"
              class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-7 py-5 rounded-2xl transition-colors"
            >Limpiar</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ===================== FILTROS ===================== -->
    <div class="bg-white rounded-2xl p-4 shadow-sm mb-5 flex flex-wrap gap-3 items-center">
      <input
        v-model="filtroTexto" type="text" placeholder="🔍 Buscar por código, color, tela o proveedor..."
        class="flex-1 min-w-[220px] border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
      />
      <select v-model="filtroColor" class="border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none">
        <option value="">Todos los colores</option>
        <option v-for="c in coloresEnStock" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="filtroEstado" class="border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none">
        <option value="">Todos los estados</option>
        <option value="DISPONIBLE">Disponibles</option>
        <option value="EN_USO">Empezados</option>
        <option value="CONSUMIDO">Agotados</option>
      </select>
      <div class="bg-sky-50 border-2 border-sky-200 rounded-xl px-4 h-12 flex items-center font-black text-sky-800">
        {{ rollosFiltrados.length }} rollos · {{ kilosFiltrados.toFixed(1) }} kg
      </div>
    </div>

    <!-- ===================== TARJETAS DE ROLLOS ===================== -->
    <div v-if="cargando" class="text-center py-20 text-slate-400 font-bold text-lg">Cargando rollos...</div>

    <div v-else-if="rollosFiltrados.length === 0" class="bg-white rounded-3xl p-14 text-center shadow-sm">
      <p class="text-6xl mb-4">🧵</p>
      <p class="text-xl font-black text-slate-700">
        {{ rollos.length === 0 ? 'Todavía no hay tela registrada' : 'Ningún rollo coincide con el filtro' }}
      </p>
      <p class="text-slate-500 mt-2">
        {{ rollos.length === 0
          ? 'Usa el botón "Registrar Rollos" de arriba para ingresar la tela que llegó.'
          : 'Prueba limpiando la búsqueda o cambiando el estado.' }}
      </p>
    </div>

    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <div
        v-for="r in rollosFiltrados" :key="r.id"
        class="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden border-2 border-slate-100"
      >
        <!-- Franja del color de la tela: se identifica de lejos -->
        <div class="h-3" :style="{ backgroundColor: hexDeColor(r.color) }"></div>

        <div class="p-5">
          <div class="flex items-start justify-between gap-2 mb-3">
            <div>
              <p class="font-black text-lg text-slate-800 tracking-tight">{{ r.codigo }}</p>
              <p class="text-sm font-bold text-slate-600">{{ r.color }}</p>
            </div>
            <span class="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border-2 shrink-0" :class="estiloEstado(r.estado)">
              {{ textoEstado(r.estado) }}
            </span>
          </div>

          <p v-if="r.descripcion" class="text-xs text-slate-500 mb-3 truncate">{{ r.descripcion }}</p>

          <!-- Peso: el dato más importante de la tarjeta -->
          <div class="flex items-end gap-2 mb-2">
            <p class="text-4xl font-black text-slate-800 leading-none">{{ Number(r.pesoActual).toFixed(2) }}</p>
            <p class="text-lg font-bold text-slate-400 leading-none pb-0.5">kg</p>
            <p class="text-xs text-slate-400 ml-auto pb-1">entró con {{ Number(r.pesoInicial).toFixed(2) }}</p>
          </div>

          <!-- Barra: cuánto queda del rollo -->
          <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div
              class="h-full rounded-full transition-all"
              :class="porcentajeRestante(r) > 50 ? 'bg-emerald-500' : porcentajeRestante(r) > 15 ? 'bg-amber-500' : 'bg-rose-500'"
              :style="{ width: porcentajeRestante(r) + '%' }"
            ></div>
          </div>

          <div class="text-xs text-slate-500 space-y-1 mb-4">
            <p v-if="Number(r.costoPorKilo) > 0">
              💵 S/ {{ Number(r.costoPorKilo).toFixed(2) }}/kg
              <span class="text-slate-400">· valor S/ {{ (Number(r.pesoActual) * Number(r.costoPorKilo)).toFixed(2) }}</span>
            </p>
            <p v-if="r.proveedor">🏢 {{ r.proveedor.razonSocial }}</p>
            <p>📅 {{ fecha(r.fechaIngreso) }}</p>
          </div>

          <div class="flex gap-2">
            <button
              @click="abrirAjuste(r)" :disabled="r.estado === 'ANULADO'"
              class="flex-1 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-700 font-bold text-sm py-2.5 rounded-xl border-2 border-amber-200 transition-colors"
            >⚖️ Pesar</button>
            <button
              @click="verHistorial(r)"
              class="flex-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-sm py-2.5 rounded-xl border-2 border-sky-200 transition-colors"
            >📜 Historial</button>
            <button
              @click="anular(r)" :disabled="r.estado === 'ANULADO'"
              class="bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-600 font-bold text-sm px-3 py-2.5 rounded-xl border-2 border-rose-200 transition-colors"
              title="Anular (registrado por error)"
            >🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== MODAL: AJUSTAR PESO ===================== -->
    <div v-if="modalAjuste" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" @click.self="modalAjuste = null">
      <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div class="bg-amber-500 px-6 py-5 text-white">
          <h3 class="text-2xl font-black">⚖️ Pesar de nuevo</h3>
          <p class="text-amber-50 text-sm mt-1">{{ modalAjuste.codigo }} — {{ modalAjuste.color }}</p>
        </div>
        <div class="p-6 space-y-5">
          <p class="text-sm text-slate-600 bg-slate-50 rounded-xl p-4 border border-slate-200">
            El sistema dice que este rollo tiene
            <strong>{{ Number(modalAjuste.pesoActual).toFixed(3) }} kg</strong>.
            Si la balanza dice otra cosa, escribe el peso real: queda registrado como ajuste
            y se puede consultar después.
          </p>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Peso real en balanza (kg)</label>
            <input
              v-model.number="pesoReal" type="number" step="0.001" min="0"
              class="w-full border-2 border-amber-300 rounded-xl px-4 h-14 text-2xl font-black text-slate-800 focus:border-amber-500 outline-none"
            />
          </div>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Motivo (opcional)</label>
            <input
              v-model="motivoAjuste" type="text" placeholder="Ej. sobró tela del corte / error de balanza"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-amber-500 outline-none"
            />
          </div>

          <div class="flex gap-3">
            <button
              @click="confirmarAjuste" :disabled="guardando"
              class="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-black text-lg py-4 rounded-2xl shadow active:scale-95 transition-all"
            >{{ guardando ? 'Guardando...' : 'Confirmar peso' }}</button>
            <button @click="modalAjuste = null" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 rounded-2xl">Cancelar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== MODAL: HISTORIAL ===================== -->
    <div v-if="modalHistorial" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" @click.self="modalHistorial = null">
      <div class="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
        <div class="bg-sky-600 px-6 py-5 text-white flex items-start justify-between">
          <div>
            <h3 class="text-2xl font-black">📜 {{ modalHistorial.codigo }}</h3>
            <p class="text-sky-100 text-sm mt-1">
              {{ modalHistorial.color }} · entró con {{ Number(modalHistorial.pesoInicial).toFixed(3) }} kg ·
              hoy tiene {{ Number(modalHistorial.pesoActual).toFixed(3) }} kg
            </p>
          </div>
          <button @click="modalHistorial = null" class="text-white/80 hover:text-white text-3xl leading-none">&times;</button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6">
          <!-- Cada kilo que entró y salió -->
          <div>
            <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Movimientos de kilos</p>
            <div class="space-y-2">
              <div
                v-for="m in modalHistorial.movimientos" :key="m.id"
                class="flex items-center gap-4 p-3 rounded-xl border-2"
                :class="Number(m.peso) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'"
              >
                <span class="text-2xl shrink-0">{{ Number(m.peso) >= 0 ? '📥' : '📤' }}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-slate-800 text-sm truncate">{{ m.motivo }}</p>
                  <p class="text-xs text-slate-500">{{ fechaHora(m.fecha) }} · {{ m.tipo }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-black text-lg" :class="Number(m.peso) >= 0 ? 'text-emerald-600' : 'text-rose-600'">
                    {{ Number(m.peso) >= 0 ? '+' : '' }}{{ Number(m.peso).toFixed(3) }} kg
                  </p>
                  <p class="text-xs text-slate-500">quedó en {{ Number(m.pesoResultante).toFixed(3) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- En qué cortes se usó -->
          <div v-if="modalHistorial.consumos?.length">
            <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Cortes donde se usó</p>
            <div class="space-y-2">
              <div v-for="c in modalHistorial.consumos" :key="c.id" class="flex items-center gap-3 p-3 bg-violet-50 border-2 border-violet-200 rounded-xl">
                <span class="text-xl">✂️</span>
                <div class="flex-1">
                  <p class="font-black text-violet-900">{{ c.transformacion.codigo }}</p>
                  <p class="text-xs text-violet-700">{{ c.transformacion.producto?.nombre }} · {{ fecha(c.transformacion.fecha) }}</p>
                </div>
                <p class="font-black text-violet-700">{{ Number(c.pesoUsado).toFixed(3) }} kg</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- =====================================================================
         REPORTE DEL ALMACÉN DE ROLLOS
         Qué rollos hay, de qué color, de qué peso, de quién vinieron y
         cuántos kilos ya se fueron al corte. Se puede imprimir o bajar a Excel.
         ===================================================================== -->
    <div v-if="mostrarReporte" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-[100] p-4 overflow-y-auto">
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-6xl my-4 overflow-hidden">

        <div class="bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-700 p-5 flex justify-between items-center text-white">
          <div>
            <h3 class="text-xl font-black">📄 Reporte del Almacén de Rollos</h3>
            <p class="text-xs text-sky-100 font-medium">Todos los rollos registrados, sus kilos y lo que ya se cortó</p>
          </div>
          <button @click="mostrarReporte = false" class="text-white/70 hover:text-white text-3xl leading-none">&times;</button>
        </div>

        <div class="p-5 space-y-5">

          <!-- ---------- FILTROS ---------- -->
          <div class="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4">
            <p class="text-[11px] font-black text-slate-600 uppercase tracking-wider mb-3">🔎 Filtros</p>
            <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Estado</label>
                <select v-model="repEstado" class="w-full border-2 border-slate-200 rounded-xl p-2.5 bg-white text-sm font-bold text-slate-700 outline-none focus:border-sky-500">
                  <option value="">Todos</option>
                  <option value="DISPONIBLE">🟢 Enteros</option>
                  <option value="EN_USO">🟡 Empezados</option>
                  <option value="CONSUMIDO">⚪ Agotados</option>
                  <option value="ANULADO">🔴 Anulados</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Color</label>
                <select v-model="repColor" class="w-full border-2 border-slate-200 rounded-xl p-2.5 bg-white text-sm font-bold text-slate-700 outline-none focus:border-sky-500">
                  <option value="">Todos los colores</option>
                  <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Proveedor</label>
                <select v-model="repProveedor" class="w-full border-2 border-slate-200 rounded-xl p-2.5 bg-white text-sm font-bold text-slate-700 outline-none focus:border-sky-500">
                  <option value="">Todos</option>
                  <option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.razonSocial }}</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Ingresaron desde</label>
                <input type="date" v-model="repDesde" class="w-full border-2 border-slate-200 rounded-xl p-2.5 bg-white text-sm font-bold text-slate-700 outline-none focus:border-sky-500">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-500 uppercase mb-1">Hasta</label>
                <input type="date" v-model="repHasta" class="w-full border-2 border-slate-200 rounded-xl p-2.5 bg-white text-sm font-bold text-slate-700 outline-none focus:border-sky-500">
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3 mt-3">
              <label class="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 cursor-pointer">
                <input type="checkbox" v-model="repIncluirAnulados" class="w-4 h-4 accent-rose-600">
                <span class="text-xs font-bold text-slate-700">Incluir rollos anulados</span>
                <span v-if="cargandoAnulados" class="text-[10px] text-slate-400 font-bold">cargando…</span>
              </label>
              <button @click="limpiarFiltrosReporte" class="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs">
                Limpiar filtros
              </button>
            </div>
          </div>

          <!-- ---------- TARJETAS ---------- -->
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div class="bg-white border-l-4 border-slate-400 shadow-sm rounded-2xl p-4">
              <p class="text-[10px] font-black text-slate-500 uppercase">Rollos</p>
              <p class="text-3xl font-black text-slate-700">{{ totalesReporte.rollos }}</p>
              <p class="text-[10px] text-slate-500 font-bold">{{ totalesReporte.colores }} colores</p>
            </div>
            <div class="bg-white border-l-4 border-sky-500 shadow-sm rounded-2xl p-4">
              <p class="text-[10px] font-black text-slate-500 uppercase">Ingresaron</p>
              <p class="text-3xl font-black text-sky-700">{{ totalesReporte.ingresados.toFixed(2) }}</p>
              <p class="text-[10px] text-slate-500 font-bold">kilos</p>
            </div>
            <div class="bg-white border-l-4 border-emerald-500 shadow-sm rounded-2xl p-4">
              <p class="text-[10px] font-black text-slate-500 uppercase">Quedan hoy</p>
              <p class="text-3xl font-black text-emerald-700">{{ totalesReporte.disponibles.toFixed(2) }}</p>
              <p class="text-[10px] text-slate-500 font-bold">kilos en el almacén</p>
            </div>
            <div class="bg-white border-l-4 border-violet-500 shadow-sm rounded-2xl p-4">
              <p class="text-[10px] font-black text-slate-500 uppercase">Se cortaron</p>
              <p class="text-3xl font-black text-violet-700">{{ totalesReporte.consumidos.toFixed(2) }}</p>
              <p class="text-[10px] text-slate-500 font-bold">{{ totalesReporte.pctConsumido.toFixed(1) }}% de lo que entró</p>
            </div>
            <div class="bg-white border-l-4 border-amber-500 shadow-sm rounded-2xl p-4">
              <p class="text-[10px] font-black text-slate-500 uppercase">Valor de lo que queda</p>
              <p class="text-2xl font-black text-amber-700">S/ {{ totalesReporte.valor.toFixed(2) }}</p>
            </div>
          </div>

          <!-- ---------- ESTADO DE LOS ROLLOS ---------- -->
          <div class="flex flex-wrap gap-2">
            <span class="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-800 border-2 border-emerald-300 font-black text-sm">
              🟢 {{ totalesReporte.enteros }} enteros
            </span>
            <span class="px-4 py-2 rounded-xl bg-amber-100 text-amber-800 border-2 border-amber-300 font-black text-sm">
              🟡 {{ totalesReporte.empezados }} empezados
            </span>
            <span class="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 border-2 border-slate-300 font-black text-sm">
              ⚪ {{ totalesReporte.agotados }} agotados
            </span>
            <span v-if="totalesReporte.anulados" class="px-4 py-2 rounded-xl bg-rose-100 text-rose-800 border-2 border-rose-300 font-black text-sm">
              🔴 {{ totalesReporte.anulados }} anulados
            </span>
            <span v-if="totalesReporte.sinPrecio" class="px-4 py-2 rounded-xl bg-white text-slate-500 border-2 border-dashed border-slate-300 font-bold text-sm">
              💵 {{ totalesReporte.sinPrecio }} sin precio por kilo
            </span>
            <span v-if="totalesReporte.sinProveedor" class="px-4 py-2 rounded-xl bg-white text-slate-500 border-2 border-dashed border-slate-300 font-bold text-sm">
              🚚 {{ totalesReporte.sinProveedor }} sin proveedor
            </span>
          </div>

          <!-- ---------- POR COLOR / POR PROVEEDOR ---------- -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="bg-white border-2 border-slate-100 rounded-2xl p-4">
              <p class="text-[11px] font-black text-slate-600 uppercase tracking-wider mb-3">🎨 Por color</p>
              <p v-if="reportePorColor.length === 0" class="text-xs text-slate-400 font-bold">Sin rollos.</p>
              <div v-for="c in reportePorColor" :key="c.nombre" class="mb-3">
                <div class="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
                  <span class="flex items-center gap-2">
                    <span class="w-3.5 h-3.5 rounded-full border border-white shadow" :style="{ backgroundColor: hexDeColor(c.nombre) }"></span>
                    {{ c.nombre }}
                    <span class="text-slate-400 font-medium">({{ c.rollos }} rollos)</span>
                  </span>
                  <span>
                    <span class="text-emerald-700 font-black">{{ c.disponibles.toFixed(2) }}</span>
                    <span class="text-slate-400"> / {{ c.ingresados.toFixed(2) }} kg</span>
                  </span>
                </div>
                <!-- La barra clara es lo que entró; la oscura, lo que queda -->
                <div class="h-3 bg-slate-100 rounded-full overflow-hidden relative">
                  <div class="h-full bg-sky-200 absolute inset-y-0 left-0" :style="{ width: Math.max(2, (c.ingresados / maxKilosColor) * 100) + '%' }"></div>
                  <div class="h-full bg-gradient-to-r from-emerald-400 to-teal-500 absolute inset-y-0 left-0 rounded-full" :style="{ width: Math.max(1, (c.disponibles / maxKilosColor) * 100) + '%' }"></div>
                </div>
              </div>
              <p v-if="reportePorColor.length" class="text-[10px] text-slate-400 font-bold mt-2">
                Barra clara = kilos que entraron · barra verde = kilos que quedan
              </p>
            </div>

            <div class="bg-white border-2 border-slate-100 rounded-2xl p-4">
              <p class="text-[11px] font-black text-slate-600 uppercase tracking-wider mb-3">🚚 Por proveedor</p>
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-slate-500 uppercase text-[10px]">
                    <th class="text-left pb-2">Proveedor</th>
                    <th class="text-right pb-2">Rollos</th>
                    <th class="text-right pb-2">Entraron</th>
                    <th class="text-right pb-2">Quedan</th>
                    <th class="text-right pb-2">Valor</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-if="reportePorProveedor.length === 0">
                    <td colspan="5" class="py-3 text-slate-400 font-bold">Sin rollos.</td>
                  </tr>
                  <tr v-for="pv in reportePorProveedor" :key="pv.nombre">
                    <td class="py-2 font-bold text-slate-700">{{ pv.nombre }}</td>
                    <td class="py-2 text-right font-bold text-slate-600">{{ pv.rollos }}</td>
                    <td class="py-2 text-right font-bold text-sky-700">{{ pv.ingresados.toFixed(2) }}</td>
                    <td class="py-2 text-right font-black text-emerald-700">{{ pv.disponibles.toFixed(2) }}</td>
                    <td class="py-2 text-right font-black text-amber-700">S/ {{ pv.valor.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ---------- DETALLE ROLLO POR ROLLO ---------- -->
          <div class="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden">
            <p class="text-[11px] font-black text-slate-600 uppercase tracking-wider p-4 pb-3">
              📋 Rollo por rollo · {{ totalesReporte.rollos }} rollos
            </p>
            <div class="overflow-x-auto max-h-[440px] overflow-y-auto">
              <table class="w-full text-sm text-left">
                <thead class="bg-slate-800 text-white uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th class="p-3">Código</th>
                    <th class="p-3">Ingresó</th>
                    <th class="p-3">Color</th>
                    <th class="p-3">Proveedor</th>
                    <th class="p-3 text-right">Peso inicial</th>
                    <th class="p-3 text-right">Peso hoy</th>
                    <th class="p-3 text-right">Usados</th>
                    <th class="p-3 text-center">Estado</th>
                    <th class="p-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-if="filasReporte.length === 0">
                    <td colspan="9" class="p-8 text-center text-slate-400 font-bold">
                      No hay rollos con esos filtros.
                    </td>
                  </tr>
                  <tr v-for="f in filasReporte" :key="f.id" class="hover:bg-sky-50/60 even:bg-slate-50/50">
                    <td class="p-3 font-mono font-black text-slate-700">{{ f.codigo }}</td>
                    <td class="p-3 text-xs text-slate-500 font-bold whitespace-nowrap">{{ fecha(f.fechaIngreso) }}</td>
                    <td class="p-3">
                      <span class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <span class="w-3 h-3 rounded-full border border-white shadow" :style="{ backgroundColor: hexDeColor(f.color) }"></span>
                        {{ f.color }}
                      </span>
                      <p v-if="f.descripcion" class="text-[10px] text-slate-400 font-medium">{{ f.descripcion }}</p>
                    </td>
                    <td class="p-3 text-xs font-bold text-slate-600">{{ f.proveedorNombre || '—' }}</td>
                    <td class="p-3 text-right font-bold text-slate-500">{{ f.kgInicial.toFixed(3) }}</td>
                    <td class="p-3 text-right font-black" :class="f.kgActual > 0 ? 'text-emerald-700' : 'text-slate-300'">
                      {{ f.kgActual.toFixed(3) }}
                    </td>
                    <td class="p-3 text-right font-bold" :class="f.kgUsado > 0 ? 'text-violet-700' : 'text-slate-300'">
                      {{ f.kgUsado.toFixed(3) }}
                    </td>
                    <td class="p-3 text-center">
                      <span class="px-2 py-0.5 rounded-lg border text-[10px] font-black" :class="estiloEstado(f.estado)">
                        {{ textoEstado(f.estado) }}
                      </span>
                    </td>
                    <td class="p-3 text-right font-black text-amber-700">{{ f.valor > 0 ? 'S/ ' + f.valor.toFixed(2) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="bg-sky-50 border-l-4 border-sky-500 rounded-2xl p-4">
            <p class="text-[11px] text-sky-900 leading-relaxed">
              ℹ️ <b>Peso hoy</b> son los kilos que quedan en el rollo ahora mismo. Los <b>usados</b>
              salieron al corte: cada kilo está detallado en <b>✂️ Transformación</b>, con el corte
              y las prendas en las que se convirtió. Los rollos <b>anulados</b> son errores de
              registro y no cuentan, salvo que los pidas con la casilla de arriba.
            </p>
          </div>
        </div>

        <div class="bg-slate-50 p-4 border-t-2 border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
          <p class="text-[11px] text-slate-500 font-bold">Generado el {{ new Date().toLocaleString('es-PE') }}</p>
          <div class="flex gap-2 w-full md:w-auto">
            <button @click="imprimirReporte" class="flex-1 md:flex-none bg-slate-700 hover:bg-slate-800 text-white px-5 py-3 rounded-xl font-black text-sm shadow">
              🖨️ Imprimir
            </button>
            <button @click="exportarReporte" class="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-black text-sm shadow">
              ⬇️ Excel (CSV)
            </button>
            <button @click="mostrarReporte = false" class="px-5 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200">
              Cerrar
            </button>
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
