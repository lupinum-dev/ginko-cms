import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'
import type { HTMLAttributes } from 'vue'

export interface SidebarProps {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
  class?: HTMLAttributes['class']
}

export { default as Sidebar } from './Sidebar.vue'
export { default as SidebarContent } from './SidebarContent.vue'
export { default as SidebarFooter } from './SidebarFooter.vue'
export { default as SidebarGroup } from './SidebarGroup.vue'
export { default as SidebarGroupAction } from './SidebarGroupAction.vue'
export { default as SidebarGroupContent } from './SidebarGroupContent.vue'
export { default as SidebarGroupLabel } from './SidebarGroupLabel.vue'
export { default as SidebarHeader } from './SidebarHeader.vue'
export { default as SidebarInput } from './SidebarInput.vue'
export { default as SidebarInset } from './SidebarInset.vue'
export { default as SidebarMenu } from './SidebarMenu.vue'
export { default as SidebarMenuAction } from './SidebarMenuAction.vue'
export { default as SidebarMenuBadge } from './SidebarMenuBadge.vue'
export { default as SidebarMenuButton } from './SidebarMenuButton.vue'
export { default as SidebarMenuItem } from './SidebarMenuItem.vue'
export { default as SidebarMenuSkeleton } from './SidebarMenuSkeleton.vue'
export { default as SidebarMenuSub } from './SidebarMenuSub.vue'
export { default as SidebarMenuSubButton } from './SidebarMenuSubButton.vue'
export { default as SidebarMenuSubItem } from './SidebarMenuSubItem.vue'
export { default as SidebarProvider } from './SidebarProvider.vue'
export { default as SidebarRail } from './SidebarRail.vue'
export { default as SidebarSeparator } from './SidebarSeparator.vue'
export { default as SidebarTrigger } from './SidebarTrigger.vue'

export { useSidebar } from './utils'

export const sidebarMenuButtonVariants = cva(
  'ginko:peer/menu-button ginko:flex ginko:w-full ginko:items-center ginko:gap-2 ginko:overflow-hidden ginko:rounded-md ginko:p-2 ginko:text-left ginko:text-sm ginko:outline-hidden ginko:ring-sidebar-ring ginko:transition-[width,height,padding] ginko:hover:bg-sidebar-accent ginko:hover:text-sidebar-accent-foreground ginko:focus-visible:ring-2 ginko:active:bg-sidebar-accent ginko:active:text-sidebar-accent-foreground ginko:disabled:pointer-events-none ginko:disabled:opacity-50 ginko:group-has-data-[sidebar=menu-action]/menu-item:pr-8 ginko:aria-disabled:pointer-events-none ginko:aria-disabled:opacity-50 ginko:data-[active=true]:bg-sidebar-accent ginko:data-[active=true]:font-medium ginko:data-[active=true]:text-sidebar-accent-foreground ginko:data-[state=open]:hover:bg-sidebar-accent ginko:data-[state=open]:hover:text-sidebar-accent-foreground ginko:group-data-[collapsible=icon]:size-8! ginko:group-data-[collapsible=icon]:p-2! ginko:[&>span:last-child]:truncate ginko:[&>svg]:size-4 ginko:[&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'ginko:hover:bg-sidebar-accent ginko:hover:text-sidebar-accent-foreground',
        outline:
          'ginko:bg-background ginko:shadow-[0_0_0_1px_var(--sidebar-border)] ginko:hover:bg-sidebar-accent ginko:hover:text-sidebar-accent-foreground ginko:hover:shadow-[0_0_0_1px_var(--sidebar-accent)]',
      },
      size: {
        default: 'ginko:h-8 ginko:text-sm',
        sm: 'ginko:h-7 ginko:text-xs',
        lg: 'ginko:h-12 ginko:text-sm ginko:group-data-[collapsible=icon]:p-0!',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type SidebarMenuButtonVariants = VariantProps<typeof sidebarMenuButtonVariants>
