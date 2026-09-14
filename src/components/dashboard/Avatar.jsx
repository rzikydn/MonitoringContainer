import React, { useState } from 'react';

export function Avatar({ children, className = '', ...props }) {
  return (
    <div className={`sidebar-avatar ${className}`} {...props}>
      {children}
    </div>
  );
}

export function AvatarImage({ src, alt = '', className = '', ...props }) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) return null;

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      className={`sidebar-avatar-img ${className}`}
      {...props}
    />
  );
}

export function AvatarFallback({ children, className = '', ...props }) {
  return (
    <div className={`sidebar-avatar-fallback ${className}`} {...props}>
      {children}
    </div>
  );
}
