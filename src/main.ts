import './assets/main.css' // <-- ESTA ES LA LÍNEA QUE TE DEVUELVE EL COLOR
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')