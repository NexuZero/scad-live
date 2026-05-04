import {
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Users,
  Settings,
  BarChart3,
} from 'lucide-react'

// Helper: get chat unread count from localStorage
function getChatUnreadCount() {
  const count = parseInt(localStorage.getItem('chat_unread_count') || '0', 10)
  return count > 0 ? count : undefined // undefined means no badge
}

// All possible nav items (complete spec)
const allItems = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Tasks',
    url: '/tasks',
    icon: ListChecks,
    allowedRoles: ['admin', 'project_manager', 'supervisor'],
  },
  {
    title: 'Chat',
    url: '/chat',
    icon: MessageCircle,
    badge: getChatUnreadCount(),
  },
  {
    title: 'Users',
    url: '/users',
    icon: Users,
    adminOnly: true,
  },
  {
    title: 'Settings',
    url: '/settings',
    icon: Settings,
  },
  // Reports placeholder (Phase 9)
  {
    title: 'Reports',
    url: '#',
    icon: BarChart3,
    disabled: true,
    tooltip: 'Coming soon',
  },
]

// Determine user role from localStorage (JWT role)
const userRole = (localStorage.getItem('user_role') || 'viewer').toLowerCase()

// Filter items based on role visibility rules
const visibleItems = allItems.filter(item => {
  if (item.hidden) return false
  if (item.adminOnly && userRole !== 'admin') return false
  if (item.allowedRoles && !item.allowedRoles.includes(userRole)) return false
  return true
})

export const sidebarData = {
  user: {
    name: localStorage.getItem('user_name') || 'Admin',
    email: localStorage.getItem('user_email') || 'admin@scad.ae',
    role: userRole,
  },
  navGroups: [
    {
      title: 'Operations',
      items: visibleItems,
    },
  ],
}
