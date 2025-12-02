import { useState, useEffect } from 'react';
import './App.css';

// pega ou cria um id único pra esse navegador
function getOrCreateId() {
  try {
    let id = localStorage.getItem('ruaId');
    if (!id) {
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('id-' + Date.now() + '-' + Math.floor(Math.random()*1e6));
      localStorage.setItem('ruaId', id);
    }
    return id;
  } catch (e) {
    return 'anon-' + Date.now();
  }
}
const userId = getOrCreateId();

function App(){
  const [view, setView] = useState('report'); // 'report' ou 'problems'
  const [file, setFile] = useState(null);
  const [desc, setDesc] = useState('');
  const [type_, setType] = useState('rua');
  const [coords, setCoords] = useState({lat:'', lng:''});
  const [preview, setPreview] = useState(null);

  // nome do reporter salvo no navegador
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('ruaNome') || ''; } catch(e){ return ''; }
  });

  // dados dos problemas (reports)
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false); // ver só meus ou todos
  const API = `${window.location.protocol}//${window.location.hostname}:4000`;

  useEffect(() => {
    if (view === 'problems') fetchProblems();
    // eslint-disable-next-line
  }, [view, showAll]);

  const fetchProblems = async () => {
    setLoading(true);
    try {
      const qs = showAll ? '' : `?ownerId=${encodeURIComponent(userId)}`;
      const res = await fetch(`${API}/reports${qs}`);
      const data = await res.json();
      setProblems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      alert('Erro buscando problemas (ver console).');
    } finally { setLoading(false); }
  };

  const handleFile = (e) => {
    const f = e.target.files[0];
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const tryGeo = () => {
    if (!navigator.geolocation) return alert('Geolocalização não disponível');
    navigator.geolocation.getCurrentPosition(p => {
      setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
    }, ()=> alert('Permissão negada ou erro. A sua localização deve ser inserida manualmente no campo Descrição.') );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return alert('É necessário anexar uma foto do problema/incidente.');
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('description', desc);
    fd.append('type', type_);
    fd.append('reporter', name || '');
    fd.append('reporterId', userId);
    if (coords.lat && coords.lng) {
      fd.append('lat', coords.lat);
      fd.append('lng', coords.lng);
    }

    try {
      const res = await fetch(`${API}/reports`, {
        method: 'POST',
        body: fd
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) {
        console.error('Erro do servidor', res.status, data);
        return alert('Falha ao enviar: ' + (data.error || res.status));
      }
      alert('Reportagem de problema enviada com sucesso!');
      setFile(null); setDesc(''); setPreview(null);
      // atualiza lista se estiver na aba de problemas
      if (view === 'problems') fetchProblems();
    } catch (err) {
      console.error('Erro na requisição:', err);
      alert('Erro na requisição: ' + err.message);
    }
  };

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="title">
          <h1>Projeto Cidade Perfeita</h1>
          <small>Algum problema em sua rua? Reporte aqui para nós resolver!</small>
        </div>

        <nav className="menu">
          <button className={view==='report' ? 'tab active' : 'tab'} onClick={()=>setView('report')}>Reportar Problema</button>
          <button className={view==='problems' ? 'tab active' : 'tab'} onClick={()=>setView('problems')}>Problemas</button>
        </nav>
      </header>

      {view === 'report' && (
        <main className="card">
          <form onSubmit={submit} className="form">
            <div className="row">
              <label>Seu nome (opcional)</label>
              <input
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  try { localStorage.setItem('ruaNome', e.target.value); } catch(e){}
                }}
                placeholder="Ex: João, Maria, vó Ana..."
              />
            </div>

            <div className="row">
              <label>Tipo</label>
              <select value={type_} onChange={e=>setType(e.target.value)}>
                <option value="rua">Rua quebrada</option>
                <option value="arvore">Árvore caída</option>
                <option value="iluminacao">Iluminação</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            <div className="row">
              <label>Descrição</label>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Ex: buraco grande na esquina..."/>
            </div>

            <div className="row file-row">
              <label className="file-label">Foto</label>
              <input id="file" type="file" accept="image/*" onChange={handleFile} />
              {preview && <img className="preview" src={preview} alt="preview" />}
            </div>

            <div className="row geo-row">
              <button type="button" className="btn ghost" onClick={tryGeo}>Pegar minha localização</button>
              {coords.lat && <div className="coords">Lat: {coords.lat.toFixed(5)} • Lng: {coords.lng.toFixed(5)}</div>}
            </div>

            <div className="row actions">
              <button type="submit" className="btn primary">Enviar Problema</button>
            </div>
          </form>
        </main>
      )}

      {view === 'problems' && (
        <main className="card problems-card">
          <div className="problems-header">
            <h2>{showAll ? 'Todos os Problemas' : 'Seus Problemas'}</h2>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <button className="btn ghost" onClick={() => { setShowAll(s => !s); }}>
                {showAll ? 'Mostrar só meus' : 'Mostrar todos'}
              </button>
              <button className="btn ghost" onClick={fetchProblems}>Atualizar</button>
            </div>
          </div>

          {loading ? <div className="center">Carregando...</div> :
            problems.length === 0 ? <div className="center muted">Nenhum problema registrado ainda.</div> :
            <div className="grid">
              {problems.map(p => (
                <article className="problem-card" key={p.id}>
                  <div className="thumb">
                    <img src={`${API}${p.photoPath}`} alt={`thumb-${p.id}`} />
                  </div>
                  <div className="p-body">
                    <div className="p-meta">
                      <div className="left-meta">
                        <strong className="p-type">{p.type}</strong>
                        <span className="p-reporter">por {p.reporter || 'Anônimo'}</span>
                      </div>
                      <time>{new Date(p.createdAt).toLocaleString()}</time>
                    </div>
                    <p className="p-desc">{p.description || <span className="muted">Sem descrição</span>}</p>
                    {p.location && <div className="p-loc">📍 {p.location.lat.toFixed(5)}, {p.location.lng.toFixed(5)}</div>}
                  </div>
                </article>
              ))}
            </div>
          }
        </main>
      )}

      <footer className="footer">
        <small>Prototype build - database aplicada parcialmente.</small>
      </footer>
    </div>
  );
}

export default App;
