// src/components/PropertyDetails.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db, storage } from '../firebase/config';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection,
  addDoc,    
  query,     
  orderBy,   
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  ref as storageRef, 
  uploadBytesResumable, 
  getDownloadURL 
} from "firebase/storage";

const PropertyDetails = () => {
  const { id: propertyId } = useParams();

  const [property, setProperty] = useState(null);
  const [description, setDescription] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  
  const [eventLog, setEventLog] = useState([]);
  const [newLogText, setNewLogText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const [loadingLog, setLoadingLog] = useState(true);
  const [addingLog, setAddingLog] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fetchPropertyDetails = useCallback(async () => {
    if (!propertyId) {
      setError("No property ID provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, 'properties', propertyId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProperty({ id: docSnap.id, ...data });
        setDescription(data.description || '');
        setYearBuilt(data.yearBuilt || '');
      } else {
        setError('Property not found.');
        setProperty(null);
      }
    } catch (e) {
      setError('Failed to fetch property details. Check console.');
      console.error("Error fetching property details:", e);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchPropertyDetails();
  }, [fetchPropertyDetails]);

  useEffect(() => {
    if (!propertyId) return;
    setLoadingLog(true);
    const propertyDocRef = doc(db, 'properties', propertyId);
    const logCollectionRef = collection(propertyDocRef, 'eventLog');
    const q = query(logCollectionRef, orderBy('timestamp', 'desc')); 
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const logs = [];
      querySnapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });
      setEventLog(logs);
      setLoadingLog(false);
    }, (logError) => {
      console.error("Error fetching event log:", logError);
      setError(prevError => prevError ? `${prevError}\nFailed to load event log.` : "Failed to load event log.");
      setLoadingLog(false);
    });
    return () => unsubscribe();
  }, [propertyId]);

  const handleSaveChanges = async (e) => {
    e.preventDefault();
    if (!propertyId) {
      setError("Cannot save, property ID is missing.");
      return;
    }
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const propertyDocRef = doc(db, 'properties', propertyId);
      await updateDoc(propertyDocRef, {
        description: description,
        yearBuilt: yearBuilt,
      });
      setSaveSuccess(true);
      setIsEditing(false);
      setProperty(prev => ({...prev, description, yearBuilt})); 
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving property details:", err);
      setError("Failed to save details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (property) {
      setDescription(property.description || '');
      setYearBuilt(property.yearBuilt || '');
    }
    setIsEditing(false);
    setError(null);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) { 
          setError("File is too large. Max 10MB allowed.");
          setSelectedFile(null);
          if(fileInputRef.current) fileInputRef.current.value = "";
          return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleAddLogEntry = async (e) => {
    e.preventDefault();
    if ((!newLogText.trim() && !selectedFile) || !propertyId) {
        setError("Please enter log text or select a file.");
        return;
    }
    setAddingLog(true);
    setError(null);
    setUploadProgress(0);
    let fileURL = '';
    let uploadedFileName = '';
    let uploadedFileType = '';
    if (selectedFile) {
      const uniqueFileName = `${Date.now()}-${selectedFile.name.replace(/\s+/g, '_')}`;
      const fileStorageRef = storageRef(storage, `eventLogFiles/${propertyId}/${uniqueFileName}`);
      try {
        const uploadTask = uploadBytesResumable(fileStorageRef, selectedFile);
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          }, 
          (uploadError) => {
            console.error("Upload failed:", uploadError);
            setError(`File upload failed: ${uploadError.message}`);
            setAddingLog(false);
            setUploadProgress(0);
            return; 
          }, 
          async () => { 
            fileURL = await getDownloadURL(uploadTask.snapshot.ref);
            uploadedFileName = selectedFile.name; 
            uploadedFileType = selectedFile.type;
            await createLogEntryInFirestore(fileURL, uploadedFileName, uploadedFileType);
          }
        );
      } catch (uploadError) { 
          console.error("Upload setup failed:", uploadError);
          setError(`File upload setup failed: ${uploadError.message}`);
          setAddingLog(false);
          setUploadProgress(0);
          return;
      }
    } else {
      await createLogEntryInFirestore('', '', '');
    }
  };

  const createLogEntryInFirestore = async (fileUrl = '', fileName = '', fileType = '') => {
    try {
      const propertyDocRef = doc(db, 'properties', propertyId);
      const logCollectionRef = collection(propertyDocRef, 'eventLog');
      const logData = {
        text: newLogText.trim(),
        timestamp: serverTimestamp(),
      };
      if (fileUrl) {
        logData.fileUrl = fileUrl;
        logData.fileName = fileName;
        logData.fileType = fileType;
      }
      await addDoc(logCollectionRef, logData);
      setNewLogText('');
      setSelectedFile(null);
      if(fileInputRef.current) fileInputRef.current.value = "";
      setUploadProgress(0);
    } catch (err) {
      console.error("Error adding log entry to Firestore:", err);
      setError("Failed to add log entry. Please try again.");
    } finally {
      setAddingLog(false);
    }
  };
  
  const THEME_GREEN = '#008000';
  const DARK_BACKGROUND = '#121212';
  const CARD_BACKGROUND = '#1e1e1e';
  const TEXT_PRIMARY = '#ffffff';   
  const TEXT_SECONDARY = '#e0e0e0'; 
  const TEXT_TERTIARY = '#b0b0b0';  
  const BORDER_COLOR_MEDIUM = '#383838';
  const INPUT_BACKGROUND = '#2a2a2a'; 

  const containerStyle = { 
    background: DARK_BACKGROUND, color: TEXT_SECONDARY, minHeight: '100vh', 
    padding: '30px', display: 'flex', flexDirection: 'column', 
    alignItems: 'center', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
  };
  const cardStyle = {
    background: CARD_BACKGROUND, padding: '25px', borderRadius: '8px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.4)', maxWidth: '700px', width: '100%',
  };
  const headerStyle = {
    color: TEXT_PRIMARY, borderBottom: `1px solid ${BORDER_COLOR_MEDIUM}`, 
    paddingBottom: '15px', marginBottom: '10px', fontSize: '28px', fontWeight: '600', textAlign: 'center'
  }; // Reduced marginBottom for header
  const sectionTitleStyle = {
    fontSize: '20px', color: TEXT_PRIMARY, fontWeight: '500', 
    marginTop: '30px', marginBottom: '15px', 
    paddingBottom: '10px', borderBottom: `1px solid ${BORDER_COLOR_MEDIUM}`
  };
  const detailItemStyle = { marginBottom: '20px' };
  const labelStyle = { display: 'block', marginBottom: '8px', color: TEXT_TERTIARY, fontSize: '14px', fontWeight: '500' };
  const valueStyle = { color: TEXT_SECONDARY, fontSize: '16px', lineHeight: '1.6', whiteSpace: 'pre-wrap' };
  const inputStyleBase = {
    width: '100%', padding: '10px', borderRadius: '4px', border: `1px solid ${BORDER_COLOR_MEDIUM}`,
    background: INPUT_BACKGROUND, color: TEXT_SECONDARY, fontSize: '15px', boxSizing: 'border-box', marginBottom: '5px'
  };
  const inputStyle = { ...inputStyleBase };
  const textareaStyle = { ...inputStyleBase, minHeight: '100px', resize: 'vertical' };
  const buttonGroupStyle = { marginTop: '25px', display: 'flex', gap: '10px', justifyContent: 'flex-end' };
  const buttonStyle = (isPrimary = false, isDestructive = false, isDisabled = false) => ({
    padding: '10px 20px', borderRadius: '5px', border: 'none',
    background: isDisabled ? '#444' : (isDestructive ? '#c0392b' : (isPrimary ? THEME_GREEN : '#333')),
    color: isDisabled ? '#888' : TEXT_PRIMARY, 
    cursor: isDisabled? 'not-allowed' : 'pointer', 
    fontSize: '14px', fontWeight: '500',
    transition: 'background-color 0.2s ease',
    opacity: isDisabled ? 0.7 : 1,
  });
   const generalLinkStyle = { 
    color: THEME_GREEN, textDecoration: 'none',
    padding: '8px 12px', border: `1px solid ${THEME_GREEN}`, borderRadius: '5px',
    transition: 'background-color 0.2s, color 0.2s ease',
    display: 'inline-block', 
  };
   const onGeneralLinkHover = (e, isHover) => {
    e.currentTarget.style.backgroundColor = isHover ? THEME_GREEN : 'transparent';
    e.currentTarget.style.color = isHover ? DARK_BACKGROUND : THEME_GREEN;
  };
  const logEntryStyle = {
    background: INPUT_BACKGROUND, padding: '10px 15px', borderRadius: '4px', 
    marginBottom: '10px', borderLeft: `3px solid ${THEME_GREEN}`
  };
  const logTextStyle = { color: TEXT_SECONDARY, fontSize: '14px', whiteSpace: 'pre-wrap', marginBottom: '5px' };
  const logTimestampStyle = { color: '#888888', fontSize: '11px' };
  const logFormStyle = { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' };
  const fileInputContainerStyle = { display: 'flex', alignItems: 'center', gap: '10px' };
  const fileInputStyle = { color: TEXT_TERTIARY, fontSize: '13px' };
  const progressBarStyle = {
    width: '100%', backgroundColor: '#555', borderRadius: '4px', 
    height: '8px', overflow: 'hidden', marginTop: '5px',
    display: addingLog && selectedFile && uploadProgress > 0 ? 'block' : 'none'
  };
  const progressBarFillStyle = (progress) => ({
    width: `${progress}%`, backgroundColor: THEME_GREEN, height: '100%',
    borderRadius: '4px', transition: 'width 0.2s ease-in-out'
  });
  const imagePreviewStyle = { maxWidth: '100%', maxHeight: '200px', borderRadius: '4px', marginTop: '10px', border: `1px solid ${BORDER_COLOR_MEDIUM}` };
  const fileLinkStyle = { color: THEME_GREEN, textDecoration: 'underline', display: 'block', marginTop: '5px', fontSize: '14px' };

  if (loading) return <div style={containerStyle}><h1 style={{color: TEXT_PRIMARY, textAlign: 'center'}}>Loading Property Details...</h1></div>;
  if (error && !property && !isEditing) return <div style={containerStyle}><h1 style={{color: 'red', textAlign: 'center'}}>Error: {error}</h1><Link to="/" style={{...generalLinkStyle, marginTop: '30px'}} onMouseEnter={e=>onGeneralLinkHover(e,true)} onMouseLeave={e=>onGeneralLinkHover(e,false)}>← Back to Dashboard</Link></div>;
  if (!property && !isEditing) return <div style={containerStyle}><h1 style={{color: TEXT_PRIMARY, textAlign: 'center'}}>Property not found.</h1><Link to="/" style={{...generalLinkStyle, marginTop: '30px'}} onMouseEnter={e=>onGeneralLinkHover(e,true)} onMouseLeave={e=>onGeneralLinkHover(e,false)}>← Back to Dashboard</Link></div>;

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER_COLOR_MEDIUM}`, paddingBottom: '15px', marginBottom: '25px' }}>
          <h1 style={{...headerStyle, borderBottom: 'none', paddingBottom: '0', marginBottom: '0', textAlign: 'left', flexGrow: 1 }}>{property?.name || "Property Details"}</h1>
          <Link 
            to="/" 
            style={{...generalLinkStyle, marginTop: '0', marginLeft: '20px', flexShrink: 0}} 
            onMouseEnter={e=>onGeneralLinkHover(e,true)} 
            onMouseLeave={e=>onGeneralLinkHover(e,false)}
          >
            ← Dashboard
          </Link>
        </div>

        {error && <p style={{ color: 'red', marginBottom: '15px', textAlign: 'center' }}>Error: {error}</p>}
        {saveSuccess && <p style={{ color: THEME_GREEN, marginBottom: '15px', textAlign: 'center' }}>Details saved successfully!</p>}

        <form onSubmit={handleSaveChanges}>
          <div style={detailItemStyle}>
            <label htmlFor="description" style={labelStyle}>Description:</label>
            {isEditing ? (
              <textarea id="description" style={textareaStyle} value={description} onChange={(e) => setDescription(e.target.value)} rows="5" />
            ) : (
              <p style={valueStyle}>{property?.description || '(No description provided)'}</p>
            )}
          </div>
          <div style={detailItemStyle}>
            <label htmlFor="yearBuilt" style={labelStyle}>Year Built:</label>
            {isEditing ? (
              <input id="yearBuilt" type="text" style={inputStyle} value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} />
            ) : (
              <p style={valueStyle}>{property?.yearBuilt || '(Not specified)'}</p>
            )}
          </div>
          {isEditing ? (
            <div style={buttonGroupStyle}>
              <button type="button" onClick={handleCancelEdit} style={buttonStyle(false, false, saving)} disabled={saving}>Cancel</button>
              <button type="submit" style={buttonStyle(true, false, saving)} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          ) : (
            <div style={{...buttonGroupStyle, justifyContent: 'flex-start'}}>
              {property && <button type="button" onClick={() => setIsEditing(true)} style={buttonStyle(true)}>Edit Details</button> }
            </div>
          )}
        </form>
        
        {property && (
          <>
            <h2 style={sectionTitleStyle}>Event Log</h2>
            <form onSubmit={handleAddLogEntry} style={logFormStyle}>
              <textarea
                value={newLogText}
                onChange={(e) => setNewLogText(e.target.value)}
                placeholder="Add a new log entry text (optional if uploading a file)..."
                style={{...textareaStyle, minHeight: '60px'}}
                disabled={addingLog}
              />
              <div style={fileInputContainerStyle}>
                <label htmlFor="logFile" style={{...labelStyle, marginBottom: 0, cursor: addingLog ? 'not-allowed' : 'pointer'}}>Attach File (Optional):</label>
                <input 
                  type="file" 
                  id="logFile"
                  ref={fileInputRef}
                  onChange={handleFileChange} 
                  style={fileInputStyle}
                  disabled={addingLog} 
                />
              </div>
              {selectedFile && !addingLog && <p style={{fontSize: '12px', color: TEXT_TERTIARY}}>{selectedFile.name}</p>}
              {addingLog && selectedFile && uploadProgress > 0 && (
                <div style={progressBarStyle}>
                  <div style={progressBarFillStyle(uploadProgress)}></div>
                </div>
              )}
              <button 
                type="submit" 
                style={buttonStyle(true, false, addingLog || (!newLogText.trim() && !selectedFile))} 
                disabled={addingLog || (!newLogText.trim() && !selectedFile)}
              >
                {addingLog ? (selectedFile ? `Uploading (${Math.round(uploadProgress)}%)...` : 'Adding...') : 'Add Log Entry'}
              </button>
            </form>

            {loadingLog && <p style={{color: TEXT_TERTIARY, textAlign: 'center', marginTop: '15px'}}>Loading log...</p>}
            {!loadingLog && eventLog.length === 0 && <p style={{color: TEXT_TERTIARY, textAlign: 'center', marginTop: '15px'}}>(No log entries yet)</p>}
            
            <div style={{marginTop: '20px'}}>
              {eventLog.map(entry => (
                <div key={entry.id} style={logEntryStyle}>
                  {entry.text && <p style={logTextStyle}>{entry.text}</p>}
                  {entry.fileUrl && (
                    <div style={{marginTop: entry.text ? '10px' : '0'}}>
                      {entry.fileType?.startsWith('image/') ? (
                        <img src={entry.fileUrl} alt={entry.fileName || 'Uploaded image'} style={imagePreviewStyle} />
                      ) : (
                        <a href={entry.fileUrl} target="_blank" rel="noopener noreferrer" style={fileLinkStyle}>
                          View File: {entry.fileName || 'Attached File'} {entry.fileType ? `(${entry.fileType})` : ''}
                        </a>
                      )}
                    </div>
                  )}
                  <p style={logTimestampStyle}>
                    {entry.timestamp ? new Date(entry.timestamp.toDate()).toLocaleString() : 'Timestamp pending...'}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Removed redundant links from bottom as Back to Dashboard is now at top */}
        {/* <hr style={{margin: '30px 0', borderColor: BORDER_COLOR_MEDIUM}} /> 
        <div style={{textAlign: 'center'}}>
        </div> */}
      </div>
    </div>
  );
};

export default PropertyDetails;