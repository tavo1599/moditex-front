<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router'; // 🔥 Para redireccionar al tablero después de guardar
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios'; // 🔥 Descomentado para conexión real

const router = useRouter();

// 🔥 AHORA SON ARREGLOS VACÍOS QUE SE LLENARÁN DESDE LA BASE DE DATOS
const productos = ref<any[]>([]);
const colores = ref<any[]>([]); 
const guardando = ref(false);

const form = ref({
  productoId: '',
  fechaInicio: new Date().toISOString().split('T')[0],
});

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

// 🔥 NUEVO: CARGAMOS DATOS REALES DE SU SISTEMA AL ENTRAR A LA PANTALLA
const cargarDatosBase = async () => {
  try {
    const [resProductos, resColores] = await Promise.all([
      api.get('/productos'),
      api.get('/colores')
    ]);
    productos.value = resProductos.data;
    colores.value = resColores.data;
  } catch (error) {
    console.error("Error al cargar catálogos:", error);
    alert("Hubo un error al cargar los productos o colores.");
  }
};

// 🔥 NUEVO: FUNCIÓN MAESTRA QUE GUARDA EN BD Y LUEGO IMPRIME
// 🔥 NUEVO: FUNCIÓN MAESTRA QUE GUARDA EN BD Y LUEGO IMPRIME
const procesarOrdenProduccion = async () => {
  if (!form.value.productoId || detallesMatriz.value.length === 0) {
    return alert('Faltan datos para generar la Orden de Producción.');
  }

  // Validar que no haya filas vacías
  const filasValidas = detallesMatriz.value.every(d => d.color && d.talla && d.cantidad > 0);
  if (!filasValidas) {
    return alert('Asegúrese de seleccionar color, talla y cantidad en todas las filas.');
  }

  guardando.value = true;
  const codigoOPGenerado = `OP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    // 1. TRANSFORMAMOS LA MATRIZ DE VUE AL FORMATO OBJETO QUE ESPERA SU NESTJS
    // El backend espera: {"ROJO-S": 10, "AZUL-M": 5}
    const matrizParaBackend: Record<string, number> = {};
    detallesMatriz.value.forEach(d => {
      const clave = `${d.color}-${d.talla}`;
      // Si el operario agregó dos filas iguales (ej: Rojo S 10 y Rojo S 5), las sumamos
      matrizParaBackend[clave] = (matrizParaBackend[clave] || 0) + Number(d.cantidad); 
    });

    // 2. ARMAMOS EL PAQUETE EXACTO PARA EL BACKEND (NestJS)
    const payload = {
      codigoOp: codigoOPGenerado,
      productoId: Number(form.value.productoId),
      fechaInicio: new Date(String(form.value.fechaInicio)).toISOString(),
      estado: 'En Proceso',
      // Enviamos la matriz transformada
      matriz: matrizParaBackend, 
      // Enviamos servicios y CIF como arreglos vacíos para que el .map() de NestJS no explote
      servicios: [], 
      cif: []        
    };

    // 3. LO ENVIAMOS A LA BASE DE DATOS
    await api.post('/ordenes', payload);

    // 4. SI EL GUARDADO FUE ÉXITOSO, GENERAMOS EL PDF
    generarOrdenCortePDF(codigoOPGenerado);

    alert('✅ Orden de Producción creada correctamente y enviada a Planta.');
    
    // 5. LO REDIRIGIMOS AUTOMÁTICAMENTE AL TABLERO
    router.push('/produccion/ordenes');

  } catch (error: any) {
    alert("❌ Error al guardar la OP: " + (error.response?.data?.message || error.message));
  } finally {
    guardando.value = false;
  }
};

// GENERADOR DEL DOCUMENTO DE CORTE (PDF) AHORA RECIBE EL CÓDIGO OP POR PARÁMETRO
const generarOrdenCortePDF = (codigoOP: string) => {
  const productoSelect = productos.value.find(p => p.id === Number(form.value.productoId));
  const doc = new jsPDF();

  // Encabezado Industrial
  doc.setFillColor(220, 38, 38); 
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
  doc.text(`Producto: ${productoSelect?.skuBase || ''} - ${productoSelect?.nombre || ''}`, 15, 74);
  doc.text(`Total a Cortar: ${totalPrendas.value} prendas`, 15, 81);

  // Tabla Matriz de Corte
  const bodyTabla = detallesMatriz.value.map(d => [
    d.color.toUpperCase(), 
    d.talla.toUpperCase(), 
    `${d.cantidad} und`,
    '' 
  ]);

  autoTable(doc, {
    startY: 95,
    head: [['Color', 'Talla', 'Cant. Programada', 'Cant. Real Cortada (Llenar)']],
    body: bodyTabla,
    theme: 'grid',
    headStyles: { fillColor: [31, 41, 55] },
    columnStyles: { 3: { cellWidth: 50 } } 
  });

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
};

onMounted(() => {
  cargarDatosBase();
});
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-black text-gray-900 tracking-tight">1. Generación de Orden de Producción ✂️</h2>
      <p class="text-gray-500 mt-2 font-medium">Define la matriz de corte (tallas, colores y cantidades) antes de confeccionar.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
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

      <div class="lg:col-span-8">
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div class="flex justify-between items-center mb-4 border-b pb-2">
            <h3 class="text-lg font-bold text-gray-800">Matriz de Corte (Curva)</h3>
            <button @click="agregarFila" class="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg text-sm transition-colors">
              + Añadir Fila
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th class="p-3 rounded-tl-lg w-1/3">Color (De Catálogo)</th>
                  <th class="p-3 w-1/4">Talla</th>
                  <th class="p-3">Cantidad</th>
                  <th class="p-3 rounded-tr-lg w-10 text-center">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="(fila, index) in detallesMatriz" :key="index" class="hover:bg-gray-50 transition-colors">
                  
                  <td class="p-2">
                    <select v-model="fila.color" class="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-red-500">
                      <option value="" disabled>Elegir Color...</option>
                      <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
                    </select>
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

          <div class="mt-8 flex justify-end">
            <button @click="procesarOrdenProduccion" :disabled="guardando" class="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white py-3 px-8 rounded-xl font-black text-lg shadow-lg shadow-red-500/30 transition-all flex items-center gap-2">
              <span v-if="guardando" class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span v-else>💾 Generar OP e Imprimir PDF</span>
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