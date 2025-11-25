import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import CustomizationTable from './components/CustomizationTable';
import BlocksTable from './components/BlocksTable';
import EdgesTable from './components/EdgesTable';
import TagsTable from './components/TagsTable';
import TagLayoutConstructor from './components/TagLayoutConstructor';
import './main.css';

const navItems = [
    { path: '/edges', name: 'Буровые', icon: 'pi pi-sitemap' },
    { path: '/blocks', name: 'Блоки', icon: 'pi pi-box' },
    { path: '/tags', name: 'Теги', icon: 'pi pi-tags' },
    { path: '/edge-customization', name: 'Компоненты Буровых', icon: 'pi pi-cog' },
    { path: '/block-customization', name: 'Компоненты Блоков', icon: 'pi pi-cog' },
    { path: '/tag-customization', name: 'Компоненты Тегов', icon: 'pi pi-cog' },
];

export default function AdminApp() {
    const location = useLocation();

    return (
        <div className="admin-layout"> 
            <aside className="admin-sidebar">
                <div className="sidebar-header">
                    <h1 className="logo-text">Drill</h1> 
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
                                    >
                                        <i className={item.icon}></i>
                                        <span>{item.name}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
            </aside>
            <main className="admin-content">
                <div className="content-header">
                    <h2 className="text-3xl font-semibold">
                       Администрирование
                    </h2>
                </div>
                <div className="content-card"> 
                    <Routes>
                        <Route index element={<Navigate to="edges" replace />} />
                        <Route path="edges" element={<EdgesTable title="Буровые"/>} />
                        <Route path="blocks" element={<BlocksTable title="Блоки"/>} />
                        <Route path="tags" element={<TagsTable title="Теги"/>} />
                        
                        <Route path="edge-customization" element={<CustomizationTable type="edge" title="Компоненты Буровых"/>} />
                        <Route path="block-customization" element={<CustomizationTable type="block" title="Компоненты Блоков"/>} />
                        {/* <Route path="tag-customization" element={<CustomizationTable type="tag" title="Компоненты Тегов"/>} /> */}
                        <Route path="tag-customization" element={<TagLayoutConstructor title="Конструктор размещения тегов"/>} />
                    </Routes>
                </div>
            </main>
        </div>
    );
}
