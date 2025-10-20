import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/documents`);
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        alert('Please select an image file (JPEG, PNG, etc.)');
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${API_BASE}/documents`, formData);
      alert('File uploaded successfully! OCR processing started.');
      setFile(null);
      document.getElementById('file-input').value = '';
      setTimeout(loadDocuments, 2000);
      setActiveTab('documents');
    } catch (error) {
      alert('Upload failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploading(false);
    }
  };

  const viewDocument = async (docId) => {
    try {
      const response = await axios.get(`${API_BASE}/documents/${docId}`);
      setSelectedDoc(response.data);
    } catch (error) {
      alert('Failed to load document details');
    }
  };

  const deleteDocument = async (docId) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await axios.delete(`${API_BASE}/documents/${docId}`);
      loadDocuments();
      setSelectedDoc(null);
    } catch (error) {
      alert('Failed to delete document');
    }
  };

  const searchDocuments = async () => {
    if (!searchQuery.trim()) {
      loadDocuments();
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/documents/search/${encodeURIComponent(searchQuery)}`);
      setDocuments(response.data);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'processing': return '#f59e0b';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="container">
          <h1>📄 Document OCR Processor</h1>
          <p>Upload images and extract text using AI-powered OCR</p>
        </div>
      </header>

      <nav className="tabs">
        <div className="container">
          <button className={`tab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
            📤 Upload
          </button>
          <button className={`tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => { setActiveTab('documents'); loadDocuments(); }}>
            📂 Documents ({documents.length})
          </button>
        </div>
      </nav>

      <main className="container">
        {activeTab === 'upload' && (
          <div className="upload-section">
            <div className="upload-card">
              <h2>Upload Document</h2>
              <p>Supported formats: JPEG, PNG (Max 10MB)</p>
              
              <div className="file-input-container">
                <input id="file-input" type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
                <label htmlFor="file-input" className="file-input-label">Choose File</label>
                {file && <span className="file-name">{file.name}</span>}
              </div>

              {file && (
                <div className="file-preview">
                  <p><strong>Selected File:</strong> {file.name}<br />
                  <strong>Size:</strong> {formatFileSize(file.size)}<br />
                  <strong>Type:</strong> {file.type}</p>
                </div>
              )}

              <button onClick={handleUpload} disabled={!file || uploading} className="upload-button">
                {uploading ? (<><div className="spinner"></div>Uploading...</>) : 'Upload & Process OCR'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="documents-section">
            <div className="search-bar">
              <input type="text" placeholder="Search in extracted text..." value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && searchDocuments()} />
              <button onClick={searchDocuments}>Search</button>
              <button onClick={loadDocuments}>Clear</button>
            </div>

            {loading ? <div className="loading">Loading documents...</div> : (
              <div className="documents-grid">
                {documents.map(doc => (
                  <div key={doc.id} className="document-card">
                    <div className="document-header">
                      <h3>{doc.original_name || doc.originalName}</h3>
                      <span className="status-badge" style={{ backgroundColor: getStatusColor(doc.ocr_status || doc.status) }}>
                        {doc.ocr_status || doc.status}
                      </span>
                    </div>
                    
                    <div className="document-info">
                      <p>📅 {new Date(doc.uploaded_at || doc.uploadedAt).toLocaleDateString()}</p>
                      <p>💾 {formatFileSize(doc.file_size || doc.fileSize)}</p>
                      {(doc.ocr_confidence || doc.confidence) && (
                        <p>🎯 Confidence: {Math.round(doc.ocr_confidence || doc.confidence)}%</p>
                      )}
                    </div>

                    <div className="document-actions">
                      <button onClick={() => viewDocument(doc.id)} disabled={(doc.ocr_status || doc.status) !== 'completed'}>
                        View Text
                      </button>
                      <button onClick={() => deleteDocument(doc.id)} className="delete-btn">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {documents.length === 0 && !loading && (
              <div className="empty-state">
                <h3>No documents yet</h3>
                <p>Upload your first document to get started with OCR processing!</p>
              </div>
            )}
          </div>
        )}

        {selectedDoc && (
          <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{selectedDoc.original_name || selectedDoc.originalName}</h2>
                <button className="close-btn" onClick={() => setSelectedDoc(null)}>×</button>
              </div>
              
              <div className="modal-body">
                <div className="document-details">
                  <p><strong>Uploaded:</strong> {new Date(selectedDoc.uploaded_at || selectedDoc.uploadedAt).toLocaleString()}</p>
                  <p><strong>File Size:</strong> {formatFileSize(selectedDoc.file_size || selectedDoc.fileSize)}</p>
                  <p><strong>Status:</strong> 
                    <span style={{ color: getStatusColor(selectedDoc.ocr_status || selectedDoc.status), marginLeft: '8px' }}>
                      {selectedDoc.ocr_status || selectedDoc.status}
                    </span>
                  </p>
                  {(selectedDoc.ocr_confidence || selectedDoc.confidence) && (
                    <p><strong>OCR Confidence:</strong> {Math.round(selectedDoc.ocr_confidence || selectedDoc.confidence)}%</p>
                  )}
                </div>

                {(selectedDoc.ocr_text || selectedDoc.ocrText) && (
                  <div className="ocr-result">
                    <h3>Extracted Text:</h3>
                    <div className="text-container">{selectedDoc.ocr_text || selectedDoc.ocrText}</div>
                    <div className="text-stats">
                      <small>{(selectedDoc.ocr_text || selectedDoc.ocrText).length} characters extracted</small>
                    </div>
                  </div>
                )}

                {(selectedDoc.ocr_status || selectedDoc.status) === 'processing' && (
                  <div className="processing-message">
                    <div className="spinner"></div>
                    <p>OCR processing in progress... This may take a few moments.</p>
                  </div>
                )}

                {(selectedDoc.ocr_status || selectedDoc.status) === 'failed' && (
                  <div className="error-message">
                    <p>❌ OCR processing failed. Please try uploading the document again.</p>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button onClick={() => setSelectedDoc(null)}>Close</button>
                <button onClick={() => deleteDocument(selectedDoc.id)} className="delete-btn">Delete Document</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;