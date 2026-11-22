// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../contexts/ClusterContext', () => ({ useCluster: () => ({clusters:[{id:'synthetic',name:'Test'}],currentCluster:{id:'synthetic',name:'Test'},changeCluster:vi.fn()}) }));
vi.mock('../../services/versionService', () => ({ getLatestVersion: async () => null }));
vi.mock('./ThemeToggle', () => ({default:()=> <button>Theme</button>}));
vi.mock('./Dropdown', () => ({default:()=> <button>Cluster</button>}));
vi.mock('./OdysseyTooltip', () => ({default:()=>null}));
vi.mock('@odyssey/registry', () => ({enterpriseSidebarItems:[]}));
afterEach(cleanup);

it('разделяет фиксированные верх/низ и независимую область навигации', () => {
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
