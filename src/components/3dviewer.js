// src/components/3dviewer.js
import React, { Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import { mockProperties } from './Dashboard';

function Model({ url }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function Viewer3D() {
  const { id } = useParams();
  const property = mockProperties.find(p => p.id === id);
  const modelUrl = property?.modelUrl;

  if (!modelUrl) {
    return (
      <div style={{ color: 'white', padding: '40px' }}>
        <h2>Model not found for property: {id}</h2>
        <Link to="/" style={{ color: '#aaa' }}>← Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas camera={{ position: [10, 10, 10], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1} />
        <Suspense fallback={null}>
          <Model url={modelUrl} />
          <Environment preset="city" />
        </Suspense>
        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default Viewer3D;
