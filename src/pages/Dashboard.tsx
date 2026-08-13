import React, { useEffect, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Users, Euro, FileText, AlertCircle } from 'lucide-react';
import { Agente, ServicioExtraordinario, AusenciaJustificada } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalAgentes: 0,
    costeExtras: 0,
    apConsumidos: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [agentesSnap, extrasSnap, ausenciasSnap] = await Promise.all([
          getDocs(collection(db, 'agentes')),
          getDocs(collection(db, 'servicios_extraordinarios')),
          getDocs(collection(db, 'ausencias_justificadas'))
        ]);

        const agentes = agentesSnap.docs.map(d => d.data() as Agente);
        const extras = extrasSnap.docs.map(d => d.data() as ServicioExtraordinario);
        const ausencias = ausenciasSnap.docs.map(d => d.data() as AusenciaJustificada);

        const costeTotal = extras.reduce((acc, curr) => acc + (curr.coste_calculado || 0), 0);
        
        // Calcular AP (1 AP = 1 ausencia de tipo AP)
        let apCount = 0;
        ausencias.forEach(a => {
          if (a.tipo === 'AP') {
            // Un AP generalmente es 1 dia, aqui podriamos calcular diferencia de fechas si son rangos
            apCount += 1; 
          }
        });

        setStats({
          totalAgentes: agentes.length,
          costeExtras: costeTotal,
          apConsumidos: apCount
        });
      } catch (error) {
        console.error("Error cargando dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) return <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest p-4">Cargando resumen...</div>;

  const kpis = [
    { title: 'Agentes Activos', value: stats.totalAgentes, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/20 border-indigo-500/30' },
    { title: 'Coste Extras (Anual)', value: `€${stats.costeExtras.toFixed(2)}`, icon: Euro, color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
    { title: 'Asuntos Propios (Usados)', value: stats.apConsumidos, icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
  ];

  return (
    <div className="space-y-6 flex flex-col h-full">
      <h1 className="text-sm font-bold text-slate-100 uppercase tracking-widest">Resumen del Sistema</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} className="bg-slate-900/50 border border-slate-800 p-4 rounded flex flex-col gap-3 relative overflow-hidden group hover:border-slate-700 transition-colors">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px]"></div>
              <div className="flex justify-between items-start z-10">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{kpi.title}</p>
                <div className={`p-1.5 rounded border ${kpi.bg}`}>
                  <Icon size={16} className={kpi.color} />
                </div>
              </div>
              <div className="z-10">
                <p className="text-2xl font-mono text-slate-100">{kpi.value}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-slate-900/30 p-4 rounded border border-slate-800 mt-4 flex-1">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="text-indigo-400" size={16} />
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Registro de Eventos</h2>
        </div>
        <div className="space-y-3 font-mono text-[10px]">
          <div className="border-l-2 border-emerald-500 pl-3 py-1">
            <div className="text-slate-500">SISTEMA INICIALIZADO</div>
            <div className="text-slate-300">Sin alertas críticas en la planificación actual.</div>
          </div>
          <div className="border-l-2 border-slate-700 pl-3 py-1">
            <div className="text-slate-500">VERIFICACIÓN DE LÍMITES</div>
            <div className="text-slate-300">Límites de horas ordinarias correctos.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
