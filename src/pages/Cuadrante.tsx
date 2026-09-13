import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, getDoc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Agente, Grupo, ConfiguracionAnual, ServicioExtraordinario, AusenciaJustificada, TipoAusencia, VigenciaCuadrante, TurnoImportado, getEstadoAgenteEnFecha, DiaSinServicio } from '../types';
import { parseExcelCuadrante, ImportResult } from '../lib/excelParser';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, differenceInDays, isWeekend, isAfter, getISOWeek } from 'date-fns';
import { exportToGoogleSheets } from '../lib/google-workspace';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ChevronDown, Download, FileSpreadsheet, CloudUpload, ArrowLeftRight, RotateCcw, Upload, Calendar } from 'lucide-react';
import * as xlsx from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF to include autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => void;
}

const MESES_LISTA = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function Cuadrante() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [config, setConfig] = useState<ConfiguracionAnual | null>(null);
  
  const [ausencias, setAusencias] = useState<AusenciaJustificada[]>([]);
  const [extras, setExtras] = useState<ServicioExtraordinario[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [changingMonth, setChangingMonth] = useState(false);
  // State Importación
  const [turnosImportados, setTurnosImportados] = useState<TurnoImportado[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importando, setImportando] = useState(false);
  const [nuevoTurnoManual, setNuevoTurnoManual] = useState('');

  // State Navegación Rápida de Mes
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentDate.getFullYear());

  
  // Modal State
  const [selectedCell, setSelectedCell] = useState<{agente: Agente, fecha: Date} | null>(null);
  const [activeTab, setActiveTab] = useState<'extra' | 'ausencia' | 'cambio'>('extra');
  
  // Extra Form
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [motivo, setMotivo] = useState('');
  
  // Ausencia Form
  const [fechaFinAusencia, setFechaFinAusencia] = useState('');
  const [tipoAusencia, setTipoAusencia] = useState<TipoAusencia>('IT');

  // Cambio Manual Form
  const [modTurno, setModTurno] = useState<'M' | 'T' | 'N' | 'L'>('M');
  const [modMotivo, setModMotivo] = useState<'voluntario_companeros' | 'necesidades_servicio' | 'ayuntamiento' | 'otro'>('voluntario_companeros');
  const [modObs, setModObs] = useState('');

  // Modal Cambio de Ciclo
  const [isCambioCicloModalOpen, setIsCambioCicloModalOpen] = useState(false);
  const [selectedGrupoCicloId, setSelectedGrupoCicloId] = useState('');
  const [fechaCambioCiclo, setFechaCambioCiclo] = useState('');
  const [cambioCicloActivo, setCambioCicloActivo] = useState(true);
  const [guardandoCiclo, setGuardandoCiclo] = useState(false);

  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  const loadInitialData = async () => {
    try {
      const [agentesSnap, gruposSnap, configSnap, ausenciasSnap, extrasSnap] = await Promise.all([
        getDocs(collection(db, 'agentes')),
        getDocs(collection(db, 'grupos')),
        getDoc(doc(db, 'configuracion', 'anual')),
        getDocs(collection(db, 'ausencias_justificadas')),
        getDocs(collection(db, 'servicios_extraordinarios'))
      ]);
      
      setAgentes(agentesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Agente)));
      setGrupos(gruposSnap.docs.map(d => ({ ...d.data(), id: d.id } as Grupo)));
      if (configSnap.exists()) setConfig(configSnap.data() as ConfiguracionAnual);
      
      setAusencias(ausenciasSnap.docs.map(d => ({ ...d.data(), id: d.id } as AusenciaJustificada)));
      setExtras(extrasSnap.docs.map(d => ({ ...d.data(), id: d.id } as ServicioExtraordinario)));
      setInitialDataLoaded(true);
    } catch (error) {
      console.error("Error cargando datos iniciales:", error);
    }
  };

  const loadMonthData = async (date: Date) => {
    try {
      const mesAnio = format(date, 'yyyy-MM');
      const turnosImportadosSnap = await getDocs(query(collection(db, 'turnos_importados'), where('mes_anio', '==', mesAnio)));
      setTurnosImportados(turnosImportadosSnap.docs.map(d => ({ ...d.data(), id: d.id } as TurnoImportado)));
    } catch (error) {
      console.error("Error cargando datos del mes:", error);
    }
  };
  
  // Para compatibilidad con otras partes que llaman a loadEventosMes o loadData
  const loadData = async () => {
    setLoading(true);
    await loadInitialData();
    await loadMonthData(currentDate);
    setLoading(false);
  };
  
  const loadEventosMes = async (date: Date) => {
    // Si se añade un evento manual nuevo
    const [ausenciasSnap, extrasSnap] = await Promise.all([
      getDocs(collection(db, 'ausencias_justificadas')),
      getDocs(collection(db, 'servicios_extraordinarios'))
    ]);
    setAusencias(ausenciasSnap.docs.map(d => ({ ...d.data(), id: d.id } as AusenciaJustificada)));
    setExtras(extrasSnap.docs.map(d => ({ ...d.data(), id: d.id } as ServicioExtraordinario)));
    await loadMonthData(date);
  };

  useEffect(() => {
    if (!initialDataLoaded) {
      loadData();
    } else {
      setChangingMonth(true);
      loadMonthData(currentDate).finally(() => setChangingMonth(false));
    }
  }, [currentDate]);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  const nextMonth = () => setCurrentDate(addDays(endOfMonth(currentDate), 1));
  const prevMonth = () => setCurrentDate(addDays(startOfMonth(currentDate), -1));

  // Obtener la vigencia temporal activa para un grupo en una fecha determinada
  const getVigenciaActiva = (grupo: Grupo, fecha: Date): VigenciaCuadrante | null => {
    if (!grupo.vigencias || grupo.vigencias.length === 0) return null;
    const fechaStr = format(fecha, 'yyyy-MM-dd');
    const validas = grupo.vigencias
      .filter(v => v.fecha_desde <= fechaStr)
      .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde));
    if (validas.length === 0) return null;
    return validas[validas.length - 1];
  };

  const getAsignacionJornada = (agente: Agente, fecha: Date) => {
    if (!agente.asignaciones_jornada) return null;
    const fechaStr = format(fecha, 'yyyy-MM-dd');
    return agente.asignaciones_jornada.find(a => {
      const startOk = fechaStr >= a.fecha_desde;
      const endOk = !a.fecha_hasta || fechaStr <= a.fecha_hasta;
      return startOk && endOk;
    });
  };

  const getModificacionTurno = (agente: Agente, fecha: Date) => {
    if (!agente.modificaciones_turno) return null;
    const fechaStr = format(fecha, 'yyyy-MM-dd');
    return agente.modificaciones_turno.find(m => m.fecha === fechaStr);
  };

  // Lógica de si el agente trabaja en una fecha dada
  const esDiaTrabajo = (agente: Agente, fecha: Date) => {
    const mod = getModificacionTurno(agente, fecha);
    if (mod) return mod.turno !== 'L';

    const fechaStr = format(fecha, 'yyyy-MM-dd');
    if (agente.fecha_incorporacion && fechaStr < agente.fecha_incorporacion) {
      return false;
    }

    const asignacion = getAsignacionJornada(agente, fecha);
    
    // Si la asignación es una Jornada Especial
    if (asignacion && asignacion.tipo_jornada === 'ESPECIAL' && asignacion.id_jornada_especial) {
      const jornada = config?.jornadas_especiales?.find(j => j.id === asignacion.id_jornada_especial);
      if (jornada) {
        const refDate = parseISO(asignacion.fecha_desde);
        const refWeek = getISOWeek(refDate);
        const currentWeek = getISOWeek(fecha);
        const isSemanaA = (currentWeek % 2) === (refWeek % 2);
        const dow = fecha.getDay(); // 0: Dom, 1: Lun...

        if (jornada.tipo_alternancia === 'FIJA') {
          return jornada.dias_fijos?.includes(dow) ?? false;
        } else {
          if (isSemanaA) {
            return jornada.dias_semana_a?.includes(dow) ?? false;
          } else {
            return jornada.dias_semana_b?.includes(dow) ?? false;
          }
        }
      }
    }

    const grupoId = asignacion?.id_grupo || agente.id_grupo;
    const grupo = grupos.find(g => g.id === grupoId);
    if (!grupo) return false;
    
    const vigencia = getVigenciaActiva(grupo, fecha);
    const fechaPatronStr = vigencia?.patron_inicio || grupo.patron_inicio;
    const fechaPatron = parseISO(fechaPatronStr);
    const diff = differenceInDays(fecha, fechaPatron);
    
    const ciclo = 14;
    let diaEnCiclo = diff % ciclo;
    if (diaEnCiclo < 0) diaEnCiclo += ciclo;
    
    let trabaja = diaEnCiclo < 7;

    // Evaluar cambio de ciclo / inversión
    if (vigencia) {
      if (vigencia.invertir_ciclo) {
        trabaja = !trabaja;
      }
    } else if (grupo.cambio_ciclo_activo && grupo.fecha_cambio_ciclo) {
      const fechaCorte = parseISO(grupo.fecha_cambio_ciclo);
      if (differenceInDays(fecha, fechaCorte) >= 0) {
        trabaja = !trabaja;
      }
    }

    return trabaja;
  };

  // Cálculo del turno Mañana / Tarde (M / T) con regla de >= 4 agentes y rotación
  const getTurnoAgente = (agente: Agente, fecha: Date): 'M' | 'T' | 'N' | '' => {
    const mod = getModificacionTurno(agente, fecha);
    if (mod && mod.turno !== 'L') return mod.turno;

    const asignacion = getAsignacionJornada(agente, fecha);
    
    if (asignacion && asignacion.tipo_jornada === 'ESPECIAL' && asignacion.id_jornada_especial) {
      const jornada = config?.jornadas_especiales?.find(j => j.id === asignacion.id_jornada_especial);
      if (jornada && jornada.turno_base !== 'AUTO_REFUERZO') {
        return jornada.turno_base;
      }
    }

    const grupoId = asignacion?.id_grupo || agente.id_grupo;
    const grupo = grupos.find(g => g.id === grupoId);
    if (!grupo) return 'M';

    // Cobertura de vacaciones cruzada entre grupos
    // Si este mes es el mes de vacaciones de OTRO grupo y division_semanal_vacaciones está activa,
    // determinar el turno por semana del mes (sin depender de cómo estén configuradas las parejas).
    // Semanas impares (1 y 3: días 1-7, 15-21) → turno_semana_natural
    // Semanas pares  (2 y 4: días 8-14, 22+)  → turno_semana_cobertura
    const divisionVac = config?.reglas_turnos?.division_semanal_vacaciones ?? true;
    if (divisionVac && config?.plan_vacaciones) {
      const mesNum = fecha.getMonth() + 1;
      const otroGrupoEnVacaciones = config.plan_vacaciones.find(
        p => p.id_grupo !== grupoId && p.meses?.includes(mesNum)
      );
      if (otroGrupoEnVacaciones) {
        const miPlan = config.plan_vacaciones.find(p => p.id_grupo === grupoId);
        const cob = miPlan?.cobertura;
        const semanaEnMes = Math.ceil(fecha.getDate() / 7); // 1, 2, 3 o 4
        const esSemanaImpar = semanaEnMes % 2 === 1;         // semanas 1 y 3 son impares
        if (cob) {
          return esSemanaImpar
            ? (cob.turno_semana_natural ?? 'M')
            : (cob.turno_semana_cobertura ?? 'T');
        }
      }
    }

    const agentesGrupo = agentes.filter(a => {
        if (a.fecha_incorporacion && format(fecha, 'yyyy-MM-dd') < a.fecha_incorporacion) return false;
        
        // Excluir agentes inactivos (CS, Excedencia) para no falsear el número real de agentes del grupo
        const { estado } = getEstadoAgenteEnFecha(a, fecha);
        if (estado === 'Comisión de Servicio' || estado === 'Excedencia') return false;

        const asig = getAsignacionJornada(a, fecha);
        const gId = asig?.id_grupo || a.id_grupo;
        return gId === grupoId;
    });

    // Buscar TODOS los comodines activos en el sistema (independientemente de su grupo base)
    // para que un comodín pueda actuar sobre cualquier grupo de 3 agentes que esté trabajando.
    const todosAgentesComodin = agentes.filter(a => {
        if (a.fecha_incorporacion && format(fecha, 'yyyy-MM-dd') < a.fecha_incorporacion) return false;
        const { estado } = getEstadoAgenteEnFecha(a, fecha);
        if (estado === 'Comisión de Servicio' || estado === 'Excedencia') return false;
        
        const asig = getAsignacionJornada(a, fecha);
        if (asig && asig.tipo_jornada === 'ESPECIAL') {
          const j = config?.jornadas_especiales?.find(x => x.id === asig.id_jornada_especial);
          return j?.turno_base === 'AUTO_REFUERZO';
        }
        return false;
    });

    const agentesNormales = agentesGrupo.filter(a => !todosAgentesComodin.some(c => c.id === a.id));
    const minAgentes = config?.reglas_turnos?.min_agentes_division_mt ?? 4;
    const turnoDefecto = config?.reglas_turnos?.turno_defecto_sin_division ?? 'M';

    const vigencia = getVigenciaActiva(grupo, fecha);
    const divisionActiva = vigencia?.division_mt !== undefined ? vigencia.division_mt : true;

    // Regla de 3 normales + 1 comodín
    const isComodin = todosAgentesComodin.some(a => a.id === agente.id);
    if (agentesNormales.length === 3 && todosAgentesComodin.length === 1) {
      const comodinTrabajaHoy = todosAgentesComodin.some(a => esDiaTrabajo(a, fecha));
      if (isComodin) return 'M';

      const normalesOrdenados = [...agentesNormales].sort((a, b) => a.placa.localeCompare(b.placa) || a.nombre.localeCompare(b.nombre));
      const agenteIndex = normalesOrdenados.findIndex(a => a.id === agente.id);
      
      const fechaPatronStr = vigencia?.patron_inicio || grupo.patron_inicio;
      const diffDays = differenceInDays(fecha, parseISO(fechaPatronStr));
      const numCiclo = Math.floor(diffDays / 14);
      
      const idxMañana = ((numCiclo % 3) + 3) % 3;
      
      if (agenteIndex === idxMañana) {
         if (!comodinTrabajaHoy && isWeekend(fecha)) return 'T';
         return 'M';
      } else {
         return 'T';
      }
    }

    if (!divisionActiva || agentesGrupo.length < minAgentes) {
      const turnosDia = config?.reglas_turnos?.turnos_dias_sin_division;
      if (turnosDia) {
        const mapaDias: Record<number, 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo'> = {
          1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes', 6: 'sabado', 0: 'domingo'
        };
        const diaClave = mapaDias[fecha.getDay()];
        if (diaClave && turnosDia[diaClave]) {
          return turnosDia[diaClave];
        }
      }
      return turnoDefecto;
    }

    // Regla estándar >= 4 agentes
    let agentesOrdenados = [...agentesGrupo].sort((a, b) => a.placa.localeCompare(b.placa) || a.nombre.localeCompare(b.nombre));
    
    const fechaPatronStr = vigencia?.patron_inicio || grupo.patron_inicio;
    const diffDays = differenceInDays(fecha, parseISO(fechaPatronStr));
    const numCiclo = Math.floor(diffDays / 14);

    // Rotar internamente para que no trabajen siempre las mismas parejas
    // Utilizamos un algoritmo tipo "Round-Robin" fijando el primer elemento y rotando el resto
    // Esto garantiza que todos los agentes se emparejen con todos a lo largo de los ciclos.
    if (agentesOrdenados.length > 1) {
      const N = agentesOrdenados.length;
      const rotaciones = numCiclo % (N - 1);
      
      const primero = agentesOrdenados[0];
      const resto = agentesOrdenados.slice(1);
      
      const restoRotado = [
        ...resto.slice(rotaciones),
        ...resto.slice(0, rotaciones)
      ];
      
      agentesOrdenados = [primero, ...restoRotado];
    }

    const agenteIndex = agentesOrdenados.findIndex(a => a.id === agente.id);
    const mitad = Math.ceil(agentesOrdenados.length / 2);
    const esPrimeraMitad = agenteIndex < mitad;

    const cicloPar = (numCiclo % 2 + 2) % 2 === 0;
    const rotacionInvertida = (vigencia?.rotacion_mt_invertida ?? grupo.rotacion_mt_invertida) ?? false;

    let turnoPrimeraMitad: 'M' | 'T' = cicloPar ? 'M' : 'T';
    if (rotacionInvertida) turnoPrimeraMitad = turnoPrimeraMitad === 'M' ? 'T' : 'M';

    return esPrimeraMitad ? turnoPrimeraMitad : (turnoPrimeraMitad === 'M' ? 'T' : 'M');
  };

  const getAusenciaEnDia = (agente: Agente, fecha: Date) => {
    // 1. Ausencias justificadas explícitas
    const ausencia = ausencias.find(a => {
      if (a.id_agente !== agente.id) return false;
      const inicio = parseISO(a.fecha_inicio);
      const fin = parseISO(a.fecha_fin);
      return differenceInDays(fecha, inicio) >= 0 && differenceInDays(fin, fecha) >= 0;
    });
    if (ausencia) return ausencia;

    // 2. Vacaciones del grupo según plan de configuración
    if (config?.plan_vacaciones) {
      // Bug 1 fix: usar el grupo efectivo para esa fecha (respeta reasignaciones de jornada)
      const asignacion = getAsignacionJornada(agente, fecha);
      const grupoEfectivoId = asignacion?.id_grupo ?? agente.id_grupo;
      const plan = config.plan_vacaciones.find(p => p.id_grupo === grupoEfectivoId);
      const mesNum = fecha.getMonth() + 1;
      if (plan && plan.meses && plan.meses.includes(mesNum)) {
        // Bug 2 fix: solo marcar como V en días de trabajo, no en descansos
        if (!esDiaTrabajo(agente, fecha)) return null;
        return {
          id_agente: agente.id!,
          fecha_inicio: format(fecha, 'yyyy-MM-dd'),
          fecha_fin: format(fecha, 'yyyy-MM-dd'),
          tipo: 'V' as TipoAusencia,
          computa_horas: true
        };
      }
    }

    return null;
  };

  const getExtrasEnDia = (agenteId: string, fecha: Date) => {
    return extras.filter(e => {
      if (e.id_agente !== agenteId) return false;
      const start = parseISO(e.fecha_inicio);
      return isSameDay(start, fecha);
    });
  };

  
  const getTurnoManualEnDia = (agente: Agente, fecha: Date): string | null => {
    const mesAnio = format(fecha, 'yyyy-MM');
    const docImportado = turnosImportados.find(t => t.id_agente === agente.id && t.mes_anio === mesAnio);
    if (!docImportado || !docImportado.turnos) return null;
    const diaStr = format(fecha, 'dd');
    return docImportado.turnos[diaStr] || null;
  };
  
  const getDiaSinServicioDetalle = (fecha: Date): DiaSinServicio | null => {
    if (!config) return null;
    const fStr = format(fecha, 'yyyy-MM-dd');
    // Buscar en los detallados con soporte de rangos (fecha_fin inclusive)
    const detallado = config.dias_sin_servicio_detallados?.find(d => {
      if (fStr < d.fecha) return false;
      const hasta = d.fecha_fin || d.fecha;
      return fStr <= hasta;
    });
    if (detallado) return detallado;
    // Fallback al array de strings expandido (retrocompatibilidad)
    if ((config.dias_sin_servicio || []).includes(fStr)) {
      return { fecha: fStr, motivo: 'Sin Servicio Ordinario' };
    }
    return null;
  };

  // Cálculo Económico
  const calcularCosteExtra = (agente: Agente, fInicio: Date, fFin: Date) => {
    if (!config) return 0;
    const tarifas = config.tarifas_extras[agente.categoria];
    if (!tarifas) return 0;

    let costeTotal = 0;
    let iter = new Date(fInicio.getTime());
    while (isAfter(fFin, iter)) {
      const hora = iter.getHours();
      const esNocturna = hora >= 22 || hora < 6;
      
      const esFinDeSemana = isWeekend(iter);
      const fechaStr = format(iter, 'yyyy-MM-dd');
      const esFestivoDia = (config.festivos || []).includes(fechaStr) || esFinDeSemana;

      let tarifaHora = 0;
      if (esFestivoDia) {
        tarifaHora = esNocturna ? tarifas.festivo_nocturna : tarifas.festivo_diurna;
      } else {
        tarifaHora = esNocturna ? tarifas.laborable_nocturna : tarifas.laborable_diurna;
      }
      
      const diffMs = fFin.getTime() - iter.getTime();
      let fraccionHora = 1;
      if (diffMs < 3600000) {
        fraccionHora = diffMs / 3600000;
        iter = new Date(fFin.getTime());
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

    try {
      await addDoc(collection(db, 'ausencias_justificadas'), {
        id_agente: selectedCell.agente.id,
        fecha_inicio: format(selectedCell.fecha, 'yyyy-MM-dd'),
        fecha_fin: fechaFinAusencia,
        tipo: tipoAusencia,
        computa_horas: true
      });
      setSelectedCell(null);
      await loadData();
    } catch (error) {
      console.error("Error guardando ausencia", error);
      alert("Error guardando ausencia");
    }
  };

  const handleGuardarCambio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;

    try {
      const agenteId = selectedCell.agente.id;
      const fechaStr = format(selectedCell.fecha, 'yyyy-MM-dd');
      
      const nuevoCambio = {
        id: `${Date.now()}`,
        id_agente: agenteId,
        fecha: fechaStr,
        turno: modTurno,
        motivo_tipo: modMotivo,
        observaciones: modObs
      };

      const modsActuales = selectedCell.agente.modificaciones_turno || [];
      // Remove any existing mod for this date
      const filt = modsActuales.filter(m => m.fecha !== fechaStr);
      const actualizados = [...filt, nuevoCambio];

      const cleanData = JSON.parse(JSON.stringify({ modificaciones_turno: actualizados }));
      await updateDoc(doc(db, 'agentes', agenteId!), cleanData);
      
      setSelectedCell(null);
      await loadData();
    } catch (error) {
      console.error("Error guardando cambio de turno", error);
      alert("Error guardando cambio");
    }
  };

  // Botón Rápido ROTAR M/T
  const handleRotarMT = async () => {
    try {
      if (grupos.length === 0) return;
      await Promise.all(
        grupos.map(g => 
          g.id ? updateDoc(doc(db, 'grupos', g.id), {
            rotacion_mt_invertida: !g.rotacion_mt_invertida
          }) : Promise.resolve()
        )
      );
      await loadData();
    } catch (err) {
      console.error("Error al rotar M/T:", err);
      alert("Error al rotar turnos M/T");
    }
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
          const aus = getAusenciaEnDia(agente, dia);
          if (aus) return aus.tipo;
          if (esDiaTrabajo(agente, dia)) return getTurnoAgente(agente, dia);
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
    const mesAnio = format(currentDate, 'MMMM - yyyy', {locale: es}).toUpperCase();
    
    // Fila 1: Título del mes
    const row1 = [mesAnio];
    
    // Fila 2: Cabeceras
    const row2 = ['TIP', 'AGENTE', ...daysInMonth.map(d => format(d, 'd'))];
    
    // Fila 3: Días de la semana
    const row3 = ['', '', ...daysInMonth.map(d => format(d, 'E', {locale: es}).charAt(0).toUpperCase())];

    const ws_data = [row1, row2, row3];
    
    agentes.forEach(agente => {
      const row = [agente.placa, agente.nombre];
      daysInMonth.forEach(dia => {
        const manual = getTurnoManualEnDia(agente, dia);
        if (manual) {
           row.push(manual);
           return;
        }

        const aus = getAusenciaEnDia(agente, dia);
        // Bug fix: getDiaSinServicioDetalle ahora funciona con rangos y string array
        const sinServ = getDiaSinServicioDetalle(dia);
        if (aus) {
          row.push(aus.tipo);
        } else if (sinServ) {
          // Si trabaja ese día → CS (Cobertura Sin Servicio); si descansa → L
          row.push(esDiaTrabajo(agente, dia) ? 'CS' : 'L');
        } else if (esDiaTrabajo(agente, dia)) {
          row.push(getTurnoAgente(agente, dia));
        } else {
          row.push('L');
        }
      });
      ws_data.push(row);
    });

    const ws = xlsx.utils.aoa_to_sheet(ws_data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Cuadrante");
    xlsx.writeFile(wb, `plantilla_${format(currentDate, 'yyyy_MM')}.xlsx`);
  };

  const handleExportSheets = async () => {
    try {
      const data = [
        ['Agente', ...daysInMonth.map(d => format(d, 'yyyy-MM-dd'))]
      ];
      agentes.forEach(agente => {
        const row = [agente.nombre];
        daysInMonth.forEach(dia => {
          const aus = getAusenciaEnDia(agente, dia);
          if (aus) {
            row.push(aus.tipo);
          } else if (esDiaTrabajo(agente, dia)) {
            row.push(getTurnoAgente(agente, dia));
          } else {
            row.push('L');
          }
        });
        data.push(row);
      });
      const url = await exportToGoogleSheets(data, `Cuadrante ${format(currentDate, 'MMMM yyyy', {locale: es})}
            {changingMonth && <span className="animate-pulse text-indigo-400 ml-2">...</span>}`);
      window.open(url, '_blank');
    } catch (e) {
      console.error(e);
      alert('Error exportando a Sheets');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImportando(true);
      try {
        const result = await parseExcelCuadrante(file, agentes);
        setImportResult(result);
      } catch (err: any) {
        alert(err.message || 'Error procesando el archivo.');
        setImportResult(null);
      } finally {
        setImportando(false);
      }
    }
  };

  const handleGuardarImportacion = async () => {
    if (!importResult || importResult.turnosImportados.length === 0 || !importResult.mes_anio) return;
    setImportando(true);
    try {
      const batch = writeBatch(db);
      const mesAnio = importResult.mes_anio;
      
      // Borrar importaciones anteriores del mismo mes para los agentes que estamos importando
      const qViejos = query(collection(db, 'turnos_importados'), where('mes_anio', '==', mesAnio));
      const viejosSnap = await getDocs(qViejos);
      viejosSnap.docs.forEach(d => {
         const data = d.data();
         if (importResult.turnosImportados.some(ti => ti.id_agente === data.id_agente)) {
            batch.delete(d.ref);
         }
      });

      // Añadir los nuevos
      importResult.turnosImportados.forEach(ti => {
        const newRef = doc(collection(db, 'turnos_importados'));
        batch.set(newRef, ti);
      });

      await batch.commit();
      setIsImportModalOpen(false);
      setImportResult(null);
      await loadEventosMes(currentDate);
    } catch (err) {
      console.error(err);
      alert('Error guardando en base de datos.');
    } finally {
      setImportando(false);
    }
  };

  const handleGuardarEdicionManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;
    
    const mesAnio = format(selectedCell.fecha, 'yyyy-MM');
    const diaStr = format(selectedCell.fecha, 'dd');
    
    let docImportado = turnosImportados.find(t => t.id_agente === selectedCell.agente.id && t.mes_anio === mesAnio);
    
    try {
      const valorTurno = nuevoTurnoManual.trim().toUpperCase();
      if (docImportado && docImportado.id) {
         // Update existing
         const updatedTurnos = { ...docImportado.turnos };
         if (valorTurno === '') {
             delete updatedTurnos[diaStr]; // Si está vacío, borrar manual
         } else {
             updatedTurnos[diaStr] = valorTurno;
         }
         await updateDoc(doc(db, 'turnos_importados', docImportado.id), { turnos: updatedTurnos });
      } else {
         if (valorTurno !== '') {
             // Create new doc for this agent and month
             const newTurno: Omit<TurnoImportado, 'id'> = {
                id_agente: selectedCell.agente.id!,
                mes_anio: mesAnio,
                turnos: { [diaStr]: valorTurno }
             };
             await addDoc(collection(db, 'turnos_importados'), newTurno);
         }
      }
      setSelectedCell(null);
      setNuevoTurnoManual('');
      loadEventosMes(currentDate);
    } catch (error) {
       console.error("Error guardando edición manual:", error);
       alert('Error actualizando turno manual.');
    }
  };

  const handleOpenCambioCiclo = () => {
    if (grupos.length > 0) {
      const g = grupos[0];
      setSelectedGrupoCicloId(g.id || '');
      setFechaCambioCiclo(g.fecha_cambio_ciclo || `${format(currentDate, 'yyyy')}-08-01`);
      setCambioCicloActivo(g.cambio_ciclo_activo !== undefined ? g.cambio_ciclo_activo : true);
    }
    setIsCambioCicloModalOpen(true);
  };

  const handleSelectGrupoCiclo = (grupoId: string) => {
    setSelectedGrupoCicloId(grupoId);
    if (grupoId !== 'ALL') {
      const g = grupos.find(x => x.id === grupoId);
      if (g) {
        setFechaCambioCiclo(g.fecha_cambio_ciclo || `${format(currentDate, 'yyyy')}-08-01`);
        setCambioCicloActivo(g.cambio_ciclo_activo !== undefined ? g.cambio_ciclo_activo : true);
      }
    }
  };

  const handleGuardarCambioCiclo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrupoCicloId) return;
    setGuardandoCiclo(true);
    try {
      if (selectedGrupoCicloId === 'ALL') {
        await Promise.all(
          grupos.map(g => 
            g.id ? updateDoc(doc(db, 'grupos', g.id), {
              fecha_cambio_ciclo: fechaCambioCiclo,
              cambio_ciclo_activo: cambioCicloActivo
            }) : Promise.resolve()
          )
        );
      } else {
        await updateDoc(doc(db, 'grupos', selectedGrupoCicloId), {
          fecha_cambio_ciclo: fechaCambioCiclo,
          cambio_ciclo_activo: cambioCicloActivo
        });
      }
      await loadData();
      setIsCambioCicloModalOpen(false);
    } catch (err) {
      console.error("Error guardando cambio de ciclo:", err);
      alert("Error al guardar la configuración del cambio de ciclo");
    } finally {
      setGuardandoCiclo(false);
    }
  };

  if (loading) return <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest p-4">Cargando datos...</div>;

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-900 rounded border border-transparent hover:border-slate-800 transition-colors" title="Mes anterior"><ChevronLeft size={16} /></button>
          
          {/* Quick Month & Year Picker Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setPickerYear(currentDate.getFullYear());
                setIsMonthPickerOpen(!isMonthPickerOpen);
              }}
              className="flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 text-[12px] font-bold text-slate-100 uppercase tracking-widest transition-all group min-w-[170px]"
              title="Abrir selector rápido de mes y año"
            >
              <span>{format(currentDate, 'MMMM yyyy', {locale: es})}</span>
              {changingMonth ? (
                <span className="animate-pulse text-indigo-400 font-mono text-xs">...</span>
              ) : (
                <ChevronDown size={14} className={`text-slate-400 group-hover:text-indigo-400 transition-transform duration-200 ${isMonthPickerOpen ? 'rotate-180 text-indigo-400' : ''}`} />
              )}
            </button>

            {isMonthPickerOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsMonthPickerOpen(false)}
                />
                <div className="absolute top-full left-0 mt-2 w-72 bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                  {/* Selector de Año */}
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2.5">
                    <button 
                      type="button"
                      onClick={() => setPickerYear(prev => prev - 1)}
                      className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-900 border border-slate-800/60 transition-colors"
                      title="Año anterior"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-indigo-400" />
                      <span className="text-xs font-mono font-bold text-slate-200 tracking-wider">
                        {pickerYear}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setPickerYear(prev => prev + 1)}
                      className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-900 border border-slate-800/60 transition-colors"
                      title="Año siguiente"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {/* Cuadrícula de 12 meses */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {MESES_LISTA.map((nombreMes, index) => {
                      const isCurrentSelected = currentDate.getFullYear() === pickerYear && currentDate.getMonth() === index;
                      const isToday = new Date().getFullYear() === pickerYear && new Date().getMonth() === index;

                      return (
                        <button
                          key={nombreMes}
                          type="button"
                          onClick={() => {
                            const newDate = new Date(pickerYear, index, 1);
                            setCurrentDate(newDate);
                            setIsMonthPickerOpen(false);
                          }}
                          className={`px-2 py-2 text-[10px] font-mono font-semibold rounded transition-all flex flex-col items-center justify-center relative ${
                            isCurrentSelected 
                              ? 'bg-indigo-600 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)] font-bold' 
                              : 'text-slate-300 hover:bg-slate-900 hover:text-indigo-300 border border-transparent hover:border-slate-800'
                          }`}
                        >
                          <span className="truncate w-full text-center">{nombreMes.slice(0, 3)}</span>
                          {isToday && (
                            <span className={`w-1 h-1 rounded-full mt-0.5 ${isCurrentSelected ? 'bg-white' : 'bg-indigo-400'}`} title="Mes actual" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Accesos rápidos */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex justify-between items-center text-[9px] font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setPickerYear(now.getFullYear());
                        setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
                        setIsMonthPickerOpen(false);
                      }}
                      className="text-slate-400 hover:text-indigo-400 uppercase tracking-wider transition-colors"
                    >
                      Mes Actual
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMonthPickerOpen(false)}
                      className="text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-colors"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button onClick={nextMonth} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-900 rounded border border-transparent hover:border-slate-800 transition-colors" title="Mes siguiente"><ChevronRight size={16}/></button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={handleRotarMT} 
            className="bg-sky-600/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 px-3 py-1.5 rounded flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors"
            title="Invertir asignación de Mañanas y Tardes (M / T) para grupos de 4 o más agentes"
          >
            <RotateCcw size={14} /> Rotar M/T
          </button>
          <button 
            onClick={handleOpenCambioCiclo} 
            className="bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 px-3 py-1.5 rounded flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors"
            title="Configurar Cambio de Ciclo de Turnos (Vacaciones de Verano)"
          >
            <ArrowLeftRight size={14} /> Cambio de Ciclo
          </button>
          <button onClick={() => setIsImportModalOpen(true)} className="bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30 hover:bg-fuchsia-500/30 px-3 py-1.5 rounded flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors" title="Importar Cuadrante desde Excel">
            <Upload size={14} /> Importar
          </button>
          <button onClick={handleExportSheets} className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 px-3 py-1.5 rounded flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors" title="Exportar a Google Sheets">
            <CloudUpload size={14} /> Sheets
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
                <th className="px-3 py-2 font-normal tracking-widest uppercase border-r border-slate-800 sticky left-0 bg-slate-900 z-30 w-20 shadow-[1px_0_0_0_#1e293b]">TIP</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase border-r border-slate-800 sticky left-20 bg-slate-900 z-30 w-48 shadow-[1px_0_0_0_#1e293b]">Agente</th>
                {daysInMonth.map(dia => {
                  const fStr = format(dia, 'yyyy-MM-dd');
                  const festivoDetalle = config?.festivos_detallados?.find(f => f.fecha === fStr);
                  // Bug #3 fix: buscar con soporte de rangos (fecha_fin)
                  const diaSinServDetalle = config?.dias_sin_servicio_detallados?.find(d => {
                    if (fStr < d.fecha) return false;
                    const hasta = d.fecha_fin || d.fecha;
                    return fStr <= hasta;
                  });
                  const isFest = !!festivoDetalle || (config?.festivos || []).includes(fStr);
                  // Bug #5 fix: isSinServ cubre también el array de strings expandido
                  const isSinServ = !!diaSinServDetalle || (config?.dias_sin_servicio || []).includes(fStr);
                  const isWk = isWeekend(dia);

                  let thClass = 'text-slate-500';
                  let titleTooltip = '';

                  if (festivoDetalle) {
                    thClass = 'bg-rose-500/20 text-rose-400 font-bold';
                    titleTooltip = `Festivo: ${festivoDetalle.nombre}`;
                  } else if (diaSinServDetalle) {
                    // Bug #3/#5 fix: ahora diaSinServDetalle cubre rangos, y el motivo viene del objeto
                    thClass = 'bg-amber-500/20 text-amber-400 font-bold';
                    titleTooltip = `Sin Servicio: ${diaSinServDetalle.motivo}`;
                  } else if (isSinServ) {
                    // Fallback para fechas en el array de strings (retrocompatibilidad)
                    thClass = 'bg-amber-500/20 text-amber-400 font-bold';
                    titleTooltip = 'Sin Servicio Ordinario';
                  } else if (isFest || isWk) {
                    thClass = 'bg-rose-500/10 text-rose-400';
                  }

                  return (
                    <th 
                      key={dia.toString()} 
                      title={titleTooltip}
                      className={`px-1.5 py-2 text-center border-r border-slate-800 font-normal min-w-[36px] ${thClass}`}
                    >
                      <div className="text-[9px] uppercase">{format(dia, 'E', {locale: es}).charAt(0)}</div>
                      <div>{format(dia, 'd')}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {[...agentes]
                .sort((a, b) => {
                  const grupoA = grupos.find(g => g.id === a.id_grupo)?.nombre || '';
                  const grupoB = grupos.find(g => g.id === b.id_grupo)?.nombre || '';
                  return grupoA.localeCompare(grupoB) || a.placa.localeCompare(b.placa);
                })
                .map((agente) => (
                <tr key={agente.id} className="border-b border-slate-800/50 hover:bg-indigo-500/5">
                  <td className="px-3 py-2 text-indigo-400 font-bold border-r border-slate-800 sticky left-0 bg-slate-950 shadow-[1px_0_0_0_#1e293b] z-10 group-hover:bg-slate-900 text-center align-middle whitespace-nowrap">
                    #{agente.placa}
                  </td>
                  <td className="px-3 py-2 text-slate-300 border-r border-slate-800 sticky left-20 bg-slate-950 shadow-[1px_0_0_0_#1e293b] z-10 group-hover:bg-slate-900 whitespace-nowrap overflow-hidden">
                    <div className="truncate font-bold text-slate-200" title={agente.nombre}>{agente.nombre}</div>
                    <div className="text-[9px] text-slate-500 font-normal uppercase tracking-widest">{agente.categoria}</div>
                  </td>
                  {daysInMonth.map(dia => {
                    const trabaja = esDiaTrabajo(agente, dia);
                    const ausencia = getAusenciaEnDia(agente, dia);
                    const extrasDelDia = getExtrasEnDia(agente.id!, dia);
                    const mod = getModificacionTurno(agente, dia);
                    // Bug #1/#2 fix: getDiaSinServicioDetalle ahora funciona realmente
                    const sinServicio = getDiaSinServicioDetalle(dia);
                    // Prioridad máxima: situación administrativa del agente (CS/EX/IT desde Plantilla)
                    const { estado: estadoAdmin } = getEstadoAgenteEnFecha(agente, dia);
                    
                    let turnoCalculado: 'M' | 'T' | 'N' | 'L' | '' = '';
                    let bgColor = 'bg-transparent';
                    let textColor = 'text-slate-700';
                    let content = '';

                    if (trabaja) {
                      // Jerarquía: mod manual > sin servicio > turno calculado
                      if (sinServicio && !ausencia && !mod) {
                        // El agente estaría en turno pero el servicio ordinario está suspendido
                        bgColor = 'bg-amber-700/25';
                        textColor = 'text-amber-600 font-bold';
                        content = 'CS';
                      } else {
                        turnoCalculado = getTurnoAgente(agente, dia) as any;
                        content = turnoCalculado;
                        if (turnoCalculado === 'M') {
                          bgColor = 'bg-sky-500/15';
                          textColor = 'text-sky-400 font-bold';
                        } else if (turnoCalculado === 'T') {
                          bgColor = 'bg-amber-500/15';
                          textColor = 'text-amber-400 font-bold';
                        } else if (turnoCalculado === 'N') {
                          bgColor = 'bg-indigo-500/15';
                          textColor = 'text-indigo-400 font-bold';
                        }
                        
                        if (mod) {
                          bgColor = 'bg-fuchsia-500/20 border border-fuchsia-500/50';
                          textColor = 'text-fuchsia-300 font-bold';
                        }
                      }
                    } else if (mod && mod.turno === 'L') {
                      bgColor = 'bg-fuchsia-500/20 border border-fuchsia-500/50';
                      textColor = 'text-fuchsia-300 font-bold';
                      content = 'L';
                    }

                    // Ausencias puntuales (AP, V, J) tienen prioridad sobre el turno calculado
                    if (ausencia) {
                      if (ausencia.tipo === 'V') {
                        bgColor = 'bg-amber-500/25';
                        textColor = 'text-amber-300 font-bold';
                      } else {
                        bgColor = 'bg-rose-500/20';
                        textColor = 'text-rose-400 font-bold';
                      }
                      content = ausencia.tipo;
                    }

                    // PRIORIDAD MÁXIMA: situación administrativa registrada en Plantilla
                    // Comisión de Servicio (CS), Excedencia (EX) y Baja Médica (IT) desde periodos_estado
                    // sobreescriben cualquier turno, ausencia puntual o dia sin servicio.
                    if (estadoAdmin === 'Comisión de Servicio') {
                      bgColor = 'bg-violet-500/20';
                      textColor = 'text-violet-400 font-bold';
                      content = 'CS';
                    } else if (estadoAdmin === 'Excedencia') {
                      bgColor = 'bg-slate-700/40';
                      textColor = 'text-slate-400 font-bold';
                      content = 'EX';
                    } else if (estadoAdmin === 'Baja Médica') {
                      bgColor = 'bg-rose-700/25';
                      textColor = 'text-rose-400 font-bold';
                      content = 'IT';
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

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded shadow-2xl w-full max-w-2xl flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h2 className="text-[12px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                <Upload size={16} className="text-fuchsia-400" /> Importar Histórico de Excel
              </h2>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded text-sm text-amber-200">
                <strong className="block mb-2 text-amber-400 font-bold uppercase tracking-widest text-[10px]">Formato Requerido</strong>
                Asegúrate de que el archivo tenga la fila de cabecera con el mes (ej: "SEPTIEMBRE - 2026") y otra fila con las palabras "TIP", "AGENTE" y los números del 1 al 31.
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Archivo Excel o CSV</label>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-slate-800 file:text-indigo-400 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              {importando && (
                <div className="text-center text-slate-400 font-mono text-sm py-4">Procesando archivo...</div>
              )}

              {importResult && !importando && (
                <div className="mt-4 border border-slate-700 rounded overflow-hidden">
                  <div className="bg-slate-800 p-3 flex justify-between items-center">
                    <span className="text-slate-200 font-bold">Mes Detectado: {importResult.mes_anio}</span>
                    <span className="text-emerald-400 font-bold">{importResult.turnosImportados.length} agentes leídos</span>
                  </div>
                  {importResult.errores.length > 0 && (
                    <div className="bg-rose-500/10 p-3 max-h-40 overflow-y-auto">
                      <h4 className="text-rose-400 font-bold text-xs uppercase mb-2">Advertencias:</h4>
                      <ul className="list-disc list-inside text-rose-300 text-xs space-y-1">
                        {importResult.errores.map((e, idx) => <li key={idx}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-800 flex gap-2 justify-end bg-slate-950">
              <button onClick={() => { setIsImportModalOpen(false); setImportResult(null); }} className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-300">
                Cancelar
              </button>
              <button 
                onClick={handleGuardarImportacion}
                disabled={!importResult || importResult.turnosImportados.length === 0 || importando}
                className="bg-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-fuchsia-500 text-white px-6 py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
              >
                {importando ? 'Guardando...' : 'Confirmar Importación'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button 
                onClick={() => setActiveTab('cambio')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'cambio' ? 'border-fuchsia-500 text-fuchsia-400' : 'border-transparent text-slate-500 hover:text-slate-300 bg-slate-900/50'}`}
              >
                Cambio Turno
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {activeTab === 'cambio' ? (
                <form onSubmit={handleGuardarCambio} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Turno Manual Asignado</label>
                    <select required value={modTurno} onChange={e => setModTurno(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-fuchsia-500">
                      <option value="M">MAÑANA (M)</option>
                      <option value="T">TARDE (T)</option>
                      <option value="N">NOCHE (N)</option>
                      <option value="L">LIBRE (L)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Motivo del Cambio</label>
                    <select required value={modMotivo} onChange={e => setModMotivo(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-fuchsia-500">
                      <option value="voluntario_companeros">Voluntario entre compañeros</option>
                      <option value="necesidades_servicio">Necesidades del servicio</option>
                      <option value="ayuntamiento">Por parte del Ayuntamiento</option>
                      <option value="otro">Otro motivo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Observaciones</label>
                    <input type="text" value={modObs} onChange={e => setModObs(e.target.value)} placeholder="Opcional..." className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-fuchsia-500" />
                  </div>
                  
                  <div className="bg-fuchsia-500/10 p-2.5 rounded border border-fuchsia-500/20 text-[10px] font-mono text-fuchsia-300">
                    Este cambio se resaltará visualmente en el cuadrante y prevalecerá sobre el turno calculado automáticamente.
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 mt-2">
                    <button type="button" onClick={() => setSelectedCell(null)} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
                    <button type="submit" className="px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[10px] font-bold uppercase tracking-widest rounded transition-colors">Guardar Cambio</button>
                  </div>
                </form>
              ) : activeTab === 'extra' ? (
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

      {/* Modal Cambio de Ciclo */}
      {isCambioCicloModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded shadow-2xl w-full max-w-md flex flex-col">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-[12px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-amber-400" /> CAMBIO DE CICLO POLICIAL
              </h2>
              <p className="text-[10px] font-mono text-slate-500 mt-0.5">Inversión de semanas de trabajo (Pares / Impares)</p>
            </div>
            
            <form onSubmit={handleGuardarCambioCiclo} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                  Grupo Afectado
                </label>
                <select 
                  value={selectedGrupoCicloId} 
                  onChange={e => handleSelectGrupoCiclo(e.target.value)} 
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-amber-500"
                >
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>{g.nombre.toUpperCase()}</option>
                  ))}
                  {grupos.length > 1 && (
                    <option value="ALL">TODOS LOS GRUPOS</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                  Fecha de Entrada en Vigor (Reincorporación)
                </label>
                <input 
                  required 
                  type="date" 
                  value={fechaCambioCiclo} 
                  onChange={e => setFechaCambioCiclo(e.target.value)} 
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-amber-500 [color-scheme:dark]" 
                />
                <span className="text-[9px] font-mono text-slate-500 mt-1 block">
                  Normalmente 1 de agosto tras el periodo vacacional de julio.
                </span>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                    Inversión de Ciclo
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={cambioCicloActivo} 
                      onChange={e => setCambioCicloActivo(e.target.checked)} 
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
                <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
                  {cambioCicloActivo 
                    ? "✓ Activado: A partir de la fecha seleccionada, los días que antes eran libres pasan a ser de trabajo y viceversa (desfase de 7 días)."
                    : "✗ Desactivado: El grupo mantiene el patrón continuo 7x7 sin saltos durante todo el año."
                  }
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800 mt-2">
                <button 
                  type="button" 
                  onClick={() => setIsCambioCicloModalOpen(false)} 
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={guardandoCiclo}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[10px] uppercase tracking-widest rounded transition-colors disabled:opacity-50"
                >
                  {guardandoCiclo ? 'Guardando...' : 'Aplicar Cambio de Ciclo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
