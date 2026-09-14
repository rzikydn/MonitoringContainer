import React from 'react';
import { motion } from 'framer-motion';

export default function AnimatedLock({ isOpen, size = 18, strokeWidth = 2.2, className = '' }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ overflow: 'visible' }}
    >
      {/* Animated Shackle (Leher Gembok) yang terangkat dan berputar saat terbuka */}
      <motion.g
        initial={false}
        animate={
          isOpen
            ? { y: -3.5, rotate: -26 }
            : { y: 0, rotate: 0 }
        }
        style={{
          transformOrigin: '7px 11px',
          transformBox: 'view-box',
        }}
        transition={{
          type: 'spring',
          stiffness: isOpen ? 460 : 580,
          damping: isOpen ? 20 : 25,
        }}
      >
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </motion.g>

      {/* Lock Body (Badan Gembok) */}
      <motion.rect
        width="18"
        height="11"
        x="3"
        y="11"
        rx="2"
        ry="2"
        animate={
          isOpen
            ? { scale: [1, 0.96, 1] }
            : { scale: [1, 1.03, 1] }
        }
        transition={{ duration: 0.2 }}
      />
    </motion.svg>
  );
}
