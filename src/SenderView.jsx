window.global = window;
import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { encrypt } from '@metamask/eth-sig-util';
import { bufferToHex } from 'ethereumjs-util';

const ENCRYPTION_VERSION = 'x25519-xsalsa20-poly1305'

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
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "start",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "count",
				"type": "uint256"
			}
		],
		"name": "getInvoicesForSender",
		"outputs": [
			{
				"components": [
					{
						"internalType": "bytes32",
						"name": "id",
						"type": "bytes32"
					},
					{
						"internalType": "address",
						"name": "sender",
						"type": "address"
					},
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
						"name": "timestamp",
						"type": "uint256"
					}
				],
				"internalType": "struct SecureInvoiceVault.Invoice[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];
const CONTRACT_ADDRESS = import.meta.env.VITE_SMART_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID;

export default function SenderView({ account, setAccount, connectMetaMask, jsonData, setJsonData }) {
  const [receiverPubKey, setReceiverPubKey] = useState("");
  const [titel, setTitel] = useState("");
  const [vat, setVat] = useState("8.1"); 
  const [jsonInput, setJsonInput] = useState("");
  const [errors, setErrors] = useState({});
  const [invoice, setInvoice] = useState(null);

  const [lineItems, setLineItems] = useState([]);

  const addLineItem = () => {
    setLineItems(items => [
      ...items,
      { index: items.length, text: '', preis: '' }
    ]);
  };

  const removeLineItem = (idx) => {
    setLineItems(items =>
      items.filter((item, i) => i !== idx).map((item, i) => ({ ...item, index: i }))
    );
  };

  const updateLineItem = (idx, field, value) => {
    setLineItems(items =>
      items.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      )
    );
  };

  const totalAmount = lineItems.reduce((sum, item) => {
    const preis = parseFloat(item.preis);
    return sum + (isNaN(preis) ? 0 : preis);
  }, 0);

  const totalAmountWithVat = +(totalAmount * (1 + parseFloat(vat.replace(',', '.')) / 100)).toFixed(2);

  useEffect(() => {
    const jsonObj = {
      title: titel,
      vat: parseFloat(vat),
      lineItems,
      totalAmount,
      totalAmountWithVat
    };
    const jsonStr = JSON.stringify(jsonObj, null, 2);
    setJsonInput(jsonStr);
    setJsonData(jsonObj);
  }, [lineItems, titel, vat]);


  const callCreateInvoice = async (receiverKeyBytes32, encryptedData) => {
    if (!window.ethereum) {
      alert("MetaMask is not installed.");
      return;
    }
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID }]
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        alert("Please add the Monbase Alpha network to MetaMask.");
        return;
      }
    }
    const ethers = (await import('ethers')).ethers;
    const provider = new ethers.providers.Web3Provider(window.ethereum)
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    await contract.createInvoice(receiverKeyBytes32, encryptedData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      try {
        function hexToBase64(hex) {
          hex = hex.startsWith('0x') ? hex.slice(2) : hex;
          return btoa(hex.match(/.{1,2}/g).map(byte => String.fromCharCode(parseInt(byte, 16))).join(''));
        }
        const receiverPubKeyBase64 = hexToBase64(receiverPubKey);

        const encryptedDataBuffer = await encryptJSON(jsonInput, receiverPubKeyBase64);

        const receiverKeyInBytes = receiverPubKey;

        await callCreateInvoice(receiverKeyInBytes, encryptedDataBuffer);
        alert("Invoice created, encrypted and sent to the smart contract!");
      } catch (err) {
        alert("Error creating or sending: " + (err?.message || err));
      }
    }
  };

  function base64ToBytes32Hex(base64) {
    const raw = atob(base64); 
    let hex = '0x';
    for (let i = 0; i < raw.length; i++) {
      hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  }

  const [sentInvoices, setSentInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const handleLoadSentInvoices = async () => {
    if (!account) {
      alert("Please connect MetaMask first.");
      return;
    }
    setLoadingInvoices(true);
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const start = 0;
      const count = 20;
      const invoices = await contract.getInvoicesForSender(start, count);


      setSentInvoices(invoices);

    } catch (err) {
      alert("Error loading sent invoices: " + (err?.message || err));
    }
    setLoadingInvoices(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1>Sender</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', width: '350px' }}>
        <div style={{ width: '100%' }}>
          <label>Receiver (Public Key, Hex)</label><br />
          <input
            type="text"
            value={receiverPubKey}
            onChange={e => setReceiverPubKey(e.target.value)}
            style={{ width: '100%' }}
            placeholder="0x..."
          />
          {errors.receiverPubKey && <span style={{ color: 'red' }}>{errors.receiverPubKey}</span>}
        </div>
        <div style={{ width: '100%', marginTop: 12 }}>
          <label>Title</label><br />
          <input
            type="text"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            style={{ width: '100%' }}
            placeholder="Invoice title"
          />
        </div>
        <div style={{ width: '100%', marginTop: 12 }}>
          <label>VAT</label><br />
          <select
            value={vat}
            onChange={e => setVat(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="8.1">8.1%</option>
            <option value="2.6">2.6%</option>
            <option value="3.8">3.8%</option>
          </select>
        </div>
        <div style={{ width: '100%', marginTop: 20 }}>
          <label>Line Items</label>
          {lineItems.length === 0 && <br />}
          {lineItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ width: 24 }}>{item.index + 1}.</span>
              <input
                type="text"
                placeholder="Description"
                value={item.text}
                onChange={e => updateLineItem(idx, 'text', e.target.value)}
                style={{ flex: 2 }}
              />
              <input
                type="number"
                placeholder="Price"
                value={item.preis}
                onChange={e => updateLineItem(idx, 'preis', e.target.value)}
                style={{ width: 80 }}
              />
              <button type="button" onClick={() => removeLineItem(idx)} style={{ padding: '0px 8px 4px 8px', color: 'red' }}>x</button>
            </div>
          ))}
          <button type="button" onClick={addLineItem} style={{ marginTop: 6, padding: '0px 8px 4px 8px', color: 'green' }}>+</button>
        </div>
        <div style={{ width: '100%', marginTop: 20 }}>
          <label style={{ fontSize: '16px', marginRight: '10px' }}>Preview</label>
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
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px', marginTop: 20 }}>Create Invoice</button>
      </form>

      <div style={{ marginTop: 40, width: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Sent Invoices</h3>
          <button
            onClick={handleLoadSentInvoices}
            style={{
              padding: '6px 12px',
              fontSize: '22px',
              borderRadius: '50%',
              border: 'none',
              background: loadingInvoices ? '#eee' : 'transparent',
              cursor: loadingInvoices ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            disabled={loadingInvoices}
            title="Refresh"
            aria-label="Refresh"
          >
            {"\u21BB"}
          </button>
        </div>
        {loadingInvoices ? (
          <div>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc' }}>Invoice ID</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Receiver Key</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {sentInvoices.map(inv => (
                <tr key={inv.id}>
                  <td
                    style={{ borderBottom: '1px solid #eee', minWidth: 80, cursor: 'pointer' }}
                    title={typeof inv.id === "string" ? inv.id : ""}
                  >
                    {typeof inv.id === "string"
                      ? `${inv.id.slice(0, 4)}...${inv.id.slice(-2)}`
                      : ""}
                  </td>
                  <td
                    style={{ borderBottom: '1px solid #eee', minWidth: 80, cursor: 'pointer' }}
                    title={typeof inv.receiverKey === "string" ? inv.receiverKey : ""}
                  >
                    {typeof inv.receiverKey === "string"
                      ? `${inv.receiverKey.slice(0, 4)}...${inv.receiverKey.slice(-2)}`
                      : ""}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee' }}>
                    {inv.timestamp ? new Date(Number(inv.timestamp) * 1000).toLocaleString() : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
