import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export default function RecipientView({ account, connectMetaMask }) {
  const [publicKey, setPublicKey] = useState('');

  // Helper to get public key from MetaMask (EIP-1193 personal_sign trick)
  useEffect(() => {
    async function fetchPublicKey() {
      if (!window.ethereum || !account) return;
      try {
        // This message can be any string, but must be the same for recovery
        // const message = "Get public key for invoice encryption";
        // // Request signature
        // const signature = await window.ethereum.request({
        //   method: 'personal_sign',
        //   params: [message, account]
        // });
        // // Recover public key from signature
        // const { ethers } = await import('ethers');
        // const msgHash = ethers.utils.hashMessage(message);
        // const recoveredPubKey = ethers.utils.recoverPublicKey(msgHash, signature);
        const receiverPubKey = await ethereum.request({
          method: 'eth_getEncryptionPublicKey',
          params: [ethereum.selectedAddress],
        });

        setPublicKey(receiverPubKey);
      } catch (err) {
        setPublicKey('');
      }
    }
    fetchPublicKey();
  }, [account]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h1>Recipient</h1>
      {account && (
        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <h3>Dein Public Key</h3>
          {publicKey ? (
            <>
              <QRCodeSVG value={publicKey} size={180} />
              <div style={{ wordBreak: 'break-all', marginTop: 10, fontFamily: 'monospace', fontSize: 13 }}>
                {publicKey}
              </div>
            </>
          ) : (
            <div>Public Key wird geladen oder konnte nicht ermittelt werden.</div>
          )}
        </div>
      )}
    </div>
  )
}