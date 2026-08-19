export type CategoriaAgente = 'Agente' | 'Oficial' | 'Oficial-Jefe';

export type EstadoAgente = 'Activo' | 'Baja Médica' | 'Comisión de Servicio' | 'Excedencia';

export interface PeriodoEstado {
  id?: string;
  tipo: EstadoAgente; // 'Baja Médica' | 'Comisión de Servicio' | 'Excedencia'
  fecha_desde: string; // YYYY-MM-DD
  fecha_hasta?: string; // YYYY-MM-DD (vacía si es indefinida)
  motivo?: string;
  creado_el?: string;
}

export interface Agente {
  id?: string;
  nombre: string;
  placa: string;
  id_grupo: string;
  categoria: CategoriaAgente;
  asuntos_propios_total: number;
  estado?: EstadoAgente; // Estado administrativo legado
  fecha_estado_desde?: string; // YYYY-MM-DD legado
  fecha_estado_hasta?: string; // YYYY-MM-DD legado
  periodos_estado?: PeriodoEstado[]; // Historial dinámico de situaciones
}

/**
 * Evalúa dinámicamente la situación real de un agente en una fecha concreta (Date o string YYYY-MM-DD).
 */
export function getEstadoAgenteEnFecha(agente: Agente, fecha: Date | string): {
  estado: EstadoAgente;
  periodoActivo?: PeriodoEstado;
} {
  let fechaStr = typeof fecha === 'string' ? fecha.slice(0, 10) : '';
  if (fecha instanceof Date) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    fechaStr = `${y}-${m}-${d}`;
  }

  // 1. Revisar historial de periodos_estado
  if (agente.periodos_estado && agente.periodos_estado.length > 0) {
    for (const p of agente.periodos_estado) {
      if (p.tipo === 'Activo') continue;
      const desde = p.fecha_desde;
      const hasta = p.fecha_hasta || '9999-12-31';
      if (fechaStr >= desde && fechaStr <= hasta) {
        return { estado: p.tipo, periodoActivo: p };
      }
    }
  }

  // 2. Retrocompatibilidad: Si tiene campos legados
  if (agente.estado && agente.estado !== 'Activo') {
    const desde = agente.fecha_estado_desde || '1970-01-01';
    const hasta = agente.fecha_estado_hasta || '9999-12-31';
    if (fechaStr >= desde && fechaStr <= hasta) {
      return {
        estado: agente.estado,
        periodoActivo: {
          id: 'legacy',
          tipo: agente.estado,
          fecha_desde: agente.fecha_estado_desde || '',
          fecha_hasta: agente.fecha_estado_hasta || ''
        }
      };
    }
  }

  return { estado: 'Activo' };
}

export interface FestivoAnual {
  id?: string;
  fecha: string; // YYYY-MM-DD
  nombre: string;
}

export interface DiaSinServicio {
  id?: string;
  fecha: string; // YYYY-MM-DD (fecha única o fecha inicio de rango)
  fecha_fin?: string; // YYYY-MM-DD (fecha fin si es rango)
  motivo: string;
}

export interface DistribucionCoberturaVacaciones {
  // Para grupos con ≥ 4 agentes:
  agentes_semana_natural?: string[]; // IDs de agentes asignados a Semana Natural (Pareja 1)
  agentes_semana_cobertura?: string[]; // IDs de agentes asignados a Semana de Cobertura (Pareja 2)
  turno_semana_natural?: 'M' | 'T'; // Turno asignado a Pareja 1 (por defecto 'M')
  turno_semana_cobertura?: 'M' | 'T'; // Turno asignado a Pareja 2 (por defecto 'M' o 'T')
  // Para grupos con < 4 agentes:
  turno_grupo_reducido?: 'M' | 'T'; // Turno cuando no alcanzan los 4 agentes (por defecto 'M')
}

export interface PlanVacacionesGrupo {
  id_grupo: string;
  meses: number[]; // 1-12 (ej. [7] para julio, [8] para agosto)
  fecha_inicio?: string; // YYYY-MM-DD
  fecha_fin?: string; // YYYY-MM-DD
  cobertura?: DistribucionCoberturaVacaciones;
}

export interface VigenciaCuadrante {
  id?: string;
  fecha_desde: string; // YYYY-MM-DD (fecha desde la que entra en vigor este cambio)
  descripcion?: string;
  patron_inicio?: string; // YYYY-MM-DD inicio de ciclo de referencia
  tipo_patron?: '7x7' | 'CONTINUO';
  invertir_ciclo?: boolean; // Inversión de paridad (cambio de ciclo)
  division_mt?: boolean; // Activar división M/T si hay >= min_agentes
  rotacion_mt_invertida?: boolean; // Invertir qué mitad hace M y qué mitad hace T
}

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type TipoTurno = 'M' | 'T' | 'N';

export interface HorarioTramo {
  entrada: string; // HH:mm
  salida: string;  // HH:mm
}

export type HorariosSemana = Record<DiaSemana, HorarioTramo>;

export interface ConfiguracionAnual {
  año: string;
  horarios_base: {
    entrada: string;
    salida: string;
  };
  horarios_turnos?: {
    M: HorariosSemana;
    T: HorariosSemana;
    N: HorariosSemana;
  };
  festivos_detallados?: FestivoAnual[];
  festivos: string[]; // YYYY-MM-DD para retrocompatibilidad
  dias_sin_servicio_detallados?: DiaSinServicio[];
  dias_sin_servicio: string[]; // YYYY-MM-DD para retrocompatibilidad
  plan_vacaciones?: PlanVacacionesGrupo[];
  reglas_turnos: {
    min_agentes_division_mt: number; // Por defecto 4
    turno_defecto_sin_division: 'M' | 'T'; // Por defecto 'M' (retrocompatibilidad)
    turnos_dias_sin_division?: Record<DiaSemana, 'M' | 'T'>;
    division_semanal_vacaciones?: boolean; // División al 50% entre semanas durante vacaciones del otro grupo (por defecto true)
  };
  tarifas_extras: {
    [categoria in CategoriaAgente]: {
      laborable_diurna: number;
      laborable_nocturna: number; // 22:00 - 06:00
      festivo_diurna: number;
      festivo_nocturna: number;
    }
  };
}

export interface ServicioExtraordinario {
  id?: string;
  id_agente: string;
  fecha_inicio: string; // ISO string
  fecha_fin: string; // ISO string
  horas_totales: number;
  motivo: string;
  coste_calculado: number;
}

export type TipoAusencia = 'IT' | 'CS' | 'EX' | 'AP' | 'J' | 'V'; // Incapacidad Temporal, Comisión Servicio, Excedencia, Asuntos Propios, Juicio, Vacaciones

export interface AusenciaJustificada {
  id?: string;
  id_agente: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  tipo: TipoAusencia;
  computa_horas: boolean;
}

export interface Grupo {
  id?: string;
  nombre: string;
  patron_inicio: string; // YYYY-MM-DD for the reference start date of the 7x7 pattern (start of 7 working days)
  fecha_cambio_ciclo?: string; // YYYY-MM-DD
  cambio_ciclo_activo?: boolean;
  rotacion_mt_invertida?: boolean;
  vigencias?: VigenciaCuadrante[]; // Historial de vigencias temporales ordenadas
}

export interface TurnoImportado {
  id?: string;
  id_agente: string;
  mes_anio: string; // Formato YYYY-MM (ej. 2026-09)
  turnos: Record<string, string>; // Mapa de día (DD) a turno (ej. "01": "M", "02": "L", "15": "F")
}
