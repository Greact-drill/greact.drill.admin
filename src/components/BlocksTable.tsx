import { type Block, type Edge, getBlocksForAdmin, deleteBlock, createBlock, updateBlock, getEdgesForAdmin } from '../api/admin'; 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type DataTableFilterMeta, DataTable } from 'primereact/datatable';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { ProgressSpinner } from 'primereact/progressspinner';
import { InputText } from 'primereact/inputtext';
import { FilterMatchMode } from 'primereact/api';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import React, { useState } from 'react';

interface Props {
    title: string;
}

const BlockForm: React.FC<{ block?: Block | null; onClose: () => void; isSubmitting: boolean }> = ({ 
    block, 
    onClose, 
    isSubmitting
}) => {
    const queryClient = useQueryClient();
    const isEdit = !!block;
    const [name, setName] = useState(block?.name || '');
    const [id, setId] = useState(block?.id || '');
    const [edgeId, setEdgeId] = useState(block?.edge_id || '');
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: (data: Partial<Block>) => 
            isEdit ? updateBlock(block!.id, data) : createBlock({ id, name, edge_id: edgeId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['blocks'] });
            onClose();
        },
        onError: (err: any) => {
            setError(err.message || 'Ошибка выполнения операции.');
        },
    });

    const { data: edges, isLoading: isEdgesLoading } = useQuery<Edge[]>({
        queryKey: ['edges'],
        queryFn: getEdgesForAdmin,
        staleTime: Infinity,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name || !edgeId || (!isEdit && !id)) {
            setError('ID, ID Буровой и Название не могут быть пустыми.');
            return;
        }
        
        const payload: Partial<Block> = { name, edge_id: edgeId };
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
            
            <div className="field mt-3">
                <label htmlFor="edgeId" className="font-semibold mb-2 block" style={labelStyle}>ID Буровой</label>
                <Dropdown 
                    id="edgeId" 
                    value={edgeId} 
                    onChange={(e) => setEdgeId(e.value)} 
                    options={edges}
                    optionLabel="name"
                    optionValue="id"
                    placeholder={isEdgesLoading ? 'Загрузка буровых...' : 'Выберите буровую'}
                    disabled={mutation.isPending || isEdgesLoading} 
                    required 
                    filter
                    style={inputStyle}
                />
            </div>

            <div className="field">
                <label htmlFor="id" className="font-semibold mb-2 block" style={labelStyle}>ID (Ключ Блока)</label>
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


export default function BlocksTable({ title }: Props) {
    const queryClient = useQueryClient();
    const [openForm, setOpenForm] = useState(false);
    const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);

    const { data: blocks, isLoading, error: queryError } = useQuery<Block[]>({
        queryKey: ['blocks'],
        queryFn: getBlocksForAdmin,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteBlock(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['blocks'] });
        },
    });

    const [filters, setFilters] = useState<DataTableFilterMeta>({
        global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    });
    const [globalFilterValue, setGlobalFilterValue] = useState('');

    const onGlobalFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        let _filters = { ...filters };
        
        (_filters['global'] as any).value = value; 
        
        setFilters(_filters);
        setGlobalFilterValue(value);
    };

    const handleCreate = () => {
        setSelectedBlock(null);
        setOpenForm(true);
    };

    const handleEdit = (block: Block) => {
        setSelectedBlock(block);
        setOpenForm(true);
    };

    const handleHideForm = () => {
        setOpenForm(false);
        setSelectedBlock(null);
    };

    const confirmDelete = (block: Block) => {
        confirmDialog({
            message: `Вы уверены, что хотите удалить блок "${block.name}" (ID: ${block.id})?`,
            header: 'Подтверждение удаления',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => deleteMutation.mutate(block.id),
        });
    };

    const actionBodyTemplate = (rowData: Block) => {
        return (
            <div className='flex gap-2'>
                <Button icon="pi pi-pencil" rounded text onClick={() => handleEdit(rowData)} />
                <Button icon="pi pi-trash" rounded text severity="danger" onClick={() => confirmDelete(rowData)} />
            </div>
        );
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
                    label="Создать новый блок" 
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
                value={blocks || []} 
                loading={isLoading}
                paginator rows={10} 
                rowsPerPageOptions={[5, 10, 25]}
                header={header}
                dataKey="id"
                removableSort
                tableStyle={{ minWidth: '50rem' }}
                emptyMessage="Блоки не найдены."
            >
                <Column field="edge_id" header="ID Буровой" sortable style={{ width: '25%' }} />
                <Column field="id" header="ID Блока" sortable style={{ width: '25%' }} />
                <Column field="name" header="Название" sortable style={{ width: '35%' }} />
                <Column body={actionBodyTemplate} exportable={false} header="Действия" style={{ minWidth: '150px' }} />
            </DataTable>

            <Dialog 
                visible={openForm} 
                style={{ width: '450px', backgroundColor: '#27293d', color: '#fff' }} 
                header={selectedBlock ? `Редактировать: ${selectedBlock.id}` : 'Создать новый блок'} 
                modal
                className="p-fluid admin-dialog" 
                onHide={handleHideForm}
                closable={false}
            >
                <BlockForm 
                    block={selectedBlock} 
                    onClose={handleHideForm} 
                    isSubmitting={deleteMutation.isPending}
                />
            </Dialog>
            
            <ConfirmDialog />
        </div>
    );
}