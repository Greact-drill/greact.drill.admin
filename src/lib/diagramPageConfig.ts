export type DiagramDecorationNodeType =
  | 'textLabel'
  | 'regionFrame'
  | 'busbarDecoration'
  | 'switchgearCell'
  | 'powerCabinet'
  | 'driveCabinet'
  | 'powerModuleUnit'
  | 'frequencyConverterUnit'
  | 'slimModuleUnit'
  | 'ringSwitchUnit'
  | 'motorUnit'
  | 'threePhaseTransformer';

export type DiagramDecorationEdgeKind = 'wire' | 'power' | 'signal' | 'alert';
export type DiagramNodeAnchorSide = 'left' | 'right' | 'top' | 'bottom';

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DiagramDecorationStyle {
  strokeColor?: string;
  fillColor?: string;
  accentColor?: string;
  textColor?: string;
  fillOpacity?: number;
  lineWidth?: number;
  dashed?: boolean;
  fontSize?: number;
  fontWeight?: number | string;
  cornerRadius?: number;
}

export interface DiagramDecorationNodeData {
  title?: string;
  subtitle?: string;
  helperText?: string;
  leftLabel?: string;
  rightLabel?: string;
  bottomLabel?: string;
  text?: string;
  align?: 'left' | 'center' | 'right';
  textMode?: 'single' | 'double';
  orientation?: 'horizontal' | 'vertical';
  pattern?: 'solid' | 'sectioned' | 'dashed';
}

export interface DiagramDecorationTagBindings {
  stateTagId?: string;
  alarmTagId?: string;
}

export interface DiagramDecorationNode {
  id: string;
  type: DiagramDecorationNodeType;
  position: DiagramPoint;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  style?: DiagramDecorationStyle;
  data?: DiagramDecorationNodeData;
  bindings?: DiagramDecorationTagBindings;
}

export interface DiagramDecorationEdge {
  id: string;
  source: string;
  target: string;
  sourceSide?: DiagramNodeAnchorSide;
  targetSide?: DiagramNodeAnchorSide;
  kind: DiagramDecorationEdgeKind;
  label?: string;
  animated?: boolean;
  waypoints?: DiagramPoint[];
}

export interface DiagramPageConfig {
  page: string;
  ownerEdgeId: string;
  backgroundUrl?: string;
  backgroundOpacity?: number;
  backgroundFit?: 'contain' | 'cover' | 'stretch';
  viewport?: DiagramViewport | null;
  items: DiagramDecorationNode[];
  edges: DiagramDecorationEdge[];
}

export interface DiagramDecorationDefinition {
  type: DiagramDecorationNodeType;
  label: string;
  description: string;
  category: string;
  width: number;
  height: number;
}

export const DIAGRAM_DECORATION_LIBRARY: DiagramDecorationDefinition[] = [
  { type: 'textLabel', label: 'Текст', description: 'Подпись или технологическая маркировка.', category: 'Текст и аннотации', width: 180, height: 52 },
  { type: 'regionFrame', label: 'Рамка области', description: 'Пунктирная область для объединения элементов.', category: 'Текст и аннотации', width: 420, height: 320 },
  { type: 'busbarDecoration', label: 'Шина', description: 'Секционированная силовая шина.', category: 'Проводники и шины', width: 300, height: 34 },
  { type: 'switchgearCell', label: 'Ячейка КРУ', description: 'Верхняя секция с круговым коммутационным символом.', category: 'Составные шаблоны', width: 240, height: 180 },
  { type: 'powerCabinet', label: 'Силовой шкаф', description: 'Корпус шкафа питания без встроенных модулей.', category: 'Составные шаблоны', width: 236, height: 176 },
  { type: 'driveCabinet', label: 'Шкаф ПЧ', description: 'Вертикальный шкаф привода без встроенного частотника.', category: 'Составные шаблоны', width: 150, height: 214 },
  { type: 'powerModuleUnit', label: 'Силовой модуль', description: 'Отдельный зеленый модуль с треугольником и вертикальной шиной.', category: 'Составные шаблоны', width: 92, height: 62 },
  { type: 'frequencyConverterUnit', label: 'Частотник', description: 'Отдельный частотный преобразователь с диагональю и буквой f.', category: 'Составные шаблоны', width: 106, height: 126 },
  { type: 'slimModuleUnit', label: 'Узкий модуль', description: 'Узкий зеленый вертикальный элемент как на референсе.', category: 'Составные шаблоны', width: 34, height: 72 },
  { type: 'ringSwitchUnit', label: 'Круговой символ', description: 'Круговой коммутационный символ с осью и двумя точками.', category: 'Составные шаблоны', width: 96, height: 96 },
  { type: 'motorUnit', label: 'Двигатель', description: 'Круглый моторный символ с подписью.', category: 'Составные шаблоны', width: 104, height: 104 },
  { type: 'threePhaseTransformer', label: 'Трансформатор', description: 'Трехфазный трансформатор с подписью.', category: 'Составные шаблоны', width: 172, height: 138 },
];

const DECORATION_TYPE_SET = new Set<string>(DIAGRAM_DECORATION_LIBRARY.map((item) => item.type));

export function isDiagramDecorationType(value: string): value is DiagramDecorationNodeType {
  return DECORATION_TYPE_SET.has(value);
}

export function getDiagramDecorationDefinition(type: DiagramDecorationNodeType): DiagramDecorationDefinition {
  return DIAGRAM_DECORATION_LIBRARY.find((item) => item.type === type) ?? DIAGRAM_DECORATION_LIBRARY[0];
}

export function getDiagramPageOwnerEdgeId(page: string): string {
  if (typeof page !== 'string' || !page) {
    return '';
  }
  if (page.startsWith('MAIN_')) {
    return page.slice('MAIN_'.length);
  }
  if (page.startsWith('BYPASS_')) {
    return page.slice('BYPASS_'.length);
  }
  if (page.startsWith('ACCIDENT_')) {
    return page.slice('ACCIDENT_'.length);
  }
  return page;
}

export function getDiagramPageCustomizationKey(page: string): string {
  return `diagramPageConfig:${page}`;
}

export function createDefaultDiagramDecorationNode(type: DiagramDecorationNodeType, id: string, position: DiagramPoint): DiagramDecorationNode {
  const definition = getDiagramDecorationDefinition(type);

  switch (type) {
    case 'textLabel':
      return { id, type, position, width: definition.width, height: definition.height, data: { text: 'Новая подпись', subtitle: '', align: 'left' }, style: { textColor: '#203040', fontSize: 22, fontWeight: 700 } };
    case 'regionFrame':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: 'Новая область', subtitle: '' }, style: { strokeColor: 'rgba(82, 93, 108, 0.7)', fillColor: 'rgba(255,255,255,0.08)', dashed: true, cornerRadius: 16, lineWidth: 2 } };
    case 'busbarDecoration':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: 'ШУН', orientation: 'horizontal', pattern: 'sectioned' }, style: { strokeColor: '#1b222b', accentColor: '#6fd777', lineWidth: 8 } };
    case 'switchgearCell':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: 'КРУ1 - ЯЧ 3', subtitle: 'Q2' }, style: { fillColor: '#8c8f95', strokeColor: '#555b62', textColor: '#304055', cornerRadius: 14 } };
    case 'powerCabinet':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: 'БП 1', leftLabel: 'QF 1\nA', rightLabel: 'QF 2\n25 A', bottomLabel: '= 1000 В' }, style: { fillColor: '#66686d', strokeColor: '#45484f', textColor: '#1d2630', accentColor: '#79d66f', cornerRadius: 18 } };
    case 'driveCabinet':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: 'ПЧ 1', subtitle: 'Q5', helperText: 'ШУН 1' }, style: { fillColor: '#707378', strokeColor: '#4d5158', textColor: '#dfe6ee', accentColor: '#78d16f', cornerRadius: 12 } };
    case 'powerModuleUnit':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: 'QF', subtitle: 'DK' }, style: { fillColor: 'transparent', strokeColor: '#767d86', textColor: '#44556b', accentColor: '#5c6a78', cornerRadius: 10 } };
    case 'frequencyConverterUnit':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: '', subtitle: '' }, style: { fillColor: 'transparent', strokeColor: '#767d86', textColor: '#44556b', accentColor: '#5c6a78', cornerRadius: 12 } };
    case 'slimModuleUnit':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: '' }, style: { fillColor: 'transparent', strokeColor: '#767d86', accentColor: '#5c6a78', cornerRadius: 8 } };
    case 'ringSwitchUnit':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: '' }, style: { strokeColor: '#4b4f55', fillColor: '#9a9a9a', accentColor: '#ffffff', textColor: '#2c3945' } };
    case 'motorUnit':
      return { id, type, position, width: definition.width, height: definition.height, data: { title: 'МН 1' }, style: { fillColor: '#ffd500', strokeColor: '#8f7a00', textColor: '#354255' } };
    case 'threePhaseTransformer':
    default:
      return { id, type: 'threePhaseTransformer', position, width: getDiagramDecorationDefinition('threePhaseTransformer').width, height: getDiagramDecorationDefinition('threePhaseTransformer').height, data: { title: 'T2', subtitle: '2500 кВА\n6,6/0,69 кВ' }, style: { fillColor: 'transparent', strokeColor: '#767d86', textColor: '#44556b' } };
  }
}

export function createEmptyDiagramPageConfig(page: string): DiagramPageConfig {
  return { page, ownerEdgeId: getDiagramPageOwnerEdgeId(page), backgroundUrl: '', backgroundOpacity: 0.22, backgroundFit: 'contain', viewport: null, items: [], edges: [] };
}

function normalizePoint(input: unknown): DiagramPoint | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const candidate = input as Partial<DiagramPoint>;
  if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') {
    return null;
  }
  return { x: candidate.x, y: candidate.y };
}

export function normalizeDiagramPageConfig(page: string, raw: unknown): DiagramPageConfig {
  const fallback = createEmptyDiagramPageConfig(page);
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const candidate = raw as Partial<DiagramPageConfig> & { regions?: Array<Record<string, unknown>> };

  const items: DiagramDecorationNode[] = Array.isArray(candidate.items)
    ? candidate.items
        .map((item): DiagramDecorationNode | null => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const record = item as Partial<DiagramDecorationNode>;
          if (!record.id || !record.type || !isDiagramDecorationType(record.type)) {
            return null;
          }
          const definition = getDiagramDecorationDefinition(record.type);
          const position = normalizePoint(record.position) ?? { x: 120, y: 120 };
          return {
            id: String(record.id),
            type: record.type,
            position,
            width: typeof record.width === 'number' ? Math.max(24, record.width) : definition.width,
            height: typeof record.height === 'number' ? Math.max(24, record.height) : definition.height,
            rotation: typeof record.rotation === 'number' ? record.rotation : 0,
            zIndex: typeof record.zIndex === 'number' ? record.zIndex : 0,
            style: record.style ?? {},
            data: record.data ?? {},
            bindings: record.bindings && typeof record.bindings === 'object'
              ? {
                  stateTagId: typeof record.bindings.stateTagId === 'string' ? record.bindings.stateTagId : undefined,
                  alarmTagId: typeof record.bindings.alarmTagId === 'string' ? record.bindings.alarmTagId : undefined,
                }
              : undefined,
          };
        })
        .filter((item): item is DiagramDecorationNode => item !== null)
    : [];

  const legacyRegionItems: DiagramDecorationNode[] = items.length === 0 && Array.isArray(candidate.regions)
    ? candidate.regions.map((region, index): DiagramDecorationNode => ({
        id: `legacy-region-${index}`,
        type: 'regionFrame',
        position: normalizePoint(region.position) ?? { x: 120 + (index * 24), y: 120 + (index * 24) },
        width: typeof region.width === 'number' ? region.width : 360,
        height: typeof region.height === 'number' ? region.height : 260,
        data: { title: typeof region.label === 'string' ? region.label : 'Область', subtitle: typeof region.description === 'string' ? region.description : '' },
        style: { dashed: true, strokeColor: 'rgba(82, 93, 108, 0.7)', fillColor: 'rgba(255,255,255,0.08)' },
      }))
    : [];

  const edges: DiagramDecorationEdge[] = Array.isArray(candidate.edges)
    ? candidate.edges
        .map((edge): DiagramDecorationEdge | null => {
          if (!edge || typeof edge !== 'object') {
            return null;
          }
          const record = edge as Partial<DiagramDecorationEdge>;
          if (!record.id || !record.source || !record.target) {
            return null;
          }
          return {
            id: String(record.id),
            source: String(record.source),
            target: String(record.target),
            sourceSide: record.sourceSide,
            targetSide: record.targetSide,
            kind: record.kind ?? 'wire',
            label: typeof record.label === 'string' ? record.label : '',
            animated: Boolean(record.animated),
            waypoints: Array.isArray(record.waypoints) ? record.waypoints.map((point) => normalizePoint(point)).filter((point): point is DiagramPoint => point !== null) : [],
          };
        })
        .filter((edge): edge is DiagramDecorationEdge => edge !== null)
    : [];

  const viewport = candidate.viewport && typeof candidate.viewport === 'object' ? candidate.viewport as Partial<DiagramViewport> : null;

  return {
    page,
    ownerEdgeId: getDiagramPageOwnerEdgeId(page),
    backgroundUrl: typeof candidate.backgroundUrl === 'string' ? candidate.backgroundUrl : '',
    backgroundOpacity: typeof candidate.backgroundOpacity === 'number' ? candidate.backgroundOpacity : 0.22,
    backgroundFit: candidate.backgroundFit === 'cover' || candidate.backgroundFit === 'stretch' ? candidate.backgroundFit : 'contain',
    viewport: viewport && typeof viewport.x === 'number' && typeof viewport.y === 'number' && typeof viewport.zoom === 'number' ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom } : null,
    items: items.length ? items : legacyRegionItems,
    edges,
  };
}

export function serializeDiagramPageConfig(config: DiagramPageConfig) {
  return {
    page: config.page,
    backgroundUrl: config.backgroundUrl || '',
    backgroundOpacity: config.backgroundOpacity ?? 0.22,
    backgroundFit: config.backgroundFit ?? 'contain',
    viewport: config.viewport ?? null,
    items: config.items,
    edges: config.edges,
  };
}
