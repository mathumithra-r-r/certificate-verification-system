const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

function saveToBlockchain(entry) {
  const blockchain = loadBlockchain();
  blockchain.push(entry);
  fs.writeFileSync('blockchain.json', JSON.stringify(blockchain, null, 2));
}

function loadBlockchain() {
  try {
    return JSON.parse(fs.readFileSync('blockchain.json'));
  } catch (e) {
    return [];
  }
}

app.post('/admin/upload', upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const file = req.files[0];

    // Now use file.path instead of req.file.path
    const fileBuffer = fs.readFileSync(file.path);

    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const formData = new FormData();
    formData.append('file', fs.createReadStream(file.path), file.originalname);

    const metadata = JSON.stringify({ name: file.originalname });
    formData.append('pinataMetadata', metadata);

    const options = JSON.stringify({ cidVersion: 1 });
    formData.append('pinataOptions', options);

    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
      maxBodyLength: Infinity,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_API_SECRET,
      },
    });

    const cid = response.data.IpfsHash;

    const entry = {
      hash,
      ipfs_cid: cid,
      timestamp: new Date().toISOString(),
    };

    saveToBlockchain(entry);

    fs.unlinkSync(file.path); // delete file after upload
    console.log(hash,cid)
    res.json({ message: 'Certificate uploaded', hash, ipfs_cid: cid });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

app.post('/verifier/verify-hash', (req, res) => {
  const { hash } = req.body;
  const blockchain = loadBlockchain();
  const found = blockchain.find(entry => entry.hash === hash);

  if (found) {
    res.json({ valid: true, ipfs_cid: found.ipfs_cid });
  } else {
    res.json({ valid: false });
  }
});

app.listen(5000, () => console.log('Server running on http://localhost:5000'));
