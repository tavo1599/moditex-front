<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../api/axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const ordenes = ref<any[]>([]);
const talleres = ref<any[]>([]); // AHORA ES DINÁMICO DESDE LA BASE DE DATOS
const cargando = ref(true);

// ESTADO DEL MODAL
const mostrarModal = ref(false);
const ordenDetalle = ref<any>(null);
const cargandoDetalle = ref(false);
const actualizandoEstado = ref(false);

// ESTADO DEL FORMULARIO DE TALLERES
const mostrandoFormTaller = ref(false);
const editandoIndex = ref<number | null>(null);
const formTaller = ref({
  tallerId: '',
  tipoServicio: 'Confección',
  costoUnitarioPactado: 0
});

// VARIABLE COMPUTADA PARA EVITAR ERRORES DE TYPESCRIPT EN EL BUCLE (v-for)
const rutasAsignadas = computed<any[]>(() => ordenDetalle.value?.rutas || []);

// ==========================================
// CARGA DE DATOS DESDE NESTJS
// ==========================================
const cargarOrdenes = async () => {
  cargando.value = true;
  try {
    const res = await api.get('/ordenes');
    ordenes.value = res.data;
  } catch (error) {
    console.error("Error al cargar las órdenes:", error);
  } finally {
    cargando.value = false;
  }
};

const cargarTalleres = async () => {
  try {
    // Asegúrate de que esta ruta coincida con tu backend para traer la lista de proveedores/talleres
    const res = await api.get('/talleres');
    talleres.value = res.data;
  } catch (error) {
    console.error("Error al cargar la lista de talleres:", error);
  }
};


const abrirDetalles = async (id: number) => {
  mostrarModal.value = true;
  cargandoDetalle.value = true;
  ordenDetalle.value = null;
  mostrandoFormTaller.value = false;
  try {
    const res = await api.get(`/ordenes/${id}`);
    ordenDetalle.value = res.data;
  } catch (error) {
    alert("Error al cargar los detalles de la OP.");
    mostrarModal.value = false;
  } finally {
    cargandoDetalle.value = false;
  }
};

const cerrarModal = () => {
  mostrarModal.value = false;
  mostrandoFormTaller.value = false;
};

// ==========================================
// LÓGICA DE TALLERES (AGREGAR / CAMBIAR)
// ==========================================
const abrirFormularioNuevo = () => {
  editandoIndex.value = null;
  formTaller.value = { tallerId: '', tipoServicio: 'Confección', costoUnitarioPactado: 0 };
  mostrandoFormTaller.value = true;
};

const abrirFormularioEditar = (index: number) => {
  const ruta = rutasAsignadas.value[index];
  editandoIndex.value = index;
  formTaller.value = { 
    tallerId: ruta.taller?.id?.toString() || '', 
    tipoServicio: ruta.tipoServicio, 
    costoUnitarioPactado: ruta.costoUnitarioPactado 
  };
  mostrandoFormTaller.value = true;
};

const guardarRutaTaller = async () => {
  if (!formTaller.value.tallerId || formTaller.value.costoUnitarioPactado <= 0) {
    return alert('Selecciona un taller y define el pago mayor a 0.');
  }

  const tallerSeleccionado = talleres.value.find(t => t.id === Number(formTaller.value.tallerId));
  
  if (!ordenDetalle.value.rutas) ordenDetalle.value.rutas = [];

  if (editandoIndex.value !== null) {
    ordenDetalle.value.rutas[editandoIndex.value] = {
      tipoServicio: formTaller.value.tipoServicio,
      taller: tallerSeleccionado,
      costoUnitarioPactado: formTaller.value.costoUnitarioPactado
    };
    alert('✅ Taller reasignado correctamente.');
  } else {
    ordenDetalle.value.rutas.push({
      tipoServicio: formTaller.value.tipoServicio,
      taller: tallerSeleccionado,
      costoUnitarioPactado: formTaller.value.costoUnitarioPactado
    });
    alert('✅ Nuevo proceso asignado a la ruta.');
  }

  mostrandoFormTaller.value = false;
  // TODO: Aquí conectarás el guardado real de la ruta hacia tu backend: api.patch(`/ordenes/${ordenDetalle.value.id}/rutas`, ...)
};

// ==========================================
// GENERADOR DE GUÍA DE SALIDA A TALLER
// ==========================================
// ==========================================
// GENERADOR DE GUÍA CON QR INTEGRADO
// ==========================================
// ==========================================
// GENERADOR DE GUÍA ECO-FRIENDLY Y CON TOTALES
// ==========================================
const generarGuiaDesdeRuta = async (ruta: any) => {
  const correlativoGuia = `GR-TALLER-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  
  // Generamos el QR
  const qrDataUrl = await QRCode.toDataURL(`GUIA: ${correlativoGuia} | OP: ${ordenDetalle.value.codigoOp} | Taller: ${ruta.taller?.razonSocial}`);

  const doc = new jsPDF();
  
  // 1. ENCABEZADO AHORRADOR DE TINTA (Sin rectángulos negros)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("GUÍA DE REMISIÓN - TRASLADO A TALLER", 15, 22);

  // Línea delgada separadora
  doc.setLineWidth(0.3);
  doc.line(15, 26, 195, 26);

  // Datos de la Guía
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`N° GUÍA: ${correlativoGuia}`, 15, 36);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha de Traslado: ${new Date().toLocaleDateString()}`, 15, 43);
  doc.text(`OP Referencia: ${ordenDetalle.value.codigoOp}`, 15, 50);
  
  // Insertamos el QR al lado derecho
  doc.addImage(qrDataUrl, 'PNG', 165, 30, 25, 25);
  doc.setFontSize(7);
  doc.text("CÓDIGO DE LOTE", 167, 58);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("DESTINATARIO (TALLER):", 85, 36);
  doc.setFont("helvetica", "normal");
  doc.text(`Razón Social: ${ruta.taller?.razonSocial || 'Taller No Definido'}`, 85, 43);
  doc.text(`Servicio: ${ruta.tipoServicio.toUpperCase()}`, 85, 50);

  // 2. MATEMÁTICA: AGRUPACIÓN Y TOTALES
  let totalGeneral = 0;
  const subtotalesPorColor: Record<string, number> = {};

  const bodyTabla = ordenDetalle.value.detallesMatriz.map((d: any) => {
    // Forzamos a que extraiga el nombre real del color y no un objeto ni un código
    const nombreColorCompleto = typeof d.color === 'object' ? d.color.nombre : d.color;
    const cant = Number(d.cantidadProgramada);

    // Llenamos la calculadora invisible
    totalGeneral += cant;
    if (!subtotalesPorColor[nombreColorCompleto]) subtotalesPorColor[nombreColorCompleto] = 0;
    subtotalesPorColor[nombreColorCompleto] += cant;

    return [
      ordenDetalle.value.producto?.nombre || 'Producto sin nombre', 
      nombreColorCompleto.toUpperCase(), // Color limpio
      d.talla.toUpperCase(), 
      `${cant} pzas`
    ];
  });

  // 3. TABLA LIMPIA (Estilo "grid" sin rellenos pesados)
  autoTable(doc, {
    startY: 65,
    head: [['Descripción del Bien', 'Color', 'Talla', 'Cantidad']],
    body: bodyTabla,
    theme: 'grid',
    headStyles: { 
      fillColor: [240, 240, 240], // Gris súper clarito
      textColor: [0, 0, 0],       // Letra negra
      lineColor: [150, 150, 150], 
      lineWidth: 0.1 
    },
    styles: {
      lineColor: [150, 150, 150], 
      lineWidth: 0.1
    }
  });

  // 4. RESUMEN DE TOTALES AL FINAL DE LA TABLA
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  
  // Rectángulo suave para agrupar el resumen
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(250, 250, 250);
  doc.rect(15, finalY - 5, 180, 10 + (Object.keys(subtotalesPorColor).length * 6) + 10, 'FD');

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMEN DE CANTIDADES A ENTREGAR:", 20, finalY);
  
  finalY += 7;
  doc.setFont("helvetica", "normal");
  
  // Imprime cada color y su subtotal
  Object.entries(subtotalesPorColor).forEach(([color, cant]) => {
    doc.text(`• Subtotal ${color.toUpperCase()}:`, 25, finalY);
    doc.text(`${cant} pzas`, 85, finalY);
    finalY += 6;
  });

  // El Gran Total Remarcado
  finalY += 3;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL GENERAL:", 25, finalY);
  doc.text(`${totalGeneral} pzas`, 85, finalY);

  // 5. ESPACIO DE FIRMAS
  finalY += 35;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("___________________________", 30, finalY);
  doc.text("Firma de Entrega", 40, finalY + 5);
  doc.text("___________________________", 130, finalY);
  doc.text("Recepción en Taller", 135, finalY + 5);

  // Guarda y Descarga
  doc.save(`${correlativoGuia}.pdf`);
};

// ==========================================
// LÓGICA DE ESTADOS
// ==========================================
const cambiarEstado = async (nuevoEstado: string) => {
  // Datos extra que se mandan al backend junto con el estado
  const extra: Record<string, any> = { estado: nuevoEstado };

  // NOTA: "Terminada" ya no se hace aquí; la finalización (con prendas buenas,
  // merma y costo real) se realiza en la pantalla de Recepción de Taller.
  {
    let mensaje = `¿Estás seguro de marcar esta orden como "${nuevoEstado}"?`;
    if (nuevoEstado === 'Anulada') mensaje = `🚨 ¿ANULAR ORDEN?\n\nEsto detendrá la producción irreversiblemente y devolverá los insumos.`;
    if (!confirm(mensaje)) return;
  }

  actualizandoEstado.value = true;
  try {
    await api.patch(`/ordenes/${ordenDetalle.value.id}/estado`, extra);
    ordenDetalle.value.estado = nuevoEstado;
    const index = ordenes.value.findIndex(o => o.id === ordenDetalle.value.id);
    if (index !== -1) ordenes.value[index].estado = nuevoEstado;
  } catch (error: any) {
    alert("Error: " + (error.response?.data?.message || "No se pudo actualizar el estado."));
  } finally {
    actualizandoEstado.value = false;
  }
};

const formatearFecha = (fecha: string) => {
  return new Date(fecha).toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: '2-digit' });
};
const obtenerCostoNeto = (costeo: any) => costeo ? Number(Array.isArray(costeo) ? costeo[0]?.costoTotalUnitarioNeto : costeo.costoTotalUnitarioNeto || 0) : 0;
const obtenerPrecioVentaMayorista = (costeo: any) => costeo ? Number(Array.isArray(costeo) ? costeo[0]?.precioMayorista : costeo.precioMayorista || 0) : 0;

onMounted(() => {
  cargarOrdenes();
  cargarTalleres(); // INICIAMOS LA CARGA DE LA BD AL ABRIR LA PANTALLA
});
</script>

<template>
  <div class="space-y-6 relative animate-fade-in">
    <!-- HEADER -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100 gap-4">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Control de Órdenes (OP)</h2>
        <p class="text-gray-500 mt-1">Monitorea el estado, talleres y costos de tu producción.</p>
      </div>
      <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
        <button @click="cargarOrdenes" class="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2">
          <span>🔄</span> Tablero
        </button>
        <router-link to="/produccion" class="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md shadow-red-500/30 transition-all flex items-center justify-center gap-2">
          <span>✂️</span> Nueva OP
        </router-link>
      </div>
    </div>

    <!-- TABLA PRINCIPAL -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-900 text-white font-bold uppercase text-[10px] tracking-wider">
          <tr>
            <th class="p-4">Código OP</th>
            <th class="p-4">Fecha</th>
            <th class="p-4">Producto</th>
            <th class="p-4 text-center">Estado</th>
            <th class="p-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="op in ordenes" :key="op.id" class="hover:bg-blue-50/50 transition-colors">
            <td class="p-4 font-mono font-black text-blue-700">{{ op.codigoOp }}</td>
            <td class="p-4 text-gray-500 text-xs">{{ formatearFecha(op.fechaInicio) }}</td>
            <td class="p-4 font-bold text-gray-800">{{ op.producto?.nombre }}</td>
            <td class="p-4 text-center">
              <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase"
                :class="{'bg-yellow-100 text-yellow-700': op.estado === 'En Proceso', 'bg-green-100 text-green-700': op.estado === 'Terminada', 'bg-red-100 text-red-700': op.estado === 'Anulada'}">
                {{ op.estado }}
              </span>
            </td>
            <td class="p-4 text-center">
              <button @click="abrirDetalles(op.id)" class="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg font-bold text-xs border border-blue-200">
                Ver Detalles
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- DRAWER: MODAL DE DETALLES -->
    <div v-if="mostrarModal" @click.self="cerrarModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-end z-[100]">
      
      <div class="bg-gray-50 h-full w-full max-w-2xl shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        <div class="bg-gray-900 p-6 flex justify-between items-center text-white">
          <div>
            <h3 class="text-2xl font-black tracking-widest text-blue-400">OP: {{ ordenDetalle?.codigoOp }}</h3>
            <p class="text-xs text-gray-400 mt-1 uppercase">{{ ordenDetalle?.producto?.nombre }}</p>
          </div>
          <button @click="cerrarModal" class="text-gray-400 hover:text-white text-3xl font-light">&times;</button>
        </div>

        <div class="p-6 flex-1 overflow-y-auto space-y-6" v-if="!cargandoDetalle && ordenDetalle">
          
          <!-- SECCIÓN: RUTA Y TALLERES -->
          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
            <div class="flex justify-between items-center mb-4">
              <h4 class="font-bold text-gray-800 flex items-center gap-2"><span>🏭</span> Talleres y Procesos</h4>
              <button v-if="ordenDetalle.estado === 'En Proceso' && !mostrandoFormTaller" 
                @click="abrirFormularioNuevo"
                class="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold border border-transparent hover:border-blue-200 transition-colors">
                + Agregar Proceso
              </button>
            </div>

            <!-- FORMULARIO DE ASIGNACIÓN/REASIGNACIÓN -->
            <div v-if="mostrandoFormTaller" class="bg-blue-50/50 border border-blue-200 p-4 rounded-xl mb-4 animate-fade-in">
              <h5 class="text-xs font-black text-blue-800 uppercase tracking-widest mb-3">
                {{ editandoIndex !== null ? 'Cambiar Taller Asignado' : 'Nuevo Proceso a Ruta' }}
              </h5>
              
              <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="col-span-2">
                  <label class="block text-[10px] font-bold text-gray-500 uppercase">Seleccionar Taller</label>
                  <select v-model="formTaller.tallerId" class="w-full mt-1 border border-gray-300 p-2.5 rounded-lg text-sm font-bold outline-none focus:border-blue-500">
                    <option value="" disabled>Elige un taller de tu directorio...</option>
                    <!-- Itera sobre los talleres reales cargados del backend -->
                    <option v-for="t in talleres" :key="t.id" :value="t.id">{{ t.razonSocial }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-gray-500 uppercase">Servicio a Realizar</label>
                  <select v-model="formTaller.tipoServicio" class="w-full mt-1 border border-gray-300 p-2.5 rounded-lg text-sm outline-none">
                    <option value="Confección">Confección / Costura</option>
                    <option value="Lavandería">Lavandería</option>
                    <option value="Estampado">Estampado / Bordado</option>
                    <option value="Acabados">Acabados (Ojal/Botón)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-gray-500 uppercase">Costo Pago x Prenda (S/)</label>
                  <input type="number" v-model.number="formTaller.costoUnitarioPactado" class="w-full mt-1 border border-gray-300 p-2.5 rounded-lg text-sm font-bold outline-none focus:border-blue-500">
                </div>
              </div>
              
              <div class="flex gap-2 justify-end">
                <button @click="mostrandoFormTaller = false" class="px-4 py-2 text-gray-500 hover:bg-gray-200 rounded-lg text-xs font-bold">Cancelar</button>
                <button @click="guardarRutaTaller" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-xs font-bold shadow-md">
                  💾 Guardar Cambios
                </button>
              </div>
            </div>

            <!-- LISTA DE TALLERES ASIGNADOS -->
            <div class="rounded-xl border border-gray-100 overflow-hidden">
              <div v-if="rutasAsignadas.length === 0" class="p-6 text-center text-sm text-gray-400 bg-gray-50">
                Aún no hay talleres asignados a esta OP.
              </div>
              
              <div v-for="(ruta, i) in rutasAsignadas" :key="'ruta-' + i" class="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <p class="font-bold text-gray-800 text-sm">{{ ruta.tipoServicio }}</p>
                  </div>
                  <p class="text-xs text-gray-500 font-medium mt-0.5 flex items-center gap-1">
                    <span>📍</span> {{ ruta.taller?.razonSocial || 'Taller No Especificado' }}
                  </p>
                  <p class="text-[10px] text-gray-400 font-bold uppercase mt-1">Pago Pactado: <span class="text-gray-800">S/ {{ Number(ruta.costoUnitarioPactado).toFixed(2) }}</span></p>
                </div>
                
                <div class="flex items-center gap-2">
                  <button @click="abrirFormularioEditar(i)" title="Cambiar Taller" class="bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 p-2 rounded-lg text-sm transition-all">
                    ✏️
                  </button>
                  <button @click="generarGuiaDesdeRuta(ruta)" class="bg-gray-900 hover:bg-black text-white px-3 py-2 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2">
                    <span>🖨️</span> Guía
                  </button>
                </div>

              </div>
            </div>
          </div>

          <!-- MATRIZ DE CORTE -->
          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
            <h4 class="font-bold text-gray-800 mb-3 flex items-center gap-2"><span>✂️</span> Matriz de Corte</h4>
            <div class="flex flex-wrap gap-2">
              <div v-for="detalle in ordenDetalle.detallesMatriz" :key="detalle.id" class="bg-gray-100 px-3 py-2 rounded-lg border border-gray-200 text-center min-w-[80px]">
                <p class="text-[10px] font-bold text-gray-500 uppercase">{{ detalle.talla }} / {{ detalle.color }}</p>
                <p class="font-black text-gray-800">{{ detalle.cantidadProgramada }} <span class="text-xs font-normal">und</span></p>
              </div>
            </div>
          </div>

        </div>

        <!-- PANEL DE ACCIONES INFERIOR -->
        <div v-if="!cargandoDetalle && ordenDetalle" class="bg-white p-6 border-t border-gray-200">
          <div v-if="ordenDetalle.estado === 'En Proceso'" class="flex items-center gap-3">
            <button @click="cambiarEstado('Anulada')" class="px-6 py-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold text-sm">Anular OP</button>
            <p class="flex-1 text-sm text-gray-500 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 font-medium">
              📥 La producción se finaliza en <span class="font-bold text-indigo-700">Recepción de Taller</span>, registrando las prendas buenas y la merma.
            </p>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
.animate-in { animation: slideIn 0.3s ease-out forwards; }
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
</style>