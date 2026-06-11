<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api/axios';

const items = ref<any[]>([]);
const cargando = ref(true);
const nuevo = ref({ codigo: '', tipo: 'PORCENTAJE', valor: 10, minCompra: 0, maxUsos: '', vence: '' });

const cargar = async () => {
  cargando.value = true;
  try { items.value = (await api.get('/web/cupones')).data; }
  catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const crear = async () => {
  if (!nuevo.value.codigo || !nuevo.value.valor) return alert('Código y valor son obligatorios.');
  try {
    await api.post('/web/cupones', nuevo.value);
    nuevo.value = { codigo: '', tipo: 'PORCENTAJE', valor: 10, minCompra: 0, maxUsos: '', vence: '' };
    await cargar();
  } catch (e: any) { alert('❌ ' + (e.response?.data?.message || 'Error. ¿Código repetido?')); }
};

const toggle = async (c: any) => { c.activo = !c.activo; await api.put(`/web/cupones/${c.id}`, { activo: c.activo }); };
const borrar = async (c: any) => { if (!confirm(`¿Eliminar el cupón ${c.codigo}?`)) return; await api.delete(`/web/cupones/${c.id}`); await cargar(); };

const fmtValor = (c: any) => c.tipo === 'PORCENTAJE' ? `${Number(c.valor)}%` : `S/ ${Number(c.valor).toFixed(2)}`;
onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">🎟️ Códigos Promocionales</h2>
      <p class="text-gray-500 mt-1">Crea cupones de descuento para tus clientes (porcentaje o monto fijo).</p>
    </div>

    <!-- Crear -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-700 mb-4">Nuevo cupón</h3>
      <div class="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <div class="col-span-2 md:col-span-1">
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Código</label>
          <input v-model="nuevo.codigo" placeholder="VERANO10" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-mono uppercase outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tipo</label>
          <select v-model="nuevo.tipo" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white">
            <option value="PORCENTAJE">%</option>
            <option value="MONTO">S/</option>
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Valor</label>
          <input v-model.number="nuevo.valor" type="number" step="0.01" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-right outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Compra mín.</label>
          <input v-model.number="nuevo.minCompra" type="number" step="0.01" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-right outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Máx. usos</label>
          <input v-model="nuevo.maxUsos" type="number" placeholder="∞" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-center outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Vence</label>
          <input v-model="nuevo.vence" type="date" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
      </div>
      <button @click="crear" class="mt-4 bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700">+ Crear cupón</button>
    </div>

    <!-- Lista -->
    <div v-if="cargando" class="text-center py-12 text-gray-500"><div class="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div></div>
    <div v-else-if="items.length" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-800 text-white font-bold uppercase text-[10px] tracking-wider">
          <tr>
            <th class="p-4">Código</th>
            <th class="p-4 text-center">Descuento</th>
            <th class="p-4 text-right">Compra mín.</th>
            <th class="p-4 text-center">Usos</th>
            <th class="p-4 text-center">Vence</th>
            <th class="p-4 text-center">Estado</th>
            <th class="p-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="c in items" :key="c.id" class="even:bg-slate-50" :class="{ 'opacity-50': !c.activo }">
            <td class="p-4 font-mono font-bold text-gray-800">{{ c.codigo }}</td>
            <td class="p-4 text-center font-bold text-emerald-700">{{ fmtValor(c) }}</td>
            <td class="p-4 text-right text-gray-500">{{ Number(c.minCompra) > 0 ? 'S/ ' + Number(c.minCompra).toFixed(2) : '—' }}</td>
            <td class="p-4 text-center text-gray-600">{{ c.usos }}{{ c.maxUsos != null ? '/' + c.maxUsos : '' }}</td>
            <td class="p-4 text-center text-gray-500 text-xs">{{ c.vence ? new Date(c.vence).toLocaleDateString('es-PE') : 'Sin límite' }}</td>
            <td class="p-4 text-center">
              <button @click="toggle(c)" class="text-[11px] font-bold px-3 py-1.5 rounded-lg" :class="c.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'">{{ c.activo ? 'Activo' : 'Inactivo' }}</button>
            </td>
            <td class="p-4 text-center">
              <button @click="borrar(c)" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg text-sm">🗑️</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="text-center text-gray-400 py-12">Aún no hay cupones. Crea el primero arriba.</p>
  </div>
</template>
