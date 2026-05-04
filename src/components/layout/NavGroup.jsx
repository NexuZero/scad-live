import { useLocation, Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function NavGroup({ title, items }) {
  const { state, isMobile } = useSidebar()
  const pathname = useLocation().pathname

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const key = `${item.title}-${item.url}`
          if (!item.items) return <SidebarMenuLink key={key} item={item} pathname={pathname} />

          if (state === 'collapsed' && !isMobile)
            return <SidebarMenuCollapsedDropdown key={key} item={item} />

          return <SidebarMenuCollapsible key={key} item={item} />
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavBadge({ children }) {
  return (
    <Badge className='rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center text-[10px] font-medium'>
      {children}
    </Badge>
  )
}

function checkIsActive(pathname, item) {
  return pathname === item.url
}

function SidebarMenuLink({ item, pathname }) {
  const { setOpenMobile } = useSidebar()

  // Skip hidden items
  if (item.hidden) {
    return null
  }

  const isDisabled = !!item.disabled
  const displayUrl = isDisabled ? '#' : item.url
  const tooltipText = isDisabled ? (item.tooltip || 'Coming soon') : item.title

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={!isDisabled && checkIsActive(pathname, item)}
        tooltip={tooltipText}
      >
        <Link
          to={displayUrl}
          onClick={(e) => {
            if (isDisabled) {
              e.preventDefault()
              return
            }
            setOpenMobile(false)
          }}
          aria-disabled={isDisabled}
          className={isDisabled ? 'opacity-50 pointer-events-none' : ''}
        >
          {item.icon && <item.icon />}
          <span>{item.title}</span>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function SidebarMenuCollapsible({ item }) {
  const { setOpenMobile } = useSidebar()
  const pathname = useLocation().pathname

  if (item.hidden) return null

  const isDisabled = !!item.disabled
  const tooltipText = isDisabled ? (item.tooltip || 'Coming soon') : item.title

  return (
    <Collapsible
      asChild
      defaultOpen={checkIsActive(pathname, item)}
      className='group/collapsible'
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={tooltipText}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className='CollapsibleContent'>
          <SidebarMenuSub>
            {item.items.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  asChild
                  isActive={!isDisabled && checkIsActive(pathname, subItem)}
                >
                  <Link
                    to={isDisabled ? '#' : subItem.url}
                    onClick={(e) => {
                      if (isDisabled) e.preventDefault()
                      else setOpenMobile(false)
                    }}
                    aria-disabled={isDisabled}
                    className={isDisabled ? 'opacity-50 pointer-events-none' : ''}
                  >
                    {subItem.icon && <subItem.icon />}
                    <span>{subItem.title}</span>
                    {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function SidebarMenuCollapsedDropdown({ item }) {
  const pathname = useLocation().pathname

  if (item.hidden) return null

  const isDisabled = !!item.disabled
  const tooltipText = isDisabled ? (item.tooltip || 'Coming soon') : item.title

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={tooltipText}
            isActive={!isDisabled && checkIsActive(pathname, item)}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ms-auto transition-transform duration-200' />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='right' align='start' sideOffset={4}>
          <DropdownMenuLabel>
            {item.title} {item.badge ? `(${item.badge})` : ''}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub) => (
            <DropdownMenuItem key={`${sub.title}-${sub.url}`} asChild>
              <Link
                to={isDisabled ? '#' : sub.url}
                className={checkIsActive(pathname, sub) && !isDisabled ? 'bg-secondary' : ''}
                onClick={(e) => isDisabled && e.preventDefault()}
              >
                {sub.icon && <sub.icon />}
                <span className='max-w-52'>{sub.title}</span>
                {sub.badge && <span className='ms-auto text-xs'>{sub.badge}</span>}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
