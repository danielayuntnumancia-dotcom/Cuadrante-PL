import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Agente, Grupo, ConfiguracionAnual, ServicioExtraordinario, AusenciaJustificada, TurnoImportado } from '../types';
import { calcularComputoAnualPlantilla, EstadisticasAnualesAgente, ResumenGlobalPlantilla } from '../lib/calculoHoras';
import { 
  Calendar, Clock, Users, ArrowUpRight, ArrowDownRight, 
  Download, FileSpreadsheet, ChevronLeft, ChevronRight, 
  Search, Filter, CheckCircle2, AlertCircle, X, Shield, 
  PieChart, BarChart2, TrendingUp, Sparkles, Layers, Info
} from 'lucide-react';
import * as xlsx from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => void;
}

export default function ComputoAnual() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [jornadaReferencia, setJornadaReferencia] = useState<number>(1540); // Horas estándar anuales
  
  // Data state
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [config, setConfig] = useState<ConfiguracionAnual | null>(null);
  const [ausencias, setAusencias] = useState<AusenciaJustificada[]>([]);
  const [extras, setExtras] = useState<ServicioExtraordinario[]>([]);
  const [turnosImportados, setTurnosImportados] = useState<TurnoImportado[]>([]);
  
  // UI filters & loading
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrupoFilter, setSelectedGrupoFilter] = useState('ALL');
  
  // Modal de detalle
  const [selectedAgenteStats, setSelectedAgenteStats] = useState<EstadisticasAnualesAgente | null>(null);

  // Cargar datos
  const loadData = async () => {
    setLoading(true);
    try {
      const [agentesSnap, gruposSnap, configSnap, ausenciasSnap, extrasSnap, turnosImpSnap] = await Promise.all([
        getDocs(collection(db, 'agentes')),
        getDocs(collection(db, 'grupos')),
        getDoc(doc(db, 'configuracion', 'anual')),
        getDocs(collection(db, 'ausencias_justificadas')),
        getDocs(collection(db, 'servicios_extraordinarios')),
        getDocs(collection(db, 'turnos_importados'))
      ]);

      setAgentes(agentesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Agente)));
      setGrupos(gruposSnap.docs.map(d => ({ ...d.data(), id: d.id } as Grupo)));
      if (configSnap.exists()) setConfig(configSnap.data() as ConfiguracionAnual);
      setAusencias(ausenciasSnap.docs.map(d => ({ ...d.data(), id: d.id } as AusenciaJustificada)));
      setExtras(extrasSnap.docs.map(d => ({ ...d.data(), id: d.id } as ServicioExtraordinario)));
      setTurnosImportados(turnosImpSnap.docs.map(d => ({ ...d.data(), id: d.id } as TurnoImportado)));
    } catch (error) {
      console.error("Error cargando datos para cómputo anual:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Cómputo global memorizado
  const resumenGlobal: ResumenGlobalPlantilla = useMemo(() => {
    return calcularComputoAnualPlantilla(
      selectedYear,
      agentes,
      grupos,
      config,
      ausencias,
      extras,
      turnosImportados,
      jornadaReferencia
    );
  }, [selectedYear, agentes, grupos, config, ausencias, extras, turnosImportados, jornadaReferencia]);

  // Filtrado de agentes
  const agentesFiltrados = useMemo(() => {
    return resumenGlobal.agentesStats.filter(item => {
      const matchSearch = 
        item.agente.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.agente.placa.includes(searchTerm);
      
      const matchGrupo = 
        selectedGrupoFilter === 'ALL' || item.agente.id_grupo === selectedGrupoFilter;

      return matchSearch && matchGrupo;
    });
  }, [resumenGlobal, searchTerm, selectedGrupoFilter]);

  // Si el modal de detalle está abierto, sincronizar con el cálculo actualizado
  useEffect(() => {
    if (selectedAgenteStats) {
      const updated = resumenGlobal.agentesStats.find(a => a.agente.id === selectedAgenteStats.agente.id);
      if (updated) setSelectedAgenteStats(updated);
    }
  }, [resumenGlobal]);

  // Exportar Excel
  const exportarExcel = () => {
    const data = [
      [`CÓMPUTO ANUAL DE HORAS Y JORNADAS - AÑO ${selectedYear}`],
      [`Jornada de referencia anual: ${jornadaReferencia} horas`],
      [],
      [
        'TIP', 'Agente', 'Categoría', 'Grupo', 
        'Días Realizados', 'Días Previstos', 'Días Totales',
        'Horas Realizadas', 'Horas Previstas', 'Horas Extra', 'Horas Totales',
        'Jornada Ref.', 'Balance (Horas)', '% Año Realizado',
        'AP Usados', 'Vacaciones (Días)', 'Bajas Médicas IT'
      ]
    ];

    resumenGlobal.agentesStats.forEach(item => {
      data.push([
        item.agente.placa,
        item.agente.nombre,
        item.agente.categoria,
        item.grupoNombre,
        item.diasRealizados as any,
        item.diasPrevistos as any,
        item.diasTotales as any,
        item.horasRealizadas as any,
        item.horasPrevistas as any,
        item.horasExtra as any,
        item.horasTotales as any,
        item.jornadaAnualReferencia as any,
        item.balanceHoras as any,
        `${item.porcentajeRealizado}%` as any,
        item.desgloseAusencias.ap.total as any,
        item.desgloseAusencias.vacaciones.total as any,
        item.desgloseAusencias.it.total as any
      ]);
    });

    const ws = xlsx.utils.aoa_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, `Computo_${selectedYear}`);
    xlsx.writeFile(wb, `computo_anual_${selectedYear}.xlsx`);
  };

  // Exportar PDF
  const exportarPDF = () => {
    const doc = new jsPDF('landscape') as jsPDFWithAutoTable;
    doc.setFontSize(14);
    doc.text(`INFORME ANUAL DE CÓMPUTO DE JORNADAS Y HORAS - ${selectedYear}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Jornada laboral de referencia: ${jornadaReferencia} horas | Fecha de emisión: ${new Date().toLocaleDateString()}`, 14, 21);

    const headers = [
      'TIP', 'Agente', 'Grupo', 
      'Días Real.', 'Días Prev.', 'Días Tot.',
      'Horas Real.', 'Horas Prev.', 'H. Extra', 'Horas Tot.',
      'Balance', '% Real.'
    ];

    const body = resumenGlobal.agentesStats.map(item => [
      `#${item.agente.placa}`,
      item.agente.nombre,
      item.grupoNombre,
      item.diasRealizados,
      item.diasPrevistos,
      item.diasTotales,
      `${item.horasRealizadas}h`,
      `${item.horasPrevistas}h`,
      `${item.horasExtra}h`,
      `${item.horasTotales}h`,
      `${item.balanceHoras >= 0 ? '+' : ''}${item.balanceHoras}h`,
      `${item.porcentajeRealizado}%`
    ]);

    doc.autoTable({
      head: [headers],
      body: body,
      startY: 26,
      styles: { fontSize: 8, cellPadding: 2, font: 'helvetica' },
      headStyles: { fillColor: [30, 41, 59], textColor: [248, 250, 252] },
      alternateRowStyles: { fillColor: [241, 245, 249] }
    });

    doc.save(`informe_computo_${selectedYear}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 font-mono text-[11px] uppercase tracking-widest">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          Calculando balance anual y jornadas...
        </div>
      </div>
    );
  }

  const esAñoActual = selectedYear === currentYear;
  const esAñoPasado = selectedYear < currentYear;
  const esAñoFuturo = selectedYear > currentYear;

  return (
    <div className="space-y-6 flex flex-col h-full font-sans text-slate-300">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-4 rounded border border-slate-800 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-400" />
            <h1 className="text-sm font-bold text-slate-100 uppercase tracking-widest">
              Cómputo Anual de Días y Horas
            </h1>
          </div>
          <p className="text-[11px] font-mono text-slate-500 mt-1">
            {esAñoActual && "Análisis del año en curso: jornadas efectivamente realizadas hasta hoy y estimación prevista hasta fin de año."}
            {esAñoPasado && "Histórico cerrado: todas las jornadas y horas computadas como efectivamente realizadas."}
            {esAñoFuturo && "Planificación futura: 100% de jornadas y horas proyectadas según el patrón y cuadrante."}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Año */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded p-1">
            <button 
              onClick={() => setSelectedYear(prev => prev - 1)}
              className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded transition-colors"
              title="Año anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-3 flex items-center gap-1.5 font-mono text-xs font-bold text-slate-200">
              <Calendar size={14} className="text-indigo-400" />
              <span>{selectedYear}</span>
              {esAñoActual && (
                <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[9px] px-1.5 py-0.2 rounded font-normal ml-1">
                  En curso
                </span>
              )}
            </div>
            <button 
              onClick={() => setSelectedYear(prev => prev + 1)}
              className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded transition-colors"
              title="Año siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Configuración Jornada Convenio */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[11px] font-mono">
            <Clock size={14} className="text-slate-500" />
            <span className="text-slate-500">Ref:</span>
            <input 
              type="number" 
              value={jornadaReferencia}
              onChange={e => setJornadaReferencia(Number(e.target.value) || 0)}
              className="w-16 bg-transparent text-slate-200 font-bold text-center outline-none border-b border-slate-700 focus:border-indigo-500"
              title="Horas de jornada anual de convenio"
            />
            <span className="text-slate-500">h</span>
          </div>

          {/* Exportaciones */}
          <button 
            onClick={exportarExcel}
            className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 px-3 py-1.5 rounded flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
            title="Descargar datos en Excel"
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button 
            onClick={exportarPDF}
            className="bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 px-3 py-1.5 rounded flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
            title="Generar informe en PDF"
          >
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      {/* KPI Cards Globales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Días */}
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Días Trabajados</span>
            <div className="p-1.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Calendar size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-mono font-bold text-slate-100">
              {resumenGlobal.totalDiasTrabajados} <span className="text-xs text-slate-500 font-normal">días</span>
            </div>
            <div className="flex items-center gap-2 mt-2 font-mono text-[10px]">
              <span className="text-sky-400 font-semibold">{resumenGlobal.totalDiasRealizados} realizados</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">{resumenGlobal.totalDiasPrevistos} previstos</span>
            </div>
          </div>
        </div>

        {/* Total Horas Ordinarias */}
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Horas Ordinarias</span>
            <div className="p-1.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-mono font-bold text-indigo-300">
              {resumenGlobal.totalHorasRealizadas + resumenGlobal.totalHorasPrevistas} <span className="text-xs text-slate-500 font-normal">horas</span>
            </div>
            <div className="flex items-center gap-2 mt-2 font-mono text-[10px]">
              <span className="text-indigo-400 font-semibold">{resumenGlobal.totalHorasRealizadas}h realizadas</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">{resumenGlobal.totalHorasPrevistas}h previas</span>
            </div>
          </div>
        </div>

        {/* Horas Extraordinarias */}
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Servicios Extraordinarios</span>
            <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Sparkles size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-mono font-bold text-emerald-400">
              +{resumenGlobal.totalHorasExtra} <span className="text-xs text-slate-500 font-normal">horas</span>
            </div>
            <div className="flex items-center gap-2 mt-2 font-mono text-[10px]">
              <span className="text-emerald-400/80">Refuerzos e intervenciones especiales</span>
            </div>
          </div>
        </div>

        {/* Permisos y Ausencias */}
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Permisos y Ausencias</span>
            <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Layers size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-mono font-bold text-slate-100">
              {resumenGlobal.totalAPConsumidos + resumenGlobal.totalVacacionesConsumidas + resumenGlobal.totalBajasIT} <span className="text-xs text-slate-500 font-normal">días</span>
            </div>
            <div className="flex items-center gap-2 mt-2 font-mono text-[10px]">
              <span className="text-amber-400">{resumenGlobal.totalAPConsumidos} AP</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-300">{resumenGlobal.totalVacacionesConsumidas} Vac.</span>
              <span className="text-slate-600">•</span>
              <span className="text-rose-400">{resumenGlobal.totalBajasIT} IT</span>
            </div>
          </div>
        </div>

      </div>

      {/* Tabla de Agentes & Filtros */}
      <div className="bg-slate-900/50 border border-slate-800 rounded flex flex-col overflow-hidden flex-1 shadow-xl">
        
        {/* Barra de Filtros */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text"
                placeholder="Buscar por agente o TIP..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded pl-9 pr-3 py-1.5 text-[11px] font-mono text-slate-200 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-500" />
            <select
              value={selectedGrupoFilter}
              onChange={e => setSelectedGrupoFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
            >
              <option value="ALL">TODOS LOS GRUPOS</option>
              {grupos.map(g => (
                <option key={g.id} value={g.id}>{g.nombre.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabla Principal */}
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left font-mono text-[10px] border-collapse min-w-[950px]">
            <thead className="bg-slate-900/90 sticky top-0 z-10 text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold">TIP</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold">Agente</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold">Grupo</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center bg-sky-950/20">Días Realiz.</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center bg-sky-950/20">Días Prev.</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center bg-sky-950/20">Días Tot.</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center bg-indigo-950/20">Horas Realiz.</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center bg-indigo-950/20">Horas Prev.</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center bg-emerald-950/20">H. Extra</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center bg-indigo-950/30">Total Horas</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center">Balance</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-center min-w-[130px]">% Año</th>
                <th className="px-3 py-2.5 uppercase tracking-widest font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {agentesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-8 text-slate-500 font-mono">
                    No se han encontrado agentes que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                agentesFiltrados.map((item) => {
                  const balance = item.balanceHoras;
                  const isPositive = balance >= 0;

                  return (
                    <tr key={item.agente.id} className="hover:bg-indigo-500/5 transition-colors group">
                      
                      {/* TIP */}
                      <td className="px-3 py-2.5 text-indigo-400 font-bold whitespace-nowrap">
                        #{item.agente.placa}
                      </td>

                      {/* Agente */}
                      <td className="px-3 py-2.5 text-slate-200 font-bold whitespace-nowrap">
                        <div>{item.agente.nombre}</div>
                        <div className="text-[9px] text-slate-500 font-normal uppercase tracking-wider">{item.agente.categoria}</div>
                      </td>

                      {/* Grupo */}
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-semibold text-slate-300">
                          {item.grupoNombre}
                        </span>
                      </td>

                      {/* Días Realizados */}
                      <td className="px-3 py-2.5 text-center font-bold text-sky-400 bg-sky-950/10">
                        {item.diasRealizados}
                      </td>

                      {/* Días Previstos */}
                      <td className="px-3 py-2.5 text-center text-slate-400 bg-sky-950/10">
                        {item.diasPrevistos}
                      </td>

                      {/* Días Totales */}
                      <td className="px-3 py-2.5 text-center font-bold text-slate-200 bg-sky-950/20">
                        {item.diasTotales}
                      </td>

                      {/* Horas Realizadas */}
                      <td className="px-3 py-2.5 text-center font-bold text-indigo-300 bg-indigo-950/10">
                        {item.horasRealizadas}h
                      </td>

                      {/* Horas Previstas */}
                      <td className="px-3 py-2.5 text-center text-slate-400 bg-indigo-950/10">
                        {item.horasPrevistas}h
                      </td>

                      {/* Horas Extra */}
                      <td className="px-3 py-2.5 text-center font-bold text-emerald-400 bg-emerald-950/10">
                        {item.horasExtra > 0 ? `+${item.horasExtra}h` : '-'}
                      </td>

                      {/* Total Horas */}
                      <td className="px-3 py-2.5 text-center font-bold text-slate-100 bg-indigo-950/30 text-xs">
                        {item.horasTotales}h
                      </td>

                      {/* Balance Horario */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap font-bold">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          isPositive 
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}>
                          {isPositive ? `+${balance}h` : `${balance}h`}
                        </span>
                      </td>

                      {/* % Año Progreso */}
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all"
                              style={{ width: `${Math.min(item.porcentajeRealizado, 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-bold text-slate-400">{item.porcentajeRealizado}%</span>
                        </div>
                      </td>

                      {/* Acción */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedAgenteStats(item)}
                          className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded text-[9px] uppercase tracking-wider font-bold transition-all flex items-center gap-1 ml-auto"
                        >
                          <BarChart2 size={12} /> Detalle
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle por Agente */}
      {selectedAgenteStats && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-bold font-mono text-sm">
                  #{selectedAgenteStats.agente.placa}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                    {selectedAgenteStats.agente.nombre}
                  </h2>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5">
                    <span>{selectedAgenteStats.agente.categoria}</span>
                    <span>•</span>
                    <span className="text-indigo-400 font-semibold">{selectedAgenteStats.grupoNombre}</span>
                    <span>•</span>
                    <span>Año {selectedYear}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setSelectedAgenteStats(null)}
                className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Tarjetas Resumen Agente */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 p-3 rounded">
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Días Trabajados</div>
                  <div className="text-xl font-mono font-bold text-sky-400 mt-1">
                    {selectedAgenteStats.diasTotales} <span className="text-[10px] text-slate-500 font-normal">días</span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 mt-1">
                    {selectedAgenteStats.diasRealizados} real. / {selectedAgenteStats.diasPrevistos} prev.
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-3 rounded">
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Horas Ordinarias</div>
                  <div className="text-xl font-mono font-bold text-indigo-400 mt-1">
                    {selectedAgenteStats.horasRealizadas + selectedAgenteStats.horasPrevistas} <span className="text-[10px] text-slate-500 font-normal">h</span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 mt-1">
                    {selectedAgenteStats.horasRealizadas}h real. / {selectedAgenteStats.horasPrevistas}h prev.
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-3 rounded">
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Horas Extras</div>
                  <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                    +{selectedAgenteStats.horasExtra} <span className="text-[10px] text-slate-500 font-normal">h</span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 mt-1">
                    Servicios extraordinarios
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-3 rounded">
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Balance Anual</div>
                  <div className={`text-xl font-mono font-bold mt-1 ${selectedAgenteStats.balanceHoras >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedAgenteStats.balanceHoras >= 0 ? `+${selectedAgenteStats.balanceHoras}` : selectedAgenteStats.balanceHoras} <span className="text-[10px] text-slate-500 font-normal">h</span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 mt-1">
                    Ref. convenio {selectedAgenteStats.jornadaAnualReferencia}h
                  </div>
                </div>
              </div>

              {/* Desglose de Turnos y Ausencias */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Desglose Turnos */}
                <div className="bg-slate-950/40 border border-slate-800 p-4 rounded">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <PieChart size={14} className="text-sky-400" /> Distribución de Turnos Ordinarios
                  </h3>
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between items-center bg-slate-900/80 p-2 rounded border border-slate-800/80">
                      <span className="text-sky-400 font-bold">Mañanas (M):</span>
                      <span className="text-slate-200">
                        {selectedAgenteStats.desgloseTurnos.realizados.M} real. / {selectedAgenteStats.desgloseTurnos.previstos.M} prev. 
                        <strong className="text-white ml-1">({selectedAgenteStats.desgloseTurnos.realizados.M + selectedAgenteStats.desgloseTurnos.previstos.M} tot.)</strong>
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/80 p-2 rounded border border-slate-800/80">
                      <span className="text-amber-400 font-bold">Tardes (T):</span>
                      <span className="text-slate-200">
                        {selectedAgenteStats.desgloseTurnos.realizados.T} real. / {selectedAgenteStats.desgloseTurnos.previstos.T} prev.
                        <strong className="text-white ml-1">({selectedAgenteStats.desgloseTurnos.realizados.T + selectedAgenteStats.desgloseTurnos.previstos.T} tot.)</strong>
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/80 p-2 rounded border border-slate-800/80">
                      <span className="text-indigo-400 font-bold">Noches (N):</span>
                      <span className="text-slate-200">
                        {selectedAgenteStats.desgloseTurnos.realizados.N} real. / {selectedAgenteStats.desgloseTurnos.previstos.N} prev.
                        <strong className="text-white ml-1">({selectedAgenteStats.desgloseTurnos.realizados.N + selectedAgenteStats.desgloseTurnos.previstos.N} tot.)</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Desglose Ausencias y Permisos */}
                <div className="bg-slate-950/40 border border-slate-800 p-4 rounded">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Layers size={14} className="text-amber-400" /> Permisos y Ausencias Justificadas
                  </h3>
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between items-center bg-slate-900/80 p-2 rounded border border-slate-800/80">
                      <span className="text-amber-400 font-bold">Asuntos Propios (AP):</span>
                      <span className="text-slate-200">
                        {selectedAgenteStats.desgloseAusencias.ap.total} días consumidos
                        <span className="text-slate-500 ml-1">(de {selectedAgenteStats.agente.asuntos_propios_total || 6} totales)</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/80 p-2 rounded border border-slate-800/80">
                      <span className="text-amber-300 font-bold">Vacaciones Anuales (V):</span>
                      <span className="text-slate-200">
                        {selectedAgenteStats.desgloseAusencias.vacaciones.total} días
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/80 p-2 rounded border border-slate-800/80">
                      <span className="text-rose-400 font-bold">Bajas Médicas (IT):</span>
                      <span className="text-slate-200">
                        {selectedAgenteStats.desgloseAusencias.it.total} días
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Tabla de Desglose Mensual (12 Meses) */}
              <div className="bg-slate-950 border border-slate-800 rounded overflow-hidden">
                <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                    Desglose Mes a Mes (Enero - Diciembre {selectedYear})
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[10px] border-collapse">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2 uppercase tracking-widest">Mes</th>
                        <th className="px-2 py-2 text-center">Días Real.</th>
                        <th className="px-2 py-2 text-center">Días Prev.</th>
                        <th className="px-2 py-2 text-center">Días Tot.</th>
                        <th className="px-2 py-2 text-center">Horas Real.</th>
                        <th className="px-2 py-2 text-center">Horas Prev.</th>
                        <th className="px-2 py-2 text-center">H. Extra</th>
                        <th className="px-2 py-2 text-center font-bold text-slate-200">Total Horas</th>
                        <th className="px-2 py-2 text-center">AP</th>
                        <th className="px-2 py-2 text-center">Vac.</th>
                        <th className="px-2 py-2 text-center">IT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedAgenteStats.meses.map((m) => (
                        <tr key={m.mes} className="hover:bg-slate-900/60 transition-colors">
                          <td className="px-3 py-2 font-bold text-slate-300">{m.nombreMes}</td>
                          <td className="px-2 py-2 text-center text-sky-400 font-bold">{m.diasRealizados || '-'}</td>
                          <td className="px-2 py-2 text-center text-slate-400">{m.diasPrevistos || '-'}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-200">{m.diasTotales || '-'}</td>
                          <td className="px-2 py-2 text-center text-indigo-300 font-bold">{m.horasRealizadas ? `${m.horasRealizadas}h` : '-'}</td>
                          <td className="px-2 py-2 text-center text-slate-400">{m.horasPrevistas ? `${m.horasPrevistas}h` : '-'}</td>
                          <td className="px-2 py-2 text-center text-emerald-400 font-bold">{m.horasExtra ? `+${m.horasExtra}h` : '-'}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-100 bg-indigo-950/20">{m.horasTotales ? `${m.horasTotales}h` : '-'}</td>
                          <td className="px-2 py-2 text-center text-amber-400">{m.apDias || '-'}</td>
                          <td className="px-2 py-2 text-center text-amber-300">{m.vacacionesDias || '-'}</td>
                          <td className="px-2 py-2 text-center text-rose-400">{m.itDias || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedAgenteStats(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-widest rounded transition-colors"
              >
                Cerrar Detalle
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
