import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

const PASSWORD_CHAR = '\u2022';

export default function SmoothInput({
  id,
  name,
  type = 'text',
  isMasked = false,
  label,
  value = '',
  onChange,
  onFocus,
  onBlur,
  rightIcon,
  autoComplete = 'off',
  disabled = false,
  ...props
}) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const measureRef = useRef(null);

  const caretX = useMotionValue(0);
  const caretOpacity = useMotionValue(0);
  const prefersReducedMotion = useReducedMotion();

  const springCaretX = useSpring(
    caretX,
    prefersReducedMotion
      ? { stiffness: 10000, damping: 100, mass: 0.1 }
      : { stiffness: 500, damping: 30, mass: 0.5 }
  );

  const isFloating = isFocused || (value !== undefined && String(value).length > 0);

  const syncMeasureSpan = () => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return;

    const styles = window.getComputedStyle(input);

    measureSpan.style.font = `${styles.fontStyle} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
    measureSpan.style.letterSpacing = styles.letterSpacing;
    measureSpan.style.fontFeatureSettings = styles.fontFeatureSettings;
    measureSpan.style.fontVariationSettings = styles.fontVariationSettings;
    measureSpan.style.whiteSpace = 'pre';
  };

  const measurePrefixWidth = (text) => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return null;

    syncMeasureSpan();
    measureSpan.textContent = text;

    const paddingLeft =
      parseFloat(window.getComputedStyle(input).paddingLeft) || 16;

    return text.length > 0
      ? measureSpan.offsetWidth + paddingLeft
      : paddingLeft;
  };

  const scrollCaretIntoView = (target, absoluteWidth) => {
    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 16;
    const paddingRight = parseFloat(styles.paddingRight) || 42;
    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
    const visibleRight = target.scrollLeft + target.clientWidth - paddingRight;
    const visibleLeft = target.scrollLeft + paddingLeft;

    if (absoluteWidth > visibleRight) {
      target.scrollLeft = Math.min(
        absoluteWidth - target.clientWidth + paddingRight,
        maxScroll
      );
      return;
    }

    if (absoluteWidth < visibleLeft) {
      target.scrollLeft = Math.max(0, absoluteWidth - paddingLeft);
    }
  };

  const getCaretIndex = (target) => {
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? 0;

    if (selectionStart === selectionEnd) {
      return selectionStart;
    }

    return target.selectionDirection === 'backward'
      ? selectionStart
      : selectionEnd;
  };

  const updateCaretFromInput = (target) => {
    if (!target) return;
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? 0;
    const hasSelection = selectionStart !== selectionEnd;
    const caretIndex = getCaretIndex(target);
    const isPassword = target.type === 'password' || isMasked;
    const textBeforeCaret = isPassword
      ? PASSWORD_CHAR.repeat(caretIndex)
      : target.value.slice(0, caretIndex);

    const absoluteWidth = measurePrefixWidth(textBeforeCaret);
    if (absoluteWidth === null) return;

    scrollCaretIntoView(target, absoluteWidth);

    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 16;
    const paddingRight = parseFloat(styles.paddingRight) || 42;
    const caretPosition = absoluteWidth - target.scrollLeft;
    const minX = paddingLeft;
    const maxX = target.clientWidth - paddingRight;
    const isCaretVisible = caretPosition >= minX - 2 && caretPosition <= maxX + 2;

    caretX.set(Math.min(caretPosition, maxX));

    if (!isCaretVisible || hasSelection) {
      caretOpacity.set(0);
      return;
    }

    caretOpacity.set(1);
  };

  const updateCaretRef = useRef(updateCaretFromInput);
  updateCaretRef.current = updateCaretFromInput;
  const caretOpacityRef = useRef(caretOpacity);
  caretOpacityRef.current = caretOpacity;

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      updateCaretRef.current(input);
    }
  }, [value, type, isMasked]);

  useEffect(() => {
    const input = inputRef.current;
    const container = containerRef.current;
    if (!input || !container) return;

    const updateCaretIfFocused = () => {
      if (document.activeElement === input) {
        updateCaretRef.current(input);
      }
    };

    const handleSelectionChange = () => {
      if (document.activeElement !== input) return;
      requestAnimationFrame(() => {
        if (document.activeElement === input) {
          updateCaretRef.current(input);
        }
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', updateCaretIfFocused);
      void document.fonts.ready.then(updateCaretIfFocused);
    }
    input.addEventListener('scroll', updateCaretIfFocused);

    const resizeObserver = new ResizeObserver(updateCaretIfFocused);
    resizeObserver.observe(container);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (document.fonts) {
        document.fonts.removeEventListener('loadingdone', updateCaretIfFocused);
      }
      input.removeEventListener('scroll', updateCaretIfFocused);
      resizeObserver.disconnect();
    };
  }, []);

  const handleInputFocus = (e) => {
    setIsFocused(true);
    const target = e.target;
    requestAnimationFrame(() => {
      updateCaretFromInput(target);
    });
    onFocus?.(e);
  };

  const handleInputBlur = (e) => {
    setIsFocused(false);
    caretOpacityRef.current.set(0);
    onBlur?.(e);
  };

  const handleInputChange = (e) => {
    onChange?.(e);
    const target = e.target;
    requestAnimationFrame(() => {
      updateCaretRef.current(target);
    });
  };

  return (
    <div
      ref={containerRef}
      className={`floating-input-group ${isFloating ? 'floating-active' : ''} ${
        isFocused ? 'focused' : ''
      }`}
    >
      {label && (
        <label htmlFor={id} className="floating-notch-label">
          {label}
        </label>
      )}

      <div className="input-inner-wrapper">
        <input
          {...props}
          ref={inputRef}
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onClick={(e) => updateCaretFromInput(e.target)}
          onKeyUp={(e) => updateCaretFromInput(e.target)}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`login-text-input smooth-caret-input ${isMasked ? 'mask-secret' : ''}`}
        />

        {/* Hidden span to calculate prefix text width */}
        <span
          ref={measureRef}
          aria-hidden="true"
          className="smooth-caret-measure-span"
        />

        {/* Animated Smooth Spring Caret Cursor */}
        <motion.div
          className="smooth-caret-cursor"
          style={{
            x: springCaretX,
            opacity: caretOpacity,
          }}
        />

        {/* Right Action / Icon */}
        {rightIcon}
      </div>
    </div>
  );
}
