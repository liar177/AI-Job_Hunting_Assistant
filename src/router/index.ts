import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import ResumeList from '@/views/ResumeList.vue'
import ResumeDetail from '@/views/ResumeDetail.vue'
import Customize from '@/views/Customize.vue'
import ApplicationList from '@/views/ApplicationList.vue'
import ApplicationDetail from '@/views/ApplicationDetail.vue'
import Settings from '@/views/Settings.vue'

// 路由配置
const routes = [
  { path: '/', name: 'dashboard', component: Dashboard },
  { path: '/resumes', name: 'resume-list', component: ResumeList },
  { path: '/resumes/:id', name: 'resume-detail', component: ResumeDetail },
  { path: '/customize', name: 'customize', component: Customize },
  { path: '/applications', name: 'application-list', component: ApplicationList },
  { path: '/applications/:id', name: 'application-detail', component: ApplicationDetail },
  { path: '/settings', name: 'settings', component: Settings },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
