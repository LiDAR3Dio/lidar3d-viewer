import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { mockProperties } from './Dashboard';

const PropertyDetails = () => {
  const { id } = useParams();
  const property = mockProperties.find(p => p.id === id);

  if (!property) {
    return <div style={{ padding: '40px', color: 'white' }}>Property not found.</div>;
  }

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', padding: '40px' }}>
      <h1 style={{ fontSize: '36px', marginBottom: '10px' }}>{property.name}</h1>
      <p style={{ color: '#ccc', marginBottom: '20px' }}>{property.address}</p>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
        <a
          href={property.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={buttonStyle()}
        >
          View on Map
        </a>

        <Link to={`/viewer/${property.id}`} style={buttonStyle()}>Open 3D Viewer</Link>
      </div>

      <div style={{ marginTop: '40px' }}>
        <h3 style={{ marginBottom: '10px' }}>Comment Log</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '20px' }}>
            <div>
              <strong>2025-05-01</strong>
              <p style={{ margin: '5px 0' }}>Exterior materials still missing.</p>
              <ul style={{ listStyle: 'none', paddingLeft: '20px', borderLeft: '2px solid #444' }}>
                <li>
                  <strong>2025-05-02</strong>
                  <p style={{ margin: '3px 0', color: '#ccc' }}>Added facade images to PDF folder.</p>
                </li>
              </ul>
            </div>
          </li>
        </ul>
      </div>

      <div style={{ marginTop: '30px' }}>
        <Link to="/" style={{ color: '#aaa', fontSize: '14px' }}>← Back to Dashboard</Link>
      </div>
    </div>
  );
};

const buttonStyle = () => ({
  textDecoration: 'none',
  padding: '10px 15px',
  background: '#052600',
  border: `1px solid #052600`,
  color: '#fff',
  borderRadius: '5px',
  display: 'inline-block',
  fontSize: '14px'
});

export default PropertyDetails;
