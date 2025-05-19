function verify() {
  const hash = document.getElementById('hashInput').value;

  fetch('http://localhost:3000/verifier/verify-hash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ hash })
  })
    .then(res => res.json())
    .then(data => {
      if (data.valid) {
        document.getElementById('verifyResult').textContent =
          `✅ Valid Certificate\nIPFS CID: ${data.ipfs_cid}`;
      } else {
        document.getElementById('verifyResult').textContent = `❌ Invalid Certificate`;
      }
    });
}
