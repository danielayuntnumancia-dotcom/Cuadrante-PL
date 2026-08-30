import { format, parseISO, differenceInDays, isWeekend, getISOWeek, eachDayOfInterval, startOfYear, endOfYear } from 'date-fns';
import { Agente, Grupo, ConfiguracionAnual, ServicioExtraordinario, AusenciaJustificada, TipoAusencia, VigenciaCuadrante, TurnoImportado, getEstadoAgenteEnFecha, DiaSemana } from '../types';

export interface EstadisticasMesAgente {
  mes: number; // 1 - 12
  nombreMes: string;
  diasRealizados: number;
  diasPrevistos: number;
  diasTotales: number;
  horasRealizadas: number;
  horasPrevistas: number;
  horasExtra: number;
  horasTotales: number;
  apDias: number;
  vacacionesDias: number;
  itDias: number;
  otrosPermisosDias: number;
}

export interface EstadisticasAnualesAgente {
  agente: Agente;
  grupoNombre: string;
  diasRealizados: number;
  diasPrevistos: number;
  diasTotales: number;
  horasRealizadas: number;
  horasPrevistas: number;
  horasExtra: number;
  horasTotales: number;
  jornadaAnualReferencia: number; // Ej. 1540 o 1642 horas
  balanceHoras: number; // horasTotales - jornadaAnualReferencia
  porcentajeRealizado: number;
  
  desgloseTurnos: {
    realizados: { M: number; T: number; N: number; otros: number };
    previstos: { M: number; T: number; N: number; otros: number };
  };
  
  desgloseAusencias: {
    ap: { realizados: number; previstos: number; total: number };
    vacaciones: { realizados: number; previstos: number; total: number };
    it: { realizados: number; previstos: number; total: number };
    juicios: { realizados: number; previstos: number; total: number };
    otros: { realizados: number; previstos: number; total: number };
  };
  
  meses: EstadisticasMesAgente[];
}

export interface ResumenGlobalPlantilla {
  año: number;
  totalAgentes: number;
  totalDiasRealizados: number;
  totalDiasPrevistos: number;
  totalDiasTrabajados: number;
  totalHorasRealizadas: number;
  totalHorasPrevistas: number;
  totalHorasExtra: number;
  totalHorasTrabajadas: number;
  totalAPConsumidos: number;
  totalVacacionesConsumidas: number;
  totalBajasIT: number;
  agentesStats: EstadisticasAnualesAgente[];
}

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Calcula la duración en horas de un turno según la configuración o por defecto 8h
 */
export function getHorasTurno(
  tipoTurno: 'M' | 'T' | 'N' | string,
  fecha: Date,
  config: ConfiguracionAnual | null
): number {
  if (!tipoTurno || tipoTurno === 'L' || tipoTurno === '') return 0;
  
  if (config?.horarios_turnos) {
    const mapaDias: Record<number, DiaSemana> = {
      1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes', 6: 'sabado', 0: 'domingo'
    };
    const diaClave = mapaDias[fecha.getDay()];
    const tKey = tipoTurno as 'M' | 'T' | 'N';
    
    if (config.horarios_turnos[tKey] && config.horarios_turnos[tKey][diaClave]) {
      const tramo = config.horarios_turnos[tKey][diaClave];
      if (tramo.entrada && tramo.salida) {
        const [hE, mE] = tramo.entrada.split(':').map(Number);
        const [hS, mS] = tramo.salida.split(':').map(Number);
        let mins = (hS * 60 + (mS || 0)) - (hE * 60 + (mE || 0));
        if (mins <= 0) mins += 24 * 60; // Turno nocturno que cruza medianoche
        return Math.round((mins / 60) * 10) / 10;
      }
    }
  }

  // Si no hay configuración horaria por tramos, verificar horarios_base o estándar 8 horas
  if (config?.horarios_base?.entrada && config.horarios_base.salida) {
    const [hE, mE] = config.horarios_base.entrada.split(':').map(Number);
    const [hS, mS] = config.horarios_base.salida.split(':').map(Number);
    let mins = (hS * 60 + (mS || 0)) - (hE * 60 + (mE || 0));
    if (mins <= 0) mins += 24 * 60;
    return Math.round((mins / 60) * 10) / 10;
  }

  return 8; // Estándar 8h por jornada
}

/**
 * Obtiene la vigencia activa para un grupo en una fecha determinada
 */
function getVigenciaActiva(grupo: Grupo, fecha: Date): VigenciaCuadrante | null {
  if (!grupo.vigencias || grupo.vigencias.length === 0) return null;
  const fechaStr = format(fecha, 'yyyy-MM-dd');
  const validas = grupo.vigencias
    .filter(v => v.fecha_desde <= fechaStr)
    .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde));
  if (validas.length === 0) return null;
  return validas[validas.length - 1];
}

/**
 * Determina si el agente tiene asignación de jornada especial en una fecha
 */
function getAsignacionJornada(agente: Agente, fecha: Date) {
  if (!agente.asignaciones_jornada) return null;
  const fechaStr = format(fecha, 'yyyy-MM-dd');
  return agente.asignaciones_jornada.find(a => {
    const startOk = fechaStr >= a.fecha_desde;
    const endOk = !a.fecha_hasta || fechaStr <= a.fecha_hasta;
    return startOk && endOk;
  });
}

/**
 * Determina si el agente tiene modificación manual de turno en una fecha
 */
function getModificacionTurno(agente: Agente, fecha: Date) {
  if (!agente.modificaciones_turno) return null;
  const fechaStr = format(fecha, 'yyyy-MM-dd');
  return agente.modificaciones_turno.find(m => m.fecha === fechaStr);
}

/**
 * Obtiene turno manual importado para el agente en esa fecha
 */
function getTurnoImportado(agente: Agente, fecha: Date, turnosImportados: TurnoImportado[]): string | null {
  const mesAnio = format(fecha, 'yyyy-MM');
  const docImportado = turnosImportados.find(t => t.id_agente === agente.id && t.mes_anio === mesAnio);
  if (!docImportado || !docImportado.turnos) return null;
  const diaStr = format(fecha, 'dd');
  return docImportado.turnos[diaStr] || null;
}

/**
 * Determina si un agente trabaja en una fecha según el algoritmo del cuadrante
 */
export function esDiaTrabajoAgente(
  agente: Agente,
  fecha: Date,
  grupos: Grupo[],
  config: ConfiguracionAnual | null,
  turnosImportados: TurnoImportado[] = []
): boolean {
  // 1. Turno manual importado de Excel
  const turnoImp = getTurnoImportado(agente, fecha, turnosImportados);
  if (turnoImp) {
    return turnoImp !== 'L' && turnoImp !== 'V' && turnoImp !== 'AP' && turnoImp !== 'IT' && turnoImp !== 'J';
  }

  // 2. Modificación de turno individual
  const mod = getModificacionTurno(agente, fecha);
  if (mod) return mod.turno !== 'L';

  // 3. Fecha de incorporación
  const fechaStr = format(fecha, 'yyyy-MM-dd');
  if (agente.fecha_incorporacion && fechaStr < agente.fecha_incorporacion) {
    return false;
  }

  // 4. Jornada Especial asignada
  const asignacion = getAsignacionJornada(agente, fecha);
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

  // 5. Patrón 7x7 estándar
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
}

/**
 * Determina el tipo de turno ('M', 'T', 'N') de un agente en una fecha
 */
export function getTurnoAgenteFecha(
  agente: Agente,
  fecha: Date,
  agentes: Agente[],
  grupos: Grupo[],
  config: ConfiguracionAnual | null,
  turnosImportados: TurnoImportado[] = []
): 'M' | 'T' | 'N' | string {
  // 1. Turno importado
  const turnoImp = getTurnoImportado(agente, fecha, turnosImportados);
  if (turnoImp) return turnoImp;

  // 2. Modificación de turno manual
  const mod = getModificacionTurno(agente, fecha);
  if (mod && mod.turno !== 'L') return mod.turno;

  // 3. Jornada Especial
  const asignacion = getAsignacionJornada(agente, fecha);
  if (asignacion && asignacion.tipo_jornada === 'ESPECIAL' && asignacion.id_jornada_especial) {
    const jornada = config?.jornadas_especiales?.find(j => j.id === asignacion.id_jornada_especial);
    if (jornada && jornada.turno_base !== 'AUTO_REFUERZO') {
      return jornada.turno_base;
    }
  }

  // 4. Grupo policial y rotación M/T
  const grupoId = asignacion?.id_grupo || agente.id_grupo;
  const grupo = grupos.find(g => g.id === grupoId);
  if (!grupo) return 'M';

  const agentesGrupo = agentes.filter(a => {
    if (a.fecha_incorporacion && format(fecha, 'yyyy-MM-dd') < a.fecha_incorporacion) return false;
    const { estado } = getEstadoAgenteEnFecha(a, fecha);
    if (estado === 'Comisión de Servicio' || estado === 'Excedencia') return false;
    const asig = getAsignacionJornada(a, fecha);
    const gId = asig?.id_grupo || a.id_grupo;
    return gId === grupoId;
  });

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

  // Regla 3+1 comodín
  const isComodin = todosAgentesComodin.some(a => a.id === agente.id);
  if (agentesNormales.length === 3 && todosAgentesComodin.length === 1) {
    const comodinTrabajaHoy = todosAgentesComodin.some(a => esDiaTrabajoAgente(a, fecha, grupos, config, turnosImportados));
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
      const mapaDias: Record<number, DiaSemana> = {
        1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes', 6: 'sabado', 0: 'domingo'
      };
      const diaClave = mapaDias[fecha.getDay()];
      if (diaClave && turnosDia[diaClave]) {
        return turnosDia[diaClave];
      }
    }
    return turnoDefecto;
  }

  // Regla estándar >= 4 agentes Round-Robin
  let agentesOrdenados = [...agentesGrupo].sort((a, b) => a.placa.localeCompare(b.placa) || a.nombre.localeCompare(b.nombre));
  const fechaPatronStr = vigencia?.patron_inicio || grupo.patron_inicio;
  const diffDays = differenceInDays(fecha, parseISO(fechaPatronStr));
  const numCiclo = Math.floor(diffDays / 14);

  if (agentesOrdenados.length > 1) {
    const N = agentesOrdenados.length;
    const rotaciones = numCiclo % (N - 1);
    const primero = agentesOrdenados[0];
    const resto = agentesOrdenados.slice(1);
    const restoRotado = [...resto.slice(rotaciones), ...resto.slice(0, rotaciones)];
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
}

/**
 * Obtiene si hay ausencia justificada o vacaciones de grupo para el agente en una fecha
 */
export function getAusenciaAgenteFecha(
  agente: Agente,
  fecha: Date,
  ausencias: AusenciaJustificada[],
  config: ConfiguracionAnual | null
): { tipo: TipoAusencia; computa_horas: boolean } | null {
  // 1. Ausencias individuales registradas
  const aus = ausencias.find(a => {
    if (a.id_agente !== agente.id) return false;
    const inicio = parseISO(a.fecha_inicio);
    const fin = parseISO(a.fecha_fin);
    return differenceInDays(fecha, inicio) >= 0 && differenceInDays(fin, fecha) >= 0;
  });
  if (aus) {
    return { tipo: aus.tipo, computa_horas: aus.computa_horas !== false };
  }

  // 2. Vacaciones automáticas por plan anual de grupo
  if (config?.plan_vacaciones) {
    const plan = config.plan_vacaciones.find(p => p.id_grupo === agente.id_grupo);
    const mesNum = fecha.getMonth() + 1;
    if (plan && plan.meses && plan.meses.includes(mesNum)) {
      return { tipo: 'V', computa_horas: true };
    }
  }

  return null;
}

/**
 * Realiza el cálculo anual completo para un año determinado,
 * distinguiendo entre lo efectivamente realizado (hasta hoy) y lo previsto (posterior a hoy).
 */
export function calcularComputoAnualPlantilla(
  año: number,
  agentes: Agente[],
  grupos: Grupo[],
  config: ConfiguracionAnual | null,
  ausencias: AusenciaJustificada[],
  extras: ServicioExtraordinario[],
  turnosImportados: TurnoImportado[] = [],
  jornadaAnualConvenio: number = 1540
): ResumenGlobalPlantilla {
  const hoy = new Date();
  const hoyStr = format(hoy, 'yyyy-MM-dd');
  const añoActual = hoy.getFullYear();

  const fechaInicioAño = startOfYear(new Date(año, 0, 1));
  const fechaFinAño = endOfYear(new Date(año, 11, 31));
  const todosLosDias = eachDayOfInterval({ start: fechaInicioAño, end: fechaFinAño });

  const extrasDelAño = extras.filter(e => {
    const d = parseISO(e.fecha_inicio);
    return d.getFullYear() === año;
  });

  const agentesStats: EstadisticasAnualesAgente[] = agentes.map(agente => {
    const grupo = grupos.find(g => g.id === agente.id_grupo);
    const grupoNombre = grupo?.nombre || 'Sin Grupo';

    let diasRealizados = 0;
    let diasPrevistos = 0;
    let horasRealizadas = 0;
    let horasPrevistas = 0;

    const desgloseTurnos = {
      realizados: { M: 0, T: 0, N: 0, otros: 0 },
      previstos: { M: 0, T: 0, N: 0, otros: 0 }
    };

    const desgloseAusencias = {
      ap: { realizados: 0, previstos: 0, total: 0 },
      vacaciones: { realizados: 0, previstos: 0, total: 0 },
      it: { realizados: 0, previstos: 0, total: 0 },
      juicios: { realizados: 0, previstos: 0, total: 0 },
      otros: { realizados: 0, previstos: 0, total: 0 }
    };

    // Array de 12 meses
    const mesesStats: EstadisticasMesAgente[] = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      nombreMes: NOMBRES_MESES[i],
      diasRealizados: 0,
      diasPrevistos: 0,
      diasTotales: 0,
      horasRealizadas: 0,
      horasPrevistas: 0,
      horasExtra: 0,
      horasTotales: 0,
      apDias: 0,
      vacacionesDias: 0,
      itDias: 0,
      otrosPermisosDias: 0
    }));

    // Recorrer todos los días del año
    todosLosDias.forEach(dia => {
      const fechaStr = format(dia, 'yyyy-MM-dd');
      const mesIndex = dia.getMonth();
      const esPasadoOHoy = año < añoActual || (año === añoActual && fechaStr <= hoyStr);

      const trabaja = esDiaTrabajoAgente(agente, dia, grupos, config, turnosImportados);
      const ausencia = getAusenciaAgenteFecha(agente, dia, ausencias, config);
      const { estado } = getEstadoAgenteEnFecha(agente, dia);

      if (ausencia) {
        const tipo = ausencia.tipo;
        if (tipo === 'AP') {
          if (esPasadoOHoy) desgloseAusencias.ap.realizados++;
          else desgloseAusencias.ap.previstos++;
          desgloseAusencias.ap.total++;
          mesesStats[mesIndex].apDias++;
        } else if (tipo === 'V') {
          if (esPasadoOHoy) desgloseAusencias.vacaciones.realizados++;
          else desgloseAusencias.vacaciones.previstos++;
          desgloseAusencias.vacaciones.total++;
          mesesStats[mesIndex].vacacionesDias++;
        } else if (tipo === 'IT') {
          if (esPasadoOHoy) desgloseAusencias.it.realizados++;
          else desgloseAusencias.it.previstos++;
          desgloseAusencias.it.total++;
          mesesStats[mesIndex].itDias++;
        } else if (tipo === 'J') {
          if (esPasadoOHoy) desgloseAusencias.juicios.realizados++;
          else desgloseAusencias.juicios.previstos++;
          desgloseAusencias.juicios.total++;
          mesesStats[mesIndex].otrosPermisosDias++;
        } else {
          if (esPasadoOHoy) desgloseAusencias.otros.realizados++;
          else desgloseAusencias.otros.previstos++;
          desgloseAusencias.otros.total++;
          mesesStats[mesIndex].otrosPermisosDias++;
        }
      }

      if (trabaja && !ausencia && estado === 'Activo') {
        const turno = getTurnoAgenteFecha(agente, dia, agentes, grupos, config, turnosImportados);
        const horasDia = getHorasTurno(turno, dia, config);

        if (esPasadoOHoy) {
          diasRealizados++;
          horasRealizadas += horasDia;
          mesesStats[mesIndex].diasRealizados++;
          mesesStats[mesIndex].horasRealizadas += horasDia;

          if (turno === 'M') desgloseTurnos.realizados.M++;
          else if (turno === 'T') desgloseTurnos.realizados.T++;
          else if (turno === 'N') desgloseTurnos.realizados.N++;
          else desgloseTurnos.realizados.otros++;
        } else {
          diasPrevistos++;
          horasPrevistas += horasDia;
          mesesStats[mesIndex].diasPrevistos++;
          mesesStats[mesIndex].horasPrevistas += horasDia;

          if (turno === 'M') desgloseTurnos.previstos.M++;
          else if (turno === 'T') desgloseTurnos.previstos.T++;
          else if (turno === 'N') desgloseTurnos.previstos.N++;
          else desgloseTurnos.previstos.otros++;
        }
      }
    });

    // Horas Extra del agente en el año
    let horasExtraTotalAgente = 0;
    extrasDelAño
      .filter(e => e.id_agente === agente.id)
      .forEach(e => {
        const d = parseISO(e.fecha_inicio);
        const mesIdx = d.getMonth();
        const hExtra = e.horas_totales || 0;
        horasExtraTotalAgente += hExtra;
        if (mesIdx >= 0 && mesIdx < 12) {
          mesesStats[mesIdx].horasExtra += hExtra;
        }
      });

    // Calcular totales de cada mes
    mesesStats.forEach(m => {
      m.diasTotales = m.diasRealizados + m.diasPrevistos;
      m.horasTotales = m.horasRealizadas + m.horasPrevistas + m.horasExtra;
    });

    const diasTotales = diasRealizados + diasPrevistos;
    const horasTotales = horasRealizadas + horasPrevistas + horasExtraTotalAgente;
    const balanceHoras = horasTotales - jornadaAnualConvenio;
    const porcentajeRealizado = diasTotales > 0 ? Math.round((diasRealizados / diasTotales) * 100) : 0;

    return {
      agente,
      grupoNombre,
      diasRealizados,
      diasPrevistos,
      diasTotales,
      horasRealizadas,
      horasPrevistas,
      horasExtra: horasExtraTotalAgente,
      horasTotales,
      jornadaAnualReferencia: jornadaAnualConvenio,
      balanceHoras,
      porcentajeRealizado,
      desgloseTurnos,
      desgloseAusencias,
      meses: mesesStats
    };
  });

  // Totales globales
  const totalAgentes = agentesStats.length;
  const totalDiasRealizados = agentesStats.reduce((acc, curr) => acc + curr.diasRealizados, 0);
  const totalDiasPrevistos = agentesStats.reduce((acc, curr) => acc + curr.diasPrevistos, 0);
  const totalDiasTrabajados = totalDiasRealizados + totalDiasPrevistos;

  const totalHorasRealizadas = agentesStats.reduce((acc, curr) => acc + curr.horasRealizadas, 0);
  const totalHorasPrevistas = agentesStats.reduce((acc, curr) => acc + curr.horasPrevistas, 0);
  const totalHorasExtra = agentesStats.reduce((acc, curr) => acc + curr.horasExtra, 0);
  const totalHorasTrabajadas = totalHorasRealizadas + totalHorasPrevistas + totalHorasExtra;

  const totalAPConsumidos = agentesStats.reduce((acc, curr) => acc + curr.desgloseAusencias.ap.total, 0);
  const totalVacacionesConsumidas = agentesStats.reduce((acc, curr) => acc + curr.desgloseAusencias.vacaciones.total, 0);
  const totalBajasIT = agentesStats.reduce((acc, curr) => acc + curr.desgloseAusencias.it.total, 0);

  return {
    año,
    totalAgentes,
    totalDiasRealizados,
    totalDiasPrevistos,
    totalDiasTrabajados,
    totalHorasRealizadas,
    totalHorasPrevistas,
    totalHorasExtra,
    totalHorasTrabajadas,
    totalAPConsumidos,
    totalVacacionesConsumidas,
    totalBajasIT,
    agentesStats
  };
}
