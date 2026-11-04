import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  CircleHelp,
  ClipboardCheck,
  Gauge,
  KeyRound,
  Leaf,
  Library,
  RefreshCcw,
  Route,
  Target,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import { WelcomeDialog } from '../components/WelcomeDialog'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: readonly NavItem[] = [
  { to: '/', label: '目标', icon: Target, end: true },
  { to: '/map', label: '地图', icon: Waypoints },
  { to: '/path', label: '路径', icon: Route },
  { to: '/resources', label: '资源', icon: Library },
  { to: '/assess', label: '验收', icon: ClipboardCheck },
  { to: '/retro', label: '复盘', icon: RefreshCcw },
  { to: '/quality', label: '质量', icon: Gauge },
]

const WELCOME_KEY = 'sdl-welcome-seen'

/**
 * 全站外壳：玻璃质感顶栏 + 内容 + 页脚；首次打开弹「欢迎 / Key / 微信反馈」。
 */
export function AppLayout() {
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) !== '1'
    } catch {
      return true
    }
  })

  const closeWelcome = (): void => {
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      /* 隐私模式写不了 localStorage 就只关弹窗 */
    }
    setWelcomeOpen(false)
  }

  return (
    <div className="shell">
      <header className="site-header">
        <div className="header-inner">
          <NavLink to="/" className="brand" end>
            <span className="brand-mark" aria-hidden="true">
              <Leaf size={17} strokeWidth={1.75} />
            </span>
            <span className="brand-text">
              <strong>自我导向学习辅助器</strong>
              <small>SELF-DIRECTED LEARNING</small>
            </span>
          </NavLink>

          <nav className="nav" aria-label="主导航">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
                  <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <button
            type="button"
            className="icon-button"
            aria-label="使用说明与反馈"
            title="使用说明与反馈"
            onClick={() => setWelcomeOpen(true)}
          >
            <CircleHelp size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <NavLink
            to="/settings"
            aria-label="API Key"
            title="API Key"
            className={({ isActive }) => (isActive ? 'icon-button active' : 'icon-button')}
          >
            <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
          </NavLink>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <WelcomeDialog open={welcomeOpen} onClose={closeWelcome} />

      <footer className="site-footer">
        <span>本地优先 · 数据与网页都在本机</span>
        <span className="footer-dot" aria-hidden="true" />
        <span>Markdown 为源，索引可重建</span>
      </footer>
    </div>
  )
}
