import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Agente, CategoriaAgente, Grupo } from '../types';
import { UserPlus, Trash2, Edit2 } from 'lucide-react';

export default function Plantilla() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [nombre, setNombre] = useState('');
  const [placa, setPlaca] = useState('');
  const [categoria, setCategoria] = useState<CategoriaAgente>('Agente');
  const [idGrupo, setIdGrupo] = useState('');
  const [apTotal, setApTotal] = useState(6);

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentesSnap, gruposSnap] = await Promise.all([
        getDocs(collection(db, 'agentes')),
        getDocs(collection(db, 'grupos'))
      ]);
      
      let currentGrupos = gruposSnap.docs.map(d => ({ ...d.data(), id: d.id } as Grupo));
      let currentAgentes = agentesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Agente));
      
      // Create a default group if none exists just for the demo
      if (gruposSnap.empty) {
        const gDoc = await addDoc(collection(db, 'grupos'), { nombre: 'Grupo A', patron_inicio: '2026-01-01' });
        currentGrupos = [{ id: gDoc.id, nombre: 'Grupo A', patron_inicio: '2026-01-01' }];
      }

      if (agentesSnap.empty) {
        const aDoc = await addDoc(collection(db, 'agentes'), {
          nombre: 'Agente Demo',
          placa: '1234',
          categoria: 'Agente',
          id_grupo: currentGrupos[0]?.id ?? '',
          asuntos_propios_total: 6
        });
        currentAgentes = [{ id: aDoc.id, nombre: 'Agente Demo', placa: '1234', categoria: 'Agente', id_grupo: currentGrupos[0]?.id ?? '', asuntos_propios_total: 6 }];
      }

      setGrupos(currentGrupos);
      setAgentes(currentAgentes);
    } catch (error) {
      console.error("Error cargando plantilla:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setNombre(''); setPlaca(''); setCategoria('Agente'); setIdGrupo(''); setApTotal(6); setEditingId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !placa) return;

    const agenteData = {
      nombre,
      placa,
      categoria,
      id_grupo: idGrupo || (grupos[0]?.id ?? ''),
      asuntos_propios_total: apTotal
    };

    if (editingId) {
      await updateDoc(doc(db, 'agentes', editingId), agenteData);
    } else {
      await addDoc(collection(db, 'agentes'), agenteData);
    }
    
    setIsModalOpen(false);
    resetForm();
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este agente?")) {
      await deleteDoc(doc(db, 'agentes', id));
      loadData();
    }
  };

  if (loading) return <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest p-4">Cargando datos...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-sm font-bold text-slate-100 uppercase tracking-widest">Plantilla de Agentes</h1>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded flex items-center gap-2 transition-colors"
        >
          <UserPlus size={14} />
          Nuevo Agente
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded flex flex-col overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead className="bg-slate-900 border-b border-slate-800 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Placa</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Nombre</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Categoría</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">Grupo</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase">AP (Total)</th>
                <th className="px-3 py-2 font-normal tracking-widest uppercase text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {agentes.map(agente => (
                <tr key={agente.id} className="border-b border-slate-800/50 hover:bg-indigo-500/5 text-slate-300">
                  <td className="px-3 py-2 text-indigo-400">#{agente.placa}</td>
                  <td className="px-3 py-2">{agente.nombre}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] text-slate-300">
                      {agente.categoria.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2">{grupos.find(g => g.id === agente.id_grupo)?.nombre || 'SIN_GRUPO'}</td>
                  <td className="px-3 py-2"><div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden inline-block mr-2"><div className="h-full bg-indigo-500" style={{width: `${Math.min(100, (agente.asuntos_propios_total / 6) * 100)}%`}}></div></div>{agente.asuntos_propios_total}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => {
                      setNombre(agente.nombre);
                      setPlaca(agente.placa);
                      setCategoria(agente.categoria);
                      setIdGrupo(agente.id_grupo);
                      setApTotal(agente.asuntos_propios_total);
                      setEditingId(agente.id!);
                      setIsModalOpen(true);
                    }} className="text-slate-500 hover:text-indigo-400 p-1 mr-1 transition-colors"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(agente.id!)} className="text-slate-500 hover:text-rose-400 p-1 transition-colors"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {agentes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 font-mono text-[10px]">NO HAY DATOS</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded shadow-2xl w-full max-w-md p-5 flex flex-col gap-4">
            <h2 className="text-[12px] font-bold text-slate-100 uppercase tracking-widest border-b border-slate-800 pb-2">{editingId ? 'EDITAR_AGENTE' : 'NUEVO_AGENTE'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Placa</label>
                <input required type="text" value={placa} onChange={e => setPlaca(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre y Apellidos</label>
                <input required type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Categoría</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaAgente)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500">
                  <option value="Agente">AGENTE</option>
                  <option value="Oficial">OFICIAL</option>
                  <option value="Oficial-Jefe">OFICIAL-JEFE</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Grupo (Patrón de turnos)</label>
                <select value={idGrupo} onChange={e => setIdGrupo(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500">
                  <option value="" disabled>SELECCIONE_GRUPO...</option>
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>{g.nombre.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Días Asuntos Propios</label>
                <input required type="number" min="0" value={apTotal} onChange={e => setApTotal(parseInt(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 mt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest rounded transition-colors">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
