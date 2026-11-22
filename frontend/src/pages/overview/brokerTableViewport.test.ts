// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fitBrokerTableViewport } from './brokerTableViewport';

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

function fixture(count: number) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding-top:8px;border-top:1px solid';
  wrapper.innerHTML = `<table><thead><tr><th>Broker</th></tr></thead><tbody>${Array.from({length:count},(_,id)=>`<tr><td>${id}</td></tr>`).join('')}</tbody></table>`;
  document.body.appendChild(wrapper);
  const table = wrapper.querySelector('table')!;
  vi.spyOn(table,'getBoundingClientRect').mockReturnValue({top:20} as DOMRect);
  const rows = Array.from(table.tBodies[0].rows);
  rows.forEach((row,index) => vi.spyOn(row,'getBoundingClientRect').mockReturnValue({bottom:20+32+(index+1)*48} as DOMRect));
  return wrapper;
}

it.each([1,3,7,10,50])('ограничивает список %i брокеров семью строками без уменьшения шрифта', count => {
  const wrapper=fixture(count);
  fitBrokerTableViewport(wrapper)();
  expect(wrapper.style.maxHeight).toBe(`${32+Math.min(count,7)*48+9}px`);
  expect(wrapper.querySelectorAll('tbody tr')).toHaveLength(count);
  expect(wrapper.style.fontSize).toBe('');
});

it('пересчитывает предел при переносах и освобождает ResizeObserver', () => {
  let resize!: () => void;
  const disconnect=vi.fn(), observe=vi.fn();
  vi.stubGlobal('ResizeObserver', class { constructor(callback:()=>void){resize=callback} observe=observe; disconnect=disconnect; });
  const wrapper=fixture(10), stop=fitBrokerTableViewport(wrapper);
  const seventh=wrapper.querySelectorAll('tbody tr')[6];
  vi.mocked(seventh.getBoundingClientRect).mockReturnValue({bottom:500} as DOMRect);
  resize();
  expect(wrapper.style.maxHeight).toBe('489px');
  expect(observe).toHaveBeenCalledTimes(9);
  stop();expect(disconnect).toHaveBeenCalledOnce();
});
