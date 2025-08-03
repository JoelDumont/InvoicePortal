window.global = window;
import { useState } from 'react'
import { ethers } from 'ethers'
import { encrypt } from '@metamask/eth-sig-util';
import { bufferToHex } from 'ethereumjs-util';

const ENCRYPTION_VERSION = 'x25519-xsalsa20-poly1305'

// Helper to generate a random id (bytes32 hex string)
function generateId() {
  return '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verschlüsselt JSON mit ECIES und Empfänger-PublicKey
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
			},
			{
				"internalType": "uint256",
				"name": "totalAmount",
				"type": "uint256"
			}
		],
		"name": "createInvoice",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];
const CONTRACT_ADDRESS = "0x63709c92908aa1922780d55a07d2dc807ca5fc14";
const MONBASE_ALPHA_CHAIN_ID = "0x507"; // 1287 dezimal 

export default function SenderView({ account, setAccount, connectMetaMask, jsonData, setJsonData }) {
  const [receiverPubKey, setReceiverPubKey] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [jsonValid, setJsonValid] = useState(false);
  const [errors, setErrors] = useState({});
  const [invoice, setInvoice] = useState(null);

  // Validate JSON syntax live
  const handleJsonInputChange = (e) => {
    const value = e.target.value;
    setJsonInput(value);
    try {
      const parsed = JSON.parse(value);
      setJsonData(parsed);
      setJsonValid(true);
    } catch {
      setJsonValid(false);
      setJsonData(null);
    }
  };

  // Validate uncompressed public key (starts with 0x04, 130 hex chars)
  const validatePublicKey = (pubKey) => /^0x04[a-fA-F0-9]{128}$/.test(pubKey);

  const validateAmount = (value) => {
    return /^\d+(\.\d{1,18})?$/.test(value) && parseFloat(value) >= 0;
  };

  // Save invoices to localStorage
  const saveInvoiceToLocalStorage = (newInvoice) => {
    const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
    invoices.push(newInvoice);
    localStorage.setItem('invoices', JSON.stringify(invoices));
  };

  // Smart Contract Call
  const callCreateInvoice = async (receiver, encryptedData, totalAmount) => {
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

    // totalAmount als wei (falls ETH als Dezimal eingegeben)
    const totalAmountWei = ethers.utils.parseEther(totalAmount);

    // Transaktion senden
    await contract.createInvoice(receiver, encryptedData, totalAmountWei);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    // if (!validatePublicKey(receiverPubKey)) {
    //   newErrors.receiverPubKey = "Ungültiger Public Key (muss mit 0x04 beginnen und 130 Hex-Zeichen lang sein).";
    // }
    if (!validateAmount(totalAmount)) {
      newErrors.totalAmount = "Ungültiger ETH-Betrag.";
    }
    if (!jsonValid) {
      newErrors.jsonData = "Ungültige JSON-Syntax.";
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      try {
        const encryptedDataBuffer = await encryptJSON(jsonInput, receiverPubKey);

        const receiverKeyInBytes = base64ToBytes32Hex(receiverPubKey); 

        await callCreateInvoice(receiverKeyInBytes, encryptedDataBuffer, totalAmount);
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
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', width: '300px' }}>
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
        <div style={{ width: '100%' }}>
          <label>Betrag (ETH):</label><br />
          <input type="text" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} style={{ width: '100%' }} />
          {errors.totalAmount && <span style={{ color: 'red' }}>{errors.totalAmount}</span>}
        </div>
        <div style={{ width: '100%' }}>
          <label style={{ fontSize: '16px', marginRight: '10px' }}>JSON Daten:</label>
          <textarea
            value={jsonInput}
            onChange={handleJsonInputChange}
            rows={6}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '14px' }}
            placeholder='{"key":"value"}'
          />
          {jsonValid ? <span style={{ color: 'green' }}>Gültige JSON-Syntax</span> : <span style={{ color: 'red' }}>Ungültige JSON-Syntax</span>}
          {errors.jsonData && <span style={{ color: 'red' }}>{errors.jsonData}</span>}
        </div>
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px' }}>Rechnung erstellen</button>
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