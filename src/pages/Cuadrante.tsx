import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Agente, Grupo, ConfiguracionAnual, ServicioExtraordinario, AusenciaJustificada, TipoAusencia } from '../types';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, differenceInDays, getHours, getMinutes, setHours, setMinutes, isWeekend, isAfter } from 'date-fns';
import { exportToGoogleSheets, syncToGoogleCalendar } from '../lib/google-workspace';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Download, FileSpreadsheet, CloudUpload, CalendarSync } from 'lucide-react';
import * as xlsx from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF to include autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => void;
}

export default function Cuadrante() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [config, setConfig] = useState<ConfiguracionAnual | null>(null);
  
  const [ausencias, setAusencias] = useState<AusenciaJustificada[]>([]);
  const [extras, setExtras] = useState<ServicioExtraordinario[]>([]);
  
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedCell, setSelectedCell] = useState<{agente: Agente, fecha: Date} | null>(null);
  const [activeTab, setActiveTab] = useState<'extra' | 'ausencia'>('extra');
  
  // Extra Form
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [motivo, setMotivo] = useState('');
  
  // Ausencia Form
  const [fechaFinAusencia, setFechaFinAusencia] = useState('');
  const [tipoAusencia, setTipoAusencia] = useState<TipoAusencia>('IT');

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentesSnap, gruposSnap, configSnap] = await Promise.all([
        getDocs(collection(db, 'agentes')),
        getDocs(collection(db, 'grupos')),
        getDoc(doc(db, 'configuracion', 'anual'))
      ]);
      
      setAgentes(agentesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Agente)));
      setGrupos(gruposSnap.docs.map(d => ({ ...d.data(), id: d.id } as Grupo)));
      if (configSnap.exists()) {
        setConfig(configSnap.data() as ConfiguracionAnual);
      }
      await loadEventosMes(currentDate);
    } catch (error) {
      console.error("Error cargando datos del cuadrante:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadEventosMes = async (date: Date) => {
    try {
      const [ausenciasSnap, extrasSnap] = await Promise.all([
        getDocs(collection(db, 'ausencias_justificadas')),
        getDocs(collection(db, 'servicios_extraordinarios'))
      ]);
      setAusencias(ausenciasSnap.docs.map(d => ({ ...d.data(), id: d.id } as AusenciaJustificada)));
      setExtras(extrasSnap.docs.map(d => ({ ...d.data(), id: d.id } as ServicioExtraordinario)));
    } catch (error) {
      console.error("Error cargando eventos:", error);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentDate]);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  const nextMonth = () => setCurrentDate(addDays(endOfMonth(currentDate), 1));
  const prevMonth = () => setCurrentDate(addDays(startOfMonth(currentDate), -1));

  // Lógica del 7x7
  const esDiaTrabajo = (agente: Agente, fecha: Date) => {
    const grupo = grupos.find(g => g.id === agente.id_grupo);
    if (!grupo) return false;
    
    const fechaPatron = parseISO(grupo.patron_inicio);
    const diff = differenceInDays(fecha, fechaPatron);
    
    // Si diff es negativo, hay que ajustar el módulo
    const ciclo = 14;
    let diaEnCiclo = diff % ciclo;
    if (diaEnCiclo < 0) diaEnCiclo += ciclo;
    
    // Primeros 7 días trabaja, siguientes 7 descansa
    return diaEnCiclo < 7;
  };

  const getAusenciaEnDia = (agenteId: string, fecha: Date) => {
    return ausencias.find(a => {
      if (a.id_agente !== agenteId) return false;
      const inicio = parseISO(a.fecha_inicio);
      const fin = parseISO(a.fecha_fin);
      // fecha >= inicio && fecha <= fin
      return differenceInDays(fecha, inicio) >= 0 && differenceInDays(fin, fecha) >= 0;
    });
  };

  const getExtrasEnDia = (agenteId: string, fecha: Date) => {
    return extras.filter(e => {
      if (e.id_agente !== agenteId) return false;
      const start = parseISO(e.fecha_inicio);
      return isSameDay(start, fecha);
    });
  };

  // Cálculo Económico
  const calcularCosteExtra = (agente: Agente, fInicio: Date, fFin: Date) => {
    if (!config) return 0;
    const tarifas = config.tarifas_extras[agente.categoria];
    if (!tarifas) return 0;

    let costeTotal = 0;
    // Simplificación MVP: Iterar por horas y asignar la tarifa correspondiente.
    // Esto es una aproximación. Para precisión exacta hay que calcular franjas.
    let iter = new Date(fInicio.getTime());
    while (isAfter(fFin, iter)) {
      const hora = iter.getHours();
      const esNocturna = hora >= 22 || hora < 6;
      
      const esFinDeSemana = isWeekend(iter);
      const fechaStr = format(iter, 'yyyy-MM-dd');
      const esFestivoDia = config.festivos.includes(fechaStr) || esFinDeSemana;

      let tarifaHora = 0;
      if (esFestivoDia) {
        tarifaHora = esNocturna ? tarifas.festivo_nocturna : tarifas.festivo_diurna;
      } else {
        tarifaHora = esNocturna ? tarifas.laborable_nocturna : tarifas.laborable_diurna;
      }
      
      // Fracciones de hora
      const diffMs = fFin.getTime() - iter.getTime();
      let fraccionHora = 1;
      if (diffMs < 3600000) {
        fraccionHora = diffMs / 3600000;
        iter = new Date(fFin.getTime()); // Salir del loop
      } else {
        iter.setHours(iter.getHours() + 1);
      }

      costeTotal += tarifaHora * fraccionHora;
    }
    
    return costeTotal;
  };

  const handleGuardarExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell || !horaInicio || !horaFin || !motivo) return;

    const [hI, mI] = horaInicio.split(':').map(Number);
    const [hF, mF] = horaFin.split(':').map(Number);

    const fechaInicioDate = new Date(selectedCell.fecha);
    fechaInicioDate.setHours(hI, mI, 0);
    
    const fechaFinDate = new Date(selectedCell.fecha);
    fechaFinDate.setHours(hF, mF, 0);
    // Si la hora de fin es menor que la de inicio, asumimos que cruza la medianoche
    if (hF < hI) {
      fechaFinDate.setDate(fechaFinDate.getDate() + 1);
    }

    const horasTotales = (fechaFinDate.getTime() - fechaInicioDate.getTime()) / 3600000;
    const coste = calcularCosteExtra(selectedCell.agente, fechaInicioDate, fechaFinDate);

    await addDoc(collection(db, 'servicios_extraordinarios'), {
      id_agente: selectedCell.agente.id,
      fecha_inicio: fechaInicioDate.toISOString(),
      fecha_fin: fechaFinDate.toISOString(),
      horas_totales: horasTotales,
      motivo,
      coste_calculado: coste
    });

    setSelectedCell(null);
    setHoraInicio('');
    setHoraFin('');
    setMotivo('');
    loadEventosMes(currentDate);
  };

  const handleGuardarAusencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell || !fechaFinAusencia) return;

    await addDoc(collection(db, 'ausencias_justificadas'), {
      id_agente: selectedCell.agente.id,
      fecha_inicio: format(selectedCell.fecha, 'yyyy-MM-dd'),
      fecha_fin: fechaFinAusencia,
      tipo: tipoAusencia,
      computa_horas: true
    });

    setSelectedCell(null);
    setFechaFinAusencia('');
    loadEventosMes(currentDate);
  };

  // Exportaciones
  const exportPDF = () => {
    const doc = new jsPDF('landscape') as jsPDFWithAutoTable;
    doc.text(`Cuadrante - ${format(currentDate, 'MMMM yyyy', {locale: es}).toUpperCase()}`, 14, 15);
    
    const headers = ['Agente', ...daysInMonth.map(d => format(d, 'd'))];
    const data = agentes.map(agente => {
      return [
        agente.nombre,
        ...daysInMonth.map(dia => {
          const aus = getAusenciaEnDia(agente.id!, dia);
          if (aus) return aus.tipo;
          if (esDiaTrabajo(agente, dia)) return 'T';
          return 'L';
        })
      ];
    });

    doc.autoTable({
      head: [headers],
      body: data,
      startY: 20,
      styles: { fontSize: 8, cellPadding: 1 },
      columnStyles: { 0: { cellWidth: 35 } }
    });

    doc.save(`cuadrante_${format(currentDate, 'yyyy_MM')}.pdf`);
  };

  const exportExcel = () => {
    const ws_data = [
      ['Agente', ...daysInMonth.map(d => format(d, 'd-MMM', {locale: es}))]
    ];
    
    agentes.forEach(agente => {
      const row = [agente.nombre];
      daysInMonth.forEach(dia => {
        const aus = getAusenciaEnDia(agente.id!, dia);
        if (aus) {
          row.push(aus.tipo);
        } else if (esDiaTrabajo(agente, dia)) {
          row.push('T');
        } else {
          row.push('L');
        }
      });
      ws_data.push(row);
    });

    const ws = xlsx.utils.aoa_to_sheet(ws_data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Cuadrante");
    xlsx.writeFile(wb, `cuadrante_${format(currentDate, 'yyyy_MM')}.xlsx`);
  };

  const handleExportSheets = async () => {
    try {
      const data = [
        ['Agente', ...daysInMonth.map(d => format(d, 'yyyy-MM-dd'))]
      ];
      agentes.forEach(agente => {
        const row = [agente.nombre];
        daysInMonth.forEach(dia => {
          const aus = getAusenciaEnDia(agente.id!, dia);
          if (aus) {
            row.push(aus.tipo);
          } else if (esDiaTrabajo(agente, dia)) {
            row.push('T');
          } else {
            row.push('L');
          }
        });
        data.push(row);
      });
      const url = await exportToGoogleSheets(data, `Cuadrante ${format(currentDate, 'MMMM yyyy', {locale: es})}`);
      window.open(url, '_blank');
    } catch (e) {
      console.error(e);
      alert('Error exportando a Sheets');
    }
  };

  const handleSyncCalendar = async () => {
    try {
      const events: any[] = [];
      agentes.forEach(agente => {
        daysInMonth.forEach(dia => {
          const aus = getAusenciaEnDia(agente.id!, dia);
          if (aus) return; // Optional: could also sync absences
          if (esDiaTrabajo(agente, dia)) {
            events.push({
              summary: `Turno: ${agente.nombre}`,
              start: format(dia, 'yyyy-MM-dd'),
              end: format(addDays(dia, 1), 'yyyy-MM-dd') // End date is exclusive in all-day events
            });
          }
        });
      });
      if (events.length === 0) {
        alert("No hay turnos para sincronizar");
        return;
      }
      const url = await syncToGoogleCalendar(events);
      window.open(url, '_blank');
    } catch (e) {
      console.error(e);
      alert('Error sincronizando con Calendar');
    }
  };

  if (loading) return <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest p-4">Cargando datos...</div>;

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-900 rounded border border-transparent hover:border-slate-800 transition-colors"><ChevronLeft size={16} /></button>
          <h1 className="text-[12px] font-bold text-slate-100 uppercase tracking-widest min-w-[150px] text-center">
            {format(currentDate, 'MMMM yyyy', {locale: es})}
          </h1>
          <button onClick={nextMonth} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-900 rounded border border-transparent hover:border-slate-800 transition-colors"><ChevronRight size={16}/></button>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportSheets} className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 px-3 py-1.5 rounded flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors" title="Exportar a Google Sheets">
            <CloudUpload size={14} /> Sheets
          </button>
          <button onClick={handleSyncCalendar} className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 px-3 py-1.5 rounded flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors" title="Sincronizar con Google Calendar">
            <CalendarSync size={14} /> Sincronizar
          </button>
          <button onClick={exportExcel} className="bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 px-3 py-1.5 rounded flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors">
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button onClick={exportPDF} className="bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 px-3 py-1.5 rounded flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors">
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded flex flex-col overflow-hidden flex-1 relative">
        <div className="overflow-x-auto overflow-y-auto h-full">
          <table className="w-full text-left font-mono text-[10px] border-collapse min-w-[800px]">
            <thead className="bg-slate-900 sticky top-0 z-20">
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="px-3 py-2 font-normal tracking-widest uppercase border-r border-slate-800 sticky left-0 bg-slate-900 z-30 w-48 shadow-[1px_0_0_0_#1e293b]">Agente</th>
                {daysInMonth.map(dia => {
                  const fStr = format(dia, 'yyyy-MM-dd');
                  const isFest = config?.festivos.includes(fStr);
                  const isWk = isWeekend(dia);
                  return (
                    <th key={dia.toString()} className={`px-1.5 py-2 text-center border-r border-slate-800 font-normal min-w-[36px] ${(isFest || isWk) ? 'bg-rose-500/10 text-rose-400' : 'text-slate-500'}`}>
                      <div className="text-[9px] uppercase">{format(dia, 'E', {locale: es}).charAt(0)}</div>
                      <div>{format(dia, 'd')}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {agentes.map((agente) => (
                <tr key={agente.id} className="border-b border-slate-800/50 hover:bg-indigo-500/5">
                  <td className="px-3 py-2 text-slate-300 border-r border-slate-800 sticky left-0 bg-slate-950 shadow-[1px_0_0_0_#1e293b] z-10 group-hover:bg-slate-900">
                    <div className="truncate font-bold text-indigo-400">{agente.nombre}</div>
                    <div className="text-[9px] text-slate-500 font-normal uppercase tracking-widest">{agente.categoria}</div>
                  </td>
                  {daysInMonth.map(dia => {
                    const trabaja = esDiaTrabajo(agente, dia);
                    const ausencia = getAusenciaEnDia(agente.id!, dia);
                    const extrasDelDia = getExtrasEnDia(agente.id!, dia);
                    
                    let bgColor = trabaja ? 'bg-indigo-500/10' : 'bg-transparent';
                    let textColor = trabaja ? 'text-indigo-400' : 'text-slate-700';
                    let content = trabaja ? 'T' : '';

                    if (ausencia) {
                      bgColor = ausencia.tipo === 'V' ? 'bg-amber-500/20' : 'bg-rose-500/20';
                      textColor = ausencia.tipo === 'V' ? 'text-amber-400' : 'text-rose-400';
                      content = ausencia.tipo;
                    }

                    const hasExtra = extrasDelDia.length > 0;

                    return (
                      <td 
                        key={dia.toString()} 
                        onClick={() => setSelectedCell({agente, fecha: dia})}
                        className={`border-r border-slate-800/50 text-center cursor-pointer hover:bg-slate-800 transition-colors relative ${bgColor} ${textColor}`}
                      >
                        {content}
                        {hasExtra && (
                          <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_4px_#34d399]" title={`Horas Extra: ${extrasDelDia.map(e => e.motivo).join(', ')}`} />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Unified */}
      {selectedCell && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded shadow-2xl w-full max-w-md flex flex-col">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-[12px] font-bold text-slate-100 uppercase tracking-widest">
                REGISTRAR_EVENTO - {format(selectedCell.fecha, 'dd/MM/yyyy')}
              </h2>
              <p className="text-[10px] font-mono text-slate-500">{selectedCell.agente.nombre} ({selectedCell.agente.categoria})</p>
            </div>
            
            <div className="flex border-b border-slate-800">
              <button 
                onClick={() => setActiveTab('extra')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'extra' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300 bg-slate-900/50'}`}
              >
                Horas Extras
              </button>
              <button 
                onClick={() => setActiveTab('ausencia')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'ausencia' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300 bg-slate-900/50'}`}
              >
                Ausencia
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {activeTab === 'extra' ? (
                <form onSubmit={handleGuardarExtra} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Hora Inicio</label>
                      <input required type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Hora Fin</label>
                      <input required type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Motivo (Para Intervención)</label>
                    <input required type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Refuerzo evento local" className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" />
                  </div>
                  
                  {horaInicio && horaFin && (
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800 text-[10px] font-mono text-slate-500 border-l-2 border-l-emerald-500">
                      El cálculo económico aplicará recargos de nocturnidad (22h-06h) y festividad automáticamente según la categoría.
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 mt-2">
                    <button type="button" onClick={() => setSelectedCell(null)} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
                    <button type="submit" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest rounded transition-colors">Guardar Extra</button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleGuardarAusencia} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tipo de Ausencia</label>
                    <select required value={tipoAusencia} onChange={e => setTipoAusencia(e.target.value as TipoAusencia)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500">
                      <option value="IT">BAJA MÉDICA (IT)</option>
                      <option value="AP">ASUNTOS PROPIOS (AP)</option>
                      <option value="J">JUICIO (J)</option>
                      <option value="V">VACACIONES (V)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha Inicio</label>
                      <input disabled type="date" value={format(selectedCell.fecha, 'yyyy-MM-dd')} className="w-full border border-slate-800 bg-slate-900 rounded px-3 py-1.5 text-[11px] font-mono text-slate-500 cursor-not-allowed [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha Fin (Inclusive)</label>
                      <input required type="date" min={format(selectedCell.fecha, 'yyyy-MM-dd')} value={fechaFinAusencia} onChange={e => setFechaFinAusencia(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" />
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 mt-2">
                    <button type="button" onClick={() => setSelectedCell(null)} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
                    <button type="submit" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest rounded transition-colors">Registrar Ausencia</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
