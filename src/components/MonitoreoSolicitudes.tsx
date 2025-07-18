'use client';

import ValidacionUsuario from './ValidacionUsuario';
import DashboardCompras from './DashboardCompras';
import { useAuthSession } from '@/lib/hooks/useAuthSession';

interface UserData {
  cedula: string;
  nombre: string;
  cargo: string;
  area: string;
  email: string;
}

export default function MonitoreoSolicitudes() {
  const { isAuthenticated, userData, isLoading, login, logout } = useAuthSession();

  const handleValidationSuccess = (user: UserData) => {
    login(user);
  };

  const handleValidationError = (error: string) => {
    console.error('Error de validación:', error);
  };

  const handleLogout = () => {
    logout();
  };

  // Mostrar spinner mientras se verifica la sesión existente
  if (isLoading) {
    return (
      <div 
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat flex items-center justify-center"
        style={{
          backgroundImage: 'url(https://res.cloudinary.com/dvnuttrox/image/upload/v1752096889/DJI_0909_cmozhv.jpg)'
        }}
      >
        <div className="absolute inset-0 bg-black/50"></div>
        <div className="relative z-10">
          <div className="bg-white/15 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-2xl">
            <div className="flex items-center justify-center space-x-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              <span className="text-white text-lg font-semibold">Verificando sesión...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div 
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat"
        style={{
          backgroundImage: 'url(https://res.cloudinary.com/dvnuttrox/image/upload/v1752167074/20032025-DSC_3427_1_1_zmq71m.jpg)'
        }}
      >
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative z-10">
          <ValidacionUsuario
            onValidationSuccess={handleValidationSuccess}
            onValidationError={handleValidationError}
          />
        </div>
      </div>
    );
  }

  // Verificar que userData no sea null
  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/50">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Cargando datos del usuario...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat"
      style={{
        backgroundImage: 'url(https://res.cloudinary.com/dvnuttrox/image/upload/v1752096889/DJI_0909_cmozhv.jpg)'
      }}
    >
      <div className="absolute inset-0 bg-black/50 min-h-full"></div>
      <div className="relative z-10">
        <div className="bg-black/50 min-h-screen">
          <DashboardCompras
            userData={userData}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </div>
  );
}
