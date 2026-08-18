import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ConfiguracionAnual, FestivoAnual, DiaSinServicio, PlanVacacionesGrupo, Grupo, VigenciaCuadrante } from '../types';
import { Save, Calendar, Clock, SunMedium, Users, Plus, Trash2, ShieldAlert, CheckCircle2, History, ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';

const festivosNacionalesPorDefecto = (año: string): FestivoAnual[] => [
  { fecha: `${año}-01-01`, nombre: 'Año Nuevo' },
  { fecha: `${año}-01-06`, nombre: 'Epifanía del Señor (Reyes)' },
  { fecha: `${año}-04-03`, nombre: 'Viernes Santo' },
  { fecha: `${año}-05-01`, nombre: 'Fiesta del Trabajo' },
  { fecha: `${año}-08-15`, nombre: 'Asunción de la Virgen' },
  { fecha: `${año}-10-12`, nombre: 'Fiesta Nacional de España' },
  { fecha: `${año}-11-01`, nombre: 'Todos los Santos' },
  { fecha: `${año}-12-06`, nombre: 'Día de la Constitución' },
  { fecha: `${año}-12-08`, nombre: 'Inmaculada Concepción' },
  { fecha: `${año}-12-25`, nombre: 'Natividad del Señor' },
  { fecha: `${año}-03-19`, nombre: 'San José / Festivo Autonómico' },
  { fecha: `${año}-04-02`, nombre: 'Jueves Santo' },
  { fecha: `${año}-06-24`, nombre: 'San Juan / Festivo Local 1' },
  { fecha: `${año}-09-08`, nombre: 'Fiesta Patronal / Festivo Local 2' },
];

const defaultConfig: ConfiguracionAnual = {
  año: new Date().getFullYear().toString(),
  horarios_base: { entrada: '06:00', salida: '14:00' },
  festivos_detallados: [],
  festivos: [],
  dias_sin_servicio_detallados: [],
  dias_sin_servicio: [],
  plan_vacaciones: [],
  reglas_turnos: {
    min_agentes_division_mt: 4,
    turno_defecto_sin_division: 'M'
  },
  tarifas_extras: {
    'Agente': { laborable_diurna: 20, laborable_nocturna: 25, festivo_diurna: 30, festivo_nocturna: 35 },
    'Oficial': { laborable_diurna: 25, laborable_nocturna: 30, festivo_diurna: 35, festivo_nocturna: 40 },
    'Oficial-Jefe': { laborable_diurna: 30, laborable_nocturna: 35, festivo_diurna: 40, festivo_nocturna: 45 }
  }
};

export default function Configuracion() {
  const [config, setConfig] = useState<ConfiguracionAnual>(defaultConfig);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'calendario' | 'vacaciones' | 'vigencias'>('general');

  // Form states para Calendario
  const [nuevoFestivoFecha, setNuevoFestivoFecha] = useState('');
  const [nuevoFestivoNombre, setNuevoFestivoNombre] = useState('');
  const [nuevoDiaSinServicioFecha, setNuevoDiaSinServicioFecha] = useState('');
  const [nuevoDiaSinServicioMotivo, setNuevoDiaSinServicioMotivo] = useState('');

  // Form state para Vigencias
  const [vigenciaGrupoId, setVigenciaGrupoId] = useState('');
  const [vigenciaFechaDesde, setVigenciaFechaDesde] = useState('');
  const [vigenciaDescripcion, setVigenciaDescripcion] = useState('');
  const [vigenciaInvertirCiclo, setVigenciaInvertirCiclo] = useState(false);
  const [vigenciaDivisionMT, setVigenciaDivisionMT] = useState(true);
  const [vigenciaRotacionInvertida, setVigenciaRotacionInvertida] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [docSnap, gruposSnap] = await Promise.all([
          getDoc(doc(db, 'configuracion', 'anual')),
          getDocs(collection(db, 'grupos'))
        ]);

        const loadedGrupos = gruposSnap.docs.map(d => ({ ...d.data(), id: d.id } as Grupo));
        setGrupos(loadedGrupos);

        if (loadedGrupos.length > 0 && !vigenciaGrupoId) {
          setVigenciaGrupoId(loadedGrupos[0].id || '');
        }

        if (docSnap.exists()) {
          const data = docSnap.data() as ConfiguracionAnual;
          // Migración o valores por defecto
          const festivosDetallados = data.festivos_detallados || (data.festivos || []).map(f => ({ fecha: f, nombre: 'Festivo Oficial' }));
          const diasSinServicioDetallados = data.dias_sin_servicio_detallados || (data.dias_sin_servicio || []).map(d => ({ fecha: d, motivo: 'Sin Servicio Ordinario' }));
          const reglasTurnos = data.reglas_turnos || { min_agentes_division_mt: 4, turno_defecto_sin_division: 'M' };
          
          setConfig({
            ...defaultConfig,
            ...data,
            festivos_detallados: festivosDetallados,
            dias_sin_servicio_detallados: diasSinServicioDetallados,
            reglas_turnos: reglasTurnos
          });
        } else {
          const inicial = {
            ...defaultConfig,
            festivos_detallados: festivosNacionalesPorDefecto(defaultConfig.año),
            festivos: festivosNacionalesPorDefecto(defaultConfig.año).map(f => f.fecha)
          };
          await setDoc(doc(db, 'configuracion', 'anual'), inicial);
          setConfig(inicial);
        }
      } catch (error) {
        console.error("Error cargando configuracion:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Normalizar arrays de string para consultas directas
      const festivosStrings = (config.festivos_detallados || []).map(f => f.fecha);
      const diasSinServicioStrings = (config.dias_sin_servicio_detallados || []).map(d => d.fecha);

      const configToSave: ConfiguracionAnual = {
        ...config,
        festivos: festivosStrings,
        dias_sin_servicio: diasSinServicioStrings
      };

      await setDoc(doc(db, 'configuracion', 'anual'), configToSave);
      alert("Configuración guardada correctamente");
    } catch (err) {
      console.error("Error al guardar:", err);
      alert("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleTarifaChange = (categoria: string, campo: string, valor: string) => {
    setConfig(prev => ({
      ...prev,
      tarifas_extras: {
        ...prev.tarifas_extras,
        [categoria]: {
          ...prev.tarifas_extras[categoria as keyof ConfiguracionAnual['tarifas_extras']],
          [campo]: parseFloat(valor) || 0
        }
      }
    }));
  };

  // Gestión de Festivos
  const handleAddFestivo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoFestivoFecha || !nuevoFestivoNombre) return;
    const nuevo: FestivoAnual = {
      id: `${Date.now()}`,
      fecha: nuevoFestivoFecha,
      nombre: nuevoFestivoNombre.trim()
    };
    const listaActual = config.festivos_detallados || [];
    const ordenada = [...listaActual, nuevo].sort((a, b) => a.fecha.localeCompare(b.fecha));
    setConfig(prev => ({ ...prev, festivos_detallados: ordenada }));
    setNuevoFestivoFecha('');
    setNuevoFestivoNombre('');
  };

  const handleRemoveFestivo = (index: number) => {
    const lista = [...(config.festivos_detallados || [])];
    lista.splice(index, 1);
    setConfig(prev => ({ ...prev, festivos_detallados: lista }));
  };

  const handleCargarFestivosEstandar = () => {
    const estandar = festivosNacionalesPorDefecto(config.año || new Date().getFullYear().toString());
    setConfig(prev => ({
      ...prev,
      festivos_detallados: estandar
    }));
  };

  // Gestión de Días sin Servicio
  const handleAddDiaSinServicio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoDiaSinServicioFecha || !nuevoDiaSinServicioMotivo) return;
    const nuevo: DiaSinServicio = {
      id: `${Date.now()}`,
      fecha: nuevoDiaSinServicioFecha,
      motivo: nuevoDiaSinServicioMotivo.trim()
    };
    const lista = [...(config.dias_sin_servicio_detallados || []), nuevo].sort((a, b) => a.fecha.localeCompare(b.fecha));
    setConfig(prev => ({ ...prev, dias_sin_servicio_detallados: lista }));
    setNuevoDiaSinServicioFecha('');
    setNuevoDiaSinServicioMotivo('');
  };

  const handleRemoveDiaSinServicio = (index: number) => {
    const lista = [...(config.dias_sin_servicio_detallados || [])];
    lista.splice(index, 1);
    setConfig(prev => ({ ...prev, dias_sin_servicio_detallados: lista }));
  };

  // Gestión de Vacaciones por Grupo
  const handleUpdateMesVacacionesGrupo = (grupoId: string, mesNum: number) => {
    const actual = [...(config.plan_vacaciones || [])];
    const index = actual.findIndex(p => p.id_grupo === grupoId);
    if (index >= 0) {
      actual[index] = { ...actual[index], meses: [mesNum] };
    } else {
      actual.push({ id_grupo: grupoId, meses: [mesNum] });
    }
    setConfig(prev => ({ ...prev, plan_vacaciones: actual }));
  };

  // Gestión de Vigencias Temporales de Grupo
  const handleAddVigencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vigenciaGrupoId || !vigenciaFechaDesde) return;

    const nuevaVigencia: VigenciaCuadrante = {
      id: `${Date.now()}`,
      fecha_desde: vigenciaFechaDesde,
      descripcion: vigenciaDescripcion || 'Cambio de configuración',
      invertir_ciclo: vigenciaInvertirCiclo,
      division_mt: vigenciaDivisionMT,
      rotacion_mt_invertida: vigenciaRotacionInvertida
    };

    try {
      const g = grupos.find(x => x.id === vigenciaGrupoId);
      if (!g || !g.id) return;

      const lista = [...(g.vigencias || []), nuevaVigencia].sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde));
      
      await updateDoc(doc(db, 'grupos', g.id), {
        vigencias: lista
      });

      setGrupos(prev => prev.map(item => item.id === g.id ? { ...item, vigencias: lista } : item));
      setVigenciaFechaDesde('');
      setVigenciaDescripcion('');
      alert("Vigencia temporal añadida al grupo");
    } catch (err) {
      console.error("Error guardando vigencia:", err);
      alert("Error al añadir la vigencia");
    }
  };

  const handleRemoveVigencia = async (grupoId: string, vigenciaId: string) => {
    const g = grupos.find(x => x.id === grupoId);
    if (!g || !g.id) return;

    const lista = (g.vigencias || []).filter(v => v.id !== vigenciaId);
    try {
      await updateDoc(doc(db, 'grupos', g.id), {
        vigencias: lista
      });
      setGrupos(prev => prev.map(item => item.id === g.id ? { ...item, vigencias: lista } : item));
    } catch (err) {
      console.error(err);
      alert("Error al eliminar vigencia");
    }
  };

  if (loading) return <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest p-4">Cargando configuración del sistema...</div>;

  const numFestivos = config.festivos_detallados?.length || 0;

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-sm font-bold text-slate-100 uppercase tracking-widest">Configuración del Cuadrante y Calendario</h1>
          <p className="text-[10px] font-mono text-slate-500 mt-0.5">Parámetros generales, matriz de tarifas, festivos oficiales y vigencias de turnos</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-600/20"
        >
          <Save size={14} />
          {saving ? 'Guardando...' : 'Guardar Todo'}
        </button>
      </div>

      {/* Pestañas de Navegación */}
      <div className="flex border-b border-slate-800 bg-slate-900/40 rounded-t overflow-x-auto">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 transition-colors shrink-0 ${activeTab === 'general' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <Clock size={15} /> General y Tarifas
        </button>
        <button
          onClick={() => setActiveTab('calendario')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 transition-colors shrink-0 ${activeTab === 'calendario' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <Calendar size={15} /> 14 Festivos y Días Especiales
          <span className={`ml-1 text-[9px] px-1.5 py-0.2 rounded-full font-bold ${numFestivos === 14 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
            {numFestivos}/14
          </span>
        </button>
        <button
          onClick={() => setActiveTab('vacaciones')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 transition-colors shrink-0 ${activeTab === 'vacaciones' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <SunMedium size={15} /> Vacaciones y Reglas M/T
        </button>
        <button
          onClick={() => setActiveTab('vigencias')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 transition-colors shrink-0 ${activeTab === 'vigencias' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <History size={15} /> Vigencias Temporales
        </button>
      </div>

      {/* CONTENIDO PESTAÑA 1: GENERAL Y TARIFAS */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/50 p-4 rounded border border-slate-800 space-y-4">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
              <Clock size={14} className="text-indigo-400" /> Parámetros Generales
            </h2>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Año de Planificación</label>
              <input 
                type="text" 
                value={config.año}
                onChange={e => setConfig({...config, año: e.target.value})}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Entrada Base</label>
                <input 
                  type="time" 
                  value={config.horarios_base.entrada}
                  onChange={e => setConfig({...config, horarios_base: {...config.horarios_base, entrada: e.target.value}})}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Salida Base</label>
                <input 
                  type="time" 
                  value={config.horarios_base.salida}
                  onChange={e => setConfig({...config, horarios_base: {...config.horarios_base, salida: e.target.value}})}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 p-4 rounded border border-slate-800 space-y-4 md:col-span-2">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">Matriz de Tarifas (Horas Extraordinarias)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-normal tracking-widest">CATEGORÍA</th>
                    <th className="px-3 py-2 font-normal tracking-widest">L-V DIURNA</th>
                    <th className="px-3 py-2 font-normal tracking-widest">L-V NOCTURNA</th>
                    <th className="px-3 py-2 font-normal tracking-widest">FESTIVO DIURNA</th>
                    <th className="px-3 py-2 font-normal tracking-widest">FESTIVO NOCTURNA</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(config.tarifas_extras).map((cat) => (
                    <tr key={cat} className="border-b border-slate-800/50 hover:bg-indigo-500/5">
                      <td className="px-3 py-2 text-indigo-400 font-bold">{cat.toUpperCase()}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center text-slate-500">
                          <span className="mr-1">€</span>
                          <input type="number" step="0.01" value={config.tarifas_extras[cat as keyof ConfiguracionAnual['tarifas_extras']].laborable_diurna} onChange={e => handleTarifaChange(cat, 'laborable_diurna', e.target.value)} className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 outline-none focus:border-indigo-500" />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                         <div className="flex items-center text-slate-500">
                          <span className="mr-1">€</span>
                          <input type="number" step="0.01" value={config.tarifas_extras[cat as keyof ConfiguracionAnual['tarifas_extras']].laborable_nocturna} onChange={e => handleTarifaChange(cat, 'laborable_nocturna', e.target.value)} className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 outline-none focus:border-indigo-500" />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                         <div className="flex items-center text-slate-500">
                          <span className="mr-1">€</span>
                          <input type="number" step="0.01" value={config.tarifas_extras[cat as keyof ConfiguracionAnual['tarifas_extras']].festivo_diurna} onChange={e => handleTarifaChange(cat, 'festivo_diurna', e.target.value)} className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 outline-none focus:border-indigo-500" />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                         <div className="flex items-center text-slate-500">
                          <span className="mr-1">€</span>
                          <input type="number" step="0.01" value={config.tarifas_extras[cat as keyof ConfiguracionAnual['tarifas_extras']].festivo_nocturna} onChange={e => handleTarifaChange(cat, 'festivo_nocturna', e.target.value)} className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 outline-none focus:border-indigo-500" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] font-mono text-slate-500 mt-2">* Horario nocturno computado automáticamente entre las 22:00 y las 06:00.</p>
          </div>
        </div>
      )}

      {/* CONTENIDO PESTAÑA 2: 14 FESTIVOS Y DÍAS SIN SERVICIO */}
      {activeTab === 'calendario' && (
        <div className="space-y-6">
          {/* Bloque 14 Festivos */}
          <div className="bg-slate-900/50 p-5 rounded border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-[11px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={15} className="text-rose-400" /> 14 Festividades Oficiales del Año {config.año}
                </h2>
                <p className="text-[10px] font-mono text-slate-500">Festivos retribuidos / no recuperables (Nacionales, Autonómicos y Locales)</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCargarFestivosEstandar}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono uppercase px-2.5 py-1.5 rounded border border-slate-700 transition-colors"
                >
                  Cargar 14 Festivos Estándar
                </button>
              </div>
            </div>

            {/* Formulario rápido para añadir festivo */}
            <form onSubmit={handleAddFestivo} className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-950/60 p-3 rounded border border-slate-800/80">
              <div className="sm:col-span-4">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha Festivo</label>
                <input 
                  required 
                  type="date" 
                  value={nuevoFestivoFecha} 
                  onChange={e => setNuevoFestivoFecha(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-rose-500 [color-scheme:dark]" 
                />
              </div>
              <div className="sm:col-span-6">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre / Motivo</label>
                <input 
                  required 
                  type="text" 
                  placeholder="Ej. Fiesta Nacional de España" 
                  value={nuevoFestivoNombre} 
                  onChange={e => setNuevoFestivoNombre(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-rose-500" 
                />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <button 
                  type="submit" 
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] uppercase py-1.5 px-3 rounded flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus size={14} /> Añadir
                </button>
              </div>
            </form>

            {/* Tabla de Festivos */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-normal tracking-widest w-12">#</th>
                    <th className="px-3 py-2 font-normal tracking-widest w-36">FECHA</th>
                    <th className="px-3 py-2 font-normal tracking-widest">FESTIVIDAD / MOTIVO</th>
                    <th className="px-3 py-2 font-normal tracking-widest text-right w-20">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody>
                  {(config.festivos_detallados || []).map((festivo, index) => (
                    <tr key={index} className="border-b border-slate-800/50 hover:bg-rose-500/5">
                      <td className="px-3 py-2 text-slate-600">{index + 1}</td>
                      <td className="px-3 py-2 text-rose-400 font-bold">{festivo.fecha}</td>
                      <td className="px-3 py-2 text-slate-300">{festivo.nombre}</td>
                      <td className="px-3 py-2 text-right">
                        <button 
                          onClick={() => handleRemoveFestivo(index)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                          title="Eliminar festivo"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!config.festivos_detallados || config.festivos_detallados.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500 text-[10px]">
                        No hay festividades registradas. Puedes añadir una arriba o pulsar en "Cargar 14 Festivos Estándar".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bloque Días sin Servicio Ordinario */}
          <div className="bg-slate-900/50 p-5 rounded border border-slate-800 space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-[11px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                <ShieldAlert size={15} className="text-amber-400" /> Fechas sin Servicios Ordinarios (Ocasionales / Eventos)
              </h2>
              <p className="text-[10px] font-mono text-slate-500">Días especiales donde la jornada habitual queda suspendida o cubierta mediante servicios extraordinarios</p>
            </div>

            <form onSubmit={handleAddDiaSinServicio} className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-950/60 p-3 rounded border border-slate-800/80">
              <div className="sm:col-span-4">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha</label>
                <input 
                  required 
                  type="date" 
                  value={nuevoDiaSinServicioFecha} 
                  onChange={e => setNuevoDiaSinServicioFecha(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-amber-500 [color-scheme:dark]" 
                />
              </div>
              <div className="sm:col-span-6">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Motivo / Evento</label>
                <input 
                  required 
                  type="text" 
                  placeholder="Ej. Nochevieja / Cobertura extraordinaria" 
                  value={nuevoDiaSinServicioMotivo} 
                  onChange={e => setNuevoDiaSinServicioMotivo(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-amber-500" 
                />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <button 
                  type="submit" 
                  className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[10px] uppercase py-1.5 px-3 rounded flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus size={14} /> Añadir
                </button>
              </div>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-normal tracking-widest w-36">FECHA</th>
                    <th className="px-3 py-2 font-normal tracking-widest">MOTIVO / EVENTO</th>
                    <th className="px-3 py-2 font-normal tracking-widest text-right w-20">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody>
                  {(config.dias_sin_servicio_detallados || []).map((dia, index) => (
                    <tr key={index} className="border-b border-slate-800/50 hover:bg-amber-500/5">
                      <td className="px-3 py-2 text-amber-400 font-bold">{dia.fecha}</td>
                      <td className="px-3 py-2 text-slate-300">{dia.motivo}</td>
                      <td className="px-3 py-2 text-right">
                        <button 
                          onClick={() => handleRemoveDiaSinServicio(index)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!config.dias_sin_servicio_detallados || config.dias_sin_servicio_detallados.length === 0) && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-slate-500 text-[10px]">
                        No hay fechas sin servicio ordinario registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO PESTAÑA 3: VACACIONES Y REGLAS M/T */}
      {activeTab === 'vacaciones' && (
        <div className="space-y-6">
          {/* Reglas de División M/T */}
          <div className="bg-slate-900/50 p-5 rounded border border-slate-800 space-y-4">
            <h2 className="text-[11px] font-bold text-slate-100 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
              <Users size={15} className="text-sky-400" /> Reglas de División Mañana / Tarde (M / T)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                  Mínimo de Agentes en Grupo para División M/T
                </label>
                <input 
                  type="number" 
                  min="2" 
                  max="20"
                  value={config.reglas_turnos?.min_agentes_division_mt ?? 4}
                  onChange={e => setConfig({
                    ...config,
                    reglas_turnos: {
                      ...config.reglas_turnos,
                      min_agentes_division_mt: parseInt(e.target.value) || 4
                    }
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" 
                />
                <p className="text-[9px] font-mono text-slate-500 mt-1">
                  Si el grupo tiene 4 o más agentes, se divide automáticamente al 50% entre turno de Mañana (M) y Tarde (T).
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                  Turno por Defecto si Grupo tiene Menos de {config.reglas_turnos?.min_agentes_division_mt ?? 4} Agentes
                </label>
                <select
                  value={config.reglas_turnos?.turno_defecto_sin_division ?? 'M'}
                  onChange={e => setConfig({
                    ...config,
                    reglas_turnos: {
                      ...config.reglas_turnos,
                      turno_defecto_sin_division: e.target.value as 'M' | 'T'
                    }
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
                >
                  <option value="M">MAÑANA (M)</option>
                  <option value="T">TARDE (T)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Plan de Vacaciones por Grupo */}
          <div className="bg-slate-900/50 p-5 rounded border border-slate-800 space-y-4">
            <h2 className="text-[11px] font-bold text-slate-100 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
              <SunMedium size={15} className="text-amber-400" /> Meses de Vacaciones Asignados por Grupo
            </h2>
            <p className="text-[10px] font-mono text-slate-500">
              Define el mes principal del bloque vacacional estival para cada grupo policial.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {grupos.map((grupo) => {
                const plan = (config.plan_vacaciones || []).find(p => p.id_grupo === grupo.id);
                const mesActual = plan?.meses?.[0] || 7;

                return (
                  <div key={grupo.id} className="bg-slate-950/80 p-4 rounded border border-slate-800/80 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-indigo-400 uppercase font-mono">{grupo.nombre}</span>
                      <span className="text-[9px] font-mono text-slate-500 uppercase">Patrón base: {grupo.patron_inicio}</span>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        Mes de Vacaciones Principal
                      </label>
                      <select
                        value={mesActual}
                        onChange={e => handleUpdateMesVacacionesGrupo(grupo.id!, parseInt(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-amber-500"
                      >
                        <option value={6}>JUNIO</option>
                        <option value={7}>JULIO</option>
                        <option value={8}>AGOSTO</option>
                        <option value={9}>SEPTIEMBRE</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO PESTAÑA 4: VIGENCIAS TEMPORALES */}
      {activeTab === 'vigencias' && (
        <div className="space-y-6">
          <div className="bg-slate-900/50 p-5 rounded border border-slate-800 space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-[11px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                <History size={15} className="text-indigo-400" /> Programación de Vigencias Temporales de Cuadrante
              </h2>
              <p className="text-[10px] font-mono text-slate-500">
                Añade cambios de ciclo o rotaciones indicando la fecha exacta en la que entran en vigor. Las fechas anteriores mantendrán su histórico intacto.
              </p>
            </div>

            {/* Formulario de Nueva Vigencia */}
            <form onSubmit={handleAddVigencia} className="bg-slate-950/80 p-4 rounded border border-slate-800/80 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Grupo Afectado</label>
                  <select 
                    value={vigenciaGrupoId} 
                    onChange={e => setVigenciaGrupoId(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
                  >
                    {grupos.map(g => (
                      <option key={g.id} value={g.id}>{g.nombre.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Entrada en Vigor (Desde)</label>
                  <input 
                    required 
                    type="date" 
                    value={vigenciaFechaDesde} 
                    onChange={e => setVigenciaFechaDesde(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Descripción / Motivo</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Reincorporación post-verano / Cambio ciclo" 
                    value={vigenciaDescripcion} 
                    onChange={e => setVigenciaDescripcion(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={vigenciaInvertirCiclo} 
                    onChange={e => setVigenciaInvertirCiclo(e.target.checked)} 
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0" 
                  />
                  <span className="text-[10px] font-mono text-slate-300">Invertir ciclo 7x7 (Pares / Impares)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={vigenciaDivisionMT} 
                    onChange={e => setVigenciaDivisionMT(e.target.checked)} 
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0" 
                  />
                  <span className="text-[10px] font-mono text-slate-300">Dividir Mañanas/Tardes (≥4 agentes)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={vigenciaRotacionInvertida} 
                    onChange={e => setVigenciaRotacionInvertida(e.target.checked)} 
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0" 
                  />
                  <span className="text-[10px] font-mono text-slate-300">Invertir orden inicial M/T</span>
                </label>
              </div>

              <div className="flex justify-end">
                <button 
                  type="submit" 
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase py-1.5 px-4 rounded flex items-center gap-1.5 transition-colors"
                >
                  <Plus size={14} /> Registrar Vigencia Temporal
                </button>
              </div>
            </form>

            {/* Listado de Vigencias por Grupo */}
            <div className="space-y-4 mt-4">
              {grupos.map((grupo) => (
                <div key={grupo.id} className="bg-slate-950 p-4 rounded border border-slate-800">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[11px] font-bold text-indigo-400 font-mono">{grupo.nombre.toUpperCase()}</span>
                    <span className="text-[9px] font-mono text-slate-500">{(grupo.vigencias || []).length} vigencias programadas</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-[10px] border-collapse">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-normal tracking-widest w-32">DESDE FECHA</th>
                          <th className="px-3 py-2 font-normal tracking-widest">DESCRIPCIÓN</th>
                          <th className="px-3 py-2 font-normal tracking-widest">INVERSIÓN CICLO</th>
                          <th className="px-3 py-2 font-normal tracking-widest">DIVISIÓN M/T</th>
                          <th className="px-3 py-2 font-normal tracking-widest text-right w-16">ELIMINAR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(grupo.vigencias || []).map((vigencia) => (
                          <tr key={vigencia.id} className="border-b border-slate-800/50 hover:bg-indigo-500/5">
                            <td className="px-3 py-2 text-indigo-400 font-bold">{vigencia.fecha_desde}</td>
                            <td className="px-3 py-2 text-slate-300">{vigencia.descripcion}</td>
                            <td className="px-3 py-2">
                              {vigencia.invertir_ciclo ? (
                                <span className="text-amber-400 font-bold">✓ Sí (Invertido)</span>
                              ) : (
                                <span className="text-slate-500">✗ Normal</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {vigencia.division_mt ? (
                                <span className="text-emerald-400">✓ Activa</span>
                              ) : (
                                <span className="text-slate-500">✗ No</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button 
                                onClick={() => handleRemoveVigencia(grupo.id!, vigencia.id!)}
                                className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!grupo.vigencias || grupo.vigencias.length === 0) && (
                          <tr>
                            <td colSpan={5} className="px-3 py-3 text-center text-slate-500 text-[10px]">
                              Sin vigencias programadas (sigue el patrón base {grupo.patron_inicio}).
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
