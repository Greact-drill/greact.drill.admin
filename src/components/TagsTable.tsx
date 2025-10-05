import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTagsForAdmin, deleteTag, createTag, updateTag } from '../api/admin'; 
import type { Tag } from '../api/admin';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { FilterMatchMode } from 'primereact/api';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import type { DataTableFilterMeta } from 'primereact/datatable'; 

interface Props {
    title: string;
}

const TagForm: React.FC<{ tag?: Tag | null; onClose: () => void; isSubmitting: boolean }> = ({ 
    tag, 
    onClose, 
    isSubmitting
}) => {
    const queryClient = useQueryClient();
    const isEdit = !!tag;
    const [name, setName] = useState(tag?.name || '');
    const [id, setId] = useState(tag?.id || '');
    const [min, setMin] = useState<number | null>(tag?.min ?? null);
    const [max, setMax] = useState<number | null>(tag?.max ?? null);
    const [comment, setComment] = useState(tag?.comment || '');
    const [unitOfMeasurement, setUnitOfMeasurement] = useState(tag?.unit_of_measurement || '');
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: (data: Partial<Tag>) => {
            const payload: Tag = { 
                ...data, 
                min: min ?? 0, 
                max: max ?? 0, 
                comment, 
                unit_of_measurement: unitOfMeasurement,
                id: data.id as string,
                name: data.name as string
            };
            return isEdit ? updateTag(tag!.id, data) : createTag(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            onClose();
        },
        onError: (err: any) => {
            setError(err.message || 'Ошибка выполнения операции.');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name || (!isEdit && !id) || min === null || max === null || !unitOfMeasurement) {
            setError('ID, Название, Min, Max и Единица измерения не могут быть пустыми.');
            return;
        }
        
        const payload: Partial<Tag> = { 
            name, 
            min: min as number, 
            max: max as number, 
            comment, 
            unit_of_measurement: unitOfMeasurement 
        };
        if (!isEdit) {
            payload.id = id;
        }

        mutation.mutate(payload);
    };
    
    const inputStyle = { backgroundColor: '#1e1e2f', borderColor: '#3a3c53' };
    const labelStyle = { color: '#a0a2b8' };

    return (
        <form onSubmit={handleSubmit} className="p-fluid">
            {error && <Message severity="error" text={error} className="mb-3" />}
            
            <div className="field">
                <label htmlFor="id" className="font-semibold mb-2 block" style={labelStyle}>ID (Ключ Тега)</label>
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
                <label htmlFor="unit" className="font-semibold mb-2 block" style={labelStyle}>Единица измерения</label>
                <InputText 
                    id="unit" 
                    value={unitOfMeasurement} 
                    onChange={(e) => setUnitOfMeasurement(e.target.value)} 
                    required 
                    disabled={mutation.isPending} 
                    style={inputStyle}
                />
            </div>

            <div className='flex gap-3'>
                <div className="field mt-3 flex-1">
                    <label htmlFor="min" className="font-semibold mb-2 block" style={labelStyle}>Min</label>
                    <InputNumber 
                        id="min" 
                        value={min} 
                        onValueChange={(e) => setMin(e.value ?? null)} 
                        mode="decimal"
                        useGrouping={false}
                        disabled={mutation.isPending} 
                        required 
                        style={inputStyle}
                    />
                </div>
                <div className="field mt-3 flex-1">
                    <label htmlFor="max" className="font-semibold mb-2 block" style={labelStyle}>Max</label>
                    <InputNumber 
                        id="max" 
                        value={max} 
                        onValueChange={(e) => setMax(e.value ?? null)} 
                        mode="decimal"
                        useGrouping={false}
                        disabled={mutation.isPending} 
                        required 
                        style={inputStyle}
                    />
                </div>
            </div>

            <div className="field mt-3">
                <label htmlFor="comment" className="font-semibold mb-2 block" style={labelStyle}>Комментарий</label>
                <InputText 
                    id="comment" 
                    value={comment} 
                    onChange={(e) => setComment(e.target.value)} 
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
                    style={{backgroundColor: '#6c5dd3', borderColor: '#6c5dd3', width: '2.5rem', height: '2.5rem', padding: '0'}} 
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

export default function TagsTable({ title }: Props) {
    const queryClient = useQueryClient();
    const [openForm, setOpenForm] = useState(false);
    const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

    const [filters, setFilters] = useState<DataTableFilterMeta>({
        global: { value: null, matchMode: FilterMatchMode.CONTAINS },
        name: { value: null, matchMode: FilterMatchMode.CONTAINS },
        id: { value: null, matchMode: FilterMatchMode.CONTAINS },
    });

    const [globalFilterValue, setGlobalFilterValue] = useState('');

    const { data: tags, isLoading, error: queryError } = useQuery<Tag[]>({
        queryKey: ['tags'],
        queryFn: getTagsForAdmin,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteTag(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
        },
    });

    const handleCreate = () => {
        setSelectedTag(null);
        setOpenForm(true);
    };

    const handleEdit = (tag: Tag) => {
        setSelectedTag(tag);
        setOpenForm(true);
    };

    const handleHideForm = () => {
        setOpenForm(false);
        setSelectedTag(null);
    };

    const confirmDelete = (tag: Tag) => {
        confirmDialog({
            message: `Вы уверены, что хотите удалить тег "${tag.name}" (ID: ${tag.id})?`,
            header: 'Подтверждение удаления',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => deleteMutation.mutate(tag.id),
        });
    };

    const actionBodyTemplate = (rowData: Tag) => {
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
                    label="Создать новый тег" 
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
                value={tags || []} 
                loading={isLoading}
                paginator rows={10} 
                rowsPerPageOptions={[5, 10, 25]}
                header={header}
                dataKey="id"
                removableSort
                tableStyle={{ minWidth: '70rem' }}
                emptyMessage="Теги не найдены."
                filters={filters}
                globalFilterFields={['id', 'name', 'unit_of_measurement', 'min', 'max', 'comment']}
                onFilter={(e) => setFilters(e.filters)}
            >
                <Column 
                    field="id"
                    header="ID Тега"
                    sortable
                    style={{ width: '15%' }}
                    filter
                    filterPlaceholder="Поиск по ID"
                />
                <Column
                    field="name"
                    header="Название"
                    sortable
                    style={{ width: '15%' }}
                    filter
                    filterPlaceholder="Поиск по названию"
                />
                <Column
                    field="unit_of_measurement"
                    header="Ед. изм."
                    sortable
                    style={{ width: '10%' }}
                    filter
                    filterPlaceholder="Поиск по ед. изм."
                />
                <Column
                    field="min"
                    header="Min"
                    sortable
                    style={{ width: '10%' }}
                    filter
                    filterPlaceholder="Поиск по Min"
                />
                <Column 
                    field="max"
                    header="Max"
                    sortable
                    style={{ width: '10%' }}
                    filter
                    filterPlaceholder="Поиск по Max"
                />
                <Column 
                    field="comment"
                    header="Комментарий"
                    sortable
                    style={{ width: '20%' }}
                    filter
                    filterPlaceholder="Поиск по комментарию"
                />
                <Column body={actionBodyTemplate} exportable={false} header="Действия" style={{ minWidth: '150px' }} />
            </DataTable>

            <Dialog 
                visible={openForm} 
                style={{ width: '550px', backgroundColor: '#27293d', color: '#fff' }} 
                header={selectedTag ? `Редактировать: ${selectedTag.id}` : 'Создать новый тег'} 
                modal 
                className="p-fluid admin-dialog" 
                onHide={handleHideForm}
                closable={false}
            >
                <TagForm 
                    tag={selectedTag} 
                    onClose={handleHideForm} 
                    isSubmitting={deleteMutation.isPending}
                />
            </Dialog>
            
            <ConfirmDialog />
        </div>
    );
}