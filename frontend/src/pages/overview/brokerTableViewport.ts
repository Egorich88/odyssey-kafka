// Предел списка равен семи реальным строкам с учётом локализации и шрифта.
// Остальные брокеры не увеличивают высоту панели.
export function fitBrokerTableViewport(container: HTMLDivElement): () => void {
  const table = container.querySelector('table');
  if (!table) return () => undefined;
  const rows = Array.from(table.tBodies[0]?.rows ?? []).slice(0, 7);
  const update = () => {
    const last = rows.at(-1);
    if (!last) return;
    const height = last.getBoundingClientRect().bottom - table.getBoundingClientRect().top;
    if (height <= 0) return;
    const style = getComputedStyle(container);
    const extras = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
      .reduce((sum, key) => sum + (Number.parseFloat(style[key as keyof CSSStyleDeclaration] as string) || 0), 0);
    container.style.maxHeight = `${Math.ceil(height + extras)}px`;
  };
  update();
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  const observer = new ResizeObserver(update);
  observer.observe(container);
  observer.observe(table);
  rows.forEach(row => observer.observe(row));
  return () => observer.disconnect();
}
