import type { CSSProperties, ReactElement } from 'react';
import type { DiagramDecorationNode } from '../lib/diagramPageConfig';
import './DiagramDecorationPreview.css';

interface Props {
  item: DiagramDecorationNode;
  className?: string;
  widthOverride?: number;
  heightOverride?: number;
}

const DEFAULT_STROKE = '#4f5964';
const DEFAULT_FILL = '#72757b';
const DEFAULT_ACCENT = '#79d66f';
const DEFAULT_TEXT = '#2f4054';

/** Горизонтальный отступ внешней рамки «частотника» (уже стандартных 8px), чтобы подогнать рамку к фактической графике. */
function getFrequencyConverterFrameInsetX(width: number): number {
  return Math.min(14, Math.max(8, Math.floor((width - 32) / 4)));
}

function getStroke(item: DiagramDecorationNode) {
  return item.style?.strokeColor ?? DEFAULT_STROKE;
}

function getFill(item: DiagramDecorationNode) {
  return item.style?.fillColor ?? DEFAULT_FILL;
}

function getAccent(item: DiagramDecorationNode) {
  return item.style?.accentColor ?? DEFAULT_ACCENT;
}

function getTextColor(item: DiagramDecorationNode) {
  return item.style?.textColor ?? DEFAULT_TEXT;
}

function getCornerRadius(item: DiagramDecorationNode, fallback = 12) {
  return item.style?.cornerRadius ?? fallback;
}

/**
 * Окно SVG в координатах макета — как во view (`DiagramDecorationPreview`):
 * всегда полный bbox `0 0 width height`, иначе при ужатом viewBox другой aspect ratio и SVG с `width/height: 100%`
 * даёт letterbox и не совпадает с узлом React Flow (`width*FLOW_SCALE` × `height*FLOW_SCALE`).
 * `motorUnit` — доп. высота под подпись, как во view.
 */
export function getDecorationSvgViewBox(item: DiagramDecorationNode): string {
  switch (item.type) {
    case 'motorUnit':
      return `0 0 ${item.width} ${item.height + 26}`;
    default:
      return `0 0 ${item.width} ${item.height}`;
  }
}

function getTextStyle(item: DiagramDecorationNode): CSSProperties {
  return {
    color: getTextColor(item),
    fontSize: `${item.style?.fontSize ?? 18}px`,
    fontWeight: item.style?.fontWeight ?? 700,
    justifyContent:
      item.data?.align === 'center'
        ? 'center'
        : item.data?.align === 'right'
          ? 'flex-end'
          : 'flex-start',
    textAlign: item.data?.align ?? 'left',
  };
}

function withAlpha(color: string, alpha: string) {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const normalized = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    return `${normalized}${alpha}`;
  }

  return color;
}

function renderTextLabel(item: DiagramDecorationNode) {
  const text = item.data?.text || item.data?.title || 'Label';
  const subtitle = item.data?.subtitle || '';

  return (
    <div className="diagram-decoration-preview__text" style={getTextStyle(item)}>
      <div className="diagram-decoration-preview__text-line">
        {text}
        {subtitle ? <span className="diagram-decoration-preview__text-subtitle">{subtitle}</span> : null}
      </div>
    </div>
  );
}

function renderRegionFrame(item: DiagramDecorationNode) {
  const stroke = getStroke(item);
  const fill = getFill(item);
  const textColor = getTextColor(item);
  const title = item.data?.title || 'Region';
  const subtitle = item.data?.subtitle || '';
  const radius = getCornerRadius(item, 16);

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width={Math.max(0, item.width - 6)}
        height={Math.max(0, item.height - 6)}
        rx={radius}
        ry={radius}
        fill={withAlpha(fill, '12')}
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray={item.style?.dashed === false ? undefined : '6 5'}
      />
      <rect
        x={Math.max(12, item.width - 112)}
        y="10"
        width="100"
        height="22"
        rx="11"
        fill={withAlpha('#eef4fb', 'cc')}
      />
      <text x={item.width - 20} y="25" fill={textColor} fontSize="14" fontWeight="700" textAnchor="end">
        {title}
      </text>
      {subtitle ? (
        <text x={item.width - 20} y="43" fill={withAlpha(textColor, 'bb')} fontSize="11" fontWeight="600" textAnchor="end">
          {subtitle}
        </text>
      ) : null}
    </svg>
  );
}

function renderBusbar(item: DiagramDecorationNode) {
  const stroke = getStroke(item);
  const textColor = getTextColor(item);
  const title = item.data?.title || '';
  const horizontal = (item.data?.orientation ?? 'horizontal') !== 'vertical';
  const segmentColor = withAlpha(stroke, 'ba');

  if (!horizontal) {
    const channelX = item.width * 0.34;
    const channelY = 8;
    const channelWidth = item.width * 0.32;
    const channelHeight = item.height - 16;
    const segmentHeight = Math.max(6, channelHeight * 0.11);
    const segmentPitch = segmentHeight + 6;
    const segmentCount = Math.ceil(channelHeight / segmentPitch) + 1;

    return (
      <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
        <rect x={channelX} y={channelY} width={channelWidth} height={channelHeight} rx="12" fill="none" stroke={stroke} strokeWidth="2.2" />
        <rect x={channelX + 3} y={channelY + 3} width={channelWidth - 6} height={channelHeight - 6} rx="9" fill="none" stroke={withAlpha(stroke, '42')} strokeWidth="0.9" />
        {Array.from({ length: segmentCount }).map((_, index) => (
          <rect
            key={index}
            x={channelX + 4}
            y={channelY + 4 + (index * segmentPitch)}
            width={channelWidth - 8}
            height={segmentHeight}
            rx="5"
            fill={segmentColor}
          />
        ))}
      </svg>
    );
  }

  const channelX = 10;
  const channelY = item.height * 0.3;
  const channelWidth = item.width - 20;
  const channelHeight = item.height * 0.4;
  const segmentWidth = Math.max(8, channelWidth * 0.08);
  const segmentPitch = segmentWidth + 8;
  const segmentCount = Math.ceil(channelWidth / segmentPitch) + 1;

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <rect x={channelX} y={channelY} width={channelWidth} height={channelHeight} rx="12" fill="none" stroke={stroke} strokeWidth="2.2" />
      <rect x={channelX + 3} y={channelY + 3} width={channelWidth - 6} height={channelHeight - 6} rx="9" fill="none" stroke={withAlpha(stroke, '42')} strokeWidth="0.9" />
      {Array.from({ length: segmentCount }).map((_, index) => (
        <rect
          key={index}
          x={channelX + 4 + (index * segmentPitch)}
          y={channelY + 4}
          width={segmentWidth}
          height={channelHeight - 8}
          rx="6"
          fill={segmentColor}
        />
      ))}
      <line x1={channelX} y1={item.height * 0.5} x2="2" y2={item.height * 0.5} stroke={withAlpha(stroke, 'c6')} strokeWidth="2.4" />
      <line x1={item.width - channelX} y1={item.height * 0.5} x2={item.width - 2} y2={item.height * 0.5} stroke={withAlpha(stroke, 'c6')} strokeWidth="2.4" />
      {title ? (
        <text x={item.width / 2} y={Math.max(12, item.height * 0.18)} fill={textColor} fontSize="12" fontWeight="700" textAnchor="middle">
          {title}
        </text>
      ) : null}
    </svg>
  );
}

function renderSwitchgearCell(item: DiagramDecorationNode) {
  const stroke = getStroke(item);
  const fill = getFill(item);
  const textColor = getTextColor(item);
  const title = item.data?.title || 'KRU1 - Cell 3';
  const subtitle = item.data?.subtitle || 'Q2';
  const midY = Math.max(56, item.height * 0.36);

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <rect x="4" y="6" width={item.width - 8} height={item.height - 12} rx="16" fill={withAlpha(fill, 'e4')} stroke={stroke} strokeWidth="2.8" />
      <rect x="10" y="12" width={item.width - 20} height={item.height - 24} rx="12" fill={withAlpha('#f5f8fb', '0e')} stroke={withAlpha(stroke, '3e')} strokeWidth="1" />
      <rect x="4" y="6" width={item.width - 8} height={midY - 6} rx="16" fill={withAlpha('#a3a9b1', 'c8')} />
      <line x1="10" y1={midY} x2={item.width - 10} y2={midY} stroke={withAlpha(stroke, 'bb')} strokeWidth="2" />
      <line x1={item.width / 2} y1="0" x2={item.width / 2} y2={item.height} stroke={withAlpha(stroke, '8c')} strokeWidth="2.4" />
      <circle cx={item.width / 2} cy="18" r="18" fill="none" stroke={withAlpha(stroke, 'c8')} strokeWidth="2.8" />
      <circle cx={item.width / 2} cy="5.5" r="3.2" fill={withAlpha('#f3f5f7', 'ff')} stroke={withAlpha(stroke, '99')} strokeWidth="1.1" />
      <circle cx={item.width / 2} cy="30.5" r="3.2" fill={withAlpha('#f3f5f7', 'ff')} stroke={withAlpha(stroke, '99')} strokeWidth="1.1" />
      <text x={item.width / 2} y={Math.max(60, item.height * 0.32)} fill={textColor} fontSize="18" fontWeight="700" textAnchor="middle" letterSpacing="0.01em">
        {title}
      </text>
      <text x={item.width / 2} y={Math.max(82, item.height * 0.44)} fill={withAlpha(textColor, 'cc')} fontSize="18" fontWeight="700" textAnchor="middle" letterSpacing="0.02em">
        {subtitle}
      </text>
    </svg>
  );
}

function renderPowerCabinet(item: DiagramDecorationNode) {
  const stroke = getStroke(item);
  const fill = getFill(item);
  const textColor = getTextColor(item);
  const title = item.data?.title || 'BP 1';
  const leftLabel = item.data?.leftLabel || 'QF 1\nA';
  const rightLabel = item.data?.rightLabel || 'QF 2\n25 A';
  const bottomLabel = item.data?.bottomLabel || '= 1000 V';

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <rect x="10" y={item.height * 0.2} width={item.width - 20} height={item.height * 0.54} rx="16" fill={withAlpha(fill, 'ea')} stroke={stroke} strokeWidth="2.9" />
      <rect x="16" y={item.height * 0.235} width={item.width - 32} height={item.height * 0.47} rx="13" fill={withAlpha('#f7fafc', '0d')} stroke={withAlpha(stroke, '3f')} strokeWidth="1" />
      <rect x="22" y={item.height * 0.255} width={item.width - 44} height={item.height * 0.07} rx="8" fill={withAlpha('#c6ccd3', '5a')} />
      <line x1={item.width / 2} y1={item.height * 0.2} x2={item.width / 2} y2={item.height * 0.74} stroke={withAlpha(stroke, 'b6')} strokeWidth="2.1" />
      <line x1="24" y1={item.height * 0.325} x2={item.width - 24} y2={item.height * 0.325} stroke={withAlpha(stroke, '46')} strokeWidth="1" />
      <text x={item.width - 26} y={item.height * 0.18} fill={textColor} fontSize="17" fontWeight="700" textAnchor="end">
        {title}
      </text>
      {leftLabel.split('\n').map((line, index) => (
        <text key={`left-${index}`} x={item.width * 0.29} y={(item.height * 0.39) + (index * 16)} fill={textColor} fontSize="14" fontWeight="700" textAnchor="middle">
          {line}
        </text>
      ))}
      {rightLabel.split('\n').map((line, index) => (
        <text key={`right-${index}`} x={item.width * 0.71} y={(item.height * 0.39) + (index * 16)} fill={textColor} fontSize="14" fontWeight="700" textAnchor="middle">
          {line}
        </text>
      ))}
      <circle cx="26" cy={item.height * 0.225} r="2.6" fill={withAlpha('#f4f7fa', 'ff')} />
      <circle cx={item.width - 26} cy={item.height * 0.225} r="2.6" fill={withAlpha('#f4f7fa', 'ff')} />
      <text x={item.width / 2} y={item.height - 10} fill={textColor} fontSize="15" fontWeight="700" textAnchor="middle">
        {bottomLabel}
      </text>
    </svg>
  );
}

function renderDriveCabinet(item: DiagramDecorationNode) {
  const stroke = getStroke(item);
  const fill = getFill(item);
  const textColor = getTextColor(item);
  const title = item.data?.title || 'PCh 1';
  const subtitle = item.data?.subtitle || 'Q5';
  const helperText = item.data?.helperText || 'ShUN 1';

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <text x={item.width / 2} y="18" fill={withAlpha(textColor, 'bb')} fontSize="13" fontWeight="700" textAnchor="middle" letterSpacing="0.02em">
        {helperText}
      </text>
      <rect x="10" y="28" width={item.width - 20} height={item.height - 50} rx="12" fill={withAlpha(fill, 'eb')} stroke={stroke} strokeWidth="2.9" />
      <rect x="16" y="34" width={item.width - 32} height={item.height - 62} rx="9" fill={withAlpha('#f6f9fc', '0c')} stroke={withAlpha(stroke, '40')} strokeWidth="1" />
      <rect x="22" y="40" width={item.width - 44} height="16" rx="7" fill={withAlpha('#c6ccd3', '56')} />
      <line x1={item.width / 2} y1="30" x2={item.width / 2} y2={item.height - 28} stroke={withAlpha(stroke, 'a5')} strokeWidth="1.7" />
      <line x1="22" y1="64" x2={item.width - 22} y2="64" stroke={withAlpha(stroke, '40')} strokeWidth="1" />
      <text x={item.width / 2} y="56" fill={withAlpha('#dfe6ee', 'ee')} fontSize="16" fontWeight="700" textAnchor="middle" letterSpacing="0.03em">
        {subtitle}
      </text>
      <text x={item.width / 2} y="80" fill={withAlpha('#dfe6ee', 'f0')} fontSize="16" fontWeight="700" textAnchor="middle" letterSpacing="0.02em">
        {title}
      </text>
      <rect x={item.width * 0.44} y={item.height * 0.205} width={item.width * 0.045} height={item.height * 0.105} rx="4" fill={withAlpha(getAccent(item), 'd8')} />
    </svg>
  );
}

function renderPowerModuleUnit(item: DiagramDecorationNode) {
  const stroke = getStroke(item);
  const detailStroke = withAlpha(stroke, 'c0');

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <rect x="6" y="8" width={item.width - 12} height={item.height - 16} rx="8" fill="none" stroke={stroke} strokeWidth="2.4" />
      <rect x="11" y="13" width={item.width - 22} height={item.height - 26} rx="5" fill="none" stroke={withAlpha(stroke, '4e')} strokeWidth="0.9" />
      <line x1={item.width * 0.16} y1={item.height * 0.54} x2={item.width * 0.86} y2={item.height * 0.54} stroke={detailStroke} strokeWidth="2.4" strokeLinecap="round" />
      <path d={`M ${item.width * 0.4} ${item.height * 0.24} L ${item.width * 0.66} ${item.height * 0.54} L ${item.width * 0.4} ${item.height * 0.84} Z`} stroke={detailStroke} strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      <line x1={item.width * 0.72} y1={item.height * 0.22} x2={item.width * 0.72} y2={item.height * 0.86} stroke={detailStroke} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function renderFrequencyConverterUnit(item: DiagramDecorationNode) {
  const stroke = getStroke(item);
  const detailStroke = withAlpha(stroke, 'c0');
  const title = item.data?.title || '';
  const ix = getFrequencyConverterFrameInsetX(item.width);
  const iy = 8;
  const outerW = item.width - ix * 2;
  const outerH = item.height - iy * 2;
  const innerMargin = 5;

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <rect x={ix} y={iy} width={outerW} height={outerH} rx="10" fill="none" stroke={stroke} strokeWidth="2.8" />
      <rect
        x={ix + innerMargin}
        y={iy + innerMargin}
        width={item.width - 2 * (ix + innerMargin)}
        height={item.height - 2 * (iy + innerMargin)}
        rx="7"
        fill="none"
        stroke={withAlpha(stroke, '46')}
        strokeWidth="1"
      />
      {title ? (
        <text x={item.width / 2} y="22" fill={withAlpha(getTextColor(item), 'dd')} fontSize="11.5" fontWeight="700" textAnchor="middle">
          {title}
        </text>
      ) : null}
      <line x1={item.width * 0.2} y1={item.height * 0.29} x2={item.width * 0.33} y2={item.height * 0.29} stroke={detailStroke} strokeWidth="2.55" strokeLinecap="round" />
      <line x1={item.width * 0.2} y1={item.height * 0.37} x2={item.width * 0.33} y2={item.height * 0.37} stroke={detailStroke} strokeWidth="2.55" strokeLinecap="round" />
      <line x1={item.width * 0.16} y1={item.height * 0.86} x2={item.width * 0.76} y2={item.height * 0.16} stroke={detailStroke} strokeWidth="2.7" strokeLinecap="round" />
      <text x={item.width * 0.69} y={item.height * 0.72} fill={withAlpha(detailStroke, 'f0')} fontSize="30" fontWeight="500" textAnchor="middle" fontFamily="Georgia, serif">
        f
      </text>
    </svg>
  );
}

function renderSlimModuleUnit(item: DiagramDecorationNode) {
  const stroke = getStroke(item);
  const detailStroke = withAlpha(stroke, 'bc');

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <rect x={item.width * 0.18} y="6" width={item.width * 0.64} height={item.height - 12} rx="5" fill="none" stroke={stroke} strokeWidth="1.5" />
      <rect x={item.width * 0.3} y="10" width={item.width * 0.16} height={item.height - 20} rx="4" fill="none" stroke={detailStroke} strokeWidth="1.5" />
      <rect x={item.width * 0.54} y="10" width={item.width * 0.16} height={item.height - 20} rx="4" fill="none" stroke={detailStroke} strokeWidth="1.5" />
    </svg>
  );
}

function renderRingSwitchUnit(item: DiagramDecorationNode, switchState: 'open' | 'closed' = 'closed') {
  const stroke = getStroke(item);
  const haloStroke = withAlpha(stroke, '36');
  const centerX = item.width / 2;
  const centerY = item.height / 2;
  const radius = item.width * 0.42;
  const topContactY = item.height * 0.18;
  const bottomContactY = item.height * 0.82;
  const centerGap = Math.max(12, item.height * 0.12);
  const topStemEndY = centerY - centerGap;
  const pivotY = centerY + (centerGap * 0.62);
  const armLength = Math.max(18, pivotY - topStemEndY + 1);
  const armAngle = switchState === 'closed' ? 0 : 52;

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <circle cx={centerX} cy={centerY} r={radius + 4} fill="none" stroke={haloStroke} strokeWidth="2" />
      <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke={stroke} strokeWidth="3.2" />
      <line x1={centerX} y1="0" x2={centerX} y2={topStemEndY} stroke={withAlpha(stroke, 'c6')} strokeWidth="3.2" />
      <line x1={centerX} y1={pivotY} x2={centerX} y2={item.height} stroke={withAlpha(stroke, '88')} strokeWidth="2" />
      <g
        style={{
          transform: `translate(${centerX}px, ${pivotY}px) rotate(${armAngle}deg)`,
          transformOrigin: '0 0',
          transition: 'transform 460ms cubic-bezier(0.18, 1.2, 0.32, 1)',
        }}
      >
        <line x1="0" y1="0" x2="0" y2={-armLength} stroke={withAlpha(stroke, 'c6')} strokeWidth="3.2" strokeLinecap="round" />
      </g>
      <circle cx={centerX} cy={topContactY} r="5.2" fill="#ffffff" stroke={withAlpha(stroke, '99')} strokeWidth="1.2" />
      <circle cx={centerX} cy={bottomContactY} r="5.2" fill="#ffffff" stroke={withAlpha(stroke, '99')} strokeWidth="1.2" />
    </svg>
  );
}

function renderMotorUnit(item: DiagramDecorationNode) {
  const stroke = item.style?.strokeColor ?? '#8c7600';
  const haloStroke = withAlpha(stroke, '38');
  const innerStroke = withAlpha(stroke, 'aa');
  const title = item.data?.title || 'MN 1';
  const radius = Math.min(item.width, item.height) * 0.315;
  const centerX = item.width / 2;
  const centerY = item.height / 2;

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <circle cx={centerX} cy={centerY} r={radius + 6} fill="none" stroke={haloStroke} strokeWidth="2.2" />
      <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke={stroke} strokeWidth="4.2" />
      <circle cx={centerX} cy={centerY} r={radius * 0.62} fill="none" stroke={innerStroke} strokeWidth="2.7" />
      <text x={centerX} y={item.height + 18} fill={getTextColor(item)} fontSize="16" fontWeight="700" textAnchor="middle">
        {title}
      </text>
    </svg>
  );
}

function renderThreePhaseTransformer(item: DiagramDecorationNode) {
  const stroke = item.style?.strokeColor ?? '#4ea65b';
  const haloStroke = withAlpha(stroke, '34');
  const textColor = getTextColor(item);
  const title = item.data?.title || 'T2';
  const subtitle = item.data?.subtitle || '2500 kVA\n6,6/0,69 kV';
  const radius = item.width * 0.125;
  const leftX = item.width * 0.38;
  const topX = item.width * 0.5;
  const rightX = item.width * 0.62;
  const topY = item.height * 0.38;
  const sideY = item.height * 0.54;

  return (
    <svg viewBox={getDecorationSvgViewBox(item)} className="diagram-decoration-preview__svg" aria-hidden="true">
      <circle cx={leftX} cy={sideY} r={radius + 3} fill="none" stroke={haloStroke} strokeWidth="1.8" />
      <circle cx={topX} cy={topY} r={radius + 3} fill="none" stroke={haloStroke} strokeWidth="1.8" />
      <circle cx={rightX} cy={sideY} r={radius + 3} fill="none" stroke={haloStroke} strokeWidth="1.8" />
      <circle cx={leftX} cy={sideY} r={radius} fill="none" stroke={stroke} strokeWidth="3.2" />
      <circle cx={topX} cy={topY} r={radius} fill="none" stroke={stroke} strokeWidth="3.2" />
      <circle cx={rightX} cy={sideY} r={radius} fill="none" stroke={stroke} strokeWidth="3.2" />
      <text x={item.width * 0.76} y={item.height * 0.5} fill={textColor} fontSize="17" fontWeight="700">
        {title}
      </text>
      {subtitle.split('\n').map((line, index) => (
        <text key={`${line}-${index}`} x={item.width * 0.76} y={(item.height * 0.62) + (index * 15)} fill={withAlpha(textColor, 'bf')} fontSize="12" fontWeight="600">
          {line}
        </text>
      ))}
    </svg>
  );
}

function renderDecoration(item: DiagramDecorationNode): ReactElement {
  switch (item.type) {
    case 'textLabel':
      return renderTextLabel(item);
    case 'regionFrame':
      return renderRegionFrame(item);
    case 'busbarDecoration':
      return renderBusbar(item);
    case 'switchgearCell':
      return renderSwitchgearCell(item);
    case 'powerCabinet':
      return renderPowerCabinet(item);
    case 'driveCabinet':
      return renderDriveCabinet(item);
    case 'powerModuleUnit':
      return renderPowerModuleUnit(item);
    case 'frequencyConverterUnit':
      return renderFrequencyConverterUnit(item);
    case 'slimModuleUnit':
      return renderSlimModuleUnit(item);
    case 'ringSwitchUnit':
      return renderRingSwitchUnit(item);
    case 'motorUnit':
      return renderMotorUnit(item);
    case 'threePhaseTransformer':
    default:
      return renderThreePhaseTransformer(item);
  }
}

export default function DiagramDecorationPreview({ item, className = '', widthOverride, heightOverride }: Props) {
  return (
    <div
      className={`diagram-decoration-preview ${className}`.trim()}
      style={{
        width: `${widthOverride ?? item.width}px`,
        height: `${heightOverride ?? item.height}px`,
        transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
        zIndex: item.zIndex ?? 0,
      }}
    >
      {renderDecoration(item)}
    </div>
  );
}
