// components/TagLayoutConstructor.tsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    getTagCustomizationForAdmin, 
    createTagCustomization, 
    deleteTagCustomization,
    getEdgesForAdmin,
    getTagsForAdmin,
    type TagCustomization,
    type Edge,
    type Tag
} from '../api/admin';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { InputText } from 'primereact/inputtext';

// Интерфейс для конфигурации виджета из JSON
interface WidgetConfig {
    page: 'KTU' | 'PUMPBLOCK';
    widgetType: 'gauge' | 'bar' | 'number' | 'status';
    position: { x: number; y: number };
    customLabel?: string;
}

// Интерфейс для элемента layout (расширяет WidgetConfig)
interface LayoutItem extends WidgetConfig {
    id: string;
    edge_id: string;
    tag_id: string;
}

interface Props {
    title: string;
}

const WIDGET_TYPES = [
    { label: 'Манометр', value: 'gauge', icon: 'pi pi-chart-line' },
    { label: 'Вертикальная шкала', value: 'bar', icon: 'pi pi-chart-bar' },
    { label: 'Числовое значение', value: 'number', icon: 'pi pi-hashtag' },
    { label: 'Статус', value: 'status', icon: 'pi pi-info-circle' }
];

const PAGES = [
    { label: 'КТУ', value: 'KTU' },
    { label: 'Насосный блок', value: 'PUMPBLOCK' }
];

// Компонент виджета для перетаскивания
const DraggableWidget: React.FC<{ 
    item: LayoutItem; 
    tagName: string; // Добавляем пропс с названием тега
    onEdit: (item: LayoutItem) => void;
    onDelete: (id: string) => void;
    onPositionChange: (id: string, position: { x: number; y: number }) => void;
}> = ({ item, tagName, onEdit, onDelete, onPositionChange }) => {
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

    return (
        <div
            ref={drag as any}
            className={`widget-item ${isDragging ? 'dragging' : ''}`}
            style={{
                left: `${item.position.x}px`,
                top: `${item.position.y}px`,
            }}
        >
            <div className="widget-header">
                <i className={getWidgetIcon(item.widgetType)}></i>
                <span className="widget-label">
                    {item.customLabel || tagName || `Виджет ${item.tag_id}`}
                </span>
            </div>
            <div className="widget-actions">
                <Button 
                    icon="pi pi-pencil" 
                    className="p-button-text p-button-sm" 
                    onClick={() => onEdit(item)}
                />
                <Button 
                    icon="pi pi-trash" 
                    className="p-button-text p-button-sm p-button-danger" 
                    onClick={() => onDelete(item.id)}
                />
            </div>
        </div>
    );
};

// Область для размещения виджетов
const DropZone: React.FC<{ 
    page: string; 
    children: React.ReactNode;
    onDrop: (item: any, position: { x: number; y: number }) => void;
}> = ({ page, children, onDrop }) => {
    const dropRef = useRef<HTMLDivElement>(null);

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'widget',
        drop: (item: any, monitor) => {
            const offset = monitor.getSourceClientOffset();
            const dropZoneRect = dropRef.current?.getBoundingClientRect();
            
            if (offset && dropZoneRect) {
                // Вычисляем относительные координаты внутри drop-zone
                const relativeX = offset.x - dropZoneRect.left;
                const relativeY = offset.y - dropZoneRect.top;
                
                console.log('Drop coordinates:', {
                    absolute: { x: offset.x, y: offset.y },
                    dropZone: { left: dropZoneRect.left, top: dropZoneRect.top },
                    relative: { x: relativeX, y: relativeY }
                });
                
                onDrop(item, { x: relativeX, y: relativeY });
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    }));

    // Используем ref для drop-zone
    drop(dropRef);

    return (
        <div 
            ref={dropRef}
            className={`drop-zone ${isOver ? 'drop-over' : ''}`}
            data-page={page}
        >
            <div className="drop-zone-header">
                <h3>{PAGES.find(p => p.value === page)?.label}</h3>
                <div className="drop-zone-info">
                    Размер: {dropRef.current?.offsetWidth} x {dropRef.current?.offsetHeight}
                </div>
            </div>
            {children}
        </div>
    );
};

// Форма редактирования виджета
const WidgetForm: React.FC<{
    item: LayoutItem | null;
    edges: Edge[];
    tags: Tag[];
    onSave: (item: LayoutItem) => void;
    onCancel: () => void;
}> = ({ item, edges, tags, onSave, onCancel }) => {
    const [formData, setFormData] = useState<LayoutItem>(item!);
    const [error, setError] = useState('');

    useEffect(() => {
        if (item) {
            setFormData(item);
        }
    }, [item]);

    const handleSave = () => {
        // Валидация
        if (!formData.edge_id || !formData.tag_id || !formData.widgetType) {
            setError('Не все обязательные поля заполнены.');
            return;
        }

        console.log('Сохранение виджета:', formData);
        setError('');
        onSave(formData);
    };

    const inputStyle = { backgroundColor: '#1e1e2f', borderColor: '#3a3c53' };
    const labelStyle = { color: '#a0a2b8' };

    return (
        <div className="widget-form">
            {error && <Message severity="error" text={error} className="mb-3" />}
            
            <div className="field">
                <label className="font-semibold mb-2 block" style={labelStyle}>Буровая</label>
                <Dropdown
                    value={formData.edge_id}
                    onChange={(e) => setFormData({ ...formData, edge_id: e.value })}
                    options={edges || []}
                    optionLabel="name"
                    optionValue="id"
                    placeholder="Выберите буровую"
                    style={inputStyle}
                />
            </div>

            <div className="field mt-3">
                <label className="font-semibold mb-2 block" style={labelStyle}>Тег</label>
                <Dropdown
                    value={formData.tag_id}
                    onChange={(e) => setFormData({ ...formData, tag_id: e.value })}
                    options={tags || []}
                    optionLabel="name"
                    optionValue="id"
                    placeholder="Выберите тег"
                    style={inputStyle}
                />
            </div>

            <div className="field mt-3">
                <label className="font-semibold mb-2 block" style={labelStyle}>Страница</label>
                <Dropdown
                    value={formData.page}
                    onChange={(e) => setFormData({ ...formData, page: e.value })}
                    options={PAGES}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Выберите страницу"
                    style={inputStyle}
                />
            </div>

            <div className="field mt-3">
                <label className="font-semibold mb-2 block" style={labelStyle}>Тип виджета</label>
                <Dropdown
                    value={formData.widgetType}
                    onChange={(e) => setFormData({ ...formData, widgetType: e.value })}
                    options={WIDGET_TYPES}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Выберите тип виджета"
                    style={inputStyle}
                />
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
    const [selectedPage, setSelectedPage] = useState<'KTU' | 'PUMPBLOCK'>('KTU');
    const [selectedEdge, setSelectedEdge] = useState<string>('');
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState<LayoutItem | null>(null);
    const [globalSearch, setGlobalSearch] = useState('');
    
    // Используем useRef для хранения актуального состояния layouts
    const layoutsRef = useRef<LayoutItem[]>([]);
    
    // Синхронизируем ref с состоянием
    useEffect(() => {
        layoutsRef.current = layouts;
    }, [layouts]);

    // Загрузка данных
    const { data: edges } = useQuery({
        queryKey: ['edges'],
        queryFn: getEdgesForAdmin
    });

    const { data: tags } = useQuery({
        queryKey: ['tags'],
        queryFn: getTagsForAdmin
    });

    const { data: customizations } = useQuery({
        queryKey: ['tag-customization-layout'],
        queryFn: getTagCustomizationForAdmin,
        refetchOnWindowFocus: false
    });

    // Создаем карту тегов для быстрого доступа
    const tagsMap = useMemo(() => {
        if (!tags) return new Map();
        return new Map(tags.map(tag => [tag.id, tag.name]));
    }, [tags]);

    // Устанавливаем первую буровую по умолчанию при загрузке edges
    useEffect(() => {
        if (edges && edges.length > 0 && !selectedEdge) {
            setSelectedEdge(edges[0].id);
        }
    }, [edges, selectedEdge]);

    // Преобразование существующих кастомизаций в layout
    useEffect(() => {
        if (!customizations || !Array.isArray(customizations)) return;

        const layoutItems: LayoutItem[] = [];
        
        (customizations as TagCustomization[]).forEach((custom: TagCustomization) => {
            // Ищем записи с ключом widgetConfig
            if (custom.key === 'widgetConfig') {
                try {
                    const config: WidgetConfig = JSON.parse(custom.value);
                    
                    layoutItems.push({
                        id: `${custom.edge_id}-${custom.tag_id}-${config.page}`,
                        edge_id: custom.edge_id,
                        tag_id: custom.tag_id,
                        ...config
                    });
                } catch (error) {
                    console.error('Ошибка парсинга конфига виджета:', error);
                }
            }
        });

        console.log('Загружено виджетов:', layoutItems.length);
        setLayouts(layoutItems);
        layoutsRef.current = layoutItems;
    }, [customizations]);

    // Мутация для сохранения всех виджетов
    const saveAllMutation = useMutation({
        mutationFn: async (layoutItems: LayoutItem[]) => {
            console.log('Сохранение всех виджетов:', layoutItems);
            
            // Удаляем все существующие кастомизации с ключом widgetConfig
            const deletePromises = layoutItems.map(item =>
                deleteTagCustomization(item.edge_id, item.tag_id, 'widgetConfig')
                    .catch(() => {})
            );
            await Promise.all(deletePromises);

            // Создаем новые кастомизации с полным конфигом в value
            const createPromises = layoutItems.map(item => {
                // Извлекаем конфигурацию (без edge_id и tag_id)
                const { edge_id, tag_id, id, ...config } = item;
                
                return createTagCustomization({
                    edge_id: item.edge_id,
                    tag_id: item.tag_id,
                    key: 'widgetConfig',
                    value: JSON.stringify(config)
                });
            });

            await Promise.all(createPromises);
        },
        onSuccess: () => {
            console.log('Успешное сохранение всех виджетов');
        },
        onError: (error) => {
            console.error('Ошибка сохранения всех виджетов:', error);
        }
    });

    // Мутация для сохранения одного виджета
    const saveSingleMutation = useMutation({
        mutationFn: async (item: LayoutItem) => {
            console.log('Сохранение одного виджета:', item);
            
            // Удаляем старую кастомизацию
            await deleteTagCustomization(item.edge_id, item.tag_id, 'widgetConfig')
                .catch(() => {});

            // Создаем новую кастомизацию
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
        },
        onError: (error) => {
            console.error('Ошибка сохранения одного виджета:', error);
        }
    });

    // Функция для обработки перетаскивания
    const handleDrop = useCallback((draggedItem: any, position: { x: number; y: number }) => {
        console.log('Handling drop for item:', draggedItem, 'at position:', position);
        
        // Ограничиваем позицию в пределах drop-zone
        const constrainedPosition = {
            x: Math.max(10, Math.min(position.x, 1000)),
            y: Math.max(10, Math.min(position.y, 600))
        };
        
        // Используем актуальное состояние из ref
        const updatedLayouts = layoutsRef.current.map(item =>
            item.id === draggedItem.id
                ? { ...item, position: constrainedPosition }
                : item
        );
        
        console.log('Updated layouts:', updatedLayouts);
        
        // Обновляем состояние
        setLayouts(updatedLayouts);
        
        // Сохраняем только измененный виджет
        const changedWidget = updatedLayouts.find(item => item.id === draggedItem.id);
        if (changedWidget) {
            saveSingleMutation.mutate(changedWidget);
        }
    }, [saveSingleMutation]);

    // Функция для автоматического расположения виджетов
    const autoArrangeWidgets = () => {
        console.log('Auto arranging widgets');
        const newLayouts = [...layoutsRef.current];
        const margin = 20;
        
        let x = margin;
        let y = margin;
        let rowHeight = 0;

        // Сортируем виджеты по типу (сначала широкие)
        const sortedLayouts = newLayouts.sort((a, b) => {
            const typeA = (a.widgetType === 'gauge' || a.widgetType === 'bar') ? 0 : 1;
            const typeB = (b.widgetType === 'gauge' || b.widgetType === 'bar') ? 0 : 1;
            return typeA - typeB;
        });

        sortedLayouts.forEach(item => {
            const dimensions = item.widgetType === 'bar' 
                ? { width: 250, height: 500 } 
                : { width: 250, height: 250 };
            
            if (x + dimensions.width > 1200) {
                x = margin;
                y += rowHeight + margin;
                rowHeight = 0;
            }
            
            item.position = { x, y };
            x += dimensions.width + margin;
            rowHeight = Math.max(rowHeight, dimensions.height);
        });

        console.log('Auto arranged layouts:', sortedLayouts);
        setLayouts(sortedLayouts);
        saveAllMutation.mutate(sortedLayouts);
    };

    const handleAddWidget = () => {
        setEditingItem({
            id: `new-${Date.now()}`,
            edge_id: selectedEdge || edges?.[0]?.id || '',
            tag_id: tags?.[0]?.id || '',
            page: selectedPage,
            widgetType: 'gauge',
            position: { x: 50, y: 50 }
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
                
                // Удаляем виджет из базы данных
                if (widgetToDelete) {
                    deleteTagCustomization(widgetToDelete.edge_id, widgetToDelete.tag_id, 'widgetConfig')
                        .catch(() => {});
                }
            },
        });
    };

    // Функция для принудительного обновления данных с сервера
    const handleRefresh = () => {
        console.log('Refreshing data from server');
        queryClient.invalidateQueries({ queryKey: ['tag-customization-layout'] });
    };

    // Фильтрация виджетов по выбранной странице и буровой
    const pageLayouts = useMemo(() => {
        return layouts.filter(item => 
            item.page === selectedPage && 
            item.edge_id === selectedEdge
        );
    }, [layouts, selectedPage, selectedEdge]);

    console.log('Current state:', {
        layoutsCount: layouts.length,
        pageLayoutsCount: pageLayouts.length,
        selectedPage,
        selectedEdge
    });

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="layout-constructor">
                <div className="constructor-header">
                    <h2>{title}</h2>
                    <div className="controls">
                        <div className="p-input-icon-left">
                            <i className="pi pi-search" />
                            <InputText 
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                placeholder="Поиск по виджетам..."
                                className="mr-2"
                            />
                        </div>
                        <Dropdown
                            value={selectedEdge}
                            onChange={(e) => setSelectedEdge(e.value)}
                            options={edges || []}
                            optionLabel="name"
                            optionValue="id"
                            placeholder="Выберите буровую"
                            className="mr-2"
                        />
                        <Dropdown
                            value={selectedPage}
                            onChange={(e) => setSelectedPage(e.value)}
                            options={PAGES}
                            placeholder="Выберите страницу"
                            className="mr-2"
                        />
                        <Button
                            label="Добавить виджет"
                            icon="pi pi-plus"
                            onClick={handleAddWidget}
                            style={{backgroundColor: 'var(--accent-primary)', borderColor: 'var(--accent-primary)'}}
                            className="mr-2"
                        />
                        <Button
                            label="Авто-расположение"
                            icon="pi pi-th-large"
                            onClick={autoArrangeWidgets}
                            severity="secondary"
                            disabled={pageLayouts.length === 0}
                            className="mr-2"
                        />
                        <Button
                            label="Обновить"
                            icon="pi pi-refresh"
                            onClick={handleRefresh}
                            severity="info"
                        />
                    </div>
                </div>

                {(saveAllMutation.error || saveSingleMutation.error) && (
                    <Message severity="error" text={`Ошибка сохранения: ${saveAllMutation.error?.message || saveSingleMutation.error?.message}`} />
                )}

                {(saveAllMutation.isPending || saveSingleMutation.isPending) && (
                    <Message severity="info" text="Сохранение..." />
                )}

                <div className="constructor-content">
                    <DropZone page={selectedPage} onDrop={handleDrop}>
                        {pageLayouts.map(item => (
                            <DraggableWidget
                                key={item.id}
                                item={item}
                                tagName={tagsMap.get(item.tag_id) || `Тег ${item.tag_id}`} // Передаем название тега
                                onEdit={setEditingItem}
                                onDelete={handleDeleteWidget}
                                onPositionChange={() => {}}
                            />
                        ))}
                        {pageLayouts.length === 0 && (
                            <div className="empty-state">
                                <i className="pi pi-inbox" style={{ fontSize: '3rem' }}></i>
                                <p>Перетащите виджеты сюда или нажмите "Добавить виджет"</p>
                                <p className="text-sm">
                                    {selectedEdge 
                                        ? `На этой странице для выбранной буровой пока нет виджетов` 
                                        : 'Выберите буровую для отображения виджетов'}
                                </p>
                            </div>
                        )}
                    </DropZone>
                </div>

                {/* Форма редактирования виджета */}
                <Dialog
                    visible={showForm}
                    style={{ width: '500px', backgroundColor: '#27293d', color: '#fff' }}
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
                        edges={edges || []}
                        tags={tags || []}
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