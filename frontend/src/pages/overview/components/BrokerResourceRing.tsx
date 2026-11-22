import { useId } from 'react';
import '../styles/broker-resource-ring.css';

interface Props {
  metric: 'cpu' | 'memory' | 'disk';
  value: number | null;
  center: number;
  radius: number;
  strokeWidth?: number;
}

// Общие слои кольца для компактной сводки и отдельных ресурсов в карточках.
// При обновлении сохраняются SVG-узлы и ID: анимируется только длина дуги.
export default function BrokerResourceRing({ metric, value, center, radius, strokeWidth = 14 }: Props) {
  const id = useId().replace(/:/g, '');
  const colorId = `broker-ring-${id}-${metric}`;
  const highlightId = `${colorId}-highlight`;
  const offset = value !== null && Number.isFinite(value) && value >= 0 ? 100 - Math.min(value, 100) : null;
  const geometry = { cx: center, cy: center, r: radius };
  const progress = { ...geometry, pathLength: 100, strokeDasharray: '100 100',
    strokeDashoffset: offset ?? 100, transform: `rotate(-90 ${center} ${center})` };

  return <g className={`broker-resource-ring broker-metric-${metric}`} data-available={offset !== null}>
    <defs>
      <linearGradient id={colorId} x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="color-mix(in srgb, var(--broker-metric) 65%, var(--panel-bg))" />
        <stop offset="50%" stopColor="var(--broker-metric)" />
        <stop offset="100%" stopColor="color-mix(in srgb, var(--broker-metric) 68%, var(--text-primary))" />
      </linearGradient>
      <linearGradient id={highlightId} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="var(--text-primary)" stopOpacity=".5" />
        <stop offset="45%" stopColor="var(--text-primary)" stopOpacity=".12" />
        <stop offset="100%" stopColor="var(--text-primary)" stopOpacity="0" />
      </linearGradient>
    </defs>
    <circle className="broker-overview-track" {...geometry} strokeWidth={strokeWidth} />
    {offset !== null && <g className="broker-overview-progress" opacity={value === 0 ? 0 : 1}>
      <circle className="broker-overview-arc" {...progress} strokeWidth={strokeWidth} stroke={`url(#${colorId})`} />
      <circle className="broker-overview-highlight" {...progress} strokeWidth={strokeWidth * 3 / 14} stroke={`url(#${highlightId})`} />
    </g>}
  </g>;
}
