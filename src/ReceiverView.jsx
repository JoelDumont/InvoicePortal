import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ethers } from 'ethers'
import CONTRACT_ABI from '../contracts/ABI.json'

const CONTRACT_ADDRESS = import.meta.env.VITE_SMART_CONTRACT_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID;

export default function ReceiverView({ account, connectMetaMask }) {
  const [publicKey, setPublicKey] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [decrypted, setDecrypted] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingPubKey, setLoadingPubKey] = useState(false);
  const [receiverKeyHex, setReceiverKeyHex] = useState("");

  function base64ToHex(base64) {
    const raw = atob(base64);
    let hex = '0x';
    for (let i = 0; i < raw.length; i++) {
      hex += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  }

  function hexToBase64(hex) {
    hex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return btoa(hex.match(/.{1,2}/g).map(byte => String.fromCharCode(parseInt(byte, 16))).join(''));
  }

  async function getInvoicesForReceiver(receiverKeyHex, start = 0, count = 20) {
    if (!window.ethereum) throw new Error("MetaMask not found");
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
      hash: inv.hash
    }));
  }

  const handleShowPublicKey = async () => {
    if (!window.ethereum || !account) return;
    setLoadingPubKey(true);
    try {
      const receiverPubKey = await window.ethereum.request({
        method: 'eth_getEncryptionPublicKey',
        params: [account],
      });
      setPublicKey(receiverPubKey);
      setReceiverKeyHex(base64ToHex(receiverPubKey));
    } catch (err) {
      setPublicKey('');
      setReceiverKeyHex('');
    }
    setLoadingPubKey(false);
  };

  const handleLoadInvoices = async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const publicKeyHex = base64ToHex(publicKey);
      const result = await getInvoicesForReceiver(publicKeyHex);
      setInvoices(result || []);
    } catch (err) {
      alert("Error loading invoices: " + (err?.message || err));
    }
    setLoading(false);
  };

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
        alert("Decryption denied. Please confirm the request in MetaMask.");
      } else {
        alert("Error decrypting: " + (err?.message || err));
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1>Receiver</h1>
      {account && (
        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <h3>Your Public Key</h3>
          {!publicKey ? (
            <button onClick={handleShowPublicKey} style={{ marginTop: 10, padding: '8px 18px', fontSize: 16 }}>
              {loadingPubKey ? "Loading..." : "Show Public Key"}
            </button>
          ) : (
            <>
              <QRCodeSVG value={receiverKeyHex} size={180} />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <input
                  value={receiverKeyHex}
                  readOnly
                  style={{ width: '500px', textAlign: "center" }}
                />
              </div>
              <button onClick={handleLoadInvoices} style={{ marginTop: 20, padding: '8px 18px', fontSize: 16 }}>
                {loading ? "Loading..." : "Load Invoices"}
              </button>
            </>
          )}
        </div>
      )}
      {invoices.length > 0 && (
        <div style={{ marginTop: 40, width: 500 }}>
          <h3>Received Invoices</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc' }}>Invoice ID</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Sender</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Verify</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Pay</th>
                <th style={{ borderBottom: '1px solid #ccc' }}>Hash</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td
                    style={{ borderBottom: '1px solid #eee', wordBreak: 'break-all', minWidth: 80, cursor: 'pointer' }}
                    title={typeof inv.id === "string" ? inv.id : ""}
                  >
                    {typeof inv.id === "string"
                      ? `${inv.id.slice(0, 4)}...${inv.id.slice(-2)}`
                      : ""}
                  </td>
                  <td
                    style={{ borderBottom: '1px solid #eee', minWidth: 80, cursor: 'pointer' }}
                    title={typeof inv.sender === "string" ? inv.sender : ""}
                  >
                    {typeof inv.sender === "string"
                      ? `${inv.sender.slice(0, 4)}...${inv.sender.slice(-2)}`
                      : ""}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee' }}>
                    <button onClick={() => handleDecrypt(inv.encryptedData, inv.id)}>
                      View Invoice
                    </button>
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', wordBreak: 'break-all', maxWidth: 180 }}>
                    <button
                      onClick={async () => {
                        try {
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
                          let amount = 0;
                          let invoiceReference = "";
                          try {
                            const parsed = JSON.parse(decryptedData);
                            amount = parsed.totalAmountWithVat || parsed.totalAmount || parsed.amount || 0;
                            invoiceReference = parsed.invoiceReference || "";
                          } catch {}
                          if (!amount || isNaN(amount)) {
                            alert("Could not read amount from invoice.");
                            return;
                          }
                          if (!invoiceReference) {
                            alert("No invoiceReference found in invoice data.");
                            return;
                          }
                          const value = window.ethers
                            ? window.ethers.utils.parseEther(amount.toString())
                            : (amount * 1e18).toString();
                          let tokenHex = invoiceReference.startsWith("0x") ? invoiceReference : "0x" + invoiceReference;
                          await window.ethereum.request({
                            method: 'eth_sendTransaction',
                            params: [{
                              from: account,
                              to: inv.sender,
                              value: window.ethers
                                ? value.toHexString()
                                : '0x' + BigInt(value).toString(16),
                              data: tokenHex
                            }]
                          });
                          alert("Payment sent!");
                        } catch (err) {
                          alert("Error while paying: " + (err?.message || err));
                        }
                      }}
                    >
                      Pay
                    </button>
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', wordBreak: 'break-all', maxWidth: 180 }}>
                    {inv.hash ? `${inv.hash.slice(0, 8)}...${inv.hash.slice(-6)}` : ""}
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