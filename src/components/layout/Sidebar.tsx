'use client'
// src/components/layout/Sidebar.tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Rol } from '@/types'
import { PERMISOS } from '@/types'
import {
  LayoutDashboard, Users, Building2, FileText, CreditCard,
  Wallet, DollarSign, Calendar, MessageCircle, ShieldCheck,
  Trash2, UserCircle
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: Rol[]
  badge?: number
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',    label: 'Dashboard',    icon: <LayoutDashboard size={15}/>, roles: ['promotor','gerente','admin','superadmin'] },
  { href: '/clientes',     label: 'Clientes',     icon: <Users size={15}/>,           roles: ['promotor','gerente','admin','superadmin'] },
  { href: '/prestamos',    label: 'Préstamos',    icon: <CreditCard size={15}/>,      roles: ['promotor','gerente','admin','superadmin'] },
  { href: '/caja',         label: 'Caja',         icon: <Wallet size={15}/>,          roles: ['promotor','gerente','admin','superadmin'] },
  { href: '/fondeadores',  label: 'Fondeadores',  icon: <DollarSign size={15}/>,      roles: ['admin','superadmin'] },
  { href: '/calendario',   label: 'Calendario',   icon: <Calendar size={15}/>,        roles: ['admin','superadmin'] },
  { href: '/whatsapp',     label: 'WhatsApp',     icon: <MessageCircle size={15}/>,   roles: ['promotor','gerente','admin','superadmin'] },
  { href: '/usuarios',     label: 'Usuarios',     icon: <UserCircle size={15}/>,      roles: ['admin','superadmin'] },
  { href: '/agencias',     label: 'Agencias',     icon: <Building2 size={15}/>,       roles: ['superadmin'] },
  { href: '/auditoria',    label: 'Auditoría',    icon: <ShieldCheck size={15}/>,     roles: ['superadmin'] },
  { href: '/papelera',     label: 'Papelera',     icon: <Trash2 size={15}/>,          roles: ['admin','superadmin'] },
  { href: '/perfil',       label: 'Mi Perfil',    icon: <FileText size={15}/>,        roles: ['promotor','gerente','admin','superadmin'] },
]

export default function Sidebar({ rol }: { rol: Rol }) {
  const pathname = usePathname()

  const visibles = NAV_ITEMS.filter(item => item.roles.includes(rol))

  const grupos = [
    { label: 'Principal',      items: visibles.filter(i => ['/dashboard','/clientes'].includes(i.href)) },
    { label: 'Crédito',        items: visibles.filter(i => ['/prestamos','/caja'].includes(i.href)) },
    { label: 'Operaciones',    items: visibles.filter(i => ['/fondeadores','/calendario','/whatsapp'].includes(i.href)) },
    { label: 'Administración', items: visibles.filter(i => ['/usuarios','/agencias'].includes(i.href)) },
    { label: 'Control',        items: visibles.filter(i => ['/auditoria','/papelera'].includes(i.href)) },
  ].filter(g => g.items.length > 0)

  return (
    <aside className="w-[230px] flex flex-col flex-shrink-0 overflow-y-auto"
      style={{ background: '#141414', borderRight: '1px solid #2c2c2c' }}>

      {grupos.map(grupo => (
        <div key={grupo.label} className="px-3 pt-5 pb-1">
          <div className="text-[9px] font-semibold uppercase tracking-[2px] px-2 mb-1.5"
            style={{ color: '#5a4f42' }}>{grupo.label}</div>
          {grupo.items.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] mb-0.5 relative transition-colors"
                style={{
                  color: active ? '#e2c27d' : '#a08c6e',
                  background: active ? 'rgba(201,168,76,0.10)' : 'transparent',
                  fontWeight: active ? 500 : 400,
                }}>
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r"
                    style={{ background: '#c9a84c' }} />
                )}
                <span style={{ opacity: 0.8 }}>{item.icon}</span>
                {item.label}
                {item.badge && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: '#c0534e', color: '#fff' }}>{item.badge}</span>
                )}
              </Link>
            )
          })}
        </div>
      ))}

    </aside>
  )
}
