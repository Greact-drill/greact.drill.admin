import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    getTagCustomizationForAdmin, 
    createTagCustomization, 
    deleteTagCustomization,
    getEdgeChildren,
    getTagsForAdmin,
    type TagCustomization,
    type Edge,
    type Tag,
    getAllWidgetConfigs
} from '../api/admin';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { InputText } from 'primereact/inputtext';
import EdgeTreeSelector from './EdgeTreeSelector';
import EdgePathDisplay from './EdgePathDisplay';
import BulkWidgetCreator from './BulkWidgetCreator';

// Интерфейс для конфигурации виджета из JSON
interface WidgetConfig {
    page: string; // ID edge или 'MAIN_PAGE' для главной
    widgetType: 'gauge' | 'bar' | 'number' | 'status' | 'compact' | 'card';
    position: { x: number; y: number };
    customLabel?: string;
    displayType?: 'widget' | 'compact' | 'card'; // Как отображать на разных страницах
}

// Интерфейс для элемента layout (расширяет WidgetConfig)
interface LayoutItem extends WidgetConfig {
    id: string;
    edge_id: string;
    tag_id: string;
}

// Интерфейс для данных конфигурации с сервера
interface ServerWidgetConfig {
    edge_id: string;
    tag_id: string;
    config: WidgetConfig;
}

interface Props {
    title: string;
}

const WIDGET_TYPES = [
    { label: 'Манометр', value: 'gauge', icon: 'pi pi-chart-line' },
    { label: 'Вертикальная шкала', value: 'bar', icon: 'pi pi-chart-bar' },
    { label: 'Числовое значение', value: 'number', icon: 'pi pi-hashtag' },
    { label: 'Статус', value: 'status', icon: 'pi pi-info-circle' },
    { label: 'Компактный вид', value: 'compact', icon: 'pi pi-th-large' },
    { label: 'Карточка', value: 'card', icon: 'pi pi-id-card' }
];

// Генерация доступных страниц на основе выбранного edge
const getAvailablePages = (selectedEdge: string, edgePath: Edge[]): Array<{label: string, value: string}> => {
    const pages: Array<{label: string, value: string}> = [];
    
    // 1. Главная страница буровой (компактные виджеты)
    if (edgePath.length > 0) {
        const rootEdge = edgePath[0]; // Корневой элемент (буровая)
        pages.push({ 
            label: `Главная страница (${rootEdge.name})`, 
            value: `MAIN_${rootEdge.id}` 
        });
    }
    
    // 2. Страница выбранного edge (полноценные виджеты)
    pages.push({ 
        label: `Страница оборудования (${edgePath[edgePath.length - 1]?.name || selectedEdge})`, 
        value: selectedEdge 
    });
    
    // 3. Родительские страницы (если есть)
    edgePath.forEach((edge, index) => {
        if (index < edgePath.length - 1) { // Все кроме текущего
            pages.push({ 
                label: `Родительская: ${edge.name}`, 
                value: edge.id 
            });
        }
    });
    
    return pages;
};

// Компонент виджета для перетаскивания
const DraggableWidget: React.FC<{ 
    item: LayoutItem; 
    tagName: string;
    onEdit: (item: LayoutItem) => void;
    onDelete: (id: string) => void;
}> = ({ item, tagName, onEdit, onDelete }) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'widget',
        item: { id: item.id, currentPosition: item.position },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }));

    const getWidgetIcon = (type: string) => {
        return WIDGET_TYPES.find(w => w.value === type)?.icon || 'pi pi-cog';
    };

    const getWidgetDisplayType = (item: LayoutItem) => {
        if (item.page.startsWith('MAIN_')) return 'main-page';
        return 'widget-page';
    };

    return (
        <div
            ref={drag as any}
            className={`widget-item ${isDragging ? 'dragging' : ''} ${getWidgetDisplayType(item)}`}
            style={{
                left: `${item.position.x}px`,
                top: `${item.position.y}px`,
            }}
            data-page-type={getWidgetDisplayType(item)}
        >
            <div className="widget-header">
                <i className={getWidgetIcon(item.widgetType)}></i>
                <span className="widget-label">
                    {item.customLabel || tagName || `Тег ${item.tag_id}`}
                </span>
            </div>
            <div className="widget-meta">
                <small className="widget-type">{item.widgetType}</small>
                <small className="widget-page-type">
                    {item.page.startsWith('MAIN_') ? 'Главная' : 'Страница'}
                </small>
            </div>
            <div className="widget-actions">
                <Button 
                    icon="pi pi-pencil" 
                    className="p-button-text p-button-sm" 
                    onClick={() => onEdit(item)}
                    tooltip="Редактировать"
                />
                <Button 
                    icon="pi pi-trash" 
                    className="p-button-text p-button-sm p-button-danger" 
                    onClick={() => onDelete(item.id)}
                    tooltip="Удалить"
                />
            </div>
        </div>
    );
};

// Область для размещения виджетов
const DropZone: React.FC<{ 
    page: string; 
    pageName: string;
    pageType: 'main' | 'widget';
    children: React.ReactNode;
    onDrop: (item: any, position: { x: number; y: number }) => void;
}> = ({ page, pageName, pageType, children, onDrop }) => {
    const dropRef = useRef<HTMLDivElement>(null);

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'widget',
        drop: (item: any, monitor) => {
            const offset = monitor.getSourceClientOffset();
            const dropZoneRect = dropRef.current?.getBoundingClientRect();
            
            if (offset && dropZoneRect) {
                const relativeX = offset.x - dropZoneRect.left;
                const relativeY = offset.y - dropZoneRect.top;
                
                onDrop(item, { x: relativeX, y: relativeY });
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    }));

    drop(dropRef);

    const getZoneTitle = () => {
        if (pageType === 'main') return 'Главная страница (компактные виджеты)';
        return 'Страница оборудования (полноценные виджеты)';
    };

    return (
        <div 
            ref={dropRef}
            className={`drop-zone ${isOver ? 'drop-over' : ''} ${pageType}`}
            data-page={page}
        >
            <div className="drop-zone-header">
                <h3>{pageName}</h3>
                <div className="drop-zone-info">
                    <span className="zone-type">{getZoneTitle()}</span>
                    <span className="zone-id">ID: {page}</span>
                </div>
            </div>
            {children}
        </div>
    );
};

// Форма редактирования виджета
const WidgetForm: React.FC<{
    item: LayoutItem | null;
    tags: Tag[];
    availablePages: Array<{label: string, value: string}>;
    onSave: (item: LayoutItem) => void;
    onCancel: () => void;
}> = ({ item, tags, availablePages, onSave, onCancel }) => {
    const [formData, setFormData] = useState<LayoutItem>(item!);
    const [error, setError] = useState('');

    useEffect(() => {
        if (item) {
            setFormData(item);
        }
    }, [item]);

    const handleSave = () => {
        if (!formData.tag_id || !formData.widgetType || !formData.page) {
            setError('Не все обязательные поля заполнены.');
            return;
        }

        // Автоматически определяем displayType на основе типа страницы
        const displayType: 'widget' | 'compact' | 'card' = formData.page.startsWith('MAIN_') ? 'compact' : 'widget';
        const widgetData: LayoutItem = {
            ...formData,
            displayType
        };

        console.log('Сохранение виджета:', widgetData);
        setError('');
        onSave(widgetData);
    };

    const inputStyle = { backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' };
    const labelStyle = { color: 'var(--text-primary)' };

    return (
        <div className="widget-form">
            {error && <Message severity="error" text={error} className="mb-3" />}
            
            <div className="field mt-3">
                <label className="font-semibold mb-2 block" style={labelStyle}>Тег</label>
                <select
                    value={formData.tag_id}
                    onChange={(e) => setFormData({ ...formData, tag_id: e.target.value })}
                    className="p-dropdown w-full"
                    style={inputStyle}
                >
                    <option value="">Выберите тег</option>
                    {tags.map(tag => (
                        <option key={tag.id} value={tag.id}>
                            {tag.name} ({tag.id})
                        </option>
                    ))}
                </select>
            </div>

            <div className="field mt-3">
                <label className="font-semibold mb-2 block" style={labelStyle}>Страница размещения</label>
                <select
                    value={formData.page}
                    onChange={(e) => setFormData({ ...formData, page: e.target.value })}
                    className="p-dropdown w-full"
                    style={inputStyle}
                >
                    {availablePages.map(page => (
                        <option key={page.value} value={page.value}>
                            {page.label}
                        </option>
                    ))}
                </select>
                <small style={{ color: 'var(--text-secondary)' }}>
                    {formData.page.startsWith('MAIN_') 
                        ? 'Виджет будет отображаться компактно на главной странице'
                        : 'Виджет будет отображаться полноценно на странице оборудования'}
                </small>
            </div>

            <div className="field mt-3">
                <label className="font-semibold mb-2 block" style={labelStyle}>Тип отображения</label>
                <div className="display-type-info">
                    {formData.page.startsWith('MAIN_') ? (
                        <div className="display-type-badge main-page">
                            <i className="pi pi-th-large"></i>
                            <span>Компактный вид на главной</span>
                        </div>
                    ) : (
                        <div className="display-type-badge widget-page">
                            <i className="pi pi-desktop"></i>
                            <span>Полноценный виджет</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="field mt-3">
                <label className="font-semibold mb-2 block" style={labelStyle}>Тип виджета</label>
                <select
                    value={formData.widgetType}
                    onChange={(e) => setFormData({ ...formData, widgetType: e.target.value as any })}
                    className="p-dropdown w-full"
                    style={inputStyle}
                >
                    {WIDGET_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                            {type.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="field mt-3">
                <label className="font-semibold mb-2 block" style={labelStyle}>
                    Пользовательская метка (опционально)
                </label>
                <InputText
                    value={formData.customLabel || ''}
                    onChange={(e) => setFormData({ ...formData, customLabel: e.target.value })}
                    placeholder="Введите метку для виджета"
                    style={inputStyle}
                />
            </div>

            <div className="form-actions mt-4">
                <Button 
                    label="Сохранить" 
                    icon="pi pi-check" 
                    onClick={handleSave}
                    style={{backgroundColor: 'var(--accent-primary)', borderColor: 'var(--accent-primary)'}}
                />
                <Button 
                    label="Отмена" 
                    icon="pi pi-times" 
                    className="p-button-secondary" 
                    onClick={onCancel} 
                />
            </div>
        </div>
    );
};

export default function TagLayoutConstructor({ title }: Props) {
    const queryClient = useQueryClient();
    const [layouts, setLayouts] = useState<LayoutItem[]>([]);
    const [selectedEdge, setSelectedEdge] = useState<string>('');
    const [selectedEdgePath, setSelectedEdgePath] = useState<Edge[]>([]);
    const [selectedPage, setSelectedPage] = useState<string>('');
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState<LayoutItem | null>(null);
    const [childEdges, setChildEdges] = useState<Edge[]>([]);
    const [globalSearch, setGlobalSearch] = useState('');
    
    const layoutsRef = useRef<LayoutItem[]>([]);
    
    useEffect(() => {
        layoutsRef.current = layouts;
    }, [layouts]);

    // Загрузка данных
    const { data: tags } = useQuery({
        queryKey: ['tags'],
        queryFn: getTagsForAdmin
    });

    // Загрузка конфигураций виджетов
    const { data: customizations } = useQuery({
        queryKey: ['tag-customization-layout'],
        queryFn: getAllWidgetConfigs,
        refetchOnWindowFocus: false
    });

    const tagsMap = useMemo(() => {
        if (!tags) return new Map();
        return new Map(tags.map(tag => [tag.id, tag.name]));
    }, [tags]);

    // Загрузка дочерних элементов выбранного edge
    useEffect(() => {
        if (selectedEdge) {
            getEdgeChildren(selectedEdge).then(children => {
                setChildEdges(children);
            }).catch(() => {
                setChildEdges([]);
            });
        } else {
            setChildEdges([]);
        }
    }, [selectedEdge]);

    // Автоматически выбираем страницу при выборе edge
    useEffect(() => {
        if (selectedEdge && selectedEdgePath.length > 0) {
            // По умолчанию выбираем страницу оборудования для выбранного edge
            setSelectedPage(selectedEdge);
        }
    }, [selectedEdge, selectedEdgePath]);

    // Преобразование существующих кастомизаций в layout
    useEffect(() => {
        if (!customizations || !Array.isArray(customizations)) return;

        const layoutItems: LayoutItem[] = [];
        
        customizations.forEach((config: any) => {
            // Проверяем, есть ли необходимые поля
            if (config.edge_id && config.tag_id && config.config) {
                try {
                    // Парсим конфигурацию, если она в формате JSON
                    const widgetConfig = typeof config.config === 'string' 
                        ? JSON.parse(config.config) 
                        : config.config;
                    
                    layoutItems.push({
                        id: `${config.edge_id}-${config.tag_id}-${widgetConfig.page}`,
                        edge_id: config.edge_id,
                        tag_id: config.tag_id,
                        ...widgetConfig
                    });
                } catch (error) {
                    console.error('Ошибка парсинга конфигурации:', error);
                }
            }
        });

        console.log('Загружено виджетов:', layoutItems.length);
        setLayouts(layoutItems);
        layoutsRef.current = layoutItems;
    }, [customizations]);

    // Мутация для сохранения одного виджета
    const saveSingleMutation = useMutation({
        mutationFn: async (item: LayoutItem) => {
            console.log('Сохранение одного виджета:', item);
            
            // Удаляем старую кастомизацию, если она есть
            try {
                await deleteTagCustomization(item.edge_id, item.tag_id, 'widgetConfig');
            } catch (error) {
                // Игнорируем ошибку, если записи не было
            }

            const { edge_id, tag_id, id, ...config } = item;
            
            return createTagCustomization({
                edge_id: item.edge_id,
                tag_id: item.tag_id,
                key: 'widgetConfig',
                value: JSON.stringify(config)
            });
        },
        onSuccess: () => {
            console.log('Успешное сохранение одного виджета');
            queryClient.invalidateQueries({ queryKey: ['tag-customization-layout'] });
        },
        onError: (error) => {
            console.error('Ошибка сохранения одного виджета:', error);
        }
    });

    const handleDrop = useCallback((draggedItem: any, position: { x: number; y: number }) => {
        const constrainedPosition = {
            x: Math.max(10, Math.min(position.x, 1500)),
            y: Math.max(10, Math.min(position.y, 600))
        };
        
        const updatedLayouts = layoutsRef.current.map(item =>
            item.id === draggedItem.id
                ? { ...item, position: constrainedPosition }
                : item
        );
        
        setLayouts(updatedLayouts);
        
        const changedWidget = updatedLayouts.find(item => item.id === draggedItem.id);
        if (changedWidget) {
            saveSingleMutation.mutate(changedWidget);
        }
    }, [saveSingleMutation]);

    const handleEdgeSelect = (edgeId: string, edgePath: Edge[]) => {
        console.log('Выбран edge:', edgeId, 'Путь:', edgePath);
        setSelectedEdge(edgeId);
        setSelectedEdgePath(edgePath);
    };

    const handleAddWidget = () => {
        if (!selectedEdge) {
            alert('Сначала выберите элемент в дереве');
            return;
        }

        setEditingItem({
            id: `new-${Date.now()}`,
            edge_id: selectedEdge,
            tag_id: tags?.[0]?.id || '',
            page: selectedPage,
            widgetType: 'gauge',
            position: { x: 50, y: 50 },
            displayType: selectedPage.startsWith('MAIN_') ? 'compact' : 'widget'
        });
        setShowForm(true);
    };

    const handleSaveWidget = (item: LayoutItem) => {
        const existingIndex = layoutsRef.current.findIndex(l => l.id === item.id);
        let newLayouts: LayoutItem[];

        if (existingIndex >= 0) {
            newLayouts = [...layoutsRef.current];
            newLayouts[existingIndex] = item;
        } else {
            newLayouts = [...layoutsRef.current, { 
                ...item, 
                id: `${item.edge_id}-${item.tag_id}-${item.page}` 
            }];
        }

        console.log('Saving widget:', item);
        setLayouts(newLayouts);
        saveSingleMutation.mutate(item);
        setShowForm(false);
        setEditingItem(null);
    };

    const handleDeleteWidget = (id: string) => {
        confirmDialog({
            message: 'Вы уверены, что хотите удалить этот виджет?',
            header: 'Подтверждение удаления',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => {
                const widgetToDelete = layoutsRef.current.find(item => item.id === id);
                const newLayouts = layoutsRef.current.filter(item => item.id !== id);
                
                console.log('Deleting widget:', id);
                setLayouts(newLayouts);
                
                if (widgetToDelete) {
                    deleteTagCustomization(widgetToDelete.edge_id, widgetToDelete.tag_id, 'widgetConfig')
                        .catch(() => {});
                }
            },
        });
    };

    const handleRefresh = () => {
        console.log('Refreshing data from server');
        queryClient.invalidateQueries({ queryKey: ['tag-customization-layout'] });
    };

    const pageLayouts = useMemo(() => {
        if (!selectedPage) return [];
        
        return layouts.filter(item => 
            item.page === selectedPage
        ).filter(item => {
            if (globalSearch) {
                const tagName = tagsMap.get(item.tag_id) || '';
                const widgetLabel = item.customLabel || '';
                return tagName.toLowerCase().includes(globalSearch.toLowerCase()) ||
                       widgetLabel.toLowerCase().includes(globalSearch.toLowerCase());
            }
            return true;
        });
    }, [layouts, selectedPage, globalSearch, tagsMap]);

    const availablePages = useMemo(() => {
        return getAvailablePages(selectedEdge, selectedEdgePath);
    }, [selectedEdge, selectedEdgePath]);

    const selectedPageName = useMemo(() => {
        const page = availablePages.find(p => p.value === selectedPage);
        return page ? page.label : `Страница ${selectedPage}`;
    }, [selectedPage, availablePages]);

    const pageType = useMemo(() => {
        if (selectedPage.startsWith('MAIN_')) return 'main';
        return 'widget';
    }, [selectedPage]);

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="layout-constructor">
                <div className="constructor-header">
                    <h2>{title}</h2>
                    <div className="controls">
                        <div className="p-input-icon-left">
                            <i className="pi pi-search" />
                            <input
                                type="text"
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                placeholder="Поиск по виджетам..."
                                className="p-inputtext mr-2"
                            />
                        </div>
                        {selectedEdge && (
                            <>
                                <select
                                    value={selectedPage}
                                    onChange={(e) => setSelectedPage(e.target.value)}
                                    className="p-dropdown mr-2"
                                >
                                    {availablePages.map(page => (
                                        <option key={page.value} value={page.value}>
                                            {page.label}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    label="Добавить виджет"
                                    icon="pi pi-plus"
                                    onClick={handleAddWidget}
                                    style={{backgroundColor: 'var(--accent-primary)', borderColor: 'var(--accent-primary)'}}
                                    className="mr-2"
                                />
                            </>
                        )}
                        <Button
                            label="Обновить"
                            icon="pi pi-refresh"
                            onClick={handleRefresh}
                            severity="info"
                        />
                    </div>
                </div>

                {(saveSingleMutation.error) && (
                    <Message severity="error" text={`Ошибка сохранения: ${saveSingleMutation.error?.message}`} />
                )}

                {(saveSingleMutation.isPending) && (
                    <Message severity="info" text="Сохранение..." />
                )}

                <div className="constructor-content-grid">
                    {/* Левая колонка: дерево edge */}
                    <div className="tree-column">
                        <EdgeTreeSelector
                            selectedEdgeId={selectedEdge}
                            onSelectEdge={handleEdgeSelect}
                        />
                        
                        {selectedEdge && childEdges.length > 0 && (
                            <div className="selection-info mt-4">
                                <div className="selected-edge-info">
                                    <h4>Выбрано: {selectedEdgePath[selectedEdgePath.length - 1]?.name || selectedEdge}</h4>
                                    <p className="text-sm">Дочерних элементов: {childEdges.length}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Правая колонка: конструктор виджетов */}
                    <div className="widget-column">
                        {selectedEdge ? (
                            <>
                                <EdgePathDisplay edgePath={selectedEdgePath} />
                                
                                <div className="page-info mb-3">
                                    <h3>Конструктор виджетов</h3>
                                    <div className="page-stats">
                                        <span className="stat-item">
                                            <i className="pi pi-tags"></i>
                                            Виджетов на странице: {pageLayouts.length}
                                        </span>
                                        <span className="stat-item">
                                            <i className="pi pi-sitemap"></i>
                                            Тип страницы: {pageType === 'main' ? 'Главная' : 'Оборудование'}
                                        </span>
                                    </div>
                                </div>

                                <DropZone 
                                    page={selectedPage} 
                                    pageName={selectedPageName}
                                    pageType={pageType}
                                    onDrop={handleDrop}
                                >
                                    {pageLayouts.map(item => (
                                        <DraggableWidget
                                            key={item.id}
                                            item={item}
                                            tagName={tagsMap.get(item.tag_id) || `Тег ${item.tag_id}`}
                                            onEdit={setEditingItem}
                                            onDelete={handleDeleteWidget}
                                        />
                                    ))}
                                    {pageLayouts.length === 0 && (
                                        <div className="empty-state">
                                            <i className="pi pi-inbox" style={{ fontSize: '3rem' }}></i>
                                            <p>Перетащите виджеты сюда или нажмите "Добавить виджет"</p>
                                            <p className="text-sm">
                                                {selectedPage 
                                                    ? `На странице "${selectedPageName}" пока нет виджетов` 
                                                    : 'Выберите страницу для отображения виджетов'}
                                            </p>
                                        </div>
                                    )}
                                </DropZone>
                            </>
                        ) : (
                            <div className="no-selection-message">
                                <i className="pi pi-sitemap" style={{ fontSize: '4rem' }}></i>
                                <h3>Выберите элемент в дереве</h3>
                                <p>Для начала работы выберите элемент из иерархии оборудования слева</p>
                            </div>
                        )}
                    </div>
                </div>

                <Dialog
                    visible={showForm}
                    style={{ width: '500px' }}
                    header={editingItem?.id.startsWith('new') ? 'Добавить виджет' : 'Редактировать виджет'}
                    modal
                    className="p-fluid admin-dialog"
                    onHide={() => {
                        setShowForm(false);
                        setEditingItem(null);
                    }}
                >
                    <WidgetForm
                        item={editingItem}
                        tags={tags || []}
                        availablePages={availablePages}
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