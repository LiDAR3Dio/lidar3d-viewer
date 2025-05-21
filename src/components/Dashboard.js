import React from 'react';
import { Link } from 'react-router-dom';

const mockProperties = [
  {
    id: 'prop1',
    name: 'Main Building',
    address: '123 Main St',
    mapUrl: 'https://goo.gl/maps/example1',
    modelUrl: 'https://firebasestorage.googleapis.com/v0/b/lidar3d-viewer.firebasestorage.app/o/model.glb?alt=media&token=98c91571-779f-4d1b-82db-53d31e55c8b2'
  },
  {
    id: 'prop2',
    name: 'Guest House',
    address: '456 Oak Ave',
    mapUrl: 'https://goo.gl/maps/example2',
    modelUrl: 'https://firebasestorage.googleapis.com/v0/b/lidar3d-viewer.firebasestorage.app/o/demo3.2.glb?alt=media&token=cb862912-cb2c-4143-9837-a53b1be4f3ef'
  },
  {
    id: 'prop3',
    name: 'Holiday Home',
    address: '789 Coastline Dr',
    mapUrl: 'https://goo.gl/maps/example3',
    modelUrl: 'https://firebasestorage.googleapis.com/v0/b/lidar3d-viewer.firebasestorage.app/o/oland.glb?alt=media&token=fd3114e5-e1cf-429d-9a28-9ac93c0d3b0e'
  }
];

const Dashboard = () => {
  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', padding: '40px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '50px', fontSize: '42px', color: '#fff' }}>
        Property Dashboard
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px' }}>
        {mockProperties.map((prop) => (
          <div key={prop.id} style={{ border: '1px solid #333', padding: '20px', borderRadius: '10px', background: '#111' }}>
            <h2 style={{ marginBottom: '10px', color: '#fff' }}>{prop.name}</h2>
            <p style={{ margin: '0 0 10px', color: '#ccc' }}>{prop.address}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link to={`/property/${prop.id}`} style={buttonStyle()}>Open Details</Link>
              <a href={prop.mapUrl} target="_blank" rel="noopener noreferrer" style={buttonStyle(true)}>View Map</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const buttonStyle = (outlined = false) => ({
  textDecoration: 'none',
  padding: '10px 15px',
  background: outlined ? 'transparent' : '#052600',
  border: `1px solid #052600`,
  color: outlined ? '#052600' : '#fff',
  borderRadius: '5px',
  textAlign: 'center',
  transition: '0.2s ease',
  fontSize: '14px'
});

export default Dashboard;
export { mockProperties };
