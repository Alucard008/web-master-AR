import React, { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import {
  ACESFilmicToneMapping,
  CylinderGeometry,
  Mesh,
  MeshNormalMaterial,
  sRGBEncoding,
  Vector3,
} from 'three';
// import GLTF loader - originally in examples/jsm/loaders/
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'; // Import DRACOLoader

// import components:
import BackButton from '../components/BackButton.js';
import FlipCamButton from '../components/FlipCamButton.js';
import VTOButton from '../components/VTOButton.js';

// import neural network models:
import NNWrist from '../contrib/WebARRocksHand/neuralNets/NN_WRIST_27.json';
import NNRing from '../contrib/WebARRocksHand/neuralNets/NN_RING_13.json';

// This helper is not minified, feel free to customize it (and submit pull requests bro):
import VTOThreeHelper from '../contrib/WebARRocksHand/helpers/HandTrackerThreeHelper.js';

//import PoseFlipFilter
import PoseFlipFilter from '../contrib/WebARRocksHand/helpers/PoseFlipFilter.js';

// import stabilizer:
import Stabilizer from '../contrib/WebARRocksHand/helpers/landmarksStabilizers/OneEuroLMStabilizer.js';

// ASSETS:
// import 3D models:
import GLTFModelWrist from '../../assets/VTO/New_Watch.glb';
import GLTFModelRing from '../../assets/VTO/ringPlaceHolder2.glb';

import GLTFOccluderModelRing from '../../assets/VTO/ringOccluder2.glb';

import GLTFModelEmpty from '../../assets/VTO/empty.glb';

const logModelSettings = (model) => {
  console.log('Model Settings:', {
    scale: model.scale,
    translation: model.translation,
    quaternion: model.quaternion,
  });
};

const SETTINGS = {
  VTOModes: {
    wrist: {
      threshold: 0.92, // detection sensitivity, between 0 and 1

      NNs: [NNWrist],
      poseLandmarksLabels: [
        'wristBack',
        'wristLeft',
        'wristRight',
        'wristPalm',
        'wristPalmTop',
        'wristBackTop',
        'wristRightBottom',
        'wristLeftBottom',
      ],
      isPoseFilter: true,

      occluder: {
        type: 'SOFTCYLINDER',
        radiusRange: [3.5, 4.5],
        height: 48,
        offset: [0, 0, 0],
        quaternion: [0.707, 0, 0, 0.707],
      },

      landmarksStabilizerSpec: {
        minCutOff: 0.001,
        beta: 3,
      },

      objectPointsPositionFactors: [1.0, 1.3, 1.0],
    },
    ring: {
      threshold: 0.9,

      NNs: [NNRing],
      poseLandmarksLabels: [
        'ringBack',
        'ringLeft',
        'ringRight',
        'ringPalm',
        'ringPalmTop',
        'ringBackTop',
        'ringBase0',
        'ringBase1',
        'ringMiddleFinger',
        'ringPinkyFinger',
        'ringBasePalm',
      ],
      isPoseFilter: false,

      occluder: {
        type: 'MODEL',
        model: GLTFOccluderModelRing,
        scale: 1,
      },

      landmarksStabilizerSpec: {
        minCutOff: 0.001,
        beta: 30,
      },

      objectPointsPositionFactors: [1.0, 1.0, 1.0],
    },
  },

  models: {
    wristDemo: {
      VTOMode: 'wrist',
      model: GLTFModelWrist,

      scale: 1.35 * 1.462,
      translation: [0.076, -0.916, -0.504],
      quaternion: [0, 0, 0, 1],
    },

    ringDemo: {
      VTOMode: 'ring',
      model: GLTFModelRing,
      scale: 0.421,
      translation: [-1.66, -11.91, 0.26],
      quaternion: [0.258, 0.016, -0.005, 0.966],
    },

    custom: {
      VTOMode: 'ring',
      model: GLTFModelRing,
      scale: 0.421,
      translation: [-1.66, -11.91, 0.26],
      quaternion: [0.258, 0.016, -0.005, 0.966],
    },
  },
  initialModel: 'wristDemo',
};

// fake component, display nothing
// just used to get the Camera and the renderer used by React-fiber:
const ThreeGrabber = (props) => {
  const threeFiber = useThree();

  // tweak encoding:
  const threeRenderer = threeFiber.gl;
  threeRenderer.toneMapping = ACESFilmicToneMapping;
  threeRenderer.outputEncoding = sRGBEncoding;

  useFrame(
    VTOThreeHelper.update_threeCamera.bind(
      null,
      props.sizing,
      threeFiber.camera
    )
  );

  return null;
};

const compute_sizing = () => {
  // compute  size of the canvas:
  const height = window.innerHeight;
  const wWidth = window.innerWidth;
  const width = Math.min(wWidth, height);

  // compute position of the canvas:
  const top = 0;
  const left = (wWidth - width) / 2;
  return { width, height, top, left };
};

const create_softOccluder = (occluder) => {
  const occluderRadius = occluder.radiusRange[1];
  const occluderMesh = new Mesh(
    new CylinderGeometry(
      occluderRadius,
      occluderRadius,
      occluder.height,
      32,
      1,
      true
    ),
    new MeshNormalMaterial()
  );
  const dr = occluder.radiusRange[1] - occluder.radiusRange[0];
  occluderMesh.position.fromArray(occluder.offset);
  occluderMesh.quaternion.fromArray(occluder.quaternion);

  occluderMesh.userData = {
    isOccluder: true,
    isSoftOccluder: true,
    softOccluderRadius: occluderRadius,
    softOccluderDr: dr,
  };
  return occluderMesh;
};

const VTOModelContainer = (props) => {
  const objRef = useRef();
  useEffect(() => {
    const threeObject3DParent = objRef.current;
    const threeObject3D = threeObject3DParent.children[0];
    VTOThreeHelper.set_handRightFollower(threeObject3DParent, threeObject3D);
  });

  const gltf = useLoader(GLTFLoader, props.GLTFModel);
  const model = gltf.scene.children[0].clone();

  if (props.pose.scale) {
    const s = props.pose.scale;
    model.scale.set(s, s, s);
  }
  if (props.pose.translation) {
    model.position.add(new Vector3().fromArray(props.pose.translation));
  }
  if (props.pose.quaternion) {
    model.quaternion.fromArray(props.pose.quaternion);
  }

  let occluderModel = null;
  let softOccluderModel = null;
  switch (props.occluder.type) {
    case 'SOFTCYLINDER':
      softOccluderModel = create_softOccluder(props.occluder);
      useLoader(GLTFLoader, GLTFModelEmpty);
      break;
    case 'MODEL':
      const gltfOccluder = useLoader(GLTFLoader, props.occluder.model);
      occluderModel = gltfOccluder.scene.children[0].clone();
      occluderModel.scale.multiplyScalar(props.occluder.scale);
      occluderModel.userData = {
        isOccluder: true,
      };
      break;
    case 'NONE':
    default:
      break;
  }

  return (
    <object3D ref={objRef}>
      <object3D>
        <object3D>
          <primitive object={model} />
          {occluderModel && <primitive object={occluderModel} />}
          {softOccluderModel && <primitive object={softOccluderModel} />}
        </object3D>
      </object3D>
    </object3D>
  );
};

const DebugCube = (props) => {
  const s = props.size || 1;
  return (
    <mesh name="debugCube">
      <boxBufferGeometry args={[s, s, s]} />
      <meshNormalMaterial />
    </mesh>
  );
};

const get_pose = (model) => {
  const t = model.translation;
  const translation = [t[0], t[2], -t[1]];

  const q = model.quaternion;
  const quaternion = [q[0], q[2], -q[1], q[3]];

  const pose = {
    translation,
    scale: model.scale,
    quaternion,
  };
  return pose;
};

logModelSettings(SETTINGS.models['ringDemo']);

const VTO = () => {
  const model0 = SETTINGS.models[SETTINGS.initialModel];
  const VTOMode0 = SETTINGS.VTOModes[model0.VTOMode];

  const [sizing, setSizing] = useState(compute_sizing());
  const [VTOState, setVTOState] = useState({
    model: model0,
    pose: get_pose(model0),
    mode: VTOMode0,
  });
  const [isSelfieCam, setIsSelfieCam] = useState(false);
  const [isInitialized] = useState(true);
  const [customModel, setCustomModel] = useState(null);

  let _prevVTOMode = null;
  const change_model = (modelKey) => {
    VTOThreeHelper.clear_threeObjects(false);
    const model = SETTINGS.models[modelKey];

    _prevVTOMode = VTOState.mode;
    const mode = SETTINGS.VTOModes[model.VTOMode];
    const pose = get_pose(model);

    setVTOState({
      model,
      pose,
      mode,
    });
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const customModelSettings = {
        VTOMode: 'ring',
        model: url,
        scale: 0.09,
        translation: [-1.66, -11.91, 0.26],
        quaternion: [0.258, 0.016, -0.005, 0.966],
      };
      SETTINGS.models['custom'] = customModelSettings;
      setCustomModel(customModelSettings);
    }
  };

  const change_custom_model = () => {
    if (customModel) {
      change_model('custom');
    }
  };

  useEffect(() => {
    const VTOMode = VTOState.mode;
    if (_prevVTOMode !== VTOMode) {
      const poseFilter = VTOMode.isPoseFilter
        ? PoseFlipFilter.instance({})
        : null;
      VTOThreeHelper.update({
        objectPointsPositionFactors: VTOMode.objectPointsPositionFactors,
        poseLandmarksLabels: VTOMode.poseLandmarksLabels,
        poseFilter,
        landmarksStabilizerSpec: VTOMode.landmarksStabilizerSpec,
        NNs: VTOMode.NNs,
        threshold: VTOMode.threshold,
      })
        .then(() => {})
        .catch(() => {
          console.log('VTOThreeHelper not ready yet');
        });
    }
  }, [VTOState]);

  let _timerResize = null;
  const handle_resize = () => {
    if (_timerResize) {
      clearTimeout(_timerResize);
    }
    _timerResize = setTimeout(do_resize, 200);
  };

  const do_resize = () => {
    _timerResize = null;
    const newSizing = compute_sizing();
    setSizing(newSizing);
  };

  useEffect(() => {
    if (!_timerResize) {
      VTOThreeHelper.resize();
    }
  }, [sizing]);

  const canvasVideoRef = useRef();
  useEffect(() => {
    const VTOMode = VTOState.mode;
    const poseFilter = VTOMode.isPoseFilter
      ? PoseFlipFilter.instance({})
      : null;

    VTOThreeHelper.init(
      {
        objectPointsPositionFactors: VTOMode.objectPointsPositionFactors,
        poseLandmarksLabels: VTOMode.poseLandmarksLabels,
        poseFilter,
        enableFlipObject: true,
        cameraZoom: 1,
        threshold: VTOMode.threshold,
        handTrackerCanvas: canvasVideoRef.current,
        debugDisplayLandmarks: false,
        NNs: VTOMode.NNs,
        maxHandsDetected: 1,
        landmarksStabilizerSpec: VTOMode.landmarksStabilizerSpec,
        stabilizationSettings: {
          switchNNErrorThreshold: 0.5,
        },
        scanSettings: {
          translationScalingFactors: [0.3, 0.3, 1],
        },
      },
      Stabilizer
    ).then(() => {
      window.addEventListener('resize', handle_resize);
      window.addEventListener('orientationchange', handle_resize);
    });

    return VTOThreeHelper.destroy;
  }, [isInitialized]);

  const flip_camera = () => {
    VTOThreeHelper.update_videoSettings({
      facingMode: isSelfieCam ? 'environment' : 'user',
    })
      .then(() => {
        setIsSelfieCam(!isSelfieCam);
      })
      .catch((err) => {
        console.log('ERROR: Cannot flip camera -', err);
      });
  };

  const mirrorClass = isSelfieCam ? 'mirrorX' : '';
  return (
    <div>
      <Canvas
        className={mirrorClass}
        style={{
          position: 'fixed',
          zIndex: 2,
          ...sizing,
        }}
        gl={{
          preserveDrawingBuffer: true,
        }}
        updateDefaultCamera={false}
      >
        <ThreeGrabber sizing={sizing} />

        <Suspense fallback={<DebugCube />}>
          <VTOModelContainer
            GLTFModel={VTOState.model.model}
            occluder={VTOState.mode.occluder}
            pose={VTOState.pose}
          />
        </Suspense>

        <pointLight color={0xffffff} intensity={1} position={[0, 100, 0]} />
        <ambientLight color={0xffffff} intensity={0.3} />
      </Canvas>

      <canvas
        className={mirrorClass}
        ref={canvasVideoRef}
        style={{
          position: 'fixed',
          zIndex: 1,
          ...sizing,
        }}
        width={sizing.width}
        height={sizing.height}
      />

      <BackButton />
      <div className="VTOButtons">
        <VTOButton onClick={flip_camera}>Flip camera</VTOButton>
        <VTOButton onClick={change_model.bind(null, 'wristDemo')}>
          Wrist
        </VTOButton>
        <VTOButton onClick={change_model.bind(null, 'ringDemo')}>
          Ring
        </VTOButton>
        <VTOButton>
          <input type="file" accept=".glb" onChange={handleFileChange} />
        </VTOButton>
        <VTOButton onClick={change_custom_model}>Use Uploaded Model</VTOButton>
      </div>
    </div>
  );
};

export default VTO;
