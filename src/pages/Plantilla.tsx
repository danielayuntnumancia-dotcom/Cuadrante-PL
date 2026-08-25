import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Agente, CategoriaAgente, Grupo, EstadoAgente, PeriodoEstado, getEstadoAgenteEnFecha } from '../types';
import { UserPlus, Trash2, Edit2, Shield, HeartPulse, ExternalLink, UserCheck, Plus, CheckCircle2, Clock, Calendar } from 'lucide-react';
import { formatFechaVisual } from './Configuracion';
import { format } from 'date-fns';

export default function Plantilla() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Modal de Asignación de Jornadas Especiales
  const [isAsignacionModalOpen, setIsAsignacionModalOpen] = useState(false);
  const [agenteAsignacionSelected, setAgenteAsignacionSelected] = useState<Agente | null>(null);
  const [nuevaAsignacionTipo, setNuevaAsignacionTipo] = useState<'7x7' | 'ESPECIAL'>('ESPECIAL');
  const [nuevaAsignacionJornadaId, setNuevaAsignacionJornadaId] = useState('');
  const [nuevaAsignacionDesde, setNuevaAsignacionDesde] = useState('');
  const [nuevaAsignacionHasta, setNuevaAsignacionHasta] = useState('');

  // Modal específico de Historial de Estados / Bajas / Comisiones
  const [isEstadoModalOpen, setIsEstadoModalOpen] = useState(false);
  const [agenteEstadoSelected, setAgenteEstadoSelected] = useState<Agente | null>(null);
  const [nuevoPeriodoTipo, setNuevoPeriodoTipo] = useState<EstadoAgente>('Baja Médica');
  const [nuevoPeriodoDesde, setNuevoPeriodoDesde] = useState('');
  const [nuevoPeriodoHasta, setNuevoPeriodoHasta] = useState('');
  const [nuevoPeriodoMotivo, setNuevoPeriodoMotivo] = useState('');

  // Form state
  const [nombre, setNombre] = useState('');
  const [placa, setPlaca] = useState('');
  const [categoria, setCategoria] = useState<CategoriaAgente>('Agente');
  const [idGrupo, setIdGrupo] = useState('');
  const [apTotal, setApTotal] = useState(6);
  const [estado, setEstado] = useState<EstadoAgente>('Activo');
  const [fechaEstadoDesde, setFechaEstadoDesde] = useState('');
  const [fechaEstadoHasta, setFechaEstadoHasta] = useState('');
  const [fechaIncorporacion, setFechaIncorporacion] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentesSnap, gruposSnap, configSnap] = await Promise.all([
        getDocs(collection(db, 'agentes')),
        getDocs(collection(db, 'grupos')),
        import('firebase/firestore').then(({ getDoc, doc }) => getDoc(doc(db, 'configuracion', 'anual')))
      ]);
      
      if (configSnap.exists()) setConfig(configSnap.data());
      
      let currentGrupos = gruposSnap.docs.map(d => ({ ...d.data(), id: d.id } as Grupo));
      let currentAgentes = agentesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Agente));
      
      // Create a default group if none exists just for the demo
      if (gruposSnap.empty) {
        const gDoc = await addDoc(collection(db, 'grupos'), { nombre: 'Grupo A', patron_inicio: '2026-01-01' });
        currentGrupos = [{ id: gDoc.id, nombre: 'Grupo A', patron_inicio: '2026-01-01' }];
      }

      if (agentesSnap.empty) {
        const aDoc = await addDoc(collection(db, 'agentes'), {
          nombre: 'Agente Demo',
          placa: '1234',
          categoria: 'Agente',
          id_grupo: currentGrupos[0]?.id ?? '',
          asuntos_propios_total: 6,
          estado: 'Activo'
        });
        currentAgentes = [{ id: aDoc.id, nombre: 'Agente Demo', placa: '1234', categoria: 'Agente', id_grupo: currentGrupos[0]?.id ?? '', asuntos_propios_total: 6, estado: 'Activo' }];
      }

      setGrupos(currentGrupos);
      setAgentes(currentAgentes);
    } catch (error) {
      console.error("Error cargando plantilla:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setNombre(''); 
    setPlaca(''); 
    setCategoria('Agente'); 
    setIdGrupo(''); 
    setApTotal(6); 
    setEstado('Activo');
    setFechaEstadoDesde('');
    setFechaEstadoHasta('');
    setFechaIncorporacion('');
    setEditingId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !placa) return;

    const agenteData: Partial<Agente> = {
      nombre,
      placa,
      categoria,
      id_grupo: idGrupo || (grupos[0]?.id ?? ''),
      asuntos_propios_total: apTotal,
      estado,
      fecha_estado_desde: estado !== 'Activo' ? fechaEstadoDesde : '',
      fecha_estado_hasta: estado !== 'Activo' ? fechaEstadoHasta : '',
      fecha_incorporacion: fechaIncorporacion || undefined
    };

    if (editingId) {
      await updateDoc(doc(db, 'agentes', editingId), agenteData);
    } else {
      await addDoc(collection(db, 'agentes'), agenteData);
    }
    
    setIsModalOpen(false);
    resetForm();
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este agente?")) {
      await deleteDoc(doc(db, 'agentes', id));
      loadData();
    }
  };

  const handleOpenEstadoModal = (agente: Agente) => {
    // Si el agente tiene campos legados y no tiene periodos_estado, sincronizar
    let periodos = agente.periodos_estado ? [...agente.periodos_estado] : [];
    if (periodos.length === 0 && agente.estado && agente.estado !== 'Activo') {
      periodos = [{
        id: `${Date.now()}`,
        tipo: agente.estado,
        fecha_desde: agente.fecha_estado_desde || format(new Date(), 'yyyy-MM-dd'),
        fecha_hasta: agente.fecha_estado_hasta || '',
        motivo: 'Registro anterior'
      }];
    }

    setAgenteEstadoSelected({ ...agente, periodos_estado: periodos });
    setNuevoPeriodoTipo('Baja Médica');
    setNuevoPeriodoDesde(format(new Date(), 'yyyy-MM-dd'));
    setNuevoPeriodoHasta('');
    setNuevoPeriodoMotivo('');
    setIsEstadoModalOpen(true);
  };

  const handleAddPeriodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agenteEstadoSelected?.id || !nuevoPeriodoDesde) return;

    const nuevo: PeriodoEstado = {
      id: `${Date.now()}`,
      tipo: nuevoPeriodoTipo,
      fecha_desde: nuevoPeriodoDesde,
      ...(nuevoPeriodoHasta ? { fecha_hasta: nuevoPeriodoHasta } : {}),
      motivo: nuevoPeriodoMotivo.trim()
    };

    const periodosActuales = agenteEstadoSelected.periodos_estado || [];
    const actualizados = [...periodosActuales, nuevo].sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde));

    const cleanData = JSON.parse(JSON.stringify({ periodos_estado: actualizados }));

    await updateDoc(doc(db, 'agentes', agenteEstadoSelected.id), cleanData);
    setAgenteEstadoSelected(prev => prev ? { ...prev, periodos_estado: actualizados } : null);
    setNuevoPeriodoDesde(format(new Date(), 'yyyy-MM-dd'));
    setNuevoPeriodoHasta('');
    setNuevoPeriodoMotivo('');
    loadData();
  };

  const handleDeletePeriodo = async (periodoId: string) => {
    if (!agenteEstadoSelected?.id) return;
    const periodosActuales = agenteEstadoSelected.periodos_estado || [];
    const actualizados = periodosActuales.filter(p => p.id !== periodoId);

    const cleanData = JSON.parse(JSON.stringify({ periodos_estado: actualizados }));

    await updateDoc(doc(db, 'agentes', agenteEstadoSelected.id), cleanData);
    setAgenteEstadoSelected(prev => prev ? { ...prev, periodos_estado: actualizados } : null);
    loadData();
  };

  const handleDarAltaHoy = async (periodoId: string) => {
    if (!agenteEstadoSelected?.id) return;
    const hoyStr = format(new Date(), 'yyyy-MM-dd');
    const periodosActuales = (agenteEstadoSelected.periodos_estado || []).map(p => {
      if (p.id === periodoId) {
        return { ...p, fecha_hasta: hoyStr };
      }
      return p;
    });

    const cleanData = JSON.parse(JSON.stringify({ periodos_estado: periodosActuales }));

    await updateDoc(doc(db, 'agentes', agenteEstadoSelected.id), cleanData);
    setAgenteEstadoSelected(prev => prev ? { ...prev, periodos_estado: periodosActuales } : null);
    loadData();
  };

  const handleOpenAsignacionModal = (agente: Agente) => {
    setAgenteAsignacionSelected(agente);
    setNuevaAsignacionTipo('ESPECIAL');
    const defaultJornada = config?.jornadas_especiales?.[0]?.id || '';
    setNuevaAsignacionJornadaId(defaultJornada);
    setNuevaAsignacionDesde(format(new Date(), 'yyyy-MM-dd'));
    setNuevaAsignacionHasta('');
    setIsAsignacionModalOpen(true);
  };

  const handleAddAsignacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agenteAsignacionSelected?.id || !nuevaAsignacionDesde) return;
    if (nuevaAsignacionTipo === 'ESPECIAL' && !nuevaAsignacionJornadaId) {
      alert("Seleccione una jornada especial");
      return;
    }

    const nueva = {
      id: `${Date.now()}`,
      tipo_jornada: nuevaAsignacionTipo,
      fecha_desde: nuevaAsignacionDesde,
      ...(nuevaAsignacionHasta ? { fecha_hasta: nuevaAsignacionHasta } : {}),
      ...(nuevaAsignacionTipo === 'ESPECIAL' ? { id_jornada_especial: nuevaAsignacionJornadaId } : { id_grupo: agenteAsignacionSelected.id_grupo })
    };

    const asigsActuales = agenteAsignacionSelected.asignaciones_jornada || [];
    const actualizados = [...asigsActuales, nueva].sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde));
    const cleanData = JSON.parse(JSON.stringify({ asignaciones_jornada: actualizados }));

    await updateDoc(doc(db, 'agentes', agenteAsignacionSelected.id), cleanData);
    setAgenteAsignacionSelected(prev => prev ? { ...prev, asignaciones_jornada: actualizados } : null);
    setNuevaAsignacionDesde(format(new Date(), 'yyyy-MM-dd'));
    setNuevaAsignacionHasta('');
    loadData();
  };

  const handleDeleteAsignacion = async (asignacionId: string) => {
    if (!agenteAsignacionSelected?.id) return;
    const asigsActuales = agenteAsignacionSelected.asignaciones_jornada || [];
    const actualizados = asigsActuales.filter(p => p.id !== asignacionId);
    const cleanData = JSON.parse(JSON.stringify({ asignaciones_jornada: actualizados }));

    await updateDoc(doc(db, 'agentes', agenteAsignacionSelected.id), cleanData);
    setAgenteAsignacionSelected(prev => prev ? { ...prev, asignaciones_jornada: actualizados } : null);
    loadData();
  };

  const renderBadgeEstado = (agente: Agente) => {
    const { estado: estHoy, periodoActivo } = getEstadoAgenteEnFecha(agente, new Date());
    const totalPeriodos = (agente.periodos_estado || []).length;
    
    if (estHoy === 'Activo') {
      return (
        <button 
          type="button"
          onClick={() => handleOpenEstadoModal(agente)}
          className="flex flex-col items-start text-left cursor-pointer group"
          title="Clic para gestionar bajas, comisiones o consultar historial"
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 group-hover:bg-emerald-500/25 transition-colors">
            <UserCheck size={11} /> ACTIVO
          </span>
          {totalPeriodos > 0 && (
            <span className="text-[8px] font-mono text-slate-500 mt-0.5">
              {totalPeriodos} {totalPeriodos === 1 ? 'sit. registrada' : 'situaciones en hist.'}
            </span>
          )}
        </button>
      );
    }

    const label = estHoy === 'Baja Médica' ? 'BAJA (IT)' : (estHoy === 'Comisión de Servicio' ? 'COMISIÓN (CS)' : 'EXCEDENCIA (EX)');
    const color = estHoy === 'Baja Médica' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 group-hover:bg-rose-500/25' : (estHoy === 'Comisión de Servicio' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30 group-hover:bg-purple-500/25' : 'bg-amber-500/15 text-amber-300 border-amber-500/30 group-hover:bg-amber-500/25');
    const Icon = estHoy === 'Baja Médica' ? HeartPulse : (estHoy === 'Comisión de Servicio' ? ExternalLink : Shield);

    return (
      <button 
        type="button"
        onClick={() => handleOpenEstadoModal(agente)}
        className="flex flex-col items-start text-left cursor-pointer group"
        title="Clic para cambiar estado / registrar reincorporación"
      >
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${color} border transition-colors w-fit`}>
          <Icon size={11} /> {label}
        </span>
        {periodoActivo?.fecha_desde && (
          <span className="text-[8px] font-mono text-slate-500 mt-0.5">
            {formatFechaVisual(periodoActivo.fecha_desde)}{periodoActivo.fecha_hasta ? ` → ${formatFechaVisual(periodoActivo.fecha_hasta)}` : ' (Indef.)'}
          </span>
        )}
      </button>
    );
  };

  if (loading) return <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest p-4">Cargando datos...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-sm font-bold text-slate-100 uppercase tracking-widest">Plantilla de Agentes</h1>
          <p className="text-[10px] font-mono text-slate-500 mt-0.5">Gestión de efectivos, asignación de grupos y estados administrativos prevalentes</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded flex items-center gap-2 transition-colors shadow-lg shadow-indigo-600/20"
        >
          <UserPlus size={14} />
          Nuevo Agente
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded flex flex-col overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Placa</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Nombre</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Categoría</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Grupo</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Estado</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">AP (Total)</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {[...agentes]
                .sort((a, b) => {
                  const grupoA = grupos.find(g => g.id === a.id_grupo)?.nombre || '';
                  const grupoB = grupos.find(g => g.id === b.id_grupo)?.nombre || '';
                  return grupoA.localeCompare(grupoB) || a.placa.localeCompare(b.placa);
                })
                .map(agente => (
                <tr key={agente.id} className="border-b border-slate-800/50 hover:bg-indigo-500/5 text-slate-300">
                  <td className="px-3 py-2 text-indigo-400 font-bold">#{agente.placa}</td>
                  <td className="px-3 py-2 font-bold text-slate-200">{agente.nombre}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] text-slate-300">
                      {agente.categoria.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2">{grupos.find(g => g.id === agente.id_grupo)?.nombre || 'SIN_GRUPO'}</td>
                  <td className="px-3 py-2">{renderBadgeEstado(agente)}</td>
                  <td className="px-3 py-2">
                    <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden inline-block mr-2">
                      <div className="h-full bg-indigo-500" style={{width: `${Math.min(100, (agente.asuntos_propios_total / 6) * 100)}%`}}></div>
                    </div>
                    {agente.asuntos_propios_total}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button 
                      type="button"
                      onClick={() => handleOpenEstadoModal(agente)} 
                      className="text-rose-400 hover:text-rose-300 p-1 mr-1 transition-colors" 
                      title="Gestionar Baja Médica / Comisión / Excedencia"
                    >
                      <HeartPulse size={14} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleOpenAsignacionModal(agente)} 
                      className="text-amber-400 hover:text-amber-300 p-1 mr-1 transition-colors" 
                      title="Asignar Jornada Especial / Comodín"
                    >
                      <Calendar size={14} />
                    </button>
                    <button onClick={() => {
                      setNombre(agente.nombre);
                      setPlaca(agente.placa);
                      setCategoria(agente.categoria);
                      setIdGrupo(agente.id_grupo);
                      setApTotal(agente.asuntos_propios_total);
                      setEstado(agente.estado || 'Activo');
                      setFechaEstadoDesde(agente.fecha_estado_desde || '');
                      setFechaEstadoHasta(agente.fecha_estado_hasta || '');
                      setFechaIncorporacion(agente.fecha_incorporacion || '');
                      setEditingId(agente.id!);
                      setIsModalOpen(true);
                    }} className="text-slate-500 hover:text-indigo-400 p-1 mr-1 transition-colors" title="Editar ficha agente"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(agente.id!)} className="text-slate-500 hover:text-rose-400 p-1 transition-colors" title="Eliminar agente"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {agentes.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 font-mono text-[10px]">NO HAY DATOS</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Específico de Asignación de Jornadas */}
      {isAsignacionModalOpen && agenteAsignacionSelected && (() => {
        const asignaciones = agenteAsignacionSelected.asignaciones_jornada || [];

        return (
          <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded shadow-2xl w-full max-w-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-start flex-wrap gap-2">
                <div>
                  <h2 className="text-[12px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={16} className="text-indigo-400" />
                    Asignación de Jornadas
                  </h2>
                  <p className="text-[11px] font-mono text-indigo-400 font-bold mt-0.5">
                    #{agenteAsignacionSelected.placa} - {agenteAsignacionSelected.nombre}
                  </p>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded border border-slate-800 space-y-4">
                <form onSubmit={handleAddAsignacion} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tipo de Jornada</label>
                    <select 
                      value={nuevaAsignacionTipo}
                      onChange={(e) => setNuevaAsignacionTipo(e.target.value as '7x7' | 'ESPECIAL')}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 min-w-[150px]"
                    >
                      <option value="7x7">Normal (7x7 / Grupo)</option>
                      <option value="ESPECIAL">Especial / Comodín</option>
                    </select>
                  </div>

                  {nuevaAsignacionTipo === 'ESPECIAL' && (
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Jornada Especial</label>
                      <select 
                        value={nuevaAsignacionJornadaId}
                        onChange={(e) => setNuevaAsignacionJornadaId(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 min-w-[150px]"
                      >
                        {config?.jornadas_especiales?.map((j: any) => (
                          <option key={j.id} value={j.id}>{j.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Desde</label>
                    <input 
                      type="date" 
                      required
                      value={nuevaAsignacionDesde} 
                      onChange={e => setNuevaAsignacionDesde(e.target.value)} 
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Hasta (Opcional)</label>
                    <input 
                      type="date" 
                      value={nuevaAsignacionHasta} 
                      onChange={e => setNuevaAsignacionHasta(e.target.value)} 
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase py-1.5 px-3 rounded flex items-center gap-1.5 transition-colors h-[31px]"
                  >
                    <Plus size={14} /> Añadir
                  </button>
                </form>

                <div className="overflow-x-auto mt-4 border border-slate-800 rounded">
                  <table className="w-full text-left font-mono text-[10px] border-collapse">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-normal tracking-widest">DESDE</th>
                        <th className="px-3 py-2 font-normal tracking-widest">HASTA</th>
                        <th className="px-3 py-2 font-normal tracking-widest">TIPO</th>
                        <th className="px-3 py-2 font-normal tracking-widest text-right">ELIMINAR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asignaciones.map((a, i) => {
                        const jInfo = a.tipo_jornada === 'ESPECIAL' ? config?.jornadas_especiales?.find((x:any) => x.id === a.id_jornada_especial)?.nombre : 'Normal (7x7)';
                        return (
                          <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/50">
                            <td className="px-3 py-2 font-bold text-indigo-400">{formatFechaVisual(a.fecha_desde)}</td>
                            <td className="px-3 py-2 text-slate-400">{a.fecha_hasta ? formatFechaVisual(a.fecha_hasta) : 'Indefinida'}</td>
                            <td className="px-3 py-2 text-slate-300">{jInfo || 'Desconocida'}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteAsignacion(a.id!)}
                                className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {asignaciones.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-slate-500 text-[10px]">
                            No hay asignaciones. (Hará el turno del Grupo por defecto).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsAsignacionModalOpen(false); setAgenteAsignacionSelected(null); }}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold uppercase tracking-widest rounded transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Específico de Historial de Estados / Bajas / Comisiones */}
      {isEstadoModalOpen && agenteEstadoSelected && (() => {
        const { estado: estHoy, periodoActivo } = getEstadoAgenteEnFecha(agenteEstadoSelected, new Date());
        const periodos = agenteEstadoSelected.periodos_estado || [];
        const hoyStr = format(new Date(), 'yyyy-MM-dd');

        return (
          <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded shadow-2xl w-full max-w-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-start flex-wrap gap-2">
                <div>
                  <h2 className="text-[12px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                    <HeartPulse size={16} className="text-rose-400" />
                    Historial de Situaciones Administrativas y Bajas
                  </h2>
                  <p className="text-[11px] font-mono text-indigo-400 font-bold mt-0.5">
                    #{agenteEstadoSelected.placa} - {agenteEstadoSelected.nombre} ({agenteEstadoSelected.categoria})
                  </p>
                </div>
                
                {/* Badge de situación real hoy */}
                <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded border border-slate-800 font-mono text-[10px]">
                  <span className="text-slate-500">Estado Hoy ({formatFechaVisual(hoyStr)}):</span>
                  {estHoy === 'Activo' && (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <UserCheck size={12} /> ACTIVO
                    </span>
                  )}
                  {estHoy === 'Baja Médica' && (
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <HeartPulse size={12} /> BAJA (IT)
                    </span>
                  )}
                  {estHoy === 'Comisión de Servicio' && (
                    <span className="text-purple-300 font-bold flex items-center gap-1">
                      <ExternalLink size={12} /> COMISIÓN (CS)
                    </span>
                  )}
                  {estHoy === 'Excedencia' && (
                    <span className="text-amber-300 font-bold flex items-center gap-1">
                      <Shield size={12} /> EXCEDENCIA (EX)
                    </span>
                  )}
                </div>
              </div>

              {/* Formulario para registrar un nuevo período */}
              <div className="bg-slate-950 p-4 rounded border border-slate-800 space-y-3">
                <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Plus size={13} className="text-indigo-400" /> Registrar Nuevo Período / Situación
                </h3>

                <form onSubmit={handleAddPeriodo} className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      Tipo de Situación
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setNuevoPeriodoTipo('Baja Médica')}
                        className={`p-2 rounded border text-left flex items-center gap-1.5 transition-all text-[10px] ${
                          nuevoPeriodoTipo === 'Baja Médica'
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <HeartPulse size={13} className="text-rose-400" />
                        <div>
                          <div>BAJA (IT)</div>
                          <div className="text-[8px] font-mono text-slate-500 font-normal">Médica</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNuevoPeriodoTipo('Comisión de Servicio')}
                        className={`p-2 rounded border text-left flex items-center gap-1.5 transition-all text-[10px] ${
                          nuevoPeriodoTipo === 'Comisión de Servicio'
                            ? 'bg-purple-500/20 border-purple-500 text-purple-200 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <ExternalLink size={13} className="text-purple-400" />
                        <div>
                          <div>COMISIÓN (CS)</div>
                          <div className="text-[8px] font-mono text-slate-500 font-normal">Temporal</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNuevoPeriodoTipo('Excedencia')}
                        className={`p-2 rounded border text-left flex items-center gap-1.5 transition-all text-[10px] ${
                          nuevoPeriodoTipo === 'Excedencia'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <Shield size={13} className="text-amber-400" />
                        <div>
                          <div>EXCEDENCIA (EX)</div>
                          <div className="text-[8px] font-mono text-slate-500 font-normal">Suspensión</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        Fecha Inicio
                      </label>
                      <input
                        required
                        type="date"
                        value={nuevoPeriodoDesde}
                        onChange={e => setNuevoPeriodoDesde(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        Reincorporación (Opcional)
                      </label>
                      <input
                        type="date"
                        min={nuevoPeriodoDesde}
                        value={nuevoPeriodoHasta}
                        onChange={e => setNuevoPeriodoHasta(e.target.value)}
                        placeholder="Dejar vacío si es indefinida"
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        Motivo / Observaciones
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Accidente laboral, CS en Ayto..."
                        value={nuevoPeriodoMotivo}
                        onChange={e => setNuevoPeriodoMotivo(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase py-1.5 px-3 rounded flex items-center gap-1 transition-colors"
                    >
                      <Plus size={13} /> Añadir al Historial
                    </button>
                  </div>
                </form>
              </div>

              {/* Tabla de Historial */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={13} className="text-slate-500" /> Períodos Registrados ({periodos.length})
                </h3>

                <div className="overflow-x-auto border border-slate-800 rounded bg-slate-950/60">
                  <table className="w-full text-left font-mono text-[10px] border-collapse">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-normal tracking-widest">ESTADO</th>
                        <th className="px-3 py-2 font-normal tracking-widest">PERÍODO (DD/MM/AAAA)</th>
                        <th className="px-3 py-2 font-normal tracking-widest">ESTADO TEMPORAL</th>
                        <th className="px-3 py-2 font-normal tracking-widest">MOTIVO</th>
                        <th className="px-3 py-2 font-normal tracking-widest text-right">ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodos.map((p, idx) => {
                        const esPasado = p.fecha_hasta && p.fecha_hasta < hoyStr;
                        const esFuturo = p.fecha_desde > hoyStr;
                        const esEnCurso = !esPasado && !esFuturo;

                        const badgeColor = p.tipo === 'Baja Médica' ? 'text-rose-400' : (p.tipo === 'Comisión de Servicio' ? 'text-purple-300' : 'text-amber-300');

                        return (
                          <tr key={p.id || idx} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                            <td className={`px-3 py-2 font-bold ${badgeColor}`}>
                              {p.tipo === 'Baja Médica' ? 'BAJA (IT)' : (p.tipo === 'Comisión de Servicio' ? 'COMISIÓN (CS)' : 'EXCEDENCIA (EX)')}
                            </td>
                            <td className="px-3 py-2 text-slate-300">
                              {formatFechaVisual(p.fecha_desde)} → {p.fecha_hasta ? formatFechaVisual(p.fecha_hasta) : <span className="text-amber-400">Indefinido (En curso)</span>}
                            </td>
                            <td className="px-3 py-2">
                              {esEnCurso && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-bold animate-pulse">
                                  ● VIGENTE HOY
                                </span>
                              )}
                              {esPasado && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px]">
                                  ✓ FINALIZADO (PASADO)
                                </span>
                              )}
                              {esFuturo && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[9px]">
                                  ⏱ PROGRAMADO (FUTURO)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-400 text-[9px]">
                              {p.motivo || '-'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {esEnCurso && (!p.fecha_hasta || p.fecha_hasta > hoyStr) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDarAltaHoy(p.id!)}
                                    className="text-[9px] px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 transition-colors"
                                    title="Marcar finalización a fecha de hoy (dar de alta)"
                                  >
                                    Dar Alta Hoy
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeletePeriodo(p.id!)}
                                  className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                  title="Eliminar este período del historial"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {periodos.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-slate-500 text-[10px]">
                            No hay períodos registrados. El agente se encuentra en servicio Activo de forma continua.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsEstadoModalOpen(false); setAgenteEstadoSelected(null); }}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold uppercase tracking-widest rounded transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal General de Editar/Crear Agente */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded shadow-2xl w-full max-w-md p-5 flex flex-col gap-4">
            <h2 className="text-[12px] font-bold text-slate-100 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
              <UserPlus size={14} className="text-indigo-400" />
              {editingId ? 'EDITAR_AGENTE' : 'NUEVO_AGENTE'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Placa</label>
                  <input required type="text" value={placa} onChange={e => setPlaca(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre y Apellidos</label>
                  <input required type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Categoría</label>
                  <select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaAgente)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500">
                    <option value="Agente">AGENTE</option>
                    <option value="Oficial">OFICIAL</option>
                    <option value="Oficial-Jefe">OFICIAL-JEFE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Grupo Policial</label>
                  <select value={idGrupo} onChange={e => setIdGrupo(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500">
                    <option value="" disabled>SELECCIONE_GRUPO...</option>
                    {grupos.map(g => (
                      <option key={g.id} value={g.id}>{g.nombre.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Días AP Totales</label>
                  <input type="number" min="0" max="15" value={apTotal} onChange={e => setApTotal(parseInt(e.target.value) || 6)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha de Incorporación / Alta (Opcional)</label>
                  <input 
                    type="date" 
                    value={fechaIncorporacion} 
                    onChange={e => setFechaIncorporacion(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                  />
                  <p className="text-[8px] font-mono text-slate-500 mt-1">Si se especifica, el agente no aparecerá en el cuadrante antes de esta fecha.</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estado Administrativo</label>
                <select 
                  value={estado} 
                  onChange={e => setEstado(e.target.value as EstadoAgente)} 
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
                >
                  <option value="Activo">ACTIVO (En servicio ordinario)</option>
                  <option value="Baja Médica">BAJA MÉDICA (IT)</option>
                  <option value="Comisión de Servicio">COMISIÓN DE SERVICIO (CS)</option>
                  <option value="Excedencia">EXCEDENCIA (EX)</option>
                </select>
                <p className="text-[9px] font-mono text-slate-500 mt-1">
                  * Agentes en Baja, Comisión o Excedencia se excluyen del cómputo para división de turnos.
                </p>
              </div>

              {estado !== 'Activo' && (
                <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded border border-slate-800/80">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Fecha Inicio Estado</label>
                    <input 
                      type="date" 
                      value={fechaEstadoDesde} 
                      onChange={e => setFechaEstadoDesde(e.target.value)} 
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reincorporación (Opcional)</label>
                    <input 
                      type="date" 
                      value={fechaEstadoHasta} 
                      onChange={e => setFechaEstadoHasta(e.target.value)} 
                      placeholder="Hasta reincorporación"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Días Asuntos Propios (Saldo anual)</label>
                <input required type="number" min="0" value={apTotal} onChange={e => setApTotal(parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 mt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest rounded transition-colors shadow-lg shadow-indigo-600/20">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
