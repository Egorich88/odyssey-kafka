import { createPortal } from 'react-dom';
import { Tooltip, type ITooltip } from 'react-tooltip';

// Портал и фиксированное позиционирование исключают обрезание подсказки панелями.
export default function OdysseyTooltip({ className = '', globalCloseEvents, ...props }: ITooltip) {
  return createPortal(<Tooltip {...props} offset={12} positionStrategy="fixed"
    globalCloseEvents={{ escape: true, ...globalCloseEvents }}
    className={`odyssey-tooltip ${className}`} />, document.body);
}
