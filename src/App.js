import React, { useReducer, useEffect, useState, useRef } from 'react';
import './App.css';
import { parseBuffer } from 'music-metadata-browser';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const config = {
  defaultMetadata: {
    source: 'Your Website Name',
    authors: [],
    institution: 'Your Institution Name',
    website: 'Your Website URL',
    contact: 'Your Contact Info',
  },
  supportedTypes: {
    wav: { mimeType: 'audio/wav', handler: attachAudioMetadata },
    mp3: { mimeType: 'audio/mpeg', handler: attachAudioMetadata },
    ogg: { mimeType: 'audio/ogg', handler: attachAudioMetadata },
    flac: { mimeType: 'audio/flac', handler: attachAudioMetadata },
    mp4: { mimeType: 'video/mp4', handler: null },
    webm: { mimeType: 'video/webm', handler: null },
    jpg: { mimeType: 'image/jpeg', handler: null },
    jpeg: { mimeType: 'image/jpeg', handler: null },
    png: { mimeType: 'image/png', handler: null },
    gif: { mimeType: 'image/gif', handler: null },
    webp: { mimeType: 'image/webp', handler: null },
    pdf: { mimeType: 'application/pdf', handler: attachPDFMetadata },
  },
  licenseTextTemplate: `License Agreement

File: {filename}
Download Date: {downloadDate}

© {year} {institution}

Authors:
{authorsList}

License:

This file is licensed under the {institution} Copyright License. Downloading the file constitutes agreement to the following terms:

* Personal Use Only: You may download and use this file for personal, non-commercial purposes.
* No Redistribution or Modification: You may not share, distribute, or modify this file without explicit written permission from {institution}.
* Copyright Protection: This file is protected by copyright law. Unauthorized use or reproduction is prohibited.

For More Information:

* Website: {website}
* Contact: {contact}
`,
};

const initialState = {
  files: [],
  loading: false,
  error: null,
  theme: 'light',
};

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_FILES':
      return { ...state, files: [...state.files, ...action.payload] };
    case 'REMOVE_FILE':
      return { ...state, files: state.files.filter(file => file.name !== action.payload) };
    case 'CLEAR_FILES':
      return { ...state, files: [] };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    default:
      return state;
  }
}

async function attachAudioMetadata(file, metadata) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const metadataResult = await parseBuffer(arrayBuffer, { mimeType: file.type });
    
    metadataResult.common.title = metadata.title || 'Default Title';
    metadataResult.common.artist = metadata.authors.join(', ') || config.defaultMetadata.authors.join(', ');
    metadataResult.common.album = metadata.source || config.defaultMetadata.source;

    const updatedBlob = new Blob([file], { type: file.type });
    return updatedBlob;
  } catch (error) {
    console.error('Error reading audio metadata:', error);
    throw error;
  }
}

async function attachPDFMetadata(file, metadata) {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  pdfDoc.setTitle(metadata.title || 'Default Title');
  pdfDoc.setAuthor(metadata.authors.join(', ') || config.defaultMetadata.authors.join(', '));
  pdfDoc.setSubject(metadata.source || config.defaultMetadata.source);

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

async function attachMetadataToDownload(file, customMetadata = {}) {
  const metadata = { ...config.defaultMetadata, ...customMetadata };
  const fileExtension = file.name.split('.').pop().toLowerCase();
  const handler = config.supportedTypes[fileExtension] || config.supportedTypes.default;

  try {
    let processedFile;
    if (handler && handler.handler) {
      processedFile = await handler.handler(file, metadata);
    } else {
      processedFile = file;
    }

    const licenseContent = generateLicenseContent(file.name, metadata);
    const licenseBlob = new Blob([licenseContent], { type: 'text/plain' });
    return { processedFile, licenseBlob };
  } catch (error) {
    console.error('Error attaching metadata:', error);
    const licenseContent = generateLicenseContent(file.name, metadata);
    const licenseBlob = new Blob([licenseContent], { type: 'text/plain' });
    return { processedFile: file, licenseBlob };
  }
}

const formatDate = (date, format) => {
  const options = { year: 'numeric', month: 'numeric', day: 'numeric' };
  switch (format) {
    case 'yyyy-m-d':
      return date.toLocaleDateString('en-CA', options);
    case 'm-yyyy-d':
      return date.toLocaleDateString('en-GB', { ...options, month: 'numeric', year: 'numeric' }).replace(/(\d{1,2})\/(\d{4})/, '$2-$1');
    case 'd-m-yyyy':
      return date.toLocaleDateString('en-GB', options).replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$1-$2-$3');
    default:
      return date.toLocaleDateString();
  }
};

function generateLicenseContent(filename, metadata) {
  const date = new Date();
  const downloadDate = formatDate(date, metadata.dateFormat);
  
  const authorsList = metadata.authors && metadata.authors.length > 0
    ? metadata.authors.join(', ')
    : 'N/A';

  // Convert HTML content to plain text and preserve line breaks
  const tempElement = document.createElement('div');
  tempElement.innerHTML = metadata.licenseTemplate.replace(/<p>/g, '').replace(/<\/p>/g, '\n');
  let plainTextTemplate = tempElement.textContent || tempElement.innerText || '';

  // Replace variables
  plainTextTemplate = plainTextTemplate
    .replace(/{filename}/g, filename)
    .replace(/{downloadDate}/g, downloadDate)
    .replace(/{year}/g, date.getFullYear().toString())
    .replace(/{institution}/g, metadata.institution || config.defaultMetadata.institution)
    .replace(/{website}/g, metadata.website || config.defaultMetadata.website)
    .replace(/{contact}/g, metadata.contact || config.defaultMetadata.contact)
    .replace(/{authorsList}/g, authorsList);

  // Ensure proper line breaks
  return plainTextTemplate.split('\n').map(line => line.trim()).join('\n');
}

function useFileHandler() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [metadata, setMetadata] = useState({
    authors: [],
    institution: config.defaultMetadata.institution,
    website: config.defaultMetadata.website,
    contact: config.defaultMetadata.contact,
    dateFormat: 'yyyy-m-d',
    licenseTemplate: config.licenseTextTemplate,
  });

  const handleFileUpload = (event) => {
    const uploadedFiles = Array.from(event.target.files);

    const newFiles = uploadedFiles.map(file => ({
      name: file.name,
      size: file.size,
      file,
      previewUrl: URL.createObjectURL(file),
      type: file.type,
    }));

    dispatch({ type: 'ADD_FILES', payload: newFiles });
  };

  const removeFile = (name) => {
    dispatch({ type: 'REMOVE_FILE', payload: name });
  };

  const clearFiles = () => {
    dispatch({ type: 'CLEAR_FILES' });
    state.files.forEach(file => URL.revokeObjectURL(file.previewUrl));
  };

  const setTheme = (theme) => {
    dispatch({ type: 'SET_THEME', payload: theme });
    document.body.className = theme;
  };

  return {
    state,
    metadata,
    setMetadata,
    handleFileUpload,
    removeFile,
    clearFiles,
    setTheme,
  };

  // eslint-disable-next-line
  function AudioPlayer({ file }) {
    return (
      <audio controls>
        <source src={file.previewUrl} type={file.type} />
        Your browser does not support the audio element.
      </audio>
    );
  }
}

function App() {
  const {
    state,
    metadata,
    setMetadata,
    handleFileUpload,
    removeFile,
    clearFiles,
  } = useFileHandler();

  const quillRef = useRef(null);

  const downloadFile = async (file) => {
    try {
      const { processedFile } = await attachMetadataToDownload(file.file, metadata);

      const zip = new JSZip();
      zip.file(file.name, processedFile);
      
      // Generate license content
      const licenseContent = generateLicenseContent(file.name, metadata);
      zip.file(`${file.name}.license.txt`, licenseContent);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);

      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `${file.name}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(zipUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const insertVariable = (variable) => {
    const editor = quillRef.current.getEditor();
    const range = editor.getSelection(true);
    editor.insertText(range.index, `{${variable}}`);
  };

  useEffect(() => {
    // Prevent default download behavior for audio files
    const handleContextMenu = (e) => {
      if (e.target.tagName === 'AUDIO') {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);
  
  return (
    <div className={`App ${state.theme}`}>
      <header className="App-header">
        <h1>Metadata and License Manager</h1>
        <div className="input-container">
          <input 
            type="text" 
            placeholder="Add authors (comma separated)" 
            value={metadata.authors.join(', ')}
            onChange={(e) => setMetadata({...metadata, authors: e.target.value.split(',').map(a => a.trim())})} 
            className="input-field"
          />
          <input 
            type="text" 
            placeholder="Institution Name" 
            value={metadata.institution}
            onChange={(e) => setMetadata({...metadata, institution: e.target.value})} 
            className="input-field"
          />
          <input 
            type="text" 
            placeholder="Website" 
            value={metadata.website}
            onChange={(e) => setMetadata({...metadata, website: e.target.value})} 
            className="input-field"
          />
          <input 
            type="text" 
            placeholder="Contact Info" 
            value={metadata.contact}
            onChange={(e) => setMetadata({...metadata, contact: e.target.value})} 
            className="input-field"
          />
          <select 
            value={metadata.dateFormat} 
            onChange={(e) => setMetadata({...metadata, dateFormat: e.target.value})} 
            className="input-field"
          >
            <option value="yyyy-m-d">YYYY-MM-DD</option>
            <option value="m-yyyy-d">MM-YYYY-DD</option>
            <option value="d-m-yyyy">DD-MM-YYYY</option>
          </select>
          <input 
            type="file" 
            multiple 
            onChange={handleFileUpload} 
            className="input-field"
          />
        </div>
        <div className="license-template-editor">
          <h2>License Template Editor</h2>
          <div className="variable-buttons">
            {['filename', 'downloadDate', 'year', 'institution', 'website', 'contact', 'authorsList'].map(variable => (
              <button key={variable} onClick={() => insertVariable(variable)} className="btn btn-variable">
                {variable}
              </button>
            ))}
          </div>
          <ReactQuill
            ref={quillRef}
            value={metadata.licenseTemplate}
            onChange={(content) => setMetadata({...metadata, licenseTemplate: content})}
            modules={{
              toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{'list': 'ordered'}, {'list': 'bullet'}],
                ['link', 'clean']
              ]
            }}
          />
        </div>
        <div className="file-list">
          {state.files.length > 0 ? (
            state.files.map((file, index) => (
              <div className="file-item" key={index}>
                <span className="file-name">{file.name} ({(file.size / 1024).toFixed(2)} KB)</span>
                <div className="button-group">
                  <button onClick={() => downloadFile(file)} className="btn btn-download">Download</button>
                  <button onClick={() => removeFile(file.name)} className="btn btn-remove">Remove</button>
                </div>
              </div>
            ))
          ) : (
            <p className="no-files">No files uploaded yet.</p>
          )}
        </div>
        {state.files.length > 0 && (
          <button onClick={clearFiles} className="btn btn-clear">Clear All Files</button>
        )}
      </header>
    </div>
  );
}

export default App;
