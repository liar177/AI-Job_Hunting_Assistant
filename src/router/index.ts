import { createRouter, createWebHistory } from 'vue-router'

// 路由配置
const routes = [
  { path: '/', name: 'dashboard', component: () => import('@/views/Dashboard.vue') },
  { path: '/resumes', name: 'resume-list', component: () => import('@/views/ResumeList.vue') },
  { path: '/resumes/:id', name: 'resume-detail', component: () => import('@/views/ResumeDetail.vue') },
  { path: '/customize', name: 'customize', component: () => import('@/views/Customize.vue') },
  { path: '/applications', name: 'application-list', component: () => import('@/views/ApplicationList.vue') },
  { path: '/applications/:id', name: 'application-detail', component: () => import('@/views/ApplicationDetail.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/Settings.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
