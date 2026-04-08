import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import {
  createTagCustomization,
  deleteTagCustomization,
  getAllWidgetConfigs,
  getTagsForAdmin,
  type Edge,
  type Tag,
} from '../api/admin';
import {
  getSchemeWidgetDefinition,
  isSchemeWidgetType,
  SCHEME_WIDGET_LIBRARY,
  type SchemeWidgetType,
} from '../lib/schemeWidgets';
import { getErrorMessage } from '../utils/errorUtils';
import { getFilteredAndSortedTags, sortTagsByName } from '../utils/tagUtils';
import EdgePathDisplay from './EdgePathDisplay';
import EdgeTreeSelector from './EdgeTreeSelector';
import SchemeWidgetPreview from './SchemeWidgetPreview';
import './DiagramWidgetsPage.css';

interface DiagramWidgetConfig {
  page: string;
  widgetType: SchemeWidgetType;
  position: { x: number; y: number };
  customLabel?: string;
  displayType?: 'widget' | 'compact' | 'card';
  connections?: DiagramConnection[];
}

interface DiagramLayoutItem extends DiagramWidgetConfig {
  id: string;
  edge_id: string;
  tag_id: string;
}

type DiagramConnectionKind = 'power' | 'signal' | 'alert';

interface DiagramConnection {
  targetTagId: string;
  kind: DiagramConnectionKind;
}

type AlignDirection = 'horizontal' | 'vertical';

const CONNECTION_KIND_OPTIONS: Array<{ value: DiagramConnectionKind; label: string }> = [
  { value: 'power', label: 'Силовая' },
  { value: 'signal', label: 'Сигнальная' },
  { value: 'alert', label: 'Аварийная' },
];

interface Props {
  title: string;
}

const CANVAS_LIMITS = {
  width: 2200,
  height: 1200,
};

const ADMIN_PREVIEW_SCALE = 0.82;
const SNAP_THRESHOLD = 14;

function clampWidgetPosition(position: { x: number; y: number }, widgetType: SchemeWidgetType) {
  const definition = getSchemeWidgetDefinition(widgetType);

  return {
    x: Math.max(16, Math.min(Math.round(position.x), CANVAS_LIMITS.width - definition.width - 16)),
    y: Math.max(16, Math.min(Math.round(position.y), CANVAS_LIMITS.height - definition.height - 16)),
  };
}

function getAdminPreviewDimensions(widgetType: SchemeWidgetType) {
  const definition = getSchemeWidgetDefinition(widgetType);

  return {
    width: Math.round(definition.width * ADMIN_PREVIEW_SCALE),
    height: Math.round(definition.height * ADMIN_PREVIEW_SCALE),
  };
}

function getScaledCanvasPosition(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x * ADMIN_PREVIEW_SCALE),
    y: Math.round(position.y * ADMIN_PREVIEW_SCALE),
  };
}

function snapToReference(value: number, candidates: number[]) {
  let best = value;
  let bestDistance = SNAP_THRESHOLD + 1;

  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });

  return bestDistance <= SNAP_THRESHOLD ? best : value;
}

function applySmartSnap(position: { x: number; y: number }, moved: DiagramLayoutItem, layouts: DiagramLayoutItem[]) {
  const movedDefinition = getSchemeWidgetDefinition(moved.widgetType);
  const otherWidgets = layouts.filter((item) => item.id !== moved.id && item.page === moved.page && item.edge_id === moved.edge_id);

  const snappedX = snapToReference(
    position.x,
    otherWidgets.flatMap((item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      return [
        item.position.x,
        item.position.x + (definition.width / 2) - (movedDefinition.width / 2),
        item.position.x + definition.width - movedDefinition.width,
      ];
    })
  );

  const snappedY = snapToReference(
    position.y,
    otherWidgets.flatMap((item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      return [
        item.position.y,
        item.position.y + (definition.height / 2) - (movedDefinition.height / 2),
        item.position.y + definition.height - movedDefinition.height,
      ];
    })
  );

  return { x: snappedX, y: snappedY };
}

const ZOOM_OPTIONS = [
  { label: '55%', value: 0.55 },
  { label: '65%', value: 0.65 },
  { label: '70%', value: 0.7 },
  { label: '85%', value: 0.85 },
  { label: '100%', value: 1 },
];

const getAvailablePages = (selectedEdge: string, edgePath: Edge[]): Array<{ label: string; value: string }> => {
  if (!selectedEdge) {
    return [];
  }

  const pages: Array<{ label: string; value: string }> = [];

  if (edgePath.length > 0) {
    const rootEdge = edgePath[0];
    pages.push({
      label: `Главная страница (${rootEdge.name})`,
      value: `MAIN_${rootEdge.id}`,
    });
  }

  pages.push({
    label: `Страница оборудования (${edgePath[edgePath.length - 1]?.name || selectedEdge})`,
    value: selectedEdge,
  });

  if (edgePath.length > 0) {
    const rootEdge = edgePath[0];
    pages.push(
      { label: `Состояние байпасов (${rootEdge.name})`, value: `BYPASS_${rootEdge.id}` },
      { label: `Аварии приводов (${rootEdge.name})`, value: `ACCIDENT_${rootEdge.id}` }
    );
  }

  edgePath.forEach((edge, index) => {
    if (index < edgePath.length - 1) {
      pages.push({
        label: `Родительская: ${edge.name}`,
        value: edge.id,
      });
    }
  });

  return pages;
};

function getWidgetCenter(item: DiagramLayoutItem) {
  const definition = getAdminPreviewDimensions(item.widgetType);
  const position = getScaledCanvasPosition(item.position);
  return {
    x: position.x + (definition.width / 2),
    y: position.y + (definition.height / 2),
  };
}

type AnchorSide = 'left' | 'right' | 'top' | 'bottom';

function getWidgetAnchor(item: DiagramLayoutItem, target: DiagramLayoutItem) {
  const definition = getAdminPreviewDimensions(item.widgetType);
  const position = getScaledCanvasPosition(item.position);
  const sourceCenter = getWidgetCenter(item);
  const targetCenter = getWidgetCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? position.x + definition.width : position.x,
      y: sourceCenter.y,
      side: (dx >= 0 ? 'right' : 'left') as AnchorSide,
    };
  }

  return {
    x: sourceCenter.x,
    y: dy >= 0 ? position.y + definition.height : position.y,
    side: (dy >= 0 ? 'bottom' : 'top') as AnchorSide,
  };
}

function getAnchorLead(anchor: { x: number; y: number; side: AnchorSide }, offset = 24) {
  switch (anchor.side) {
    case 'left':
      return { x: anchor.x - offset, y: anchor.y };
    case 'right':
      return { x: anchor.x + offset, y: anchor.y };
    case 'top':
      return { x: anchor.x, y: anchor.y - offset };
    case 'bottom':
      return { x: anchor.x, y: anchor.y + offset };
    default:
      return { x: anchor.x, y: anchor.y };
  }
}

function getOrthogonalLinkPath(
  source: { x: number; y: number; side: AnchorSide },
  target: { x: number; y: number; side: AnchorSide }
) {
  const sourceLead = getAnchorLead(source);
  const targetLead = getAnchorLead(target);

  if ((source.side === 'left' || source.side === 'right') && (target.side === 'left' || target.side === 'right')) {
    const midX = sourceLead.x + ((targetLead.x - sourceLead.x) / 2);
    return [
      `M ${source.x} ${source.y}`,
      `L ${sourceLead.x} ${sourceLead.y}`,
      `L ${midX} ${sourceLead.y}`,
      `L ${midX} ${targetLead.y}`,
      `L ${targetLead.x} ${targetLead.y}`,
      `L ${target.x} ${target.y}`,
    ].join(' ');
  }

  if ((source.side === 'top' || source.side === 'bottom') && (target.side === 'top' || target.side === 'bottom')) {
    const midY = sourceLead.y + ((targetLead.y - sourceLead.y) / 2);
    return [
      `M ${source.x} ${source.y}`,
      `L ${sourceLead.x} ${sourceLead.y}`,
      `L ${sourceLead.x} ${midY}`,
      `L ${targetLead.x} ${midY}`,
      `L ${targetLead.x} ${targetLead.y}`,
      `L ${target.x} ${target.y}`,
    ].join(' ');
  }

  return [
    `M ${source.x} ${source.y}`,
    `L ${sourceLead.x} ${sourceLead.y}`,
    `L ${sourceLead.x} ${targetLead.y}`,
    `L ${targetLead.x} ${targetLead.y}`,
    `L ${target.x} ${target.y}`,
  ].join(' ');
}

const DiagramDraggableWidget: React.FC<{
  item: DiagramLayoutItem;
  tagName: string;
  hasAlarm?: boolean;
  onEdit: (item: DiagramLayoutItem) => void;
  onDelete: (id: string) => void;
}> = ({ item, tagName, hasAlarm = false, onEdit, onDelete }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'diagram-widget',
    item: { id: item.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const definition = getAdminPreviewDimensions(item.widgetType);
  const position = getScaledCanvasPosition(item.position);
  const label = tagName;

  return (
    <div
      ref={drag as never}
      className={`diagram-admin-canvas-widget ${isDragging ? 'is-dragging' : ''} ${hasAlarm ? 'is-alarm' : ''}`}
      style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${definition.width}px`, height: `${definition.height}px` }}
      onDoubleClick={() => onEdit(item)}
      title={label}
    >
      <div className="diagram-admin-canvas-widget__symbol">
        <SchemeWidgetPreview type={item.widgetType} active={!hasAlarm} alarm={hasAlarm} />
      </div>
      <div className="diagram-admin-canvas-widget__meta">
        <strong>{label}</strong>
        <span>{definition.label}</span>
      </div>
      <div className="diagram-admin-canvas-widget__actions">
        <Button icon="pi pi-pencil" text rounded size="small" onClick={() => onEdit(item)} />
        <Button icon="pi pi-trash" text rounded severity="danger" size="small" onClick={() => onDelete(item.id)} />
      </div>
    </div>
  );
};

const DiagramDropZone: React.FC<{
  selectedPage: string;
  selectedPageName: string;
  widgets: DiagramLayoutItem[];
  zoom: number;
  children: React.ReactNode;
  onDrop: (item: { id: string }, position: { x: number; y: number }) => void;
}> = ({ selectedPage, selectedPageName, widgets, zoom, children, onDrop }) => {
  const surfaceRef = useRef<HTMLDivElement>(null);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'diagram-widget',
    drop: (item: { id: string }, monitor) => {
      const pointer = monitor.getClientOffset();
      const surface = surfaceRef.current;
      const bounds = surface?.getBoundingClientRect();
      if (!pointer || !surface || !bounds) {
        return;
      }

      onDrop(item, {
        x: ((pointer.x - bounds.left + surface.scrollLeft) / zoom) / ADMIN_PREVIEW_SCALE,
        y: ((pointer.y - bounds.top + surface.scrollTop) / zoom) / ADMIN_PREVIEW_SCALE,
      });
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  drop(surfaceRef);

  const widgetMap = new Map(widgets.map((widget) => [widget.tag_id, widget]));
  const links = widgets.flatMap((widget) =>
    (widget.connections ?? [])
      .map((connection) => {
        const targetTagId = connection.targetTagId;
        const target = widgetMap.get(targetTagId);
        if (!target) {
          return null;
        }

        const sourceAnchor = getWidgetAnchor(widget, target);
        const targetAnchor = getWidgetAnchor(target, widget);

        return {
          id: `${widget.id}-${targetTagId}`,
          x1: sourceAnchor.x,
          y1: sourceAnchor.y,
          x2: targetAnchor.x,
          y2: targetAnchor.y,
          path: getOrthogonalLinkPath(sourceAnchor, targetAnchor),
          kind: connection.kind,
        };
      })
      .filter((item): item is { id: string; x1: number; y1: number; x2: number; y2: number; path: string; kind: DiagramConnectionKind } => item !== null)
  );

  return (
    <div className={`diagram-admin-canvas ${isOver ? 'is-over' : ''}`} data-page={selectedPage}>
      <div className="diagram-admin-canvas__header">
        <div>
          <h3>{selectedPageName}</h3>
          <p>Размещайте элементы drag & drop, открывайте свойства двойным кликом и отмечайте связи между узлами схемы.</p>
        </div>
        <div className="diagram-admin-canvas__badge">{selectedPage}</div>
      </div>
      <div ref={surfaceRef} className="diagram-admin-canvas__surface">
        <div
          className="diagram-admin-canvas__workspace-shell"
          style={{ width: `${CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE * zoom}px`, height: `${CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE * zoom}px` }}
        >
          <div
            className="diagram-admin-canvas__workspace"
            style={{
              width: `${CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE}px`,
              height: `${CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE}px`,
              transform: `scale(${zoom})`,
            }}
          >
            <div className="diagram-admin-canvas__grid" aria-hidden="true" />
            <svg
              className="diagram-admin-canvas__links"
              width={CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE}
              height={CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE}
              viewBox={`0 0 ${CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE} ${CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE}`}
              aria-hidden="true"
            >
              {links.map((link) => (
                <g key={link.id} className={`diagram-admin-canvas__link-group diagram-admin-canvas__link-group--${link.kind}`}>
                  <path d={link.path} className="diagram-admin-canvas__link" />
                  <circle cx={link.x2} cy={link.y2} r="4" className="diagram-admin-canvas__link-end" />
                </g>
              ))}
            </svg>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

const DiagramWidgetForm: React.FC<{
  item: DiagramLayoutItem | null;
  tags: Tag[];
  pages: Array<{ label: string; value: string }>;
  pageWidgets: DiagramLayoutItem[];
  tagNames: Map<string, string>;
  onSave: (item: DiagramLayoutItem) => void;
  onCancel: () => void;
}> = ({ item, tags, pages, pageWidgets, tagNames, onSave, onCancel }) => {
  const [formData, setFormData] = useState<DiagramLayoutItem | null>(item);
  const [error, setError] = useState('');

  useEffect(() => {
    setFormData(item);
    setError('');
  }, [item]);

  if (!formData) {
    return null;
  }

  const definition = getSchemeWidgetDefinition(formData.widgetType);
  const connectionCandidates = pageWidgets.filter((widget) => widget.id !== formData.id && widget.page === formData.page);

  const updatePosition = (axis: 'x' | 'y', value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) ? parsed : 16;
    const nextPosition = clampWidgetPosition(
      {
        ...formData.position,
        [axis]: safeValue,
      },
      formData.widgetType
    );

    setFormData({ ...formData, position: nextPosition });
  };

  const toggleConnection = (tagId: string) => {
    const current = [...(formData.connections ?? [])];
    const existingIndex = current.findIndex((item) => item.targetTagId === tagId);

    if (existingIndex >= 0) {
      current.splice(existingIndex, 1);
    } else {
      current.push({ targetTagId: tagId, kind: 'signal' });
    }

    setFormData({ ...formData, connections: current });
  };

  const updateConnectionKind = (tagId: string, kind: DiagramConnectionKind) => {
    setFormData({
      ...formData,
      connections: (formData.connections ?? []).map((item) =>
        item.targetTagId === tagId ? { ...item, kind } : item
      ),
    });
  };

  const handleSave = () => {
    if (!formData.tag_id || !formData.page || !formData.widgetType) {
      setError('Заполните обязательные поля: тег, страница и тип элемента.');
      return;
    }

    onSave({
      ...formData,
      position: clampWidgetPosition(formData.position, formData.widgetType),
      displayType: 'widget',
      connections: (formData.connections ?? []).filter((item) => Boolean(item.targetTagId)),
    });
  };

  return (
    <div className="diagram-widget-form">
      {error ? <Message severity="error" text={error} className="mb-3" /> : null}

      <div className="diagram-widget-form__preview">
        <SchemeWidgetPreview type={formData.widgetType} active />
        <div>
          <strong>{definition.label}</strong>
          <p>{definition.description}</p>
        </div>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-tag" className="font-semibold mb-2 block">Тег</label>
        <select
          id="diagram-widget-tag"
          value={formData.tag_id}
          onChange={(event) => setFormData({ ...formData, tag_id: event.target.value })}
          className="p-dropdown w-full"
        >
          <option value="">Выберите тег</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name} ({tag.id})
            </option>
          ))}
        </select>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-page" className="font-semibold mb-2 block">Страница размещения</label>
        <select
          id="diagram-widget-page"
          value={formData.page}
          onChange={(event) => setFormData({ ...formData, page: event.target.value, connections: [] })}
          className="p-dropdown w-full"
        >
          {pages.map((page) => (
            <option key={page.value} value={page.value}>
              {page.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-type" className="font-semibold mb-2 block">Тип элемента</label>
        <select
          id="diagram-widget-type"
          value={formData.widgetType}
          onChange={(event) => {
            const widgetType = event.target.value as SchemeWidgetType;
            setFormData({
              ...formData,
              widgetType,
              position: clampWidgetPosition(formData.position, widgetType),
            });
          }}
          className="p-dropdown w-full"
        >
          {SCHEME_WIDGET_LIBRARY.map((type) => (
            <option key={type.type} value={type.type}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field mt-3">
        <label htmlFor="diagram-widget-label" className="font-semibold mb-2 block">Подпись</label>
        <InputText
          id="diagram-widget-label"
          value={formData.customLabel || ''}
          onChange={(event) => setFormData({ ...formData, customLabel: event.target.value })}
          placeholder="Например: Пускатель насоса"
        />
      </div>

      <div className="field mt-3">
        <label className="font-semibold mb-2 block">Связи с другими элементами страницы</label>
        <div className="diagram-widget-form__connection-help">
          <div className="diagram-widget-form__connection-help-item diagram-widget-form__connection-help-item--power">
            <strong>Силовая</strong>
            <span>Показывает линию питания или передачу мощности между узлами: двигатель, насос, привод, шкаф питания.</span>
          </div>
          <div className="diagram-widget-form__connection-help-item diagram-widget-form__connection-help-item--signal">
            <strong>Сигнальная</strong>
            <span>Показывает управляющий или информационный обмен: датчик, кнопка, контроллер, дискретный или аналоговый сигнал.</span>
          </div>
          <div className="diagram-widget-form__connection-help-item diagram-widget-form__connection-help-item--alert">
            <strong>Аварийная</strong>
            <span>Используется для аварийных связей и защит: блокировка, тревога, отказ, цепь аварийного останова.</span>
          </div>
        </div>
        {connectionCandidates.length ? (
          <div className="diagram-widget-form__connections">
            {connectionCandidates.map((widget) => (
              <label key={widget.id} className="diagram-widget-form__connection-item">
                <input
                  type="checkbox"
                  checked={(formData.connections ?? []).some((item) => item.targetTagId === widget.tag_id)}
                  onChange={() => toggleConnection(widget.tag_id)}
                />
                <SchemeWidgetPreview type={widget.widgetType} active={false} />
                <div className="diagram-widget-form__connection-meta">
                  <strong>{widget.customLabel || tagNames.get(widget.tag_id) || widget.tag_id}</strong>
                  <span>{getSchemeWidgetDefinition(widget.widgetType).label}</span>
                </div>
                <select
                  className="diagram-widget-form__connection-kind"
                  value={(formData.connections ?? []).find((item) => item.targetTagId === widget.tag_id)?.kind ?? 'signal'}
                  onChange={(event) => updateConnectionKind(widget.tag_id, event.target.value as DiagramConnectionKind)}
                  disabled={!(formData.connections ?? []).some((item) => item.targetTagId === widget.tag_id)}
                >
                  {CONNECTION_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : (
          <p className="diagram-admin-muted">На этой странице пока нет других элементов для связи.</p>
        )}
      </div>

      <div className="field mt-3">
        <label className="font-semibold mb-2 block">Позиция</label>
        <div className="diagram-widget-form__position">
          <span>X: {Math.round(formData.position.x)}</span>
          <span>Y: {Math.round(formData.position.y)}</span>
          <span>{definition.width}×{definition.height}</span>
        </div>
      </div>

      <div className="field mt-3">
        <label className="font-semibold mb-2 block">Точное позиционирование</label>
        <div className="diagram-widget-form__position-controls">
          <div className="diagram-widget-form__position">
            <label className="diagram-widget-form__position-field">
              <span>X</span>
              <input
                type="number"
                step="1"
                min="16"
                max={CANVAS_LIMITS.width - definition.width - 16}
                value={Math.round(formData.position.x)}
                onChange={(event) => updatePosition('x', event.target.value)}
                className="p-inputtext"
              />
            </label>
            <label className="diagram-widget-form__position-field">
              <span>Y</span>
              <input
                type="number"
                step="1"
                min="16"
                max={CANVAS_LIMITS.height - definition.height - 16}
                value={Math.round(formData.position.y)}
                onChange={(event) => updatePosition('y', event.target.value)}
                className="p-inputtext"
              />
            </label>
            <span className="diagram-widget-form__position-size">{definition.width}x{definition.height}</span>
          </div>
        </div>
      </div>

      <div className="form-actions mt-4">
        <Button label="Сохранить" icon="pi pi-check" onClick={handleSave} />
        <Button label="Отмена" icon="pi pi-times" severity="secondary" onClick={onCancel} />
      </div>
    </div>
  );
};

export default function DiagramWidgetsPage({ title }: Props) {
  const queryClient = useQueryClient();
  const [layouts, setLayouts] = useState<DiagramLayoutItem[]>([]);
  const [selectedEdge, setSelectedEdge] = useState('');
  const [selectedEdgePath, setSelectedEdgePath] = useState<Edge[]>([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [editingItem, setEditingItem] = useState<DiagramLayoutItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [zoom, setZoom] = useState(0.7);

  const layoutsRef = useRef<DiagramLayoutItem[]>([]);

  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: getTagsForAdmin,
  });

  const { data: customizations } = useQuery({
    queryKey: ['diagram-widget-customizations'],
    queryFn: getAllWidgetConfigs,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!customizations) {
      return;
    }

    const nextLayouts: DiagramLayoutItem[] = [];

    customizations.forEach((customization: any) => {
      if (!customization?.edge_id || !customization?.tag_id || !customization?.config) {
        return;
      }

      try {
        const config = typeof customization.config === 'string'
          ? JSON.parse(customization.config)
          : customization.config;

        if (!isSchemeWidgetType(config.widgetType)) {
          return;
        }

        nextLayouts.push({
          id: `${customization.edge_id}-${customization.tag_id}`,
          edge_id: customization.edge_id,
          tag_id: customization.tag_id,
          page: config.page,
          widgetType: config.widgetType,
          position: config.position ?? { x: 60, y: 60 },
          customLabel: config.customLabel,
          displayType: config.displayType,
          connections: Array.isArray(config.connections)
            ? config.connections
                .map((item: string | DiagramConnection) =>
                  typeof item === 'string'
                    ? { targetTagId: item, kind: 'signal' as DiagramConnectionKind }
                    : item?.targetTagId
                      ? { targetTagId: item.targetTagId, kind: item.kind ?? 'signal' }
                      : null
                )
                .filter((item): item is DiagramConnection => item !== null)
            : [],
        });
      } catch (error) {
        console.error('Не удалось прочитать конфигурацию схемного элемента', error);
      }
    });

    setLayouts(nextLayouts);
    layoutsRef.current = nextLayouts;
  }, [customizations]);

  const sortedTags = useMemo(() => sortTagsByName(tags || []), [tags]);
  const filteredTags = useMemo(() => getFilteredAndSortedTags(sortedTags, selectedEdge), [sortedTags, selectedEdge]);
  const tagNames = useMemo(() => new Map(sortedTags.map((tag) => [tag.id, tag.name])), [sortedTags]);
  const availablePages = useMemo(() => getAvailablePages(selectedEdge, selectedEdgePath), [selectedEdge, selectedEdgePath]);

  useEffect(() => {
    if (!selectedEdge || !availablePages.length) {
      setSelectedPage('');
      return;
    }

    setSelectedPage((current) => {
      if (current && availablePages.some((page) => page.value === current)) {
        return current;
      }
      return selectedEdge;
    });
  }, [selectedEdge, availablePages]);

  const saveMutation = useMutation({
    mutationFn: async (item: DiagramLayoutItem) => {
      try {
        await deleteTagCustomization(item.edge_id, item.tag_id, 'widgetConfig');
      } catch {
        // ignore missing record
      }

      const { id, edge_id, tag_id, ...config } = item;
      return createTagCustomization({
        edge_id,
        tag_id,
        key: 'widgetConfig',
        value: JSON.stringify(config),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagram-widget-customizations'] });
    },
  });

  const allPageLayouts = useMemo(() => {
    return layouts.filter((item) => item.edge_id === selectedEdge && item.page === selectedPage);
  }, [layouts, selectedEdge, selectedPage]);

  const pageLayouts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return allPageLayouts
      .filter((item) => {
        if (!normalizedSearch) {
          return true;
        }

        const tagName = tagNames.get(item.tag_id)?.toLowerCase() || '';
        const label = item.customLabel?.toLowerCase() || '';
        const widgetName = getSchemeWidgetDefinition(item.widgetType).label.toLowerCase();
        return tagName.includes(normalizedSearch) || label.includes(normalizedSearch) || widgetName.includes(normalizedSearch);
      });
  }, [allPageLayouts, search, tagNames]);

  const selectedPageName = useMemo(() => {
    return availablePages.find((item) => item.value === selectedPage)?.label || selectedPage;
  }, [availablePages, selectedPage]);

  const handleEdgeSelect = (edgeId: string, edgePath: Edge[]) => {
    setSelectedEdge(edgeId);
    setSelectedEdgePath(edgePath);
  };

  const openCreateDialog = (widgetType: SchemeWidgetType) => {
    if (!selectedEdge || !selectedPage) {
      return;
    }

    setEditingItem({
      id: `new-${Date.now()}`,
      edge_id: selectedEdge,
      tag_id: filteredTags[0]?.id || '',
      page: selectedPage,
      widgetType,
      position: { x: 100, y: 120 },
      customLabel: '',
      displayType: 'widget',
      connections: [],
    });
    setShowForm(true);
  };

  const handleDrop = useCallback((draggedItem: { id: string }, position: { x: number; y: number }) => {
    const moved = layoutsRef.current.find((item) => item.id === draggedItem.id);
    if (!moved) {
      return;
    }

    const constrained = clampWidgetPosition(
      applySmartSnap(position, moved, layoutsRef.current),
      moved.widgetType
    );

    const updated = layoutsRef.current.map((item) =>
      item.id === draggedItem.id ? { ...item, position: constrained } : item
    );

    const changed = updated.find((item) => item.id === draggedItem.id);
    setLayouts(updated);
    if (changed) {
      saveMutation.mutate(changed);
    }
  }, [saveMutation]);

  const handleSaveWidget = (item: DiagramLayoutItem) => {
    const normalizedId = `${item.edge_id}-${item.tag_id}`;
    const nextItem = { ...item, id: normalizedId };
    const existsIndex = layoutsRef.current.findIndex((layout) => layout.id === normalizedId);
    const nextLayouts = [...layoutsRef.current];

    if (existsIndex >= 0) {
      nextLayouts[existsIndex] = nextItem;
    } else {
      nextLayouts.push(nextItem);
    }

    setLayouts(nextLayouts);
    saveMutation.mutate(nextItem);
    setShowForm(false);
    setEditingItem(null);
  };

  const alignWidgets = (direction: AlignDirection) => {
    if (pageLayouts.length < 2) {
      return;
    }

    const visibleIds = new Set(pageLayouts.map((item) => item.id));
    const targetCenter = pageLayouts.reduce((sum, item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      const center = direction === 'horizontal'
        ? item.position.y + definition.height / 2
        : item.position.x + definition.width / 2;
      return sum + center;
    }, 0) / pageLayouts.length;

    const updatedLayouts = layoutsRef.current.map((item) => {
      if (!visibleIds.has(item.id)) {
        return item;
      }

      const definition = getSchemeWidgetDefinition(item.widgetType);
      const nextPosition = direction === 'horizontal'
        ? {
            ...item.position,
            y: Math.max(16, Math.min(targetCenter - (definition.height / 2), CANVAS_LIMITS.height - definition.height - 16)),
          }
        : {
            ...item.position,
            x: Math.max(16, Math.min(targetCenter - (definition.width / 2), CANVAS_LIMITS.width - definition.width - 16)),
          };

      return {
        ...item,
        position: nextPosition,
      };
    });

    setLayouts(updatedLayouts);
    updatedLayouts
      .filter((item) => visibleIds.has(item.id))
      .forEach((item) => saveMutation.mutate(item));
  };

  const handleDeleteWidget = (id: string) => {
    const widget = layoutsRef.current.find((item) => item.id === id);
    if (!widget) {
      return;
    }

    confirmDialog({
      message: `Удалить элемент для тега ${tagNames.get(widget.tag_id) || widget.tag_id}?`,
      header: 'Подтверждение удаления',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () => {
        setLayouts(layoutsRef.current.filter((item) => item.id !== id));
        deleteTagCustomization(widget.edge_id, widget.tag_id, 'widgetConfig').catch(() => undefined);
      },
    });
  };

  const libraryGroups = useMemo(() => {
    const normalized = librarySearch.trim().toLowerCase();
    const filtered = SCHEME_WIDGET_LIBRARY.filter((widget) => {
      if (!normalized) {
        return true;
      }

      return (
        widget.label.toLowerCase().includes(normalized) ||
        widget.description.toLowerCase().includes(normalized) ||
        widget.category.toLowerCase().includes(normalized)
      );
    });

    const groups = new Map<string, typeof filtered>();
    filtered.forEach((widget) => {
      const current = groups.get(widget.category) ?? [];
      current.push(widget);
      groups.set(widget.category, current);
    });

    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [librarySearch]);

  const stats = {
    total: pageLayouts.length,
    linked: pageLayouts.filter((item) => (item.connections ?? []).length > 0).length,
    categories: new Set(pageLayouts.map((item) => getSchemeWidgetDefinition(item.widgetType).category)).size,
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="diagram-admin-page">
        <div className="diagram-admin-page__hero">
          <div>
            <h2>{title}</h2>
            <p>
              Настраивайте библиотеку схемных элементов цифрового двойника буровой, размещайте их на полотне,
              связывайте между собой и сохраняйте все в текущий `widgetConfig`.
            </p>
          </div>
          <div className="diagram-admin-page__hero-stats">
            <div>
              <strong>{stats.total}</strong>
              <span>элементов</span>
            </div>
            <div>
              <strong>{stats.linked}</strong>
              <span>со связями</span>
            </div>
            <div>
              <strong>{stats.categories}</strong>
              <span>категорий</span>
            </div>
          </div>
        </div>

        {saveMutation.error ? (
          <Message
            severity="error"
            text={`Ошибка сохранения: ${getErrorMessage(saveMutation.error, 'Не удалось сохранить элемент.')}`}
          />
        ) : null}

        <div className="diagram-admin-page__content">
          <aside className="diagram-admin-sidebar">
            <div className="diagram-admin-card">
              <h3>Оборудование</h3>
              <EdgeTreeSelector selectedEdgeId={selectedEdge} onSelectEdge={handleEdgeSelect} />
            </div>

            <div className="diagram-admin-card">
              <h3>Маршрут</h3>
              {selectedEdge ? (
                <EdgePathDisplay edgePath={selectedEdgePath} />
              ) : (
                <p className="diagram-admin-muted">Выберите оборудование, чтобы открыть страницы схемы.</p>
              )}
            </div>

            <div className="diagram-admin-card diagram-admin-card--library">
              <div className="diagram-admin-card__title-row">
                <h3>Библиотека элементов</h3>
                <span>{SCHEME_WIDGET_LIBRARY.length}</span>
              </div>

              <input
                type="text"
                className="p-inputtext diagram-admin-library__search"
                placeholder="Поиск по библиотеке"
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
              />

              <div className="diagram-admin-library">
                {libraryGroups.map((group) => (
                  <section key={group.category} className="diagram-admin-library__group">
                    <header>
                      <h4>{group.category}</h4>
                      <span>{group.items.length}</span>
                    </header>
                    <div className="diagram-admin-library__grid">
                      {group.items.map((widgetType) => (
                        <button
                          key={widgetType.type}
                          type="button"
                          className="diagram-admin-library__item"
                          onClick={() => openCreateDialog(widgetType.type)}
                          disabled={!selectedEdge || !selectedPage}
                        >
                          <SchemeWidgetPreview type={widgetType.type} active />
                          <div>
                            <strong>{widgetType.label}</strong>
                            <span>{widgetType.description}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </aside>

          <section className="diagram-admin-workspace">
            <div className="diagram-admin-toolbar">
              <div className="diagram-admin-toolbar__controls">
                <input
                  type="text"
                  className="p-inputtext"
                  placeholder="Поиск по тегу, подписи или типу"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <select
                  value={selectedPage}
                  onChange={(event) => setSelectedPage(event.target.value)}
                  className="p-dropdown"
                  disabled={!availablePages.length}
                >
                  {!availablePages.length ? <option value="">Сначала выберите оборудование</option> : null}
                  {availablePages.map((page) => (
                    <option key={page.value} value={page.value}>
                      {page.label}
                    </option>
                  ))}
                </select>
                <select
                  value={String(zoom)}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="p-dropdown diagram-admin-toolbar__zoom"
                >
                  {ZOOM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Масштаб {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="diagram-admin-toolbar__actions">
                <Button
                  label="По горизонтали"
                  icon="pi pi-minus"
                  severity="secondary"
                  outlined
                  disabled={pageLayouts.length < 2 || saveMutation.isPending}
                  onClick={() => alignWidgets('horizontal')}
                />
                <Button
                  label="По вертикали"
                  icon="pi pi-bars"
                  severity="secondary"
                  outlined
                  disabled={pageLayouts.length < 2 || saveMutation.isPending}
                  onClick={() => alignWidgets('vertical')}
                />
              </div>
            </div>

            {selectedEdge && selectedPage ? (
              <DiagramDropZone
                selectedPage={selectedPage}
                selectedPageName={selectedPageName}
                widgets={pageLayouts}
                zoom={zoom}
                onDrop={handleDrop}
              >
                {pageLayouts.map((item) => (
                  <DiagramDraggableWidget
                    key={item.id}
                    item={item}
                    tagName={tagNames.get(item.tag_id) || item.tag_id}
                    hasAlarm={Boolean(item.connections?.some((connection) => connection.kind === 'alert'))}
                    onEdit={(widget) => {
                      setEditingItem(widget);
                      setShowForm(true);
                    }}
                    onDelete={handleDeleteWidget}
                  />
                ))}
                {pageLayouts.length === 0 ? (
                  <div className="diagram-admin-empty">
                    <i className="pi pi-sitemap" />
                    <strong>Полотно пока пустое</strong>
                    <span>Выберите элемент из библиотеки слева и разместите его на странице оборудования.</span>
                  </div>
                ) : null}
              </DiagramDropZone>
            ) : (
              <div className="diagram-admin-empty diagram-admin-empty--idle">
                <i className="pi pi-compass" />
                <strong>Выберите оборудование</strong>
                <span>После выбора станет доступно полотно для настройки схемных элементов и связей.</span>
              </div>
            )}

            <div className="diagram-admin-card">
              <div className="diagram-admin-card__title-row">
                <h3>Элементы текущей страницы</h3>
                <span>{pageLayouts.length}</span>
              </div>
              {pageLayouts.length ? (
                <div className="diagram-admin-list">
                  {pageLayouts.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="diagram-admin-list__item"
                      onClick={() => {
                        setEditingItem(item);
                        setShowForm(true);
                      }}
                    >
                      <SchemeWidgetPreview type={item.widgetType} active={false} />
                      <div>
                        <strong>{item.customLabel || tagNames.get(item.tag_id) || item.tag_id}</strong>
                        <span>
                          {getSchemeWidgetDefinition(item.widgetType).label} · X {Math.round(item.position.x)} · Y {Math.round(item.position.y)} · Связей {(item.connections ?? []).length}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="diagram-admin-muted">На выбранной странице еще нет схемных элементов.</p>
              )}
            </div>
          </section>
        </div>

        <Dialog
          visible={showForm}
          header={editingItem?.id.startsWith('new-') ? 'Новый схемный элемент' : 'Редактирование схемного элемента'}
          className="responsive-dialog responsive-dialog-md p-fluid admin-dialog"
          modal
          onHide={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
        >
          <DiagramWidgetForm
            item={editingItem}
            tags={filteredTags}
            pages={availablePages}
            pageWidgets={allPageLayouts}
            tagNames={tagNames}
            onSave={handleSaveWidget}
            onCancel={() => {
              setShowForm(false);
              setEditingItem(null);
            }}
          />
        </Dialog>

        <ConfirmDialog />
      </div>
    </DndProvider>
  );
}
