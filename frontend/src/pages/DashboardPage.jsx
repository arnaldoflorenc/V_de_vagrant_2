// Painel principal: abas Ambientes / Novo ambiente / Scripts.
import { useState } from 'react'
import AmbientesPanel from './AmbientesPanel'
import NovoAmbientePanel from './NovoAmbientePanel'
import ScriptsPanel from './ScriptsPanel'
import './DashboardPage.css'

function DashboardPage({ usuario, onLogout }) {
  const [tab, setTab] = useState('ambientes')

  return (
    <div className="dashboard">
      <header>
        <h1>Mini Container Runner</h1>
        <nav>
          <button className={tab === 'ambientes' ? 'active' : ''} onClick={() => setTab('ambientes')}>Ambientes</button>
          <button className={tab === 'novo' ? 'active' : ''} onClick={() => setTab('novo')}>Novo ambiente</button>
          <button className={tab === 'scripts' ? 'active' : ''} onClick={() => setTab('scripts')}>Scripts</button>
        </nav>
        <div className="user">
          <span>{usuario.nome}</span>
          <button onClick={onLogout}>Sair</button>
        </div>
      </header>
      <main>
        {tab === 'ambientes' && <AmbientesPanel />}
        {tab === 'novo' && <NovoAmbientePanel onCreated={() => setTab('ambientes')} />}
        {tab === 'scripts' && <ScriptsPanel />}
      </main>
    </div>
  )
}

export default DashboardPage
