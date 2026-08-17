"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart2, CheckSquare, Clock, FolderKanban, Home, Settings, Target, X } from "lucide-react"

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const navItems = [
    { label: "Dashboard", icon: Home, href: "/" },
    { label: "Projects", icon: FolderKanban, href: "/projects" },
    { label: "Tasks", icon: CheckSquare, href: "/tasks" },
    { label: "Pomodoro", icon: Clock, href: "/pomodoro" },
    { label: "Habits", icon: Target, href: "/habits" },
    { label: "Analytics", icon: BarChart2, href: "/analytics" },
  ]

  const linkClass = (href: string) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
    return `group flex items-center rounded-xl p-3 transition-all ${
      active
        ? "bg-[var(--color-primary)]/15 text-white"
        : "text-zinc-300 hover:bg-[var(--surface-border)] hover:text-white"
    }`
  }

  return (
    <aside className={`fixed left-0 top-0 z-40 h-screen w-64 border-r border-[var(--surface-border)] bg-[var(--surface)]/95 backdrop-blur-xl transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-full flex-col overflow-y-auto px-3 py-6">
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/" onClick={onClose} className="flex items-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-success)] text-white">
              <Target size={24} />
            </div>
            <span className="ml-3 text-2xl font-bold tracking-tight">OneStep</span>
          </Link>
          <button type="button" aria-label="Close navigation" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white md:hidden">
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Primary navigation">
          <ul className="space-y-2 font-medium">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={onClose} className={linkClass(item.href)}>
                  <item.icon className={`h-5 w-5 ${pathname === item.href ? "text-[var(--color-primary)]" : "text-zinc-400"}`} />
                  <span className="ml-3">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto">
          <Link href="/settings" onClick={onClose} className={linkClass("/settings")}>
            <Settings className="h-5 w-5 text-zinc-400" />
            <span className="ml-3">Settings</span>
          </Link>
        </div>
      </div>
    </aside>
  )
}
