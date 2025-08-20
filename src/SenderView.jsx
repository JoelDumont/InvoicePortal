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

function generateRandomNumber(length = 16) {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Replace generateRandomNumber for bearerToken with a function that generates a hex value of desired length
function generateBearerTokenHex(length = 32) {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return '0x' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
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
const ETHERSCAN_API_KEY = import.meta.env.VITE_MOONSCAN_API_KEY;

export default function SenderView({ account, setAccount, connectMetaMask, jsonData, setJsonData }) {
  const [receiverPubKey, setReceiverPubKey] = useState("");
  const [titel, setTitel] = useState("");
  const [vat, setVat] = useState("8.1"); 
  const [jsonInput, setJsonInput] = useState("");
  const [errors, setErrors] = useState({});
  const [invoice, setInvoice] = useState(null);

  const [lineItems, setLineItems] = useState([]);
  const [paymentDueDate, setPaymentDueDate] = useState("");

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
      totalAmountWithVat,
      paymentDueDate,
      nonce: generateRandomNumber(),
      bearerToken: generateBearerTokenHex() // <-- hex value as bearerToken
    };
    const jsonStr = JSON.stringify(jsonObj, null, 2);
    setJsonInput(jsonStr);
    setJsonData(jsonObj);
  }, [lineItems, titel, vat, paymentDueDate]);


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

  // Helper to store invoice info in localStorage
  function storeInvoiceLocally(bearerToken, totalAmount, paymentDueDate) {
    const key = 'localInvoices';
    const invoices = JSON.parse(localStorage.getItem(key) || '[]');
    invoices.push({ bearerToken, totalAmount, paymentDueDate });
    localStorage.setItem(key, JSON.stringify(invoices));
  }

  // Helper to get all locally stored invoices
  function getLocalInvoices() {
    return JSON.parse(localStorage.getItem('localInvoices') || '[]');
  }

  // Helper to fetch incoming payments from Moonscan (Moonbase Alpha)
  async function getIncomingPayments(account, bearerTokens) {
    const chainId = parseInt(CHAIN_ID, 16);
    const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=txlist&address=${account}&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.result) return [];

    // Filter incoming txs with a matching bearerToken in the data field
    return data.result
      .filter(tx =>
        tx.to && tx.to.toLowerCase() === account.toLowerCase() &&
        tx.input &&
        bearerTokens.some(token => tx.input.toLowerCase().includes(token.toLowerCase()))
      )
      .map(tx => ({
        txHash: tx.hash,
        from: tx.from,
        amount: ethers.utils.formatEther(tx.value),
        bearerToken: bearerTokens.find(token => tx.input.toLowerCase().includes(token.toLowerCase())),
        timestamp: tx.timeStamp // unix timestamp as string
      }));
  }

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

        // Store invoice info locally
        storeInvoiceLocally(jsonData.bearerToken, jsonData.totalAmountWithVat, jsonData.paymentDueDate);

        await callCreateInvoice(receiverKeyInBytes, encryptedDataBuffer);
        alert("Invoice created, encrypted and sent to the smart contract!");
      } catch (err) {
        alert("Error creating or sending: " + (err?.message || err));
      }
    }
  };

  const [sentInvoices, setSentInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [paymentsSummary, setPaymentsSummary] = useState([]); // [{bearerToken, sum, paymentDueDate}]

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

      // Load local invoices and fetch payments for their bearerTokens
      const localInvoices = getLocalInvoices();
      const bearerTokens = localInvoices.map(inv => inv.bearerToken);
      const payments = await getIncomingPayments(account, bearerTokens);

      // Summarize payments by bearerToken
      const summary = bearerTokens.map(token => {
        const invoice = localInvoices.find(inv => inv.bearerToken === token);
        const sum = payments
          .filter(p => p.bearerToken === token)
          .reduce((acc, p) => acc + parseFloat(p.amount), 0);
        return {
          invoiceId: invoice && invoice.id ? invoice.id : "", // Add invoiceId if available
          bearerToken: token,
          paymentDueDate: invoice ? invoice.paymentDueDate : "",
          totalAmount: invoice ? invoice.totalAmount : "",
          sum: sum
        };
      });
      setPaymentsSummary(summary);
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
          <label>Payment Due Date</label><br />
          <input
            type="date"
            value={paymentDueDate}
            onChange={e => setPaymentDueDate(e.target.value)}
            style={{ width: '100%' }}
          />
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
          <>
            {/* Only show Incoming Payments Summary table */}
            <h4 style={{ marginTop: 30 }}>Incoming Payments Summary</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 }}>
              <thead>
                <tr>
                  {/* Removed Invoice ID column */}
                  <th style={{ borderBottom: '1px solid #ccc' }}>Bearer Token</th>
                  <th style={{ borderBottom: '1px solid #ccc' }}>Payment Due Date</th>
                  <th style={{ borderBottom: '1px solid #ccc' }}>Invoice Amount</th>
                  <th style={{ borderBottom: '1px solid #ccc' }}>Total Received</th>
                </tr>
              </thead>
              <tbody>
                {paymentsSummary.map((p, idx) => (
                  <tr key={p.bearerToken + idx}>
                    <td
                      style={{ borderBottom: '1px solid #eee', wordBreak: 'break-all', maxWidth: 180, cursor: 'pointer' }}
                      title={p.bearerToken}
                    >
                      {typeof p.bearerToken === "string" && p.bearerToken.length > 12
                        ? `${p.bearerToken.slice(0, 6)}...${p.bearerToken.slice(-6)}`
                        : p.bearerToken}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee' }}>{p.paymentDueDate}</td>
                    <td style={{ borderBottom: '1px solid #eee' }}>{p.totalAmount}</td>
                    <td style={{ borderBottom: '1px solid #eee' }}>{p.sum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
