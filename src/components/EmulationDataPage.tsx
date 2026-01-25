import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import EdgeTreeSelector from './EdgeTreeSelector';
import { type Edge } from '../api/admin';
import { getErrorMessage } from '../utils/errorUtils';

interface EmulationIteration {
    iteration: number;
    value: string;
}

interface EmulationGroup {
    id: string;
    tag: string;
    iterations: EmulationIteration[];
    isExpanded: boolean;
}

interface Props {
    title: string;
}

const parseValue = (raw: string): number | string | boolean => {
    const trimmed = raw.trim();
    if (trimmed === '') {
        return '';
    }
    const lower = trimmed.toLowerCase();
    if (lower === 'true') {
        return true;
    }
    if (lower === 'false') {
        return false;
    }
    const numeric = Number(trimmed.replace(',', '.'));
    if (!Number.isNaN(numeric)) {
        return numeric;
    }
    return trimmed;
};

export default function EmulationDataPage({ title }: Props) {
    const groupIdCounter = useRef(0);
    const [selectedEdgeId, setSelectedEdgeId] = useState('');
    const [edgePath, setEdgePath] = useState<Edge[]>([]);
    const [groups, setGroups] = useState<EmulationGroup[]>([]);
    const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
    const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
    const [successDialogVisible, setSuccessDialogVisible] = useState(false);
    const [successDialogMessage, setSuccessDialogMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const buildEmulationUrl = (path: string) => {
        const uploadUrl = import.meta.env.VITE_FILE_UPLOAD as string | undefined;
        if (!uploadUrl) {
            return path;
        }
        try {
            const url = new URL(uploadUrl);
            url.pathname = url.pathname.replace(/\/upload(?:-json)?$/, `/${path}`);
            return url.toString();
        } catch {
            return uploadUrl.replace(/\/upload(?:-json)?$/, `/${path}`);
        }
    };

    const fetchEmulationData = async () => {
        const response = await fetch(buildEmulationUrl('all'));
        if (!response.ok) {
            throw new Error('Не удалось получить данные эмуляции.');
        }
        return response.json() as Promise<{ data: Record<string, number | string | boolean>[] }>;
    };

    const { data, isLoading, error, refetch } = useQuery<{ data: Record<string, number | string | boolean>[] }>({
        queryKey: ['emulation-data'],
        queryFn: fetchEmulationData
    });

    useEffect(() => {
        if (!data) {
            return;
        }
        const grouped = new Map<string, EmulationIteration[]>();
        data.data.forEach((row, rowIndex) => {
            Object.entries(row).forEach(([tag, value]) => {
                if (!grouped.has(tag)) {
                    grouped.set(tag, []);
                }
                grouped.get(tag)!.push({
                    iteration: rowIndex,
                    value: value === null || value === undefined ? '' : String(value)
                });
            });
        });

        const nextGroups: EmulationGroup[] = Array.from(grouped.entries()).map(([tag, iterations]) => ({
            id: `group-${groupIdCounter.current++}`,
            tag,
            iterations: iterations.sort((a, b) => a.iteration - b.iteration),
            isExpanded: false
        }));
        setGroups(nextGroups);
    }, [data]);

    const handleSelectEdge = (edgeId: string, path: Edge[]) => {
        setSelectedEdgeId(edgeId);
        setEdgePath(path);
    };

    const handleGroupToggle = (index: number) => {
        setGroups(prev => prev.map((group, idx) => (
            idx === index ? { ...group, isExpanded: !group.isExpanded } : group
        )));
    };

    const handleTagChange = (index: number, value: string) => {
        setGroups(prev => prev.map((group, idx) => (
            idx === index ? { ...group, tag: value } : group
        )));
    };

    const handleIterationChange = (groupIndex: number, iterationIndex: number, field: keyof EmulationIteration, value: string) => {
        setGroups(prev => prev.map((group, idx) => {
            if (idx !== groupIndex) return group;
            const nextIterations = group.iterations.map((iteration, iterIdx) => {
                if (iterIdx !== iterationIndex) return iteration;
                if (field === 'iteration') {
                    const nextIteration = Number.parseInt(value, 10);
                    return { ...iteration, iteration: Number.isNaN(nextIteration) ? 0 : nextIteration };
                }
                return { ...iteration, [field]: value };
            });
            return { ...group, iterations: nextIterations };
        }));
    };

    const handleAddGroup = () => {
        setGroups(prev => [
            ...prev,
            {
                id: `group-${groupIdCounter.current++}`,
                tag: '',
                iterations: [],
                isExpanded: true
            }
        ]);
    };

    const handleRemoveGroup = (groupIndex: number) => {
        setGroups(prev => prev.filter((_, idx) => idx !== groupIndex));
    };

    const handleAddIteration = (groupIndex: number) => {
        setGroups(prev => prev.map((group, idx) => {
            if (idx !== groupIndex) return group;
            const maxIteration = group.iterations.length
                ? Math.max(...group.iterations.map(iteration => iteration.iteration))
                : 0;
            return {
                ...group,
                iterations: [...group.iterations, { iteration: maxIteration + 1, value: '' }],
                isExpanded: true
            };
        }));
    };

    const handleRemoveIteration = (groupIndex: number, iterationIndex: number) => {
        setGroups(prev => prev.map((group, idx) => {
            if (idx !== groupIndex) return group;
            return {
                ...group,
                iterations: group.iterations.filter((_, iterIdx) => iterIdx !== iterationIndex)
            };
        }));
    };

    const handleUploadCurrent = async () => {
        setUploadErrorMessage(null);
        setUploadSuccessMessage(null);

        const grouped = new Map<number, Record<string, number | string | boolean>>();
        groups.forEach(group => {
            const tag = group.tag.trim();
            if (!tag) return;
            group.iterations.forEach(iteration => {
                const iterationIndex = Number.isFinite(iteration.iteration) ? iteration.iteration : 0;
                if (!grouped.has(iterationIndex)) {
                    grouped.set(iterationIndex, {});
                }
                grouped.get(iterationIndex)![tag] = parseValue(iteration.value);
            });
        });

        const payload = Array.from(grouped.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, row]) => row);

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const file = new File([blob], 'emulation.json', { type: 'application/json' });
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(import.meta.env.VITE_FILE_UPLOAD, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                setUploadErrorMessage('Не удалось загрузить данные эмуляции.');
                return;
            }

            const successMessage = 'Данные эмуляции успешно загружены.';
            setUploadSuccessMessage(successMessage);
            setSuccessDialogMessage(successMessage);
            setSuccessDialogVisible(true);
            window.setTimeout(() => setUploadSuccessMessage(null), 4000);
            refetch();
        } catch (err) {
            setUploadErrorMessage(getErrorMessage(err, 'Ошибка загрузки данных эмуляции.'));
        }
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) return;

        setUploadErrorMessage(null);
        setUploadSuccessMessage(null);

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await fetch(import.meta.env.VITE_FILE_UPLOAD, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                setUploadErrorMessage('Не удалось загрузить файл эмуляции.');
                return;
            }

            const successMessage = 'Файл эмуляции успешно загружен.';
            setUploadSuccessMessage(successMessage);
            setSuccessDialogMessage(successMessage);
            setSuccessDialogVisible(true);
            window.setTimeout(() => setUploadSuccessMessage(null), 4000);
            setSelectedFile(null);
            refetch();
        } catch (err) {
            setUploadErrorMessage(getErrorMessage(err, 'Ошибка загрузки файла эмуляции.'));
        }
    };

    const edgePathLabel = useMemo(() => {
        if (!edgePath.length) return 'Не выбрано';
        return edgePath.map(edge => edge.name).join(' / ');
    }, [edgePath]);

    return (
        <div className="emulation-page">
            <div className="emulation-header">
                <h3>{title}</h3>
                <p className="emulation-subtitle">
                    Управляйте данными эмуляции и редактируйте значения тегов в реальном времени.
                </p>
            </div>

            {(error || uploadErrorMessage) && (
                <Message
                    severity="error"
                    text={uploadErrorMessage || getErrorMessage(error, 'Ошибка загрузки данных')}
                    className="mb-3"
                />
            )}
            {uploadSuccessMessage && (
                <Message severity="success" text={uploadSuccessMessage} className="mb-3" />
            )}
            <Dialog
                header="Загрузка завершена"
                visible={successDialogVisible}
                onHide={() => setSuccessDialogVisible(false)}
                style={{ width: '420px' }}
                draggable={false}
                resizable={false}
            >
                <p className="m-0">{successDialogMessage}</p>
            </Dialog>

            <div className="emulation-layout">
                <div className="emulation-panel">
                    <EdgeTreeSelector selectedEdgeId={selectedEdgeId} onSelectEdge={handleSelectEdge} />
                    <div className="emulation-edge-info">
                        <span className="emulation-edge-label">Текущий путь:</span>
                        <span className="emulation-edge-value">{edgePathLabel}</span>
                    </div>
                </div>

                <div className="emulation-panel">
                    <h4 className="mb-3">Загрузка файла эмуляции</h4>
                    <form onSubmit={handleFileUpload} className="p-fluid">
                        <div className="field">
                            <label htmlFor="emu-file" className="font-semibold mb-2 block">
                                Выберите JSON файл
                            </label>
                            <InputText
                                type="file"
                                id="emu-file"
                                accept=".json"
                                onChange={(event) =>
                                    setSelectedFile(event.target.files ? event.target.files[0] : null)
                                }
                            />
                            {selectedFile && (
                                <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    Выбран файл: {selectedFile.name}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-content-start gap-3 mt-3">
                            <Button
                                label="Загрузить файл"
                                icon="pi pi-upload"
                                type="submit"
                                disabled={!selectedFile}
                            />
                        </div>
                    </form>
                </div>
            </div>

            <div className="emulation-panel emulation-table-panel">
                <div className="emulation-table-header">
                    <div>
                        <h4>Текущие данные эмуляции</h4>
                        <small>Данные сгруппированы по тегам. Раскройте тег, чтобы увидеть итерации.</small>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            label="Добавить тег"
                            icon="pi pi-plus"
                            onClick={handleAddGroup}
                            className="p-button-outlined"
                        />
                        <Button
                            label="Загрузить данные"
                            icon="pi pi-cloud-upload"
                            onClick={handleUploadCurrent}
                            disabled={!groups.length}
                        />
                    </div>
                </div>

                {isLoading && (
                    <div className="emulation-loading">Загрузка данных...</div>
                )}

                {!isLoading && groups.length === 0 && (
                    <Message severity="warn" text="Нет данных для отображения." />
                )}

                {groups.length > 0 && (
                    <div className="emulation-table">
                        <div className="emulation-row emulation-row--header">
                            <span>Тег</span>
                            <span>Итерации</span>
                            <span>Значение</span>
                            <span></span>
                        </div>
                        {groups.map((group, index) => (
                            <div className="emulation-group" key={group.id}>
                                <div className="emulation-row emulation-row--group">
                                    <InputText
                                        value={group.tag}
                                        onChange={(event) => handleTagChange(index, event.target.value)}
                                        placeholder="tag_id"
                                    />
                                    <div className="emulation-group-summary">
                                        {group.iterations.length} знач.
                                    </div>
                                    <div className="emulation-group-actions">
                                        <Button
                                            label={group.isExpanded ? 'Скрыть' : 'Показать'}
                                            icon={group.isExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'}
                                            className="p-button-text"
                                            onClick={() => handleGroupToggle(index)}
                                        />
                                        <Button
                                            icon="pi pi-plus"
                                            className="p-button-text"
                                            onClick={() => handleAddIteration(index)}
                                            tooltip="Добавить итерацию"
                                        />
                                        <Button
                                            icon="pi pi-trash"
                                            className="p-button-rounded p-button-text p-button-danger"
                                            onClick={() => handleRemoveGroup(index)}
                                            tooltip="Удалить тег"
                                        />
                                    </div>
                                </div>
                                {group.isExpanded && (
                                    <div className="emulation-iterations">
                                        {group.iterations.map((iteration, iterationIndex) => (
                                            <div className="emulation-row emulation-row--iteration" key={`${group.id}-${iteration.iteration}-${iterationIndex}`}>
                                                <InputText
                                                    value={String(iteration.iteration)}
                                                    onChange={(event) => handleIterationChange(index, iterationIndex, 'iteration', event.target.value)}
                                                    placeholder="0"
                                                    type="number"
                                                />
                                                <InputText
                                                    value={iteration.value}
                                                    onChange={(event) => handleIterationChange(index, iterationIndex, 'value', event.target.value)}
                                                    placeholder="Значение"
                                                />
                                                <Button
                                                    icon="pi pi-trash"
                                                    className="p-button-rounded p-button-text p-button-danger"
                                                    onClick={() => handleRemoveIteration(index, iterationIndex)}
                                                />
                                            </div>
                                        ))}
                                        {group.iterations.length === 0 && (
                                            <div className="emulation-iterations-empty">
                                                Нет итераций. Добавьте значение.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
