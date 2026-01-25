import { useState } from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import CustomizationTable from './components/CustomizationTable';
import EdgesTable from './components/EdgesTable';
import TagsTable from './components/TagsTable';
import TagLayoutConstructor from './components/TagLayoutConstructor';
import TableConfigurator from './components/TableConfigurator';
import EmulationDataPage from './components/EmulationDataPage';
import MaintenanceConfigPage from './components/MaintenanceConfigPage';
import './main.css';

const navItems = [
    { path: '/edges', name: 'Буровые', icon: 'pi pi-building' },
    { path: '/tags', name: 'Теги', icon: 'pi pi-bookmark' },
    { path: '/emulation', name: 'Эмуляция', icon: 'pi pi-database' },
    { path: '/maintenance-config', name: 'ТО', icon: 'pi pi-wrench' },
    { path: '/edge-customization', name: 'Компоненты Буровых', icon: 'pi pi-sliders-h' },
    { path: '/tag-customization', name: 'Компоненты Тегов', icon: 'pi pi-th-large' },
    { path: '/table-config', name: 'Настройка таблиц', icon: 'pi pi-table' },
];

export default function AdminApp() {
    const location = useLocation();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const toggleSidebar = () => {
        setSidebarCollapsed(!sidebarCollapsed);
    };

    return (
        <div className="admin-layout"> 
            <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-header">
                    {!sidebarCollapsed && <h1 className="logo-text">Drill</h1>}
                    <button 
                        className="sidebar-toggle"
                        onClick={toggleSidebar}
                        aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
                        title={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
                    >
                        <i className={sidebarCollapsed ? 'pi pi-angle-right' : 'pi pi-angle-left'}></i>
                    </button>
                </div>
                
                <nav className="sidebar-nav">
                    <ul className="nav-list"> 
                        {navItems.map((item) => {
                            const isActive = location.pathname.includes(item.path);
                            const linkClasses = `nav-link ${isActive ? 'active' : ''}`;
                            
                            return (
                                <li key={item.path}>
                                    <Link 
                                        to={item.path} 
                                        className={linkClasses}
                                        target={'_self'}
                                        title={sidebarCollapsed ? item.name : ''}
                                    >
                                        <i className={item.icon}></i>
                                        {!sidebarCollapsed && <span>{item.name}</span>}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
            </aside>
            <main className={`admin-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                <div className="content-header">
                    <h2 className="text-3xl font-semibold">
                       Администрирование
                    </h2>
                </div>
                <div className="content-card"> 
                    <Routes>
                        <Route index element={<Navigate to="edges" replace />} />
                        <Route path="edges" element={<EdgesTable title="Буровые"/>} />
                        <Route path="tags" element={<TagsTable title="Теги"/>} />
                        <Route path="emulation" element={<EmulationDataPage title="Эмуляция"/>} />
                        <Route path="maintenance-config" element={<MaintenanceConfigPage />} />
                        
                        <Route path="edge-customization" element={<CustomizationTable type="edge" title="Компоненты Буровых"/>} />
                        <Route path="tag-customization" element={<TagLayoutConstructor title="Конструктор размещения тегов"/>} />
                        <Route path="table-config" element={<TableConfigurator title="Настройка таблиц"/>} />
                    </Routes>
                </div>
            </main>
        </div>
    );
}
