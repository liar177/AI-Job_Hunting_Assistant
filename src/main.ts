import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { provideGlobalConfig } from 'element-plus/es'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import './style.css'
import App from './App.vue'
import router from './router'

// 创建Vue应用实例
const app = createApp(App)

// 使用Pinia状态管理
app.use(createPinia())
// 使用路由
app.use(router)
// 使用Element Plus
provideGlobalConfig({ locale: zhCn }, app, true)

// 挂载应用
app.mount('#app')
