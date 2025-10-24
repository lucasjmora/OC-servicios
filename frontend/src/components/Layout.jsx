import React from 'react';
import { Outlet } from 'react-router-dom';
import { Suspense } from 'react';
import Sidebar from './Sidebar';
import LoadingScreen from './LoadingScreen';

const Layout = () => {
  return (
    <div className="flex min-h-screen bg-background-main">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Suspense fallback={<LoadingScreen message="Cargando página..." />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default Layout;


