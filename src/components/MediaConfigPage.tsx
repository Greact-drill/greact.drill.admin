import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Checkbox } from 'primereact/checkbox';
import { Dropdown } from 'primereact/dropdown';
import EdgeTreeSelector from './EdgeTreeSelector';
import { getMediaConfig, presignUpload, putMediaConfig } from '../api/media';
import { getErrorMessage } from '../utils/errorUtils';

interface CameraConfig {
  id: string;
  name?: string;
  streamUrl?: string;
  rowId: string;
}

interface AssetConfig {
  id: string;
  name?: string;
  group?: string;
  type: 'image' | 'video' | 'document';
  url?: string;
  key?: string;
  contentType?: string;
}

type MediaScope = 'video' | 'winch-block' | 'pump-block';

interface VideoConfigData {
  cameras?: CameraConfig[];
  assets?: AssetConfig[];
}

const assetTypeOptions = [
  { label: 'Изображение', value: 'image' },
  { label: 'Видео', value: 'video' },
  { label: 'Документ', value: 'document' }
];

const scopeOptions: Array<{ label: string; value: MediaScope }> = [
  { label: 'Видеонаблюдение', value: 'video' },
  { label: 'Лебедочный блок', value: 'winch-block' },
  { label: 'Насосный блок', value: 'pump-block' }
];

export default function MediaConfigPage() {
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [edgePathLabel, setEdgePathLabel] = useState('Не выбрано');
  const [selectedScope, setSelectedScope] = useState<MediaScope>('video');
  const [useGlobalConfig, setUseGlobalConfig] = useState(false);
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [assets, setAssets] = useState<AssetConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeRigId = useGlobalConfig ? undefined : selectedEdgeId;
  const isVideoScope = selectedScope === 'video';

  useEffect(() => {
    if (!useGlobalConfig && !selectedEdgeId) {
      setCameras([]);
      return;
    }
    const fetchConfig = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await getMediaConfig<VideoConfigData>(selectedScope, activeRigId);
        const loadedCameras = (response.data?.cameras ?? []).map(camera => ({
          ...camera,
          rowId: `${Date.now()}-${Math.random().toString(16).slice(2)}`
        }));
        setCameras(isVideoScope ? loadedCameras : []);
        setAssets(response.data?.assets ?? []);
      } catch (error) {
        setErrorMessage(getErrorMessage(error, 'Не удалось загрузить конфигурацию медиа.'));
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [activeRigId, selectedEdgeId, useGlobalConfig, selectedScope, isVideoScope]);

  const handleSelectEdge = (edgeId: string, path: Array<{ name: string }>) => {
    setSelectedEdgeId(edgeId);
    setEdgePathLabel(path.map(edge => edge.name).join(' / ') || 'Не выбрано');
  };

  const handleAddCamera = () => {
    setCameras(prev => [
      ...prev,
      { id: '', name: '', streamUrl: '', rowId: `${Date.now()}-${Math.random().toString(16).slice(2)}` }
    ]);
  };

  const handleRemoveCamera = (index: number) => {
    setCameras(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleCameraChange = (index: number, field: keyof CameraConfig, value: string) => {
    setCameras(prev => prev.map((camera, idx) => (
      idx === index ? { ...camera, [field]: value } : camera
    )));
  };

  const handleAddAsset = (type: AssetConfig['type']) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setAssets(prev => [...prev, { id, name: '', group: '', type, url: '' }]);
  };

  const handleAssetChange = (index: number, field: keyof AssetConfig, value: string) => {
    setAssets(prev => prev.map((asset, idx) => (
      idx === index ? { ...asset, [field]: value } : asset
    )));
  };

  const handleRemoveAsset = (index: number) => {
    setAssets(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSelectFiles = () => {
    fileInputRef.current?.click();
  };

  const uploadFiles = async (files: FileList) => {
    if (!useGlobalConfig && !selectedEdgeId) {
      setErrorMessage('Сначала выберите буровую или включите глобальную конфигурацию.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      const rigPrefix = activeRigId ? `rigs/${activeRigId}` : 'global';
      const uploads = Array.from(files);
      const uploadedAssets: AssetConfig[] = [];

      for (const file of uploads) {
        const safeName = file.name.replace(/\s+/g, '_');
        const key = `assets/${rigPrefix}/${Date.now()}-${safeName}`;
        const presign = await presignUpload({
          key,
          contentType: file.type || 'application/octet-stream',
          cacheControl: 'public, max-age=31536000'
        });
        await fetch(presign.url, {
          method: 'PUT',
          headers: presign.headers,
          body: file
        });

        const type: AssetConfig['type'] =
          file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
              ? 'video'
              : 'document';

        uploadedAssets.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          group: '',
          type,
          url: presign.publicUrl || '',
          key: presign.key,
          contentType: file.type
        });
      }

      setAssets(prev => [...prev, ...uploadedAssets]);
      setSuccessMessage('Файлы успешно загружены.');
      window.setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Ошибка загрузки файлов.'));
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const sanitizedCameras = useMemo(() => {
    return cameras
      .map(camera => ({
        id: camera.id.trim(),
        name: camera.name?.trim() || '',
        streamUrl: camera.streamUrl?.trim() || ''
      }))
      .filter(camera => camera.id && camera.streamUrl);
  }, [cameras]);

  const sanitizedAssets = useMemo(() => {
    return assets
      .map(asset => ({
        id: asset.id.trim(),
        name: asset.name?.trim() || '',
        group: asset.group?.trim() || '',
        type: asset.type,
        url: asset.url?.trim() || '',
        key: asset.key,
        contentType: asset.contentType
      }))
      .filter(asset => asset.id && (asset.url || asset.key));
  }, [assets]);

  const handleSave = async () => {
    if (!useGlobalConfig && !selectedEdgeId) {
      setErrorMessage('Сначала выберите буровую или включите глобальную конфигурацию.');
      return;
    }
    setErrorMessage(null);
    try {
      await putMediaConfig<VideoConfigData>(selectedScope, activeRigId, {
        cameras: isVideoScope ? sanitizedCameras : [],
        assets: sanitizedAssets
      });
      setSuccessMessage('Конфигурация медиа сохранена.');
      window.setTimeout(() => setSuccessMessage(null), 4000);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Ошибка сохранения конфигурации.'));
    }
  };

  return (
    <div className="media-config-page">
      <div className="media-config-header">
        <h3>Настройка медиа</h3>
        <p>Настройте источники и файлы для выбранной буровой или глобально.</p>
      </div>

      {(errorMessage || successMessage) && (
        <div className="mb-3">
          {errorMessage && <Message severity="error" text={errorMessage} />}
          {successMessage && <Message severity="success" text={successMessage} />}
        </div>
      )}

      <div className="media-config-layout">
        <div className="media-config-panel">
          <EdgeTreeSelector selectedEdgeId={selectedEdgeId} onSelectEdge={handleSelectEdge} />
          <div className="media-config-edge">
            <span className="media-config-label">Текущий путь:</span>
            <span className="media-config-value">{edgePathLabel}</span>
          </div>
          <Dropdown
            value={selectedScope}
            onChange={(e) => setSelectedScope(e.value)}
            options={scopeOptions}
            placeholder="Выберите раздел"
            className="media-config-dropdown"
          />
          <div className="media-config-global">
            <Checkbox
              inputId="media-global"
              checked={useGlobalConfig}
              onChange={(e) => setUseGlobalConfig(Boolean(e.checked))}
            />
            <label htmlFor="media-global">Использовать глобальную конфигурацию</label>
          </div>
        </div>

        <div className="media-config-panel">
          <div className="media-config-controls">
            {isVideoScope && (
              <Button
                label="Добавить камеру"
                icon="pi pi-plus"
                onClick={handleAddCamera}
              />
            )}
            <Button
              label="Загрузить файлы"
              icon="pi pi-upload"
              onClick={handleSelectFiles}
              className="p-button-secondary"
            />
            <Button
              label="Добавить ссылку"
              icon="pi pi-link"
              onClick={() => handleAddAsset('document')}
              className="p-button-secondary"
            />
          </div>

          {loading && <div className="media-config-empty">Загрузка...</div>}
          {isVideoScope && !loading && cameras.length === 0 && (
            <div className="media-config-empty">Камеры не добавлены.</div>
          )}
          {isVideoScope && !loading && cameras.length > 0 && (
            <div className="media-config-list">
              {cameras.map((camera, index) => (
                <div className="media-config-row" key={camera.rowId}>
                  <InputText
                    value={camera.id}
                    onChange={(e) => handleCameraChange(index, 'id', e.target.value)}
                    placeholder="ID камеры"
                    className="media-config-input"
                  />
                  <InputText
                    value={camera.name || ''}
                    onChange={(e) => handleCameraChange(index, 'name', e.target.value)}
                    placeholder="Название"
                    className="media-config-input"
                  />
                  <InputText
                    value={camera.streamUrl || ''}
                    onChange={(e) => handleCameraChange(index, 'streamUrl', e.target.value)}
                    placeholder="HLS ссылка (.m3u8)"
                    className="media-config-input wide"
                  />
                  <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-danger"
                    onClick={() => handleRemoveCamera(index)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="media-config-subtitle">Медиафайлы</div>
          {!loading && assets.length === 0 && (
            <div className="media-config-empty">Файлы и ссылки не добавлены.</div>
          )}
          {!loading && assets.length > 0 && (
            <div className="media-config-list">
              {assets.map((asset, index) => (
                <div className="media-config-row media-config-row--asset" key={asset.id}>
                  <InputText
                    value={asset.name || ''}
                    onChange={(e) => handleAssetChange(index, 'name', e.target.value)}
                    placeholder="Название"
                    className="media-config-input"
                  />
                  <InputText
                    value={asset.group || ''}
                    onChange={(e) => handleAssetChange(index, 'group', e.target.value)}
                    placeholder="Группа"
                    className="media-config-input"
                  />
                  <Dropdown
                    value={asset.type}
                    options={assetTypeOptions}
                    onChange={(e) => handleAssetChange(index, 'type', e.value)}
                    className="media-config-input"
                  />
                  <InputText
                    value={asset.url || ''}
                    onChange={(e) => handleAssetChange(index, 'url', e.target.value)}
                    placeholder="URL (если без загрузки)"
                    className="media-config-input wide"
                  />
                  <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-danger"
                    onClick={() => handleRemoveAsset(index)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="media-config-footer">
            <Button
              label="Сохранить"
              icon="pi pi-save"
              onClick={handleSave}
              disabled={loading}
            />
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) {
            uploadFiles(e.target.files);
          }
        }}
      />
    </div>
  );
}
