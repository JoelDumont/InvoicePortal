import { useState } from 'react'
import './App.css'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import SenderView from './SenderView.jsx'
import RecipientView from './ReceiverView.jsx'

function InvoicePortal() {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1>Invoice Portal</h1>
      <button onClick={() => navigate('/sender')} style={{ padding: '10px 20px', fontSize: '16px', marginBottom: '10px' }}>
        Sender
      </button>
      <button onClick={() => navigate('/recipient')} style={{ padding: '10px 20px', fontSize: '16px' }}>
        Recipient
      </button>
    </div>
  )
}

function App() {
  const [account, setAccount] = useState(null)
  const [jsonData, setJsonData] = useState(null);

  const connectMetaMask = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        setAccount(accounts[0])
      } catch (error) {
        alert('Connection to MetaMask was rejected.')
      }
    } else {
      alert('MetaMask is not installed. Please install it to use this feature.')
    }
  }

  const disconnectMetaMask = () => {
    setAccount(null)
  }

  return (
    <Router>
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        margin: '20px',
        zIndex: 10
      }}>
        {account ? (
          <button onClick={disconnectMetaMask} style={{ padding: '10px 20px', fontSize: '16px' }}>
            {`Connected: ${account.slice(0, 6)}...${account.slice(-4)}`} (Disconnect)
          </button>
        ) : (
          <button onClick={connectMetaMask} style={{ padding: '10px 20px', fontSize: '16px' }}>
            Connect MetaMask
          </button>
        )}
      </div>
      <Routes>
        <Route path="/" element={<InvoicePortal />} />
        <Route path="/sender" element={<SenderView account={account} setAccount={setAccount} connectMetaMask={connectMetaMask} jsonData={jsonData} setJsonData={setJsonData} />} />
        <Route path="/recipient" element={<RecipientView account={account} connectMetaMask={connectMetaMask} />} />
      </Routes>
    </Router>
  )
}

export default App
