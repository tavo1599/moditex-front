<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../api/axios';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const bodegas = ref<any[]>([]);
const inventarioTotal = ref<any[]>([]);
const cargando = ref(true);
const procesando = ref(false);

const form = ref({
  origenId: '',
  destinoId: '',
  inventarioIdSeleccionado: '',
  cantidad: 0
});

const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resBodegas, resInv] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario')
    ]);
    bodegas.value = resBodegas.data.filter((b: any) => b.estado); 
    inventarioTotal.value = resInv.data;
  } catch (error) {
    console.error("Error al cargar datos:", error);
  } finally {
    cargando.value = false;
  }
};

// Filtro de inventario disponible en el origen
const inventarioDisponibleEnOrigen = computed(() => {
  if (!form.value.origenId) return [];
  return inventarioTotal.value.filter(inv => inv.bodegaId === Number(form.value.origenId) && inv.stock > 0);
});

// Máximo permitido para trasladar
const stockMaximoPermitido = computed(() => {
  if (!form.value.inventarioIdSeleccionado) return 0;
  const item = inventarioTotal.value.find(i => i.id === Number(form.value.inventarioIdSeleccionado));
  return item ? item.stock : 0;
});

// GENERACIÓN DE GUÍA DE TRASLADO EN PDF
const generarGuiaTraslado = async (origen: any, destino: any, item: any, cantidad: number, correlativo: string) => {
  const doc = new jsPDF();
  const qrDataUrl = await QRCode.toDataURL(correlativo);

  // Encabezado
  doc.setFillColor(15, 23, 42); // Gris muy oscuro / Azul noche
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("GUÍA DE TRASLADO INTERNO", 15, 25);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("USO EXCLUSIVO DE LA EMPRESA", 140, 20);
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 140, 25);
  doc.text(`Hora: ${new Date().toLocaleTimeString()}`, 140, 30);

  // Datos del Traslado
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  
  // Bloque Origen
  doc.setFont("helvetica", "bold");
  doc.text("PUNTO DE PARTIDA (ORIGEN):", 15, 55);
  doc.setFont("helvetica", "normal");
  doc.text(`Bodega: ${origen.nombre}`, 15, 62);
  
  // Bloque Destino
  doc.setFont("helvetica", "bold");
  doc.text("PUNTO DE LLEGADA (DESTINO):", 110, 55);
  doc.setFont("helvetica", "normal");
  doc.text(`Bodega: ${destino.nombre}`, 110, 62);

  // Referencia y QR
  doc.setFont("helvetica", "bold");
  doc.text(`Correlativo: ${correlativo}`, 15, 75);
  doc.addImage(qrDataUrl, 'PNG', 160, 45, 35, 35);

  // Tabla de Mercadería
  autoTable(doc, {
    startY: 85,
    head: [['Código/SKU', 'Producto', 'Color', 'Talla', 'Cantidad']],
    body: [
      [
        item.producto.skuBase || 'N/A', 
        item.producto.nombre, 
        item.color, 
        item.talla, 
        `${cantidad} und`
      ]
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42] }
  });

  // Firmas
  doc.setFontSize(9);
  doc.text("___________________________", 30, 240);
  doc.text("Autorizado por (Origen)", 35, 245);
  
  doc.text("___________________________", 130, 240);
  doc.text("Recibido por (Destino)", 135, 245);

  doc.save(`Traslado_${correlativo}.pdf`);
};

const procesarTraslado = async () => {
  if (!form.value.origenId || !form.value.destinoId || !form.value.inventarioIdSeleccionado || form.value.cantidad <= 0) {
    return alert('⚠️ Por favor, completa todos los campos correctamente.');
  }
  if (form.value.origenId === form.value.destinoId) {
    return alert('⚠️ El origen y el destino no pueden ser la misma bodega.');
  }
  if (form.value.cantidad > stockMaximoPermitido.value) {
    return alert(`⚠️ Solo tienes ${stockMaximoPermitido.value} unidades disponibles para mover.`);
  }

  const itemSeleccionado = inventarioTotal.value.find(i => i.id === Number(form.value.inventarioIdSeleccionado));
  const bodegaOrigen = bodegas.value.find(b => b.id === Number(form.value.origenId));
  const bodegaDestino = bodegas.value.find(b => b.id === Number(form.value.destinoId));

  procesando.value = true;
  try {
    // 1. Enviamos la petición al backend para actualizar la BD
    await api.post('/almacen-terminados/traslado', {
      origenId: Number(form.value.origenId),
      destinoId: Number(form.value.destinoId),
      productoId: itemSeleccionado.productoId,
      color: itemSeleccionado.color,
      talla: itemSeleccionado.talla,
      cantidad: form.value.cantidad
    });
    
    // 2. Generamos un código correlativo para el documento
    const codigoTraslado = `TI-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // 3. Generamos el PDF automáticamente
    await generarGuiaTraslado(bodegaOrigen, bodegaDestino, itemSeleccionado, form.value.cantidad, codigoTraslado);
    
    // 4. Limpieza y Notificación
    alert('✅ Traslado realizado con éxito. El documento se está descargando.');
    form.value.inventarioIdSeleccionado = '';
    form.value.cantidad = 0;
    cargarDatos();
  } catch (error: any) {
    alert('❌ Error: ' + (error.response?.data?.message || 'Error al conectar con el servidor'));
  } finally {
    procesando.value = false;
  }
};

onMounted(cargarDatos);
</script>

<template>
  <div class="space-y-8 animate-fade-in">
    
    <!-- HEADER -->
    <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center">
      <div>
        <h2 class="text-3xl font-black text-gray-900 tracking-tight">Traslado Interno 🔄</h2>
        <p class="text-gray-500 mt-2 font-medium">Gestiona el movimiento de mercadería entre tus locales y almacenes.</p>
      </div>
      <div class="mt-4 md:mt-0 text-sm font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
        Módulo Logístico Activo
      </div>
    </div>

    <!-- ESTADO DE CARGA -->
    <div v-if="cargando" class="flex flex-col items-center justify-center py-20">
      <div class="animate-spin w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mb-4"></div>
      <p class="text-gray-500 font-bold tracking-widest uppercase">Sincronizando Inventario...</p>
    </div>

    <!-- FORMULARIO PRINCIPAL -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      <!-- COLUMNA IZQUIERDA: FLUJO DE BODEGAS (7 columnas) -->
      <div class="lg:col-span-7 space-y-6">
        
        <!-- Tarjeta Origen -->
        <div class="bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-red-200 transition-colors relative overflow-hidden group">
          <div class="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
          <h3 class="text-lg font-black text-red-600 mb-4 flex items-center gap-2 uppercase tracking-wide">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
            1. ¿De dónde sale? (Origen)
          </h3>
          <select v-model="form.origenId" @change="form.inventarioIdSeleccionado = ''; form.cantidad = 0" 
            class="w-full bg-gray-50 border border-gray-200 p-4 rounded-xl font-bold text-gray-800 outline-none focus:ring-4 focus:ring-red-500/20 focus:border-red-500 transition-all cursor-pointer">
            <option value="" disabled>Selecciona la bodega de origen...</option>
            <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
          </select>
        </div>

        <!-- Conector Visual -->
        <div class="flex justify-center -my-2 relative z-10 hidden lg:flex">
          <div class="bg-white p-2 rounded-full shadow-sm border border-gray-100 text-gray-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
          </div>
        </div>

        <!-- Tarjeta Destino -->
        <div class="bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-green-200 transition-colors relative overflow-hidden group">
          <div class="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
          <h3 class="text-lg font-black text-green-600 mb-4 flex items-center gap-2 uppercase tracking-wide">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
            2. ¿A dónde llega? (Destino)
          </h3>
          <select v-model="form.destinoId" 
            class="w-full bg-gray-50 border border-gray-200 p-4 rounded-xl font-bold text-gray-800 outline-none focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all cursor-pointer">
            <option value="" disabled>Selecciona la bodega de destino...</option>
            <option v-for="b in bodegas" :key="b.id" :value="b.id" :disabled="b.id === form.origenId">
              {{ b.nombre }} {{ b.id === form.origenId ? '(Origen actual)' : '' }}
            </option>
          </select>
        </div>
      </div>

      <!-- COLUMNA DERECHA: SELECCIÓN DE MERCADERÍA (5 columnas) -->
      <div class="lg:col-span-5 bg-gray-900 rounded-3xl shadow-xl border border-gray-800 flex flex-col relative overflow-hidden">
        <!-- Decoración de fondo -->
        <div class="absolute top-0 right-0 -mr-8 -mt-8 w-40 h-40 bg-blue-600 rounded-full blur-3xl opacity-20 pointer-events-none"></div>
        
        <div class="p-8 flex-1 flex flex-col">
          <h3 class="text-xl font-black text-white mb-6 flex items-center gap-2">
            <span class="text-blue-400">3.</span> Detalle de Mercadería
          </h3>
          
          <div v-if="!form.origenId" class="flex-1 flex flex-col items-center justify-center text-center text-gray-500 border-2 border-dashed border-gray-700 rounded-2xl p-6">
            <span class="text-4xl mb-3">🏢</span>
            <p class="font-medium">Selecciona un Almacén de Origen para ver el stock disponible.</p>
          </div>
          
          <div v-else class="space-y-6 flex-1 flex flex-col">
            <!-- Selector de Prenda -->
            <div>
              <label class="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Producto a Mover</label>
              <select v-model="form.inventarioIdSeleccionado" @change="form.cantidad = 0" 
                class="w-full bg-gray-800 border border-gray-700 p-4 rounded-xl font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer">
                <option value="" disabled>Selecciona una prenda en stock...</option>
                <option v-for="item in inventarioDisponibleEnOrigen" :key="item.id" :value="item.id">
                  {{ item.producto.nombre }} - {{ item.color }} (Talla {{ item.talla }})
                </option>
              </select>
            </div>

            <!-- Input de Cantidad -->
            <div v-if="form.inventarioIdSeleccionado" class="animate-fade-in bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
              <div class="flex justify-between items-end mb-4">
                <label class="block text-[11px] font-bold text-gray-400 uppercase tracking-widest">Cantidad Unidades</label>
                <span class="text-xs font-black px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full">
                  Stock: {{ stockMaximoPermitido }}
                </span>
              </div>
              <div class="flex items-center gap-4">
                <button @click="form.cantidad > 0 && form.cantidad--" class="w-14 h-14 bg-gray-700 hover:bg-gray-600 rounded-xl flex items-center justify-center text-2xl font-bold text-white transition-colors">-</button>
                <input type="number" v-model.number="form.cantidad" min="1" :max="stockMaximoPermitido" 
                  class="flex-1 bg-black border-2 border-gray-600 p-4 rounded-xl text-3xl text-center font-black text-white outline-none focus:border-blue-500 transition-all hide-arrows">
                <button @click="form.cantidad < stockMaximoPermitido && form.cantidad++" class="w-14 h-14 bg-gray-700 hover:bg-gray-600 rounded-xl flex items-center justify-center text-2xl font-bold text-white transition-colors">+</button>
              </div>
            </div>

            <!-- Botón de Ejecución -->
            <div class="mt-auto pt-6">
              <button 
                @click="procesarTraslado" 
                :disabled="procesando"
                class="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-4 rounded-xl font-black text-lg shadow-xl shadow-blue-500/20 transition-all flex justify-center items-center gap-3 uppercase tracking-wider">
                <span v-if="procesando" class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
                <span v-else>📄 Generar Traslado</span>
              </button>
              <p class="text-center text-gray-500 text-xs mt-3">Se generará automáticamente la Guía de Remisión.</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Ocultar flechas de incremento/decremento nativas en inputs numéricos */
.hide-arrows::-webkit-outer-spin-button,
.hide-arrows::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.hide-arrows[type=number] {
  -moz-appearance: textfield;
}
</style>