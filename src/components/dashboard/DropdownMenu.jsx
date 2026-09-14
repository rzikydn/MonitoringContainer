import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DropdownContext = createContext({
  isOpen: false,
  setIsOpen: () => {},
  toggle: () => {},
  close: () => {},
  triggerRef: null,
});

export function DropdownMenu({ children, className = '', style }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);

  const toggle = () => setIsOpen((prev) => !prev);
  const close = () => setIsOpen(false);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, toggle, close, triggerRef }}>
      <div
        className={`dropdown-menu-root ${className}`}
        style={{
          position: 'relative',
          display: 'inline-block',
          width: '100%',
          ...style,
        }}
      >
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({ children, asChild = false, className = '', ...props }) {
  const { toggle, isOpen, triggerRef } = useContext(DropdownContext);

  const handleClick = (e) => {
    e.stopPropagation();
    toggle();
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ref: triggerRef,
      onClick: (e) => {
        children.props.onClick?.(e);
        handleClick(e);
      },
      'data-state': isOpen ? 'open' : 'closed',
      className: `${children.props.className || ''} ${className}`,
      ...props,
    });
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={handleClick}
      data-state={isOpen ? 'open' : 'closed'}
      className={`dropdown-trigger ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
  className = '',
  align = 'start',
  side = 'bottom',
  sideOffset = 4,
  ...props
}) {
  const { isOpen, close } = useContext(DropdownContext);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentClick = (e) => {
      if (contentRef.current && !contentRef.current.contains(e.target)) {
        close();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, close]);

  let positionStyle = {
    position: 'absolute',
    zIndex: 9999,
  };

  if (side === 'right') {
    positionStyle = {
      ...positionStyle,
      left: `calc(100% + ${sideOffset}px)`,
      top: align === 'end' ? 'auto' : 0,
      bottom: align === 'end' ? 0 : 'auto',
    };
  } else {
    positionStyle = {
      ...positionStyle,
      top: `calc(100% + ${sideOffset}px)`,
      left: align === 'end' ? 'auto' : 0,
      right: align === 'end' ? 0 : 'auto',
    };
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={contentRef}
          initial={{ opacity: 0, scale: 0.95, y: side === 'bottom' ? -4 : 0, x: side === 'right' ? -4 : 0 }}
          animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          style={positionStyle}
          className={`dropdown-menu-content ${className}`}
          data-state={isOpen ? 'open' : 'closed'}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DropdownMenuItem({ children, className = '', onClick, ...props }) {
  const { close } = useContext(DropdownContext);

  const handleClick = (e) => {
    onClick?.(e);
    close();
  };

  return (
    <div
      role="menuitem"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick(e);
        }
      }}
      className={`dropdown-menu-item ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuGroup({ children, className = '', ...props }) {
  return (
    <div className={`dropdown-menu-group ${className}`} {...props}>
      {children}
    </div>
  );
}

export function DropdownMenuLabel({ children, className = '', ...props }) {
  return (
    <div className={`dropdown-menu-label ${className}`} {...props}>
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className = '', ...props }) {
  return <div className={`dropdown-menu-separator ${className}`} {...props} />;
}

export function DropdownMenuShortcut({ children, className = '', ...props }) {
  return (
    <span className={`dropdown-menu-shortcut ${className}`} {...props}>
      {children}
    </span>
  );
}
