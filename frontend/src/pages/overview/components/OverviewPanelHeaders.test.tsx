// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BrokersPanel from './BrokersPanel';
import CertificatesPanel from './CertificatesPanel';
import ThroughputPanel from './ThroughputPanel';
import TopicsPanel from './TopicsPanel';
import ConsumerLagPanel from './ConsumerLagPanel';
import EventsPanel from './EventsPanel';

vi.mock('../../../contexts/ClusterContext', () => ({ useCluster: () => ({ currentCluster: {id:'fixture'} }) }));
vi.mock('axios', () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'ru' }, t: (key:string) => key }) }));
afterEach(cleanup);

it('сохраняет i и управление, добавляет ровно одну тематическую иконку каждому заголовку', () => {
  const {container} = render(<div className="dashboard-container">
    <BrokersPanel data={{brokers:[{id:1}]}} />
    <CertificatesPanel refreshKey={0} />
    <ThroughputPanel data={[]} hoverTime={null} onHoverTime={()=>{}} />
    <TopicsPanel refreshKey={0} />
    <ConsumerLagPanel refreshKey={0} />
    <EventsPanel refreshKey={0} />
  </div>);
  const headings=container.querySelectorAll('.panel-title-with-info, .throughput-title, .topics-panel-title, .events-title');
  expect(headings).toHaveLength(6);
  headings.forEach(heading=>{
    expect(heading.querySelectorAll(':scope > svg')).toHaveLength(1);
    expect(heading.querySelector(':scope > svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(heading.querySelector('.panel-info-trigger')).not.toBeNull();
  });
  expect(container.querySelectorAll('.panel-fullscreen-button')).toHaveLength(6);
});
