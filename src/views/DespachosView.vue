<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import api from '../api/axios'; 
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

// 🔥 1. INTERFAZ MEJORADA: Ahora incluye los detalles de la venta
interface Despacho {
  id: number;
  codigoGuia: string; 
  cliente: string;
  destino: string;
  prendas: number;
  estado: string;
  fecha: string;
  venta?: {
    detalles: {
      nombre: string;
      color: string;
      talla: string;
      cantidad: number;
    }[]
  };
}

const cargando = ref(true);
const despachos = ref<Despacho[]>([]);
const errorConexion = ref(false);
const despachoAImprimir = ref<Despacho | null>(null);

const cargarDespachos = async () => {
  try {
    cargando.value = true;
    errorConexion.value = false;
    const response = await api.get('/ventas/despachos-pendientes'); // 🚨 Ajusté la ruta a la que creamos en Ventas
    despachos.value = response.data;
  } catch (error) {
    console.error('Error al conectar:', error);
    errorConexion.value = true;
    despachos.value = []; 
  } finally {
    cargando.value = false;
  }
};

// FUNCIÓN PARA ACTUALIZAR ESTADO
const cambiarEstado = async (despacho: Despacho, nuevoEstado: string) => {
  try {
    // Si tu backend tiene esta ruta en despachos, déjala así. Si no, tendrás que crear un PATCH en el controller.
    await api.patch(`/despachos/${despacho.id}/estado`, { estado: nuevoEstado });

    alert(`El despacho ha sido marcado como: ${nuevoEstado} ✅`);
    cargarDespachos();
  } catch (error) {
    console.error("Error al actualizar estado:", error);
    alert("Hubo un problema al actualizar el estado.");
  }
};

// ========================================================
// CONFIRMACIÓN POR ESCANEO DE QR
// Escanea el código de la guía y avanza el despacho al siguiente
// estado (Listo → En Tránsito → Entregado), sin buscar la tarjeta.
// ========================================================
const codigoEscaneado = ref('');
const escaneando = ref(false);

const siguienteEstado = (estado: string): string | null => {
  if (estado === 'Listo para Empaque') return 'En Tránsito';
  if (estado === 'En Tránsito') return 'Entregado';
  return null; // ya entregado
};

const confirmarPorEscaneo = async () => {
  const codigo = codigoEscaneado.value.trim();
  if (!codigo) return;

  // El QR codifica el codigoGuia; lo buscamos en la lista cargada
  const despacho = despachos.value.find(
    (d) => String(d.codigoGuia).toUpperCase() === codigo.toUpperCase()
  );

  if (!despacho) {
    alert(`❌ No se encontró un despacho pendiente con la guía "${codigo}".`);
    codigoEscaneado.value = '';
    return;
  }

  const nuevo = siguienteEstado(despacho.estado);
  if (!nuevo) {
    alert(`ℹ️ El despacho "${codigo}" ya fue entregado.`);
    codigoEscaneado.value = '';
    return;
  }

  escaneando.value = true;
  try {
    await api.patch(`/despachos/${despacho.id}/estado`, { estado: nuevo });
    alert(`✅ Guía ${codigo} (${despacho.cliente}) → ${nuevo}`);
    codigoEscaneado.value = '';
    cargarDespachos();
  } catch (error) {
    console.error('Error al confirmar por escaneo:', error);
    alert('Hubo un problema al actualizar el estado.');
  } finally {
    escaneando.value = false;
  }
};

// 🔥 2. GENERADOR DE PDF DINÁMICO MEJORADO
const generarGuia = async (despacho: Despacho) => {
  try {
    const doc = new jsPDF();
    const qrDataUrl = await QRCode.toDataURL(despacho.codigoGuia || `GR-REF-${despacho.id}`);

    // Diseño de Cabecera
    doc.setFillColor(31, 41, 55); 
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("GUÍA DE REMISIÓN", 15, 25);
    
    // 🔥 Corrección de Branding
    doc.setFontSize(10);
    doc.text("MODITEX S.A.C.", 140, 20); 
    doc.text("RUC: 20000000000", 140, 25); // Pon tu RUC real
    doc.text("Juliaca, Puno - Perú", 140, 30);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("INFORMACIÓN DEL ENVÍO", 15, 55);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`N° Guía: ${despacho.codigoGuia || despacho.id}`, 15, 65);
    doc.text(`Fecha: ${new Date(despacho.fecha).toLocaleDateString()}`, 15, 72);
    doc.text(`Cliente: ${despacho.cliente}`, 15, 79);
    doc.text(`Destino: ${despacho.destino}`, 15, 86);
    doc.text(`Total Prendas: ${despacho.prendas} und`, 15, 93);

    doc.addImage(qrDataUrl, 'PNG', 150, 50, 40, 40);
    doc.setFontSize(8);
    doc.text("Escanear para entrega", 153, 94);

    // 🔥 CREACIÓN DE TABLA DINÁMICA DE PRENDAS
    let tableBody = [];
    if (despacho.venta && despacho.venta.detalles && despacho.venta.detalles.length > 0) {
      tableBody = despacho.venta.detalles.map(item => [
        `${item.nombre} (Color: ${item.color} | Talla: ${item.talla})`,
        `${item.cantidad} und`,
        despacho.estado
      ]);
    } else {
      // Fallback por si hay un despacho antiguo sin detalles
      tableBody = [
        ['Mercadería Textil (Lote Consolidado)', `${despacho.prendas} und`, despacho.estado]
      ];
    }

    autoTable(doc, {
      startY: 110,
      head: [['Descripción del Artículo', 'Cantidad', 'Estado']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [31, 41, 55] }
    });

    // Pie de página
    const finalY = (doc as any).lastAutoTable.finalY + 30; // Posicionamos firmas según el tamaño de la tabla
    doc.setFontSize(9);
    doc.text("Firma de Despachador: ______________________", 15, finalY);
    doc.text("Firma de Cliente (Recepción): ______________________", 105, finalY);
    
    doc.save(`Guia_Remision_${despacho.codigoGuia || despacho.id}.pdf`);
  } catch (error) {
    console.error("Error al generar el PDF:", error);
    alert("Hubo un error al generar la guía. Revisa la consola.");
  }
};

const imprimirSKUs = async (despacho: Despacho) => {
  despachoAImprimir.value = despacho;
  
  await nextTick();
  
  const codigo = despacho.codigoGuia || `REF-${despacho.id}`;
  JsBarcode("#barcode-despacho", codigo, {
    format: "CODE128",
    lineColor: "#000",
    width: 3,
    height: 80,
    displayValue: true,
    fontSize: 20,
    margin: 10
  });
  
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      despachoAImprimir.value = null; 
    }, 500);
  }, 500);
};

onMounted(() => {
  cargarDespachos();
});
</script>

<template>
  <div>
    
    <div class="space-y-8 animate-fade-in relative print:hidden p-4 md:p-8 max-w-[1600px] mx-auto min-h-screen bg-gray-50/50">
      
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 class="text-3xl font-extrabold text-gray-900 tracking-tight">Despachos y Logística 🚚</h2>
          <p class="text-gray-500 mt-2 font-medium">Gestión de Guías de Remisión, Listas de Empaque y Despacho.</p>
        </div>
        <button @click="cargarDespachos" class="mt-4 md:mt-0 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Actualizar
        </button>
      </div>

      <!-- CONFIRMACIÓN RÁPIDA POR ESCANEO DE QR -->
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-3">
        <div class="flex items-center gap-2 text-gray-700 font-bold shrink-0">
          <span class="text-2xl">📷</span>
          <span>Confirmar por escaneo</span>
        </div>
        <input
          v-model="codigoEscaneado"
          @keyup.enter="confirmarPorEscaneo"
          type="text"
          placeholder="Escanea el QR de la guía o escribe el código y presiona Enter..."
          class="flex-1 w-full border-2 border-gray-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all font-mono uppercase"
        >
        <button
          @click="confirmarPorEscaneo"
          :disabled="escaneando"
          class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all shrink-0 disabled:opacity-50"
        >
          {{ escaneando ? 'Procesando...' : 'Avanzar estado' }}
        </button>
      </div>

      <div v-if="cargando" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div v-for="i in 2" :key="i" class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div class="h-6 bg-gray-200 rounded w-2/3 mb-2"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
          <div class="flex gap-3"><div class="h-10 bg-gray-200 rounded w-full"></div><div class="h-10 bg-gray-200 rounded w-full"></div></div>
        </div>
      </div>

      <div v-else-if="errorConexion" class="bg-red-50 border border-red-200 rounded-2xl p-8 text-center shadow-sm">
        <div class="text-red-500 mb-3 text-4xl">⚠️</div>
        <h3 class="text-lg font-bold text-red-800">Error de Conexión</h3>
        <p class="text-red-600 mt-1">No se pudo conectar con el backend.</p>
      </div>

      <div v-else-if="despachos.length === 0" class="bg-white border border-gray-200 rounded-2xl p-12 text-center flex flex-col items-center shadow-sm">
        <span class="text-5xl mb-4 opacity-50">📦</span>
        <h3 class="text-xl font-bold text-gray-700">No hay despachos pendientes</h3>
        <p class="text-gray-500 mt-2 max-w-md">El almacén está al día con las entregas.</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div 
          v-for="envio in despachos" 
          :key="envio.id" 
          class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col justify-between group"
        >
          <div class="flex justify-between items-start mb-4">
            <div>
              <span class="text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider"
                    :class="envio.estado === 'Listo para Empaque' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 'bg-blue-100 text-blue-800 border border-blue-200'">
                {{ envio.estado }}
              </span>
              <h3 class="text-xl font-black text-gray-900 mt-4 leading-tight">{{ envio.cliente }}</h3>
              <p class="text-gray-500 text-sm mt-2 flex items-start gap-1 font-medium"><span>📍</span> {{ envio.destino }}</p>
            </div>
            <div class="text-right bg-gray-50 p-2.5 rounded-xl border border-gray-100 shadow-inner">
              <p class="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">Guía Ref.</p>
              <p class="font-mono font-bold text-gray-800 text-sm">{{ envio.codigoGuia || envio.id }}</p>
            </div>
          </div>

          <div class="bg-gray-50 rounded-xl p-4 mt-2 mb-3 flex justify-between items-center border border-gray-100">
            <div>
              <p class="text-[10px] text-gray-400 font-black uppercase tracking-widest">Volumen Total</p>
              <p class="text-2xl font-black text-indigo-600 leading-none mt-1">{{ envio.prendas }} <span class="text-xs font-bold text-gray-400">UND</span></p>
            </div>
            <div class="text-right">
              <p class="text-[10px] text-gray-400 font-black uppercase tracking-widest">Generado</p>
              <p class="text-sm font-bold text-gray-700 mt-1">{{ new Date(envio.fecha).toLocaleDateString() }}</p>
            </div>
          </div>

          <div v-if="envio.venta?.detalles && envio.venta.detalles.length > 0" class="bg-indigo-50/50 rounded-xl p-4 my-2 text-sm max-h-40 overflow-y-auto border border-indigo-100 shadow-inner">
            <p class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-1"><span>📋</span> Artículos a Empacar</p>
            <div class="space-y-2">
              <div v-for="(item, index) in envio.venta.detalles" :key="index" class="flex justify-between items-center bg-white p-2 rounded-lg border border-indigo-50 shadow-sm">
                <div class="flex-1 min-w-0 pr-2">
                  <p class="font-bold text-gray-800 text-xs truncate">{{ item.nombre }}</p>
                  <p class="text-[9px] font-bold text-gray-500 mt-0.5 uppercase tracking-wider">C: {{ item.color }} | T: {{ item.talla }}</p>
                </div>
                <div class="bg-indigo-100 px-2 py-1 rounded text-indigo-700 font-black text-sm">
                  x{{ item.cantidad }}
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-3 mt-auto pt-4 border-t border-gray-100">
            <button @click="generarGuia(envio)" class="flex-1 bg-gray-900 hover:bg-black text-white py-3 rounded-xl text-xs font-bold transition-all shadow-sm flex justify-center items-center gap-1.5">
              <span>📄</span> Imprimir Guía
            </button>
            <button @click="imprimirSKUs(envio)" class="flex-1 bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 py-3 rounded-xl text-xs font-bold transition-all flex justify-center items-center gap-1.5">
              <span>🏷️</span> Imprimir Etiqueta
            </button>
            
            <button 
              v-if="envio.estado === 'Listo para Empaque'"
              @click="cambiarEstado(envio, 'En Tránsito')" 
              class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-black transition-all shadow-md mt-2 flex justify-center items-center gap-2 active:scale-[0.98]">
              🚛 CONFIRMAR DESPACHO
            </button>

            <button 
              v-if="envio.estado === 'En Tránsito'"
              @click="cambiarEstado(envio, 'Entregado')" 
              class="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl text-sm font-black transition-all shadow-md mt-2 flex justify-center items-center gap-2 active:scale-[0.98]">
              ✅ MARCAR COMO ENTREGADO
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="hidden print-area" v-if="despachoAImprimir">
      <div class="border-4 border-black p-10 text-center w-full max-w-4xl font-sans bg-white">
        <h1 class="text-4xl font-black mb-4 uppercase tracking-tight">DESTINO: {{ despachoAImprimir.cliente }}</h1>
        <p class="text-2xl mb-8 font-medium">📍 {{ despachoAImprimir.destino }}</p>
        
        <div class="flex justify-around items-center border-y-4 border-black py-6 mb-10 text-2xl">
          <p><strong class="mr-2">GUÍA:</strong> {{ despachoAImprimir.codigoGuia || despachoAImprimir.id }}</p>
          <div class="w-1 h-12 bg-black"></div>
          <p><strong class="mr-2">CANTIDAD:</strong> {{ despachoAImprimir.prendas }} Prendas</p>
        </div>

        <div class="flex justify-center mb-8">
          <svg id="barcode-despacho"></svg>
        </div>

        <p class="mt-10 text-lg font-bold text-gray-600">
          Fecha de Despacho: {{ new Date().toLocaleDateString() }} - MODITEX Logística
        </p>
      </div>
    </div>

  </div>
</template>

<style>
@media print {
  body * { visibility: hidden !important; }
  .print-area, .print-area * { visibility: visible !important; }
  .print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100vw !important;
    min-height: 100vh !important;
    background: white !important;
    z-index: 999999 !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    justify-content: center !important;
    align-items: flex-start !important;
  }
  @page { margin: 0; size: auto; }
}
</style>

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.overflow-y-auto::-webkit-scrollbar { width: 6px; }
.overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
.overflow-y-auto::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
</style>