<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  FileText,
  Wand2,
  Briefcase,
  Settings,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

interface NavItem {
  name: string
  path: string
  icon: typeof LayoutDashboard
}

const navItems: NavItem[] = [
  { name: '首页', path: '/', icon: LayoutDashboard },
  { name: '简历管理', path: '/resumes', icon: FileText },
  { name: '简历定制', path: '/customize', icon: Wand2 },
  { name: '投递管理', path: '/applications', icon: Briefcase },
  { name: '设置', path: '/settings', icon: Settings },
]

const currentPath = computed(() => route.path)

function navigate(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="flex h-screen bg-white">
    <!-- 侧边栏 -->
    <aside class="w-60 flex-shrink-0 border-r border-gray-100 flex flex-col">
      <!-- Logo -->
      <div class="px-6 py-5 border-b border-gray-100">
        <h1 class="text-lg font-semibold text-primary">AI求职助手</h1>
        <p class="text-xs text-gray-400 mt-0.5">智能简历定制工具</p>
      </div>

      <!-- 导航菜单 -->
      <nav class="flex-1 px-3 py-4">
        <button
          v-for="item in navItems"
          :key="item.path"
          @click="navigate(item.path)"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1"
          :class="
            currentPath === item.path ||
            (item.path !== '/' && currentPath.startsWith(item.path))
              ? 'bg-primary text-white'
              : 'text-gray-600 hover:bg-gray-50'
          "
        >
          <component :is="item.icon" class="w-4 h-4" />
          <span>{{ item.name }}</span>
        </button>
      </nav>

      <!-- 底部信息 -->
      <div class="px-6 py-4 border-t border-gray-100">
        <p class="text-xs text-gray-400">数据本地存储 · 安全私密</p>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="flex-1 overflow-auto">
      <router-view />
    </main>
  </div>
</template>
