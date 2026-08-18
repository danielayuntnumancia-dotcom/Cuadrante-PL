export type CategoriaAgente = 'Agente' | 'Oficial' | 'Oficial-Jefe';

export interface Agente {
  id?: string;
  nombre: string;
  placa: string;
  id_grupo: string;
  categoria: CategoriaAgente;
  asuntos_propios_total: number;
}

export interface FestivoAnual {
  id?: string;
  fecha: string; // YYYY-MM-DD
  nombre: string;
}

export interface DiaSinServicio {
  id?: string;
  fecha: string; // YYYY-MM-DD
  motivo: string;
}

export interface PlanVacacionesGrupo {
  id_grupo: string;
  meses: number[]; // 1-12 (ej. [7] para julio, [8] para agosto)
  fecha_inicio?: string; // YYYY-MM-DD
  fecha_fin?: string; // YYYY-MM-DD
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

export interface ConfiguracionAnual {
  año: string;
  horarios_base: {
    entrada: string;
    salida: string;
  };
  festivos_detallados?: FestivoAnual[];
  festivos: string[]; // YYYY-MM-DD para retrocompatibilidad
  dias_sin_servicio_detallados?: DiaSinServicio[];
  dias_sin_servicio: string[]; // YYYY-MM-DD para retrocompatibilidad
  plan_vacaciones?: PlanVacacionesGrupo[];
  reglas_turnos: {
    min_agentes_division_mt: number; // Por defecto 4
    turno_defecto_sin_division: 'M' | 'T'; // Por defecto 'M'
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

export type TipoAusencia = 'IT' | 'AP' | 'J' | 'V'; // Incapacidad Temporal, Asuntos Propios, Juicio, Vacaciones

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
