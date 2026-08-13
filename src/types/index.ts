export type CategoriaAgente = 'Agente' | 'Oficial' | 'Oficial-Jefe';

export interface Agente {
  id?: string;
  nombre: string;
  placa: string;
  id_grupo: string;
  categoria: CategoriaAgente;
  asuntos_propios_total: number;
}

export interface ConfiguracionAnual {
  año: string;
  horarios_base: {
    entrada: string;
    salida: string;
  };
  festivos: string[]; // YYYY-MM-DD
  dias_sin_servicio: string[]; // YYYY-MM-DD
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
}
