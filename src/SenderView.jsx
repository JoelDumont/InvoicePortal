window.global = window;
import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { encrypt } from '@metamask/eth-sig-util';
import { bufferToHex } from 'ethereumjs-util';

const ENCRYPTION_VERSION = 'x25519-xsalsa20-poly1305'

// Helper to generate a random id (bytes32 hex string)
function generateId() {
  return '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function encryptJSON(jsonString, receiverPubKey) {
  return bufferToHex(
    Buffer.from(
      JSON.stringify(
        encrypt({
          publicKey: receiverPubKey,
          data: jsonString,
          version: ENCRYPTION_VERSION,
        })
      ),
      'utf8'
    )
  );
}

// Smart Contract ABI und Adresse
const CONTRACT_ABI = [
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "receiverKey",
				"type": "bytes32"
			},
			{
				"internalType": "bytes",
				"name": "encryptedData",
				"type": "bytes"
			}
		],
		"name": "createInvoice",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];
const CONTRACT_ADDRESS = "0x15ff7d0a3ad73c4785ea266dfd1d1bff11880511";
const MONBASE_ALPHA_CHAIN_ID = "0x507"; // 1287 dezimal 

export default function SenderView({ account, setAccount, connectMetaMask, jsonData, setJsonData }) {
  const [receiverPubKey, setReceiverPubKey] = useState("");
  const [titel, setTitel] = useState("");
  const [vat, setVat] = useState("8.1"); // Mwst. → VAT
  const [jsonInput, setJsonInput] = useState("");
  const [errors, setErrors] = useState({});
  const [invoice, setInvoice] = useState(null);

  // Line items state
  const [lineItems, setLineItems] = useState([]);

  // Add a new line item
  const addLineItem = () => {
    setLineItems(items => [
      ...items,
      { index: items.length, text: '', preis: '' }
    ]);
  };

  // Remove a line item
  const removeLineItem = (idx) => {
    setLineItems(items =>
      items.filter((item, i) => i !== idx).map((item, i) => ({ ...item, index: i }))
    );
  };

  // Update a line item
  const updateLineItem = (idx, field, value) => {
    setLineItems(items =>
      items.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      )
    );
  };

  // Calculate totalAmount
  const totalAmount = lineItems.reduce((sum, item) => {
    const preis = parseFloat(item.preis);
    return sum + (isNaN(preis) ? 0 : preis);
  }, 0);

  // Calculate totalAmount with VAT
  const totalAmountWithVat = +(totalAmount * (1 + parseFloat(vat.replace(',', '.')) / 100)).toFixed(2);

  // Update jsonInput in real time based on lineItems, totalAmount, titel, vat
  useEffect(() => {
    const jsonObj = {
      titel,
      vat: parseFloat(vat),
      lineItems,
      totalAmount,
      totalAmountWithVat
    };
    const jsonStr = JSON.stringify(jsonObj, null, 2);
    setJsonInput(jsonStr);
    setJsonData(jsonObj);
  }, [lineItems, titel, vat]);

  // Validate uncompressed public key (starts with 0x04, 130 hex chars)
  const validatePublicKey = (pubKey) => /^0x04[a-fA-F0-9]{128}$/.test(pubKey);

  // Save invoices to localStorage
  const saveInvoiceToLocalStorage = (newInvoice) => {
    const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
    invoices.push(newInvoice);
    localStorage.setItem('invoices', JSON.stringify(invoices));
  };

  // Smart Contract Call
  const callCreateInvoice = async (receiverKeyBytes32, encryptedData) => {
    if (!window.ethereum) {
      alert("MetaMask ist nicht installiert.");
      return;
    }
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MONBASE_ALPHA_CHAIN_ID }]
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        alert("Bitte füge das Monbase Alpha Netzwerk zu MetaMask hinzu.");
        return;
      }
    }
    const ethers = (await import('ethers')).ethers;
    const provider = new ethers.providers.Web3Provider(window.ethereum)
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Transaktion senden (angepasst an ABI: receiverKey (bytes32), encryptedData (bytes))
    await contract.createInvoice(receiverKeyBytes32, encryptedData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      try {
        const encryptedDataBuffer = await encryptJSON(jsonInput, receiverPubKey);

        const receiverKeyInBytes = base64ToBytes32Hex(receiverPubKey); 

        await callCreateInvoice(receiverKeyInBytes, encryptedDataBuffer);
        alert("Invoice erstellt, verschlüsselt und an den Smart Contract gesendet!");
      } catch (err) {
        alert("Fehler beim Erstellen oder Senden: " + (err?.message || err));
      }
    }
  };

  function base64ToBytes32Hex(base64) {
    const raw = atob(base64); // decode base64 to binary string
    let hex = '0x';
    for (let i = 0; i < raw.length; i++) {
      hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1>Sender View</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', width: '350px' }}>
        <div style={{ width: '100%' }}>
          <label>Empfänger Public Key:</label><br />
          <input
            type="text"
            value={receiverPubKey}
            onChange={e => setReceiverPubKey(e.target.value)}
            style={{ width: '100%' }}
            placeholder="0x04..."
          />
          {errors.receiverPubKey && <span style={{ color: 'red' }}>{errors.receiverPubKey}</span>}
        </div>
        <div style={{ width: '100%', marginTop: 12 }}>
          <label>Titel:</label><br />
          <input
            type="text"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            style={{ width: '100%' }}
            placeholder="Titel der Rechnung"
          />
        </div>
        <div style={{ width: '100%', marginTop: 12 }}>
          <label>VAT:</label><br />
          <select
            value={vat}
            onChange={e => setVat(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="8.1">8,1%</option>
            <option value="2.6">2,6%</option>
            <option value="3.8">3,8%</option>
          </select>
        </div>
        <div style={{ width: '100%', marginTop: 20 }}>
          <label style={{ fontWeight: 'bold' }}>Line Items:</label>
          {lineItems.length === 0 && <br />}
          {lineItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ width: 24 }}>{item.index + 1}.</span>
              <input
                type="text"
                placeholder="Beschreibung"
                value={item.text}
                onChange={e => updateLineItem(idx, 'text', e.target.value)}
                style={{ flex: 2 }}
              />
              <input
                type="number"
                placeholder="Preis"
                value={item.preis}
                onChange={e => updateLineItem(idx, 'preis', e.target.value)}
                style={{ width: 80 }}
              />
              <button type="button" onClick={() => removeLineItem(idx)} style={{ color: 'red' }}>✕</button>
            </div>
          ))}
          <button type="button" onClick={addLineItem} style={{ marginTop: 6 }}>+ Line Item</button>
        </div>
        <div style={{ width: '100%', marginTop: 20 }}>
          <label style={{ fontSize: '16px', marginRight: '10px' }}>JSON (Preview):</label>
          <textarea
            value={jsonInput}
            readOnly
            rows={8}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: '14px',
              background: '#585858ff',
              color: '#fff',
              border: '1px solid #bbb',
              borderRadius: 4,
              padding: 8
            }}
          />
          {errors.jsonData && <span style={{ color: 'red' }}>{errors.jsonData}</span>}
        </div>
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px', marginTop: 20 }}>Rechnung erstellen</button>
      </form>
      {invoice && (
        <div style={{ marginTop: '30px', textAlign: 'center' }}>
          <h3>Invoice Objekt:</h3>
          <pre>{JSON.stringify(invoice, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}