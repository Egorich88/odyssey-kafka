import { useLayoutEffect, useState } from 'react';

// Плавающее меню сохраняет отступ и помещается в доступную область окна.
export default function useDropdownPosition(open, rootRef, menuRef, enabled = true, limit = 560) {
  const [style, setStyle] = useState({});
  useLayoutEffect(() => {
    if (!open || !enabled) return;
    const update = () => {
      const root = rootRef.current;
      const menu = menuRef.current;
      if (!root || !menu) return;
      const rect = root.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const below = Math.max(0, topEdge + height - rect.bottom - 16);
      const above = Math.max(0, rect.top - topEdge - 16);
      const naturalHeight = Math.min(menu.scrollHeight, limit);
      const upwards = below < naturalHeight && above > below;
      const menuWidth = Math.min(rect.width, Math.max(0, width - 16));
      setStyle({
        position: 'fixed',
        top: upwards ? 'auto' : rect.bottom + 8,
        bottom: upwards ? window.innerHeight - rect.top + 8 : 'auto',
        left: Math.max(leftEdge + 8, Math.min(rect.left, leftEdge + width - menuWidth - 8)),
        right: 'auto',
        width: menuWidth,
        minWidth: 0,
        maxWidth: Math.max(0, width - 16),
        maxHeight: Math.min(limit, upwards ? above : below),
      });
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(rootRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open, enabled, rootRef, menuRef, limit]);
  return enabled ? style : undefined;
}
