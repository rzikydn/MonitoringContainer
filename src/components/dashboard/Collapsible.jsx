import React, { createContext, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CollapsibleContext = createContext({
  isOpen: false,
  toggle: () => {},
});

export function Collapsible({
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className = '',
  asChild = false,
  ...props
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  return (
    <CollapsibleContext.Provider value={{ isOpen, toggle }}>
      <div
        className={`collapsible-root ${isOpen ? 'open' : 'closed'} ${className}`}
        data-state={isOpen ? 'open' : 'closed'}
        {...props}
      >
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

export function CollapsibleTrigger({ children, asChild = false, className = '', onClick, ...props }) {
  const { toggle, isOpen } = useContext(CollapsibleContext);

  const handleClick = (e) => {
    onClick?.(e);
    toggle();
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
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
      type="button"
      onClick={handleClick}
      data-state={isOpen ? 'open' : 'closed'}
      className={`collapsible-trigger ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CollapsibleContent({ children, className = '', ...props }) {
  const { isOpen } = useContext(CollapsibleContext);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: 'auto',
            opacity: 1,
            transition: {
              height: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.18, delay: 0.04 },
            },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: {
              height: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.12 },
            },
          }}
          style={{ overflow: 'hidden' }}
          className={`collapsible-content ${className}`}
          data-state={isOpen ? 'open' : 'closed'}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
