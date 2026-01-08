import { 
    getEdgesForAdmin, 
    deleteEdge, 
    createEdge, 
    updateEdge, 
    type Edge 
} from '../api/admin'; 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { ProgressSpinner } from 'primereact/progressspinner';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { TreeTable } from 'primereact/treetable';
import { Column } from 'primereact/column';
import React, { useState, useMemo } from 'react';

interface Props {
    title: string;
}

interface TreeNode {
    key: string;
    data: Edge;
    children: TreeNode[];
    icon?: string;
    level?: number;
}

const EdgeForm: React.FC<{ 
    edge?: Edge | null; 
    onClose: () => void; 
    edges: Edge[];
}> = ({ edge, onClose, edges }) => {
    const queryClient = useQueryClient();
    const isEdit = !!edge;
    const [name, setName] = useState(edge?.name || '');
    const [id, setId] = useState(edge?.id || '');
    const [parentId, setParentId] = useState(edge?.parent_id || '');
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: (data: any) => 
            isEdit ? updateEdge(edge!.id, data) : createEdge({ id, name, parent_id: parentId || undefined }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['edges'] });
            onClose();
        },
        onError: (err: any) => {
            setError(err.message || 'Ошибка выполнения операции.');
        },
    });

    // Фильтруем edges для выбора родителя (исключаем текущий edge и его потомков)
    const availableParents = useMemo(() => {
        if (!edges) return [];
        
        return edges.filter(e => 
            !isEdit || (e.id !== edge!.id && !isDescendant(e, edge!.id, edges))
        );
    }, [edges, edge, isEdit]);

    // Проверка является ли edge потомком
    function isDescendant(edge: Edge, targetId: string, allEdges: Edge[]): boolean {
        if (edge.parent_id === targetId) return true;
        if (!edge.parent_id) return false;
        
        const parent = allEdges.find(e => e.id === edge.parent_id);
        return parent ? isDescendant(parent, targetId, allEdges) : false;
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name || (!isEdit && !id)) {
            setError('ID и Название не могут быть пустыми.');
            return;
        }
        
        const payload: any = { name };
        if (!isEdit) {
            payload.id = id;
        }
        if (parentId) {
            payload.parent_id = parentId;
        } else {
            payload.parent_id = null;
        }

        mutation.mutate(payload);
    };
    
    const inputStyle = { backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' };
    const labelStyle = { color: 'var(--text-primary)' };

    return (
        <form onSubmit={handleSubmit} className="p-fluid">
            {error && <Message severity="error" text={error} className="mb-3" />}
            
            <div className="field">
                <label htmlFor="id" className="font-semibold mb-2 block" style={labelStyle}>ID (Ключ)</label>
                <InputText 
                    id="id" 
                    value={id} 
                    onChange={(e) => setId(e.target.value)} 
                    disabled={isEdit || mutation.isPending} 
                    required 
                    style={inputStyle}
                />
            </div>
            
            <div className="field mt-3">
                <label htmlFor="name" className="font-semibold mb-2 block" style={labelStyle}>Название</label>
                <InputText 
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)} 
                    required 
                    disabled={mutation.isPending}
                    style={inputStyle}
                />
            </div>

            <div className="field mt-3">
                <label htmlFor="parent" className="font-semibold mb-2 block" style={labelStyle}>Родительский Edge</label>
                <Dropdown
                    id="parent"
                    value={parentId}
                    onChange={(e) => setParentId(e.value)}
                    options={[{ id: '', name: 'Нет родителя (корневой элемент)' }, ...availableParents]}
                    optionLabel="name"
                    optionValue="id"
                    placeholder="Выберите родительский edge"
                    disabled={mutation.isPending}
                    style={inputStyle}
                />
            </div>

            <div className="flex justify-content-center gap-4 edge-form-footer mt-4"> 
                <Button 
                    icon="pi pi-check"
                    type="submit" 
                    loading={mutation.isPending} 
                    tooltip={isEdit ? 'Сохранить' : 'Создать'}
                    className="p-button-rounded"
                />
                <Button 
                    icon="pi pi-times"
                    onClick={onClose} 
                    className="p-button-danger p-button-rounded" 
                    disabled={mutation.isPending} 
                    tooltip="Отмена"
                    style={{width: '2.5rem', height: '2.5rem', padding: '0'}} 
                />
            </div>
        </form>
    );
};
export default function EdgesTable({ title }: Props) {
    const queryClient = useQueryClient();
    const [openForm, setOpenForm] = useState(false);
    const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
    const [deleteError, setDeleteError] = useState('');
    const [globalFilterValue, setGlobalFilterValue] = useState('');
    const [expandedKeys, setExpandedKeys] = useState<any>({}); // Все свернуто по умолчанию

    const { data: edges, isLoading, error } = useQuery<Edge[]>({
        queryKey: ['edges'],
        queryFn: getEdgesForAdmin,
    });

    const deleteMutation = useMutation({
        mutationFn: deleteEdge,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['edges'] });
            setDeleteError('');
        },
        onError: (err: any) => {
            setDeleteError(err.message || 'Не удалось удалить edge.');
        }
    });

    // Функция для построения дерева из плоских данных
    // Функция для построения дерева из плоских данных
    const buildTreeFromFlatData = (flatData: Edge[]): TreeNode[] => {
        if (!flatData || flatData.length === 0) return [];
        
        const map = new Map<string, TreeNode>();
        const tree: TreeNode[] = [];

        // Сначала создаем все узлы
        flatData.forEach(edge => {
            const hasChildren = flatData.some(e => e.parent_id === edge.id);
            const icon = hasChildren ? 'pi pi-folder' : 'pi pi-file';
            
            const node: TreeNode = {
                key: edge.id,
                data: edge,
                children: [],
                icon: icon
            };
            map.set(edge.id, node);
        });

        // Затем строим иерархию
        flatData.forEach(edge => {
            const node = map.get(edge.id);
            if (edge.parent_id && map.has(edge.parent_id)) {
                const parent = map.get(edge.parent_id);
                if (parent) {
                    parent.children.push(node!);
                    if (parent.icon === 'pi pi-file') {
                        parent.icon = 'pi pi-folder';
                    }
                }
            } else {
                tree.push(node!);
            }
        });

        // Добавляем вычисление уровня для каждого узла
        const assignLevels = (nodes: TreeNode[], level = 0) => {
            nodes.forEach(node => {
                node.level = level;
                if (node.children && node.children.length > 0) {
                    assignLevels(node.children, level + 1);
                }
            });
        };
        
        assignLevels(tree);
        return tree;
    };

    // Преобразуем плоские данные в древовидные
    const treeData = useMemo(() => {
        return buildTreeFromFlatData(edges || []);
    }, [edges]);

    const handleEdit = (edge: Edge) => {
        setSelectedEdge(edge);
        setOpenForm(true);
    };

    const handleCreate = () => {
        setSelectedEdge(null);
        setOpenForm(true);
    };

    const handleHideForm = () => {
        setOpenForm(false);
        setSelectedEdge(null);
    };

    const handleDelete = (id: string) => {
        setDeleteError('');
        confirmDialog({
            message: `Вы уверены, что хотите удалить edge с ID: ${id}?`,
            header: 'Подтверждение удаления',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => deleteMutation.mutate(id),
        });
    };

    const actionBodyTemplate = (node: any) => {
        const edge = node.data;
        return (
            <div className="flex gap-2">
                <Button 
                    icon="pi pi-pencil" 
                    className="p-button-rounded p-button-text text-primary"
                    onClick={() => handleEdit(edge)} 
                    tooltip="Редактировать" 
                />
                <Button 
                    icon="pi pi-trash"
                    className="p-button-rounded p-button-text p-button-danger"
                    onClick={() => handleDelete(edge.id)} 
                    tooltip="Удалить" 
                    loading={deleteMutation.isPending && deleteMutation.variables === edge.id}
                />
            </div>
        );
    };

    // Функция для отображения иконки в зависимости от типа узла
    const iconTemplate = (node: any) => {
        const icon = node.icon || (node.children && node.children.length > 0 ? 'pi pi-folder' : 'pi pi-file');
        return <i className={icon} style={{ marginRight: '8px' }} />;
    };

    // Функция для отображения родителя в дереве
    const parentTemplate = (node: any) => {
        if (!node.data.parent_id) return <span style={{ color: 'var(--text-secondary)' }}>Корневой элемент</span>;
        
        const parent = edges?.find(e => e.id === node.data.parent_id);
        return parent ? `${parent.name} (${parent.id})` : node.data.parent_id;
    };

    // Функция для фильтрации дерева
    const filterTree = (nodes: TreeNode[], filter: string): TreeNode[] => {
        if (!filter) return nodes;
        
        const lowerFilter = filter.toLowerCase();
        
        return nodes
            .map(node => {
                const matches = node.data.name.toLowerCase().includes(lowerFilter) ||
                              node.data.id.toLowerCase().includes(lowerFilter);
                
                let children: TreeNode[] = [];
                if (node.children && node.children.length > 0) {
                    children = filterTree(node.children, filter);
                }
                
                // Если узел совпадает или есть совпадающие дети, включаем его
                if (matches || children.length > 0) {
                    return {
                        ...node,
                        children: children.length > 0 ? children : undefined
                    };
                }
                
                return null;
            })
            .filter(Boolean) as TreeNode[];
    };

    const filteredTreeData = useMemo(() => {
        return globalFilterValue ? filterTree(treeData, globalFilterValue) : treeData;
    }, [treeData, globalFilterValue]);

    const header = (
        <div className="flex flex-wrap align-items-center justify-content-between gap-2">
            <h2 className="m-0 text-xl font-semibold">{title}</h2>
            <div className="flex gap-2">
                <span className="p-input-icon-left">
                    <i className="pi pi-search" />
                    <InputText 
                        value={globalFilterValue} 
                        onChange={(e) => setGlobalFilterValue(e.target.value)} 
                        placeholder="Поиск по названию или ID..." 
                    />
                </span>
                <Button 
                    label="Создать Edge" 
                    icon="pi pi-plus" 
                    severity="success" 
                    onClick={handleCreate}
                    style={{backgroundColor: 'var(--accent-primary)', borderColor: 'var(--accent-primary)'}}
                />
            </div>
        </div>
    );

    if (error) {
        return <Message severity="error" text={`Ошибка загрузки данных: ${(error as Error).message}`} />;
    }

    return (
        <div className="edges-tree-table"> {/* Добавлен класс-обертка */}
            {deleteError && <Message severity="error" text={deleteError} className="mb-3" />}
            
            <div className="card">
                {header}
                {isLoading ? (
                    <div className="flex justify-content-center align-items-center p-4">
                        <ProgressSpinner />
                    </div>
                ) : (
                    <TreeTable 
                        value={filteredTreeData}
                        loading={isLoading}
                        expandedKeys={expandedKeys}
                        onToggle={(e) => setExpandedKeys(e.value)}
                        paginator 
                        rows={20}
                        rowsPerPageOptions={[10, 20, 50, 100]}
                        emptyMessage="Edge не найдены."
                        style={{ width: '100%' }}
                        scrollable
                        scrollHeight="flex"
                    >
                        <Column 
                            header="Структура" 
                            style={{ width: '40%' }} 
                            body={(node) => {
                                // Вычисляем отступ: 28px для первого уровня, 56px для второго и т.д.
                                const marginLeft = node.level ? node.level * 28 : 0;
                                const hasChildren = node.children && node.children.length > 0;
                                const isExpanded = expandedKeys[node.key];
                                
                                return (
                                    <div className="flex align-items-center" style={{ marginLeft: `${marginLeft}px` }}>
                                        {/* Кнопка разворачивания/сворачивания */}
                                        {hasChildren && (
                                            <Button 
                                                icon={isExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'} 
                                                className="p-button-text p-button-rounded p-button-plain"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const newExpandedKeys = { ...expandedKeys };
                                                    if (isExpanded) {
                                                        delete newExpandedKeys[node.key];
                                                    } else {
                                                        newExpandedKeys[node.key] = true;
                                                    }
                                                    setExpandedKeys(newExpandedKeys);
                                                }}
                                                style={{ width: '1.5rem', height: '1.5rem', marginRight: '4px' }}
                                            />
                                        )}
                                        {/* Заполнитель для узлов без детей */}
                                        {!hasChildren && <div style={{ width: '1.5rem', marginRight: '4px' }} />}
                                        
                                        {iconTemplate(node)}
                                        <span>{node.data.name}</span>
                                    </div>
                                );
                            }}
                        />
                        <Column 
                            header="ID" 
                            body={(node) => node.data.id}
                            style={{ width: '20%' }} 
                        />
                        <Column 
                            header="Родитель" 
                            body={parentTemplate}
                            style={{ width: '25%' }} 
                        />
                        <Column 
                            body={actionBodyTemplate} 
                            header="Действия" 
                            style={{ width: '15%' }} 
                        />
                    </TreeTable>
                )}
            </div>

            <Dialog 
                visible={openForm}
                style={{ width: '500px' }}
                header={selectedEdge ? `Редактировать: ${selectedEdge.id}` : 'Создать новый Edge'}
                modal
                className="p-fluid"
                onHide={handleHideForm}
            >
                <EdgeForm 
                    edge={selectedEdge}
                    onClose={handleHideForm}
                    edges={edges || []}
                />
            </Dialog>
            
            <ConfirmDialog />
        </div>
    );
}