import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ConfiguracionAnual } from '../types';
import { Save } from 'lucide-react';

const defaultConfig: ConfiguracionAnual = {
  año: new Date().getFullYear().toString(),
  horarios_base: { entrada: '06:00', salida: '14:00' },
  festivos: [],
  dias_sin_servicio: [],
  tarifas_extras: {
    'Agente': { laborable_diurna: 20, laborable_nocturna: 25, festivo_diurna: 30, festivo_nocturna: 35 },
    'Oficial': { laborable_diurna: 25, laborable_nocturna: 30, festivo_diurna: 35, festivo_nocturna: 40 },
    'Oficial-Jefe': { laborable_diurna: 30, laborable_nocturna: 35, festivo_diurna: 40, festivo_nocturna: 45 }
  }
};

export default function Configuracion() {
  const [config, setConfig] = useState<ConfiguracionAnual>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const docRef = doc(db, 'configuracion', 'anual');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setConfig(docSnap.data() as ConfiguracionAnual);
        } else {
          await setDoc(docRef, defaultConfig);
          setConfig(defaultConfig);
        }
      } catch (error) {
        console.error("Error cargando configuracion:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await setDoc(doc(db, 'configuracion', 'anual'), config);
    setSaving(false);
    alert("Configuración guardada");
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

  if (loading) return <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest p-4">Cargando configuración...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-sm font-bold text-slate-100 uppercase tracking-widest">Configuración Base</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/50 p-4 rounded border border-slate-800 space-y-4">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">Parámetros Generales</h2>
          
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Año de Planificación</label>
            <input 
              type="text" 
              value={config.año}
              onChange={e => setConfig({...config, año: e.target.value})}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Entrada Base</label>
              <input 
                type="time" 
                value={config.horarios_base.entrada}
                onChange={e => setConfig({...config, horarios_base: {...config.horarios_base, entrada: e.target.value}})}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Salida Base</label>
              <input 
                type="time" 
                value={config.horarios_base.salida}
                onChange={e => setConfig({...config, horarios_base: {...config.horarios_base, salida: e.target.value}})}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500 [color-scheme:dark]" 
              />
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
                    <td className="px-3 py-2 text-indigo-400">{cat.toUpperCase()}</td>
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
    </div>
  );
}
