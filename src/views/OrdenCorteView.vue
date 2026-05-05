<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// import api from '../api/axios'; // Descomenta esto cuando conectemos el backend

// Simulación de productos que vienen de tu BD
const productos = ref([
  { id: 1, skuBase: 'JEAN-SLIM-001', nombre: 'Pantalón Jean Slim Fit' },
  { id: 2, skuBase: 'POL-BAS-002', nombre: 'Polera Básica Algodón' },
]);

const form = ref({
  productoId: '',
  fechaInicio: new Date().toISOString().split('T')[0],
});

// La Matriz de Corte (Lo que se va a cortar)
const detallesMatriz = ref([
  { color: '', talla: '', cantidad: 10 }
]);

const tallasBasicas = ['S', 'M', 'L', 'XL', '28', '30', '32', '34'];

const agregarFila = () => {
  detallesMatriz.value.push({ color: '', talla: '', cantidad: 10 });
};

const eliminarFila = (index: number) => {
  detallesMatriz.value.splice(index, 1);
};

const totalPrendas = computed(() => {
  return detallesMatriz.value.reduce((acc, item) => acc + (item.cantidad || 0), 0);
});

// GENERADOR DEL DOCUMENTO DE CORTE (PDF)
const generarOrdenCortePDF = () => {
  if (!form.value.productoId || detallesMatriz.value.length === 0) {
    return alert('Faltan datos para generar la Orden de Corte.');
  }

  const productoSelect = productos.value.find(p => p.id === Number(form.value.productoId));
  const codigoOP = `OP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const doc = new jsPDF();

  // Encabezado Industrial
  doc.setFillColor(220, 38, 38); // Rojo oscuro (Alerta de Producción)
  doc.rect(0, 0, 210, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("ORDEN DE TIZADO Y CORTE", 15, 22);
  
  // Datos Generales
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text("INFORMACIÓN DE LA ORDEN", 15, 50);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`CÓDIGO OP: ${codigoOP}`, 15, 60);
  doc.text(`Fecha Programada: ${form.value.fechaInicio}`, 15, 67);
  doc.text(`Producto: ${productoSelect?.skuBase} - ${productoSelect?.nombre}`, 15, 74);
  doc.text(`Total a Cortar: ${totalPrendas.value} prendas`, 15, 81);

  // Tabla Matriz de Corte
  const bodyTabla = detallesMatriz.value.map(d => [
    d.color.toUpperCase(), 
    d.talla.toUpperCase(), 
    `${d.cantidad} und`,
    '' // Espacio en blanco para que el cortador anote lo real
  ]);

  autoTable(doc, {
    startY: 95,
    head: [['Color', 'Talla', 'Cant. Programada', 'Cant. Real Cortada (Llenar)']],
    body: bodyTabla,
    theme: 'grid',
    headStyles: { fillColor: [31, 41, 55] },
    columnStyles: {
      3: { cellWidth: 50 } // Columna ancha para escribir a mano
    }
  });

  // Instrucciones y Firmas
  const finalY = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("INSTRUCCIONES: Entregar los paquetes amarrados y etiquetados por talla y color.", 15, finalY);
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text("___________________________", 30, finalY + 40);
  doc.text("Jefe de Producción", 40, finalY + 45);
  
  doc.text("___________________________", 130, finalY + 40);
  doc.text("Jefe de Mesa de Corte", 135, finalY + 45);

  doc.save(`OrdenCorte_${codigoOP}.pdf`);
  alert('✅ Orden de Corte generada. Lista para imprimir.');
};

// Simular carga inicial
onMounted(() => {
  // Aquí luego llamaremos a api.get('/productos')
});
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- HEADER -->
    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-black text-gray-900 tracking-tight">1. Generación de Orden de Producción ✂️</h2>
      <p class="text-gray-500 mt-2 font-medium">Define la matriz de corte (tallas, colores y cantidades) antes de confeccionar.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      <!-- COLUMNA IZQUIERDA: DATOS GENERALES -->
      <div class="lg:col-span-4 space-y-6">
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 class="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Datos de la OP</h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Producto a Fabricar</label>
              <select v-model="form.productoId" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-red-500">
                <option value="" disabled>Seleccione...</option>
                <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }}</option>
              </select>
            </div>
            
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Fecha de Inicio</label>
              <input type="date" v-model="form.fechaInicio" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-red-500">
            </div>
            
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-200 text-center mt-6">
              <p class="text-xs text-gray-500 uppercase font-bold tracking-widest">Total Programado</p>
              <p class="text-4xl font-black text-red-600">{{ totalPrendas }} <span class="text-sm text-gray-500 font-normal">und</span></p>
            </div>
          </div>
        </div>
      </div>

      <!-- COLUMNA DERECHA: MATRIZ DE CORTE -->
      <div class="lg:col-span-8">
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div class="flex justify-between items-center mb-4 border-b pb-2">
            <h3 class="text-lg font-bold text-gray-800">Matriz de Corte (Curva)</h3>
            <button @click="agregarFila" class="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg text-sm transition-colors">
              + Añadir Fila
            </button>
          </div>

          <!-- LA TABLA DE CAPTURA -->
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th class="p-3 rounded-tl-lg">Color (Ej: Rojo)</th>
                  <th class="p-3">Talla</th>
                  <th class="p-3">Cantidad</th>
                  <th class="p-3 rounded-tr-lg w-10 text-center">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="(fila, index) in detallesMatriz" :key="index" class="hover:bg-gray-50 transition-colors">
                  <td class="p-2">
                    <input type="text" v-model="fila.color" placeholder="Color de tela" class="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-red-500">
                  </td>
                  <td class="p-2">
                    <select v-model="fila.talla" class="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-red-500">
                      <option value="" disabled>Talla...</option>
                      <option v-for="t in tallasBasicas" :key="t" :value="t">{{ t }}</option>
                    </select>
                  </td>
                  <td class="p-2">
                    <input type="number" v-model.number="fila.cantidad" min="1" class="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-red-500 font-bold text-center">
                  </td>
                  <td class="p-2 text-center">
                    <button @click="eliminarFila(index)" v-if="detallesMatriz.length > 1" class="text-red-400 hover:text-red-600 bg-red-50 p-2 rounded-lg transition-colors">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- BOTÓN GENERAR -->
          <div class="mt-8 flex justify-end">
            <button @click="generarOrdenCortePDF" class="bg-red-600 hover:bg-red-700 text-white py-3 px-8 rounded-xl font-black text-lg shadow-lg shadow-red-500/30 transition-all flex items-center gap-2">
              📄 Generar Orden de Corte (PDF)
            </button>
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
</style>