// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

const { useCluster } = vi.hoisted(() => ({ useCluster: vi.fn() }));
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../contexts/ClusterContext', () => ({ useCluster }));
vi.mock('../../services/versionService', () => ({ getLatestVersion: async () => null }));
vi.mock('./ThemeToggle', () => ({default:()=> <button>Theme</button>}));
vi.mock('./Dropdown', () => ({default:()=> <button>Cluster</button>}));
vi.mock('./OdysseyTooltip', () => ({default:()=>null}));
vi.mock('@odyssey/registry', () => ({enterpriseSidebarItems:[]}));
afterEach(cleanup);

it('разделяет фиксированные верх/низ и независимую область навигации', () => {
  useCluster.mockReturnValue({ clusters: [{ id: 'synthetic', name: 'Test' }], currentCluster: { id: 'synthetic', name: 'Test' }, changeCluster: vi.fn() });
  const {container}=render(<MemoryRouter><Sidebar onAddCluster={()=>{}} onEditCluster={()=>{}} /></MemoryRouter>);
  const sidebar=container.querySelector('.sidebar')!;
  expect(Array.from(sidebar.children).map(child=>child.className)).toEqual(['sidebar-top','sidebar-navigation-region','sidebar-bottom']);
  expect(sidebar.querySelector('.sidebar-top .sidebar-logo')).not.toBeNull();
  expect(sidebar.querySelector('.sidebar-top .sidebar-cluster')).not.toBeNull();
  expect(sidebar.querySelector('.sidebar-navigation-region .sidebar-nav')).not.toBeNull();
  expect(sidebar.querySelector('.sidebar-top .sidebar-nav')).toBeNull();
  expect(sidebar.querySelector('.sidebar-bottom a[href="/settings"]')).not.toBeNull();
  expect(sidebar.querySelector('.sidebar-bottom a[href="/user"]')).not.toBeNull();
  expect(sidebar.querySelector('.sidebar-bottom .sidebar-version')).not.toBeNull();
});

it('оставляет доступную ссылку на документацию без выбранного кластера', () => {
  useCluster.mockReturnValue({ clusters: [], currentCluster: null, changeCluster: vi.fn() });
  const { container } = render(<MemoryRouter><Sidebar onAddCluster={() => {}} onEditCluster={() => {}} /></MemoryRouter>);
  const link = container.querySelector('.sidebar-footer a.sidebar-docs-link');
  expect(link?.getAttribute('href')).toMatch(/^https:\/\/egorich88\.github\.io\/odyssey-kafka\/(en\/)?$/);
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.getAttribute('aria-label')).toBeTruthy();
  const footer = container.querySelector('.sidebar-footer')!;
  expect(Array.from(footer.querySelector('.sidebar-footer-meta')!.children, child => child.tagName)).toEqual(['A', 'A']);
  expect(footer.querySelectorAll('.footer-links-row a')).toHaveLength(3);
  fireEvent.click(container.querySelector('.sidebar-collapse-button')!);
  expect(Array.from(footer.querySelectorAll('.footer-links-row a'), anchor => anchor.getAttribute('href'))).toEqual([
    'https://github.com/Egorich88/odyssey-kafka',
  ]);
});
