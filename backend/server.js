const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;


const CERT_STORE = path.join(__dirname, 'certificates.json');


function readCertificates() {
  if (!fs.existsSync(CERT_STORE)) {
    fs.writeFileSync(CERT_STORE, JSON.stringify([]));
  }
  const data = fs.readFileSync(CERT_STORE);
  return JSON.parse(data);
}


function saveCertificate(cert) {
  const certs = readCertificates();
  certs.push(cert);
  fs.writeFileSync(CERT_STORE, JSON.stringify(certs, null, 2));
}


app.post('/admin/hash', upload.single('certificate'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = fs.readFileSync(file.path);
    const hash = crypto.createHash('sha512').update(fileBuffer).digest('hex');

    fs.unlinkSync(file.path);
    res.json({ hash });
  } catch (err) {
    console.error('Hashing failed:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.post('/admin/upload', upload.single('certificate'), async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;
    const file = req.file;

    if (!file || !walletAddress || !signature || !message) {
      return res.status(400).json({ error: 'Missing file or MetaMask data' });
    }

    const fileBuffer = fs.readFileSync(file.path);
    const hash = crypto.createHash('sha512').update(fileBuffer).digest('hex');

    const formData = new FormData();
    formData.append('file', fs.createReadStream(file.path));

    const pinataRes = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        maxBodyLength: Infinity,
        headers: {
          ...formData.getHeaders(),
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
      }
    );

    const ipfs_cid = pinataRes.data.IpfsHash;

    fs.unlinkSync(file.path);

   
    saveCertificate({
      walletAddress,
      hash,
      ipfs_cid,
      signature,
      message,
      timestamp: Date.now(),
    });

    res.json({
      hash,
      ipfs_cid,
      walletAddress,
      signature,
      message,
    });
  } catch (err) {
    console.error('Upload failed:', err.response?.data || err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/verify', (req, res) => {
  const { hash } = req.body;
  if (!hash || hash.length === 0) {
    return res.status(400).json({ error: 'Hash is required for verification' });
  }

  const certificates = readCertificates();
  const cert = certificates.find((c) => c.hash === hash);

  if (cert) {
    return res.json({
      verified: true,
      certificate: cert,
    });
  } else {
    return res.status(404).json({
      verified: false,
      message: 'Certificate not found for given hash',
    });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
