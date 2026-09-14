import React, { createContext, useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeft } from 'lucide-react';
import { useIsMobile } from '../../hooks/use-mobile';

const SidebarContext = createContext({
  state: 'expanded',
  open: true,
  setOpen: () => {},
  isMobile: false,
  openMobile: false,
  setOpenMobile: () => {},
  toggleSidebar: () => {},
});

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }
  return context;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  children,
  className = '',
  style,
  ...props
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [_open, _setOpen] = useState(defaultOpen);
  const open = openProp ?? _open;

  const setOpen = (value) => {
    const openState = typeof value === 'function' ? value(open) : value;
    if (setOpenProp) {
      setOpenProp(openState);
    } else {
      _setOpen(openState);
    }
  };

  const toggleSidebar = () => {
    return isMobile ? setOpenMobile((prev) => !prev) : setOpen((prev) => !prev);
  };

  const state = open ? 'expanded' : 'collapsed';

  return (
    <SidebarContext.Provider
      value={{
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }}
    >
      <div
        className={`sidebar-provider-wrapper ${className}`}
        data-state={state}
        data-collapsible="icon"
        style={{
          '--sidebar-width': '260px',
          '--sidebar-width-icon': '56px',
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'icon',
  className = '',
  children,
  ...props
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === 'none') {
    return (
      <div className={`sidebar-container static-sidebar ${className}`} {...props}>
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <AnimatePresence>
        {openMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenMobile(false)}
              className="sidebar-mobile-backdrop"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`sidebar-container mobile-sidebar ${className}`}
              {...props}
            >
              {children}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  const isCollapsed = state === 'collapsed';

  return (
    <motion.aside
      animate={{
        width: isCollapsed ? '56px' : '260px',
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      data-state={state}
      data-collapsible={isCollapsed ? 'icon' : ''}
      className={`sidebar-container desktop-sidebar ${isCollapsed ? 'collapsed' : 'expanded'} ${className}`}
      {...props}
    >
      <div className="sidebar-inner-content">
        {children}
      </div>
    </motion.aside>
  );
}

export function SidebarTrigger({ className = '', onClick, ...props }) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      aria-label="Toggle Sidebar"
      title="Toggle Sidebar"
      onClick={(e) => {
        onClick?.(e);
        toggleSidebar();
      }}
      className={`sidebar-trigger-btn ${className}`}
      {...props}
    >
      <PanelLeft size={18} />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
}

export function SidebarRail({ className = '', ...props }) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={`sidebar-rail-strip ${className}`}
      {...props}
    />
  );
}

export function SidebarInset({ className = '', children, ...props }) {
  return (
    <main className={`sidebar-inset-container ${className}`} {...props}>
      {children}
    </main>
  );
}

export function SidebarHeader({ className = '', children, ...props }) {
  return (
    <div className={`sidebar-header-section ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SidebarContent({ className = '', children, ...props }) {
  return (
    <div className={`sidebar-body-scroll ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SidebarFooter({ className = '', children, ...props }) {
  return (
    <div className={`sidebar-footer-section ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SidebarGroup({ className = '', children, ...props }) {
  return (
    <div className={`sidebar-group-box ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SidebarGroupLabel({ className = '', children, ...props }) {
  return (
    <div className={`sidebar-group-label ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SidebarMenu({ className = '', children, ...props }) {
  return (
    <ul className={`sidebar-menu-list ${className}`} {...props}>
      {children}
    </ul>
  );
}

export function SidebarMenuItem({ className = '', children, ...props }) {
  return (
    <li className={`sidebar-menu-item ${className}`} {...props}>
      {children}
    </li>
  );
}

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = 'default',
  size = 'default',
  tooltip,
  className = '',
  children,
  ...props
}) {
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      className: `sidebar-menu-button ${variant} ${size} ${isActive ? 'active' : ''} ${children.props.className || ''} ${className}`,
      'data-active': isActive,
      title: isCollapsed && tooltip ? tooltip : children.props.title,
      ...props,
    });
  }

  return (
    <button
      type="button"
      className={`sidebar-menu-button ${variant} ${size} ${isActive ? 'active' : ''} ${className}`}
      data-active={isActive}
      title={isCollapsed && tooltip ? tooltip : undefined}
      {...props}
    >
      {children}
    </button>
  );
}

export function SidebarMenuAction({
  asChild = false,
  showOnHover = false,
  className = '',
  children,
  ...props
}) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      className: `sidebar-menu-action ${showOnHover ? 'show-on-hover' : ''} ${children.props.className || ''} ${className}`,
      ...props,
    });
  }

  return (
    <button
      type="button"
      className={`sidebar-menu-action ${showOnHover ? 'show-on-hover' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SidebarMenuSub({ className = '', children, ...props }) {
  return (
    <ul className={`sidebar-menu-sub-list ${className}`} {...props}>
      {children}
    </ul>
  );
}

export function SidebarMenuSubItem({ className = '', children, ...props }) {
  return (
    <li className={`sidebar-menu-sub-item ${className}`} {...props}>
      {children}
    </li>
  );
}

export function SidebarMenuSubButton({
  asChild = false,
  size = 'md',
  isActive = false,
  className = '',
  children,
  ...props
}) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      className: `sidebar-menu-sub-button ${size} ${isActive ? 'active' : ''} ${children.props.className || ''} ${className}`,
      'data-active': isActive,
      ...props,
    });
  }

  return (
    <button
      type="button"
      className={`sidebar-menu-sub-button ${size} ${isActive ? 'active' : ''} ${className}`}
      data-active={isActive}
      {...props}
    >
      {children}
    </button>
  );
}
