import React from 'react';
import * as ReactDOM from 'react-dom/client'; 
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrimeReactProvider } from 'primereact/api';
import AdminApp from './AdminApp.tsx'; 
import './main.css'

const queryClient = new QueryClient();

function AdminRoot() { 
  return (
    <React.StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <PrimeReactProvider>
            <Routes>
              <Route path="/*" element={<AdminApp />} /> 
              <Route path="*" element={<Navigate to="/edges" replace />} />
            </Routes>
          </PrimeReactProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<AdminRoot />);