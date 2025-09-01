const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const EMERGENCIES_FILE = 'emergencies.json';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Initialize emergencies file if it doesn't exist
if (!fs.existsSync(EMERGENCIES_FILE)) {
  fs.writeFileSync(EMERGENCIES_FILE, JSON.stringify([], null, 2));
}

// API Endpoints

// Submit new emergency
app.post('/api/emergencies', (req, res) => {
  const emergency = {
    id: Date.now(),
    ...req.body,
    timestamp: new Date().toISOString(),
    status: 'pending'
  };
  
  const emergencies = JSON.parse(fs.readFileSync(EMERGENCIES_FILE));
  emergencies.unshift(emergency);
  fs.writeFileSync(EMERGENCIES_FILE, JSON.stringify(emergencies, null, 2));
  
  res.status(201).json(emergency);
});

// Get all emergencies
app.get('/api/emergencies', (req, res) => {
  const emergencies = JSON.parse(fs.readFileSync(EMERGENCIES_FILE));
  res.json(emergencies);
});

// Update emergency status
app.put('/api/emergencies/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  let emergencies = JSON.parse(fs.readFileSync(EMERGENCIES_FILE));
  const index = emergencies.findIndex(e => e.id == id);
  
  if (index !== -1) {
    emergencies[index].status = status;
    fs.writeFileSync(EMERGENCIES_FILE, JSON.stringify(emergencies, null, 2));
    res.json(emergencies[index]);
  } else {
    res.status(404).json({ error: 'Emergency not found' });
  }
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});