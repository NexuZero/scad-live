import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from '@/components/ui/sidebar'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './NavGroup'
import { NavUser } from './NavUser'

export function AppSidebar({ variant = 'inset', collapsible = 'offcanvas' }) {
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <span className="text-xs font-bold text-primary">SC</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">SCAD MAP</span>
            <span className="text-[10px] text-muted-foreground leading-none">Field Operations</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
