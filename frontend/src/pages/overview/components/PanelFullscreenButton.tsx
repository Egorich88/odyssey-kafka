/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * @file PanelFullscreenButton.tsx
 * Кнопка увеличения панели Overview.
 *
 * Панель не занимает весь монитор: она открывается по центру страницы,
 * а остальной интерфейс закрывается затемнённым и размытым слоем.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';

export default function PanelFullscreenButton({ expandLabel, collapseLabel, onFullscreenChange }: {
  expandLabel?: string;
  collapseLabel?: string;
  onFullscreenChange?: (isOpen: boolean) => void;
} = {}): JSX.Element {
  const [fullscreen, setFullscreen] = useState(false);
  const activePanel = useRef<HTMLElement | null>(null);
  const notify = useRef(onFullscreenChange);
  notify.current = onFullscreenChange;

  const closeFullscreen = useCallback(() => {
    const panel = activePanel.current;
    if (!panel) return;
    activePanel.current = null;
    panel.classList.remove('is-panel-fullscreen');
    document.body.classList.remove('panel-modal-open');
    setFullscreen(false);
    notify.current?.(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFullscreen();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('odyssey-close-fullscreen', closeFullscreen);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('odyssey-close-fullscreen', closeFullscreen);
      if (activePanel.current) closeFullscreen();
    };
  }, [closeFullscreen]);

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    const panel = event.currentTarget.closest<HTMLElement>('.dashboard-panel, .events-panel');
    if (!panel) return;
    if (activePanel.current === panel) {
      closeFullscreen();
      return;
    }
    document.dispatchEvent(new Event('odyssey-close-fullscreen'));
    activePanel.current = panel;
    panel.classList.add('is-panel-fullscreen');
    document.body.classList.add('panel-modal-open');
    setFullscreen(true);
    notify.current?.(true);
  };

  const label = fullscreen ? collapseLabel : expandLabel;
  return (
    <button
      type="button"
      className="panel-fullscreen-button"
      title={label ?? (fullscreen ? 'Свернуть панель' : 'Увеличить панель')}
      aria-label={label ?? (fullscreen ? 'Свернуть панель' : 'Увеличить панель')}
      onClick={toggle}
    >
      {fullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
      {label && <span>{label}</span>}
    </button>
  );
}
