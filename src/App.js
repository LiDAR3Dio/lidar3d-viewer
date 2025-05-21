// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import PropertyDetails from './components/PropertyDetails';
import Viewer3D from './components/3dviewer';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/property/:id" element={<PropertyDetails />} />
        <Route path="/viewer/:id" element={<Viewer3D />} />
      </Routes>
    </Router>
  );
}

export default App;
