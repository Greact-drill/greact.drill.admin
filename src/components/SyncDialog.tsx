// Добавьте этот компонент перед TagsTable, или в отдельный файл

import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { Message } from "primereact/message";
import { useState } from "react";

export const SyncDialog: React.FC<{ 
    isVisible: boolean; 
    onClose: () => void; 
    onSync: (edge: string) => void; 
    isSubmitting: boolean; 
    edges: { id: string; name: string }[];
}> = ({ 
    isVisible, 
    onClose, 
    onSync, 
    isSubmitting,
    edges
}) => {
    const [edgeValue, setEdgeValue] = useState(''); 

    const handleStartSync = () => {
        if (edgeValue.trim()) {
            onSync(edgeValue.trim());
        }
    };

    const labelStyle = { color: 'var(--text-primary)' };
    const edgeOptions = edges.map(edge => ({
        label: `${edge.name} (${edge.id})`,
        value: edge.id
    }));

    const dialogFooter = (
        <div className="flex gap-3 justify-content-end">
            <Button 
                label="Начать синхронизацию" 
                icon="pi pi-cloud-download" 
                onClick={handleStartSync} 
                loading={isSubmitting} 
                disabled={!edgeValue.trim()}
            />
            <Button 
                label="Отмена"
                icon="pi pi-times"
                onClick={onClose}
                className="p-button-danger"
                disabled={isSubmitting}
            />
        </div>
    );

    return (
        <Dialog
            visible={isVisible}
            style={{ width: '400px' }}
            header="Запуск синхронизации тегов"
            modal
            className="p-fluid admin-dialog"
            onHide={onClose}
            footer={dialogFooter}
            closable={!isSubmitting}
        >
            <div className="field">
                <label htmlFor="edge" className="font-semibold mb-2 block" style={labelStyle}>Привязка тегов к оборудованию</label>
                <Dropdown
                    id="edge"
                    value={edgeValue}
                    options={edgeOptions}
                    onChange={(e) => setEdgeValue(e.value)}
                    filter
                    placeholder="Выберите буровую или блок"
                    disabled={isSubmitting}
                />
            </div>
            <Message 
                severity="info" 
                text="Будет выполнена синхронизация тегов и привязка к выбранному оборудованию." 
                className="mt-3" 
            />
        </Dialog>
    );
};