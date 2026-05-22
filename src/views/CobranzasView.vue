<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../api/axios'; // Asegúrate de que la ruta coincida con tu proyecto

// --- ESTADOS Y TIPADOS ---
interface VentaPendiente {
  id: number;
  correlativo: string;
  totalVenta: number;
  totalPagado: number;
  fecha: string;
}

interface ClienteDeudor {
  id: number;
  nombre: string;
  saldoPendiente: number;
  limiteCredito: number;
  ventas: VentaPendiente[];
}

const modalHistorial = ref(false);
const cargandoHistorial = ref(false);
const historialPagos = ref<any[]>([]);

const deudores = ref<ClienteDeudor[]>([]);
const cargando = ref(true);
const modalAbierto = ref(false);
const procesandoPago = ref(false);

const clienteSeleccionado = ref<ClienteDeudor | null>(null);
const pago = ref({
  monto: 0,
  metodoPago: 'YAPE',
  referencia: ''
});

const abrirHistorial = async (cliente: ClienteDeudor) => {
  clienteSeleccionado.value = cliente;
  modalHistorial.value = true;
  cargandoHistorial.value = true;
  
  try {
    const res = await api.get(`/cobranzas/historial/${cliente.id}`);
    historialPagos.value = res.data;
  } catch (error) {
    console.error("Error al cargar historial:", error);
  } finally {
    cargandoHistorial.value = false;
  }
};

// --- FUNCIONES PRINCIPALES ---
const cargarDeudores = async () => {
  cargando.value = true;
  try {
    const res = await api.get('/cobranzas/deudores');
    deudores.value = res.data;
  } catch (error) {
    console.error("Error al cargar deudores:", error);
  } finally {
    cargando.value = false;
  }
};

const totalDeudaGeneral = computed(() => {
  return deudores.value.reduce((sum, cliente) => sum + Number(cliente.saldoPendiente), 0);
});

const abrirModalPago = (cliente: ClienteDeudor) => {
  clienteSeleccionado.value = cliente;
  pago.value.monto = Number(cliente.saldoPendiente); // Por defecto sugiere pagar todo
  pago.value.metodoPago = 'YAPE';
  pago.value.referencia = '';
  modalAbierto.value = true;
};

const registrarAbono = async () => {
  if (!clienteSeleccionado.value || pago.value.monto <= 0) {
    return alert("Ingresa un monto válido mayor a cero.");
  }

  if (pago.value.monto > clienteSeleccionado.value.saldoPendiente) {
    return alert("El monto a pagar no puede ser mayor que la deuda actual.");
  }

  procesandoPago.value = true;
  try {
    const payload = {
      clienteId: clienteSeleccionado.value.id,
      monto: pago.value.monto,
      metodoPago: pago.value.metodoPago,
      referencia: pago.value.referencia
    };

    await api.post('/cobranzas/abonar', payload);
    
    alert(`✅ Abono de S/ ${pago.value.monto} registrado correctamente.`);
    modalAbierto.value = false;
    await cargarDeudores(); // Recargamos la lista para actualizar los saldos

  } catch (error: any) {
    alert("Error al registrar el pago: " + (error.response?.data?.message || "Error desconocido"));
  } finally {
    procesandoPago.value = false;
  }
};

// Formateador de fechas para mostrar en la interfaz
const formatearFecha = (fechaISO: string) => {
  return new Date(fechaISO).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

onMounted(() => {
  cargarDeudores();
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 p-4 md:p-8 font-urbanist">
    <div class="max-w-[1400px] mx-auto space-y-8">
      
      <header class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 class="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">Cuentas por Cobrar</h1>
          <p class="text-slate-500 font-medium mt-2">Gestiona las deudas de tus clientes mayoristas y registra abonos.</p>
        </div>
        <div class="bg-red-50 px-8 py-4 rounded-2xl border border-red-100 text-center md:text-right w-full md:w-auto">
          <p class="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Total en la Calle</p>
          <p class="text-4xl font-black text-red-600">S/ {{ totalDeudaGeneral.toFixed(2) }}</p>
        </div>
      </header>

      <div v-if="cargando" class="flex justify-center py-20">
        <div class="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
      </div>

      <div v-else-if="deudores.length === 0" class="bg-white p-16 rounded-3xl shadow-sm border border-slate-100 text-center">
        <span class="text-6xl mb-4 block">🎉</span>
        <h2 class="text-2xl font-black text-slate-800">¡Cartera limpia!</h2>
        <p class="text-slate-500 mt-2">Ningún cliente tiene deudas pendientes en este momento.</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="cliente in deudores" :key="cliente.id" class="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col hover:shadow-xl transition-all group">
          
          <div class="flex justify-between items-start mb-6">
            <div>
              <div class="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400 text-xl mb-4">
                {{ cliente.nombre.charAt(0).toUpperCase() }}
              </div>
              <h3 class="text-xl font-black text-slate-800 line-clamp-1">{{ cliente.nombre }}</h3>
              <p class="text-[10px] font-bold text-slate-400 uppercase mt-1">Límite: S/ {{ cliente.limiteCredito }}</p>
            </div>
            <div class="text-right">
              <span class="bg-red-100 text-red-700 text-[10px] font-black uppercase px-3 py-1 rounded-full">Deudor</span>
            </div>
          </div>

          <div class="bg-slate-50 p-4 rounded-2xl mb-6">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Deuda Pendiente</p>
            <p class="text-3xl font-black text-slate-900">S/ {{ Number(cliente.saldoPendiente).toFixed(2) }}</p>
          </div>

          <div class="mb-6 flex-1">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-200 pb-2">Ventas con Saldo</p>
            <div class="space-y-2">
              <div v-for="venta in cliente.ventas" :key="venta.id" class="flex justify-between items-center text-sm">
                <div>
                  <span class="font-bold text-slate-700 block">{{ venta.correlativo }}</span>
                  <span class="text-xs text-slate-400">{{ formatearFecha(venta.fecha) }}</span>
                </div>
                <div class="text-right font-black text-red-500">
                  S/ {{ (Number(venta.totalVenta) - Number(venta.totalPagado)).toFixed(2) }}
                </div>
              </div>
            </div>
          </div>

          <div class="mt-auto pt-4 flex gap-2">
            <button @click="abrirHistorial(cliente)" class="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-2xl hover:bg-slate-200 transition-colors text-xs flex items-center justify-center gap-1">
              <span>📋</span> HISTORIAL
            </button>
            <button @click="abrirModalPago(cliente)" class="flex-[2] bg-slate-900 text-white font-black py-3 rounded-2xl hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2 text-sm">
              <span>💵</span> COBRAR
            </button>
          </div>

        </div>
      </div>

    </div>

<div v-if="modalAbierto" class="fixed inset-0 z-[60] flex justify-end">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="modalAbierto = false"></div>
      
      <div class="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out]">
        <div class="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 class="text-xl font-black text-slate-800">Registrar Abono</h2>
          <button @click="modalAbierto = false" class="text-slate-400 hover:text-red-500 font-bold text-xl bg-white w-8 h-8 rounded-full shadow-sm">✕</button>
        </div>

        <div class="p-8 flex-1 overflow-y-auto space-y-6">
          
          <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-center">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">{{ clienteSeleccionado?.nombre }}</p>
            <p class="text-xs text-slate-400 mt-1">Deuda Total Acumulada</p>
            <p class="text-3xl font-black text-red-500 mt-2">S/ {{ Number(clienteSeleccionado?.saldoPendiente).toFixed(2) }}</p>
          </div>

          <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex justify-between items-center">
              <span>Detalle de Facturas</span>
              <span class="bg-slate-100 px-2 py-0.5 rounded-full">{{ clienteSeleccionado?.ventas?.length || 0 }} tickets</span>
            </p>
            
            <div class="space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
              <div v-for="(venta, index) in clienteSeleccionado?.ventas" :key="venta.id" class="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:border-emerald-200 transition-colors">
                <div class="flex items-center gap-3">
                  <div class="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-black">
                    {{ index + 1 }}
                  </div>
                  <div>
                    <p class="text-xs font-bold text-slate-700">{{ venta.correlativo }}</p>
                    <p class="text-[9px] font-bold text-slate-400 uppercase">{{ formatearFecha(venta.fecha) }}</p>
                  </div>
                </div>
                <div class="text-right">
                  <p class="text-sm font-black text-red-500">S/ {{ (Number(venta.totalVenta) - Number(venta.totalPagado)).toFixed(2) }}</p>
                </div>
              </div>
            </div>
            
            <div class="mt-3 bg-emerald-50 text-emerald-700 p-2.5 rounded-xl text-[10px] font-bold flex gap-2 items-center">
              <span class="text-base">💡</span>
              <p>El abono se aplicará en cascada, cancelando automáticamente la factura #1 primero.</p>
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Monto a Abonar (S/)</label>
            <input v-model.number="pago.monto" type="number" step="0.10" class="w-full bg-white border-2 border-slate-200 p-4 rounded-xl text-2xl font-black text-slate-800 outline-none focus:border-emerald-500 text-center transition-all shadow-inner" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Método de Pago</label>
              <select v-model="pago.metodoPago" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl font-bold text-slate-700 outline-none">
                <option value="EFECTIVO">💵 Efectivo en Caja</option>
                <option value="YAPE">📱 Yape / Plin</option>
                <option value="TRANSFERENCIA">🏦 Transferencia Bancaria</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">N° Operación (Opcional)</label>
            <input v-model="pago.referencia" type="text" placeholder="Ej: Operación 123456" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl font-bold text-slate-700 outline-none placeholder:text-slate-300" />
          </div>
        </div>

        <div class="p-8 border-t border-slate-100 bg-white">
          <button @click="registrarAbono" :disabled="procesandoPago" class="w-full bg-emerald-500 disabled:bg-slate-300 text-white font-black py-4 rounded-2xl hover:bg-emerald-600 transition-colors flex justify-center items-center gap-2 text-lg shadow-lg shadow-emerald-500/30">
            <span v-if="procesandoPago" class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            <span v-else>✅ APLICAR PAGO</span>
          </button>
        </div>
      </div>
    </div>

  </div>

  <div v-if="modalHistorial" class="fixed inset-0 z-50 flex justify-start">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="modalHistorial = false"></div>
      
      <div class="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-[slideInLeft_0.3s_ease-out]">
        <div class="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 class="text-xl font-black text-slate-800">Historial de Pagos</h2>
            <p class="text-xs font-bold text-slate-400 mt-1">{{ clienteSeleccionado?.nombre }}</p>
          </div>
          <button @click="modalHistorial = false" class="text-slate-400 hover:text-red-500 font-bold text-xl bg-white w-8 h-8 rounded-full shadow-sm">✕</button>
        </div>

        <div class="p-6 flex-1 overflow-y-auto bg-slate-50/50">
          
          <div v-if="cargandoHistorial" class="flex justify-center py-10">
            <div class="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
          </div>
          
          <div v-else-if="historialPagos.length === 0" class="text-center py-10">
            <span class="text-4xl block mb-2">🏜️</span>
            <p class="font-bold text-slate-400 text-sm">Este cliente aún no ha registrado pagos o abonos.</p>
          </div>

          <div v-else class="space-y-4">
            <div v-for="pago in historialPagos" :key="pago.id" class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
              <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              
              <div class="flex justify-between items-start mb-3">
                <div>
                  <span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider">
                    Recibo #{{ String(pago.id).padStart(5, '0') }}
                  </span>
                  <p class="text-xs font-bold text-slate-400 mt-1.5">{{ formatearFecha(pago.createdAt || pago.fecha || new Date()) }}</p>
                </div>
                <div class="text-right">
                  <p class="text-lg font-black text-emerald-600">S/ {{ Number(pago.monto).toFixed(2) }}</p>
                  <p class="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{{ pago.metodoPago }}</p>
                </div>
              </div>
              
              <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                <span class="font-bold text-slate-500">A cuenta de:</span>
                <span class="font-black text-slate-700">{{ pago.venta?.correlativo || 'Venta Desconocida' }}</span>
              </div>
              
              <p v-if="pago.anotacion" class="mt-3 text-[10px] font-medium text-slate-500 italic">
                "{{ pago.anotacion }}"
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@400;700;900&display=swap');
.font-urbanist { font-family: 'Urbanist', sans-serif; }

@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
</style>