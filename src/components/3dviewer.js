// src/components/3dviewer.js
import React, { Suspense, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Link, useParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const M_TO_FT = 3.28084;
const SECTION_CUT_RANGE = 10;
const LIGHT_RED_COLOR = '#FF6B6B';
const COMMENT_BLUE_COLOR = '#44AAFF'; 

const formatDistance = (distance, unit) => {
  if (unit === 'm') return `${distance.toFixed(3)} m`;
  if (unit === 'cm') return `${(distance * 100).toFixed(1)} cm`;
  if (unit === 'ft') return `${(distance * M_TO_FT).toFixed(3)} ft`;
  return `${distance.toFixed(3)}`;
};

const getAlphabeticLabel = (index) => {
    let label = '';
    let tempIndex = index;
    while (tempIndex >= 0) {
        label = String.fromCharCode(65 + (tempIndex % 26)) + label;
        tempIndex = Math.floor(tempIndex / 26) - 1;
    }
    return label;
};

function Model({ modelUrl, isMeasureMode, isPlacingCommentMode, onPointMeasured, onCommentPlaced, clippingPlanes }) {
    const { scene } = useGLTF(modelUrl);
    const clonedScene = useMemo(() => {
      const cloned = scene.clone();
      cloned.isGLTFScene = true;
      return cloned;
    }, [scene]);

    useEffect(() => {
        clonedScene.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => {
                    material.clippingPlanes = clippingPlanes && clippingPlanes.length > 0 ? clippingPlanes : null;
                    material.clipIntersection = false;
                    material.needsUpdate = true;
                });
            }
        });
    }, [clonedScene, clippingPlanes]);

    const handleModelClick = (event) => {
        event.stopPropagation();
        if (!event.point) return;
        if (isMeasureMode) {
            onPointMeasured(event.point);
        } else if (isPlacingCommentMode) {
            onCommentPlaced(event.point);
        }
    };
    return <primitive object={clonedScene} onClick={handleModelClick} />;
}

function CameraController({ viewCommand, initialCameraPos, isOrthographic }) {
    const { camera, controls, scene } = useThree();
    useEffect(() => {
        if (!controls || !initialCameraPos ) {
             return;
        }
        let modelBoundingBox;
        let modelCenter = new THREE.Vector3(0,0,0); 
        let modelSize = new THREE.Vector3(10,10,10); 
        const gltfModel = scene.getObjectByProperty('isGLTFScene', true);
        if (gltfModel) {
            modelBoundingBox = new THREE.Box3().setFromObject(gltfModel);
             if (!modelBoundingBox.isEmpty()) {
                modelCenter = modelBoundingBox.getCenter(new THREE.Vector3());
                modelSize = modelBoundingBox.getSize(new THREE.Vector3());
            }
        } else {
            const sceneBox = new THREE.Box3().setFromObject(scene);
            if (!sceneBox.isEmpty() && sceneBox.getSize(new THREE.Vector3()).lengthSq() < 1e10) { 
                modelBoundingBox = sceneBox;
                modelCenter = modelBoundingBox.getCenter(new THREE.Vector3());
                modelSize = modelBoundingBox.getSize(new THREE.Vector3());
            }
        }
        const defaultTarget = modelCenter.clone();
        let targetDist = Math.max(modelSize.x, modelSize.y, modelSize.z, 1) * 1.5; 
        targetDist = Math.min(Math.max(targetDist, 5), 1000); 
        if (isOrthographic && camera.isOrthographicCamera) {
            const aspect = controls.domElement.clientWidth / controls.domElement.clientHeight;
            const horizontalSize = modelSize.x / aspect;
            const verticalSize = modelSize.y;
            const viewSize = Math.max(horizontalSize, verticalSize, 1) * 1.1; 
            camera.left = -viewSize * aspect / 2;
            camera.right = viewSize * aspect / 2;
            camera.top = viewSize / 2;
            camera.bottom = -viewSize / 2;
            camera.near = 0.01;
            camera.far = Math.max(1000, targetDist * 10); 
            camera.zoom = 1; 
            camera.updateProjectionMatrix();
        } else if (!isOrthographic && camera.isPerspectiveCamera) {
            camera.fov = 50; 
            camera.zoom = 1;
            camera.near = 0.1; 
            camera.far = Math.max(5000, targetDist * 10);
            camera.updateProjectionMatrix();
        }
        let needsUpdate = false;
        const applyView = (pos, upVec, targetVec = defaultTarget) => {
            camera.position.copy(pos);
            camera.up.copy(upVec); 
            controls.target.copy(targetVec); 
            camera.lookAt(targetVec); 
            camera.updateProjectionMatrix(); 
            needsUpdate = true;
        };
        if (viewCommand !== 'idle') {
            const camPos = new THREE.Vector3();
            switch (viewCommand) {
                case 'reset': applyView(initialCameraPos, new THREE.Vector3(0, 1, 0)); break;
                case 'top':   applyView(camPos.set(modelCenter.x, modelCenter.y + targetDist, modelCenter.z + 0.01), new THREE.Vector3(0, 0, -1)); break; 
                case 'front': applyView(camPos.set(modelCenter.x, modelCenter.y, modelCenter.z + targetDist), new THREE.Vector3(0, 1, 0)); break;
                case 'back':  applyView(camPos.set(modelCenter.x, modelCenter.y, modelCenter.z - targetDist), new THREE.Vector3(0, 1, 0)); break;
                case 'left':  applyView(camPos.set(modelCenter.x - targetDist, modelCenter.y, modelCenter.z), new THREE.Vector3(0, 1, 0)); break;
                case 'right': applyView(camPos.set(modelCenter.x + targetDist, modelCenter.y, modelCenter.z), new THREE.Vector3(0, 1, 0)); break;
                default: break;
            }
            if (needsUpdate && controls) {
                controls.update(); 
            }
        }
    }, [viewCommand, camera, controls, initialCameraPos, isOrthographic, scene]); 
    return null;
}

function SingleMeasurement({ measurement, index, unit, isOrthographic, onDeleteMeasurement }) {
  const { camera } = useThree();
  const midPoint = useMemo(() => new THREE.Vector3().addVectors(measurement.start, measurement.end).multiplyScalar(0.5), [measurement.start, measurement.end]);
  const { htmlStyle, sphereRadius, sphereDetail } = useMemo(() => {
    const baseFontSize = 10;
    const targetOrthoZoomForBaseSize = 1; 
    let scale = 1;
    if (isOrthographic) {
        if (camera.zoom && camera.zoom !== 0) {
             scale = targetOrthoZoomForBaseSize / camera.zoom;
        } else {
            scale = 1; 
        }
        scale = Math.max(0.2, Math.min(3, scale)); 
    }
    return {
      htmlStyle: {
        background: 'rgba(0, 0, 0, 0.7)', color: 'white', padding: `${1*scale}px ${4*scale}px`,
        fontSize: `${baseFontSize * scale}px`, borderRadius: `${3*scale}px`,
        whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
        transformOrigin: 'center center'
      },
      sphereRadius: 0.05 * Math.max(0.5, Math.min(1.5, scale)), 
      sphereDetail: 16
    };
  }, [isOrthographic, camera.zoom]);
  const deleteButtonStyle = { background: 'rgba(0,0,0,0.0)', border: 'none', color: LIGHT_RED_COLOR, cursor: 'pointer', fontSize: isOrthographic ? '10px' : '12px', padding: '0px 3px', lineHeight: '1', borderRadius: '3px', fontWeight: 'bold', marginLeft: '5px', pointerEvents: 'auto', };
  const handleDeleteClick = (e) => { e.stopPropagation(); if (onDeleteMeasurement) { onDeleteMeasurement(measurement.id); } };
  if (!measurement || !measurement.start || !measurement.end) { return null; }
  return (
    <React.Fragment>
      <mesh position={measurement.start}>
         <sphereGeometry args={[sphereRadius, sphereDetail, sphereDetail]} />
         <meshBasicMaterial color={LIGHT_RED_COLOR} depthTest={false} transparent opacity={0.8} />
      </mesh>
      <mesh position={measurement.end}>
         <sphereGeometry args={[sphereRadius, sphereDetail, sphereDetail]} />
         <meshBasicMaterial color={LIGHT_RED_COLOR} depthTest={false} transparent opacity={0.8} />
      </mesh>
      <Line points={[measurement.start, measurement.end]} color={LIGHT_RED_COLOR} lineWidth={2} depthTest={false}/>
      <Html eps={0.01} position={midPoint} center distanceFactor={isOrthographic ? undefined : 15} style={{ pointerEvents: 'none', zIndex:1 }}>
        <div style={{ display: 'flex', alignItems: 'center', pointerEvents: 'auto' }}>
          <span style={htmlStyle}>
            {index + 1}: {formatDistance(measurement.distance, unit)}
          </span>
          <button onClick={handleDeleteClick} title="Delete measurement" style={deleteButtonStyle}>
            ×
          </button>
        </div>
      </Html>
    </React.Fragment>
  );
}

function MeasurementVisualizer({ points, measurements, unit, isOrthographic, showMeasurements, onDeleteMeasurement }) {
  return (
    <>
      {points.length === 1 && (
        <mesh position={points[0]}>
          <sphereGeometry args={[0.05, 16, 16]} /> 
          <meshBasicMaterial color="yellow" depthTest={false} transparent opacity={0.8} />
        </mesh>
      )}
      {showMeasurements && measurements.map((m, index) => (
        <SingleMeasurement
          key={m.id}
          measurement={m}
          index={index}
          unit={unit}
          isOrthographic={isOrthographic}
          onDeleteMeasurement={onDeleteMeasurement}
        />
      ))}
    </>
  );
}

function CommentPin({ comment, index, isEditing, isOrthographic, onStartEditComment, onUpdateCommentText, onFinishEditComment, onDeleteComment }) {
  const [inputValue, setInputValue] = useState(comment.text);
  const inputRef = useRef();
  const { camera } = useThree();
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    if (!isEditing) { 
      setInputValue(comment.text);
    }
  }, [isEditing, comment.text]);
  const handleInputChange = (e) => setInputValue(e.target.value);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); 
      onUpdateCommentText(comment.id, inputValue || "Comment"); 
      onFinishEditComment();
    } else if (e.key === 'Escape') {
      setInputValue(comment.text); 
      onFinishEditComment();
    }
  };
  const handleBlur = () => { 
    if (inputValue !== comment.text) {
       onUpdateCommentText(comment.id, inputValue || "Comment");
    }
    onFinishEditComment();
  };
  const handleDeleteClick = (e) => { e.stopPropagation(); onDeleteComment(comment.id); };
  const { labelStyle, distanceFactor, pinRadius } = useMemo(() => {
    const baseFontSize = 10;
    const targetOrthoZoomForBaseSize = 1; 
    let scale = 1;
    if (isOrthographic) {
        if (camera.zoom && camera.zoom !== 0) {
            scale = targetOrthoZoomForBaseSize / camera.zoom;
        } else {
            scale = 1;
        }
        scale = Math.max(0.2, Math.min(3, scale)); 
    }
    return {
      labelStyle: {
        background: 'rgba(0, 0, 0, 0.7)', color: 'white', padding: `${3*scale}px ${6*scale}px`,
        borderRadius: `${4*scale}px`, fontSize: `${baseFontSize*scale}px`,
        whiteSpace: 'nowrap', cursor: isEditing ? 'text' : 'pointer', userSelect: 'none',
        border: isEditing ? `1px solid ${COMMENT_BLUE_COLOR}` : '1px solid transparent',
        display: 'flex', alignItems: 'center', transformOrigin: 'center center'
      },
      distanceFactor: isOrthographic ? undefined : 15,
      pinRadius: 0.05 * Math.max(0.5, Math.min(1.5, scale))
    };
  }, [isOrthographic, isEditing, camera.zoom]);
  const displayCommentLabel = getAlphabeticLabel(index);
  if (!comment || !comment.position) { return null; }
  return (
    <group position={comment.position}>
      <mesh name="comment-marker-dot">
        <sphereGeometry args={[pinRadius, 16, 16]} />
        <meshBasicMaterial color={COMMENT_BLUE_COLOR} depthTest={false} transparent opacity={0.8} />
      </mesh>
      <Html center distanceFactor={distanceFactor} zIndexRange={[100, 0]} position={[0, pinRadius * 2, 0]} 
       style={{ pointerEvents: 'auto', zIndex: 2 }}>
        <div
          style={labelStyle}
          onDoubleClick={(e) => { 
            e.stopPropagation();
            if (!isEditing) onStartEditComment(comment.id);
          }}
          title={!isEditing ? `${displayCommentLabel}: ${comment.text}` : ''} 
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onClick={(e) => e.stopPropagation()} 
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              style={{ background: 'none', border: 'none', color: 'white', fontSize: 'inherit', padding: '0', margin: '0', width: `${Math.max(50, inputValue.length * (parseFloat(labelStyle.fontSize) *0.7 ))}px`, outline: 'none' }}
            />
          ) : (
            <span style={{ marginRight: '5px' }}>{displayCommentLabel}</span>
          )}
          <button onClick={handleDeleteClick} title="Delete comment" style={{ background: 'none', border: 'none', color: LIGHT_RED_COLOR, cursor: 'pointer', fontSize: '12px', padding: '0 0 0 5px', marginLeft: 'auto', lineHeight: '1', display: isEditing ? 'none' : 'inline-block' }}>×</button>
        </div>
      </Html>
    </group>
  );
}

function SceneContents({
    modelUrl, isMeasureMode, isPlacingCommentMode, onPointMeasured, onCommentPlaced, clippingPlanes,
    viewCommand, initialCameraPos, isOrthographic, 
    measurePoints, measurements, unit, showMeasurements, onDeleteMeasurement,
    comments, showComments, editingCommentId, onStartEditComment,
    onUpdateCommentText, onFinishEditComment, onDeleteComment
}) {
    const { controls, gl } = useThree(); 
    useEffect(() => {
        if (controls) {
            controls.enabled = !isMeasureMode && !isPlacingCommentMode && editingCommentId === null;
        }
    }, [isMeasureMode, isPlacingCommentMode, editingCommentId, controls]);
    useEffect(() => {
        const canvasElement = gl.domElement;
        let newCursor = 'grab';
        if (isMeasureMode || isPlacingCommentMode) newCursor = 'crosshair';
        else if (editingCommentId !== null) newCursor = 'default'; 
        if (canvasElement) canvasElement.style.cursor = newCursor;
        return () => { if (canvasElement) canvasElement.style.cursor = 'auto'; }; 
    }, [isMeasureMode, isPlacingCommentMode, editingCommentId, gl.domElement]);
    return (
        <>
            <ambientLight intensity={0.7} />
            <directionalLight position={[8, 10, 5]} intensity={1.2} castShadow 
                shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
            <directionalLight position={[-8, -5, -5]} intensity={0.4} />
            <Environment preset="city" />
            <Model
                modelUrl={modelUrl} 
                isMeasureMode={isMeasureMode}
                isPlacingCommentMode={isPlacingCommentMode}
                onPointMeasured={onPointMeasured}
                onCommentPlaced={onCommentPlaced}
                clippingPlanes={clippingPlanes}
            />
            <OrbitControls makeDefault target={[0, 0, 0]} /> 
            <CameraController 
              viewCommand={viewCommand} 
              initialCameraPos={initialCameraPos} 
              isOrthographic={isOrthographic}
            />
            <MeasurementVisualizer
                points={measurePoints}
                measurements={measurements}
                unit={unit}
                isOrthographic={isOrthographic}
                showMeasurements={showMeasurements}
                onDeleteMeasurement={onDeleteMeasurement}
            />
            {showComments && comments.map((comment, index) => (
                <CommentPin
                   key={comment.id}
                   comment={comment}
                   index={index}
                   isEditing={editingCommentId === comment.id}
                   isOrthographic={isOrthographic}
                   onStartEditComment={onStartEditComment}
                   onUpdateCommentText={onUpdateCommentText}
                   onFinishEditComment={onFinishEditComment}
                   onDeleteComment={onDeleteComment}
                />
            ))}
        </>
    );
}

function Viewer3D() {
  const { id: propertyId } = useParams(); 
  const [currentProperty, setCurrentProperty] = useState(null);
  const [loadingProperty, setLoadingProperty] = useState(true);
  const [propertyError, setPropertyError] = useState(null);

  const [availableModels, setAvailableModels] = useState([]);
  const [activeModel, setActiveModel] = useState(null);

  const [viewCommand, setViewCommand] = useState('reset');
  const [isOrthographic, setIsOrthographic] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [unit, setUnit] = useState('m'); 
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [isMeasureMode, setIsMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]); 
  const [isPlacingCommentMode, setIsPlacingCommentMode] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null); 
  const [isSectionCutActive, setIsSectionCutActive] = useState(false);
  const [sectionCutAxis, setSectionCutAxis] = useState('y'); 
  const [sectionCutPosition, setSectionCutPosition] = useState(0);
  const initialCamPosRef = useRef(new THREE.Vector3(15, 15, 15)); 

  const addEventToPropertyLog = useCallback(async (logText) => {
    if (!propertyId) return;
    try {
      const propertyDocRef = doc(db, 'properties', propertyId);
      const logCollectionRef = collection(propertyDocRef, 'eventLog');
      await addDoc(logCollectionRef, {
        text: logText,
        timestamp: serverTimestamp(),
        source: '3D Viewer' 
      });
    } catch (error) {
      console.error("Error adding to property event log:", error);
    }
  }, [propertyId]);


  useEffect(() => {
    if (!propertyId) {
        setPropertyError("No property ID provided in the URL.");
        setLoadingProperty(false);
        return;
    }
    const fetchPropertyData = async () => {
        setLoadingProperty(true);
        setPropertyError(null);
        setAvailableModels([]); 
        setActiveModel(null);
        try {
            const propertyDocRef = doc(db, 'properties', propertyId);
            const docSnap = await getDoc(propertyDocRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCurrentProperty({ id: docSnap.id, ...data });

                if (data.models && Array.isArray(data.models) && data.models.length > 0) {
                    const sortedModels = [...data.models].sort((a, b) => {
                        if (a.order !== undefined && b.order !== undefined) {
                            return a.order - b.order;
                        }
                        return (a.name || '').localeCompare(b.name || '');
                    });
                    setAvailableModels(sortedModels);
                    setActiveModel(sortedModels[0]); 
                } else {
                    setPropertyError(prev => prev ? `${prev}\nNo models found for this property.` : "No models found for this property.");
                }
            } else {
                setPropertyError(`Property with ID "${propertyId}" not found.`);
            }
        } catch (err) {
            setPropertyError("Failed to load property data. Check console for details.");
            console.error("Error fetching property data:", err);
        } finally {
            setLoadingProperty(false);
        }
    };
    fetchPropertyData();
  }, [propertyId]); 

  const modelToLoadUrl = useMemo(() => activeModel?.url || null, [activeModel]);

  const activeClippingPlane = useMemo(() => {
    if (!isSectionCutActive) return null;
    let normal = new THREE.Vector3();
    if (sectionCutAxis === 'y') normal.set(0, -1, 0);    
    else if (sectionCutAxis === 'x') normal.set(1, 0, 0); 
    else if (sectionCutAxis === 'z') normal.set(0, 0, 1); 
    else return null;
    return new THREE.Plane(normal.clone(), -sectionCutPosition); 
  }, [isSectionCutActive, sectionCutAxis, sectionCutPosition]);
  const clippingPlanes = useMemo(() => (activeClippingPlane ? [activeClippingPlane] : []), [activeClippingPlane]);
  const baseCameraProps = useMemo(() => ({
      near: 0.1,
      far: 10000, 
      position: initialCamPosRef.current.clone(),
  }), []); 
  const perspectiveCameraProps = useMemo(() => ({ ...baseCameraProps, fov: 50 }), [baseCameraProps]);
  const orthoCameraProps = useMemo(() => ({ ...baseCameraProps }), [baseCameraProps]); 

  useEffect(() => {
    if (viewCommand !== 'idle') {
      const timer = setTimeout(() => setViewCommand('idle'), 150); 
      return () => clearTimeout(timer);
    }
  }, [viewCommand]);

   useEffect(() => { 
    setIsMeasureMode(false);
    setMeasurePoints([]);
    setIsPlacingCommentMode(false);
    setEditingCommentId(null);
    setMeasurements([]); 
    setComments([]);
    // Removed logging for model switching from here
  }, [activeModel]); 

  const handleToggleCamera = () => setIsOrthographic(prev => !prev);
  const handleSetView = (view) => setViewCommand(view);
  const handleToggleMeasureMode = () => {
    const nextState = !isMeasureMode;
    setIsMeasureMode(nextState);
    setMeasurePoints([]); 
    if (nextState) { 
      setIsPlacingCommentMode(false); 
      setEditingCommentId(null); 
    }
  };
  const handleTogglePlaceCommentMode = () => {
    const nextState = !isPlacingCommentMode;
    setIsPlacingCommentMode(nextState);
    if (nextState) { 
      setIsMeasureMode(false); 
      setMeasurePoints([]);
      setEditingCommentId(null); 
    }
  };
  const handleDeleteMeasurement = (idToDelete) => {
    setMeasurements(prev => prev.filter(m => m.id !== idToDelete));
    // No logging for measurement deletion
  };
  const handlePointMeasured = (clickedPoint) => { 
    if (!isMeasureMode) return; 
    const updatedPoints = [...measurePoints, clickedPoint.clone()]; 
    setMeasurePoints(updatedPoints); 
    if (updatedPoints.length === 2) { 
        const [start, end] = updatedPoints; 
        const distance = start.distanceTo(end); 
        setMeasurements(prev => [...prev, { id: Date.now(), start: start, end: end, distance: distance }]); 
        setMeasurePoints([]); 
        // No logging for measurement creation
    } 
  };
  const handleToggleUnit = () => { 
    setUnit(prevUnit => prevUnit === 'm' ? 'cm' : prevUnit === 'cm' ? 'ft' : 'm'); 
  };
  const handleCommentPlaced = (clickedPoint) => {
    if (!isPlacingCommentMode) return;
    const newComment = { id: Date.now(), position: clickedPoint.clone(), text: "Comment" }; 
    setComments(prev => [...prev, newComment]);
    setIsPlacingCommentMode(false); 
    setEditingCommentId(newComment.id); 
    if (activeModel) {
        addEventToPropertyLog(`Placed a new comment on model: "${activeModel.name || 'Unnamed Layer'}"`);
    }
  };
  const handleStartEditComment = (id) => {
    if (isMeasureMode || isPlacingCommentMode) return; 
    setEditingCommentId(id);
  };
  const handleUpdateCommentText = (id, newText) => { 
    let oldText = "";
    setComments(prev => prev.map(c => {
        if (c.id === id) {
            oldText = c.text;
            return { ...c, text: newText.trim() || "Comment" };
        }
        return c;
    }));
    if (activeModel && oldText !== (newText.trim() || "Comment")) { 
        addEventToPropertyLog(`Updated comment text to "${newText.trim() || "Comment"}" on model: "${activeModel.name || 'Unnamed Layer'}"`);
    }
  };
  const handleFinishEditComment = () => setEditingCommentId(null);
  const handleDeleteComment = (idToDelete) => { 
    const commentToDelete = comments.find(c => c.id === idToDelete);
    setComments(prev => prev.filter(c => c.id !== idToDelete)); 
    if (editingCommentId === idToDelete) setEditingCommentId(null); 
    if (activeModel && commentToDelete) {
        addEventToPropertyLog(`Deleted comment ("${commentToDelete.text.substring(0,20)}...") from model: "${activeModel.name || 'Unnamed Layer'}"`);
    }
  };
  const handleToggleSectionCut = () => setIsSectionCutActive(prev => !prev);
  const handleSetSectionCutAxis = (axis) => {
    if(!isSectionCutActive && sectionCutAxis===null) setIsSectionCutActive(true); 
    setSectionCutAxis(axis);
  };
  const handleSectionCutPositionChange = (event) => { 
    if (!isSectionCutActive) return; 
    setSectionCutPosition(parseFloat(event.target.value)); 
  };
  const handleToggleShowComments = () => { 
    setShowComments(prev => !prev); 
    if (!showComments && editingCommentId) setEditingCommentId(null); 
  };
  const handleToggleShowMeasurements = () => setShowMeasurements(prev => !prev);

  const handleModelSelect = (modelId) => {
    const selected = availableModels.find(m => m.id === modelId);
    if (selected && selected.id !== activeModel?.id) { 
        setActiveModel(selected);
    }
  };

  if (loadingProperty) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#202020', color: 'white', fontSize: '1.5em' }}>Loading Property Data...</div>;
  }
  if (propertyError && !currentProperty) { 
    return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#202020', color: 'white', padding: '30px', textAlign: 'center' }}>
            <h1 style={{color: LIGHT_RED_COLOR}}>Error Loading Property</h1>
            <p>{propertyError}</p>
            <Link to="/" style={{ color: '#61dafb', marginTop:'20px', fontSize:'16px' }}>← Back to Dashboard</Link>
        </div>
    );
  }
   if (currentProperty && availableModels.length === 0 && !loadingProperty) { 
     return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#202020', color: 'white', padding: '30px', textAlign: 'center' }}>
            <h1>No Models Available</h1>
            <p>This property ({currentProperty.name}) currently has no 3D models assigned.</p>
            <p>{propertyError || ''}</p> 
            <Link to="/" style={{ color: '#61dafb', marginTop:'20px', fontSize:'16px' }}>← Back to Dashboard</Link>
        </div>
    );
  }
  if (!loadingProperty && currentProperty && (!activeModel || !modelToLoadUrl)) {
     return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#202020', color: 'white', padding: '30px', textAlign: 'center' }}>
            <h1>Model Not Selected or URL Missing</h1>
            <p>Please select a model layer, or the current layer is missing a URL for property: {currentProperty.name}.</p>
            <Link to="/" style={{ color: '#61dafb', marginTop:'20px', fontSize:'16px' }}>← Back to Dashboard</Link>
        </div>
    );
  }


  // --- UI Styles ---
  const UI_SIDEBAR_WIDTH_VALUE = '220px'; 
  const sidebarContainerStyle = { 
      position: 'absolute', top: '0', left: '0', width: UI_SIDEBAR_WIDTH_VALUE, height: '100%', 
      background: 'rgba(30, 30, 30, 0.97)', 
      color: '#eee', padding: '15px',
      display: 'flex', flexDirection: 'column', gap: '10px', 
      overflowY: 'auto', fontFamily: 'sans-serif', 
      boxShadow: '2px 0 8px rgba(0,0,0,0.6)', zIndex: 10 
  };
  const sectionStyleDef = { 
      display: 'flex', flexDirection: 'column', gap: '6px'
  }; 
  const titleStyle = { 
      fontSize: '12px', 
      fontWeight: '600', color: '#bbb', marginBottom: '4px', 
      borderBottom: '1px solid #444', paddingBottom: '4px', textTransform: 'uppercase' 
  };
  const projectInfoStyle = {...sectionStyleDef, textAlign: 'center', gap: '4px', paddingBottom: '10px', marginBottom:'5px' };
  const projectNameStyle = { fontSize: '16px', fontWeight: 'bold', color: '#fff', margin: 0 }; 
  const projectAddressStyle = { fontSize: '10px', color: '#aaa', margin: 0 }; 
  const generalButtonStyle = (isActive = false, isDisabled = false) => ({ 
      width: '100%', padding: '8px 10px', borderRadius: '4px', 
      border: `1px solid ${isActive ? COMMENT_BLUE_COLOR : (isDisabled ? '#555' : '#666')}`, 
      background: isActive ? COMMENT_BLUE_COLOR : (isDisabled ? '#333' : '#444'), 
      color: isActive ? '#111' : (isDisabled ? '#888' : '#eee'), 
      cursor: isDisabled ? 'not-allowed' : 'pointer', textAlign: 'center', 
      opacity: isDisabled ? 0.6 : 1, 
      transition: 'background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease', 
      fontSize: '13px',
      boxSizing: 'border-box'
  });
  // Removed compactItemStyle, compactItemLabelStyle, compactButtonStyle as we'll use generalButtonStyle for wider buttons now
  const radioGroupStyleCompact = { 
      display: 'flex', justifyContent: 'space-around', alignItems: 'center', 
      gap: '5px', fontSize: '11px', padding: '5px 0',
      flexWrap: 'wrap' 
  };
  const radioLabelStyleCompact = (isDisabled) => ({ 
      display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', 
      cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.5 : 1, 
      color: '#ccc', padding: '2px 4px' 
  });
  const sliderStyle = (isDisabled) => ({ 
    width: '100%', cursor: isDisabled ? 'not-allowed' : 'pointer', 
    opacity: isDisabled ? 0.5 : 1, margin: '5px 0' 
  });
  const listStyle = { listStyle: 'none', padding: '0', margin: '5px 0 0 0', maxHeight: '120px', overflowY: 'auto', background: 'rgba(0,0,0,0.1)', borderRadius: '3px', paddingRight: '5px' };
  const listItemStyle = (isEditingActiveItem = false) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', borderBottom: '1px solid #3a3a3a', padding: '3px 5px', fontSize: '11px', background: isEditingActiveItem ? 'rgba(70, 70, 100, 0.4)' : 'transparent', cursor: (isMeasureMode || isPlacingCommentMode || isEditingActiveItem) ? 'not-allowed' : 'pointer', borderRadius: '3px', minHeight: '22px', transition: 'background-color 0.2s' });
  const deleteButtonStyleList = { background: 'none', border: 'none', color: LIGHT_RED_COLOR, cursor: 'pointer', fontSize: '14px', padding: '0 4px', lineHeight: '1', fontWeight: 'bold' };
  const listTextStyle = { flexGrow: 1, marginRight: '5px', paddingLeft: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.4', color: '#ddd' };
  const canvasContainerStyle = { width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0, background: '#303030', zIndex: 1 }; 

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}> 
      <div style={sidebarContainerStyle}>
        <div style={projectInfoStyle}>
           <h2 style={projectNameStyle}>{currentProperty?.name || 'Loading Property...'}</h2>
           {currentProperty?.address && <p style={projectAddressStyle}>{currentProperty.address}</p>}
           <Link to="/" style={{ textDecoration: 'none', marginTop: '8px' }}>
              <button style={generalButtonStyle(false, false)}> ← Dashboard </button>
           </Link>
        </div>

        {availableModels.length > 1 && (
          <div style={sectionStyleDef}>
            <span style={titleStyle}>Select Model Layer</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {availableModels.map(model => (
                <button
                  key={model.id}
                  onClick={() => handleModelSelect(model.id)}
                  style={generalButtonStyle(activeModel?.id === model.id, false)}
                  title={model.name}
                >
                  {model.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={sectionStyleDef}>
          <span style={titleStyle}>Camera</span>
          <button onClick={handleToggleCamera} style={generalButtonStyle(isOrthographic)}>
            {isOrthographic ? 'Orthographic View' : 'Perspective View'}
          </button>
        </div>

        <div style={sectionStyleDef}>
          <span style={titleStyle}>Standard Views</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            <button onClick={() => handleSetView('reset')} style={generalButtonStyle()}>Reset/Iso</button>
            <button onClick={() => handleSetView('top')} style={generalButtonStyle()}>Top</button>
            <button onClick={() => handleSetView('front')} style={generalButtonStyle()}>Front</button>
            <button onClick={() => handleSetView('right')} style={generalButtonStyle()}>Right</button>
            <button onClick={() => handleSetView('back')} style={generalButtonStyle()}>Back</button>
            <button onClick={() => handleSetView('left')} style={generalButtonStyle()}>Left</button>
          </div>
        </div>
        
        <div style={sectionStyleDef}>
          <span style={titleStyle}>Section Cut</span>
          <button onClick={handleToggleSectionCut} style={generalButtonStyle(isSectionCutActive)}>
            {isSectionCutActive ? 'Disable Section Cut' : 'Enable Section Cut'}
          </button>
          {isSectionCutActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', border: '1px solid #444', borderRadius: '4px', padding: '8px', background: 'rgba(0,0,0,0.1)' }}>
              <div style={radioGroupStyleCompact}>
                 <label style={radioLabelStyleCompact(editingCommentId !== null)}> <input type="radio" name="sectionAxis" value="y" checked={sectionCutAxis === 'y'} onChange={() => handleSetSectionCutAxis('y')} disabled={editingCommentId !== null} /> Y </label>
                 <label style={radioLabelStyleCompact(editingCommentId !== null)}> <input type="radio" name="sectionAxis" value="x" checked={sectionCutAxis === 'x'} onChange={() => handleSetSectionCutAxis('x')} disabled={editingCommentId !== null}/> X </label>
                 <label style={radioLabelStyleCompact(editingCommentId !== null)}> <input type="radio" name="sectionAxis" value="z" checked={sectionCutAxis === 'z'} onChange={() => handleSetSectionCutAxis('z')} disabled={editingCommentId !== null}/> Z </label>
              </div>
              {sectionCutAxis && (
                <>
                   <input type="range" min={-SECTION_CUT_RANGE} max={SECTION_CUT_RANGE} step={0.1} value={sectionCutPosition} onChange={handleSectionCutPositionChange} style={sliderStyle(editingCommentId !== null)} disabled={editingCommentId !== null} />
                   <span style={{ fontSize: '10px', color: '#aaa', textAlign: 'center'}}>Pos: {sectionCutPosition.toFixed(2)}</span>
                </>
              )}
            </div>
           )}
         </div>

        <div style={sectionStyleDef}>
           <span style={titleStyle}>Tools</span>
           <button onClick={handleToggleMeasureMode} style={generalButtonStyle(isMeasureMode, !!editingCommentId)} disabled={!!editingCommentId}>
             {isMeasureMode ? 'Measuring...' : 'Measure Dist.'}
           </button>
           <button onClick={handleTogglePlaceCommentMode} style={{...generalButtonStyle(isPlacingCommentMode, !!editingCommentId), marginTop: '5px'}} disabled={!!editingCommentId} >
             {isPlacingCommentMode ? 'Placing...' : 'Place Comment'}
           </button>
        </div>

        <div style={sectionStyleDef}>
           <span style={titleStyle}>Display</span>
           <button onClick={handleToggleShowComments} style={generalButtonStyle(showComments, comments.length === 0)} disabled={comments.length === 0}>
             {showComments ? 'Hide Comments' : `Show Comments (${comments.length})`}
           </button>
           <button onClick={handleToggleShowMeasurements} style={{...generalButtonStyle(showMeasurements, measurements.length === 0), marginTop: '5px'}} disabled={measurements.length === 0}>
             {showMeasurements ? 'Hide Measurements' : `Show Measurements (${measurements.length})`}
           </button>
           <button onClick={handleToggleUnit} style={{...generalButtonStyle(), marginTop: '5px'}}>
             Units: {unit.toUpperCase()}
           </button>
        </div>
        
         {(measurements.length > 0 || comments.length > 0) && (
            <div style={{ borderTop: '1px solid #444', paddingTop: '8px', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                {measurements.length > 0 && showMeasurements && (
                    <div>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', display: 'block', color: '#bbb' }}>Measurements ({unit}):</span>
                        <ul style={listStyle}>
                            {measurements.map((m, index) => (
                               <li key={m.id} style={listItemStyle(false)} title={`Distance: ${formatDistance(m.distance, unit)}`}>
                                  <span style={listTextStyle}>{index + 1}: {formatDistance(m.distance, unit)}</span>
                                  <button onClick={(e) => {e.stopPropagation(); handleDeleteMeasurement(m.id);}} title="Delete Measurement" style={deleteButtonStyleList}>×</button>
                               </li>
                            ))}
                        </ul>
                    </div>
                )}
                {comments.length > 0 && showComments && (
                    <div>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', display: 'block', color: '#bbb' }}>Comments:</span>
                        <ul style={listStyle}>
                            {comments.map((comment, index) => (
                               <li key={comment.id}
                                   style={listItemStyle(editingCommentId === comment.id)}
                                   onClick={() => {
                                       if (!isMeasureMode && !isPlacingCommentMode && editingCommentId !== comment.id) {
                                           handleStartEditComment(comment.id); 
                                       }
                                   }}
                                   title={comment.text} 
                                >
                                  <span style={listTextStyle}> {getAlphabeticLabel(index)}: {comment.text} </span>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteComment(comment.id); }} title="Delete comment" style={deleteButtonStyleList}>×</button>
                               </li>
                            ))}
                        </ul>
                    </div>
                )}
             </div>
         )}
      </div> 

      <div style={canvasContainerStyle}>
         <Canvas
            key={modelToLoadUrl + (isOrthographic ? '_ortho' : '_persp')} 
            orthographic={isOrthographic}
            camera={isOrthographic ? orthoCameraProps : perspectiveCameraProps}
            shadows
            gl={{ localClippingEnabled: true, antialias: true, logarithmicDepthBuffer: true }}
          >
            {modelToLoadUrl && ( 
              <Suspense fallback={<Html center><div style={{color: 'white', fontSize: '1.5em', background:'rgba(0,0,0,0.7)', padding:'15px', borderRadius:'8px'}}>Loading 3D Model...</div></Html>}>
                <SceneContents
                  modelUrl={modelToLoadUrl} 
                  isMeasureMode={isMeasureMode}
                  isPlacingCommentMode={isPlacingCommentMode}
                  onPointMeasured={handlePointMeasured}
                  onCommentPlaced={handleCommentPlaced}
                  clippingPlanes={clippingPlanes}
                  viewCommand={viewCommand}
                  initialCameraPos={initialCamPosRef.current}
                  isOrthographic={isOrthographic} 
                  measurePoints={measurePoints}
                  measurements={measurements}
                  unit={unit}
                  showMeasurements={showMeasurements}
                  onDeleteMeasurement={handleDeleteMeasurement}
                  comments={comments}
                  showComments={showComments}
                  editingCommentId={editingCommentId}
                  onStartEditComment={handleStartEditComment} 
                  onUpdateCommentText={handleUpdateCommentText}
                  onFinishEditComment={handleFinishEditComment}
                  onDeleteComment={handleDeleteComment}
                />
              </Suspense>
            )}
          </Canvas>
      </div>
    </div>
  );
}

export default Viewer3D;