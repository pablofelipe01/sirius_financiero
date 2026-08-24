'use client';

import ValidacionUsuario from './ValidacionUsuario';
import CajaMenorAgent from './CajaMenorAgent';
import ScannerComprobante from './ScannerComprobante';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { UserData } from '@/types/compras';
import {
  DollarSign,
  Plus,
  Search,
  AlertTriangle,
  Filter,
  Download,
  Calendar,
  Receipt,
  User,
  Building,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Mic,
  MicOff
} from 'lucide-react';

interface CajaMenorRecord {
  id: string;
  fechaAnticipo: string;
  beneficiario: string;
  nitCC?: string;
  concepto: string;
  valor: number;
  itemsCajaMenor?: string[]; // Array de IDs de items relacionados
  realizaRegistro?: string; // Nuevo campo: quien realiza el registro
  fechaConsolidacion?: string; // Fecha de consolidación del periodo
  documentoConsolidacion?: AirtableAttachment[]; // Array de attachments del documento de consolidación
  estadoCajaMenor?: string; // Estado: "Caja Menor Consiliada" o "Caja Menor Abierta"
}

interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  thumbnails?: {
    small?: { url: string; width: number; height: number };
    large?: { url: string; width: number; height: number };
  };
}

interface ItemCajaMenor {
  id: string;
  item?: number; // Auto Number
  fecha: string;
  beneficiario: string;
  nitCC?: string;
  concepto: string;
  centroCosto?: string;
  valor: number;
  realizaRegistro?: string;
  cajaMenor?: string[]; // Array de IDs de caja menor relacionados
  comprobante?: AirtableAttachment[]; // Array de attachments
}

interface FormDataType {
  fecha: string;
  beneficiario: string;
  nitCC: string;
  concepto: string;
  centroCosto: string;
  centroCostoOtro: string;
  valor: string;
  realizaRegistro: string;
  comprobanteFile: File | Blob | null;
  comprobanteFileName?: string;
}

function CajaMenorDashboard({ userData, onLogout }: { userData: UserData, onLogout: () => void }) {
  const [cajaMenorRecords, setCajaMenorRecords] = useState<CajaMenorRecord[]>([]);
  const [itemsRecords, setItemsRecords] = useState<ItemCajaMenor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CajaMenorRecord | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [showCajaMenorModal, setShowCajaMenorModal] = useState(false);
  const [cajaMenorActual, setCajaMenorActual] = useState<CajaMenorRecord | null>(null);
  const [showConsolidarModal, setShowConsolidarModal] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);
  const [showEditFechaModal, setShowEditFechaModal] = useState(false);
  const [showCajaItemsModal, setShowCajaItemsModal] = useState(false);
  const [cajaParaVerItems, setCajaParaVerItems] = useState<CajaMenorRecord | null>(null);
  const [cajaParaEditar, setCajaParaEditar] = useState<CajaMenorRecord | null>(null);
  const [editingCajaData, setEditingCajaData] = useState({
    fechaAnticipo: '',
    beneficiario: '',
    nitCC: '',
    concepto: '',
    valor: '',
    realizaRegistro: '',
  });
  const [isSavingFecha, setIsSavingFecha] = useState(false);

  // Estados para edición y eliminación
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemType, setEditingItemType] = useState<'item' | 'cajaMenor' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // IDs de usuarios autorizados para editar/eliminar (desde variables de entorno)
  const AUTHORIZED_USERS = process.env.NEXT_PUBLIC_AUTHORIZED_USERS_EDIT_DELETE?.split(',') || [];
  const canEditDelete = userData?.recordId && AUTHORIZED_USERS.includes(userData.recordId);
  
  // Estados para grabación de audio y transcripción
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  // Estados para beneficiarios
  const [beneficiarios, setBeneficiarios] = useState<Array<{ nombre: string; nitCC: string }>>([]);
  const [esNuevoBeneficiario, setEsNuevoBeneficiario] = useState(false);
  const [searchBeneficiario, setSearchBeneficiario] = useState('');
  const [showBeneficiarioDropdown, setShowBeneficiarioDropdown] = useState(false);

  // Ref para reabrir el modal de items después de que el formulario de edición cierre
  const returnToItemsCajaRef = useRef<CajaMenorRecord | null>(null);
  const prevShowModalRef = useRef(false);

  // Función helper para formatear fechas ISO sin problemas de zona horaria
  const formatearFecha = (fechaISO: string): string => {
    if (!fechaISO) return 'Sin fecha';
    try {
      // Dividir la fecha ISO (YYYY-MM-DD) y crear fecha local
      const [year, month, day] = fechaISO.split('T')[0].split('-');
      const fecha = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      if (isNaN(fecha.getTime())) return 'Fecha inválida';
      
      return fecha.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return 'Fecha inválida';
    }
  };

  // Función helper para formatear mes y año desde fecha ISO
  const formatearMesAnio = (fechaISO: string): string => {
    if (!fechaISO) return '';
    try {
      const [year, month] = fechaISO.split('T')[0].split('-');
      const fecha = new Date(parseInt(year), parseInt(month) - 1, 1);
      
      if (isNaN(fecha.getTime())) return '';
      
      return fecha.toLocaleDateString('es-CO', { 
        month: 'long', 
        year: 'numeric' 
      }).toUpperCase();
    } catch {
      return '';
    }
  };

  // Función helper para obtener fecha local en formato YYYY-MM-DD sin offset de timezone
  const obtenerFechaLocal = (): string => {
    const ahora = new Date();
    const year = ahora.getFullYear();
    const month = String(ahora.getMonth() + 1).padStart(2, '0');
    const day = String(ahora.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Función helper para detectar si es fin de mes
  const esFinDeMes = (): boolean => {
    const ahora = new Date();
    const ultimoDiaMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    return ahora.getDate() === ultimoDiaMes;
  };

  // Datos del formulario para caja menor
  const [formCajaMenor, setFormCajaMenor] = useState({
    beneficiario: '',
    nitCC: '',
    concepto: '',
    valor: 0,
    realizaRegistro: userData?.nombre || 'Usuario'
  });

  // Datos del formulario para items
  const [formData, setFormData] = useState<FormDataType>(() => {
    // Cargar datos guardados del localStorage al inicializar
    if (typeof window !== 'undefined') {
      try {
        const savedData = localStorage.getItem('cajaMenorFormData');
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          // Solo usar datos guardados si no han pasado más de 24 horas
          const savedTime = localStorage.getItem('cajaMenorFormDataTime');
          if (savedTime && (Date.now() - parseInt(savedTime)) < 24 * 60 * 60 * 1000) {
            return { ...parsedData, realizaRegistro: userData?.nombre || 'Usuario' };
          }
        }
      } catch (error) {
        console.warn('Error loading saved form data:', error);
      }
    }
    return {
      fecha: new Date().toISOString().split('T')[0],
      beneficiario: '',
      nitCC: '',
      concepto: '',
      centroCosto: '',
      centroCostoOtro: '',
      valor: '',
      realizaRegistro: userData?.nombre || 'Usuario',
      comprobanteFile: null as File | null
    };
  });

  // Función para guardar datos en localStorage
  const saveFormDataToStorage = (data: typeof formData) => {
    if (typeof window !== 'undefined') {
      try {
        // Solo guardar si hay datos relevantes (no solo valores por defecto)
        const hasData = data.beneficiario || data.concepto || data.valor || data.centroCosto;
        if (hasData) {
          localStorage.setItem('cajaMenorFormData', JSON.stringify(data));
          localStorage.setItem('cajaMenorFormDataTime', Date.now().toString());
        }
      } catch (error) {
        console.warn('Error saving form data:', error);
      }
    }
  };

  // Función para limpiar datos del localStorage
  const clearFormDataFromStorage = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('cajaMenorFormData');
        localStorage.removeItem('cajaMenorFormDataTime');
      } catch (error) {
        console.warn('Error clearing form data:', error);
      }
    }
  };

  // Estado para mostrar indicador de datos guardados
  const [hasSavedData, setHasSavedData] = useState(false);

  // Verificar si hay datos guardados al cargar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedData = localStorage.getItem('cajaMenorFormData');
        const savedTime = localStorage.getItem('cajaMenorFormDataTime');
        if (savedData && savedTime && (Date.now() - parseInt(savedTime)) < 24 * 60 * 60 * 1000) {
          const parsedData = JSON.parse(savedData);
          const hasData = parsedData.beneficiario || parsedData.concepto || parsedData.valor || parsedData.centroCosto;
          setHasSavedData(hasData);
        }
      } catch (error) {
        console.warn('Error checking saved data:', error);
      }
    }
  }, []);

  // Actualizar indicador cuando cambie formData
  useEffect(() => {
    const hasData = !!(formData.beneficiario || formData.concepto || formData.valor || formData.centroCosto);
    setHasSavedData(hasData);
  }, [formData]);

  const categorias = [
    'Transporte',
    'Alimentación',
    'Suministros de Oficina',
    'Servicios Públicos',
    'Mantenimiento',
    'Comunicaciones',
    'Gastos Menores',
    'Otros'
  ];

  const unidadesNegocio = [
    'Pirólisis',
    'Biológicos',
    'RaaS',
    'Administración'
  ];

  useEffect(() => {
    cargarDatos();
  }, []);

  // Memoizar todas las cajas menores activas (no consolidadas)
  const cajasMenoresActivas = useMemo(() => {
    return cajaMenorRecords.filter(record => 
      record.estadoCajaMenor === 'Caja Menor Abierta' || !record.estadoCajaMenor
    );
  }, [cajaMenorRecords]);

  // Memoizar la última caja menor: prioriza cajas activas, si no hay, trae la última por fecha
  const ultimaCajaMenor = useMemo(() => {
    if (cajaMenorRecords.length === 0) return null;
    
    // Primero buscar cajas activas
    const activas = cajaMenorRecords.filter(record => 
      record.estadoCajaMenor === 'Caja Menor Abierta' || !record.estadoCajaMenor
    );
    
    if (activas.length > 0) {
      // Si hay cajas activas, retornar la más reciente de las activas
      const activasOrdenadas = [...activas].sort((a, b) => 
        new Date(b.fechaAnticipo).getTime() - new Date(a.fechaAnticipo).getTime()
      );
      return activasOrdenadas[0];
    }
    
    // Si no hay activas, retornar la última por fecha (consolidada)
    const ordenados = [...cajaMenorRecords].sort((a, b) => 
      new Date(b.fechaAnticipo).getTime() - new Date(a.fechaAnticipo).getTime()
    );
    return ordenados[0];
  }, [cajaMenorRecords]);

  // Verificar si la última caja menor está consolidada
  const estaConsolidada = useMemo(() => {
    return ultimaCajaMenor?.estadoCajaMenor === 'Caja Menor Consiliada';
  }, [ultimaCajaMenor]);

  // Función para verificar la última caja menor
  const verificarUltimaCajaMenor = useCallback(() => {
    return ultimaCajaMenor;
  }, [ultimaCajaMenor]);

  // Actualizar el estado de caja menor actual cuando cambie
  useEffect(() => {
    setCajaMenorActual(ultimaCajaMenor || null);
  }, [ultimaCajaMenor]);

  // Memoizar el estado del botón de nueva caja menor
  const buttonState = useMemo(() => {
    const hayActivas = cajasMenoresActivas.length > 0;
    
    if (hayActivas) {
      return {
        className: 'bg-gradient-to-r from-gray-600 to-gray-700 text-white/50 cursor-not-allowed',
        title: 'Debe consolidar las cajas menores activas antes de crear una nueva',
        text: 'Nueva Caja Menor',
        shortText: 'Caja',
        icon: 'DollarSign',
        disabled: true
      };
    }
    
    return {
      className: 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white hover:shadow-green-500/25',
      title: 'Crear nueva caja menor',
      text: 'Nueva Caja Menor',
      shortText: 'Caja',
      icon: 'DollarSign',
      disabled: false
    };
  }, [cajasMenoresActivas]);

  // Memoizar el handler del botón de nueva caja menor
  const handleNuevaCajaMenor = useCallback(() => {
    if (cajasMenoresActivas.length > 0) {
      alert('❌ No se puede crear una nueva caja menor\n\nDebe consolidar todas las cajas menores activas antes de crear una nueva.');
      return;
    }
    setShowCajaMenorModal(true);
  }, [cajasMenoresActivas]);

  // Actualizar el campo "Realiza Registro" cuando cambie el usuario
  useEffect(() => {
    setFormCajaMenor(prev => ({
      ...prev,
      realizaRegistro: userData?.nombre || 'Usuario'
    }));
  }, [userData]);

  // Reabrir modal de items cuando el formulario de edición de item cierra
  useEffect(() => {
    if (prevShowModalRef.current && !showModal && returnToItemsCajaRef.current) {
      const caja = returnToItemsCajaRef.current;
      returnToItemsCajaRef.current = null;
      setCajaParaVerItems(caja);
      setShowCajaItemsModal(true);
    }
    prevShowModalRef.current = showModal;
  }, [showModal]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Cargando datos de Caja Menor...');
      
      const response = await fetch('/api/caja-menor', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        throw new Error('Error al cargar los datos de caja menor');
      }

      const data = await response.json();
      console.log('✅ Datos recibidos:', data);

      if (data.success) {
        // Filtrar registros válidos antes de asignar al state
        const cajaMenorValidos = (data.cajaMenor || []).filter((record: any) => {
          const esValido = record && record.id && record.fechaAnticipo && record.beneficiario;
          if (!esValido) {
            console.warn('⚠️ Registro de Caja Menor inválido ignorado:', record);
          }
          return esValido;
        });

        const itemsValidos = (data.items || []).filter((item: any) => {
          const esValido = item && item.id && item.fecha && item.concepto;
          if (!esValido) {
            console.warn('⚠️ Item de Caja Menor inválido ignorado:', item);
          }
          return esValido;
        });

        setCajaMenorRecords(cajaMenorValidos);
        setItemsRecords(itemsValidos);
        
        const beneficiariosUnicos = itemsValidos.reduce((acc: Array<{ nombre: string; nitCC: string }>, item: any) => {
          const existe = acc.find(b => b.nombre === item.beneficiario);
          if (!existe && item.beneficiario) {
            acc.push({
              nombre: item.beneficiario,
              nitCC: item.nitCC || ''
            });
          }
          return acc;
        }, []);
        
        setBeneficiarios(beneficiariosUnicos);
        console.log(' Registros Caja Menor válidos:', cajaMenorValidos.length);
        console.log('📊 Items Caja Menor válidos:', itemsValidos.length);
        
        // Debug detallado de los primeros registros
        if (cajaMenorValidos.length > 0) {
          console.log('📋 Ejemplo Caja Menor válido:', {
            id: cajaMenorValidos[0]?.id,
            fecha: cajaMenorValidos[0]?.fechaAnticipo,
            beneficiario: cajaMenorValidos[0]?.beneficiario,
            concepto: cajaMenorValidos[0]?.concepto,
            valor: cajaMenorValidos[0]?.valor,
            tipo: typeof cajaMenorValidos[0]?.valor
          });
        }
        
        if (itemsValidos.length > 0) {
          console.log('📋 Ejemplo Item válido:', {
            id: itemsValidos[0]?.id,
            fecha: itemsValidos[0]?.fecha,
            concepto: itemsValidos[0]?.concepto,
            valor: itemsValidos[0]?.valor,
            tipo: typeof itemsValidos[0]?.valor
          });
        }

        // Debug de registros originales que fueron filtrados
        console.log('🔍 Total registros originales Caja Menor:', (data.cajaMenor || []).length);
        console.log('🔍 Total items originales:', (data.items || []).length);
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
      
    } catch (error) {
      console.error('❌ Error al cargar datos:', error);
      setError('Error al cargar los datos de caja menor');
    } finally {
      setLoading(false);
    }
  };

  // Función para cargar datos predefinidos
  const cargarDatosPredefinidos = () => {
    const fechaActual = new Date();
    const meses = [
      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
    ];
    const mesActual = meses[fechaActual.getMonth()];
    const añoActual = fechaActual.getFullYear();

    setFormCajaMenor({
      beneficiario: 'Joys Moreno',
      nitCC: '1026272126', // Cédula de Joys Moreno
      concepto: `CAJA MENOR ${mesActual} ${añoActual}`,
      valor: 2000000,
      realizaRegistro: userData?.nombre || 'Usuario'
    });
  };

  // Funciones para manejar grabación de audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        transcribeAudio(audioBlob);
        
        // Detener el stream para liberar el micrófono
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error accediendo al micrófono:', error);
      alert('Error accediendo al micrófono. Verifique los permisos.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Agregar la transcripción al campo de concepto
        setFormData(prev => ({
          ...prev,
          concepto: prev.concepto ? `${prev.concepto} ${result.transcription}` : result.transcription
        }));
      } else {
        console.error('Error en transcripción:', result.error);
        alert('Error al transcribir el audio: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error transcribiendo audio:', error);
      alert('Error al transcribir el audio. Inténtelo de nuevo.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const clearAudioTranscription = () => {
    setAudioBlob(null);
  };

  // Función para obtener el nombre de la carpeta de la caja menor actual
  const obtenerNombreCarpetaCajaMenor = () => {
    if (!ultimaCajaMenor) return null;
    
    // Parsear fecha ISO sin problemas de zona horaria
    const [year, month] = ultimaCajaMenor.fechaAnticipo.split('T')[0].split('-');
    const fecha = new Date(parseInt(year), parseInt(month) - 1, 1);
    const mes = fecha.toLocaleDateString('es-CO', { month: 'long' }).toLowerCase();
    const anio = fecha.getFullYear();
    
    return `${mes}_${anio}_caja_menor`;
  };



  const generarPDFConsolidacion = async () => {
    if (!ultimaCajaMenor) return;
    
    setIsGeneratingPDF(true);
    try {
      // Filtrar items de la última caja menor
      const itemsDeLaCaja = itemsRecords.filter(item => 
        item.cajaMenor?.includes(ultimaCajaMenor.id)
      );

      // Preparar datos para el PDF
      const datosConsolidacion = {
        cajaMenor: {
          fechaAnticipo: ultimaCajaMenor.fechaAnticipo,
          fechaCierre: obtenerFechaLocal(),
          beneficiario: ultimaCajaMenor.beneficiario,
          nitCC: ultimaCajaMenor.nitCC || '',
          concepto: `CAJA MENOR ${formatearMesAnio(ultimaCajaMenor.fechaAnticipo)}`,
          valorInicial: ultimaCajaMenor.valor
        },
        items: itemsDeLaCaja.map((item, index) => ({
          item: index + 1,
          fecha: item.fecha,
          beneficiario: item.beneficiario,
          nitCC: item.nitCC || '',
          concepto: item.concepto,
          centroCosto: item.centroCosto || '',
          valor: item.valor
        })),
        totales: {
          totalLegalizado: totalEgresos,
          valorReintegrarSirius: totalIngresos - totalEgresos,
          valorReintegrarBeneficiario: 0
        }
      };

      console.log('📄 Generando PDF de consolidación...', datosConsolidacion);

      const response = await fetch('/api/generate-pdf-consolidacion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(datosConsolidacion),
      });

      if (response.ok) {
        // El PDF viene directamente como blob
        const blob = await response.blob();
        
        // Extraer el nombre del archivo del header Content-Disposition
        const contentDisposition = response.headers.get('Content-Disposition');
        const fileName = contentDisposition
          ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
          : 'consolidacion-caja-menor.pdf';
        
        // Crear URL temporal y descargar
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        
        // Limpiar
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        console.log('✅ PDF descargado exitosamente:', fileName);
        alert(`✅ PDF descargado exitosamente\n\n📄 Archivo: ${fileName}`);
      } else {
        const result = await response.json();
        throw new Error(result.error || 'Error al generar el PDF');
      }
    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      alert('Error al generar el PDF: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const confirmarConsolidacion = async () => {
    if (!ultimaCajaMenor) return;
    
    // Confirmar acción
    const confirmacion = confirm(
      '⚠️ CONFIRMAR CONSOLIDACIÓN\n\n' +
      '¿Está seguro de consolidar esta caja menor?\n\n' +
      'Esta acción:\n' +
      '✓ Generará y subirá el PDF de consolidación\n' +
      '✓ Registrará la fecha de consolidación\n' +
      '✓ Finalizará el periodo actual\n\n' +
      '⚠️ Esta acción NO se puede revertir'
    );

    if (!confirmacion) return;

    setIsConsolidating(true);
    try {
      // Filtrar items de la última caja menor
      const itemsDeLaCaja = itemsRecords.filter(item => 
        item.cajaMenor?.includes(ultimaCajaMenor.id)
      );

      // Preparar datos para el PDF
      const datosConsolidacion = {
        cajaMenor: {
          fechaAnticipo: ultimaCajaMenor.fechaAnticipo,
          fechaCierre: obtenerFechaLocal(),
          beneficiario: ultimaCajaMenor.beneficiario,
          nitCC: ultimaCajaMenor.nitCC || '',
          concepto: `CAJA MENOR ${formatearMesAnio(ultimaCajaMenor.fechaAnticipo)}`,
          valorInicial: ultimaCajaMenor.valor
        },
        items: itemsDeLaCaja.map((item, index) => ({
          item: index + 1,
          fecha: item.fecha,
          beneficiario: item.beneficiario,
          nitCC: item.nitCC || '',
          concepto: item.concepto,
          centroCosto: item.centroCosto || '',
          valor: item.valor,
          comprobanteUrl: item.comprobante?.[0]?.url || undefined
        })),
        totales: {
          totalLegalizado: totalEgresos,
          valorReintegrarSirius: totalIngresos - totalEgresos,
          valorReintegrarBeneficiario: 0
        }
      };

      console.log('📄 Generando PDF de consolidación para subir a S3...');

      // Generar PDF
      const pdfResponse = await fetch('/api/generate-pdf-consolidacion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(datosConsolidacion),
      });

      if (!pdfResponse.ok) {
        throw new Error('Error al generar el PDF');
      }

      // Obtener el PDF como blob
      const pdfBlob = await pdfResponse.blob();
      const pdfArrayBuffer = await pdfBlob.arrayBuffer();
      const pdfBuffer = Array.from(new Uint8Array(pdfArrayBuffer));

      console.log('✅ PDF generado, tamaño:', pdfBlob.size, 'bytes');

      // Obtener nombre de carpeta y fecha de consolidación
      const nombreCarpeta = obtenerNombreCarpetaCajaMenor();
      const fechaConsolidacion = obtenerFechaLocal();

      console.log('☁️ Subiendo PDF y actualizando registro...');

      // Consolidar: subir PDF a S3 y actualizar Airtable
      const consolidarResponse = await fetch('/api/consolidar-caja-menor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cajaMenorId: ultimaCajaMenor.id,
          pdfBuffer,
          nombreCarpeta,
          fechaConsolidacion
        }),
      });

      const consolidarResult = await consolidarResponse.json();

      if (!consolidarResponse.ok || !consolidarResult.success) {
        throw new Error(consolidarResult.error || 'Error al consolidar la caja menor');
      }

      console.log('✅ Consolidación completada exitosamente');

      // Agregar la URL del PDF a los datos de consolidación para el email
      const datosConsolidacionConPDF = {
        ...datosConsolidacion,
        pdfUrl: consolidarResult.pdfUrl,
        toEmails: ['adm@siriusregenerative.com', 'Contabilidad@siriusregenerative.com']
      };

      // Enviar email de notificación
      try {
        console.log('📧 Enviando email de notificación...');
        const emailResponse = await fetch('/api/send-email-consolidacion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(datosConsolidacionConPDF),
        });

        const emailResult = await emailResponse.json();
        
        if (emailResponse.ok && emailResult.success) {
          console.log('✅ Email enviado exitosamente');
        } else {
          console.warn('⚠️ Error enviando email:', emailResult.error);
          // No bloquear el flujo si falla el email
        }
      } catch (emailError) {
        console.error('❌ Error enviando email de notificación:', emailError);
        // No bloquear el flujo si falla el email
      }

      // Recargar datos
      await cargarDatos();
      
      // Cerrar modal
      setShowConsolidarModal(false);

      // Mostrar mensaje de éxito
      alert(
        '✅ CONSOLIDACIÓN EXITOSA\n\n' +
        '📄 PDF generado y almacenado\n' +
        '📅 Fecha de consolidación registrada\n' +
        '🔒 Periodo finalizado\n' +
        '📧 Notificación enviada por email\n\n' +
        'El periodo de caja menor ha sido cerrado exitosamente.\n' +
        'Puede crear una nueva caja menor para el próximo periodo.'
      );

    } catch (error) {
      console.error('❌ Error en consolidación:', error);
      alert('Error al consolidar la caja menor: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setIsConsolidating(false);
    }
  };

  const handleSubmitCajaMenor = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formCajaMenor.beneficiario || !formCajaMenor.concepto || formCajaMenor.valor <= 0) {
      alert('Por favor complete todos los campos');
      return;
    }

    try {
      setLoading(true);
      
      // Si estamos editando una caja menor
      if (editingItemId && editingItemType === 'cajaMenor') {
        const updateData = {
          id: editingItemId,
          table: 'cajaMenor',
          beneficiario: formCajaMenor.beneficiario,
          nitCC: formCajaMenor.nitCC,
          concepto: formCajaMenor.concepto,
          valor: formCajaMenor.valor,
          realizaRegistro: formCajaMenor.realizaRegistro
        };
        
        const response = await fetch('/api/caja-menor', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Error al actualizar la caja menor');
        }
        
        alert('✅ Caja menor actualizada exitosamente');
        setShowCajaMenorModal(false);
        setEditingItemId(null);
        setEditingItemType(null);
        setFormCajaMenor({ beneficiario: '', nitCC: '', concepto: '', valor: 0, realizaRegistro: userData?.nombre || 'Usuario' });
        await cargarDatos();
        setLoading(false);
        return;
      }
      
      const nuevaCajaMenor = {
        fechaAnticipo: new Date().toISOString().split('T')[0],
        concepto: formCajaMenor.concepto,
        beneficiario: formCajaMenor.beneficiario,
        nitCC: formCajaMenor.nitCC,
        valor: formCajaMenor.valor,
        realizaRegistro: formCajaMenor.realizaRegistro
      };

      const response = await fetch('/api/caja-menor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'cajaMenor',
          data: nuevaCajaMenor
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear la caja menor');
      }

      if (result.success) {
        // Recargar datos
        await cargarDatos();
        setShowCajaMenorModal(false);
        setFormCajaMenor({ beneficiario: '', nitCC: '', concepto: '', valor: 0, realizaRegistro: userData?.nombre || 'Usuario' });
        alert('Caja menor creada exitosamente');
      } else {
        throw new Error(result.error || 'Error al crear la caja menor');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al crear la caja menor: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (itemId: string, type: 'item' | 'cajaMenor') => {
    if (!canEditDelete) {
      alert('❌ No tienes permisos para editar registros.');
      return;
    }
    
    setEditingItemId(itemId);
    setEditingItemType(type);
    
    if (type === 'item') {
      // Buscar el item a editar
      const item = itemsRecords.find(i => i.id === itemId);
      if (item) {
        setFormData({
          fecha: item.fecha || new Date().toISOString().split('T')[0],
          beneficiario: item.beneficiario || '',
          nitCC: item.nitCC || '',
          concepto: item.concepto || '',
          centroCosto: item.centroCosto || '',
          centroCostoOtro: '',
          valor: item.valor?.toString() || '',
          realizaRegistro: item.realizaRegistro || userData?.nombre || 'Usuario',
          comprobanteFile: null
        });
        setSearchBeneficiario(item.beneficiario || '');
        setEsNuevoBeneficiario(false);
        setShowBeneficiarioDropdown(false);
        setShowModal(true);
      }
    } else {
      // Buscar la caja menor a editar
      const caja = cajaMenorRecords.find(c => c.id === itemId);
      if (caja) {
        setFormCajaMenor({
          beneficiario: caja.beneficiario || '',
          nitCC: caja.nitCC || '',
          concepto: caja.concepto || '',
          valor: caja.valor || 0,
          realizaRegistro: caja.realizaRegistro || userData?.nombre || 'Usuario'
        });
        setShowCajaMenorModal(true);
      }
    }
  };
  
  const handleDeleteItem = async (itemId: string, type: 'item' | 'cajaMenor') => {
    if (!canEditDelete) {
      alert('❌ No tienes permisos para eliminar registros.');
      return;
    }
    
    const itemName = type === 'item' ? 'este registro' : 'esta caja menor';
    const confirmMessage = type === 'cajaMenor' 
      ? `⚠️ ADVERTENCIA: Esto eliminará la caja menor y todos sus items asociados.\n\n¿Está seguro de eliminar ${itemName}?`
      : `¿Está seguro de eliminar ${itemName}?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/caja-menor?id=${itemId}&table=${type === 'item' ? 'items' : 'cajaMenor'}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al eliminar el registro');
      }
      
      alert('✅ Registro eliminado exitosamente');
      await cargarDatos();
    } catch (error) {
      console.error('Error eliminando registro:', error);
      alert('❌ Error al eliminar el registro: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAbrirEditarFecha = (caja: CajaMenorRecord) => {
    setCajaParaEditar(caja);
    setEditingCajaData({
      fechaAnticipo: caja.fechaAnticipo?.split('T')[0] || '',
      beneficiario: caja.beneficiario || '',
      nitCC: caja.nitCC || '',
      concepto: caja.concepto || '',
      valor: String(caja.valor || ''),
      realizaRegistro: caja.realizaRegistro || '',
    });
    setShowHistoricoModal(false);
    setShowEditFechaModal(true);
  };

  const handleSubmitEditarFecha = async () => {
    if (!cajaParaEditar || !editingCajaData.fechaAnticipo || !editingCajaData.beneficiario || !editingCajaData.concepto || !editingCajaData.valor) return;

    setIsSavingFecha(true);
    try {
      const response = await fetch('/api/caja-menor', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cajaParaEditar.id,
          table: 'cajaMenor',
          fechaAnticipo: editingCajaData.fechaAnticipo,
          beneficiario: editingCajaData.beneficiario,
          nitCC: editingCajaData.nitCC,
          concepto: editingCajaData.concepto,
          valor: editingCajaData.valor,
          realizaRegistro: editingCajaData.realizaRegistro,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al actualizar la caja menor');
      }

      await cargarDatos();
      setShowEditFechaModal(false);
      setCajaParaEditar(null);
    } catch (error) {
      alert('❌ Error al actualizar: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setIsSavingFecha(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verificar que existe al menos una caja menor activa
    if (cajasMenoresActivas.length === 0 && !editingItemId) {
      alert('❌ No hay cajas menores activas para registrar items.\n\nPor favor, cree una caja menor primero.');
      setShowModal(false);
      setShowCajaMenorModal(true);
      return;
    }
    
    // Calcular saldo disponible actual (de la primera caja menor activa)
    const cajaActiva = cajasMenoresActivas[0];
    const totalIngresosCaja = cajaActiva?.valor || 0;
    const totalEgresosCaja = itemsRecords
      .filter(item => item.cajaMenor?.includes(cajaActiva?.id || ''))
      .reduce((sum, item) => sum + (item.valor || 0), 0);
    const saldoDisponible = totalIngresosCaja - totalEgresosCaja;
    
    // Validar que el valor del nuevo registro no supere el saldo disponible
    const valorNuevoRegistro = parseFloat(formData.valor) || 0;
    
    if (valorNuevoRegistro <= 0) {
      alert('❌ El valor debe ser mayor a cero.');
      return;
    }
    
    // Validar que el valor no sea excesivamente alto (máximo 1.000.000.000 - mil millones)
    if (valorNuevoRegistro > 1000000000) {
      alert('❌ El valor ingresado es excesivamente alto.\n\nValor máximo permitido: $1.000.000.000\nValor ingresado: $' + valorNuevoRegistro.toLocaleString('es-CO') + '\n\nPor favor, verifique el monto.');
      return;
    }
    
    if (saldoDisponible < 0 && !editingItemId) {
      alert('❌ La caja menor ya está en déficit. No se pueden registrar más gastos hasta consolidar la caja menor.');
      return;
    }
    
    if (valorNuevoRegistro > saldoDisponible) {
      alert(`❌ El valor del registro ($${valorNuevoRegistro.toLocaleString('es-CO')}) supera el saldo disponible de la caja menor.\n\n💰 Saldo disponible: $${saldoDisponible.toLocaleString('es-CO')}\n⚠️ Valor a registrar: $${valorNuevoRegistro.toLocaleString('es-CO')}\n🚫 Excedente: $${(valorNuevoRegistro - saldoDisponible).toLocaleString('es-CO')}\n\nPor favor, ingrese un valor menor o igual al saldo disponible.`);
      return;
    }
    
    try {
      setLoading(true);
      
      // Si estamos editando, usar endpoint PUT
      if (editingItemId) {
        const centroCostoFinal = formData.centroCosto === 'Otro' ? formData.centroCostoOtro : formData.centroCosto;
        
        // Subir comprobante si existe
        let comprobanteUrl = '';
        if (formData.comprobanteFile) {
          console.log('📤 Subiendo comprobante para edición...');

          const fechaActual = new Date();
          const mes = fechaActual.toLocaleString('es-CO', { month: 'long' }).toLowerCase();
          const año = fechaActual.getFullYear();
          const carpetaCajaMenor = `${mes}_${año}`;

          const formDataUpload = new FormData();

          // Si es un Blob generado por el scanner, crear un File con nombre
          if (formData.comprobanteFile instanceof Blob && !(formData.comprobanteFile instanceof File)) {
            const fileName = formData.comprobanteFileName || `comprobante-${Date.now()}.pdf`;
            const file = new File([formData.comprobanteFile], fileName, { type: 'application/pdf' });
            formDataUpload.append('file', file);
          } else {
            formDataUpload.append('file', formData.comprobanteFile);
          }

          formDataUpload.append('carpetaCajaMenor', carpetaCajaMenor);
          formDataUpload.append('beneficiario', formData.beneficiario);

          const uploadResponse = await fetch('/api/upload-comprobante-caja-menor', {
            method: 'POST',
            body: formDataUpload,
          });

          const uploadResult = await uploadResponse.json();

          if (!uploadResponse.ok) {
            throw new Error(uploadResult.error || 'Error al subir el comprobante');
          }

          comprobanteUrl = uploadResult.fileUrl;
          console.log('✅ Comprobante actualizado:', comprobanteUrl);
        }
        
        const updateData = {
          id: editingItemId,
          table: 'items',
          fecha: formData.fecha,
          beneficiario: formData.beneficiario,
          nitCC: formData.nitCC,
          concepto: formData.concepto,
          centroCosto: centroCostoFinal,
          valor: formData.valor,
          realizaRegistro: formData.realizaRegistro,
          cajaMenor: cajaActiva?.id ? [cajaActiva.id] : undefined,
          comprobante: comprobanteUrl ? [{ url: comprobanteUrl }] : undefined,
          urlS3: comprobanteUrl || undefined // Nueva URL de S3 para eliminación de archivo anterior
        };
        
        const response = await fetch('/api/caja-menor', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Error al actualizar el registro');
        }
        
        alert('✅ Registro actualizado exitosamente');
        setShowModal(false);
        setEditingItemId(null);
        setEditingItemType(null);
        setFormData({
          fecha: new Date().toISOString().split('T')[0],
          beneficiario: '',
          nitCC: '',
          concepto: '',
          centroCosto: '',
          centroCostoOtro: '',
          valor: '',
          realizaRegistro: userData?.nombre || 'Usuario',
          comprobanteFile: null
        });
        setSearchBeneficiario('');
        setShowBeneficiarioDropdown(false);
        setEsNuevoBeneficiario(false);
        await cargarDatos();
        setLoading(false);
        return;
      }
      
      console.log('📝 Enviando item de caja menor:', formData);
      
      // Determinar el valor final del centro de costo
      const centroCostoFinal = formData.centroCosto === 'Otro' ? formData.centroCostoOtro : formData.centroCosto;
      
      let comprobanteUrl = '';

      // Subir archivo si existe
      if (formData.comprobanteFile) {
        console.log('📤 Subiendo comprobante...');

        // Generar carpeta basada en el mes y año actual
        const fechaActual = new Date();
        const mes = fechaActual.toLocaleString('es-CO', { month: 'long' }).toLowerCase();
        const año = fechaActual.getFullYear();
        const carpetaCajaMenor = `${mes}_${año}`;

        const formDataUpload = new FormData();

        // Si es un Blob generado por el scanner, crear un File con nombre
        if (formData.comprobanteFile instanceof Blob && !(formData.comprobanteFile instanceof File)) {
          const fileName = formData.comprobanteFileName || `comprobante-${Date.now()}.pdf`;
          const file = new File([formData.comprobanteFile], fileName, { type: 'application/pdf' });
          formDataUpload.append('file', file);
        } else {
          formDataUpload.append('file', formData.comprobanteFile);
        }

        formDataUpload.append('carpetaCajaMenor', carpetaCajaMenor);
        formDataUpload.append('beneficiario', formData.beneficiario);

        const uploadResponse = await fetch('/api/upload-comprobante-caja-menor', {
          method: 'POST',
          body: formDataUpload,
        });

        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok) {
          throw new Error(uploadResult.error || 'Error al subir el comprobante');
        }

        comprobanteUrl = uploadResult.fileUrl;
        console.log('✅ Comprobante subido:', comprobanteUrl);
      }
      
      // Crear el item y vincularlo automáticamente a la primera caja menor activa
      const nuevoItem = {
        fecha: formData.fecha,
        beneficiario: formData.beneficiario,
        nitCC: formData.nitCC,
        concepto: formData.concepto,
        centroCosto: centroCostoFinal,
        valor: parseFloat(formData.valor) || 0,
        realizaRegistro: formData.realizaRegistro,
        cajaMenorId: cajaActiva?.id || '', // Vincular con la primera caja menor activa
        comprobanteUrl: comprobanteUrl || undefined
      };

      const response = await fetch('/api/caja-menor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'item',
          data: nuevoItem
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear el item');
      }

      console.log('✅ Item creado exitosamente:', result);

      // Recargar datos
      await cargarDatos();
      setShowModal(false);
      resetForm();
      alert('✅ Item registrado exitosamente y vinculado a la caja menor del mes.');
      
    } catch (error) {
      console.error('❌ Error al enviar:', error);
      alert('Error al guardar el item: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      fecha: new Date().toISOString().split('T')[0],
      beneficiario: '',
      nitCC: '',
      concepto: '',
      centroCosto: '',
      centroCostoOtro: '',
      valor: '',
      realizaRegistro: userData?.nombre || 'Usuario',
      comprobanteFile: null
    });
    setEditingItem(null);
    setEsNuevoBeneficiario(false);
    setAudioBlob(null);
    setSearchBeneficiario('');
    setShowBeneficiarioDropdown(false);
    // Limpiar datos guardados cuando se resetea el formulario
    clearFormDataFromStorage();
  };

  // Evitar procesamiento durante la carga
  if (loading) {
    return (
      <div 
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat relative flex items-center justify-center"
        style={{
          backgroundImage: 'url(/18032025-DSC_2933.jpg)'
        }}
      >
        <div className="absolute inset-0 bg-slate-900/20"></div>
        <div className="relative z-10">
          <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-8 border border-white/30 shadow-2xl">
            <div className="flex items-center justify-center space-x-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              <span className="text-white text-lg font-semibold">Cargando datos de Caja Menor...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar error si existe
  if (error) {
    return (
      <div 
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat relative flex items-center justify-center"
        style={{
          backgroundImage: 'url(/18032025-DSC_2933.jpg)'
        }}
      >
        <div className="absolute inset-0 bg-slate-900/20"></div>
        <div className="relative z-10">
          <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-8 border border-white/30 shadow-2xl max-w-md mx-4">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <div className="text-red-400 text-xl font-bold mb-4">❌ Error</div>
              <p className="text-red-300 mb-6">{error}</p>
              <button
                onClick={cargarDatos}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-semibold shadow-lg"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Combinar datos para mostrar en la tabla
  type ItemUnificado = {
    id: string;
    fecha: string;
    concepto: string;
    valor: number;
    beneficiario: string;
    tipo: 'anticipo' | 'gasto';
    estado: string;
    categoria: string;
    responsable: string;
    centroCosto?: string;
    comprobante?: AirtableAttachment[];
    cajaMenorId?: string[]; // Para filtrar items de la caja menor
  };

  const todosLosItems: ItemUnificado[] = [
    // Filtrar y mapear registros de Caja Menor (solo los que tienen datos válidos)
    ...cajaMenorRecords
      .filter(record => 
        record && 
        record.id && 
        record.fechaAnticipo && 
        record.concepto && 
        record.beneficiario &&
        record.valor !== null &&
        record.valor !== undefined
      )
      .map(record => ({
        id: record.id,
        fecha: record.fechaAnticipo,
        concepto: record.concepto,
        valor: Number(record.valor) || 0,
        beneficiario: record.beneficiario,
        tipo: 'anticipo' as const,
        estado: 'aprobado',
        categoria: 'Anticipo',
        responsable: record.realizaRegistro || record.beneficiario || 'Sistema',
        comprobante: record.documentoConsolidacion
      })),
    // Filtrar y mapear registros de Items (solo los que tienen datos válidos)
    ...itemsRecords
      .filter(item => 
        item && 
        item.id && 
        item.fecha && 
        item.concepto && 
        item.beneficiario &&
        item.valor !== null &&
        item.valor !== undefined
      )
      .map(item => ({
        id: item.id,
        fecha: item.fecha,
        concepto: item.concepto,
        valor: Number(item.valor) || 0,
        beneficiario: item.beneficiario,
        tipo: 'gasto' as const,
        estado: 'aprobado',
        categoria: 'Gasto',
        responsable: item.beneficiario || 'Sistema',
        centroCosto: item.centroCosto,
        comprobante: item.comprobante,
        cajaMenorId: item.cajaMenor
      }))
  ];

  const itemsFiltrados = todosLosItems.filter(item => {
    // Validar que el item existe y tiene las propiedades necesarias
    if (!item || typeof item !== 'object') return false;

    // Si no hay caja menor seleccionada, no mostrar ningún registro
    if (!cajaMenorActual) return false;

    // Solo mostrar registros de la caja menor seleccionada
    if (item.tipo === 'anticipo' && item.id !== cajaMenorActual.id) return false;
    if (item.tipo === 'gasto' && !item.cajaMenorId?.includes(cajaMenorActual.id)) return false;

    const searchText = busqueda.toLowerCase();
    const matchBusqueda = (item.concepto || '').toLowerCase().includes(searchText) ||
                         (item.beneficiario || '').toLowerCase().includes(searchText) ||
                         (item.categoria || '').toLowerCase().includes(searchText);

    const matchTipo = filtroTipo === 'todos' ||
                     (filtroTipo === 'ingreso' && item.tipo === 'anticipo') ||
                     (filtroTipo === 'egreso' && item.tipo === 'gasto');

    const matchEstado = filtroEstado === 'todos' || item.estado === filtroEstado;

    return matchBusqueda && matchTipo && matchEstado;
  });

  // Calcular totales de la caja menor seleccionada
  const totalIngresos = cajaMenorActual?.valor || 0;

  // Calcular egresos de la caja menor seleccionada
  const totalEgresos = cajaMenorActual
    ? itemsRecords
        .filter(item => item.cajaMenor?.includes(cajaMenorActual.id))
        .reduce((sum, item) => sum + (item.valor || 0), 0)
    : 0;

  const saldoActual = totalIngresos - totalEgresos;

  // Debug: Log de estado actual
  console.log('📊 Estado Dashboard Caja Menor:', {
    cajaMenorActual: cajaMenorActual ? `${cajaMenorActual.beneficiario} - ${formatearFecha(cajaMenorActual.fechaAnticipo)}` : 'ninguna',
    estaConsolidada,
    totalIngresos,
    totalEgresos,
    saldoActual,
    itemsFiltrados: itemsFiltrados.length
  });

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat relative"
      style={{
        backgroundImage: 'url(/18032025-DSC_2933.jpg)'
      }}
    >
      <div className="absolute inset-0 bg-slate-900/20 min-h-screen"></div>
      <div className="relative z-10 pt-24">
        <div className="max-w-full mx-auto px-6 py-8">
          
          {/* Header Profesional */}
          <div className="mb-6 md:mb-8">
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl shadow-2xl px-4 md:px-8 py-4 md:py-6 border border-white/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-4">
                <div className="p-3 bg-green-500/20 rounded-xl border border-green-500/30 flex-shrink-0">
                  <DollarSign className="w-8 h-8 md:w-10 md:h-10 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl md:text-4xl font-bold text-white leading-tight">
                    Caja Menor
                  </h1>
                  <p className="text-white/90 mt-1 text-sm md:text-lg leading-relaxed">
                    Gestión integral de fondos menores - Control mensual con trazabilidad completa
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-green-500/20 px-3 md:px-4 py-2 rounded-full border border-green-500/30 flex-shrink-0">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-green-300 font-semibold text-xs md:text-sm">Sistema Activo</span>
                </div>
                <button
                  onClick={() => setShowAgentModal(true)}
                  className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 px-3 md:px-4 py-2 rounded-full border border-blue-500/30 transition-colors flex-shrink-0"
                  title="Consultar con Asistente IA"
                >
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span className="text-blue-300 font-semibold text-xs md:text-sm">🤖 Asistente IA</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tarjetas de resumen - Diseño Profesional */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-6 mb-6 md:mb-8">
            {/* Tarjeta 1: Disponible Caja Menor */}
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-6 border border-white/30 shadow-xl hover:shadow-2xl transition-all duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-green-500/20 rounded-xl border border-green-500/30">
                  <DollarSign className="w-7 h-7 text-green-400" />
                </div>
                {ultimaCajaMenor && (
                  <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full border border-green-500/30">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-xs font-bold text-green-300">Activa</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-white/70 mb-2">
                  {cajasMenoresActivas.length > 0 ? 'Total Cajas Menores Activas' : 'Sin Cajas Menores'}
                </p>
                <p className="text-3xl font-bold text-green-400 mb-2">
                  ${totalIngresos.toLocaleString('es-CO')}
                </p>
                {cajasMenoresActivas.length > 0 ? (
                  <p className="text-xs text-white/60 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {cajasMenoresActivas.length} caja{cajasMenoresActivas.length > 1 ? 's' : ''} activa{cajasMenoresActivas.length > 1 ? 's' : ''}
                  </p>
                ) : (
                  <p className="text-xs text-white/60 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    No registrada
                  </p>
                )}
              </div>
            </div>

            {/* Tarjeta 2: Total Egresos */}
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-6 border border-white/30 shadow-xl hover:shadow-2xl transition-all duration-300">
              <div className="flex items-start justify-between mb-3 md:mb-4">
                <div className="p-2 md:p-3 bg-red-500/20 rounded-xl border border-red-500/30">
                  <DollarSign className="w-5 h-5 md:w-7 md:h-7 text-red-400" />
                </div>
              </div>
              <div>
                <p className="text-xs md:text-sm font-semibold text-white/70 mb-1 md:mb-2">Total Egresos</p>
                <p className="text-2xl md:text-3xl font-bold text-red-400 mb-1 md:mb-2">
                  ${totalEgresos.toLocaleString('es-CO')}
                </p>
                <p className="text-xs text-white/60 flex items-center gap-1">
                  <Receipt className="w-3 h-3" />
                  Gastos registrados
                </p>
              </div>
            </div>

            {/* Tarjeta 3: Saldo Actual */}
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-6 border border-white/30 shadow-xl hover:shadow-2xl transition-all duration-300">
              <div className="flex items-start justify-between mb-3 md:mb-4">
                <div className={`p-2 md:p-3 ${saldoActual >= 0 ? 'bg-blue-500/20 border-blue-500/30' : 'bg-orange-500/20 border-orange-500/30'} rounded-xl border`}>
                  <DollarSign className={`w-5 h-5 md:w-7 md:h-7 ${saldoActual >= 0 ? 'text-blue-400' : 'text-orange-400'}`} />
                </div>
                {saldoActual < 0 && (
                  <div className="flex items-center gap-1 bg-orange-500/20 px-2 py-1 rounded-full border border-orange-500/30">
                    <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                    <span className="text-xs font-bold text-orange-300">Déficit</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs md:text-sm font-semibold text-white/70 mb-1 md:mb-2">Saldo Actual</p>
                <p className={`text-2xl md:text-3xl font-bold mb-1 md:mb-2 ${saldoActual >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                  ${Math.abs(saldoActual).toLocaleString('es-CO')}
                </p>
                <p className="text-xs text-white/60">
                  {saldoActual >= 0 ? '✅ Disponible' : '⚠️ En déficit'}
                </p>
              </div>
            </div>

            {/* Tarjeta 4: Total Registros */}
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-6 border border-white/30 shadow-xl hover:shadow-2xl transition-all duration-300">
              <div className="flex items-start justify-between mb-3 md:mb-4">
                <div className="p-2 md:p-3 bg-purple-500/20 rounded-xl border border-purple-500/30">
                  <Receipt className="w-5 h-5 md:w-7 md:h-7 text-purple-400" />
                </div>
              </div>
              <div>
                <p className="text-xs md:text-sm font-semibold text-white/70 mb-1 md:mb-2">Total Registros</p>
                <p className="text-2xl md:text-3xl font-bold text-purple-400 mb-1 md:mb-2">
                  {itemsFiltrados.length}
                </p>
                <p className="text-xs text-white/60 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Movimientos activos
                </p>
              </div>
            </div>

            {/* Tarjeta 5: Porcentaje Consumido */}
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-6 border border-white/30 shadow-xl hover:shadow-2xl transition-all duration-300 col-span-2 md:col-span-1">
              <div className="flex items-start justify-between mb-3 md:mb-4">
                <div className={`p-2 md:p-3 rounded-xl border ${
                  totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 70
                    ? 'bg-orange-500/20 border-orange-500/30'
                    : 'bg-cyan-500/20 border-cyan-500/30'
                }`}>
                  <FileText className={`w-5 h-5 md:w-7 md:h-7 ${
                    totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 70
                      ? 'text-orange-400'
                      : 'text-cyan-400'
                  }`} />
                </div>
                {totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 70 && (
                  <div className="flex items-center gap-1 bg-orange-500/20 px-2 py-1 rounded-full border border-orange-500/30">
                    <AlertTriangle className="w-3 h-3 text-orange-400" />
                    <span className="text-xs font-bold text-orange-300">Alto</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs md:text-sm font-semibold text-white/70 mb-1 md:mb-2">Consumo Actual</p>
                <p className={`text-2xl md:text-3xl font-bold mb-1 md:mb-2 ${
                  totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 70
                    ? 'text-orange-400'
                    : 'text-cyan-400'
                }`}>
                  {totalIngresos > 0 ? ((totalEgresos / totalIngresos) * 100).toFixed(1) : '0'}%
                </p>
                <div className="w-full bg-slate-700/50 rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-500 ${
                      totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 70
                        ? 'bg-gradient-to-r from-orange-500 to-red-500'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                    }`}
                    style={{ width: `${totalIngresos > 0 ? Math.min((totalEgresos / totalIngresos) * 100, 100) : 0}%` }}
                  ></div>
                </div>
                <p className="text-xs text-white/60">
                  {totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 70 
                    ? '⚠️ Requiere consolidación' 
                    : '✓ Nivel normal'}
                </p>
              </div>
            </div>
          </div>

          {/* Alerta: Caja Menor Consolidada */}
          {ultimaCajaMenor && estaConsolidada && (
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-5 border border-green-500/50 mb-6 md:mb-8 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                <div className="p-2 md:p-3 bg-green-500/20 rounded-xl border border-green-500/30 flex-shrink-0">
                  <CheckCircle className="w-5 h-5 md:w-7 md:h-7 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-bold text-green-300 mb-1">
                    ✅ Caja Menor Consolidada - {formatearMesAnio(ultimaCajaMenor.fechaAnticipo)}
                  </h3>
                  <p className="text-sm text-white/80 leading-relaxed">
                    Esta caja menor fue consolidada el {formatearFecha(ultimaCajaMenor.fechaConsolidacion || '')}. 
                    No se pueden agregar más gastos. Puede crear una nueva caja menor para el próximo periodo.
                  </p>
                </div>
                <button
                  onClick={() => setShowCajaMenorModal(true)}
                  className="px-4 py-2 md:px-5 md:py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-semibold shadow-lg whitespace-nowrap text-sm md:text-base"
                >
                  Nueva Caja Menor
                </button>
              </div>
            </div>
          )}

          {/* Alerta: No hay caja menor del mes actual */}
          {!ultimaCajaMenor && (
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-5 border border-yellow-500/50 mb-6 md:mb-8 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                <div className="p-2 md:p-3 bg-yellow-500/20 rounded-xl border border-yellow-500/30 flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 md:w-7 md:h-7 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-bold text-yellow-300 mb-1">
                    No hay Caja Menor registrada
                  </h3>
                  <p className="text-sm text-white/80 leading-relaxed">
                    Para registrar gastos, primero debe crear una caja menor especificando quién estará a cargo y el monto disponible.
                  </p>
                </div>
                <button
                  onClick={() => setShowCajaMenorModal(true)}
                  className="px-4 py-2 md:px-5 md:py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors font-semibold shadow-lg whitespace-nowrap text-sm md:text-base"
                >
                  Registrar Caja Menor
                </button>
              </div>
            </div>
          )}

          {/* Alerta: Valores anormalmente altos detectados */}
          {ultimaCajaMenor && itemsRecords.some(item => {
            return item.cajaMenor?.includes(ultimaCajaMenor.id) && item.valor > 100000000;
          }) && (
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-5 border border-red-500/50 mb-6 md:mb-8 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                <div className="p-2 md:p-3 bg-red-500/20 rounded-xl border border-red-500/30 flex-shrink-0">
                  <AlertCircle className="w-5 h-5 md:w-7 md:h-7 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base md:text-lg font-bold text-red-300 mb-1">
                    ⚠️ Datos Anormales Detectados
                  </h3>
                  <p className="text-sm text-white/80 leading-relaxed mb-2">
                    Se han detectado registros con valores excesivamente altos que pueden ser erróneos. Esto está afectando los cálculos del saldo y consumo. Por favor, revise los gastos registrados y contacte al administrador para corregir los datos.
                  </p>
                  <p className="text-xs text-red-300/80">
                    💡 Los registros con valores superiores a $100.000.000 pueden indicar errores de digitación.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Controles - Diseño Profesional */}
          <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-6 border border-white/30 shadow-xl mb-6 md:mb-8">
            <div className="flex flex-col lg:flex-row gap-4 md:gap-6 items-start lg:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 flex-1 w-full">
                {/* Búsqueda */}
                <div className="relative flex-1 max-w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-white/50" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por concepto, beneficiario..."
                    className="w-full pl-9 md:pl-10 pr-4 py-2 md:py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200 text-sm md:text-base"
                  />
                </div>

                {/* Filtros */}
                <div className="flex gap-2 md:gap-3">
                  <select
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                    className="px-3 md:px-4 py-2 md:py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200 min-w-[120px] md:min-w-[140px] text-sm md:text-base"
                  >
                    <option value="todos">Todos los tipos</option>
                    <option value="ingreso">Ingresos</option>
                    <option value="egreso">Egresos</option>
                  </select>

                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                    className="px-3 md:px-4 py-2 md:py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200 min-w-[120px] md:min-w-[140px] text-sm md:text-base"
                  >
                    <option value="todos">Todos los estados</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="aprobado">Aprobado</option>
                    <option value="rechazado">Rechazado</option>
                  </select>
                </div>
              </div>

              {/* Botones de acción - Solo visibles si hay cajas menores activas */}
              {cajasMenoresActivas.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 md:gap-3 w-full lg:w-auto">
                  <button
                    onClick={() => {
                      if (totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 100) {
                        alert('❌ Cajas menores al 100% de consumo\n\nNo se pueden registrar más gastos.');
                      } else {
                        setShowModal(true);
                      }
                    }}
                    disabled={totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 100}
                    className="flex items-center justify-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200 font-semibold shadow-lg hover:shadow-blue-500/25 disabled:hover:shadow-none text-sm md:text-base"
                    title={
                      totalIngresos > 0 && (totalEgresos / totalIngresos) * 100 >= 100
                        ? 'Cajas menores al 100% de consumo - No se pueden registrar más gastos'
                        : hasSavedData 
                          ? 'Registrar nuevo gasto (hay datos guardados que se cargarán automáticamente)'
                          : 'Registrar nuevo gasto'
                    }
                  >
                    <Plus className="w-4 h-4 md:w-5 md:h-5" />
                    <span>Nuevo Gasto</span>
                    {hasSavedData && (
                      <div className="ml-2 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" title="Hay datos guardados en el formulario"></div>
                    )}
                  </button>
                  
                  {/* Botón para limpiar datos guardados */}
                  {hasSavedData && (
                    <button
                      onClick={() => {
                        if (confirm('¿Deseas eliminar los datos guardados del formulario? Esta acción no se puede deshacer.')) {
                          clearFormDataFromStorage();
                          setHasSavedData(false);
                        }
                      }}
                      className="flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl transition-all duration-200 font-semibold shadow-lg text-sm md:text-base"
                      title="Limpiar datos guardados del formulario"
                    >
                      <span className="text-lg">🗑️</span>
                      <span className="hidden sm:inline">Limpiar</span>
                    </button>
                  )}
                  
                  {/* Botón Consolidar Caja Menor - Siempre visible */}
                  {(() => {
                    const porcentajeConsumo = totalIngresos > 0 ? (totalEgresos / totalIngresos) * 100 : 0;
                    const esBotonOriginal = porcentajeConsumo >= 70;
                    const esFinMes = esFinDeMes();
                    
                    // Botón siempre visible si hay ingresos
                    if (totalIngresos <= 0) return null;
                    
                    return (
                      <button
                        onClick={() => setShowConsolidarModal(true)}
                        className={`flex items-center justify-center gap-2 px-4 md:px-6 py-2 md:py-3 rounded-xl transition-all duration-200 font-semibold shadow-lg text-sm md:text-base ${
                          esBotonOriginal 
                            ? 'bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 hover:shadow-orange-500/25 animate-pulse' 
                            : esFinMes
                              ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 hover:shadow-blue-500/25'
                              : 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 hover:shadow-gray-500/25'
                        } text-white`}
                        title={
                          esBotonOriginal 
                            ? "Consolidar caja menor - Consumo mayor al 70%" 
                            : esFinMes 
                              ? "Consolidar caja menor - Fin de Mes"
                              : "Consolidar caja menor - Disponible siempre"
                        }
                      >
                        {esBotonOriginal ? (
                          <AlertTriangle className="w-4 h-4 md:w-5 md:h-5" />
                        ) : (
                          <Clock className="w-4 h-4 md:w-5 md:h-5" />
                        )}
                        <span>Consolidar Caja Menor</span>
                      </button>
                    );
                  })()}
                </div>
              )}
              
              {/* Botón Historial - Visible para todos los usuarios */}
              {cajaMenorRecords.length > 0 && (
                <button
                  onClick={() => setShowHistoricoModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 md:py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-xl transition-all duration-200 font-semibold shadow-lg text-sm md:text-base border border-white/20"
                  title="Ver cajas menores anteriores"
                >
                  <Clock className="w-4 h-4" />
                  <span>Historial</span>
                </button>
              )}

              {/* Botón Nueva Caja Menor - Solo visible si NO hay cajas activas */}
              {cajasMenoresActivas.length === 0 && (
                <div className="flex flex-col sm:flex-row gap-2 md:gap-3 w-full lg:w-auto">
                  <button
                    onClick={handleNuevaCajaMenor}
                    className={`flex items-center justify-center gap-2 px-4 md:px-6 py-2 md:py-3 rounded-xl transition-all duration-200 font-semibold shadow-lg text-sm md:text-base ${buttonState.className}`}
                    title={buttonState.title}
                  >
                    {buttonState.icon === 'CheckCircle' ? (
                      <CheckCircle className="w-4 h-4 md:w-5 md:h-5" />
                    ) : (
                      <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
                    )}
                    <span>{buttonState.text}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tabla - Diseño Profesional */}
          <div className="bg-slate-800/40 backdrop-blur-md rounded-xl border border-white/30 overflow-hidden shadow-xl mb-6 md:mb-8">
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
              {loading ? (
                <div className="flex items-center justify-center p-8 md:p-16">
                  <div className="animate-spin rounded-full h-8 w-8 md:h-12 md:w-12 border-b-2 border-blue-400"></div>
                  <span className="ml-3 md:ml-4 text-white font-semibold text-sm md:text-base">Cargando datos...</span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center p-8 md:p-16 text-center">
                  <AlertCircle className="w-12 h-12 md:w-16 md:h-16 text-red-400 mb-4 md:mb-6" />
                  <p className="text-red-400 font-bold mb-2 md:mb-3 text-base md:text-lg">Error al cargar datos</p>
                  <p className="text-white/70 mb-4 md:mb-6 max-w-md text-sm md:text-base">{error}</p>
                  <button
                    onClick={cargarDatos}
                    className="px-4 md:px-6 py-2 md:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all duration-200 font-semibold shadow-lg text-sm md:text-base"
                  >
                    Reintentar
                  </button>
                </div>
              ) : itemsFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 md:p-16 text-center">
                  <Receipt className="w-12 h-12 md:w-16 md:h-16 text-white/40 mb-4 md:mb-6" />
                  <p className="text-white/70 text-base md:text-lg font-semibold">No se encontraron registros</p>
                  <p className="text-white/50 text-sm mt-2">Intenta ajustar los filtros o crear un nuevo registro</p>
                </div>
              ) : (
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-white/20 bg-slate-700/60">
                      <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-bold text-white uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                        Concepto
                      </th>
                      <th className="px-3 md:px-6 py-3 md:py-4 text-right text-xs font-bold text-white uppercase tracking-wider">
                        Monto
                      </th>
                      <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-bold text-white uppercase tracking-wider hidden sm:table-cell">
                        Tipo
                      </th>
                      <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-bold text-white uppercase tracking-wider hidden md:table-cell">
                        Categoría
                      </th>
                      <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs font-bold text-white uppercase tracking-wider hidden lg:table-cell">
                        Beneficiario
                      </th>
                      <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-bold text-white uppercase tracking-wider hidden xl:table-cell">
                        Centro de Costo
                      </th>
                      <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-bold text-white uppercase tracking-wider">
                        Comprobante
                      </th>
                      {canEditDelete && (
                        <th className="px-3 md:px-6 py-3 md:py-4 text-center text-xs font-bold text-white uppercase tracking-wider">
                          Acciones
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {itemsFiltrados.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-700/40 transition-all duration-200 group">
                        <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-center">
                          <span className="text-xs md:text-sm text-white font-medium">
                            {index + 0}
                          </span>
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 md:gap-3">
                            <Calendar className="w-3 h-3 md:w-4 md:h-4 text-blue-400 group-hover:text-blue-300 flex-shrink-0" />
                            <span className="text-xs md:text-sm text-white font-medium">
                              {formatearFecha(item.fecha)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4">
                          <div className="text-xs md:text-sm text-white font-medium truncate max-w-[120px] md:max-w-xs">
                            {item.concepto || 'Sin concepto'}
                          </div>
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-right">
                          <span className={`text-xs md:text-sm font-bold ${
                            item.tipo === 'anticipo' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {item.tipo === 'anticipo' ? '+' : '-'}${(Number(item.valor) || 0).toLocaleString('es-CO')}
                          </span>
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-center hidden sm:table-cell">
                          <span className={`inline-flex items-center px-2 md:px-3 py-1 rounded-full text-xs font-semibold ${
                            item.tipo === 'anticipo' 
                              ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                              : 'bg-red-500/20 text-red-300 border border-red-500/30'
                          }`}>
                            {item.tipo === 'anticipo' ? '💰 Caja Menor' : '🛒 Gasto'}
                          </span>
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap hidden md:table-cell">
                          <span className="text-xs md:text-sm text-white/90 font-medium">{item.categoria}</span>
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap hidden lg:table-cell">
                          <div className="flex items-center gap-2 md:gap-3">
                            <User className="w-3 h-3 md:w-4 md:h-4 text-purple-400 group-hover:text-purple-300 flex-shrink-0" />
                            <span className="text-xs md:text-sm text-white font-medium">{item.responsable}</span>
                          </div>
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-center hidden xl:table-cell">
                          {item.centroCosto ? (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                              item.centroCosto === 'Pirólisis' 
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' 
                                : item.centroCosto === 'Administrativo'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : item.centroCosto === 'Laboratorio'
                                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}>
                              {item.centroCosto === 'Pirólisis' 
                                ? '🔥' 
                                : item.centroCosto === 'Administrativo'
                                ? '📋'
                                : item.centroCosto === 'Laboratorio'
                                ? '🧪'
                                : '🏢'} {item.centroCosto}
                            </span>
                          ) : (
                            <span className="text-white/40 text-xs italic">-</span>
                          )}
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-center">
                          {(() => {
                            const comprobante = item.comprobante;
                            if (comprobante && Array.isArray(comprobante) && comprobante.length > 0) {
                              return (
                                <div className="flex flex-wrap justify-center gap-1">
                                  {comprobante.slice(0, 3).map((archivo: AirtableAttachment, idx: number) => (
                                    <div key={idx} className="relative">
                                      {archivo.type?.includes('image') && archivo.thumbnails?.small ? (
                                        <img
                                          src={archivo.thumbnails.small.url}
                                          alt={archivo.filename}
                                          className="w-8 h-8 rounded cursor-pointer border border-white/20 hover:border-white/40 transition-all"
                                          onClick={() => window.open(archivo.url, '_blank')}
                                          title={`Ver ${archivo.filename}`}
                                        />
                                      ) : (
                                        <a
                                          href={archivo.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center justify-center w-8 h-8 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded border border-blue-500/30 transition-all"
                                          title={`Descargar ${archivo.filename || 'comprobante'}`}
                                        >
                                          {archivo.type?.includes('pdf') ? '📄' : '📎'}
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                  {comprobante.length > 3 && (
                                    <span className="text-xs text-white/60">+{comprobante.length - 3}</span>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <span className="text-white/40 text-xs italic">Sin comprobante</span>
                            );
                          })()}
                        </td>
                        {canEditDelete && (
                          <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEditItem(item.id, item.tipo === 'anticipo' ? 'cajaMenor' : 'item')}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs font-semibold transition-colors border border-blue-500/30"
                                title="Editar registro"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id, item.tipo === 'anticipo' ? 'cajaMenor' : 'item')}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs font-semibold transition-colors border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Eliminar registro"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        {/* Modal de nueva caja menor - Diseño Profesional */}
        {showCajaMenorModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <div className="bg-slate-800/95 backdrop-blur-md rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/30 shadow-2xl mt-16">
              <div className="sticky top-0 bg-slate-800/98 backdrop-blur-md px-6 py-4 border-b border-white/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/20 rounded-xl border border-green-500/30">
                    <DollarSign className="w-6 h-6 text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {editingItemId && editingItemType === 'cajaMenor' ? 'Editar Caja Menor' : 'Nueva Caja Menor'}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowCajaMenorModal(false);
                    setEditingItemId(null);
                    setEditingItemType(null);
                  }}
                  className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors border border-white/20"
                >
                  <span className="w-5 h-5 text-white/80">✕</span>
                </button>
              </div>

              {/* Advertencia Importante */}
              <div className="mx-6 mt-4 p-4 bg-amber-600/20 border border-amber-500/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-amber-400 font-bold text-sm mb-1">
                      ⚠️ IMPORTANTE - Control de Cajas Menores
                    </h4>
                    <p className="text-amber-200/90 text-xs leading-relaxed">
                      • Una vez registrada la caja menor, <strong>NO se puede modificar</strong><br/>
                      • Debe consolidar las cajas activas antes de crear una nueva<br/>
                      • Asegúrate de que todos los datos sean correctos antes de guardar
                    </p>
                  </div>
                </div>
              </div>

              {/* Botón cargar predefinido */}
              <div className="px-6 pt-4 pb-2">
                <button
                  type="button"
                  onClick={cargarDatosPredefinidos}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-semibold border border-purple-500"
                >
                  <User className="w-4 h-4" />
                  Cargar Datos Predefinidos (Joys Moreno - $2.000.000)
                </button>
                <p className="text-xs text-white/50 mt-1 text-center">
                  Completa automáticamente los campos con valores estándar
                </p>
              </div>

              <form onSubmit={handleSubmitCajaMenor} className="p-6 pt-3 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Responsable de la Caja Menor *
                  </label>
                  <input
                    type="text"
                    value={formCajaMenor.beneficiario}
                    onChange={(e) => setFormCajaMenor({...formCajaMenor, beneficiario: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-700/30 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                    placeholder="Nombre del responsable"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    NIT-CC
                  </label>
                  <input
                    type="text"
                    value={formCajaMenor.nitCC}
                    onChange={(e) => setFormCajaMenor({...formCajaMenor, nitCC: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-700/30 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                    placeholder="Número de identificación"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Registrado por
                  </label>
                  <div className="w-full px-4 py-2.5 bg-slate-700/50 border border-white/10 rounded-lg text-white/80 text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-400" />
                    {formCajaMenor.realizaRegistro}
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Este campo se completa automáticamente con tu usuario
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Concepto *
                  </label>
                  <input
                    type="text"
                    value={formCajaMenor.concepto}
                    onChange={(e) => setFormCajaMenor({...formCajaMenor, concepto: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-700/30 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                    placeholder="Ej: Caja menor mes de noviembre 2024"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    Valor Disponible *
                  </label>
                  <input
                    type="text"
                    value={formCajaMenor.valor ? formCajaMenor.valor.toLocaleString('es-CO') : ''}
                    onChange={(e) => {
                      const valor = e.target.value.replace(/\D/g, '');
                      setFormCajaMenor({...formCajaMenor, valor: parseInt(valor) || 0});
                    }}
                    className="w-full px-4 py-2.5 bg-slate-700/30 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                    placeholder="Monto disponible para gastos"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors font-semibold shadow-lg"
                  >
                    {loading ? (editingItemId && editingItemType === 'cajaMenor' ? 'Actualizando...' : 'Creando...') : (editingItemId && editingItemType === 'cajaMenor' ? 'Actualizar Caja Menor' : 'Crear Caja Menor')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCajaMenorModal(false);
                      setEditingItemId(null);
                      setEditingItemType(null);
                    }}
                    className="px-4 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de nuevo/editar registro - Diseño Profesional */}
        {showModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-4 z-[9999] mt-24">
            <div className="bg-slate-800/95 backdrop-blur-md rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-white/30 shadow-2xl">
              <div className="sticky top-0 bg-slate-800/98 backdrop-blur-md px-4 md:px-8 py-4 md:py-6 border-b border-white/20 flex items-center justify-between">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="p-1.5 md:p-2 bg-blue-500/20 rounded-xl border border-blue-500/30">
                    <Plus className="w-4 h-4 md:w-6 md:h-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg md:text-2xl font-bold text-white">
                    {editingItemId ? 'Editar Registro de Caja Menor' : 'Nuevo Registro de Caja Menor'}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingItemId(null);
                    setEditingItemType(null);
                    setFormData({
                      fecha: new Date().toISOString().split('T')[0],
                      beneficiario: '',
                      nitCC: '',
                      concepto: '',
                      centroCosto: '',
                      centroCostoOtro: '',
                      valor: '',
                      realizaRegistro: userData?.nombre || 'Usuario',
                      comprobanteFile: null
                    });
                    setSearchBeneficiario('');
                    setShowBeneficiarioDropdown(false);
                    setEsNuevoBeneficiario(false);
                  }}
                  className="p-2 md:p-3 hover:bg-slate-700/50 rounded-xl transition-all duration-200 border border-white/20 hover:border-white/40"
                >
                  <span className="w-4 h-4 md:w-5 md:h-5 text-white/80">✕</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-white mb-2 md:mb-3 flex items-center gap-2">
                      <Calendar className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
                      Fecha *
                    </label>
                    <input
                      type="date"
                      value={formData.fecha}
                      onChange={(e) => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
                      className="w-full px-3 md:px-4 py-2 md:py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200 text-sm md:text-base"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-white mb-2 md:mb-3 flex items-center gap-2">
                      <DollarSign className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
                      Valor *
                    </label>
                    <input
                      type="text"
                      value={formData.valor ? parseInt(formData.valor).toLocaleString('es-CO') : ''}
                      onChange={(e) => {
                        const valor = e.target.value.replace(/\D/g, '');
                        setFormData(prev => ({ ...prev, valor: valor }));
                      }}
                      placeholder="0"
                      className="w-full px-3 md:px-4 py-2 md:py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200 text-sm md:text-base"
                      required
                    />
                    {ultimaCajaMenor && formData.valor && (() => {
                      const valorIngresado = parseFloat(formData.valor) || 0;
                      const totalIngresosCaja = ultimaCajaMenor.valor || 0;
                      const totalEgresosCaja = itemsRecords
                        .filter(item => item.cajaMenor?.includes(ultimaCajaMenor.id))
                        .reduce((sum, item) => sum + (item.valor || 0), 0);
                      const saldoDisponible = totalIngresosCaja - totalEgresosCaja;
                      const excedente = valorIngresado - saldoDisponible;
                      
                      if (valorIngresado > saldoDisponible) {
                        return (
                          <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                              <div className="text-xs text-red-300">
                                <p className="font-bold">⚠️ Valor supera el saldo disponible</p>
                                <p className="mt-1">Saldo disponible: <strong>${saldoDisponible.toLocaleString('es-CO')}</strong></p>
                                <p>Excedente: <strong>${excedente.toLocaleString('es-CO')}</strong></p>
                              </div>
                            </div>
                          </div>
                        );
                      } else if (valorIngresado > saldoDisponible * 0.7) {
                        return (
                          <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                              <div className="text-xs text-yellow-300">
                                <p className="font-bold">⚠️ Alto consumo del saldo</p>
                                <p className="mt-1">Saldo restante: <strong>${(saldoDisponible - valorIngresado).toLocaleString('es-CO')}</strong></p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="relative">
                    <label className="block text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-400" />
                      Beneficiario *
                    </label>

                    {/* Dropdown con búsqueda */}
                    <div className="relative">
                      <div className="relative">
                        <input
                          type="text"
                          value={esNuevoBeneficiario ? formData.beneficiario : searchBeneficiario}
                          onChange={(e) => {
                            if (esNuevoBeneficiario) {
                              setFormData(prev => ({ ...prev, beneficiario: e.target.value }));
                            } else {
                              setSearchBeneficiario(e.target.value);
                              setShowBeneficiarioDropdown(true);
                            }
                          }}
                          onFocus={() => !esNuevoBeneficiario && setShowBeneficiarioDropdown(true)}
                          placeholder={esNuevoBeneficiario ? "✏️ Nombre del nuevo beneficiario" : "🔍 Buscar beneficiario..."}
                          className="w-full px-4 py-3 pr-10 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200"
                          required
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none" />
                      </div>

                      {/* Dropdown con opciones filtradas */}
                      {showBeneficiarioDropdown && !esNuevoBeneficiario && (
                        <>
                          {/* Overlay para cerrar al hacer click fuera */}
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowBeneficiarioDropdown(false)}
                          />

                          <div className="absolute z-20 w-full mt-2 bg-slate-800/95 backdrop-blur-sm border border-white/20 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                            {(() => {
                              const beneficiariosFiltrados = beneficiarios.filter(b =>
                                b.nombre.toLowerCase().includes(searchBeneficiario.toLowerCase())
                              );

                              return (
                                <>
                                  {beneficiariosFiltrados.length > 0 ? (
                                    beneficiariosFiltrados.map((beneficiario, index) => (
                                      <button
                                        key={index}
                                        type="button"
                                        onClick={() => {
                                          setFormData(prev => ({
                                            ...prev,
                                            beneficiario: beneficiario.nombre,
                                            nitCC: beneficiario.nitCC
                                          }));
                                          setSearchBeneficiario(beneficiario.nombre);
                                          setShowBeneficiarioDropdown(false);
                                        }}
                                        className="w-full px-4 py-3 text-left hover:bg-blue-600/20 transition-colors flex items-center gap-2 text-white border-b border-white/10 last:border-0"
                                      >
                                        <User className="w-4 h-4 text-blue-400" />
                                        <span>{beneficiario.nombre}</span>
                                        {beneficiario.nitCC && (
                                          <span className="ml-auto text-xs text-white/50">{beneficiario.nitCC}</span>
                                        )}
                                      </button>
                                    ))
                                  ) : (
                                    <div className="px-4 py-3 text-white/50 text-sm">
                                      No se encontraron beneficiarios
                                    </div>
                                  )}

                                  {/* Opción de nuevo beneficiario */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEsNuevoBeneficiario(true);
                                      setFormData(prev => ({ ...prev, beneficiario: '', nitCC: '' }));
                                      setSearchBeneficiario('');
                                      setShowBeneficiarioDropdown(false);
                                    }}
                                    className="w-full px-4 py-3 text-left hover:bg-green-600/20 transition-colors flex items-center gap-2 text-green-400 font-semibold border-t-2 border-green-400/30"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Nuevo Beneficiario</span>
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </>
                      )}

                      {/* Indicador de beneficiario seleccionado */}
                      {!esNuevoBeneficiario && formData.beneficiario && (
                        <div className="mt-2 px-3 py-2 bg-blue-600/20 border border-blue-400/30 rounded-lg flex items-center justify-between">
                          <span className="text-sm text-white flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            Seleccionado: <strong>{formData.beneficiario}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, beneficiario: '', nitCC: '' }));
                              setSearchBeneficiario('');
                            }}
                            className="text-xs text-red-400 hover:text-red-300 hover:underline"
                          >
                            Cambiar
                          </button>
                        </div>
                      )}

                      {/* Indicador de nuevo beneficiario */}
                      {esNuevoBeneficiario && (
                        <div className="mt-2 px-3 py-2 bg-green-600/20 border border-green-400/30 rounded-lg flex items-center justify-between">
                          <span className="text-sm text-green-400 flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            Nuevo beneficiario
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEsNuevoBeneficiario(false);
                              setFormData(prev => ({ ...prev, beneficiario: '', nitCC: '' }));
                            }}
                            className="text-xs text-red-400 hover:text-red-300 hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-blue-400" />
                      NIT / CC {esNuevoBeneficiario && '*'}
                    </label>
                    {esNuevoBeneficiario ? (
                      <input
                        type="text"
                        value={formData.nitCC}
                        onChange={(e) => setFormData(prev => ({ ...prev, nitCC: e.target.value }))}
                        placeholder="✏️ Número de identificación"
                        className="w-full px-4 py-3 bg-slate-700/60 border border-blue-400/40 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200"
                        required
                      />
                    ) : (
                      <div className="w-full px-4 py-3 bg-slate-700/50 border border-white/10 rounded-xl text-white/80 text-sm flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-blue-400" />
                        {formData.nitCC || 'No especificado'}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Concepto *
                  </label>
                  
                  <div className="relative">
                    <textarea
                      value={formData.concepto}
                      onChange={(e) => setFormData(prev => ({ ...prev, concepto: e.target.value }))}
                      placeholder="Descripción del gasto o use el botón de grabación para dictar..."
                      rows={4}
                      className="w-full px-4 py-3 pr-32 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200 resize-none"
                      required
                    />
                    
                    {/* Botones de grabación dentro del textarea */}
                    <div className="absolute top-3 right-3 flex gap-2">
                      {!isRecording ? (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-xs font-semibold shadow-lg"
                          title="Grabar audio"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          Grabar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-xs font-semibold shadow-lg animate-pulse"
                          title="Detener grabación"
                        >
                          <MicOff className="w-3.5 h-3.5" />
                          Detener
                        </button>
                      )}
                    </div>
                    
                    {/* Indicador de transcripción */}
                    {isTranscribing && (
                      <div className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 bg-yellow-600/90 border border-yellow-500/50 rounded-lg text-yellow-100 text-xs font-medium shadow-lg">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-100"></div>
                        Transcribiendo...
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Building className="w-4 h-4 text-blue-400" />
                    Centro de Costo
                  </label>
                  <div className="relative">
                    <select
                      value={formData.centroCosto}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, centroCosto: e.target.value, centroCostoOtro: '' }));
                      }}
                      className="w-full px-4 py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200 appearance-none cursor-pointer hover:bg-slate-700/80"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239CA3AF' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 0.75rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5rem 1.5rem',
                        paddingRight: '2.5rem'
                      }}
                    >
                      <option value="" className="bg-slate-800 text-white/70">Seleccionar departamento o área</option>
                      <option value="Pirólisis" className="bg-slate-800 text-white">🔥 Pirólisis</option>
                      <option value="Administrativo" className="bg-slate-800 text-white">📋 Administrativo</option>
                      <option value="Laboratorio" className="bg-slate-800 text-white">🧪 Laboratorio</option>
                      <option value="Otro" className="bg-slate-800 text-white">➕ Otro</option>
                    </select>
                  </div>
                  
                  {formData.centroCosto === 'Otro' && (
                    <div className="mt-3 animate-fadeIn">
                      <input
                        type="text"
                        value={formData.centroCostoOtro}
                        onChange={(e) => setFormData(prev => ({ ...prev, centroCostoOtro: e.target.value }))}
                        placeholder="✏️ Especificar otro centro de costo"
                        className="w-full px-4 py-3 bg-slate-700/60 border border-blue-400/40 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-200"
                        required
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    Comprobante (Opcional)
                  </label>
                  <p className="text-xs text-white/60 mb-2">
                    Puede escanear imágenes o cargar un archivo PDF directamente
                  </p>
                  <div className="p-4 bg-slate-700/30 border border-white/10 rounded-xl">
                    <ScannerComprobante
                      onPdfReady={(pdfBlob, fileName) => {
                        console.log('📄 Archivo listo:', fileName);
                        setFormData(prev => ({
                          ...prev,
                          comprobanteFile: pdfBlob,
                          comprobanteFileName: fileName
                        }));
                      }}
                      onClear={() => {
                        setFormData(prev => ({
                          ...prev,
                          comprobanteFile: null,
                          comprobanteFileName: undefined
                        }));
                      }}
                      maxImages={5}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-400" />
                    Registrado por
                  </label>
                  <div className="w-full px-4 py-3 bg-slate-700/50 border border-white/10 rounded-xl text-white/80 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    {formData.realizaRegistro}
                  </div>
                  <p className="text-xs text-white/50 mt-2">
                    Este campo se completa automáticamente con tu usuario
                  </p>
                </div>

                {ultimaCajaMenor && (
                  <div className="p-4 bg-blue-500/10 border border-blue-400/30 rounded-xl">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-blue-400 font-bold text-sm mb-1">
                          ✅ Se vinculará a la última Caja Menor activa
                        </h4>
                        <p className="text-blue-200/90 text-xs leading-relaxed">
                          Responsable: <strong>{ultimaCajaMenor.beneficiario}</strong><br/>
                          Valor disponible: <strong>${ultimaCajaMenor.valor?.toLocaleString('es-CO')}</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 md:gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={loading || ((): boolean => {
                      if (!ultimaCajaMenor || !formData.valor) return false;
                      const valorIngresado = parseFloat(formData.valor) || 0;
                      const totalIngresosCaja = ultimaCajaMenor.valor || 0;
                      const totalEgresosCaja = itemsRecords
                        .filter(item => item.cajaMenor?.includes(ultimaCajaMenor.id))
                        .reduce((sum, item) => sum + (item.valor || 0), 0);
                      const saldoDisponible = totalIngresosCaja - totalEgresosCaja;
                      return valorIngresado > saldoDisponible;
                    })()}
                    className="flex-1 px-4 md:px-6 py-2 md:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors shadow-lg flex items-center justify-center gap-2 text-sm md:text-base"
                  >
                    {loading && (
                      <div className="animate-spin rounded-full h-3 w-3 md:h-4 md:w-4 border-b-2 border-white"></div>
                    )}
                    {loading ? (editingItemId ? 'Actualizando...' : 'Guardando...') : (editingItemId ? 'Actualizar Item' : 'Guardar Item')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingItemId(null);
                      setEditingItemType(null);
                      setFormData({
                        fecha: new Date().toISOString().split('T')[0],
                        beneficiario: '',
                        nitCC: '',
                        concepto: '',
                        centroCosto: '',
                        centroCostoOtro: '',
                        valor: '',
                        realizaRegistro: userData?.nombre || 'Usuario',
                        comprobanteFile: null
                      });
                      setSearchBeneficiario('');
                      setShowBeneficiarioDropdown(false);
                      setEsNuevoBeneficiario(false);
                    }}
                    className="px-4 md:px-6 py-2 md:py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-semibold transition-colors text-sm md:text-base"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

          {/* Selector de Caja Menor */}
          {cajaMenorRecords.length > 0 && (
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 border border-white/30 shadow-xl mb-4">
              <label className="block text-sm font-semibold text-white/80 mb-2">
                📂 Seleccionar Periodo de Caja Menor
              </label>
              <select
                value={cajaMenorActual?.id || ''}
                onChange={(e) => {
                  const selectedCaja = cajaMenorRecords.find(c => c.id === e.target.value);
                  setCajaMenorActual(selectedCaja || null);
                }}
                className="w-full px-4 py-3 bg-slate-700/50 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm md:text-base"
              >
                {[...cajaMenorRecords]
                  .sort((a, b) => new Date(b.fechaAnticipo).getTime() - new Date(a.fechaAnticipo).getTime())
                  .map(caja => (
                    <option key={caja.id} value={caja.id}>
                      {formatearFecha(caja.fechaAnticipo)} - {caja.beneficiario} - ${(caja.valor || 0).toLocaleString('es-CO')}
                      {caja.estadoCajaMenor === 'Caja Menor Consiliada' ? ' ✅ Consolidada' : ' 🔵 Abierta'}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Resumen de estado de la caja menor */}
          {cajaMenorActual && (
            <div className="bg-slate-800/40 backdrop-blur-md rounded-xl p-4 md:p-6 border border-white/30 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 md:mb-6">
                <div className="p-2 md:p-3 bg-green-500/20 rounded-xl border border-green-500/30 flex-shrink-0">
                  <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-green-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg md:text-xl font-bold text-white">
                    Resumen de Caja Menor Seleccionada
                  </h3>
                  <p className="text-xs md:text-sm text-white/70">Periodo: {formatearFecha(cajaMenorActual.fechaAnticipo)}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
                <div className="bg-slate-700/30 rounded-lg p-3 md:p-4 border border-white/10">
                  <p className="text-xs text-white/60 mb-1">Responsable</p>
                  <p className="text-white font-bold text-sm md:text-lg truncate">{cajaMenorActual.beneficiario}</p>
                </div>
                
                <div className="bg-slate-700/30 rounded-lg p-3 md:p-4 border border-white/10">
                  <p className="text-xs text-white/60 mb-1">Registrado por</p>
                  <p className="text-blue-300 font-bold text-sm md:text-lg truncate">{cajaMenorActual.realizaRegistro || 'No especificado'}</p>
                </div>
                
                <div className="bg-green-900/20 rounded-lg p-3 md:p-4 border border-green-500/30">
                  <p className="text-xs text-green-300/80 mb-1">Monto Inicial</p>
                  <p className="text-green-400 font-bold text-sm md:text-lg">
                    ${cajaMenorActual.valor?.toLocaleString('es-CO')}
                  </p>
                </div>
                
                <div className="bg-red-900/20 rounded-lg p-3 md:p-4 border border-red-500/30">
                  <p className="text-xs text-red-300/80 mb-1">Total Gastado</p>
                  <p className="text-red-400 font-bold text-sm md:text-lg">
                    ${totalEgresos.toLocaleString('es-CO')}
                  </p>
                </div>
                
                <div className={`${saldoActual >= 0 ? 'bg-blue-900/20 border-blue-500/30' : 'bg-orange-900/20 border-orange-500/30'} rounded-lg p-3 md:p-4 border col-span-2 md:col-span-1`}>
                  <p className={`text-xs ${saldoActual >= 0 ? 'text-blue-300/80' : 'text-orange-300/80'} mb-1`}>Saldo Disponible</p>
                  <p className={`${saldoActual >= 0 ? 'text-blue-400' : 'text-orange-400'} font-bold text-lg md:text-xl`}>
                    ${saldoActual.toLocaleString('es-CO')}
                    {saldoActual < 0 && <span className="text-xs ml-1">(Déficit)</span>}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Vista Previa de Consolidación */}
      {showConsolidarModal && ultimaCajaMenor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-slate-800/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/30 w-full max-w-5xl max-h-[95vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-orange-700 px-4 md:px-8 py-4 md:py-6 rounded-t-3xl border-b border-white/20 z-10">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 md:gap-4">
                  <div className="p-2 md:p-3 bg-white/20 rounded-xl flex-shrink-0">
                    <FileText className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl md:text-3xl font-bold text-white">Vista Previa de Consolidación</h2>
                    <p className="text-orange-100 mt-1 text-sm md:text-base">Formato de Legalización de Anticipo General</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowConsolidarModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors flex-shrink-0"
                >
                  <span className="text-white text-xl md:text-2xl">×</span>
                </button>
              </div>
            </div>

            {/* Contenido del Modal - Vista Previa del Formato */}
            <div className="p-4 md:p-8">
              {/* Encabezado del Formato */}
              <div className="bg-white rounded-xl p-4 md:p-6 mb-4 md:mb-6 shadow-lg">
                <div className="flex flex-col sm:flex-row items-start justify-between mb-4 gap-4">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-lg md:text-xl">SR</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl md:text-2xl font-bold text-gray-800">SIRIUS</h3>
                      <p className="text-gray-600 text-xs md:text-sm">Regenerative Solutions SAS ZOMAC</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs md:text-sm text-gray-600">Fecha de Actualización:</p>
                    <p className="font-bold text-gray-800 text-sm md:text-base">{new Date().toLocaleDateString('es-CO')}</p>
                  </div>
                </div>
                <div className="border-t-2 border-blue-600 pt-4">
                  <h4 className="text-lg md:text-xl font-bold text-center text-gray-800">
                    FORMATO DE LEGALIZACIÓN DE ANTICIPO GENERAL
                  </h4>
                </div>
              </div>

              {/* Información del Centro de Costos */}
              <div className="bg-blue-50 rounded-xl p-6 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">FECHA</p>
                    <div className="text-gray-800 font-medium">
                      <p className="text-sm">
                        <span className="font-semibold">Fecha del anticipo:</span>{' '}
                        {formatearFecha(ultimaCajaMenor.fechaAnticipo)}
                      </p>
                      <p className="text-sm mt-1">
                        <span className="font-semibold">Fecha fin:</span>{' '}
                        {new Date().toLocaleDateString('es-CO')}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">BENEFICIARIO</p>
                    <p className="text-gray-800 font-medium">{ultimaCajaMenor.beneficiario}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">NIT/CC</p>
                    <p className="text-gray-800 font-medium">{ultimaCajaMenor.nitCC || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">CONCEPTO</p>
                    <p className="text-gray-800 font-medium">
                      CAJA MENOR {formatearMesAnio(ultimaCajaMenor.fechaAnticipo)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-semibold text-gray-600 mb-1">VALOR CAJA MENOR</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${ultimaCajaMenor.valor.toLocaleString('es-CO')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabla de Items */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-blue-600 text-white">
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase">ITEM</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase">FECHA</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase">BENEFICIARIO</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase">NIT</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase">CONCEPTO</th>
                        <th className="px-4 py-3 text-center text-xs font-bold uppercase">C.C</th>
                        <th className="px-4 py-3 text-center text-xs font-bold uppercase">DOCUMENTO SOPORTE</th>
                        <th className="px-4 py-3 text-right text-xs font-bold uppercase">VALOR</th>
                        {canEditDelete && (
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase">ACCIONES</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {itemsRecords
                        .filter(item => item.cajaMenor?.includes(ultimaCajaMenor.id))
                        .map((item, index) => (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{index + 1}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {formatearFecha(item.fecha)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{item.beneficiario}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{item.nitCC || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                              {item.concepto}
                            </td>
                            <td className="px-4 py-3 text-sm text-center text-gray-700">
                              {item.centroCosto || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              {(() => {
                                const comprobante = (item as any).comprobante;
                                if (comprobante && Array.isArray(comprobante) && comprobante.length > 0) {
                                  const archivo = comprobante[0];
                                  return (
                                    <a
                                      href={archivo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-semibold transition-colors"
                                      title={`Ver ${archivo.filename || 'comprobante'}`}
                                    >
                                      {archivo.type?.includes('pdf') ? '📄' : '🖼️'}
                                      Ver
                                    </a>
                                  );
                                }
                                return <span className="text-gray-400 text-xs">-</span>;
                              })()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                              ${item.valor.toLocaleString('es-CO')}
                            </td>
                            {canEditDelete && (
                              <td className="px-4 py-3 text-sm text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleEditItem(item.id, 'item')}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-semibold transition-colors"
                                    title="Editar registro"
                                  >
                                    ✏️ Editar
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id, 'item')}
                                    disabled={isDeleting}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Eliminar registro"
                                  >
                                    🗑️ Eliminar
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totales */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm font-semibold text-gray-600 mb-1">TOTAL LEGALIZADO</p>
                    <p className="text-2xl font-bold text-blue-600">${totalEgresos.toLocaleString('es-CO')}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm font-semibold text-gray-600 mb-1">VALOR A REINTEGRAR A SIRIUS</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${(totalIngresos - totalEgresos).toLocaleString('es-CO')}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm font-semibold text-gray-600 mb-1">VALOR A REINTEGRAR AL BENEFICIARIO</p>
                    <p className="text-2xl font-bold text-orange-600">$0</p>
                  </div>
                </div>
              </div>

              {/* Nota Legal */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-700 leading-relaxed">
                  <strong>Nota:</strong> Adjunto a esta legalización se relacionan los soportes físicos legales y originales que 
                  soportan los gastos efectuados. Todos los soportes los encuentro ordenados de la misma manera en 
                  que aparecen en la legalización. Aclaro que por medio de los siguientes firmas certificamos que los 
                  gastos relacionados corresponden a gastos efectuados para el normal funcionamiento de las actividades 
                  de Sirius Regenerative Solutions SAS ZOMAC, que se encuentran en el subdominio autorizado dentro del 
                  mes, no se debe legalizar separadamente a fin de quedar sin gastos registrados dentro del mes en el 
                  que se hizo el gasto. No has recibido culpa alguna de las actividades dentro del mes.
                </p>
              </div>

              {/* Botones de Acción */}
              <div className="flex gap-4">
                <button
                  onClick={generarPDFConsolidacion}
                  disabled={isGeneratingPDF}
                  className="flex-1 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-500 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2"
                >
                  {isGeneratingPDF ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Generando PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Descargar PDF
                    </>
                  )}
                </button>
                <button
                  onClick={confirmarConsolidacion}
                  disabled={isConsolidating}
                  className="flex-1 px-6 py-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-green-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConsolidating ? (
                    <>
                      <span className="inline-block animate-spin">⏳</span>
                      Consolidando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Confirmar Consolidación
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowConsolidarModal(false)}
                  className="px-6 py-4 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal del Agente IA */}
      {showAgentModal && (
        <CajaMenorAgent onClose={() => setShowAgentModal(false)} />
      )}

      {/* Modal: Historial de Cajas Menores */}
      {showHistoricoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-800/95 rounded-2xl max-w-3xl w-full max-h-[80vh] flex flex-col border border-white/30 shadow-2xl mt-16">
            {/* Header */}
            <div className="sticky top-0 bg-slate-800/98 px-6 py-4 border-b border-white/30 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-blue-400" />
                <h3 className="text-xl font-bold text-white">Historial de Cajas Menores</h3>
                <span className="text-sm text-white/60">({cajaMenorRecords.length} registros)</span>
              </div>
              <button
                onClick={() => setShowHistoricoModal(false)}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 text-xl font-bold"
              >
                ✕
              </button>
            </div>
            {/* Tabla */}
            <div className="overflow-y-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/20 text-left">
                    <th className="pb-3 pr-4 text-xs font-bold text-white/60 uppercase tracking-wider">Fecha Anticipo</th>
                    <th className="pb-3 pr-4 text-xs font-bold text-white/60 uppercase tracking-wider">Beneficiario</th>
                    <th className="pb-3 pr-4 text-xs font-bold text-white/60 uppercase tracking-wider hidden md:table-cell">Concepto</th>
                    <th className="pb-3 pr-4 text-xs font-bold text-white/60 uppercase tracking-wider text-right">Valor</th>
                    <th className="pb-3 pr-4 text-xs font-bold text-white/60 uppercase tracking-wider hidden sm:table-cell">Estado</th>
                    <th className="pb-3 text-xs font-bold text-white/60 uppercase tracking-wider text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {[...cajaMenorRecords]
                    .sort((a, b) => new Date(b.fechaAnticipo).getTime() - new Date(a.fechaAnticipo).getTime())
                    .map(caja => (
                      <tr key={caja.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 pr-4 text-white/90">{formatearFecha(caja.fechaAnticipo)}</td>
                        <td className="py-3 pr-4 text-white/80">{caja.beneficiario}</td>
                        <td className="py-3 pr-4 text-white/70 hidden md:table-cell max-w-[200px] truncate">{caja.concepto}</td>
                        <td className="py-3 pr-4 text-white/90 text-right font-medium">${(caja.valor || 0).toLocaleString('es-CO')}</td>
                        <td className="py-3 pr-4 hidden sm:table-cell">
                          {caja.estadoCajaMenor === 'Caja Menor Consiliada' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold">
                              <CheckCircle className="w-3 h-3" /> Consolidada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold">
                              <Clock className="w-3 h-3" /> Abierta
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <button
                              onClick={() => {
                                setCajaMenorActual(caja);
                                setShowHistoricoModal(false);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg text-xs font-semibold transition-colors"
                              title="Seleccionar esta caja menor para trabajar con ella"
                            >
                              📌 Seleccionar
                            </button>
                            <button
                              onClick={() => {
                                setCajaParaVerItems(caja);
                                setShowHistoricoModal(false);
                                setShowCajaItemsModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors"
                              title="Ver items de la caja menor"
                            >
                              📋 Items ({itemsRecords.filter(i => i.cajaMenor?.includes(caja.id)).length})
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Items de una Caja Menor */}
      {showCajaItemsModal && cajaParaVerItems && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9998]">
          <div className="bg-slate-800/95 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col border border-white/30 shadow-2xl mt-16">
            {/* Header */}
            <div className="sticky top-0 bg-slate-800/98 px-6 py-4 border-b border-white/30 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3 min-w-0">
                <Receipt className="w-6 h-6 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-white truncate">Items — {cajaParaVerItems.beneficiario}</h3>
                  <p className="text-sm text-white/50">{formatearFecha(cajaParaVerItems.fechaAnticipo)} · ${(cajaParaVerItems.valor || 0).toLocaleString('es-CO')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setShowCajaItemsModal(false);
                    setShowHistoricoModal(true);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white/80 rounded-lg text-sm transition-colors"
                >
                  ← Historial
                </button>
                <button
                  onClick={() => setShowCajaItemsModal(false)}
                  className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 text-xl font-bold"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Tabla de items */}
            <div className="overflow-y-auto p-4">
              {(() => {
                console.log('🔍 Filtrando items para caja menor:', cajaParaVerItems.id);
                console.log('📊 Total items en memoria:', itemsRecords.length);

                const items = itemsRecords.filter(i => {
                  const match = i.cajaMenor?.includes(cajaParaVerItems.id);
                  return match;
                });

                console.log('✅ Items encontrados para esta caja:', items.length);
                console.log('📋 Items:', items.map(i => ({
                  id: i.id,
                  item: i.item,
                  beneficiario: i.beneficiario,
                  concepto: i.concepto?.substring(0, 30),
                  valor: i.valor,
                  cajaMenor: i.cajaMenor
                })));

                if (items.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Receipt className="w-12 h-12 text-white/20 mb-4" />
                      <p className="text-white/50">Esta caja menor no tiene items registrados</p>
                      <p className="text-white/30 text-xs mt-2">ID de caja: {cajaParaVerItems.id}</p>
                      <p className="text-white/30 text-xs">Total items en memoria: {itemsRecords.length}</p>
                    </div>
                  );
                }
                return (
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="border-b border-white/20 text-left">
                        <th className="pb-3 pr-3 text-xs font-bold text-white/60 uppercase tracking-wider">#</th>
                        <th className="pb-3 pr-3 text-xs font-bold text-white/60 uppercase tracking-wider">Fecha</th>
                        <th className="pb-3 pr-3 text-xs font-bold text-white/60 uppercase tracking-wider">Beneficiario</th>
                        <th className="pb-3 pr-3 text-xs font-bold text-white/60 uppercase tracking-wider">Concepto</th>
                        <th className="pb-3 pr-3 text-xs font-bold text-white/60 uppercase tracking-wider hidden md:table-cell">C. Costo</th>
                        <th className="pb-3 pr-3 text-xs font-bold text-white/60 uppercase tracking-wider text-right">Valor</th>
                        <th className="pb-3 text-xs font-bold text-white/60 uppercase tracking-wider text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {items.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 pr-3 text-white/50">{item.item ?? idx + 1}</td>
                          <td className="py-3 pr-3 text-white/80 whitespace-nowrap">{formatearFecha(item.fecha)}</td>
                          <td className="py-3 pr-3 text-white/80">{item.beneficiario}</td>
                          <td className="py-3 pr-3 text-white/70 max-w-[180px] truncate">{item.concepto}</td>
                          <td className="py-3 pr-3 text-white/60 hidden md:table-cell">{item.centroCosto || '—'}</td>
                          <td className="py-3 pr-3 text-white/90 text-right font-medium whitespace-nowrap">${(item.valor || 0).toLocaleString('es-CO')}</td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleDeleteItem(item.id, 'item')}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Eliminar item"
                              >
                                🗑️ Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/20">
                        <td colSpan={5} className="pt-3 text-sm font-bold text-white/60 text-right pr-3">Total</td>
                        <td className="pt-3 text-sm font-bold text-white text-right pr-3">
                          ${items.reduce((s, i) => s + (i.valor || 0), 0).toLocaleString('es-CO')}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Caja Menor */}
      {showEditFechaModal && cajaParaEditar && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[10000]">
          <div className="bg-slate-800/95 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col border border-white/30 shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/30 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Editar Caja Menor</h3>
              <button
                onClick={() => { setShowEditFechaModal(false); setShowHistoricoModal(true); }}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 text-xl font-bold"
              >
                ✕
              </button>
            </div>
            {/* Cuerpo */}
            <div className="overflow-y-auto p-6 space-y-4">
              {/* Fecha Anticipo */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Fecha Anticipo *</label>
                <input
                  type="date"
                  value={editingCajaData.fechaAnticipo}
                  onChange={(e) => setEditingCajaData(prev => ({ ...prev, fechaAnticipo: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  style={{ colorScheme: 'dark' }}
                  required
                />
              </div>
              {/* Beneficiario */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Beneficiario *</label>
                <input
                  type="text"
                  value={editingCajaData.beneficiario}
                  onChange={(e) => setEditingCajaData(prev => ({ ...prev, beneficiario: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Nombre del beneficiario"
                  required
                />
              </div>
              {/* NIT / CC */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">NIT / CC</label>
                <input
                  type="text"
                  value={editingCajaData.nitCC}
                  onChange={(e) => setEditingCajaData(prev => ({ ...prev, nitCC: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Número de identificación"
                />
              </div>
              {/* Concepto */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Concepto *</label>
                <textarea
                  value={editingCajaData.concepto}
                  onChange={(e) => setEditingCajaData(prev => ({ ...prev, concepto: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Descripción del anticipo"
                  required
                />
              </div>
              {/* Valor */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Valor *</label>
                <input
                  type="number"
                  value={editingCajaData.valor}
                  onChange={(e) => setEditingCajaData(prev => ({ ...prev, valor: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0"
                  min="0"
                  required
                />
              </div>
              {/* Realiza Registro */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Realiza Registro</label>
                <input
                  type="text"
                  value={editingCajaData.realizaRegistro}
                  onChange={(e) => setEditingCajaData(prev => ({ ...prev, realizaRegistro: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-700/60 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Nombre de quien registra"
                />
              </div>
              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmitEditarFecha}
                  disabled={isSavingFecha || !editingCajaData.fechaAnticipo || !editingCajaData.beneficiario || !editingCajaData.concepto || !editingCajaData.valor}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
                >
                  {isSavingFecha ? 'Guardando...' : 'Guardar Cambios'}
                </button>
                <button
                  onClick={() => { setShowEditFechaModal(false); setShowHistoricoModal(true); }}
                  className="flex-1 px-4 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-xl font-semibold transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CajaMenor() {
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
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat relative flex items-center justify-center"
        style={{
          backgroundImage: 'url(/18032025-DSC_2933.jpg)'
        }}
      >
        <div className="absolute inset-0 bg-slate-900/20"></div>
        <div className="relative z-10">
          <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-8 border border-white/30 shadow-2xl">
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
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat relative flex items-center justify-center"
        style={{
          backgroundImage: 'url(https://res.cloudinary.com/dvnuttrox/image/upload/v1752167074/20032025-DSC_3427_1_1_zmq71m.jpg)'
        }}
      >
        <div className="absolute inset-0 bg-slate-900/50"></div>
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
      <div 
        className="min-h-screen bg-cover bg-center bg-fixed bg-no-repeat relative flex items-center justify-center"
        style={{
          backgroundImage: 'url(/18032025-DSC_2933.jpg)'
        }}
      >
        <div className="absolute inset-0 bg-slate-900/20"></div>
        <div className="relative z-10">
          <div className="bg-slate-800/40 backdrop-blur-md rounded-2xl p-8 border border-white/30 shadow-2xl">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-lg font-semibold">Cargando datos del usuario...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CajaMenorDashboard
      userData={userData}
      onLogout={handleLogout}
    />
  );
}
