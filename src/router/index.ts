import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/almacen',
      name: 'almacen',
      component: () => import('../views/AlmacenView.vue')
    },
    {
      path: '/reportes',
      name: 'reportes',
      component: () => import('../views/ReportesView.vue')
    },
    {
      path: '/ingenieria',
      name: 'ingenieria',
      component: () => import('../views/IngenieriaView.vue')
    },
    {
      path: '/produccion',
      name: 'produccion',
      component: () => import('../views/ProduccionView.vue')
    },
    {
      path: '/despachos',
      name: 'despachos',
      component: () => import('../views/DespachosView.vue')
    },
    {
      path: '/talleres',
      name: 'talleres',
      component: () => import('../views/TalleresView.vue')  
    },
    {
      path: '/productos',
      name: 'productos',
      component: () => import('../views/ProductosView.vue')
    },
    {
      path: '/control-ordenes',
      name: 'control-ordenes',
      component: () => import('../views/ControlOrdenesView.vue')
    },
    {
      path: '/almacen-terminados',
      name: 'almacen-terminados',
      component: () => import('../views/AlmacenTerminadosView.vue') 
    },
    {
      path: '/traslados',
      name: 'traslados',
      component: () => import('../views/TrasladosView.vue')
    },
    {
      path: '/punto-venta',
      name: 'punto-venta',
      component: () => import('../views/PuntoVentaView.vue')
    },
    // 🔥 NUEVA RUTA PARA EL ESCÁNER MÓVIL 🔥
    {
      path: '/escaner',
      name: 'escaner-movil',
      component: () => import('../views/EscanerMovil.vue'),
      meta: { 
        hideLayout: true // Propiedad para ocultar el menú de navegación en el celular
      }
    },
    {
      path: '/config-colores',
      name: 'config-colores',
      component: () => import('../views/ColoresView.vue')
    },
    {
      path: '/liquidaciones',
      name: 'Liquidaciones',
      component: () => import('../views/LiquidacionesView.vue'),
      meta: { title: 'Liquidación de Costos' }
    },
    {
      path: '/produccion/nueva-orden',
      name: 'NuevaOrdenCorte',
      component: () => import('../views/OrdenCorteView.vue')
    },
    {
      path: '/cobranzas',
      name: 'cobranzas',
      component: () => import('../views/CobranzasView.vue')
    }, 
    {
      path: '/compras',
      name: 'Compras',
      component: () => import('../views/ComprasView.vue')
    }
    
  ],
})

router.addRoute({ path: '/login', name: 'login', component: () => import('../views/LoginView.vue') });

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  
  // Si la ruta no es login y no está autenticado, lo mandamos al login
  if (to.name !== 'login' && !authStore.estaAutenticado) {
    next({ name: 'login' });
  } else {
    next();
  }
});

export default router