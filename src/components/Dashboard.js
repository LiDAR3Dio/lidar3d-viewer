// src/components/Dashboard.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, getDocs } from 'firebase/firestore';

const Dashboard = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setLoading(true);
        const propertiesCollectionRef = collection(db, 'properties');
        const querySnapshot = await getDocs(propertiesCollectionRef);
        const fetchedProperties = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProperties(fetchedProperties);
        setError(null);
      } catch (err) {
        console.error("Error fetching properties:", err);
        setError("Failed to load properties. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchProperties();
  }, []);

  // --- Refined Styles ---
  const THEME_GREEN = '#008000'; // A standard green, adjust if you have a specific hex
  const THEME_GREEN_HOVER = '#006400'; // A darker green for hover

  const dashboardContainerStyle = {
    background: '#121212', // Slightly lighter dark background
    color: '#e0e0e0',     // Slightly lighter text color
    minHeight: '100vh',
    padding: '30px',    // Reduced padding
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" // A common clean font
  };

  const headerStyle = {
    textAlign: 'center',
    marginBottom: '40px', // Reduced margin
    fontSize: '36px',    // Slightly smaller header
    color: '#ffffff',
    fontWeight: '600'
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', // Min width 280px
    gap: '25px', // Reduced gap
    maxWidth: '1100px', // Slightly reduced max width
    margin: '0 auto'
  };

  const cardStyle = {
    border: '1px solid #282828', // Softer border
    padding: '20px',             // Reduced padding
    borderRadius: '8px',         // Slightly smaller radius
    background: '#1e1e1e',       // Card background
    boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
    display: 'flex',             // Added for better internal alignment
    flexDirection: 'column',     // Align items vertically
    textAlign: 'left'            // Left-align text in card
  };

  const cardTitleStyle = {
    marginBottom: '10px', // Reduced margin
    color: '#ffffff',
    fontSize: '20px',    // Slightly smaller title
    borderBottom: '1px solid #383838',
    paddingBottom: '8px',
    fontWeight: '500'
  };

  const cardTextStyle = {
    margin: '0 0 15px', // Keep some bottom margin
    color: '#b0b0b0',   // Softer text color
    fontSize: '14px',
    lineHeight: '1.6'
  };

  const buttonContainerStyle = {
    marginTop: 'auto', // Pushes buttons to the bottom if card content is short
    display: 'flex',
    flexDirection: 'column',
    gap: '8px' // Space between buttons
  };
  
  const buttonStyle = (isPrimary = false) => ({
    textDecoration: 'none',
    padding: '8px 12px', // Smaller padding for smaller buttons
    background: isPrimary ? THEME_GREEN : 'rgba(255, 255, 255, 0.1)', // Primary is green, secondary is subtle
    border: `1px solid ${isPrimary ? THEME_GREEN : 'rgba(255, 255, 255, 0.2)'}`,
    color: isPrimary ? '#ffffff' : '#e0e0e0',
    borderRadius: '5px',
    textAlign: 'center',
    transition: 'background-color 0.2s ease, border-color 0.2s ease, transform 0.1s ease',
    fontSize: '13px', // Smaller font size
    cursor: 'pointer',
    display: 'block',
    width: '100%', // Buttons take full width of their container
    boxSizing: 'border-box' // Important for width calculation with padding/border
  });

  // Hover effect for buttons (can be done with CSS :hover too, but here for JS consistency)
  const onButtonHover = (e, isPrimary = false, isHovering = false) => {
    if (isHovering) {
      e.currentTarget.style.backgroundColor = isPrimary ? THEME_GREEN_HOVER : 'rgba(255, 255, 255, 0.15)';
      e.currentTarget.style.borderColor = isPrimary ? THEME_GREEN_HOVER : 'rgba(255, 255, 255, 0.3)';
      e.currentTarget.style.transform = 'translateY(-1px)';
    } else {
      e.currentTarget.style.backgroundColor = isPrimary ? THEME_GREEN : 'rgba(255, 255, 255, 0.1)';
      e.currentTarget.style.borderColor = isPrimary ? THEME_GREEN : 'rgba(255, 255, 255, 0.2)';
      e.currentTarget.style.transform = 'translateY(0px)';
    }
  };


  if (loading) {
    return <div style={{...dashboardContainerStyle, textAlign: 'center', fontSize: '24px' }}>Loading Properties...</div>;
  }

  if (error) {
    return <div style={{...dashboardContainerStyle, textAlign: 'center', color: 'red', fontSize: '24px' }}>Error: {error}</div>;
  }

  if (properties.length === 0) {
    return <div style={{...dashboardContainerStyle, textAlign: 'center', fontSize: '24px' }}>No properties found.</div>;
  }

  return (
    <div style={dashboardContainerStyle}>
      <h1 style={headerStyle}>
        Property Dashboard
      </h1>
      <div style={gridStyle}>
        {properties.map((prop) => (
          <div key={prop.id} style={cardStyle}>
            <div> {/* Content wrapper for text */}
              <h2 style={cardTitleStyle}>{prop.name || 'Unnamed Property'}</h2>
              <p style={cardTextStyle}>{prop.address || 'No address provided'}</p>
            </div>
            <div style={buttonContainerStyle}> {/* Button container */}
              <Link 
                to={`/viewer/${prop.id}`} 
                style={buttonStyle(true)} // Primary button
                onMouseEnter={(e) => onButtonHover(e, true, true)}
                onMouseLeave={(e) => onButtonHover(e, true, false)}
              >
                View 3D Model
              </Link>
              <Link 
                to={`/property/${prop.id}`} 
                style={buttonStyle(false)} // Secondary button
                onMouseEnter={(e) => onButtonHover(e, false, true)}
                onMouseLeave={(e) => onButtonHover(e, false, false)}
              >
                Property Details
              </Link>
              {prop.mapUrl && (
                <a 
                  href={prop.mapUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={buttonStyle(false)} // Secondary button
                  onMouseEnter={(e) => onButtonHover(e, false, true)}
                  onMouseLeave={(e) => onButtonHover(e, false, false)}
                >
                  View Map
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;