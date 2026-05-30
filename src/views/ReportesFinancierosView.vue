<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../api/axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Tab = 'inventario' | 'rentabilidad' | 'rentables' | 'cobrar';
const tabActiva = ref<Tab>('inventario');
const cargando = ref(false);

// Datos de cada reporte
const inventario = ref<any>({ valorTotalInventario: 0, unidadesTotales: 0, detalle: [] });
const rentabilidad = ref<any>({ resumen: {}, ventas: [] });
const rentables = ref<any>({ ranking: [] });
const cobrar = ref<any>({ totalPorCobrar: 0, clientesConDeuda: [], cuotasVencidas: [] });

// Filtro de fechas (para rentabilidad y productos rentables)
const hoy = new Date().toISOString().slice(0, 10);
const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const desde = ref(inicioMes);
const hasta = ref(hoy);

const soles = (n: number) => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cargarInventario = async () => {
  cargando.value = true;
  try { inventario.value = (await api.get('/reportes/inventario-valorizado')).data; }
  catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const cargarRentabilidad = async () => {
  cargando.value = true;
  try { rentabilidad.value = (await api.get('/reportes/rentabilidad', { params: { desde: desde.value, hasta: hasta.value } })).data; }
  catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const cargarRentables = async () => {
  cargando.value = true;
  try { rentables.value = (await api.get('/reportes/productos-rentables', { params: { desde: desde.value, hasta: hasta.value } })).data; }
  catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const cargarCobrar = async () => {
  cargando.value = true;
  try { cobrar.value = (await api.get('/reportes/cuentas-por-cobrar')).data; }
  catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const cambiarTab = (t: Tab) => {
  tabActiva.value = t;
  if (t === 'inventario') cargarInventario();
  else if (t === 'rentabilidad') cargarRentabilidad();
  else if (t === 'rentables') cargarRentables();
  else if (t === 'cobrar') cargarCobrar();
};

const aplicarFiltro = () => {
  if (tabActiva.value === 'rentabilidad') cargarRentabilidad();
  else if (tabActiva.value === 'rentables') cargarRentables();
};

// Color de la utilidad/margen según signo
const claseUtilidad = (n: number) => n > 0 ? 'text-emerald-600' : n < 0 ? 'text-rose-600' : 'text-gray-500';

const margenGlobalClase = computed(() => {
  const m = Number(rentabilidad.value?.resumen?.margenPromedio || 0);
  return m >= 30 ? 'text-emerald-600' : m >= 15 ? 'text-amber-600' : 'text-rose-600';
});

// ==========================================
// EXPORTACIÓN A PDF
// ==========================================
const exportarPDF = () => {
  const doc = new jsPDF();
  const fecha = new Date().toLocaleDateString('es-PE');

  if (tabActiva.value === 'inventario') {
    doc.setFontSize(16); doc.text('Inventario Valorizado', 14, 18);
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`Valor total: ${soles(inventario.value.valorTotalInventario)}  |  Unidades: ${inventario.value.unidadesTotales}  |  ${fecha}`, 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [['Producto', 'SKU', 'Color', 'Talla', 'Unid.', 'Costo Prom.', 'Valor']],
      body: inventario.value.detalle.map((i: any) => [
        i.producto, i.sku, i.color, i.talla, i.unidades, soles(i.costoPromedio), soles(i.valorTotal),
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [17, 24, 39] },
    });
    doc.save(`inventario-valorizado-${fecha}.pdf`);
  } else if (tabActiva.value === 'rentabilidad') {
    doc.setFontSize(16); doc.text('Reporte de Rentabilidad', 14, 18);
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`${desde.value} a ${hasta.value}  |  Utilidad: ${soles(rentabilidad.value.resumen.utilidadBruta)}  |  Margen: ${rentabilidad.value.resumen.margenPromedio}%`, 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [['Venta', 'Fecha', 'Cliente', 'Ingreso', 'Costo', 'Utilidad', 'Margen %']],
      body: rentabilidad.value.ventas.map((v: any) => [
        v.correlativo, new Date(v.fecha).toLocaleDateString('es-PE'), v.cliente,
        soles(v.ingreso), soles(v.costo), soles(v.utilidad), v.margenPct + '%',
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [17, 24, 39] },
    });
    doc.save(`rentabilidad-${fecha}.pdf`);
  } else if (tabActiva.value === 'rentables') {
    doc.setFontSize(16); doc.text('Productos Más Rentables', 14, 18);
    autoTable(doc, {
      startY: 26,
      head: [['#', 'Producto', 'SKU', 'Unid.', 'Ingreso', 'Costo', 'Utilidad', 'Margen %']],
      body: rentables.value.ranking.map((p: any, i: number) => [
        i + 1, p.producto, p.sku, p.unidadesVendidas, soles(p.ingreso), soles(p.costo), soles(p.utilidad), p.margenPct + '%',
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [17, 24, 39] },
    });
    doc.save(`productos-rentables-${fecha}.pdf`);
  } else if (tabActiva.value === 'cobrar') {
    doc.setFontSize(16); doc.text('Cuentas por Cobrar', 14, 18);
    doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`Total por cobrar: ${soles(cobrar.value.totalPorCobrar)}  |  ${fecha}`, 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [['Cliente', 'Documento', 'Teléfono', 'Límite', 'Saldo Pendiente']],
      body: cobrar.value.clientesConDeuda.map((c: any) => [
        c.nombre, c.documento || '-', c.telefono || '-', soles(c.limiteCredito), soles(c.saldoPendiente),
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [17, 24, 39] },
    });
    doc.save(`cuentas-por-cobrar-${fecha}.pdf`);
  }
};

onMounted(() => cargarInventario());
</script>

<template>
  <div class="min-h-screen bg-[#F8FAFC] p-4 lg:p-8 font-sans">
    <header class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-black text-gray-900 tracking-tight">Reportes Financieros</h1>
        <p class="text-sm text-gray-500 mt-1 font-medium">Inventario, rentabilidad y cobranzas valorizados a costo real</p>
      </div>
      <button @click="exportarPDF" class="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-bold rounded-lg shadow-md hover:bg-gray-800 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        Exportar PDF
      </button>
    </header>

    <!-- PESTAÑAS -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button v-for="t in [
        { id: 'inventario', label: 'Inventario Valorizado' },
        { id: 'rentabilidad', label: 'Rentabilidad' },
        { id: 'rentables', label: 'Más Rentables' },
        { id: 'cobrar', label: 'Por Cobrar' },
      ]" :key="t.id" @click="cambiarTab(t.id as Tab)"
        :class="tabActiva === t.id ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'"
        class="px-4 py-2 rounded-xl text-sm font-bold transition-all">
        {{ t.label }}
      </button>
    </div>

    <!-- FILTRO DE FECHAS (solo rentabilidad / rentables) -->
    <div v-if="tabActiva === 'rentabilidad' || tabActiva === 'rentables'" class="bg-white rounded-xl border border-gray-100 p-4 mb-6 flex flex-wrap items-end gap-4 shadow-sm">
      <div>
        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Desde</label>
        <input type="date" v-model="desde" class="border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Hasta</label>
        <input type="date" v-model="hasta" class="border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <button @click="aplicarFiltro" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition">Aplicar</button>
    </div>

    <div v-if="cargando" class="text-center py-16 text-gray-400 font-medium">Cargando datos...</div>

    <!-- ====================== INVENTARIO VALORIZADO ====================== -->
    <div v-show="!cargando && tabActiva === 'inventario'">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
          <div class="absolute w-2 h-full bg-emerald-500 left-0 top-0"></div>
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 pl-2">Valor Total del Inventario</p>
          <h2 class="text-4xl font-black text-gray-900 pl-2">{{ soles(inventario.valorTotalInventario) }}</h2>
          <p class="text-xs text-gray-400 mt-2 pl-2">Capital invertido en stock (costo promedio)</p>
        </div>
        <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
          <div class="absolute w-2 h-full bg-indigo-500 left-0 top-0"></div>
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 pl-2">Unidades en Almacén</p>
          <h2 class="text-4xl font-black text-gray-900 pl-2">{{ inventario.unidadesTotales }}</h2>
          <p class="text-xs text-gray-400 mt-2 pl-2">Prendas físicas valorizadas</p>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th class="px-5 py-3">Producto</th><th class="px-5 py-3">Color</th><th class="px-5 py-3">Talla</th>
              <th class="px-5 py-3 text-right">Unid.</th><th class="px-5 py-3 text-right">Costo Prom.</th><th class="px-5 py-3 text-right">Valor</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-if="inventario.detalle.length === 0"><td colspan="6" class="px-5 py-10 text-center text-gray-400">Sin stock valorizado todavía.</td></tr>
              <tr v-for="(i, idx) in inventario.detalle" :key="idx" class="hover:bg-gray-50/80">
                <td class="px-5 py-3"><span class="font-bold text-gray-800 text-sm">{{ i.producto }}</span><br><span class="text-xs text-gray-400 font-mono">{{ i.sku }}</span></td>
                <td class="px-5 py-3 text-sm text-gray-600">{{ i.color }}</td>
                <td class="px-5 py-3 text-sm text-gray-600">{{ i.talla }}</td>
                <td class="px-5 py-3 text-right font-bold text-gray-700">{{ i.unidades }}</td>
                <td class="px-5 py-3 text-right text-sm text-gray-600">{{ soles(i.costoPromedio) }}</td>
                <td class="px-5 py-3 text-right font-black text-gray-900">{{ soles(i.valorTotal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================== RENTABILIDAD ====================== -->
    <div v-show="!cargando && tabActiva === 'rentabilidad'">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Vendido</p>
          <h3 class="text-2xl font-black text-gray-900">{{ soles(rentabilidad.resumen.totalVendido) }}</h3>
        </div>
        <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Costo de Venta</p>
          <h3 class="text-2xl font-black text-gray-500">{{ soles(rentabilidad.resumen.totalCosto) }}</h3>
        </div>
        <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Utilidad Bruta</p>
          <h3 class="text-2xl font-black text-emerald-600">{{ soles(rentabilidad.resumen.utilidadBruta) }}</h3>
        </div>
        <div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Margen Promedio</p>
          <h3 class="text-2xl font-black" :class="margenGlobalClase">{{ rentabilidad.resumen.margenPromedio }}%</h3>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th class="px-5 py-3">Venta</th><th class="px-5 py-3">Fecha</th><th class="px-5 py-3">Cliente</th>
              <th class="px-5 py-3 text-right">Ingreso</th><th class="px-5 py-3 text-right">Costo</th>
              <th class="px-5 py-3 text-right">Utilidad</th><th class="px-5 py-3 text-right">Margen</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-if="rentabilidad.ventas.length === 0"><td colspan="7" class="px-5 py-10 text-center text-gray-400">No hay ventas en este período.</td></tr>
              <tr v-for="v in rentabilidad.ventas" :key="v.correlativo" class="hover:bg-gray-50/80">
                <td class="px-5 py-3"><span class="text-xs font-mono font-bold bg-gray-100 px-2 py-0.5 rounded">{{ v.correlativo }}</span></td>
                <td class="px-5 py-3 text-sm text-gray-600">{{ new Date(v.fecha).toLocaleDateString('es-PE') }}</td>
                <td class="px-5 py-3 text-sm text-gray-700">{{ v.cliente }}</td>
                <td class="px-5 py-3 text-right text-sm text-gray-700">{{ soles(v.ingreso) }}</td>
                <td class="px-5 py-3 text-right text-sm text-gray-500">{{ soles(v.costo) }}</td>
                <td class="px-5 py-3 text-right font-black" :class="claseUtilidad(v.utilidad)">{{ soles(v.utilidad) }}</td>
                <td class="px-5 py-3 text-right font-bold text-sm" :class="claseUtilidad(v.utilidad)">{{ v.margenPct }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================== PRODUCTOS RENTABLES ====================== -->
    <div v-show="!cargando && tabActiva === 'rentables'">
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th class="px-5 py-3">#</th><th class="px-5 py-3">Producto</th>
              <th class="px-5 py-3 text-right">Vendidas</th><th class="px-5 py-3 text-right">Ingreso</th>
              <th class="px-5 py-3 text-right">Costo</th><th class="px-5 py-3 text-right">Utilidad</th><th class="px-5 py-3 text-right">Margen</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-if="rentables.ranking.length === 0"><td colspan="7" class="px-5 py-10 text-center text-gray-400">No hay datos en este período.</td></tr>
              <tr v-for="(p, idx) in rentables.ranking" :key="p.sku" class="hover:bg-gray-50/80">
                <td class="px-5 py-3"><span class="w-7 h-7 flex items-center justify-center rounded-full font-black text-xs" :class="Number(idx) < 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'">{{ Number(idx) + 1 }}</span></td>
                <td class="px-5 py-3"><span class="font-bold text-gray-800 text-sm">{{ p.producto }}</span><br><span class="text-xs text-gray-400 font-mono">{{ p.sku }}</span></td>
                <td class="px-5 py-3 text-right font-bold text-gray-700">{{ p.unidadesVendidas }}</td>
                <td class="px-5 py-3 text-right text-sm text-gray-600">{{ soles(p.ingreso) }}</td>
                <td class="px-5 py-3 text-right text-sm text-gray-500">{{ soles(p.costo) }}</td>
                <td class="px-5 py-3 text-right font-black" :class="claseUtilidad(p.utilidad)">{{ soles(p.utilidad) }}</td>
                <td class="px-5 py-3 text-right font-bold text-sm" :class="claseUtilidad(p.utilidad)">{{ p.margenPct }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================== CUENTAS POR COBRAR ====================== -->
    <div v-show="!cargando && tabActiva === 'cobrar'">
      <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden mb-6 max-w-md">
        <div class="absolute w-2 h-full bg-rose-500 left-0 top-0"></div>
        <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 pl-2">Total por Cobrar</p>
        <h2 class="text-4xl font-black text-rose-600 pl-2">{{ soles(cobrar.totalPorCobrar) }}</h2>
      </div>

      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-bold text-gray-900">Clientes con Deuda</h3></div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th class="px-5 py-3">Cliente</th><th class="px-5 py-3">Teléfono</th>
              <th class="px-5 py-3 text-right">Límite</th><th class="px-5 py-3 text-right">Saldo Pendiente</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-if="cobrar.clientesConDeuda.length === 0"><td colspan="4" class="px-5 py-10 text-center text-gray-400">No hay deudas pendientes. 🎉</td></tr>
              <tr v-for="(c, idx) in cobrar.clientesConDeuda" :key="idx" class="hover:bg-gray-50/80">
                <td class="px-5 py-3"><span class="font-bold text-gray-800 text-sm">{{ c.nombre }}</span><br><span class="text-xs text-gray-400">{{ c.documento || 'Sin documento' }}</span></td>
                <td class="px-5 py-3 text-sm text-gray-600">{{ c.telefono || '-' }}</td>
                <td class="px-5 py-3 text-right text-sm text-gray-500">{{ soles(c.limiteCredito) }}</td>
                <td class="px-5 py-3 text-right font-black text-rose-600">{{ soles(c.saldoPendiente) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="cobrar.cuotasVencidas.length > 0" class="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-rose-100 bg-rose-50/50"><h3 class="font-bold text-rose-700">⚠️ Cuotas Vencidas</h3></div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th class="px-5 py-3">Venta</th><th class="px-5 py-3">Cliente</th><th class="px-5 py-3">Cuota</th>
              <th class="px-5 py-3 text-right">Saldo</th><th class="px-5 py-3">Venció</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="(q, idx) in cobrar.cuotasVencidas" :key="idx" class="hover:bg-gray-50/80">
                <td class="px-5 py-3 text-xs font-mono font-bold">{{ q.venta }}</td>
                <td class="px-5 py-3 text-sm text-gray-700">{{ q.cliente }}</td>
                <td class="px-5 py-3 text-sm text-gray-600">#{{ q.numeroCuota }}</td>
                <td class="px-5 py-3 text-right font-black text-rose-600">{{ soles(q.saldo) }}</td>
                <td class="px-5 py-3 text-sm text-rose-500">{{ q.fechaVencimiento ? new Date(q.fechaVencimiento).toLocaleDateString('es-PE') : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>