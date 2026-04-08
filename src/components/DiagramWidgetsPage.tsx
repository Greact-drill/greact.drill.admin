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

interface CanvasViewport {
  left: number;
  top: number;
  width: number;
  height: number;
  scrollWidth: number;
  scrollHeight: number;
}

interface CanvasFocusRequest {
  x: number;
  y: number;
}

interface CanvasSelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  append: boolean;
}

interface SmartSnapGuides {
  x?: number;
  y?: number;
}

type AlignDirection = 'horizontal' | 'vertical';
type AlignPreset = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
type DistributeDirection = 'horizontal' | 'vertical';

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
const MINIMAP_WIDTH = 240;
const MINIMAP_HEIGHT = 140;
const GRID_OFFSET = 16;
const GRID_SIZE_OPTIONS = [8, 16, 24, 32];
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.4;

function clampWidgetPosition(position: { x: number; y: number }, widgetType: SchemeWidgetType) {
  const definition = getSchemeWidgetDefinition(widgetType);

  return {
    x: Math.max(GRID_OFFSET, Math.min(Math.round(position.x), CANVAS_LIMITS.width - definition.width - GRID_OFFSET)),
    y: Math.max(GRID_OFFSET, Math.min(Math.round(position.y), CANVAS_LIMITS.height - definition.height - GRID_OFFSET)),
  };
}

function snapAxisToGrid(value: number, gridSize: number) {
  return GRID_OFFSET + Math.round((value - GRID_OFFSET) / gridSize) * gridSize;
}

function normalizeWidgetPosition(
  position: { x: number; y: number },
  widgetType: SchemeWidgetType,
  snapToGrid: boolean,
  gridSize: number
) {
  const nextPosition = snapToGrid
    ? {
        x: snapAxisToGrid(position.x, gridSize),
        y: snapAxisToGrid(position.y, gridSize),
      }
    : position;

  return clampWidgetPosition(nextPosition, widgetType);
}

function clampZoomValue(value: number) {
  return Math.max(MIN_ZOOM, Math.min(Number(value.toFixed(2)), MAX_ZOOM));
}

function getWidgetsBounds(widgets: DiagramLayoutItem[]) {
  if (!widgets.length) {
    return null;
  }

  const bounds = widgets.map((item) => {
    const definition = getSchemeWidgetDefinition(item.widgetType);
    return {
      left: item.position.x,
      top: item.position.y,
      right: item.position.x + definition.width,
      bottom: item.position.y + definition.height,
    };
  });

  return {
    left: Math.min(...bounds.map((item) => item.left)),
    top: Math.min(...bounds.map((item) => item.top)),
    right: Math.max(...bounds.map((item) => item.right)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
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

function getNearestReference(value: number, candidates: number[]) {
  let best: number | undefined;
  let bestDistance = SNAP_THRESHOLD + 1;

  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });

  return bestDistance <= SNAP_THRESHOLD ? best : undefined;
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

function getSmartSnapGuides(position: { x: number; y: number }, moved: DiagramLayoutItem, layouts: DiagramLayoutItem[]): SmartSnapGuides {
  const movedDefinition = getSchemeWidgetDefinition(moved.widgetType);
  const otherWidgets = layouts.filter((item) => item.id !== moved.id && item.page === moved.page && item.edge_id === moved.edge_id);

  const xReference = getNearestReference(
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

  const yReference = getNearestReference(
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

  return {
    x: xReference,
    y: yReference,
  };
}

const EMPTY_VIEWPORT: CanvasViewport = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  scrollWidth: CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE,
  scrollHeight: CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE,
};

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
  isSelected?: boolean;
  onEdit: (item: DiagramLayoutItem) => void;
  onDelete: (id: string) => void;
  onSelect: (item: DiagramLayoutItem, append: boolean) => void;
}> = ({ item, tagName, hasAlarm = false, isSelected = false, onEdit, onDelete, onSelect }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'diagram-widget',
    item: { id: item.id, origin: item.position },
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
      className={`diagram-admin-canvas-widget ${isDragging ? 'is-dragging' : ''} ${hasAlarm ? 'is-alarm' : ''} ${isSelected ? 'is-selected' : ''}`}
      style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${definition.width}px`, height: `${definition.height}px` }}
      onDoubleClick={() => onEdit(item)}
      onClick={(event) => onSelect(item, event.ctrlKey || event.metaKey)}
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
  snapToGrid: boolean;
  gridSize: number;
  selectedWidgetIds: string[];
  children: React.ReactNode;
  onDrop: (item: { id: string; origin?: { x: number; y: number } }, position: { x: number; y: number }) => void;
  onZoomChange?: (zoom: number) => void;
  onViewportChange?: (viewport: CanvasViewport) => void;
  onNavigateReady?: (navigate: ((point: { x: number; y: number }) => void) | null) => void;
  onSelectionChange: (ids: string[], append: boolean) => void;
}> = ({ selectedPage, selectedPageName, widgets, zoom, snapToGrid, gridSize, selectedWidgetIds, children, onDrop, onZoomChange, onViewportChange, onNavigateReady, onSelectionChange }) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [selectionBox, setSelectionBox] = useState<CanvasSelectionBox | null>(null);
  const [snapGuides, setSnapGuides] = useState<SmartSnapGuides | null>(null);
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'diagram-widget',
    hover: (item: { id: string; origin?: { x: number; y: number } }, monitor) => {
      const pointer = monitor.getClientOffset();
      const surface = surfaceRef.current;
      const bounds = surface?.getBoundingClientRect();
      const moved = widgets.find((widget) => widget.id === item.id);

      if (!pointer || !surface || !bounds || !moved) {
        setSnapGuides(null);
        return;
      }

      const rawPosition = {
        x: ((pointer.x - bounds.left + surface.scrollLeft) / zoom) / ADMIN_PREVIEW_SCALE,
        y: ((pointer.y - bounds.top + surface.scrollTop) / zoom) / ADMIN_PREVIEW_SCALE,
      };

      const guides = getSmartSnapGuides(rawPosition, moved, widgets);
      setSnapGuides(guides.x !== undefined || guides.y !== undefined ? guides : null);
    },
    drop: (item: { id: string }, monitor) => {
      const pointer = monitor.getClientOffset();
      const surface = surfaceRef.current;
      const bounds = surface?.getBoundingClientRect();
      if (!pointer || !surface || !bounds) {
        setSnapGuides(null);
        return;
      }

      onDrop(item, {
        x: ((pointer.x - bounds.left + surface.scrollLeft) / zoom) / ADMIN_PREVIEW_SCALE,
        y: ((pointer.y - bounds.top + surface.scrollTop) / zoom) / ADMIN_PREVIEW_SCALE,
      });
      setSnapGuides(null);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  drop(surfaceRef);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (event.code === 'Space' && tagName !== 'input' && tagName !== 'textarea' && tagName !== 'select' && !target?.isContentEditable) {
        setSpacePressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!isOver) {
      setSnapGuides(null);
    }
  }, [isOver]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      onNavigateReady?.(null);
      return;
    }

    const updateViewport = () => {
      onViewportChange?.({
        left: surface.scrollLeft,
        top: surface.scrollTop,
        width: surface.clientWidth,
        height: surface.clientHeight,
        scrollWidth: surface.scrollWidth,
        scrollHeight: surface.scrollHeight,
      });
    };

    const scrollToCanvasPoint = (point: { x: number; y: number }) => {
      const maxLeft = Math.max(0, surface.scrollWidth - surface.clientWidth);
      const maxTop = Math.max(0, surface.scrollHeight - surface.clientHeight);

      surface.scrollTo({
        left: Math.min(maxLeft, Math.max(0, point.x * zoom - surface.clientWidth / 2)),
        top: Math.min(maxTop, Math.max(0, point.y * zoom - surface.clientHeight / 2)),
        behavior: 'smooth',
      });
    };

    onNavigateReady?.(scrollToCanvasPoint);
    updateViewport();

    surface.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('resize', updateViewport);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateViewport())
      : null;

    resizeObserver?.observe(surface);

    return () => {
      surface.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      resizeObserver?.disconnect();
      onNavigateReady?.(null);
    };
  }, [zoom, onNavigateReady, onViewportChange]);

  const widgetMap = new Map(widgets.map((widget) => [widget.tag_id, widget]));
  const selectionBounds = selectionBox
    ? {
        left: Math.min(selectionBox.startX, selectionBox.currentX),
        top: Math.min(selectionBox.startY, selectionBox.currentY),
        width: Math.abs(selectionBox.currentX - selectionBox.startX),
        height: Math.abs(selectionBox.currentY - selectionBox.startY),
      }
    : null;
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
      <div
        ref={surfaceRef}
        className={`diagram-admin-canvas__surface ${isPanning ? 'is-panning' : ''} ${spacePressed ? 'is-space-pan' : ''}`}
        onMouseDown={(event) => {
          const surface = surfaceRef.current;
          if (!surface) {
            return;
          }

          const target = event.target as HTMLElement | null;
          const clickedWidget = target?.closest('.diagram-admin-canvas-widget');
          const canPan = event.button === 1 || ((spacePressed || event.altKey) && event.button === 0);

          if (event.button === 0 && !clickedWidget && !spacePressed && !event.altKey) {
            const bounds = surface.getBoundingClientRect();
            const contentX = event.clientX - bounds.left + surface.scrollLeft;
            const contentY = event.clientY - bounds.top + surface.scrollTop;

            setSelectionBox({
              startX: contentX,
              startY: contentY,
              currentX: contentX,
              currentY: contentY,
              append: event.ctrlKey || event.metaKey,
            });
            return;
          }

          if (!canPan || (!spacePressed && event.button !== 1 && clickedWidget)) {
            return;
          }

          event.preventDefault();
          panStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            left: surface.scrollLeft,
            top: surface.scrollTop,
          };
          setIsPanning(true);
        }}
        onMouseMove={(event) => {
          const surface = surfaceRef.current;
          const panStart = panStartRef.current;
          if (!surface) {
            return;
          }

          if (selectionBox) {
            const bounds = surface.getBoundingClientRect();
            setSelectionBox((current) => current ? {
              ...current,
              currentX: event.clientX - bounds.left + surface.scrollLeft,
              currentY: event.clientY - bounds.top + surface.scrollTop,
            } : null);
            return;
          }

          if (!panStart) {
            return;
          }

          event.preventDefault();
          surface.scrollLeft = panStart.left - (event.clientX - panStart.x);
          surface.scrollTop = panStart.top - (event.clientY - panStart.y);
        }}
        onMouseUp={() => {
          if (selectionBox) {
            const nextSelection = widgets
              .filter((widget) => {
                const position = getScaledCanvasPosition(widget.position);
                const dimensions = getAdminPreviewDimensions(widget.widgetType);
                const left = position.x * zoom;
                const top = position.y * zoom;
                const right = left + dimensions.width * zoom;
                const bottom = top + dimensions.height * zoom;

                return !selectionBounds || !(
                  right < selectionBounds.left ||
                  left > selectionBounds.left + selectionBounds.width ||
                  bottom < selectionBounds.top ||
                  top > selectionBounds.top + selectionBounds.height
                );
              })
              .map((widget) => widget.id);

            onSelectionChange(nextSelection, selectionBox.append);
            setSelectionBox(null);
          }

          panStartRef.current = null;
          setIsPanning(false);
        }}
        onMouseLeave={() => {
          setSelectionBox(null);
          setSnapGuides(null);
          panStartRef.current = null;
          setIsPanning(false);
        }}
        onWheel={(event) => {
          if (!(event.ctrlKey || event.metaKey) || !onZoomChange) {
            return;
          }

          const surface = surfaceRef.current;
          if (!surface) {
            return;
          }

          event.preventDefault();

          const nextZoom = clampZoomValue(zoom + (event.deltaY < 0 ? 0.08 : -0.08));
          if (nextZoom === zoom) {
            return;
          }

          const rect = surface.getBoundingClientRect();
          const canvasX = (event.clientX - rect.left + surface.scrollLeft) / zoom;
          const canvasY = (event.clientY - rect.top + surface.scrollTop) / zoom;

          onZoomChange(nextZoom);

          requestAnimationFrame(() => {
            surface.scrollLeft = canvasX * nextZoom - (event.clientX - rect.left);
            surface.scrollTop = canvasY * nextZoom - (event.clientY - rect.top);
          });
        }}
      >
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
            <div
              className={`diagram-admin-canvas__grid ${snapToGrid ? 'is-snap-active' : ''}`}
              style={{
                backgroundSize: `${gridSize * ADMIN_PREVIEW_SCALE}px ${gridSize * ADMIN_PREVIEW_SCALE}px`,
                backgroundPosition: `${GRID_OFFSET * ADMIN_PREVIEW_SCALE}px ${GRID_OFFSET * ADMIN_PREVIEW_SCALE}px`,
              }}
              aria-hidden="true"
            />
            <svg
              className="diagram-admin-canvas__links"
              width={CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE}
              height={CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE}
              viewBox={`0 0 ${CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE} ${CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE}`}
              aria-hidden="true"
            >
              {snapGuides?.x !== undefined ? (
                <line
                  x1={snapGuides.x * ADMIN_PREVIEW_SCALE}
                  y1={0}
                  x2={snapGuides.x * ADMIN_PREVIEW_SCALE}
                  y2={CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE}
                  className="diagram-admin-canvas__guide"
                />
              ) : null}
              {snapGuides?.y !== undefined ? (
                <line
                  x1={0}
                  y1={snapGuides.y * ADMIN_PREVIEW_SCALE}
                  x2={CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE}
                  y2={snapGuides.y * ADMIN_PREVIEW_SCALE}
                  className="diagram-admin-canvas__guide"
                />
              ) : null}
              {links.map((link) => (
                <g key={link.id} className={`diagram-admin-canvas__link-group diagram-admin-canvas__link-group--${link.kind}`}>
                  <path d={link.path} className="diagram-admin-canvas__link" />
                  <circle cx={link.x2} cy={link.y2} r="4" className="diagram-admin-canvas__link-end" />
                </g>
              ))}
            </svg>
            {children}
          </div>
          {selectionBounds ? (
            <div
              className="diagram-admin-canvas__selection-box"
              style={{
                left: `${selectionBounds.left}px`,
                top: `${selectionBounds.top}px`,
                width: `${selectionBounds.width}px`,
                height: `${selectionBounds.height}px`,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

const DiagramMiniMap: React.FC<{
  widgets: DiagramLayoutItem[];
  selectedWidgetIds: string[];
  viewport: CanvasViewport;
  zoom: number;
  onNavigate?: (point: { x: number; y: number }) => void;
}> = ({ widgets, selectedWidgetIds, viewport, zoom, onNavigate }) => {
  const worldWidth = CANVAS_LIMITS.width * ADMIN_PREVIEW_SCALE;
  const worldHeight = CANVAS_LIMITS.height * ADMIN_PREVIEW_SCALE;
  const minimapScale = Math.min(MINIMAP_WIDTH / worldWidth, MINIMAP_HEIGHT / worldHeight);
  const safeZoom = Math.max(zoom, 0.01);
  const viewportWidth = Math.min(worldWidth, viewport.width > 0 ? viewport.width / safeZoom : worldWidth);
  const viewportHeight = Math.min(worldHeight, viewport.height > 0 ? viewport.height / safeZoom : worldHeight);
  const viewportLeft = Math.min(Math.max(0, viewport.left / safeZoom), Math.max(0, worldWidth - viewportWidth));
  const viewportTop = Math.min(Math.max(0, viewport.top / safeZoom), Math.max(0, worldHeight - viewportHeight));

  return (
    <div className="diagram-admin-minimap">
      <div className="diagram-admin-minimap__header">
        <strong>Миниатюра схемы</strong>
        <span>Клик по области переносит к нужному участку</span>
      </div>
      <button
        type="button"
        className="diagram-admin-minimap__surface"
        onClick={(event) => {
          if (!onNavigate) {
            return;
          }

          const bounds = event.currentTarget.getBoundingClientRect();
          onNavigate({
            x: (event.clientX - bounds.left) / minimapScale,
            y: (event.clientY - bounds.top) / minimapScale,
          });
        }}
      >
        {widgets.map((widget) => {
          const position = getScaledCanvasPosition(widget.position);
          const dimensions = getAdminPreviewDimensions(widget.widgetType);

          return (
            <span
              key={widget.id}
              className={`diagram-admin-minimap__widget ${selectedWidgetIds.includes(widget.id) ? 'is-selected' : ''}`}
              style={{
                left: `${position.x * minimapScale}px`,
                top: `${position.y * minimapScale}px`,
                width: `${Math.max(6, dimensions.width * minimapScale)}px`,
                height: `${Math.max(6, dimensions.height * minimapScale)}px`,
              }}
              title={widget.customLabel || widget.tag_id}
            />
          );
        })}
        <span
          className="diagram-admin-minimap__viewport"
          style={{
            left: `${viewportLeft * minimapScale}px`,
            top: `${viewportTop * minimapScale}px`,
            width: `${Math.max(18, viewportWidth * minimapScale)}px`,
            height: `${Math.max(18, viewportHeight * minimapScale)}px`,
          }}
        />
      </button>
    </div>
  );
};

const DiagramWidgetForm: React.FC<{
  item: DiagramLayoutItem | null;
  tags: Tag[];
  pages: Array<{ label: string; value: string }>;
  pageWidgets: DiagramLayoutItem[];
  tagNames: Map<string, string>;
  snapToGrid: boolean;
  gridSize: number;
  onSave: (item: DiagramLayoutItem) => void;
  onCancel: () => void;
}> = ({ item, tags, pages, pageWidgets, tagNames, snapToGrid, gridSize, onSave, onCancel }) => {
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
    const safeValue = Number.isFinite(parsed) ? parsed : GRID_OFFSET;
    const nextPosition = normalizeWidgetPosition(
      {
        ...formData.position,
        [axis]: safeValue,
      },
      formData.widgetType,
      snapToGrid,
      gridSize
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
      position: normalizeWidgetPosition(formData.position, formData.widgetType, snapToGrid, gridSize),
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
              position: normalizeWidgetPosition(formData.position, widgetType, snapToGrid, gridSize),
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
                min={String(GRID_OFFSET)}
                max={String(CANVAS_LIMITS.width - definition.width - GRID_OFFSET)}
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
                min={String(GRID_OFFSET)}
                max={String(CANVAS_LIMITS.height - definition.height - GRID_OFFSET)}
                value={Math.round(formData.position.y)}
                onChange={(event) => updatePosition('y', event.target.value)}
                className="p-inputtext"
              />
            </label>
            <span className="diagram-widget-form__position-size">{definition.width}x{definition.height}</span>
          </div>
          {snapToGrid ? (
            <span className="diagram-widget-form__position-hint">Привязка включена: шаг сетки {gridSize}px</span>
          ) : null}
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
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport>(EMPTY_VIEWPORT);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(16);
  const [pendingCanvasFocus, setPendingCanvasFocus] = useState<CanvasFocusRequest | null>(null);

  const layoutsRef = useRef<DiagramLayoutItem[]>([]);
  const canvasNavigatorRef = useRef<((point: { x: number; y: number }) => void) | null>(null);
  const selectedWidgetIdsRef = useRef<string[]>([]);

  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);

  useEffect(() => {
    selectedWidgetIdsRef.current = selectedWidgetIds;
  }, [selectedWidgetIds]);

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

  useEffect(() => {
    const visibleIds = new Set(allPageLayouts.map((item) => item.id));
    setSelectedWidgetIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [allPageLayouts]);

  const activeWidgetIds = useMemo(() => {
    const selectedVisible = selectedWidgetIds.filter((id) => allPageLayouts.some((item) => item.id === id));
    return selectedVisible.length > 0 ? selectedVisible : pageLayouts.map((item) => item.id);
  }, [selectedWidgetIds, allPageLayouts, pageLayouts]);

  const activeWidgets = useMemo(() => {
    const activeIds = new Set(activeWidgetIds);
    return pageLayouts.filter((item) => activeIds.has(item.id));
  }, [pageLayouts, activeWidgetIds]);

  const focusWidgetsInViewport = useCallback((widgetsToFocus: DiagramLayoutItem[]) => {
    if (!widgetsToFocus.length || canvasViewport.width <= 0 || canvasViewport.height <= 0) {
      return;
    }

    const bounds = getWidgetsBounds(widgetsToFocus);
    if (!bounds) {
      return;
    }

    const padding = 80;
    const worldWidth = (bounds.right - bounds.left) * ADMIN_PREVIEW_SCALE + padding * 2;
    const worldHeight = (bounds.bottom - bounds.top) * ADMIN_PREVIEW_SCALE + padding * 2;
    const nextZoom = clampZoomValue(Math.min(canvasViewport.width / worldWidth, canvasViewport.height / worldHeight, 1));

    setZoom(nextZoom);
    setPendingCanvasFocus({
      x: ((bounds.left + bounds.right) / 2) * ADMIN_PREVIEW_SCALE,
      y: ((bounds.top + bounds.bottom) / 2) * ADMIN_PREVIEW_SCALE,
    });
  }, [canvasViewport.height, canvasViewport.width]);

  useEffect(() => {
    if (!pendingCanvasFocus || !canvasNavigatorRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      canvasNavigatorRef.current?.(pendingCanvasFocus);
      setPendingCanvasFocus(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pendingCanvasFocus, zoom]);

  const handleEdgeSelect = (edgeId: string, edgePath: Edge[]) => {
    setSelectedEdge(edgeId);
    setSelectedEdgePath(edgePath);
    setSelectedWidgetIds([]);
  };

  const handleSelectWidget = useCallback((item: DiagramLayoutItem, append: boolean) => {
    setSelectedWidgetIds((current) => {
      if (append) {
        return current.includes(item.id)
          ? current.filter((id) => id !== item.id)
          : [...current, item.id];
      }

      return current.length === 1 && current[0] === item.id ? [] : [item.id];
    });
  }, []);

  const handleCanvasSelection = useCallback((ids: string[], append: boolean) => {
    setSelectedWidgetIds((current) => {
      if (append) {
        return Array.from(new Set([...current, ...ids]));
      }

      return ids;
    });
  }, []);

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
      position: normalizeWidgetPosition({ x: 100, y: 120 }, widgetType, snapToGrid, gridSize),
      customLabel: '',
      displayType: 'widget',
      connections: [],
    });
    setShowForm(true);
  };

  const handleDrop = useCallback((draggedItem: { id: string; origin?: { x: number; y: number } }, position: { x: number; y: number }) => {
    const moved = layoutsRef.current.find((item) => item.id === draggedItem.id);
    if (!moved) {
      return;
    }

    const constrained = normalizeWidgetPosition(
      applySmartSnap(position, moved, layoutsRef.current),
      moved.widgetType,
      snapToGrid,
      gridSize
    );
    const selectedIds = selectedWidgetIdsRef.current.includes(draggedItem.id)
      ? new Set(selectedWidgetIdsRef.current)
      : new Set([draggedItem.id]);
    const origin = draggedItem.origin ?? moved.position;
    const deltaX = constrained.x - origin.x;
    const deltaY = constrained.y - origin.y;

    const updated = layoutsRef.current.map((item) => {
      if (!selectedIds.has(item.id)) {
        return item;
      }

      return {
        ...item,
        position: normalizeWidgetPosition(
          {
            x: item.position.x + deltaX,
            y: item.position.y + deltaY,
          },
          item.widgetType,
          snapToGrid,
          gridSize
        ),
      };
    });

    const changed = updated.filter((item) => selectedIds.has(item.id));
    setLayouts(updated);
    setSelectedWidgetIds(Array.from(selectedIds));
    changed.forEach((item) => saveMutation.mutate(item));
  }, [gridSize, saveMutation, snapToGrid]);

  const handleSaveWidget = (item: DiagramLayoutItem) => {
    const normalizedId = `${item.edge_id}-${item.tag_id}`;
    const nextItem = {
      ...item,
      id: normalizedId,
      position: normalizeWidgetPosition(item.position, item.widgetType, snapToGrid, gridSize),
    };
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
    setSelectedWidgetIds([nextItem.id]);
  };

  const alignWidgets = (direction: AlignDirection) => {
    if (activeWidgets.length < 2) {
      return;
    }

    const visibleIds = new Set(activeWidgets.map((item) => item.id));
    const targetCenter = activeWidgets.reduce((sum, item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      const center = direction === 'horizontal'
        ? item.position.y + definition.height / 2
        : item.position.x + definition.width / 2;
      return sum + center;
    }, 0) / activeWidgets.length;

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
        position: normalizeWidgetPosition(nextPosition, item.widgetType, snapToGrid, gridSize),
      };
    });

    setLayouts(updatedLayouts);
    updatedLayouts
      .filter((item) => visibleIds.has(item.id))
      .forEach((item) => saveMutation.mutate(item));
  };

  const alignWidgetsByPreset = (preset: AlignPreset) => {
    if (activeWidgets.length < 2) {
      return;
    }

    const activeIds = new Set(activeWidgets.map((item) => item.id));
    const anchors = activeWidgets.map((item) => {
      const definition = getSchemeWidgetDefinition(item.widgetType);
      return {
        left: item.position.x,
        centerX: item.position.x + definition.width / 2,
        right: item.position.x + definition.width,
        top: item.position.y,
        centerY: item.position.y + definition.height / 2,
        bottom: item.position.y + definition.height,
      };
    });

    const target = anchors.reduce((sum, item) => sum + item[preset], 0) / anchors.length;

    const updatedLayouts = layoutsRef.current.map((item) => {
      if (!activeIds.has(item.id)) {
        return item;
      }

      const definition = getSchemeWidgetDefinition(item.widgetType);
      const nextPosition = (() => {
        switch (preset) {
          case 'left':
            return { ...item.position, x: target };
          case 'centerX':
            return { ...item.position, x: target - definition.width / 2 };
          case 'right':
            return { ...item.position, x: target - definition.width };
          case 'top':
            return { ...item.position, y: target };
          case 'centerY':
            return { ...item.position, y: target - definition.height / 2 };
          case 'bottom':
            return { ...item.position, y: target - definition.height };
          default:
            return item.position;
        }
      })();

      return { ...item, position: normalizeWidgetPosition(nextPosition, item.widgetType, snapToGrid, gridSize) };
    });

    setLayouts(updatedLayouts);
    updatedLayouts.filter((item) => activeIds.has(item.id)).forEach((item) => saveMutation.mutate(item));
  };

  const distributeWidgets = (direction: DistributeDirection) => {
    if (activeWidgets.length < 3) {
      return;
    }

    const sorted = [...activeWidgets].sort((a, b) =>
      direction === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y
    );
    const activeIds = new Set(sorted.map((item) => item.id));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const start = direction === 'horizontal' ? first.position.x : first.position.y;
    const end = direction === 'horizontal' ? last.position.x : last.position.y;
    const gap = (end - start) / (sorted.length - 1);
    const targets = new Map(sorted.map((item, index) => [item.id, start + gap * index]));

    const updatedLayouts = layoutsRef.current.map((item) => {
      if (!activeIds.has(item.id)) {
        return item;
      }

      const target = targets.get(item.id) ?? (direction === 'horizontal' ? item.position.x : item.position.y);
      const nextPosition = direction === 'horizontal'
        ? { ...item.position, x: target }
        : { ...item.position, y: target };

      return { ...item, position: normalizeWidgetPosition(nextPosition, item.widgetType, snapToGrid, gridSize) };
    });

    setLayouts(updatedLayouts);
    updatedLayouts.filter((item) => activeIds.has(item.id)).forEach((item) => saveMutation.mutate(item));
  };

  useEffect(() => {
    if (!selectedWidgetIds.length || showForm) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        const tagName = event.target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || event.target.isContentEditable) {
          return;
        }
      }

      const delta = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;

      if (event.key === 'ArrowLeft') dx = -delta;
      if (event.key === 'ArrowRight') dx = delta;
      if (event.key === 'ArrowUp') dy = -delta;
      if (event.key === 'ArrowDown') dy = delta;
      if (dx === 0 && dy === 0) return;

      event.preventDefault();
      const selectedIds = new Set(selectedWidgetIds);
      const updatedLayouts = layoutsRef.current.map((item) => {
        if (!selectedIds.has(item.id)) {
          return item;
        }

        return {
          ...item,
          position: normalizeWidgetPosition(
            {
              x: item.position.x + dx,
              y: item.position.y + dy,
            },
            item.widgetType,
            snapToGrid,
            gridSize
          ),
        };
      });

      setLayouts(updatedLayouts);
      updatedLayouts.filter((item) => selectedIds.has(item.id)).forEach((item) => saveMutation.mutate(item));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gridSize, saveMutation, selectedWidgetIds, showForm, snapToGrid]);

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
          setSelectedWidgetIds((current) => current.filter((itemId) => itemId !== id));
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

  const selectedSummary = activeWidgets.length
    ? `${activeWidgets.length} выбрано`
    : 'Нет выбора';

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
                  onChange={(event) => setZoom(clampZoomValue(Number(event.target.value)))}
                  className="p-dropdown diagram-admin-toolbar__zoom"
                >
                  {ZOOM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Масштаб {option.label}
                    </option>
                  ))}
                </select>
                <Button
                  label="Показать все"
                  severity="secondary"
                  outlined
                  disabled={!pageLayouts.length}
                  onClick={() => focusWidgetsInViewport(pageLayouts)}
                />
                <Button
                  label="К выбранным"
                  severity="secondary"
                  outlined
                  disabled={!activeWidgets.length}
                  onClick={() => focusWidgetsInViewport(activeWidgets)}
                />
                <label className="diagram-admin-toolbar__toggle">
                  <input
                    type="checkbox"
                    checked={snapToGrid}
                    onChange={(event) => setSnapToGrid(event.target.checked)}
                  />
                  <span>Привязка к сетке</span>
                </label>
                <select
                  value={String(gridSize)}
                  onChange={(event) => setGridSize(Number(event.target.value))}
                  className="p-dropdown diagram-admin-toolbar__grid"
                  disabled={!snapToGrid}
                >
                  {GRID_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      Сетка {option}px
                    </option>
                  ))}
                </select>
                <div className="diagram-admin-toolbar__selection">{selectedSummary}</div>
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
                <Button label="Левый край" severity="secondary" outlined disabled={activeWidgets.length < 2 || saveMutation.isPending} onClick={() => alignWidgetsByPreset('left')} />
                <Button label="Центр X" severity="secondary" outlined disabled={activeWidgets.length < 2 || saveMutation.isPending} onClick={() => alignWidgetsByPreset('centerX')} />
                <Button label="Правый край" severity="secondary" outlined disabled={activeWidgets.length < 2 || saveMutation.isPending} onClick={() => alignWidgetsByPreset('right')} />
                <Button label="Верхний край" severity="secondary" outlined disabled={activeWidgets.length < 2 || saveMutation.isPending} onClick={() => alignWidgetsByPreset('top')} />
                <Button label="Центр Y" severity="secondary" outlined disabled={activeWidgets.length < 2 || saveMutation.isPending} onClick={() => alignWidgetsByPreset('centerY')} />
                <Button label="Нижний край" severity="secondary" outlined disabled={activeWidgets.length < 2 || saveMutation.isPending} onClick={() => alignWidgetsByPreset('bottom')} />
                <Button label="Распределить X" severity="secondary" outlined disabled={activeWidgets.length < 3 || saveMutation.isPending} onClick={() => distributeWidgets('horizontal')} />
                <Button label="Распределить Y" severity="secondary" outlined disabled={activeWidgets.length < 3 || saveMutation.isPending} onClick={() => distributeWidgets('vertical')} />
              </div>
            </div>

            {selectedEdge && selectedPage ? (
              <DiagramMiniMap
                widgets={pageLayouts}
                selectedWidgetIds={selectedWidgetIds}
                viewport={canvasViewport}
                zoom={zoom}
                onNavigate={(point) => canvasNavigatorRef.current?.(point)}
              />
            ) : null}

            {selectedEdge && selectedPage ? (
              <DiagramDropZone
                selectedPage={selectedPage}
                selectedPageName={selectedPageName}
                widgets={pageLayouts}
                zoom={zoom}
                snapToGrid={snapToGrid}
                gridSize={gridSize}
                selectedWidgetIds={selectedWidgetIds}
                onDrop={handleDrop}
                onZoomChange={setZoom}
                onViewportChange={setCanvasViewport}
                onNavigateReady={(navigate) => {
                  canvasNavigatorRef.current = navigate;
                }}
                onSelectionChange={handleCanvasSelection}
              >
                {pageLayouts.map((item) => (
                  <DiagramDraggableWidget
                    key={item.id}
                    item={item}
                    tagName={tagNames.get(item.tag_id) || item.tag_id}
                    hasAlarm={Boolean(item.connections?.some((connection) => connection.kind === 'alert'))}
                    isSelected={selectedWidgetIds.includes(item.id)}
                    onEdit={(widget) => {
                      setEditingItem(widget);
                      setShowForm(true);
                    }}
                    onDelete={handleDeleteWidget}
                    onSelect={handleSelectWidget}
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
                      className={`diagram-admin-list__item ${selectedWidgetIds.includes(item.id) ? 'is-selected' : ''}`}
                      onClick={() => {
                        handleSelectWidget(item, false);
                      }}
                      onDoubleClick={() => {
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
            snapToGrid={snapToGrid}
            gridSize={gridSize}
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
