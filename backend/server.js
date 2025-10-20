const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const Tesseract = require('tesseract.js');

const app = express();

// CORS for Railway - allow all origins
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// Database connection for Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database table
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        original_name TEXT NOT NULL,
        file_data TEXT NOT NULL,
        file_size BIGINT,
        mime_type TEXT,
        uploaded_at TIMESTAMP DEFAULT NOW(),
        ocr_status TEXT DEFAULT 'pending',
        ocr_text TEXT,
        ocr_confidence DECIMAL
      )
    `);
    console.log('✅ Database table ready');
  } catch (err) {
    console.error('❌ Database error:', err);
  }
};

initDB();

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'OCR Server with Database is running on Railway!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Health check for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    environment: process.env.NODE_ENV,
    database: process.env.DATABASE_URL ? 'Connected' : 'Not connected'
  });
});

// Upload endpoint - stores in database
app.post('/api/documents', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { originalname, buffer, size, mimetype } = req.file;

        // Store in database
        const result = await pool.query(
            `INSERT INTO documents (original_name, file_data, file_size, mime_type) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [originalname, buffer.toString('base64'), size, mimetype]
        );

        const document = result.rows[0];

        // Process OCR in background
        processOCR(document.id);

        res.json({ 
            success: true, 
            document: {
                id: document.id,
                original_name: document.original_name,
                uploaded_at: document.uploaded_at,
                status: document.ocr_status
            },
            message: 'File uploaded successfully. OCR processing started.'
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all documents from database
app.get('/api/documents', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM documents ORDER BY uploaded_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get specific document from database
app.get('/api/documents/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search documents in database
app.get('/api/documents/search/:query', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM documents WHERE ocr_text ILIKE $1 ORDER BY uploaded_at DESC',
            [`%${req.params.query}%`]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error searching documents:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete document from database
app.delete('/api/documents/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ error: error.message });
    }
});

// OCR processing function
async function processOCR(documentId) {
    try {
        console.log(`🔄 Starting OCR for document: ${documentId}`);
        
        // Update status to processing
        await pool.query(
            'UPDATE documents SET ocr_status = $1 WHERE id = $2',
            ['processing', documentId]
        );

        // Get document from database
        const result = await pool.query('SELECT * FROM documents WHERE id = $1', [documentId]);
        const document = result.rows[0];

        if (!document) {
            throw new Error('Document not found in database');
        }

        // Convert base64 to buffer for Tesseract
        const imageBuffer = Buffer.from(document.file_data, 'base64');
        
        // Perform OCR
        const ocrResult = await Tesseract.recognize(
            imageBuffer,
            'eng',
            { 
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`📊 Progress: ${(m.progress * 100).toFixed(1)}%`);
                    }
                }
            }
        );

        // Update database with OCR results
        await pool.query(
            'UPDATE documents SET ocr_text = $1, ocr_confidence = $2, ocr_status = $3 WHERE id = $4',
            [ocrResult.data.text, ocrResult.data.confidence, 'completed', documentId]
        );

        console.log(`✅ OCR completed for document: ${documentId}`);
        console.log(`🎯 Confidence: ${ocrResult.data.confidence}%`);
        
    } catch (error) {
        console.error('❌ OCR processing failed:', error);
        await pool.query(
            'UPDATE documents SET ocr_status = $1 WHERE id = $2',
            ['failed', documentId]
        );
    }
}

// Serve frontend for all other routes (for SPA)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not connected'}`);
});