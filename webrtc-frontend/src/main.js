import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Room from './views/Room.vue'
import './style.css'

const routes = [
  { path: '/', component: () => import('./views/Home.vue') },
  { path: '/room/:roomId', component: Room }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

createApp(App).use(router).mount('#app')
