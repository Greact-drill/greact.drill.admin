import type { ReactElement } from 'react';
import type { SchemeWidgetType } from '../lib/schemeWidgets';
import './SchemeWidgetPreview.css';

interface Props {
  type: SchemeWidgetType;
  active?: boolean;
  alarm?: boolean;
}

const strokeForState = (active: boolean, alarm: boolean) => {
  if (alarm) return '#ff6b6b';
  if (active) return '#45e08a';
  return '#f5cf57';
};

function renderSymbol(type: SchemeWidgetType, color: string, active: boolean): ReactElement {
  const stroke = { stroke: color, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const fill = alarmOrActiveFill(color);

  switch (type) {
    case 'powerSource':
      return (
        <>
          <line x1="12" y1="36" x2="34" y2="36" {...stroke} />
          <line x1="66" y1="36" x2="88" y2="36" {...stroke} />
          <line x1="34" y1="24" x2="34" y2="48" {...stroke} />
          <line x1="46" y1="18" x2="46" y2="54" {...stroke} />
          <line x1="58" y1="24" x2="58" y2="48" {...stroke} />
        </>
      );
    case 'ground':
      return (
        <>
          <line x1="50" y1="14" x2="50" y2="36" {...stroke} />
          <line x1="28" y1="36" x2="72" y2="36" {...stroke} />
          <line x1="34" y1="46" x2="66" y2="46" {...stroke} />
          <line x1="40" y1="56" x2="60" y2="56" {...stroke} />
        </>
      );
    case 'load':
      return (
        <>
          <line x1="10" y1="36" x2="26" y2="36" {...stroke} />
          <rect x="26" y="20" width="48" height="32" rx="6" {...stroke} />
          <line x1="74" y1="36" x2="90" y2="36" {...stroke} />
        </>
      );
    case 'switch':
      return (
        <>
          <line x1="12" y1="48" x2="32" y2="48" {...stroke} />
          <circle cx="32" cy="48" r="3.5" fill={color} />
          <line x1="68" y1={active ? '48' : '24'} x2="88" y2={active ? '48' : '24'} {...stroke} />
          <circle cx="68" cy={active ? '48' : '24'} r="3.5" fill={color} />
          <g className={`scheme-widget-preview__switch-arm ${active ? 'is-closed' : 'is-open'}`}>
            <line x1="32" y1="48" x2="64" y2="24" {...stroke} />
          </g>
        </>
      );
    case 'powerSwitch':
      return (
        <>
          <line x1="50" y1="4" x2="50" y2="12" {...stroke} opacity={0.7} />
          <line x1="50" y1="60" x2="50" y2="68" {...stroke} opacity={0.7} />
          <circle cx="50" cy="36" r="22" stroke={color} strokeWidth="3" fill={fill} />
          <circle cx="50" cy="21" r="3.4" fill={color} />
          <circle cx="50" cy="51" r="3.4" fill={color} />
          <line x1="50" y1="12" x2="50" y2="18" {...stroke} opacity={0.65} />
          <line x1="50" y1="54" x2="50" y2="60" {...stroke} opacity={0.65} />
          <line x1="50" y1="48" x2="50" y2="51" {...stroke} opacity={active ? 1 : 0.35} />
          <g className={`scheme-widget-preview__switch-arm scheme-widget-preview__switch-arm--power ${active ? 'is-closed' : 'is-open'}`}>
            <line x1="50" y1="21" x2="50" y2="45" {...stroke} />
          </g>
        </>
      );
    case 'fuse':
      return (
        <>
          <line x1="12" y1="36" x2="28" y2="36" {...stroke} />
          <rect x="28" y="26" width="44" height="20" rx="4" {...stroke} />
          <line x1="72" y1="36" x2="88" y2="36" {...stroke} />
          <line x1="38" y1="42" x2="62" y2="30" {...stroke} />
        </>
      );
    case 'circuitBreaker':
      return (
        <>
          <line x1="12" y1="36" x2="26" y2="36" {...stroke} />
          <rect x="26" y="18" width="48" height="36" rx="6" {...stroke} />
          <path d="M34 40 L44 28 L44 36 L56 24" {...stroke} />
          <line x1="74" y1="36" x2="88" y2="36" {...stroke} />
        </>
      );
    case 'disconnector':
      return (
        <>
          <line x1="12" y1="48" x2="32" y2="48" {...stroke} />
          <circle cx="32" cy="48" r="3.5" fill={color} />
          <line x1="32" y1="48" x2="64" y2="18" {...stroke} />
          <circle cx="68" cy="18" r="3.5" fill={color} />
          <line x1="68" y1="18" x2="88" y2="18" {...stroke} />
          <line x1="48" y1="16" x2="54" y2="10" {...stroke} />
        </>
      );
    case 'relay':
      return (
        <>
          <line x1="10" y1="36" x2="22" y2="36" {...stroke} />
          <rect x="22" y="20" width="24" height="32" rx="4" {...stroke} />
          <line x1="46" y1="36" x2="58" y2="36" {...stroke} />
          <line x1="58" y1="24" x2="70" y2="24" {...stroke} />
          <line x1="58" y1="48" x2="70" y2="36" {...stroke} />
          <line x1="70" y1="36" x2="88" y2="36" {...stroke} />
        </>
      );
    case 'contactor':
      return (
        <>
          <rect x="18" y="18" width="64" height="36" rx="8" {...stroke} />
          <line x1="10" y1="28" x2="18" y2="28" {...stroke} />
          <line x1="10" y1="44" x2="18" y2="44" {...stroke} />
          <line x1="82" y1="28" x2="90" y2="28" {...stroke} />
          <line x1="82" y1="44" x2="90" y2="44" {...stroke} />
          <line x1="36" y1="26" x2="36" y2="46" {...stroke} />
          <line x1="50" y1="26" x2="50" y2="46" {...stroke} />
          <line x1="64" y1="26" x2="64" y2="46" {...stroke} />
        </>
      );
    case 'thermalRelay':
      return (
        <>
          <rect x="18" y="18" width="64" height="36" rx="8" {...stroke} />
          <path d="M28 40 C34 24, 42 52, 50 36 S66 20, 72 36" {...stroke} />
        </>
      );
    case 'starter':
      return (
        <>
          <rect x="16" y="16" width="68" height="40" rx="8" {...stroke} />
          <path d="M28 42 C34 24, 42 52, 50 36 S66 20, 72 36" {...stroke} />
          <line x1="50" y1="56" x2="50" y2="66" {...stroke} />
          <circle cx="50" cy="70" r="4" {...stroke} />
        </>
      );
    case 'resistor':
      return (
        <>
          <line x1="10" y1="36" x2="24" y2="36" {...stroke} />
          <path d="M24 36 L32 26 L40 46 L48 26 L56 46 L64 26 L72 36" {...stroke} />
          <line x1="72" y1="36" x2="90" y2="36" {...stroke} />
        </>
      );
    case 'variableResistor':
      return (
        <>
          {renderSymbol('resistor', color, active)}
          <line x1="60" y1="16" x2="38" y2="56" {...stroke} />
          <path d="M38 56 L36 46 L46 48" {...stroke} />
        </>
      );
    case 'capacitor':
      return (
        <>
          <line x1="10" y1="36" x2="34" y2="36" {...stroke} />
          <line x1="34" y1="18" x2="34" y2="54" {...stroke} />
          <line x1="48" y1="18" x2="48" y2="54" {...stroke} />
          <line x1="48" y1="36" x2="90" y2="36" {...stroke} />
        </>
      );
    case 'inductor':
      return (
        <>
          <line x1="8" y1="36" x2="18" y2="36" {...stroke} />
          <path d="M18 36 C22 24, 30 24, 34 36 C38 48, 46 48, 50 36 C54 24, 62 24, 66 36 C70 48, 78 48, 82 36" {...stroke} />
          <line x1="82" y1="36" x2="92" y2="36" {...stroke} />
        </>
      );
    case 'transformer':
      return (
        <>
          <path d="M12 36 C16 24, 24 24, 28 36 C32 48, 40 48, 44 36 C48 24, 56 24, 60 36" {...stroke} />
          <path d="M40 14 L40 58" {...stroke} />
          <path d="M60 14 L60 58" {...stroke} />
          <path d="M64 36 C68 24, 76 24, 80 36 C84 48, 92 48, 96 36 C100 24, 108 24, 112 36" {...stroke} transform="translate(-16 0)" />
        </>
      );
    case 'diode':
      return (
        <>
          <line x1="10" y1="36" x2="28" y2="36" {...stroke} />
          <path d="M28 20 L56 36 L28 52 Z" {...stroke} />
          <line x1="60" y1="18" x2="60" y2="54" {...stroke} />
          <line x1="60" y1="36" x2="90" y2="36" {...stroke} />
        </>
      );
    case 'led':
      return (
        <>
          {renderSymbol('diode', color, active)}
          <line x1="54" y1="20" x2="70" y2="8" {...stroke} />
          <line x1="60" y1="26" x2="76" y2="14" {...stroke} />
          <path d="M70 8 L66 8 L68 12" {...stroke} />
          <path d="M76 14 L72 14 L74 18" {...stroke} />
        </>
      );
    case 'zenerDiode':
      return (
        <>
          <line x1="10" y1="36" x2="28" y2="36" {...stroke} />
          <path d="M28 20 L56 36 L28 52 Z" {...stroke} />
          <path d="M60 18 L60 54 M52 22 L60 18 L68 22 M52 50 L60 54 L68 50" {...stroke} />
          <line x1="60" y1="36" x2="90" y2="36" {...stroke} />
        </>
      );
    case 'transistor':
      return (
        <>
          <circle cx="48" cy="36" r="20" {...stroke} />
          <line x1="10" y1="36" x2="28" y2="36" {...stroke} />
          <line x1="48" y1="16" x2="48" y2="56" {...stroke} />
          <line x1="48" y1="24" x2="74" y2="14" {...stroke} />
          <line x1="48" y1="48" x2="74" y2="58" {...stroke} />
          <path d="M66 55 L74 58 L69 50" {...stroke} />
        </>
      );
    case 'pushButton':
      return (
        <>
          <line x1="10" y1="48" x2="30" y2="48" {...stroke} />
          <circle cx="38" cy="48" r="8" {...stroke} />
          <line x1="46" y1="48" x2="90" y2="48" {...stroke} />
          <line x1="38" y1="16" x2="38" y2="34" {...stroke} />
        </>
      );
    case 'emergencyStop':
      return (
        <>
          <circle cx="50" cy="34" r="16" stroke="#ff6b6b" strokeWidth="4" fill="rgba(255,107,107,0.18)" />
          <line x1="50" y1="8" x2="50" y2="18" {...stroke} />
          <line x1="12" y1="58" x2="88" y2="58" {...stroke} />
        </>
      );
    case 'modeSelector':
      return (
        <>
          <circle cx="50" cy="36" r="18" {...stroke} />
          <line x1="50" y1="36" x2="64" y2="22" {...stroke} />
          <text x="22" y="22" fill={color} fontSize="8" fontWeight="700">M</text>
          <text x="70" y="22" fill={color} fontSize="8" fontWeight="700">A</text>
          <text x="47" y="66" fill={color} fontSize="8" fontWeight="700">0</text>
        </>
      );
    case 'signalLamp':
      return (
        <>
          <circle cx="50" cy="34" r="20" stroke={color} strokeWidth="4" fill={fill} />
          <circle cx="44" cy="28" r="6" fill="rgba(255,255,255,0.4)" />
        </>
      );
    case 'buzzer':
      return (
        <>
          <path d="M24 28 L42 28 L56 18 L56 54 L42 44 L24 44 Z" {...stroke} />
          <path d="M64 24 C74 28, 74 44, 64 48" {...stroke} />
          <path d="M72 18 C86 24, 86 48, 72 54" {...stroke} />
        </>
      );
    case 'ammeter':
    case 'voltmeter':
      return (
        <>
          <circle cx="50" cy="34" r="22" {...stroke} />
          <line x1="50" y1="34" x2="64" y2="24" {...stroke} />
          <text x="50" y="40" fill={color} fontSize="16" fontWeight="700" textAnchor="middle">
            {type === 'ammeter' ? 'A' : 'V'}
          </text>
        </>
      );
    case 'temperatureSensor':
      return (
        <>
          <line x1="50" y1="14" x2="50" y2="46" {...stroke} />
          <circle cx="50" cy="54" r="10" {...stroke} />
          <line x1="44" y1="24" x2="44" y2="44" {...stroke} />
          <path d="M62 18 C74 20, 78 30, 72 40" {...stroke} />
        </>
      );
    case 'pressureSensor':
      return (
        <>
          <circle cx="46" cy="34" r="16" {...stroke} />
          <line x1="46" y1="34" x2="56" y2="24" {...stroke} />
          <line x1="62" y1="34" x2="86" y2="34" {...stroke} />
          <line x1="14" y1="34" x2="30" y2="34" {...stroke} />
        </>
      );
    case 'levelSensor':
      return (
        <>
          <rect x="28" y="16" width="28" height="40" rx="6" {...stroke} />
          <line x1="34" y1="48" x2="50" y2="48" {...stroke} />
          <line x1="64" y1="36" x2="86" y2="36" {...stroke} />
        </>
      );
    case 'vibrationSensor':
      return (
        <>
          <rect x="26" y="24" width="28" height="24" rx="6" {...stroke} />
          <path d="M60 26 C66 20, 72 20, 78 26" {...stroke} />
          <path d="M60 36 C68 28, 76 28, 84 36" {...stroke} />
          <path d="M60 46 C66 40, 72 40, 78 46" {...stroke} />
        </>
      );
    case 'plc':
      return (
        <>
          <rect x="18" y="14" width="64" height="44" rx="8" {...stroke} />
          <line x1="26" y1="26" x2="38" y2="26" {...stroke} />
          <line x1="26" y1="36" x2="38" y2="36" {...stroke} />
          <line x1="26" y1="46" x2="38" y2="46" {...stroke} />
          <line x1="62" y1="26" x2="74" y2="26" {...stroke} />
          <line x1="62" y1="36" x2="74" y2="36" {...stroke} />
          <line x1="62" y1="46" x2="74" y2="46" {...stroke} />
          <text x="50" y="39" fill={color} fontSize="12" fontWeight="700" textAnchor="middle">PLC</text>
        </>
      );
    case 'motor':
    case 'generator':
      return (
        <>
          <circle cx="50" cy="34" r="22" {...stroke} />
          <text x="50" y="40" fill={color} fontSize="14" fontWeight="700" textAnchor="middle">
            {type === 'motor' ? 'M' : 'G'}
          </text>
          <line x1="12" y1="34" x2="28" y2="34" {...stroke} />
          <line x1="72" y1="34" x2="88" y2="34" {...stroke} />
        </>
      );
    case 'frequencyConverter':
      return (
        <>
          <rect x="18" y="10" width="64" height="52" stroke={color} strokeWidth="3" fill={fill} />
          <line x1="18" y1="62" x2="82" y2="10" {...stroke} />
          <line x1="28" y1="22" x2="40" y2="22" {...stroke} />
          <line x1="28" y1="26" x2="40" y2="26" {...stroke} />
          <text x="57" y="50" fill={color} fontSize="20" fontWeight="500" textAnchor="middle" fontFamily="Georgia, serif">
            f
          </text>
        </>
      );
    case 'mcc':
      return (
        <>
          <rect x="16" y="12" width="68" height="48" rx="8" {...stroke} />
          <line x1="28" y1="22" x2="72" y2="22" {...stroke} />
          <line x1="28" y1="34" x2="72" y2="34" {...stroke} />
          <line x1="28" y1="46" x2="72" y2="46" {...stroke} />
          <text x="50" y="58" fill={color} fontSize="10" fontWeight="700" textAnchor="middle">MCC</text>
        </>
      );
    case 'busbar':
      return (
        <>
          <line x1="8" y1="34" x2="92" y2="34" stroke={color} strokeWidth="8" strokeLinecap="round" />
          <line x1="24" y1="20" x2="24" y2="48" {...stroke} />
          <line x1="50" y1="20" x2="50" y2="48" {...stroke} />
          <line x1="76" y1="20" x2="76" y2="48" {...stroke} />
        </>
      );
    default:
      return <circle cx="50" cy="34" r="18" {...stroke} />;
  }
}

function alarmOrActiveFill(color: string) {
  return `${color}22`;
}

export default function SchemeWidgetPreview({ type, active = true, alarm = false }: Props) {
  const color = strokeForState(active, alarm);

  return (
    <div className={`scheme-widget-preview ${active ? 'is-active' : 'is-idle'} ${alarm ? 'is-alarm' : ''}`}>
      <svg viewBox="0 0 100 72" className="scheme-widget-preview__svg" aria-hidden="true">
        {renderSymbol(type, color, active)}
      </svg>
    </div>
  );
}
