import { defineStore } from 'pinia';
import { ref } from 'vue';

// Estado de la interfaz: si el sidebar está colapsado en escritorio.
// Se persiste para que la preferencia sobreviva al refrescar la página.
export const useUiStore = defineStore('ui', () => {
  const sidebarColapsado = ref(localStorage.getItem('sidebarColapsado') === '1');

  function setColapsado(v: boolean) {
    sidebarColapsado.value = v;
    localStorage.setItem('sidebarColapsado', v ? '1' : '0');
  }

  function toggle() {
    setColapsado(!sidebarColapsado.value);
  }

  return { sidebarColapsado, setColapsado, toggle };
});
