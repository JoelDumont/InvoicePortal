import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ethers } from 'ethers'

const CONTRACT_ADDRESS = "0x15ff7d0a3ad73c4785ea266dfd1d1bff11880511";
const CONTRACT_ABI = [
  {
    "inputs": [
      { "internalType": "bytes32", "name": "receiverKey", "type": "bytes32" },
      { "internalType": "uint256", "name": "start", "type": "uint256" },
      { "internalType": "uint256", "name": "count", "type": "uint256" }
    ],
    "name": "getInvoicesForReceiver",
    "outputs": [
      {
        "components": [
          { "internalType": "bytes32", "name": "id", "type": "bytes32" },
          { "internalType": "address", "name": "sender", "type": "address" },
          { "internalType": "bytes32", "name": "receiverKey", "type": "bytes32" },
          { "internalType": "bytes", "name": "encryptedData", "type": "bytes" },
          { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
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

export default function RecipientView({ account, connectMetaMask }) {
  const [publicKey, setPublicKey] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [decrypted, setDecrypted] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingPubKey, setLoadingPubKey] = useState(false);

  // Hilfsfunktion: base64 → bytes32 hex
  function base64ToBytes32Hex(base64) {
    const raw = atob(base64);
    let hex = '0x';
    for (let i = 0; i < raw.length; i++) {
      hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  }

  // Smart Contract Call direkt hier
  async function getInvoicesForReceiver(receiverKeyHex, start = 0, count = 20) {
    if (!window.ethereum) throw new Error("MetaMask nicht gefunden");
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const invoices = await contract.getInvoicesForReceiver(receiverKeyHex, start, count);
    return invoices.map(inv => ({
      id: inv.id,
      sender: inv.sender,
      receiverKey: inv.receiverKey,
      encryptedData: typeof inv.encryptedData === "string"
        ? inv.encryptedData
        : "0x" + Buffer.from(inv.encryptedData).toString("hex"),
      timestamp: inv.timestamp.toString()
    }));
  }

  // Lade MetaMask encryption public key nur auf Button-Klick
  const handleShowPublicKey = async () => {
    if (!window.ethereum || !account) return;
    setLoadingPubKey(true);
    try {
      const receiverPubKey = await window.ethereum.request({
        method: 'eth_getEncryptionPublicKey',
        params: [account],
      });
      setPublicKey(receiverPubKey);
    } catch (err) {
      setPublicKey('');
    }
    setLoadingPubKey(false);
  };

  // Load invoices for this public key
  const handleLoadInvoices = async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const publicKeyHex = base64ToBytes32Hex(publicKey);
      const result = await getInvoicesForReceiver(publicKeyHex);
      setInvoices(result || []);
    } catch (err) {
      alert("Fehler beim Laden der Rechnungen: " + (err?.message || err));
    }
    setLoading(false);
  };

  // Decrypt invoice data
  const handleDecrypt = async (encryptedData, invoiceId) => {
    try {
      let encryptedString = encryptedData;
      const decrypted = await window.ethereum.request({
        method: 'eth_decrypt',
        params: [encryptedString, account]
      });
      setDecrypted(prev => ({ ...prev, [invoiceId]: decrypted }));
    } catch (err) {
      if (err.code === -32603) {
        alert("Entschlüsselung abgelehnt. Bitte bestätige die Anfrage in MetaMask.");
      } else {
        alert("Fehler beim Entschlüsseln: " + (err?.message || err));
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1>Recipient</h1>
      {account && (
        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <h3>Dein Public Key</h3>
          {!publicKey ? (
            <button onClick={handleShowPublicKey} style={{ marginTop: 10, padding: '8px 18px', fontSize: 16 }}>
              {loadingPubKey ? "Lade..." : "Show Public Key"}
            </button>
          ) : (
            <>
              <QRCodeSVG value={publicKey} size={180} />
              <div style={{ wordBreak: 'break-all', marginTop: 10, fontFamily: 'monospace', fontSize: 13 }}>
                {publicKey}
              </div>
              <button onClick={handleLoadInvoices} style={{ marginTop: 20, padding: '8px 18px', fontSize: 16 }}>
                {loading ? "Lade..." : "Rechnungen laden"}
              </button>
            </>
          )}
        </div>
      )}
      {invoices.length > 0 && (
        <div style={{ marginTop: 40, width: 500 }}>
          <h3>Empfangene Rechnungen</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc' }}>Rechnungs-ID</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Sender</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Verifizieren</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Bezahlen</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ borderBottom: '1px solid #eee', wordBreak: 'break-all', minWidth: 80 }}>
                    {typeof inv.id === "string"
                      ? `${inv.id.slice(0, 4)}...${inv.id.slice(-2)}`
                      : ""}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', minWidth: 80 }}>
                    {typeof inv.sender === "string"
                      ? `${inv.sender.slice(0, 4)}...${inv.sender.slice(-2)}`
                      : ""}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee' }}>
                    <button onClick={() => handleDecrypt(inv.encryptedData, inv.id)}>
                      Entschlüsseln
                    </button>
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', wordBreak: 'break-all', maxWidth: 180 }}>
                    <button
                      onClick={async () => {
                        try {
                          // Entschlüssle Invoice, falls noch nicht geschehen
                          let decryptedData = decrypted[inv.id];
                          if (!decryptedData) {
                            let encryptedString = inv.encryptedData;
                            const result = await window.ethereum.request({
                              method: 'eth_decrypt',
                              params: [encryptedString, account]
                            });
                            decryptedData = result;
                            setDecrypted(prev => ({ ...prev, [inv.id]: decryptedData }));
                          }
                          // Versuche totalAmount zu extrahieren
                          let amount = 0;
                          try {
                            const parsed = JSON.parse(decryptedData);
                            amount = parsed.totalAmountWithVat || parsed.totalAmount || parsed.amount || 0;
                          } catch {}
                          if (!amount || isNaN(amount)) {
                            alert("Betrag konnte nicht aus der Rechnung gelesen werden.");
                            return;
                          }
                          // Sende Zahlung an den Sender
                          const value = window.ethers
                            ? window.ethers.utils.parseEther(amount.toString())
                            : (amount * 1e18).toString(); // fallback
                          await window.ethereum.request({
                            method: 'eth_sendTransaction',
                            params: [{
                              from: account,
                              to: inv.sender,
                              value: window.ethers
                                ? value.toHexString()
                                : '0x' + BigInt(value).toString(16)
                            }]
                          });
                          alert("Zahlung gesendet!");
                        } catch (err) {
                          alert("Fehler beim Bezahlen: " + (err?.message || err));
                        }
                      }}
                    >
                      Bezahlen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}