// Добавьте этот компонент перед TagsTable, или в отдельный файл

import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { useState } from "react";

export const SyncDialog: React.FC<{ 
    isVisible: boolean; 
    onClose: () => void; 
    onSync: (edge: string) => void; 
    isSubmitting: boolean; 
}> = ({ 
    isVisible, 
    onClose, 
    onSync, 
    isSubmitting 
}) => {
    const [edgeValue, setEdgeValue] = useState('real'); 

    const handleStartSync = () => {
        if (edgeValue.trim()) {
            onSync(edgeValue.trim());
        }
    };

    const inputStyle = { backgroundColor: '#1e1e2f', borderColor: '#3a3c53' };
    const labelStyle = { color: '#a0a2b8' };

    const dialogFooter = (
        <div className="flex gap-3 justify-content-end">
            <Button 
                label="Начать синхронизацию" 
                icon="pi pi-cloud-download" 
                onClick={handleStartSync} 
                loading={isSubmitting} 
                disabled={!edgeValue.trim()}
                style={{backgroundColor: '#6c5dd3', borderColor: '#6c5dd3'}}
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
            style={{ width: '400px', backgroundColor: '#27293d', color: '#fff' }}
            header="Запуск синхронизации тегов"
            modal
            className="p-fluid admin-dialog"
            onHide={onClose}
            footer={dialogFooter}
            closable={!isSubmitting}
        >
            <div className="field">
                <label htmlFor="edge" className="font-semibold mb-2 block" style={labelStyle}>Параметр Edge (Например: real, staging)</label>
                <InputText 
                    id="edge" 
                    value={edgeValue} 
                    onChange={(e) => setEdgeValue(e.target.value)} 
                    disabled={isSubmitting} 
                    required 
                    style={inputStyle}
                />
            </div>
            <Message 
                severity="info" 
                text="Будет выполнена синхронизация тегов с внешним API, используя указанный параметр 'edge'." 
                className="mt-3" 
            />
        </Dialog>
    );
};