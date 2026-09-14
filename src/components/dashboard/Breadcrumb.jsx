import React from 'react';
import { ChevronRight } from 'lucide-react';

export function Breadcrumb({ children, className = '', ...props }) {
  return (
    <nav aria-label="breadcrumb" className={`breadcrumb-nav ${className}`} {...props}>
      {children}
    </nav>
  );
}

export function BreadcrumbList({ children, className = '', ...props }) {
  return (
    <ol className={`breadcrumb-list ${className}`} {...props}>
      {children}
    </ol>
  );
}

export function BreadcrumbItem({ children, className = '', ...props }) {
  return (
    <li className={`breadcrumb-item ${className}`} {...props}>
      {children}
    </li>
  );
}

export function BreadcrumbLink({ children, href = '#', className = '', ...props }) {
  return (
    <a href={href} className={`breadcrumb-link ${className}`} {...props}>
      {children}
    </a>
  );
}

export function BreadcrumbPage({ children, className = '', ...props }) {
  return (
    <span aria-current="page" className={`breadcrumb-page ${className}`} {...props}>
      {children}
    </span>
  );
}

export function BreadcrumbSeparator({ children, className = '', ...props }) {
  return (
    <li role="presentation" aria-hidden="true" className={`breadcrumb-separator ${className}`} {...props}>
      {children || <ChevronRight size={14} className="breadcrumb-sep-icon" />}
    </li>
  );
}
