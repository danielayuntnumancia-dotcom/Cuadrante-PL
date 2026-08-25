import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ConfiguracionAnual, FestivoAnual, DiaSinServicio, PlanVacacionesGrupo, DistribucionCoberturaVacaciones, Grupo, VigenciaCuadrante, DiaSemana, TipoTurno, HorariosSemana, Agente } from '../types';
import { Save, Calendar, Clock, SunMedium, Users, Plus, Trash2, ShieldAlert, CheckCircle2, History, ArrowLeftRight, Copy, Check } from 'lucide-react';
import { format, parseISO, eachDayOfInterval, differenceInCalendarDays } from 'date-fns';

export const DIAS_SEMANA: { key: DiaSemana; label: string; abrev: string; isFinDeSemana?: boolean }[] = [
  { key: 'lunes', label: 'Lunes', abrev: 'L' },
  { key: 'martes', label: 'Martes', abrev: 'M' },
  { key: 'miercoles', label: 'Miércoles', abrev: 'X' },
  { key: 'jueves', label: 'Jueves', abrev: 'J' },
  { key: 'viernes', label: 'Viernes', abrev: 'V' },
  { key: 'sabado', label: 'Sábado', abrev: 'S', isFinDeSemana: true },
  { key: 'domingo', label: 'Domingo', abrev: 'D', isFinDeSemana: true },
];

export const formatFechaVisual = (fechaISO?: string): string => {
  if (!fechaISO) return '';
  const partes = fechaISO.split('-');
  if (partes.length === 3) {
    const [y, m, d] = partes;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return fechaISO;
};

export const defaultHorariosTurno = (): { M: HorariosSemana; T: HorariosSemana; N: HorariosSemana } => ({
  M: {
    lunes: { entrada: '06:00', salida: '14:00' },
    martes: { entrada: '06:00', salida: '14:00' },
    miercoles: { entrada: '06:00', salida: '14:00' },
    jueves: { entrada: '06:00', salida: '14:00' },
    viernes: { entrada: '06:00', salida: '14:00' },
    sabado: { entrada: '06:00', salida: '14:00' },
    domingo: { entrada: '06:00', salida: '14:00' },
  },
  T: {
    lunes: { entrada: '14:00', salida: '22:00' },
    martes: { entrada: '14:00', salida: '22:00' },
    miercoles: { entrada: '14:00', salida: '22:00' },
    jueves: { entrada: '14:00', salida: '22:00' },
    viernes: { entrada: '14:00', salida: '22:00' },
    sabado: { entrada: '14:00', salida: '22:00' },
    domingo: { entrada: '14:00', salida: '22:00' },
  },
  N: {
    lunes: { entrada: '22:00', salida: '06:00' },
    martes: { entrada: '22:00', salida: '06:00' },
    miercoles: { entrada: '22:00', salida: '06:00' },
    jueves: { entrada: '22:00', salida: '06:00' },
    viernes: { entrada: '22:00', salida: '06:00' },
    sabado: { entrada: '22:00', salida: '06:00' },
    domingo: { entrada: '22:00', salida: '06:00' },
  }
});

export const defaultTurnosDiasSinDivision = (): Record<DiaSemana, 'M' | 'T'> => ({
  lunes: 'M',
  martes: 'M',
  miercoles: 'M',
  jueves: 'M',
  viernes: 'M',
  sabado: 'M',
  domingo: 'M',
});

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
  horarios_turnos: defaultHorariosTurno(),
  festivos_detallados: [],
  festivos: [],
  dias_sin_servicio_detallados: [],
  dias_sin_servicio: [],
  plan_vacaciones: [],
  reglas_turnos: {
    min_agentes_division_mt: 4,
    turno_defecto_sin_division: 'M',
    turnos_dias_sin_division: defaultTurnosDiasSinDivision()
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
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'calendario' | 'vacaciones' | 'vigencias' | 'jornadas'>('general');
  const [turnoActivoHorario, setTurnoActivoHorario] = useState<TipoTurno>('M');

  // Form states para Calendario
  const [nuevoFestivoFecha, setNuevoFestivoFecha] = useState('');
  const [nuevoFestivoNombre, setNuevoFestivoNombre] = useState('');
  const [modoDiaSinServicio, setModoDiaSinServicio] = useState<'unico' | 'rango'>('unico');
  const [nuevoDiaSinServicioFecha, setNuevoDiaSinServicioFecha] = useState('');
  const [nuevoDiaSinServicioFechaFin, setNuevoDiaSinServicioFechaFin] = useState('');
  const [nuevoDiaSinServicioMotivo, setNuevoDiaSinServicioMotivo] = useState('');

  // Form state para Vigencias
  const [vigenciaGrupoId, setVigenciaGrupoId] = useState('');
  const [vigenciaFechaDesde, setVigenciaFechaDesde] = useState('');
  const [vigenciaDescripcion, setVigenciaDescripcion] = useState('');
  const [vigenciaInvertirCiclo, setVigenciaInvertirCiclo] = useState(false);
  const [vigenciaDivisionMT, setVigenciaDivisionMT] = useState(true);
  const [vigenciaRotacionInvertida, setVigenciaRotacionInvertida] = useState(false);

  // Form state para Jornadas Especiales
  const [nuevaJornadaNombre, setNuevaJornadaNombre] = useState('');
  const [nuevaJornadaTipoAlternancia, setNuevaJornadaTipoAlternancia] = useState<'SEMANAL' | 'FIJA'>('SEMANAL');
  const [nuevaJornadaTurnoBase, setNuevaJornadaTurnoBase] = useState<'M' | 'T' | 'N' | 'AUTO_REFUERZO'>('AUTO_REFUERZO');
  
  const [nuevaJornadaDiasFijos, setNuevaJornadaDiasFijos] = useState<number[]>([1,2,3,4,5]);
  const [nuevaJornadaDiasA, setNuevaJornadaDiasA] = useState<number[]>([1,2,3,4]);
  const [nuevaJornadaDiasB, setNuevaJornadaDiasB] = useState<number[]>([2,3,4,5]);


  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [docSnap, gruposSnap, agentesSnap] = await Promise.all([
          getDoc(doc(db, 'configuracion', 'anual')),
          getDocs(collection(db, 'grupos')),
          getDocs(collection(db, 'agentes'))
        ]);

        const loadedGrupos = gruposSnap.docs.map(d => ({ ...d.data(), id: d.id } as Grupo));
        const loadedAgentes = agentesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Agente));
        setGrupos(loadedGrupos);
        setAgentes(loadedAgentes);

        if (loadedGrupos.length > 0 && !vigenciaGrupoId) {
          setVigenciaGrupoId(loadedGrupos[0].id || '');
        }

        if (docSnap.exists()) {
          const data = docSnap.data() as ConfiguracionAnual;
          // Migración o valores por defecto y ordenación cronológica
          const festivosDetallados = (data.festivos_detallados || (data.festivos || []).map(f => ({ fecha: f, nombre: 'Festivo Oficial' })))
            .slice()
            .sort((a, b) => a.fecha.localeCompare(b.fecha));

          const diasSinServicioDetallados = (data.dias_sin_servicio_detallados || (data.dias_sin_servicio || []).map(d => ({ fecha: d, motivo: 'Sin Servicio Ordinario' })))
            .slice()
            .sort((a, b) => a.fecha.localeCompare(b.fecha));

          const reglasTurnos = {
            min_agentes_division_mt: data.reglas_turnos?.min_agentes_division_mt ?? 4,
            turno_defecto_sin_division: data.reglas_turnos?.turno_defecto_sin_division ?? 'M',
            turnos_dias_sin_division: data.reglas_turnos?.turnos_dias_sin_division || defaultTurnosDiasSinDivision(),
            division_semanal_vacaciones: data.reglas_turnos?.division_semanal_vacaciones ?? true
          };
          const horariosTurnos = data.horarios_turnos || defaultHorariosTurno();
          
          setConfig({
            ...defaultConfig,
            ...data,
            horarios_turnos: horariosTurnos,
            festivos_detallados: festivosDetallados,
            dias_sin_servicio_detallados: diasSinServicioDetallados,
            reglas_turnos: reglasTurnos
          });
        } else {
          const festivosDef = festivosNacionalesPorDefecto(defaultConfig.año).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
          const inicial = {
            ...defaultConfig,
            festivos_detallados: festivosDef,
            festivos: festivosDef.map(f => f.fecha)
          };
          await setDoc(doc(db, 'configuracion', 'anual'), inicial);
          setConfig(inicial);
        }
      } catch (error) {
        console.error("Error cargando configuración:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Ordenar listas cronológicamente antes de persistir
      const festivosOrdenados = [...(config.festivos_detallados || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const diasSinServicioOrdenados = [...(config.dias_sin_servicio_detallados || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));

      // Normalizar arrays de string para consultas directas
      const festivosStrings = festivosOrdenados.map(f => f.fecha);
      
      const diasSinServicioStrings: string[] = [];
      diasSinServicioOrdenados.forEach(d => {
        if (d.fecha_fin && d.fecha_fin > d.fecha) {
          try {
            const interval = eachDayOfInterval({
              start: parseISO(d.fecha),
              end: parseISO(d.fecha_fin)
            });
            interval.forEach(dia => {
              const str = format(dia, 'yyyy-MM-dd');
              if (!diasSinServicioStrings.includes(str)) {
                diasSinServicioStrings.push(str);
              }
            });
          } catch {
            if (!diasSinServicioStrings.includes(d.fecha)) diasSinServicioStrings.push(d.fecha);
          }
        } else {
          if (!diasSinServicioStrings.includes(d.fecha)) diasSinServicioStrings.push(d.fecha);
        }
      });

      const configToSave: ConfiguracionAnual = {
        ...config,
        festivos_detallados: festivosOrdenados,
        dias_sin_servicio_detallados: diasSinServicioOrdenados,
        festivos: festivosStrings,
        dias_sin_servicio: diasSinServicioStrings
      };

      // Sanitizar para asegurar que no se envíen campos undefined a Firestore
      const cleanData = JSON.parse(JSON.stringify(configToSave));

      await setDoc(doc(db, 'configuracion', 'anual'), cleanData);
      setConfig(prev => ({
        ...prev,
        festivos_detallados: festivosOrdenados,
        dias_sin_servicio_detallados: diasSinServicioOrdenados,
        festivos: festivosStrings,
        dias_sin_servicio: diasSinServicioStrings
      }));
      alert("Configuración guardada correctamente");
    } catch (err: any) {
      console.error("Error al guardar:", err);
      alert("Error al guardar la configuración: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleHorarioDiaChange = (turno: TipoTurno, dia: DiaSemana, campo: 'entrada' | 'salida', valor: string) => {
    setConfig(prev => {
      const turnosActuales = prev.horarios_turnos || defaultHorariosTurno();
      const turnoObj = { ...turnosActuales[turno] };
      turnoObj[dia] = { ...turnoObj[dia], [campo]: valor };

      return {
        ...prev,
        horarios_turnos: {
          ...turnosActuales,
          [turno]: turnoObj
        }
      };
    });
  };

  const handleCopiarHorario = (turno: TipoTurno, diaOrigen: DiaSemana, destino: 'laborables' | 'findesemana' | 'todos') => {
    setConfig(prev => {
      const turnosActuales = prev.horarios_turnos || defaultHorariosTurno();
      const turnoObj = { ...turnosActuales[turno] };
      const modelo = turnoObj[diaOrigen];

      DIAS_SEMANA.forEach(d => {
        if (destino === 'todos') {
          turnoObj[d.key] = { ...modelo };
        } else if (destino === 'laborables' && !d.isFinDeSemana) {
          turnoObj[d.key] = { ...modelo };
        } else if (destino === 'findesemana' && d.isFinDeSemana) {
          turnoObj[d.key] = { ...modelo };
        }
      });

      return {
        ...prev,
        horarios_turnos: {
          ...turnosActuales,
          [turno]: turnoObj
        }
      };
    });
  };

  const handleTurnoDiaSinDivisionChange = (dia: DiaSemana, turno: 'M' | 'T') => {
    setConfig(prev => {
      const diasActuales = prev.reglas_turnos?.turnos_dias_sin_division || defaultTurnosDiasSinDivision();
      return {
        ...prev,
        reglas_turnos: {
          ...prev.reglas_turnos,
          turnos_dias_sin_division: {
            ...diasActuales,
            [dia]: turno
          }
        }
      };
    });
  };

  const handlePresetDiasSinDivision = (preset: 'todos_m' | 'todos_t' | 'lv_m_sd_t' | 'lv_t_sd_m') => {
    setConfig(prev => {
      const nuevo: Record<DiaSemana, 'M' | 'T'> = {
        lunes: 'M',
        martes: 'M',
        miercoles: 'M',
        jueves: 'M',
        viernes: 'M',
        sabado: 'M',
        domingo: 'M',
      };

      DIAS_SEMANA.forEach(d => {
        if (preset === 'todos_m') {
          nuevo[d.key] = 'M';
        } else if (preset === 'todos_t') {
          nuevo[d.key] = 'T';
        } else if (preset === 'lv_m_sd_t') {
          nuevo[d.key] = d.isFinDeSemana ? 'T' : 'M';
        } else if (preset === 'lv_t_sd_m') {
          nuevo[d.key] = d.isFinDeSemana ? 'M' : 'T';
        }
      });

      return {
        ...prev,
        reglas_turnos: {
          ...prev.reglas_turnos,
          turnos_dias_sin_division: nuevo
        }
      };
    });
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

  const handleRemoveFestivo = (festivoToRemove: FestivoAnual) => {
    const lista = (config.festivos_detallados || []).filter(f => 
      f.id ? f.id !== festivoToRemove.id : (f.fecha !== festivoToRemove.fecha || f.nombre !== festivoToRemove.nombre)
    );
    setConfig(prev => ({ ...prev, festivos_detallados: lista }));
  };

  const handleCargarFestivosEstandar = () => {
    const estandar = festivosNacionalesPorDefecto(config.año || new Date().getFullYear().toString())
      .slice()
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    setConfig(prev => ({
      ...prev,
      festivos_detallados: estandar
    }));
  };

  // Gestión de Días sin Servicio
  const handleAddDiaSinServicio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoDiaSinServicioFecha || !nuevoDiaSinServicioMotivo) return;
    if (modoDiaSinServicio === 'rango' && !nuevoDiaSinServicioFechaFin) return;

    const nuevo: DiaSinServicio = {
      id: `${Date.now()}`,
      fecha: nuevoDiaSinServicioFecha,
      motivo: nuevoDiaSinServicioMotivo.trim(),
      ...(modoDiaSinServicio === 'rango' && nuevoDiaSinServicioFechaFin ? { fecha_fin: nuevoDiaSinServicioFechaFin } : {})
    };
    const lista = [...(config.dias_sin_servicio_detallados || []), nuevo].sort((a, b) => a.fecha.localeCompare(b.fecha));
    setConfig(prev => ({ ...prev, dias_sin_servicio_detallados: lista }));
    setNuevoDiaSinServicioFecha('');
    setNuevoDiaSinServicioFechaFin('');
    setNuevoDiaSinServicioMotivo('');
  };

  const handleRemoveDiaSinServicio = (diaToRemove: DiaSinServicio) => {
    const lista = (config.dias_sin_servicio_detallados || []).filter(d => 
      d.id ? d.id !== diaToRemove.id : (d.fecha !== diaToRemove.fecha || d.motivo !== diaToRemove.motivo)
    );
    setConfig(prev => ({ ...prev, dias_sin_servicio_detallados: lista }));
  };

  const autoSavePlanVacaciones = async (planActualizado: PlanVacacionesGrupo[]) => {
    try {
      const cleanPlan = JSON.parse(JSON.stringify(planActualizado));
      await updateDoc(doc(db, 'configuracion', 'anual'), {
        plan_vacaciones: cleanPlan
      });
    } catch (err) {
      console.error("Error al autoguardar plan_vacaciones:", err);
    }
  };

  // Gestión de Vacaciones por Grupo
  const handleUpdateMesVacacionesGrupo = async (grupoId: string, mesNum: number) => {
    const actual = [...(config.plan_vacaciones || [])];
    const index = actual.findIndex(p => p.id_grupo === grupoId);
    if (index >= 0) {
      actual[index] = { ...actual[index], meses: [mesNum] };
    } else {
      actual.push({ id_grupo: grupoId, meses: [mesNum] });
    }
    setConfig(prev => ({ ...prev, plan_vacaciones: actual }));
    await autoSavePlanVacaciones(actual);
  };

  // Gestión de Cobertura de Vacaciones por Grupo
  const handleToggleAgenteCobertura = async (grupoId: string, agenteId: string, destino: 'natural' | 'cobertura') => {
    const actual = [...(config.plan_vacaciones || [])];
    let index = actual.findIndex(p => p.id_grupo === grupoId);
    if (index === -1) {
      actual.push({ id_grupo: grupoId, meses: [7], cobertura: {} });
      index = actual.length - 1;
    }

    const cob = { ...(actual[index].cobertura || {}) };
    let natural = [...(cob.agentes_semana_natural || [])];
    let cobertura = [...(cob.agentes_semana_cobertura || [])];

    if (destino === 'natural') {
      if (natural.includes(agenteId)) {
        natural = natural.filter(id => id !== agenteId);
      } else {
        natural.push(agenteId);
        cobertura = cobertura.filter(id => id !== agenteId);
      }
    } else {
      if (cobertura.includes(agenteId)) {
        cobertura = cobertura.filter(id => id !== agenteId);
      } else {
        cobertura.push(agenteId);
        natural = natural.filter(id => id !== agenteId);
      }
    }

    actual[index] = {
      ...actual[index],
      cobertura: {
        turno_semana_natural: 'M',
        turno_semana_cobertura: 'T',
        ...cob,
        agentes_semana_natural: natural,
        agentes_semana_cobertura: cobertura
      }
    };
    setConfig(prev => ({ ...prev, plan_vacaciones: actual }));
    await autoSavePlanVacaciones(actual);
  };

  const handleUpdateTurnoCobertura = async (grupoId: string, campo: 'turno_semana_natural' | 'turno_semana_cobertura' | 'turno_grupo_reducido', turno: 'M' | 'T') => {
    const actual = [...(config.plan_vacaciones || [])];
    let index = actual.findIndex(p => p.id_grupo === grupoId);
    if (index === -1) {
      actual.push({ id_grupo: grupoId, meses: [7], cobertura: {} });
      index = actual.length - 1;
    }

    actual[index] = {
      ...actual[index],
      cobertura: {
        turno_semana_natural: 'M',
        turno_semana_cobertura: 'T',
        ...(actual[index].cobertura || {}),
        [campo]: turno
      }
    };
    setConfig(prev => ({ ...prev, plan_vacaciones: actual }));
    await autoSavePlanVacaciones(actual);
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

  const handleAddJornadaEspecial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaJornadaNombre) return;

    const nueva: JornadaEspecial = {
      id: Date.now().toString(),
      nombre: nuevaJornadaNombre,
      tipo_alternancia: nuevaJornadaTipoAlternancia,
      turno_base: nuevaJornadaTurnoBase,
      ...(nuevaJornadaTipoAlternancia === 'FIJA' ? { dias_fijos: nuevaJornadaDiasFijos } : { dias_semana_a: nuevaJornadaDiasA, dias_semana_b: nuevaJornadaDiasB })
    };

    setConfig({
      ...config,
      jornadas_especiales: [...(config.jornadas_especiales || []), nueva]
    });

    setNuevaJornadaNombre('');
  };

  const toggleDiaArray = (dia: number, array: number[], setter: React.Dispatch<React.SetStateAction<number[]>>) => {
    if (array.includes(dia)) {
      setter(array.filter(d => d !== dia));
    } else {
      setter([...array, dia]);
    }
  };

  const handleRemoveJornadaEspecial = (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta Jornada Especial? Si hay agentes asignados a ella podrían dar error.")) return;
    setConfig({
      ...config,
      jornadas_especiales: (config.jornadas_especiales || []).filter(j => j.id !== id)
    });
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
        <button
          onClick={() => setActiveTab('jornadas')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 transition-colors shrink-0 ${activeTab === 'jornadas' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <ArrowLeftRight size={15} /> Jornadas Especiales
        </button>
      </div>

      {/* CONTENIDO PESTAÑA 1: GENERAL Y TARIFAS */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Parámetros Globales */}
            <div className="bg-slate-900/50 p-4 rounded border border-slate-800 space-y-4">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                <Clock size={14} className="text-indigo-400" /> Parámetros Globales
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

              <div className="bg-slate-950/60 p-3 rounded border border-slate-800/80 text-[10px] font-mono text-slate-400 space-y-1.5">
                <span className="text-indigo-400 font-bold uppercase tracking-wider block">Horarios Oficiales</span>
                <p>Define las horas de entrada y salida diferenciadas para cada turno y día de la semana. Estos tramos rigen la asignación de servicio y el cálculo de horas extraordinarias.</p>
              </div>
            </div>

            {/* Matriz de Horarios por Turno y Día */}
            <div className="bg-slate-900/50 p-4 rounded border border-slate-800 space-y-4 md:col-span-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-2">
                <h2 className="text-[10px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                  <SunMedium size={14} className="text-amber-400" /> Horarios de Entrada y Salida Diferenciados
                </h2>
                
                {/* Selector de Turno */}
                <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setTurnoActivoHorario('M')}
                    className={`px-3 py-1 rounded font-bold transition-colors ${turnoActivoHorario === 'M' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Mañana (M)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTurnoActivoHorario('T')}
                    className={`px-3 py-1 rounded font-bold transition-colors ${turnoActivoHorario === 'T' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Tarde (T)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTurnoActivoHorario('N')}
                    className={`px-3 py-1 rounded font-bold transition-colors ${turnoActivoHorario === 'N' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Noche (N)
                  </button>
                </div>
              </div>

              {/* Botones de acción rápida */}
              <div className="flex flex-wrap items-center gap-2 bg-slate-950/80 p-2 rounded border border-slate-800 text-[10px] font-mono">
                <span className="text-slate-500 uppercase tracking-wider text-[9px] mr-1">Atajos rápidos ({turnoActivoHorario}):</span>
                <button
                  type="button"
                  onClick={() => handleCopiarHorario(turnoActivoHorario, 'lunes', 'laborables')}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700/80 transition-colors flex items-center gap-1"
                  title="Copia el horario del Lunes a todos los días laborables (L-V)"
                >
                  <Copy size={11} className="text-indigo-400" /> Copiar Lunes a L-V
                </button>
                <button
                  type="button"
                  onClick={() => handleCopiarHorario(turnoActivoHorario, 'sabado', 'findesemana')}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700/80 transition-colors flex items-center gap-1"
                  title="Copia el horario del Sábado al Domingo"
                >
                  <Copy size={11} className="text-amber-400" /> Copiar Sábado a S-D
                </button>
                <button
                  type="button"
                  onClick={() => handleCopiarHorario(turnoActivoHorario, 'lunes', 'todos')}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700/80 transition-colors flex items-center gap-1"
                  title="Copia el horario del Lunes a toda la semana (L-D)"
                >
                  <Copy size={11} className="text-emerald-400" /> Aplicar Lunes a toda la semana
                </button>
              </div>

              {/* Tabla de los 7 días de la semana */}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px] border-collapse">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-normal tracking-widest">DÍA</th>
                      <th className="px-3 py-2 font-normal tracking-widest text-center">ENTRADA</th>
                      <th className="px-3 py-2 font-normal tracking-widest text-center">SALIDA</th>
                      <th className="px-3 py-2 font-normal tracking-widest text-center">JORNADA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DIAS_SEMANA.map((dia) => {
                      const turnoData = (config.horarios_turnos || defaultHorariosTurno())[turnoActivoHorario];
                      const diaData = turnoData?.[dia.key] || { entrada: '06:00', salida: '14:00' };

                      // Cálculo visual de duración
                      const [hE, mE] = diaData.entrada.split(':').map(Number);
                      const [hS, mS] = diaData.salida.split(':').map(Number);
                      let durMin = (hS * 60 + (mS || 0)) - (hE * 60 + (mE || 0));
                      if (durMin <= 0) durMin += 24 * 60;
                      const durStr = `${Math.floor(durMin / 60)}h${durMin % 60 !== 0 ? ` ${durMin % 60}m` : ''}`;

                      return (
                        <tr key={dia.key} className={`border-b border-slate-800/40 hover:bg-indigo-500/5 ${dia.isFinDeSemana ? 'bg-slate-950/30' : ''}`}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${dia.isFinDeSemana ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-300'}`}>
                                {dia.abrev}
                              </span>
                              <span className={`font-bold ${dia.isFinDeSemana ? 'text-amber-300' : 'text-slate-200'}`}>
                                {dia.label}
                              </span>
                              {dia.isFinDeSemana && (
                                <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded uppercase">FDS</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input 
                              type="time" 
                              value={diaData.entrada}
                              onChange={e => handleHorarioDiaChange(turnoActivoHorario, dia.key, 'entrada', e.target.value)}
                              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-center font-mono text-[11px] text-slate-200 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input 
                              type="time" 
                              value={diaData.salida}
                              onChange={e => handleHorarioDiaChange(turnoActivoHorario, dia.key, 'salida', e.target.value)}
                              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-center font-mono text-[11px] text-slate-200 outline-none focus:border-indigo-500 [color-scheme:dark]" 
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                              {durStr}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                    <th className="px-3 py-2 font-normal tracking-widest w-36">FECHA (DD/MM/AAAA)</th>
                    <th className="px-3 py-2 font-normal tracking-widest">FESTIVIDAD / MOTIVO</th>
                    <th className="px-3 py-2 font-normal tracking-widest text-right w-20">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(config.festivos_detallados || [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((festivo, index) => (
                    <tr key={festivo.id || `${festivo.fecha}-${index}`} className="border-b border-slate-800/50 hover:bg-rose-500/5">
                      <td className="px-3 py-2 text-slate-600">{index + 1}</td>
                      <td className="px-3 py-2 text-rose-400 font-bold">{formatFechaVisual(festivo.fecha)}</td>
                      <td className="px-3 py-2 text-slate-300">{festivo.nombre}</td>
                      <td className="px-3 py-2 text-right">
                        <button 
                          onClick={() => handleRemoveFestivo(festivo)}
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
            <div className="border-b border-slate-800 pb-3 flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-[11px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert size={15} className="text-amber-400" /> Fechas sin Servicios Ordinarios (Ocasionales / Eventos)
                </h2>
                <p className="text-[10px] font-mono text-slate-500">Días especiales o períodos donde la jornada habitual queda suspendida o cubierta mediante servicios extraordinarios</p>
              </div>
              <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setModoDiaSinServicio('unico')}
                  className={`px-2.5 py-1 rounded transition-colors ${modoDiaSinServicio === 'unico' ? 'bg-amber-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Día Concreto
                </button>
                <button
                  type="button"
                  onClick={() => setModoDiaSinServicio('rango')}
                  className={`px-2.5 py-1 rounded transition-colors ${modoDiaSinServicio === 'rango' ? 'bg-amber-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Rango (Inicio - Fin)
                </button>
              </div>
            </div>

            <form onSubmit={handleAddDiaSinServicio} className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-950/60 p-3 rounded border border-slate-800/80 items-end">
              {modoDiaSinServicio === 'unico' ? (
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
              ) : (
                <>
                  <div className="sm:col-span-3">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha Inicio</label>
                    <input 
                      required 
                      type="date" 
                      value={nuevoDiaSinServicioFecha} 
                      onChange={e => setNuevoDiaSinServicioFecha(e.target.value)} 
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-amber-500 [color-scheme:dark]" 
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha Fin (Inclusive)</label>
                    <input 
                      required 
                      type="date" 
                      min={nuevoDiaSinServicioFecha}
                      value={nuevoDiaSinServicioFechaFin} 
                      onChange={e => setNuevoDiaSinServicioFechaFin(e.target.value)} 
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-amber-500 [color-scheme:dark]" 
                    />
                  </div>
                </>
              )}

              <div className={modoDiaSinServicio === 'unico' ? "sm:col-span-6" : "sm:col-span-4"}>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Motivo / Evento</label>
                <input 
                  required 
                  type="text" 
                  placeholder={modoDiaSinServicio === 'unico' ? "Ej. Nochevieja / Cobertura extraordinaria" : "Ej. Fiestas Patronales / Dispositivo Especial"} 
                  value={nuevoDiaSinServicioMotivo} 
                  onChange={e => setNuevoDiaSinServicioMotivo(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-amber-500" 
                />
              </div>

              <div className="sm:col-span-2">
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
                    <th className="px-3 py-2 font-normal tracking-widest w-52">FECHA / PERÍODO (DD/MM/AAAA)</th>
                    <th className="px-3 py-2 font-normal tracking-widest">MOTIVO / EVENTO</th>
                    <th className="px-3 py-2 font-normal tracking-widest text-right w-20">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(config.dias_sin_servicio_detallados || [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((dia, index) => {
                    const esRango = dia.fecha_fin && dia.fecha_fin !== dia.fecha;
                    let diasCount = 1;
                    if (esRango) {
                      try {
                        diasCount = differenceInCalendarDays(parseISO(dia.fecha_fin!), parseISO(dia.fecha)) + 1;
                      } catch {
                        diasCount = 1;
                      }
                    }

                    return (
                      <tr key={dia.id || `${dia.fecha}-${index}`} className="border-b border-slate-800/50 hover:bg-amber-500/5">
                        <td className="px-3 py-2 text-amber-400 font-bold">
                          {esRango ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{formatFechaVisual(dia.fecha)}</span>
                              <span className="text-slate-500">→</span>
                              <span>{formatFechaVisual(dia.fecha_fin)}</span>
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {diasCount} {diasCount === 1 ? 'día' : 'días'}
                              </span>
                            </div>
                          ) : (
                            <span>{formatFechaVisual(dia.fecha)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-300">{dia.motivo}</td>
                        <td className="px-3 py-2 text-right">
                          <button 
                            onClick={() => handleRemoveDiaSinServicio(dia)}
                            className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                            title="Eliminar evento"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
          <div className="bg-slate-900/50 p-5 rounded border border-slate-800 space-y-5">
            <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h2 className="text-[11px] font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                  <Users size={15} className="text-sky-400" /> Reglas de División Mañana / Tarde (M / T)
                </h2>
                <p className="text-[10px] font-mono text-slate-500">
                  Configuración de división al 50% para grupos grandes y asignación específica por día para grupos pequeños
                </p>
              </div>
            </div>

            {/* Umbral de División */}
            <div className="bg-slate-950/60 p-4 rounded border border-slate-800/80">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                Mínimo de Agentes en Grupo para División M/T Simultánea (50% Mañana / 50% Tarde)
              </label>
              <div className="flex items-center gap-3 mt-1">
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
                  className="w-24 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-[12px] font-mono font-bold text-sky-400 outline-none focus:border-sky-500 text-center" 
                />
                <span className="text-[10px] font-mono text-slate-500 leading-tight">
                  {`Grupos con ≥ ${config.reglas_turnos?.min_agentes_division_mt ?? 4} agentes se dividen automáticamente entre M y T. Grupos con menos de ${config.reglas_turnos?.min_agentes_division_mt ?? 4} agentes siguen la asignación por día configurada abajo.`}
                </span>
              </div>
            </div>

            {/* Asignación Día a Día para Grupos Pequeños */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h3 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={13} /> Asignación de Turno por Día para Grupos con &lt; {config.reglas_turnos?.min_agentes_division_mt ?? 4} Agentes
                  </h3>
                  <p className="text-[9px] font-mono text-slate-500">
                    Selecciona qué turno realizará todo el grupo cada día de la semana cuando no alcance el umbral de división:
                  </p>
                </div>

                {/* Presets Rápidos */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[9px] font-mono text-slate-500 mr-1 uppercase">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handlePresetDiasSinDivision('todos_m')}
                    className="bg-slate-950 hover:bg-slate-800 text-sky-400 px-2 py-1 rounded text-[9px] font-mono border border-sky-500/30 transition-colors"
                  >
                    Todos M
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetDiasSinDivision('todos_t')}
                    className="bg-slate-950 hover:bg-slate-800 text-amber-400 px-2 py-1 rounded text-[9px] font-mono border border-amber-500/30 transition-colors"
                  >
                    Todos T
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetDiasSinDivision('lv_m_sd_t')}
                    className="bg-slate-950 hover:bg-slate-800 text-indigo-300 px-2 py-1 rounded text-[9px] font-mono border border-slate-700 transition-colors"
                  >
                    L-V (M) / S-D (T)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetDiasSinDivision('lv_t_sd_m')}
                    className="bg-slate-950 hover:bg-slate-800 text-indigo-300 px-2 py-1 rounded text-[9px] font-mono border border-slate-700 transition-colors"
                  >
                    L-V (T) / S-D (M)
                  </button>
                </div>
              </div>

              {/* Matriz 7 Días */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 pt-1">
                {DIAS_SEMANA.map((dia) => {
                  const diasMap = config.reglas_turnos?.turnos_dias_sin_division || defaultTurnosDiasSinDivision();
                  const turnoActual = diasMap[dia.key] || config.reglas_turnos?.turno_defecto_sin_division || 'M';
                  const esM = turnoActual === 'M';

                  return (
                    <div 
                      key={dia.key} 
                      className={`p-3 rounded border text-center flex flex-col items-center justify-between gap-2 transition-all ${dia.isFinDeSemana ? 'bg-slate-950/70 border-amber-500/20' : 'bg-slate-950/40 border-slate-800'}`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${dia.isFinDeSemana ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-300'}`}>
                          {dia.abrev}
                        </span>
                        <span className="text-[10px] font-bold text-slate-300 font-mono mt-0.5">{dia.label}</span>
                        {dia.isFinDeSemana && <span className="text-[7px] text-amber-400 uppercase font-mono">Fin de Semana</span>}
                      </div>

                      {/* Botón Toggle M / T */}
                      <div className="flex w-full bg-slate-900 p-0.5 rounded border border-slate-800 text-[10px] font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => handleTurnoDiaSinDivisionChange(dia.key, 'M')}
                          className={`flex-1 py-1 rounded transition-colors ${esM ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}
                          title={`Asignar Mañana para ${dia.label}`}
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTurnoDiaSinDivisionChange(dia.key, 'T')}
                          className={`flex-1 py-1 rounded transition-colors ${!esM ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}
                          title={`Asignar Tarde para ${dia.label}`}
                        >
                          T
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                const agentesGrupo = agentes.filter(a => a.id_grupo === grupo.id);
                const cob = plan?.cobertura || {};
                const asignadosNatural = cob.agentes_semana_natural || [];
                const asignadosCobertura = cob.agentes_semana_cobertura || [];

                return (
                  <div key={grupo.id} className="bg-slate-950/80 p-4 rounded border border-slate-800/80 space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-[12px] font-bold text-indigo-400 uppercase font-mono">{grupo.nombre}</span>
                      <span className="text-[9px] font-mono text-slate-500 uppercase">{agentesGrupo.length} efectivos</span>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
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

                    {/* Panel de Configuración de Cobertura y Turnos */}
                    <div className="bg-slate-900/70 p-3 rounded border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                          <Users size={12} className="text-sky-400" /> Plan de Cobertura cuando cubre a otro grupo
                        </span>
                      </div>

                      {agentesGrupo.length >= 4 ? (
                        <div className="space-y-3">
                          {/* Pareja 1: Semana Natural */}
                          <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">
                                Pareja 1 (Semana Natural: 1 y 3)
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-mono text-slate-500 uppercase">Turno:</span>
                                <select
                                  value={cob.turno_semana_natural || 'M'}
                                  onChange={e => handleUpdateTurnoCobertura(grupo.id!, 'turno_semana_natural', e.target.value as 'M' | 'T')}
                                  className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[9px] font-mono font-bold text-sky-400 outline-none"
                                >
                                  <option value="M">Mañana (M)</option>
                                  <option value="T">Tarde (T)</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {agentesGrupo.map(ag => {
                                const isNatural = asignadosNatural.includes(ag.id!);
                                return (
                                  <button
                                    key={ag.id}
                                    type="button"
                                    onClick={() => handleToggleAgenteCobertura(grupo.id!, ag.id!, 'natural')}
                                    className={`px-2 py-1 rounded text-[9px] font-mono border transition-all flex items-center gap-1 ${
                                      isNatural
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 font-bold shadow-sm'
                                        : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                                    }`}
                                  >
                                    #{ag.placa} {ag.nombre}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Pareja 2: Semana Cobertura */}
                          <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest">
                                Pareja 2 (Semana Cobertura: 2 y 4)
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-mono text-slate-500 uppercase">Turno:</span>
                                <select
                                  value={cob.turno_semana_cobertura || 'T'}
                                  onChange={e => handleUpdateTurnoCobertura(grupo.id!, 'turno_semana_cobertura', e.target.value as 'M' | 'T')}
                                  className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[9px] font-mono font-bold text-amber-400 outline-none"
                                >
                                  <option value="M">Mañana (M)</option>
                                  <option value="T">Tarde (T)</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {agentesGrupo.map(ag => {
                                const isCob = asignadosCobertura.includes(ag.id!);
                                return (
                                  <button
                                    key={ag.id}
                                    type="button"
                                    onClick={() => handleToggleAgenteCobertura(grupo.id!, ag.id!, 'cobertura')}
                                    className={`px-2 py-1 rounded text-[9px] font-mono border transition-all flex items-center gap-1 ${
                                      isCob
                                        ? 'bg-purple-500/20 text-purple-300 border-purple-500 font-bold shadow-sm'
                                        : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                                    }`}
                                  >
                                    #{ag.placa} {ag.nombre}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Grupo Reducido < 4 agentes */
                        <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">
                              Turno Grupo Reducido (&lt; 4 Agentes)
                            </span>
                            <select
                              value={cob.turno_grupo_reducido || 'M'}
                              onChange={e => handleUpdateTurnoCobertura(grupo.id!, 'turno_grupo_reducido', e.target.value as 'M' | 'T')}
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[9px] font-mono font-bold text-sky-400 outline-none"
                            >
                              <option value="M">Mañana (M)</option>
                              <option value="T">Tarde (T)</option>
                            </select>
                          </div>
                          <p className="text-[8px] font-mono text-slate-500">
                            Todos los efectivos trabajarán juntos en su semana natural realizando este turno.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Regla de Cobertura entre Semanas en Vacaciones */}
            <div className="bg-slate-950/60 p-4 rounded border border-indigo-500/20 space-y-3 mt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                    <ArrowLeftRight size={13} className="text-indigo-400" />
                    División Semanal al 50% durante Vacaciones (Grupos ≥ 4 Agentes)
                  </h3>
                  <p className="text-[9px] font-mono text-slate-400 mt-0.5">
                    Cuando un grupo disfruta de su mes de vacaciones, si el grupo activo tiene ≥ 4 agentes operativos, se divide automáticamente al 50% entre semanas:
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={config.reglas_turnos?.division_semanal_vacaciones ?? true}
                    onChange={e => setConfig({
                      ...config,
                      reglas_turnos: {
                        ...config.reglas_turnos,
                        division_semanal_vacaciones: e.target.checked
                      }
                    })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ml-2 text-[10px] font-mono text-slate-300 font-bold">
                    {(config.reglas_turnos?.division_semanal_vacaciones ?? true) ? 'ACTIVADA' : 'DESACTIVADA'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px] font-mono">
                <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800 flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓ Con ≥ 4 agentes:</span>
                  <span className="text-slate-400">2 agentes trabajan su semana natural (Semana 1 y 3) y los otros 2 cubren la semana del grupo en vacaciones (Semana 2 y 4). Cobertura ininterrumpida las 4 semanas.</span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800 flex items-start gap-2">
                  <span className="text-amber-400 font-bold">⚠ Con &lt; 4 agentes:</span>
                  <span className="text-slate-400">Todos los agentes del grupo trabajan juntos en su semana natural y descansan en la alterna (no se dividen por seguridad y descanso).</span>
                </div>
              </div>
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
                            <th className="px-3 py-2 font-normal tracking-widest w-36">DESDE (DD/MM/AAAA)</th>
                            <th className="px-3 py-2 font-normal tracking-widest">DESCRIPCIÓN</th>
                            <th className="px-3 py-2 font-normal tracking-widest">INVERSIÓN CICLO</th>
                            <th className="px-3 py-2 font-normal tracking-widest">DIVISIÓN M/T</th>
                            <th className="px-3 py-2 font-normal tracking-widest text-right w-16">ELIMINAR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...(grupo.vigencias || [])].sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde)).map((vigencia) => (
                            <tr key={vigencia.id} className="border-b border-slate-800/50 hover:bg-indigo-500/5">
                              <td className="px-3 py-2 text-indigo-400 font-bold">{formatFechaVisual(vigencia.fecha_desde)}</td>
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
                                Sin vigencias programadas (sigue el patrón base {formatFechaVisual(grupo.patron_inicio)}).
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

      {/* CONTENIDO PESTAÑA 5: JORNADAS ESPECIALES */}
      {activeTab === 'jornadas' && (
        <div className="space-y-6">
          <div className="bg-slate-900/50 p-6 rounded border border-slate-800">
            <h2 className="text-[10px] font-bold text-slate-100 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
              <ArrowLeftRight size={14} className="text-indigo-400" /> Plantillas de Jornadas Especiales y Comodín
            </h2>
            <p className="text-[10px] font-mono text-slate-400 mb-6">
              Diseña modalidades de jornada (como el Turno Comodín de 4 días) que luego podrás asignar individualmente a cualquier agente desde la sección Plantilla.
            </p>

            <form onSubmit={handleAddJornadaEspecial} className="bg-slate-950 p-4 rounded border border-slate-800 mb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre (ej. Comodín 4D)</label>
                  <input 
                    type="text" 
                    required
                    value={nuevaJornadaNombre}
                    onChange={e => setNuevaJornadaNombre(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" 
                    placeholder="Turno Especial..."
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Alternancia Semanal</label>
                  <select 
                    value={nuevaJornadaTipoAlternancia}
                    onChange={e => setNuevaJornadaTipoAlternancia(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
                  >
                    <option value="SEMANAL">Semana A / Semana B (Alterna)</option>
                    <option value="FIJA">Jornada Fija (Mismos días siempre)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Turno Base (Día)</label>
                  <select 
                    value={nuevaJornadaTurnoBase}
                    onChange={e => setNuevaJornadaTurnoBase(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
                  >
                    <option value="AUTO_REFUERZO">Auto Refuerzo (Completa grupo 3)</option>
                    <option value="M">Mañana (M)</option>
                    <option value="T">Tarde (T)</option>
                    <option value="N">Noche (N)</option>
                  </select>
                </div>
              </div>

              {/* Selección de Días Dinámica */}
              <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
                {nuevaJornadaTipoAlternancia === 'FIJA' ? (
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Días de Trabajo (Fijo)</label>
                    <div className="flex flex-wrap gap-2">
                      {[{n: 1, l: 'L'}, {n: 2, l: 'M'}, {n: 3, l: 'X'}, {n: 4, l: 'J'}, {n: 5, l: 'V'}, {n: 6, l: 'S'}, {n: 0, l: 'D'}].map(dia => (
                        <button
                          key={dia.n}
                          type="button"
                          onClick={() => toggleDiaArray(dia.n, nuevaJornadaDiasFijos, setNuevaJornadaDiasFijos)}
                          className={`w-8 h-8 rounded text-[11px] font-bold flex items-center justify-center transition-colors ${nuevaJornadaDiasFijos.includes(dia.n) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                          {dia.l}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Días de Trabajo (Semana A)</label>
                      <div className="flex flex-wrap gap-2">
                        {[{n: 1, l: 'L'}, {n: 2, l: 'M'}, {n: 3, l: 'X'}, {n: 4, l: 'J'}, {n: 5, l: 'V'}, {n: 6, l: 'S'}, {n: 0, l: 'D'}].map(dia => (
                          <button
                            key={dia.n}
                            type="button"
                            onClick={() => toggleDiaArray(dia.n, nuevaJornadaDiasA, setNuevaJornadaDiasA)}
                            className={`w-8 h-8 rounded text-[11px] font-bold flex items-center justify-center transition-colors ${nuevaJornadaDiasA.includes(dia.n) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                          >
                            {dia.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-fuchsia-400 uppercase tracking-widest mb-2">Días de Trabajo (Semana B)</label>
                      <div className="flex flex-wrap gap-2">
                        {[{n: 1, l: 'L'}, {n: 2, l: 'M'}, {n: 3, l: 'X'}, {n: 4, l: 'J'}, {n: 5, l: 'V'}, {n: 6, l: 'S'}, {n: 0, l: 'D'}].map(dia => (
                          <button
                            key={dia.n}
                            type="button"
                            onClick={() => toggleDiaArray(dia.n, nuevaJornadaDiasB, setNuevaJornadaDiasB)}
                            className={`w-8 h-8 rounded text-[11px] font-bold flex items-center justify-center transition-colors ${nuevaJornadaDiasB.includes(dia.n) ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                          >
                            {dia.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  type="submit" 
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase py-2 px-6 rounded flex items-center gap-1.5 transition-colors"
                >
                  <Plus size={14} /> Crear Jornada Especial
                </button>
              </div>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[10px] border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-normal tracking-widest">NOMBRE</th>
                    <th className="px-3 py-2 font-normal tracking-widest">DÍAS DE TRABAJO</th>
                    <th className="px-3 py-2 font-normal tracking-widest">TURNO ASIGNADO</th>
                    <th className="px-3 py-2 font-normal tracking-widest text-right">ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {(config.jornadas_especiales || []).map((jornada) => (
                    <tr key={jornada.id} className="border-b border-slate-800/50 hover:bg-indigo-500/5">
                      <td className="px-3 py-3 text-indigo-400 font-bold">{jornada.nombre}</td>
                      <td className="px-3 py-3 text-slate-300">
                        {jornada.tipo_alternancia === 'SEMANAL' && 'Alterna (Semana A / Semana B)'}
                        {jornada.tipo_alternancia === 'FIJA' && 'Fija (Mismos días)'}
                      </td>
                      <td className="px-3 py-3">
                        {jornada.turno_base === 'AUTO_REFUERZO' && <span className="text-amber-400 font-bold border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 rounded">Comodín Auto-Refuerzo</span>}
                        {jornada.turno_base === 'M' && <span className="text-sky-400 font-bold border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 rounded">Mañana Fija</span>}
                        {jornada.turno_base === 'T' && <span className="text-orange-400 font-bold border border-orange-400/30 bg-orange-400/10 px-1.5 py-0.5 rounded">Tarde Fija</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button 
                          onClick={() => handleRemoveJornadaEspecial(jornada.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!config.jornadas_especiales || config.jornadas_especiales.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-slate-500 text-[10px]">
                        No hay jornadas especiales configuradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
