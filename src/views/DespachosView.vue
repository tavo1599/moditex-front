<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import api from '../api/axios'; 
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

interface Despacho {
  id: number;
  codigoGuia: string; 
  cliente: string;
  destino: string;
  prendas: number;
  estado: string;
  fecha: string;
}

const cargando = ref(true);
const despachos = ref<Despacho[]>([]);
const errorConexion = ref(false);
const despachoAImprimir = ref<Despacho | null>(null);

const cargarDespachos = async () => {
  try {
    cargando.value = true;
    errorConexion.value = false;
    const response = await api.get('/despachos/pendientes'); 
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
    // Llamamos al backend para actualizar
    await api.patch(`/despachos/${despacho.id}/estado`, { estado: nuevoEstado });
    
    // Mostramos un mensajito de éxito
    alert(`El despacho ha sido marcado como: ${nuevoEstado} ✅`);
    
    // Recargamos la lista para que desaparezca o se actualice visualmente
    cargarDespachos();
  } catch (error) {
    console.error("Error al actualizar estado:", error);
    alert("Hubo un problema al actualizar el estado.");
  }
};

const generarGuia = async (despacho: Despacho) => {
  try {
    const doc = new jsPDF();
    const qrDataUrl = await QRCode.toDataURL(despacho.codigoGuia || `GR-REF-${despacho.id}`);

    doc.setFillColor(31, 41, 55); 
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("GUÍA DE REMISIÓN", 15, 25);
    
    doc.setFontSize(10);
    doc.text("PITUCORP TECHNOLOGIES S.A.C.", 140, 20); 
    doc.text("RUC: 20600000000", 140, 25);
    doc.text("Lima, Perú", 140, 30);

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

    autoTable(doc, {
      startY: 110,
      head: [['Descripción', 'Cantidad', 'Estado']],
      body: [
        ['Mercadería Textil (Lote Consolidado)', `${despacho.prendas} und`, despacho.estado]
      ],
      theme: 'striped',
      headStyles: { fillColor: [31, 41, 55] }
    });

    doc.setFontSize(9);
    doc.text("Firma de Despachador: ______________________", 15, 240);
    doc.text("Firma de Cliente (Recepción): ______________________", 105, 240);
    
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
    // Limpiamos la variable para ocultar la etiqueta al volver
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
    
    <!-- ======================================================== -->
    <!-- ZONA 1: SISTEMA NORMAL (Se oculta al imprimir con print:hidden) -->
    <!-- ======================================================== -->
    <div class="space-y-8 animate-fade-in relative print:hidden">
      
      <!-- HEADER -->
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 class="text-3xl font-extrabold text-gray-900 tracking-tight">Despachos y Logística 🚚</h2>
          <p class="text-gray-500 mt-2 font-medium">Gestión de Guías de Remisión, códigos QR y etiquetado SKU.</p>
        </div>
        <button @click="cargarDespachos" class="mt-4 md:mt-0 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Actualizar
        </button>
      </div>

      <!-- ESTADO 1: CARGANDO -->
      <div v-if="cargando" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div v-for="i in 2" :key="i" class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div class="h-6 bg-gray-200 rounded w-2/3 mb-2"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
          <div class="flex gap-3"><div class="h-10 bg-gray-200 rounded w-full"></div><div class="h-10 bg-gray-200 rounded w-full"></div></div>
        </div>
      </div>

      <!-- ESTADO 2: ERROR -->
      <div v-else-if="errorConexion" class="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <div class="text-red-500 mb-3 text-4xl">⚠️</div>
        <h3 class="text-lg font-bold text-red-800">Error de Conexión</h3>
        <p class="text-red-600 mt-1">No se pudo conectar con el backend.</p>
      </div>

      <!-- ESTADO 3: VACÍO -->
      <div v-else-if="despachos.length === 0" class="bg-gray-50 border border-gray-200 rounded-2xl p-12 text-center flex flex-col items-center">
        <span class="text-5xl mb-4">📦</span>
        <h3 class="text-xl font-bold text-gray-700">No hay despachos pendientes</h3>
        <p class="text-gray-500 mt-2 max-w-md">Tu bandeja está limpia.</p>
      </div>

      <!-- ESTADO 4: DATOS REALES -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <div 
          v-for="envio in despachos" 
          :key="envio.id" 
          class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col justify-between group"
        >
          <div class="flex justify-between items-start mb-4">
            <div>
              <span class="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-yellow-100 text-yellow-800">
                {{ envio.estado }}
              </span>
              <h3 class="text-xl font-bold text-gray-900 mt-4">{{ envio.cliente }}</h3>
              <p class="text-gray-500 text-sm mt-1 flex items-center gap-1">📍 {{ envio.destino }}</p>
            </div>
            <div class="text-right bg-gray-50 p-2 rounded-lg border border-gray-100">
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Guía Ref.</p>
              <p class="font-mono font-bold text-gray-800">{{ envio.codigoGuia || envio.id }}</p>
            </div>
          </div>

          <div class="bg-gray-50 rounded-xl p-4 my-4 flex justify-between items-center border border-gray-100">
            <div>
              <p class="text-xs text-gray-500 font-medium">Volumen Total</p>
              <p class="text-lg font-black text-indigo-600">{{ envio.prendas }} <span class="text-sm font-medium text-gray-500">prendas</span></p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-500 font-medium">Fecha</p>
              <p class="text-sm font-bold text-gray-800">{{ new Date(envio.fecha).toLocaleDateString() }}</p>
            </div>
          </div>

         <div class="flex flex-wrap gap-3 mt-auto pt-4 border-t border-gray-100">
            <!-- Botones de Impresión (Siempre visibles) -->
            <button @click="generarGuia(envio)" class="flex-1 bg-gray-900 hover:bg-black text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm">
              📄 Guía y QR
            </button>
            <button @click="imprimirSKUs(envio)" class="flex-1 bg-white border-2 border-indigo-100 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-200 py-2.5 rounded-xl text-sm font-semibold transition-all">
              🏷️ Etiqueta
            </button>
            
            <!-- FLUJO 1: De "Listo para Empaque" a "En Tránsito" -->
            <button 
              v-if="envio.estado === 'Listo para Empaque'"
              @click="cambiarEstado(envio, 'En Tránsito')" 
              class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-bold transition-all shadow-md mt-2 flex justify-center items-center gap-2">
              🚛 Confirmar Salida (Despachar)
            </button>

            <!-- FLUJO 2: De "En Tránsito" a "Entregado" -->
            <button 
              v-if="envio.estado === 'En Tránsito'"
              @click="cambiarEstado(envio, 'Entregado')" 
              class="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-bold transition-all shadow-md mt-2 flex justify-center items-center gap-2">
              ✅ Marcar como Entregado
            </button>
          </div>
        </div>
      </div>
    </div>


    <!-- ======================================================== -->
    <!-- ZONA 2: IMPRESIÓN (Solo visible en el papel por la clase print-area) -->
    <!-- ======================================================== -->
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
          Fecha de Despacho: {{ new Date().toLocaleDateString() }} - Impreso por Sistema
        </p>
      </div>
    </div>

  </div>
</template>

<!-- ======================================================== -->
<!-- ESTILOS GLOBALES DE IMPRESIÓN (SIN "scoped") -->
<!-- ======================================================== -->
<style>
@media print {
  /* 1. Ocultamos absolutamente TODO el sistema (Sidebar incluido) */
  body * {
    visibility: hidden !important;
  }
  
  /* 2. Hacemos visible SOLO nuestra etiqueta y sus elementos hijos */
  .print-area, .print-area * {
    visibility: visible !important;
  }
  
  /* 3. Forzamos a que la etiqueta se clave arriba a la izquierda como dueña de la hoja */
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
  
  /* 4. Quitamos márgenes automáticos de la impresora para que no salga descuadrado */
  @page {
    margin: 0;
    size: auto;
  }
}
</style>

<!-- ======================================================== -->
<!-- ESTILOS LOCALES PARA ANIMACIONES (CON "scoped") -->
<!-- ======================================================== -->
<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>