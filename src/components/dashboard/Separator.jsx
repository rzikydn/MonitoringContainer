import React from 'react';

export function Separator({ orientation = 'horizontal', className = '', ...props }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`sidebar-separator ${orientation} ${className}`}
      {...props}
    />
  );
}
