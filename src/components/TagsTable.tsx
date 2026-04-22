import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTagsForAdmin, deleteTag, createTag, updateTag, syncTags, getEdgesForAdmin } from '../api/admin'; 
import type { Tag, TagPayload } from '../api/admin';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { MultiSelect } from 'primereact/multiselect';
import { FilterMatchMode } from 'primereact/api';
import { Message } from 'primereact/message';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import type { DataTableFilterMeta } from 'primereact/datatable'; 
import { SyncDialog } from './SyncDialog';
import { getErrorMessage } from '../utils/errorUtils';
import { useAppToast } from '../ui/ToastProvider';
import PageHeader from '../ui/PageHeader';
import TableToolbar from '../ui/TableToolbar';
import { queryParsers, querySerializers, useQueryParamState } from '../ui/useQueryParamState';
import ErrorBanner from '../ui/ErrorBanner';
import AppCard from '../ui/AppCard';
import AppButton from '../ui/AppButton';

interface Props {
    title: string;
}

const TagForm: React.FC<{ 
    tag?: Tag | null; 
    onClose: () => void; 
    edges: { id: string; name: string; parent_id?: string }[];
}> = ({ 
    tag, 
    onClose, 
    edges
}) => {
    const queryClient = useQueryClient();
    const isEdit = !!tag;
    const [name, setName] = useState(tag?.name || '');
    const [tagGroup, setTagGroup] = useState(tag?.tag_group || '');
    const [id, setId] = useState(tag?.id || '');
    const [min, setMin] = useState<number | null>(tag?.min ?? null);
    const [max, setMax] = useState<number | null>(tag?.max ?? null);
    const [comment, setComment] = useState(tag?.comment || '');
    const [unitOfMeasurement, setUnitOfMeasurement] = useState(tag?.unit_of_measurement || '');
    const [precision, setPrecision] = useState<number | null>(tag?.precision ?? null);
    const [edgeIds, setEdgeIds] = useState<string[]>(tag?.edge_ids ?? []);
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: (data: Partial<Tag>) => {
            const tagId = isEdit ? tag!.id : (data.id as string);
            const payload: Tag = { 
                ...data,
                min: min ?? 0, 
                max: max ?? 0, 
                comment, 
                unit_of_measurement: unitOfMeasurement,
                precision: precision ?? undefined,
                id: tagId,
                name: data.name as string,
                tag_group: tagGroup || undefined,
                edge_ids: edgeIds
            };
            return isEdit ? updateTag(tagId, payload) : createTag(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            onClose();
        },
        onError: (err: any) => {
            setError(getErrorMessage(err, 'Ошибка выполнения операции.'));
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name || (!isEdit && !id) || min === null || max === null || !unitOfMeasurement) {
            setError('ID, Название, Min, Max и Единица измерения обязательны.');
            return;
        }
        
        const payload: Partial<Tag> = { 
            name, 
            tag_group: tagGroup || undefined,
            min: min as number, 
            max: max as number, 
            comment, 
            unit_of_measurement: unitOfMeasurement,
            precision: precision ?? undefined
        };
        if (!isEdit) {
            payload.id = id;
        }
        payload.edge_ids = edgeIds;

        mutation.mutate(payload);
    };
    
    const labelClassName = 'font-semibold mb-2 block app-field-label';
    const edgeOptions = edges.map(edge => ({
        label: `${edge.name} (${edge.id})`,
        value: edge.id
    }));

    return (
        <form onSubmit={handleSubmit} className="p-fluid">
            {error && <Message severity="error" text={error} className="mb-3" />}
            
            <div className="field">
                <label htmlFor="id" className={labelClassName}>ID (Ключ Тега)</label>
                <InputText 
                    id="id" 
                    value={id} 
                    onChange={(e) => setId(e.target.value)} 
                    disabled={isEdit || mutation.isPending} 
                    required 
                    className="app-input w-full"
                />
            </div>
            
            <div className="field mt-3">
                <label htmlFor="name" className={labelClassName}>Название</label>
                <InputText 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    required 
                    disabled={mutation.isPending} 
                    className="app-input w-full"
                />
            </div>

            <div className="field mt-3">
                <label htmlFor="unit" className={labelClassName}>Единица измерения</label>
                <InputText 
                    id="unit" 
                    value={unitOfMeasurement} 
                    onChange={(e) => setUnitOfMeasurement(e.target.value)} 
                    required 
                    disabled={mutation.isPending} 
                    className="app-input w-full"
                />
            </div>

            <div className="field mt-3">
                <label htmlFor="tag-group" className={labelClassName}>Группа тегов</label>
                <InputText
                    id="tag-group"
                    value={tagGroup}
                    onChange={(e) => setTagGroup(e.target.value)}
                    disabled={mutation.isPending}
                    placeholder="Например: Давление / Температура / Электрика"
                    className="app-input w-full"
                />
            </div>

            {unitOfMeasurement !== 'bool' && (
                <div className="field mt-3">
                    <label htmlFor="precision" className={labelClassName}>Точность (знаков после запятой)</label>
                    <InputNumber 
                        id="precision" 
                        value={precision} 
                        onValueChange={(e) => setPrecision(e.value ?? null)} 
                        min={0}
                        max={10}
                        mode="decimal"
                        useGrouping={false}
                        placeholder="По умолчанию: 2"
                        disabled={mutation.isPending} 
                        className="app-input w-full"
                    />
                    <small style={{ color: 'var(--text-secondary)' }}>0–10. Только для числовых тегов. Оставьте пустым для 2 знаков.</small>
                </div>
            )}

            <div className="field mt-3">
                <label htmlFor="edge-ids" className={labelClassName}>Привязка к оборудованию</label>
                <MultiSelect
                    id="edge-ids"
                    value={edgeIds}
                    options={edgeOptions}
                    onChange={(e) => setEdgeIds(e.value ?? [])}
                    display="chip"
                    filter
                    placeholder="Выберите оборудование (опционально)"
                    disabled={mutation.isPending || edgeOptions.length === 0}
                    className="app-input w-full"
                />
            </div>

            <div className='flex gap-3'>
                <div className="field mt-3 flex-1">
                    <label htmlFor="min" className={labelClassName}>Min</label>
                    <InputNumber 
                        id="min" 
                        value={min} 
                        onValueChange={(e) => setMin(e.value ?? null)} 
                        mode="decimal"
                        useGrouping={false}
                        disabled={mutation.isPending} 
                        required 
                        className="app-input w-full"
                    />
                </div>
                <div className="field mt-3 flex-1">
                    <label htmlFor="max" className={labelClassName}>Max</label>
                    <InputNumber 
                        id="max" 
                        value={max} 
                        onValueChange={(e) => setMax(e.value ?? null)} 
                        mode="decimal"
                        useGrouping={false}
                        disabled={mutation.isPending} 
                        required 
                        className="app-input w-full"
                    />
                </div>
            </div>

            <div className="field mt-3">
                <label htmlFor="comment" className={labelClassName}>Комментарий</label>
                <InputText 
                    id="comment" 
                    value={comment} 
                    onChange={(e) => setComment(e.target.value)} 
                    disabled={mutation.isPending} 
                    className="app-input w-full"
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

export default function TagsTable({ title }: Props) {
    const queryClient = useQueryClient();
    const toast = useAppToast();
    const [openForm, setOpenForm] = useState(false);
    const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
    const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

    const [openSyncDialog, setOpenSyncDialog] = useState(false);
    
    // Состояния для загрузки файла
    const [uploadDialogVisible, setUploadDialogVisible] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
    const [uploadSuccessDialogVisible, setUploadSuccessDialogVisible] = useState(false);
    
    // Состояния для создания тегов из файла
    const [createTagsDialogVisible, setCreateTagsDialogVisible] = useState(false);
    const [selectedTagsFile, setSelectedTagsFile] = useState<File | null>(null);
    const [bulkEdgeIds, setBulkEdgeIds] = useState<string[]>([]);
    const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);

    const [filters, setFilters] = useState<DataTableFilterMeta>({
        global: { value: null, matchMode: FilterMatchMode.CONTAINS },
        name: { value: null, matchMode: FilterMatchMode.CONTAINS },
        id: { value: null, matchMode: FilterMatchMode.CONTAINS },
    });

    const [globalFilterValue, setGlobalFilterValue] = useQueryParamState('q', {
        parse: queryParsers.string,
        serialize: querySerializers.string,
        defaultValue: '',
    });

    const { data: tags, isLoading, error: queryError } = useQuery<Tag[]>({
        queryKey: ['tags'],
        queryFn: getTagsForAdmin,
    });

    const { data: edges = [], isLoading: edgesLoading, error: edgesError } = useQuery({
        queryKey: ['edges'],
        queryFn: getEdgesForAdmin,
    });
    const assignableEdges = edges;

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteTag(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
        },
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const results = await Promise.allSettled(ids.map((id) => deleteTag(id)));
            const successful = results.filter((r) => r.status === 'fulfilled').length;
            const failed = results.filter((r) => r.status === 'rejected').length;
            return { successful, failed, total: ids.length };
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            setSelectedTags([]);
            toast.success(
                `Удалено: ${result.successful} из ${result.total}${result.failed ? `, ошибок: ${result.failed}` : ''}`,
                'Массовое удаление'
            );
        },
        onError: (err: any) => {
            toast.error(getErrorMessage(err, 'Не удалось удалить теги.'), 'Массовое удаление');
        },
    });
    const filteredTagsValue = useMemo(
        () => (tags || []).filter((tag) => !showUnassignedOnly || !tag.edge_ids?.length),
        [tags, showUnassignedOnly]
    );

    const handleBulkDelete = () => {
        if (!selectedTags.length) return;
        confirmDialog({
            header: 'Подтверждение удаления',
            message: `Удалить выбранные теги (${selectedTags.length})? Действие необратимо.`,
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => bulkDeleteMutation.mutate(selectedTags.map((t) => t.id)),
        });
    };

    const syncMutation = useMutation({
        mutationFn: (edge: string) => syncTags(edge),
        onSuccess: (data) => {
            toast.success(data.message, 'Синхронизация');
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            setOpenSyncDialog(false);
        },
        onError: (err: any) => {
            toast.error(getErrorMessage(err, 'Неизвестная ошибка'), 'Ошибка синхронизации');
            setOpenSyncDialog(false);
        },
    });

    const createTagsMutation = useMutation({
        mutationFn: async (tags: TagPayload[]) => {
            const results = await Promise.allSettled(
                tags.map(tag => createTag(tag))
            );
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            return { successful, failed, total: tags.length };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            setCreateTagsDialogVisible(false);
            setSelectedTagsFile(null);
            toast.success(
                `Создано тегов: ${data.successful} из ${data.total}${data.failed > 0 ? `, ошибок: ${data.failed}` : ''}`,
                'Импорт тегов'
            );
        },
        onError: (err: any) => {
            toast.error(getErrorMessage(err, 'Неизвестная ошибка'), 'Ошибка импорта тегов');
        },
    });

    // Функции для загрузки файла
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    // Функции для создания тегов из файла
    const handleTagsFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedTagsFile(e.target.files[0]);
        }
    };

    const handleCreateTagsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTagsFile) return;

        try {
            const text = await selectedTagsFile.text();
            const tagsData = JSON.parse(text);
            
            if (!Array.isArray(tagsData)) {
                toast.warn('Файл должен содержать массив тегов.');
                return;
            }

            // Преобразуем данные в формат TagPayload
            const tags: TagPayload[] = tagsData.map((tag: any) => ({
                id: tag.id,
                name: tag.name,
                tag_group: tag.tag_group || undefined,
                unit_of_measurement: tag.unit_of_measurement || '',
                comment: tag.comment || '',
                min: tag.min ?? 0,
                max: tag.max ?? 0,
                precision: tag.precision != null ? tag.precision : undefined,
                edge_ids: bulkEdgeIds
            }));

            createTagsMutation.mutate(tags);
        } catch (error) {
            console.error('Ошибка парсинга JSON:', error);
            toast.error('Ошибка чтения файла. Убедитесь, что файл содержит валидный JSON.', 'Импорт тегов');
        }
    };

    const handleUploadSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) return;

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await fetch(import.meta.env.VITE_FILE_UPLOAD, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                // Обновляем данные после успешной загрузки
                queryClient.invalidateQueries({ queryKey: ['tags'] });
                setUploadDialogVisible(false);
                setSelectedFile(null);
                setUploadSuccessMessage('Файл эмуляции успешно загружен.');
                setUploadSuccessDialogVisible(true);
                window.setTimeout(() => setUploadSuccessMessage(null), 4000);
            } else {
                console.error('Ошибка загрузки файла');
            }
        } catch (error) {
            console.error('Ошибка:', error);
        }
    };

    const handleDownloadExample = async () => {
        try {
            const response = await fetch(import.meta.env.VITE_FILE_EXAMPLE);
            if (response.ok) {
                const exampleData = await response.json();
                
                // Форматируем JSON с отступами для читаемости
                const formattedJson = JSON.stringify(exampleData, null, 2);
                
                const blob = new Blob([formattedJson], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `example_tag.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                console.error('Ошибка загрузки примера файла');
            }
        } catch (error) {
            console.error('Ошибка:', error);
        }
    };

    const handleOpenSyncDialog = () => {
        setOpenSyncDialog(true);
    };

    const handleSync = (edge: string) => {
        confirmDialog({
            message: `Вы уверены, что хотите запустить синхронизацию тегов для 'edge': ${edge}?`,
            header: 'Подтверждение синхронизации',
            icon: 'pi pi-cloud-download',
            acceptClassName: 'p-button-warning',
            accept: () => syncMutation.mutate(edge), 
        });
    };

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

    const edgeIdsBodyTemplate = (rowData: Tag) => {
        if (!rowData.edge_ids || rowData.edge_ids.length === 0) {
            return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
        }
        return rowData.edge_ids.join(', ');
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
        <TableToolbar
            query={globalFilterValue}
            onQueryChange={(value) => onGlobalFilterChange({ target: { value } } as any)}
            queryPlaceholder="Глобальный поиск"
            resultCount={filteredTagsValue.length}
            actions={(
                <>
                    {selectedTags.length ? (
                        <AppButton
                            label={`Удалить выбранные (${selectedTags.length})`}
                            icon="pi pi-trash"
                            variant="danger"
                            outlined
                            onClick={handleBulkDelete}
                            disabled={bulkDeleteMutation.isPending}
                        />
                    ) : null}
                    <AppButton
                        label="Загрузить эмуляцию"
                        icon="pi pi-upload"
                        variant="secondary"
                        onClick={() => setUploadDialogVisible(true)}
                    />
                    <AppButton
                        label="Создать теги из файла"
                        icon="pi pi-file-import"
                        variant="secondary"
                        onClick={() => setCreateTagsDialogVisible(true)}
                    />
                    <AppButton
                        label={showUnassignedOnly ? 'Показать все' : 'Непривязанные'}
                        icon="pi pi-filter"
                        variant="secondary"
                        onClick={() => setShowUnassignedOnly((prev) => !prev)}
                    />
                    <AppButton
                        label="Создать новый тег"
                        icon="pi pi-plus"
                        onClick={handleCreate}
                    />
                    <AppButton
                        label="Синхронизировать"
                        icon="pi pi-sync"
                        variant="secondary"
                        onClick={handleOpenSyncDialog}
                        disabled={isLoading || syncMutation.isPending}
                        tooltip="Открыть диалог синхронизации тегов"
                    />
                </>
            )}
        />
    );

    return (
        <AppCard>
            <PageHeader
                kicker="Справочник"
                title={title}
                description="Управляйте тегами, привязкой к оборудованию, синхронизацией и импортом."
            />
            {(queryError || deleteMutation.error || syncMutation.error || edgesError) ? (
                <ErrorBanner
                    text={`Ошибка: ${getErrorMessage(queryError || deleteMutation.error || syncMutation.error || edgesError, 'Произошла ошибка')}`}
                    onRetry={() => void queryClient.invalidateQueries({ queryKey: ['tags'] })}
                    className="mb-3"
                />
            ) : null}
            {uploadSuccessMessage && (
                <Message
                    severity="success"
                    text={uploadSuccessMessage}
                    className="mb-3"
                />
            )}
            <Dialog
                header="Загрузка завершена"
                visible={uploadSuccessDialogVisible}
                onHide={() => setUploadSuccessDialogVisible(false)}
                className="responsive-dialog responsive-dialog-sm"
                draggable={false}
                resizable={false}
            >
                <p className="m-0">Файл эмуляции успешно загружен.</p>
            </Dialog>
            {deleteMutation.isPending && 
            <Message
                severity="info"
                text={deleteMutation.isPending ? "Удаление..." : "Синхронизация тегов..."}
                className="mb-3"
            />}
            
            <div className="tags-table-scroll">
                {/** Фильтр отображения неразмеченных тегов применяем до DataTable */}
                {/** eslint-disable-next-line react/jsx-no-useless-fragment */}
                <>
                <DataTable 
                    value={filteredTagsValue} 
                    loading={isLoading}
                    paginator rows={10} 
                    rowsPerPageOptions={[5, 10, 25]}
                    header={header}
                    dataKey="id"
                    selection={selectedTags}
                    onSelectionChange={(e) => setSelectedTags(e.value as Tag[])}
                    removableSort
                    tableStyle={{ minWidth: '100%' }}
                    emptyMessage="Теги не найдены."
                    filters={filters}
                    globalFilterFields={['id', 'edge_ids', 'name', 'tag_group', 'unit_of_measurement', 'precision', 'min', 'max', 'comment']}
                    onFilter={(e) => setFilters(e.filters)}
                >
                <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
                <Column 
                    field="id"
                    header="ID Тега"
                    sortable
                    style={{ width: '15%' }}
                    filter
                    filterPlaceholder="Поиск по ID"
                />
                <Column
                    field="edge_ids"
                    header="Привязка"
                    body={edgeIdsBodyTemplate}
                    style={{ width: '20%' }}
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
                    field="tag_group"
                    header="Группа"
                    sortable
                    style={{ width: '12%' }}
                    body={(row) => row.tag_group || '—'}
                    filter
                    filterPlaceholder="Поиск по группе"
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
                    field="precision"
                    header="Точность"
                    sortable
                    style={{ width: '8%' }}
                    body={(row) => row.unit_of_measurement === 'bool' ? '—' : (row.precision ?? 2)}
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
                </>
            </div>

            <Dialog
                visible={openForm}
                className="responsive-dialog responsive-dialog-lg p-fluid admin-dialog"
                header={selectedTag ? `Редактировать: ${selectedTag.id}` : 'Создать новый тег'}
                modal
                onHide={handleHideForm}
                closable={false}
            >
                <TagForm 
                    tag={selectedTag} 
                    onClose={handleHideForm} 
                    edges={assignableEdges}
                />
            </Dialog>

            {/* Диалог синхронизации */}
            <SyncDialog
                isVisible={openSyncDialog}
                onClose={() => setOpenSyncDialog(false)}
                onSync={handleSync}
                isSubmitting={syncMutation.isPending || edgesLoading}
                edges={edges}
            />

            {/* Новый диалог для загрузки файла */}
            <Dialog
                visible={uploadDialogVisible}
                className="responsive-dialog responsive-dialog-md p-fluid admin-dialog"
                header="Загрузить JSON файл с тегами" 
                modal 
                onHide={() => {
                    setUploadDialogVisible(false);
                    setSelectedFile(null);
                }}
            >
                <div className="mb-4">
                    <Button 
                        label="Скачать пример файла"
                        icon="pi pi-download"
                        className="p-button-outlined"
                        onClick={handleDownloadExample}
                    />
                </div>

                <form onSubmit={handleUploadSubmit} className="p-fluid">
                    <div className="field">
                        <label htmlFor="file" className="font-semibold mb-2 block">
                            Выберите JSON файл
                        </label>
                        <InputText 
                            type="file"
                            id="file"
                            accept=".json"
                            onChange={handleFileSelect}
                        />
                        {selectedFile && (
                            <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Выбран файл: {selectedFile.name}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex justify-content-center gap-4 mt-4">
                        <Button 
                            icon="pi pi-upload" 
                            type="submit" 
                            disabled={!selectedFile}
                            tooltip="Загрузить"
                            className="p-button-rounded" 
                        />
                        <Button 
                            icon="pi pi-times" 
                            onClick={() => {
                                setUploadDialogVisible(false);
                                setSelectedFile(null);
                            }} 
                            className="p-button-danger p-button-rounded" 
                            tooltip="Отмена" 
                            style={{width: '2.5rem', height: '2.5rem', padding: '0'}}
                        />
                    </div>
                </form>
            </Dialog>

            {/* Диалог для создания тегов из файла */}
            <Dialog
                visible={createTagsDialogVisible}
                className="responsive-dialog responsive-dialog-md p-fluid admin-dialog"
                header="Создать теги из файла"
                modal
                onHide={() => {
                    setCreateTagsDialogVisible(false);
                    setSelectedTagsFile(null);
                    setBulkEdgeIds([]);
                }}
            >
                <form onSubmit={handleCreateTagsSubmit} className="p-fluid">
                    <div className="field">
                        <label htmlFor="bulk-edge-ids" className="font-semibold mb-2 block">
                            Привязка к оборудованию
                        </label>
                        <MultiSelect
                            id="bulk-edge-ids"
                            value={bulkEdgeIds}
                            options={assignableEdges.map(edge => ({
                                label: `${edge.name} (${edge.id})`,
                                value: edge.id
                            }))}
                            onChange={(e) => setBulkEdgeIds(e.value ?? [])}
                            display="chip"
                            filter
                            placeholder="Выберите оборудование (опционально)"
                            disabled={createTagsMutation.isPending || edgesLoading || assignableEdges.length === 0}
                        />
                        <small style={{ color: 'var(--text-secondary)' }}>
                            Можно оставить пустым, чтобы создать неразмеченные теги.
                        </small>
                    </div>
                    <div className="field">
                        <label htmlFor="tagsFile" className="font-semibold mb-2 block">
                            Выберите JSON файл с тегами
                        </label>
                        <input 
                            type="file"
                            id="tagsFile"
                            accept=".json"
                            onChange={handleTagsFileSelect}
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        />
                        {selectedTagsFile && (
                            <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Выбран файл: {selectedTagsFile.name}
                            </div>
                        )}
                        <div className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <p>Формат файла должен быть массив объектов:</p>
                            <pre style={{ 
                                fontSize: '0.85rem', 
                                marginTop: '0.5rem', 
                                padding: '0.5rem', 
                                backgroundColor: 'var(--card-bg)', 
                                borderColor: 'var(--border-color)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                color: 'var(--text-primary)'
                            }}>
{`[
  {
    "id": "dc_out_300ms[0]",
    "name": "Спидометр Н1 Давление на входе",
    "unit_of_measurement": "стрелка",
    "comment": "",
    "min": 32.5,
    "max": 87.2,
    "precision": 2
  }
]`}
                            </pre>
                        </div>
                    </div>
                    
                    <div className="flex justify-content-center gap-4 mt-4">
                        <Button 
                            icon="pi pi-check" 
                            type="submit" 
                            disabled={!selectedTagsFile || createTagsMutation.isPending}
                            loading={createTagsMutation.isPending}
                            tooltip="Создать теги"
                            className="p-button-rounded" 
                        />
                        <Button 
                            icon="pi pi-times" 
                            onClick={() => {
                                setCreateTagsDialogVisible(false);
                                setSelectedTagsFile(null);
                            }} 
                            className="p-button-danger p-button-rounded" 
                            disabled={createTagsMutation.isPending}
                            tooltip="Отмена" 
                            style={{width: '2.5rem', height: '2.5rem', padding: '0'}}
                        />
                    </div>
                </form>
            </Dialog>
            
            <ConfirmDialog />
        </AppCard>
    );
}