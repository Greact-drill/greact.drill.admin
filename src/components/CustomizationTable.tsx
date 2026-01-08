import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    type Edge, type Tag, type BaseCustomization, type TagCustomization,
    getEdgeCustomizationForAdmin, createEdgeCustomization, updateEdgeCustomization, deleteEdgeCustomization,
    getTagCustomizationForAdmin, createTagCustomization, updateTagCustomization, deleteTagCustomization,
    getEdgesForAdmin, getTagsForAdmin 
} from '../api/admin'; 

import { type DataTableFilterMeta, DataTable } from 'primereact/datatable';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { FilterMatchMode } from 'primereact/api';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';

type CustomizationType = 'edge' | 'block' | 'tag';

interface Props {
    title: string;
    type: CustomizationType;
}

type CustomizationData = BaseCustomization | TagCustomization;

const CustomizationForm: React.FC<{ 
    initialData?: CustomizationData | null; 
    onClose: () => void; 
    type: CustomizationType;
}> = ({ initialData, onClose, type }) => {
    const queryClient = useQueryClient();
    const isEdit = !!initialData;
    const initialTagData = initialData as TagCustomization | undefined;
    const initialBaseData = initialData as BaseCustomization | undefined;

    const [edgeId, setEdgeId] = useState(initialTagData?.edge_id || initialBaseData?.edge_id || '');
    // const [blockId, setBlockId] = useState(initialBaseData?.block_id || '');
    const [tagId, setTagId] = useState(initialTagData?.tag_id || '');
    const [key, setKey] = useState(initialData?.key || '');
    const [value, setValue] = useState(initialData?.value || '');
    const [error, setError] = useState('');

    const { data: edges, isLoading: isEdgesLoading } = useQuery<Edge[]>({
        queryKey: ['edges'],
        queryFn: getEdgesForAdmin,
        staleTime: Infinity,
        enabled: type !== 'block',
    });

    // const { data: blocks, isLoading: isBlocksLoading } = useQuery<Block[]>({
    //     queryKey: ['blocks'],
    //     queryFn: getBlocksForAdmin,
    //     staleTime: Infinity,
    //     enabled: type === 'block',
    // });

    const { data: tags, isLoading: isTagsLoading } = useQuery<Tag[]>({
        queryKey: ['tags'],
        queryFn: getTagsForAdmin,
        staleTime: Infinity,
        enabled: type === 'tag',
    });
    
    const mutationFn = useMemo(() => {
        if (type === 'edge') {
            return isEdit 
                ? (data: any) => updateEdgeCustomization(edgeId, key, data)
                : (data: any) => createEdgeCustomization(data);
        }
        // if (type === 'block') {
        //     return isEdit 
        //         ? (data: any) => updateBlockCustomization(blockId, key, data)
        //         : (data: any) => createBlockCustomization(data);
        // }
        if (type === 'tag') {
            return isEdit 
                ? (data: any) => updateTagCustomization(edgeId, tagId, key, data)
                : (data: any) => createTagCustomization(data);
        }
    }, [type, isEdit, edgeId, tagId, key]);

    const mutation = useMutation({
        mutationFn: mutationFn as (data: any) => Promise<any>,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`${type}-customization`] });
            onClose();
        },
        onError: (err: any) => {
            setError(err.message || 'Ошибка выполнения операции.');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        let payload: any = { key, value };
        let valid = value && key;

        if (type === 'edge') {
            payload.edge_id = edgeId;
            valid = valid && edgeId;
        // } else if (type === 'block') {
        //     payload.block_id = blockId;
        //     valid = valid && blockId;
        } else if (type === 'tag') {
            payload.edge_id = edgeId;
            payload.tag_id = tagId;
            valid = valid && edgeId && tagId;
        }
        
        if (!valid || (!isEdit && (type !== 'tag' && !key))) {
             setError('Не все обязательные поля заполнены.');
             return;
        }

        const dataToSend = isEdit ? { value } : payload;
        
        mutation.mutate(dataToSend);
    };

    const inputStyle = { backgroundColor: 'var(--white)', borderColor: 'var(--border-color)' };
    const labelStyle = { color: 'var(--text-primary)' };
    const commonDropdownProps = { 
        optionLabel: 'name',
        optionValue: 'id',
        filter: true,
        disabled: mutation.isPending,
        required: true,
        style: inputStyle
    };

    return (
        <form onSubmit={handleSubmit} className="p-fluid">
            {error && <Message severity="error" text={error} className="mb-3" />}
            
            {/* Поля для Edge Customization и Tag Customization */}
            {(type === 'edge' || type === 'tag') && (
                <div className="field">
                    <label htmlFor="edgeId" className="font-semibold mb-2 block" style={labelStyle}>ID Буровой</label>
                    <Dropdown 
                        id="edgeId" 
                        value={edgeId} 
                        onChange={(e) => setEdgeId(e.value)} 
                        options={edges}
                        placeholder={isEdgesLoading ? 'Загрузка буровых...' : 'Выберите буровую'}
                        {...commonDropdownProps}
                        disabled={isEdit || mutation.isPending || isEdgesLoading}
                    />
                </div>
            )}
            
            {/* Поле для Block Customization */}
            {/* {type === 'block' && (
                <div className="field">
                    <label htmlFor="blockId" className="font-semibold mb-2 block" style={labelStyle}>ID Блока</label>
                    <Dropdown 
                        id="blockId" 
                        value={blockId} 
                        onChange={(e) => setBlockId(e.value)} 
                        options={blocks}
                        placeholder={isBlocksLoading ? 'Загрузка блоков...' : 'Выберите блок'}
                        {...commonDropdownProps}
                        disabled={isEdit || mutation.isPending || isBlocksLoading}
                    />
                </div>
            )} */}

            {/* Поле для Tag Customization */}
            {type === 'tag' && (
                <div className="field mt-3">
                    <label htmlFor="tagId" className="font-semibold mb-2 block" style={labelStyle}>ID Тега</label>
                    <Dropdown 
                        id="tagId" 
                        value={tagId} 
                        onChange={(e) => setTagId(e.value)} 
                        options={tags}
                        placeholder={isTagsLoading ? 'Загрузка тегов...' : 'Выберите тег'}
                        {...commonDropdownProps}
                        disabled={isEdit || mutation.isPending || isTagsLoading}
                    />
                </div>
            )}

            {/* Поле КЛЮЧА (Key) */}
            <div className="field mt-3">
                <label htmlFor="key" className="font-semibold mb-2 block" style={labelStyle}>Ключ (Key)</label>
                <InputText 
                    id="key" 
                    value={key} 
                    onChange={(e) => setKey(e.target.value)} 
                    disabled={isEdit || mutation.isPending} 
                    required 
                    style={inputStyle}
                />
            </div>
            
            {/* Поле ЗНАЧЕНИЕ (Value) */}
            <div className="field mt-3">
                <label htmlFor="value" className="font-semibold mb-2 block" style={labelStyle}>Значение (Value)</label>
                <InputText 
                    id="value" 
                    value={value} 
                    onChange={(e) => setValue(e.target.value)} 
                    required 
                    disabled={mutation.isPending} 
                    style={inputStyle}
                />
            </div>

            <div className="flex justify-content-center gap-4 edge-form-footer">
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


export default function CustomizationTable({ title, type }: Props) {
    const queryClient = useQueryClient();
    const [openForm, setOpenForm] = useState(false);
    const [selectedData, setSelectedData] = useState<CustomizationData | null>(null);

    const [filters, setFilters] = useState<DataTableFilterMeta>({
        global: { value: null, matchMode: FilterMatchMode.CONTAINS },
        edge_id: { value: null, matchMode: FilterMatchMode.CONTAINS },
        block_id: { value: null, matchMode: FilterMatchMode.CONTAINS },
        tag_id: { value: null, matchMode: FilterMatchMode.CONTAINS },
        key: { value: null, matchMode: FilterMatchMode.CONTAINS },
        value: { value: null, matchMode: FilterMatchMode.CONTAINS },
    });

    const [globalFilterValue, setGlobalFilterValue] = useState('');

    const fetchFn = useMemo(() => {
        if (type === 'edge') return getEdgeCustomizationForAdmin;
        // if (type === 'block') return getBlockCustomizationForAdmin;
        if (type === 'tag') return getTagCustomizationForAdmin;
    }, [type]);

    const { data, isLoading, error: queryError } = useQuery<CustomizationData[]>({
        queryKey: [`${type}-customization`],
        queryFn: fetchFn,
    });
    
    const deleteMutation = useMutation({
        mutationFn: (data: CustomizationData) => {
            const tagData = data as TagCustomization;
            const baseData = data as BaseCustomization;
            
            if (type === 'edge' && baseData.edge_id) {
                return deleteEdgeCustomization(baseData.edge_id, baseData.key);
            }
            // if (type === 'block' && baseData.block_id) {
            //     return deleteBlockCustomization(baseData.block_id, baseData.key);
            // }
            if (type === 'tag' && tagData.edge_id && tagData.tag_id) {
                return deleteTagCustomization(tagData.edge_id, tagData.tag_id, tagData.key);
            }
            
            return Promise.reject(new Error("Невозможно определить ключ для удаления."));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`${type}-customization`] });
        },
    });

    const handleCreate = () => {
        setSelectedData(null);
        setOpenForm(true);
    };

    const handleEdit = (data: CustomizationData) => {
        setSelectedData(data);
        setOpenForm(true);
    };

    const handleHideForm = () => {
        setOpenForm(false);
        setSelectedData(null);
    };

    const confirmDelete = (data: CustomizationData) => {
        confirmDialog({
            message: `Вы уверены, что хотите удалить ключ "${data.key}"?`,
            header: 'Подтверждение удаления',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => deleteMutation.mutate(data),
        });
    };

    const actionBodyTemplate = (rowData: CustomizationData) => {
        return (
            <div className='flex gap-2'>
                <Button icon="pi pi-pencil" rounded text onClick={() => handleEdit(rowData)} />
                <Button icon="pi pi-trash" rounded text severity="danger" onClick={() => confirmDelete(rowData)} />
            </div>
        );
    };

    const onGlobalFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        
        const newFilters: DataTableFilterMeta = {
        ...filters,
        global: {
            ...filters.global,
            value: value,
        },
    };

        setFilters(newFilters);
        setGlobalFilterValue(value);
    };
    
    const dynamicColumns = useMemo(() => {
        const baseColumns = [
            <Column
                key="key"
                field="key"
                header="Ключ (Key)"
                sortable
                style={{ width: '25%' }}
                filter
                filterPlaceholder="Поиск по key"
            />,
            <Column
                key="value"
                field="value"
                header="Значение (Value)"
                sortable
                style={{ width: '40%' }}
                filter
                filterPlaceholder="Поиск по value"
            />,
        ];
        
        if (type === 'edge') {
            return [
                <Column
                    key="edge_id"
                    field="edge_id"
                    header="ID Буровой"
                    sortable
                    style={{ width: '20%' }}
                    filter
                    filterPlaceholder="Поиск по ID буровой"
                />,
                ...baseColumns,
            ];
        }
        if (type === 'block') {
            return [
                <Column
                    key="block_id"
                    field="block_id"
                    header="ID Блока"
                    sortable
                    style={{ width: '20%' }}
                    filter
                    filterPlaceholder="Поиск по ID блока"
                />,
                ...baseColumns,
            ];
        }
        if (type === 'tag') {
            return [
                <Column key="edge_id"
                    field="edge_id"
                    header="ID Буровой"
                    sortable
                    style={{ width: '15%' }}
                    filter
                    filterPlaceholder="Поиск по ID буровой"
                />,
                <Column 
                    key="tag_id"
                    field="tag_id"
                    header="ID Тега"
                    sortable
                    style={{ width: '15%' }}
                    filter
                    filterPlaceholder="Поиск по ID тега"
                    />,
                ...baseColumns,
            ];
        }
        return baseColumns;
    }, [type]);

    const header = (
        <div className="flex flex-wrap align-items-center justify-content-between gap-2">
            <h2 className="m-0 text-xl font-semibold">{title}</h2>
            <div className="flex gap-2">
                <span className="p-input-icon-left">
                    <i className="pi pi-search" />
                    <InputText 
                        value={globalFilterValue} 
                        onChange={onGlobalFilterChange} 
                        placeholder="Глобальный поиск" 
                    />
                </span>
                <Button 
                label={`Создать новый ключ`}
                icon="pi pi-plus" 
                className="p-button-primary" 
                onClick={handleCreate} 
                style={{backgroundColor: 'var(--accent-primary)', borderColor: 'var(--accent-primary)'}}
                />
            </div>
        </div>
    );

    return (
        <div className="card">
            {(queryError || deleteMutation.error) && (
                <Message severity="error" text={`Ошибка: ${queryError?.message || deleteMutation.error?.message}`} className="mb-3" />
            )}
            {deleteMutation.isPending && <Message severity="info" text="Удаление..." className="mb-3" />}
            
            <DataTable 
                value={data || []} 
                loading={isLoading}
                paginator rows={10} 
                rowsPerPageOptions={[5, 10, 25]}
                header={header}
                dataKey="key"
                removableSort
                tableStyle={{ minWidth: '70rem' }}
                emptyMessage="Данные кастомизации не найдены."
                filters={filters}
                globalFilterFields={['edge_id', 'block_id', 'tag_id', 'key', 'value']}
                onFilter={(e) => setFilters(e.filters)}
            >
                {dynamicColumns}
                <Column body={actionBodyTemplate} exportable={false} header="Действия" style={{ minWidth: '150px' }} />
            </DataTable>

            <Dialog 
                visible={openForm} 
                style={{ width: '450px' }} 
                header={selectedData ? `Редактировать ключ: ${selectedData.key}` : 'Создать новый ключ кастомизации'} 
                modal 
                className="p-fluid admin-dialog" 
                onHide={handleHideForm}
                closable={false}
            >
                <CustomizationForm 
                    initialData={selectedData} 
                    onClose={handleHideForm} 
                    type={type}
                />
            </Dialog>
            
            <ConfirmDialog />
        </div>
    );
}